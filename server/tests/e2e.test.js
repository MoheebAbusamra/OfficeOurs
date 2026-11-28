// End-to-end flow, one real journey on the running backend (npm run dev) and the real Supabase database:
// request -> FAQ check -> confirm -> queue -> QR ticket -> check-in -> call next -> meeting done -> history + notes
// Run from the server folder: npm test -- tests/e2e.test.js   (needs TEST_PASSWORD in server/.env, like the other tests)
//
// Check-in and "call next" only work on the slot's own day, and Friday/Saturday are weekend days (no slots).
// So on Sunday to Thursday (before 23:00) the test makes a slot TODAY and runs the whole journey.
// On other days it uses the next weekday: the meeting-day steps then check the "not today" errors,
// and the steps that need a finished meeting are skipped (run it again on a weekday for the full flow).
// The QR email itself cannot be checked by a test; the ticket token is read from the database instead.
import 'dotenv/config';
import request from 'supertest';
import { jest } from '@jest/globals';
import { supabase } from '../src/shared/supabase.js';

jest.setTimeout(60000);

const API = 'http://localhost:3000/api/v1';
const PASSWORD = process.env.TEST_PASSWORD;
const STUDENT_ID = process.env.TEST_STUDENT_ID || '241339';
const STUDENT_PASSWORD = process.env.TEST_STUDENT_PASSWORD || PASSWORD;
const TITLE = `Jest E2E ${Date.now()}`;

// ---------- Today or a later weekday? (decided before the tests are listed, so skipped steps show as skipped) ----------
const now = new Date();
const minutesNow = now.getHours() * 60 + now.getMinutes();
const TODAY_MODE = now.getDay() !== 5 && now.getDay() !== 6 && minutesNow < 23 * 60; // Sun-Thu, before 23:00
const todayOnly = TODAY_MODE ? test : test.skip;
const laterOnly = TODAY_MODE ? test.skip : test;

const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

let student;
let sara;
let slot; // created by Dr Sara in beforeAll
let faqId;
let requestId;
let token; // the QR ticket token (what the email's QR code holds)
let meetingId;

async function login(universityId, password = PASSWORD) {
  await request(API).post('/auth/register').send({ universityId, password });
  const res = await request(API).post('/auth/login').send({ universityId, password });
  if (!res.body.data) {
    throw new Error(`Login failed for ${universityId}: is the server running (npm run dev) and is TEST_PASSWORD in server/.env correct?`);
  }
  return `Bearer ${res.body.data.token}`;
}

// Dr Sara makes a 45 minute slot. Today: starting in about 5 minutes (later if she already has a slot then).
// Later mode: 18:00-18:45 on the next weekday at least 3 days ahead (clear of the other test files' slots).
async function createSlot() {
  const make = (slotDate, start) => request(API).post('/slots').set('Authorization', sara)
    .send({ slotDate, startTime: hhmm(start), endTime: hhmm(start + 45), location: 'Jest E2E Room', capacity: 3 });

  if (TODAY_MODE) {
    const date = now.toLocaleDateString('en-CA');
    for (let start = Math.ceil((minutesNow + 5) / 5) * 5; start + 45 <= 23 * 60 + 55; start += 50) {
      const res = await make(date, start);
      if (res.status === 201) return res.body.data;
      if (res.body.error?.code !== 'SLOT_OVERLAP') {
        throw new Error(`Could not create today's slot: ${res.body.error?.code} ${res.body.error?.message}`);
      }
    }
    throw new Error('Dr Sara has slots all evening today, so there is no room for the E2E slot. Try again tomorrow.');
  }

  const day = new Date();
  day.setDate(day.getDate() + 3);
  for (let tries = 0; tries < 14; tries += 1, day.setDate(day.getDate() + 1)) {
    if (day.getDay() === 5 || day.getDay() === 6) continue;
    const res = await make(day.toLocaleDateString('en-CA'), 18 * 60);
    if (res.status === 201) return res.body.data;
  }
  throw new Error('Could not create a slot for I-1001 in the next two weeks');
}

beforeAll(async () => {
  [student, sara] = await Promise.all([login(STUDENT_ID, STUDENT_PASSWORD), login('I-1001')]);
  slot = await createSlot();
  console.log(`[e2e] ${TODAY_MODE ? 'full journey on today\'s slot' : 'later-day mode (meeting-day steps skipped)'}: ${slot.slotDate} ${slot.startTime}-${slot.endTime}`);
});

afterAll(async () => {
  if (faqId) await request(API).delete(`/faqs/${faqId}`).set('Authorization', sara);
  // A request still pending/confirmed (a step failed, or later-day mode) is cancelled first
  if (requestId) {
    await request(API).patch(`/requests/${requestId}/status`).set('Authorization', student)
      .send({ status: 'cancelled', reason: 'Jest E2E cleanup' });
  }
  if (slot) {
    // Deleted when nothing hangs on it; a slot with a finished meeting is cancelled instead (the history stays)
    const del = await request(API).delete(`/slots/${slot.id}`).set('Authorization', sara);
    if (del.status !== 204) await request(API).patch(`/slots/${slot.id}`).set('Authorization', sara).send({ status: 'cancelled' });
  }
});

