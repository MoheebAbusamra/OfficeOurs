// [S3] Tests for S3 endpoints: normal + invalid cases (queue, QR check-in, meeting history)
// Like S1's and S2's tests, they run on the real Supabase database (see tests/backend.js for where requests go).
// Run from the server folder: npm test -- tests/queue.test.js
// Needs TEST_PASSWORD in server/.env (the password of the test accounts 240101, I-1001 and I-1002, and TEST_STUDENT_ID).
// Demo students 240101, 240102 and 240201 (seed.sql, .test emails) fill the queue, so TEST_STUDENT_ID must be another one.
// The main student gets the real QR ticket email, like in S2's tests.
//
// The queue only runs on the slot day and S2 refuses to book weekend/holiday slots, so the slots and confirmed
// requests are set up straight in the database (like seed.sql). Everything else goes through the API.
// The tests run top to bottom and share state. Everything they create is deleted at the end.
import 'dotenv/config';
import request from 'supertest';
import { jest } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { API, stopBackend } from './backend.js';
import { supabase } from '../src/shared/supabase.js';
import { handleMessageBody } from '../src/services/queue/events.js';
import { handler as lambdaHandler } from '../src/services/queue/lambda.js';

// Real database calls (and the ticket email) can take a few seconds
jest.setTimeout(30000);

const PASSWORD = process.env.TEST_PASSWORD;
const STUDENT_ID = process.env.TEST_STUDENT_ID || '241339';
const STUDENT_PASSWORD = process.env.TEST_STUDENT_PASSWORD || PASSWORD;
const RUN = `Jest S3 ${Date.now()}`; // unique, so we can find (and delete) what this run created
const ROOM = `${RUN} Room`;
const cairoDate = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: process.env.APP_TIMEZONE || 'Africa/Cairo' }).format(new Date(ms));
const TODAY = cairoDate(Date.now());
const TOMORROW = cairoDate(Date.now() + 86400000);

let judy; // the main student (TEST_STUDENT_ID, default 241339)
let nour; // student 240101, second in the queue
let sara; // instructor I-1001, owns the test slots
let omar; // instructor I-1002 (only used for "not your slot")

let today; // Dr Sara's slot today
let tomorrow; // Dr Sara's slot tomorrow
const req = {}; // the test requests, by name
const entry = {}; // their queue entries (database rows), by name
let meetingId; // Judy's meeting, made when the queue moves on

// Logs in and returns "Bearer <token>". Registering first is harmless: 201 the first time, 409 after that.
async function login(universityId, password = PASSWORD) {
  await request(API).post('/auth/register').send({ universityId, password });
  const res = await request(API).post('/auth/login').send({ universityId, password });
  if (!res.body.data) {
    throw new Error(`Login failed for ${universityId}: is the backend reachable and is TEST_PASSWORD in server/.env correct?`);
  }
  return `Bearer ${res.body.data.token}`;
}

// Test data straight in the database
const db = async (query) => {
  const { data, error } = await query;
  if (error) throw new Error(`Test setup failed: ${error.message}`);
  return data;
};
const addSlot = (slotDate) => db(supabase.from('slots').insert({
  instructor_id: 'I-1001', module_id: 1, slot_date: slotDate, start_time: '00:00', end_time: '23:59', location: ROOM, capacity: 10,
}).select().single());
const addRequest = (studentId, slot, status = 'confirmed') => db(supabase.from('requests').insert({
  student_id: studentId, slot_id: slot.id, title: `${RUN} question`, description: 'Created by the S3 Jest tests',
  preferred_start: '10:00', preferred_end: '10:15', status,
}).select().single());
// Queue entry without the ticket email (only used for students who never read their email in the tests)
const addEntry = (r, position) => db(supabase.from('queue_entries').insert({ slot_id: r.slot_id, request_id: r.id, position }).select().single());
const entryOf = (r) => db(supabase.from('queue_entries').select().eq('request_id', r.id).single());

const event = (eventType, r) => JSON.stringify({ eventType, eventId: randomUUID(), occurredAt: new Date().toISOString(), data: { requestId: r.id } });

beforeAll(async () => {
  [judy, nour, sara, omar] = await Promise.all([login(STUDENT_ID, STUDENT_PASSWORD), login('240101'), login('I-1001'), login('I-1002')]);
  [today, tomorrow] = await Promise.all([addSlot(TODAY), addSlot(TOMORROW)]);
  req.judy = await addRequest(STUDENT_ID, today);
  req.nour = await addRequest('240101', today);
  req.youssef = await addRequest('240102', today);
  req.mariam = await addRequest('240201', today);
  req.judyTomorrow = await addRequest(STUDENT_ID, tomorrow, 'pending');
  req.youssefTomorrow = await addRequest('240102', tomorrow);
});