describe('E2E: from question to meeting history', () => {
  test('E2E-01 the slot is open to the student, with nothing booked yet', async () => {
    const res = await request(API).get(`/slots/${slot.id}`).set('Authorization', student);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'active', isFull: false, takenWindows: [] });
  });

  test('E2E-02 instructor adds an FAQ, the student\'s question is checked against it (AI)', async () => {
    const faq = await request(API).post('/faqs').set('Authorization', sara)
      .send({ moduleId: 1, question: 'Jest E2E: how long is an office-hours meeting?', answer: 'Usually 10 to 20 minutes.' });
    expect(faq.status).toBe(201);
    faqId = faq.body.data.id;

    const check = await request(API).post('/requests/faq-check').set('Authorization', student)
      .send({ slotId: slot.id, title: 'Feedback on my project plan', description: 'Could you look at my milestone plan and tell me what is missing?' });
    expect([200, 502]).toContain(check.status); // 502 = Gemini busy, the student can still send the request
    if (check.status === 200) expect(['answered', 'partial', 'none']).toContain(check.body.data.verdict);
  });

  test('E2E-03 student sends the request for the first 10 minutes of the slot', async () => {
    const res = await request(API).post('/requests').set('Authorization', student).send({
      slotId: slot.id,
      title: TITLE,
      description: 'Written by the E2E test. Feedback on my project plan.',
      preferredStart: slot.startTime,
      preferredEnd: hhmm(Number(slot.startTime.slice(0, 2)) * 60 + Number(slot.startTime.slice(3, 5)) + 10),
      priority: 'normal',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending');
    requestId = res.body.data.id;
  });

  test('E2E-04 instructor confirms; the student is notified', async () => {
    const res = await request(API).patch(`/requests/${requestId}/status`).set('Authorization', sara).send({ status: 'confirmed' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('confirmed');
    const notes = await request(API).get('/notifications?limit=50').set('Authorization', student);
    expect(notes.body.data.some(n => n.type === 'request_confirmed' && n.message.includes(TITLE))).toBe(true);
  });

  test('E2E-05 the student is in the queue: waiting, first, nobody ahead', async () => {
    // In-process the entry exists at once; through Floci (SNS -> SQS -> Lambda) it can take a few seconds
    let res;
    for (let i = 0; i < 20; i += 1) {
      res = await request(API).get(`/queue/position/${requestId}`).set('Authorization', student);
      if (res.status === 200) break;
      await sleep(1000);
    }
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'waiting', position: 1, ahead: 0, checkedIn: false });
  });

  test('E2E-06 the QR ticket opens the check-in page details', async () => {
    const { data, error } = await supabase.from('queue_entries').select('qr_token').eq('request_id', requestId).single();
    expect(error).toBeNull();
    token = data.qr_token;
    const res = await request(API).get(`/check-in/${token}`); // public: the token is the secret
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ title: TITLE, location: 'Jest E2E Room', position: 1, checkedInAt: null, isMeetingDay: TODAY_MODE });
  });

  todayOnly('E2E-07 check-in works once on the meeting day', async () => {
    const first = await request(API).post(`/check-in/${token}`);
    expect(first.status).toBe(200);
    const again = await request(API).post(`/check-in/${token}`);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_CHECKED_IN');
  });

  laterOnly('E2E-07 (later-day) check-in before the meeting day -> 409 NOT_MEETING_DAY', async () => {
    const res = await request(API).post(`/check-in/${token}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NOT_MEETING_DAY');
  });

  todayOnly('E2E-08 instructor calls next: the student is in the meeting and told it is their turn', async () => {
    const res = await request(API).post(`/queue/slots/${slot.id}/next`).set('Authorization', sara);
    expect(res.status).toBe(200);
    expect(res.body.data.current).toMatchObject({ requestId, status: 'in_meeting' });
    const pos = await request(API).get(`/queue/position/${requestId}`).set('Authorization', student);
    expect(pos.body.data).toMatchObject({ status: 'in_meeting', checkedIn: true });
    const notes = await request(API).get('/notifications?limit=50').set('Authorization', student);
    expect(notes.body.data.some(n => n.type === 'queue_called')).toBe(true);
  });

  laterOnly('E2E-08 (later-day) call next before the slot day -> 409 SLOT_NOT_TODAY', async () => {
    const res = await request(API).post(`/queue/slots/${slot.id}/next`).set('Authorization', sara);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLOT_NOT_TODAY');
  });

  todayOnly('E2E-09 call next again: meeting done, request completed, in both histories', async () => {
    const res = await request(API).post(`/queue/slots/${slot.id}/next`).set('Authorization', sara);
    expect(res.status).toBe(200);
    expect(res.body.data.finished).toMatchObject({ requestId, status: 'done' });

    const req = await request(API).get(`/requests/${requestId}`).set('Authorization', student);
    expect(req.body.data.status).toBe('completed');
    requestId = null; // completed: nothing to cancel in cleanup

    const mine = await request(API).get('/meetings').query({ q: TITLE }).set('Authorization', student);
    expect(mine.status).toBe(200);
    expect(mine.body.data).toHaveLength(1);
    meetingId = mine.body.data[0].id;
    expect(mine.body.data[0].durationMinutes).not.toBeNull();
    const hers = await request(API).get('/meetings').query({ q: TITLE }).set('Authorization', sara);
    expect(hers.body.data.map(m => m.id)).toContain(meetingId);
  });

  todayOnly('E2E-10 both add notes, and the history search finds them', async () => {
    const s = await request(API).patch(`/meetings/${meetingId}/notes`).set('Authorization', student).send({ notes: 'E2E: fix the milestone dates' });
    expect(s.status).toBe(200);
    const i = await request(API).patch(`/meetings/${meetingId}/notes`).set('Authorization', sara).send({ notes: 'E2E: plan looks good' });
    expect(i.status).toBe(200);

    const found = await request(API).get('/meetings').query({ q: 'milestone dates' }).set('Authorization', student);
    expect(found.body.data.map(m => m.id)).toContain(meetingId);
    const one = await request(API).get(`/meetings/${meetingId}`).set('Authorization', sara);
    expect(one.body.data).toMatchObject({ studentNotes: 'E2E: fix the milestone dates', instructorNotes: 'E2E: plan looks good' });
  });
});