afterAll(async () => {
  // Deleting the slots also deletes their requests, queue entries and meetings
  if (today || tomorrow) {
    const ids = [today?.id, tomorrow?.id].filter(Boolean);
    await supabase.from('requests').delete().in('slot_id', ids);
    await supabase.from('slots').delete().in('id', ids);
  }
  await supabase.from('notifications').delete().like('message', `%${RUN}%`);
  stopBackend();
});

// ======================================================================= #14 Add to queue
describe('#14 Add to queue on confirmation (SNS -> SQS -> Lambda)', () => {
  test('Q-01 confirmed event queues the student and sends the ticket', async () => {
    const out = await handleMessageBody(event('RequestConfirmed', req.judy));
    expect(out).toMatchObject({ created: true, position: 1 });
    expect(out.delivery).toHaveProperty('brevo');
    entry.judy = await entryOf(req.judy);
    expect(entry.judy.status).toBe('waiting');
  });

  test('Q-02 positions go up in confirmation order, also inside an SNS envelope', async () => {
    const body = JSON.stringify({ Type: 'Notification', Message: event('RequestConfirmed', req.nour) });
    expect(await handleMessageBody(body)).toMatchObject({ created: true, position: 2 });
    entry.nour = await entryOf(req.nour);
    entry.youssef = await addEntry(req.youssef, 3);
    entry.mariam = await addEntry(req.mariam, 4);
  });

  test('Q-03 the same event twice does not queue twice or send a second email', async () => {
    const again = await handleMessageBody(event('RequestConfirmed', req.judy));
    expect(again).toMatchObject({ created: false, position: 1, delivery: null });
  });

  test('Q-04 a request that is not confirmed is dropped (not queued)', async () => {
    const out = await handleMessageBody(event('RequestConfirmed', req.judyTomorrow));
    expect(out).toMatchObject({ dropped: true, reason: 'REQUEST_NOT_CONFIRMED' });
  });

  test('Q-05 Lambda handler processes SQS records and reports none failed', async () => {
    await db(supabase.from('requests').update({ status: 'confirmed' }).eq('id', req.judyTomorrow.id));
    const out = await lambdaHandler({ Records: [{ messageId: 'm1', body: event('RequestConfirmed', req.judyTomorrow) }] });
    expect(out.batchItemFailures).toEqual([]);
    expect(out.results[0]).toMatchObject({ created: true, position: 1 });
    entry.judyTomorrow = await entryOf(req.judyTomorrow);
  });

  test('Q-06 Lambda reports a broken message as failed so SQS retries it', async () => {
    const out = await lambdaHandler({ Records: [{ messageId: 'bad', body: '{not json' }] });
    expect(out.batchItemFailures).toEqual([{ itemIdentifier: 'bad' }]);
  });

  test('Q-07 RequestCancelled takes the student out of the queue', async () => {
    entry.youssefTomorrow = await addEntry(req.youssefTomorrow, 2);
    expect(await handleMessageBody(event('RequestCancelled', req.youssefTomorrow))).toEqual({ removed: true });
    expect((await entryOf(req.youssefTomorrow)).status).toBe('skipped');
  });
});

// ======================================================================= #7 Position
describe('#7 GET /queue/position/{requestId}', () => {
  test('Q-10 student sees how many are ahead and an estimate, never names', async () => {
    const res = await request(API).get(`/queue/position/${req.nour.id}`).set('Authorization', nour);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'waiting', ahead: 1, checkedIn: false, position: 2 });
    expect(res.body.data.estimatedWaitMinutes).toBeGreaterThanOrEqual(5);
    expect(res.body.data.estimatedWaitMinutes).toBeLessThanOrEqual(60);
    expect(JSON.stringify(res.body)).not.toContain(STUDENT_ID);
  });

  test('Q-11 someone else\'s request -> 403', async () => {
    const res = await request(API).get(`/queue/position/${req.nour.id}`).set('Authorization', judy);
    expect(res.status).toBe(403);
  });

  test('Q-12 invalid id -> 400, unknown id -> 404, no login -> 401, instructor -> 403', async () => {
    expect((await request(API).get('/queue/position/abc').set('Authorization', judy)).status).toBe(400);
    expect((await request(API).get(`/queue/position/${randomUUID()}`).set('Authorization', judy)).status).toBe(404);
    expect((await request(API).get(`/queue/position/${randomUUID()}`)).status).toBe(401);
    expect((await request(API).get(`/queue/position/${randomUUID()}`).set('Authorization', sara)).status).toBe(403);
  });
});

// ======================================================================= #12 Check-in
describe('#12 QR check-in (public)', () => {
  test('Q-20 GET shows the meeting details for a valid token', async () => {
    const res = await request(API).get(`/check-in/${entry.judy.qr_token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ instructorName: 'Dr. Sara Hassan', location: ROOM, position: 1, checkedInAt: null, isMeetingDay: true });
  });

  test('Q-21 invalid or unknown token -> 404', async () => {
    expect((await request(API).get('/check-in/not-a-token')).status).toBe(404);
    expect((await request(API).post(`/check-in/${randomUUID()}`)).status).toBe(404);
  });

  test('Q-22 check-in works once on the meeting day', async () => {
    const res = await request(API).post(`/check-in/${entry.mariam.qr_token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.ahead).toBe(3);
    expect(res.body.data.checkedInAt).toBeTruthy();
    const again = await request(API).post(`/check-in/${entry.mariam.qr_token}`);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_CHECKED_IN');
  });

  test('Q-23 wrong day -> 409 NOT_MEETING_DAY', async () => {
    const res = await request(API).post(`/check-in/${entry.judyTomorrow.qr_token}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NOT_MEETING_DAY');
  });

  test('Q-24 finished entry -> 409 ENTRY_FINISHED', async () => {
    const res = await request(API).post(`/check-in/${entry.youssefTomorrow.qr_token}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ENTRY_FINISHED');
  });
});

// ======================================================================= #11 Instructor queue
describe('#11 Instructor queue: list, call next, skip, close', () => {
  test('Q-30 owner sees the full queue with names', async () => {
    const res = await request(API).get(`/queue/slots/${today.id}`).set('Authorization', sara);
    expect(res.status).toBe(200);
    expect(res.body.data.map((e) => e.position)).toEqual([1, 2, 3, 4]);
    expect(res.body.data[0]).toMatchObject({ status: 'waiting', student: { universityId: STUDENT_ID } });
    expect(res.body.meta.slot).toMatchObject({ isToday: true, location: ROOM });
  });

  test('Q-31 another instructor -> 403, unknown slot -> 404', async () => {
    expect((await request(API).get(`/queue/slots/${today.id}`).set('Authorization', omar)).status).toBe(403);
    expect((await request(API).get(`/queue/slots/${randomUUID()}`).set('Authorization', sara)).status).toBe(404);
  });

  test('Q-32 a student cannot run the queue -> 403', async () => {
    expect((await request(API).post(`/queue/slots/${today.id}/next`).set('Authorization', judy)).status).toBe(403);
  });

  test('Q-33 call next: first student in_meeting and notified', async () => {
    const res = await request(API).post(`/queue/slots/${today.id}/next`).set('Authorization', sara);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ finished: null, current: { id: entry.judy.id, status: 'in_meeting' }, remaining: 3 });
    const notes = await request(API).get('/notifications?limit=50').set('Authorization', judy);
    expect(notes.body.data.some((n) => n.type === 'queue_called' && n.message.includes(ROOM))).toBe(true);
  });

  test('Q-34 call next again: current -> done, meeting saved, request completed, next called', async () => {
    const res = await request(API).post(`/queue/slots/${today.id}/next`).set('Authorization', sara);
    expect(res.status).toBe(200);
    expect(res.body.data.finished).toMatchObject({ id: entry.judy.id, status: 'done' });
    expect(res.body.data.current.student.universityId).toBe('240101');
    const r = await request(API).get(`/requests/${req.judy.id}`).set('Authorization', judy);
    expect(r.body.data.status).toBe('completed');
    const notes = await request(API).get('/notifications?limit=50').set('Authorization', judy);
    expect(notes.body.data.some((n) => n.type === 'meeting_completed' && n.message.includes(RUN))).toBe(true);
  });

  test('Q-35 call next on a slot that is not today -> 409 SLOT_NOT_TODAY', async () => {
    const res = await request(API).post(`/queue/slots/${tomorrow.id}/next`).set('Authorization', sara);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLOT_NOT_TODAY');
  });

  test('Q-36 skip a waiting student with a reason; skipping again -> 409', async () => {
    const res = await request(API).patch(`/queue/entries/${entry.youssef.id}/skip`).set('Authorization', sara).send({ reason: 'Not at the door' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('skipped');
    const again = await request(API).patch(`/queue/entries/${entry.youssef.id}/skip`).set('Authorization', sara).send({});
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_FINISHED');
  });

  test('Q-37 skip: reason too long -> 400, not the owner -> 403', async () => {
    const long = await request(API).patch(`/queue/entries/${entry.mariam.id}/skip`).set('Authorization', sara).send({ reason: 'x'.repeat(301) });
    expect(long.status).toBe(400);
    expect(long.body.error.details[0].field).toBe('reason');
    expect((await request(API).patch(`/queue/entries/${entry.mariam.id}/skip`).set('Authorization', omar).send({})).status).toBe(403);
  });

  test('Q-38 close: current finished, the rest skipped', async () => {
    const res = await request(API).post(`/queue/slots/${today.id}/close`).set('Authorization', sara);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ finished: 1, skipped: 1 });
  });

  test('Q-39 empty queue -> 409 QUEUE_EMPTY', async () => {
    const res = await request(API).post(`/queue/slots/${today.id}/next`).set('Authorization', sara);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('QUEUE_EMPTY');
  });
});

// ======================================================================= #4 History
describe('#4 Meeting history and notes', () => {
  test('Q-40 each user sees only their own meetings, with duration', async () => {
    const res = await request(API).get(`/meetings?from=${TODAY}&to=${TODAY}&limit=100`).set('Authorization', judy);
    expect(res.status).toBe(200);
    expect(res.body.data.every((m) => m.student.universityId === STUDENT_ID)).toBe(true);
    const mine = res.body.data.find((m) => m.requestId === req.judy.id);
    expect(mine).toMatchObject({ instructor: { universityId: 'I-1001' }, module: { id: 1 } });
    expect(typeof mine.durationMinutes).toBe('number');
    meetingId = mine.id;

    const all = await request(API).get(`/meetings?from=${TODAY}&to=${TODAY}&limit=100`).set('Authorization', sara);
    const ours = all.body.data.filter((m) => [req.judy.id, req.nour.id].includes(m.requestId));
    expect(ours).toHaveLength(2);
  });

  test('Q-41 student saves student notes, instructor saves instructor notes', async () => {
    const s = await request(API).patch(`/meetings/${meetingId}/notes`).set('Authorization', judy).send({ notes: '  My summary  ' });
    expect(s.status).toBe(200);
    expect(s.body.data).toMatchObject({ studentNotes: 'My summary', instructorNotes: null });
    const i = await request(API).patch(`/meetings/${meetingId}/notes`).set('Authorization', sara).send({ notes: `${RUN} redraw the diagram` });
    expect(i.body.data).toMatchObject({ studentNotes: 'My summary', instructorNotes: `${RUN} redraw the diagram` });
  });

  test('Q-42 search by notes text', async () => {
    const res = await request(API).get('/meetings').query({ q: `${RUN} redraw` }).set('Authorization', judy);
    expect(res.status).toBe(200);
    expect(res.body.data.map((m) => m.id)).toEqual([meetingId]);
  });

  test('Q-43 bad filters -> 400 with field details', async () => {
    const res = await request(API).get('/meetings').query({ from: '2026-13-40', limit: 500 }).set('Authorization', judy);
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.field).sort()).toEqual(['from', 'limit']);
  });

  test('Q-44 notes: missing -> 400, too long -> 400, not my meeting -> 403, unknown -> 404', async () => {
    expect((await request(API).patch(`/meetings/${meetingId}/notes`).set('Authorization', judy).send({})).status).toBe(400);
    expect((await request(API).patch(`/meetings/${meetingId}/notes`).set('Authorization', judy).send({ notes: 'x'.repeat(5001) })).status).toBe(400);
    expect((await request(API).patch(`/meetings/${meetingId}/notes`).set('Authorization', nour).send({ notes: 'hi' })).status).toBe(403);
    expect((await request(API).get(`/meetings/${randomUUID()}`).set('Authorization', judy)).status).toBe(404);
  });

  test('Q-45 broken JSON body -> 400 INVALID_JSON (no crash)', async () => {
    const res = await request(API).patch(`/meetings/${meetingId}/notes`).set('Authorization', judy)
      .set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});
