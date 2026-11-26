// [S2] Tests for S2 endpoints: normal + invalid cases (FAQ, requests, notifications, AI)
// Like S1's tests, they call the running backend (npm run dev) on the real Supabase database.
// Run from the server folder: npm test -- tests/requests.test.js
// Needs TEST_PASSWORD in server/.env (the password of the test accounts 241339, 248690, I-1001 and I-1002).
// Optional: TEST_STUDENT_ID + TEST_STUDENT_PASSWORD to submit the request as another student (who gets the QR email).
//
// The tests run top to bottom and share state: the FAQ and the request created early on are used by later tests.
// Everything they create is cleaned up at the end (the FAQ is deleted, the request is cancelled).
import 'dotenv/config';
import request from 'supertest';
import { jest } from '@jest/globals';

// Real database calls (and Gemini) can take a few seconds
jest.setTimeout(30000);

const API = 'http://localhost:3000/api/v1';
const PASSWORD = process.env.TEST_PASSWORD;
// The student who submits the request; their email gets the real QR ticket when it is confirmed
const STUDENT_ID = process.env.TEST_STUDENT_ID || '241339';
const STUDENT_PASSWORD = process.env.TEST_STUDENT_PASSWORD || PASSWORD;
const TITLE = `Jest S2 test ${Date.now()}`; // unique, so we can find "our" request and notifications

let judy; // the test student (TEST_STUDENT_ID, default 241339)
let moheeb; // student 248690 (only used for "not your request")
let sara; // instructor I-1001, teaches modules 1 and 2
let omar; // instructor I-1002, teaches modules 3 and 4

let slot; // a bookable slot of Dr Sara, picked in beforeAll
let faqId; // the FAQ created by the tests
let requestId; // the request created by the tests

// "10:00" + 15 -> "10:15"
const addMinutes = (time, minutes) => {
  const total = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

// Logs in and returns "Bearer <token>". Registering first is harmless: 201 the first time, 409 after that.
async function login(universityId, password = PASSWORD) {
  await request(API).post('/auth/register').send({ universityId, password });
  const res = await request(API).post('/auth/login').send({ universityId, password });
  if (!res.body.data) {
    throw new Error(`Login failed for ${universityId}: is the server running (npm run dev) and is TEST_PASSWORD in server/.env correct?`);
  }
  return `Bearer ${res.body.data.token}`;
}

beforeAll(async () => {
  [judy, moheeb, sara, omar] = await Promise.all([login(STUDENT_ID, STUDENT_PASSWORD), login('248690'), login('I-1001'), login('I-1002')]);

  // Pick one of Dr Sara's future slots that Judy can book: not full, not today, no active request of hers yet
  const today = new Date().toLocaleDateString('en-CA');
  const slots = await request(API).get('/slots?instructorId=I-1001&limit=100').set('Authorization', judy);
  const mine = await request(API).get('/requests?limit=100').set('Authorization', judy);
  const busy = mine.body.data.filter((r) => ['pending', 'confirmed'].includes(r.status)).map((r) => r.slot.id);
  slot = slots.body.data.find((s) => !s.isFull && s.status === 'active' && s.slotDate > today && !busy.includes(s.id));
  if (!slot) throw new Error(`No bookable slot of I-1001 found for ${STUDENT_ID}. Re-run supabase/seed.sql to get fresh slots.`);
});

afterAll(async () => {
  // Clean up if a test failed before the cleanup tests ran
  if (requestId) {
    await request(API).patch(`/requests/${requestId}/status`).set('Authorization', judy)
      .send({ status: 'cancelled', reason: 'Jest cleanup' });
  }
  if (faqId) await request(API).delete(`/faqs/${faqId}`).set('Authorization', sara);
});

// ======================================================================= FAQ
describe('FAQ (list, create, edit, delete)', () => {
  test('S2-01 list FAQs without a token -> 401', async () => {
    const res = await request(API).get('/faqs');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  test('S2-02 student lists FAQs without instructorId -> 400', async () => {
    const res = await request(API).get('/faqs').set('Authorization', judy);
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe('instructorId');
  });

  test('S2-03 student tries to add an FAQ -> 403', async () => {
    const res = await request(API).post('/faqs').set('Authorization', judy)
      .send({ question: 'Can students add FAQs?', answer: 'No, only instructors.' });
    expect(res.status).toBe(403);
  });

  test('S2-04 add an FAQ with an empty body -> 400 with 2 field errors', async () => {
    const res = await request(API).post('/faqs').set('Authorization', sara).send({});
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.field)).toEqual(['question', 'answer']);
  });

  test('S2-05 add an FAQ for a module the instructor does not teach -> 400', async () => {
    const res = await request(API).post('/faqs').set('Authorization', sara)
      .send({ moduleId: 3, question: 'Not my module?', answer: 'Module 3 belongs to Dr Omar.' });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe('moduleId');
  });

  test('S2-06 add a valid FAQ -> 201', async () => {
    const res = await request(API).post('/faqs').set('Authorization', sara)
      .send({ moduleId: 1, question: '  Jest: where do we submit the lab report?  ', answer: 'On the module page, as one PDF.' });
    expect(res.status).toBe(201);
    expect(res.body.data.question).toBe('Jest: where do we submit the lab report?'); // trimmed
    expect(res.body.data.instructorId).toBe('I-1001');
    faqId = res.body.data.id;
  });

  test('S2-07 student reads Dr Sara\'s FAQ and sees it', async () => {
    const res = await request(API).get('/faqs?instructorId=I-1001').set('Authorization', judy);
    expect(res.status).toBe(200);
    expect(res.body.data.some((f) => f.id === faqId)).toBe(true);
  });

  test('S2-08 search finds it by a word in the answer', async () => {
    const res = await request(API).get(`/faqs?q=${encodeURIComponent('one PDF')}`).set('Authorization', sara);
    expect(res.status).toBe(200);
    expect(res.body.data.some((f) => f.id === faqId)).toBe(true);
  });

  test('S2-09 another instructor edits it -> 403', async () => {
    const res = await request(API).patch(`/faqs/${faqId}`).set('Authorization', omar).send({ answer: 'Changed by Omar' });
    expect(res.status).toBe(403);
  });

  test('S2-10 owner edits only the answer -> 200', async () => {
    const res = await request(API).patch(`/faqs/${faqId}`).set('Authorization', sara).send({ answer: 'On the module page, as one PDF file.' });
    expect(res.status).toBe(200);
    expect(res.body.data.answer).toBe('On the module page, as one PDF file.');
    expect(res.body.data.moduleId).toBe(1); // unchanged
  });

  test('S2-11 edit an FAQ id that is not a uuid -> 404', async () => {
    const res = await request(API).patch('/faqs/not-an-id').set('Authorization', sara).send({ answer: 'Whatever text' });
    expect(res.status).toBe(404);
  });
});

// ======================================================================= Requests
describe('Requests (submit, edit lock, confirm, cancel)', () => {
  const body = () => ({
    slotId: slot.id,
    title: TITLE,
    description: 'Written by the S2 Jest tests. It is cancelled at the end.',
    preferredStart: slot.startTime,
    preferredEnd: addMinutes(slot.startTime, 10),
    priority: 'high',
  });

  test('S2-12 submit with an invalid body -> 400', async () => {
    const res = await request(API).post('/requests').set('Authorization', judy)
      .send({ slotId: 'x', title: 'a', preferredStart: '25:00', priority: 'urgent' });
    expect(res.status).toBe(400);
    const fields = res.body.error.details.map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['slotId', 'title', 'description', 'preferredStart', 'priority']));
  });

  test('S2-13 instructor tries to submit a request -> 403', async () => {
    const res = await request(API).post('/requests').set('Authorization', sara).send(body());
    expect(res.status).toBe(403);
  });

  test('S2-14 time window outside the slot -> 409 WINDOW_OUTSIDE_SLOT', async () => {
    const res = await request(API).post('/requests').set('Authorization', judy)
      .send({ ...body(), preferredStart: slot.endTime, preferredEnd: addMinutes(slot.endTime, 15) });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('WINDOW_OUTSIDE_SLOT');
  });

  test('S2-15 submit a valid request -> 201 pending, editable', async () => {
    const res = await request(API).post('/requests').set('Authorization', judy).send(body());
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.canEdit).toBe(true);
    expect(res.body.data.slot.id).toBe(slot.id);
    requestId = res.body.data.id;
  });

  test('S2-16 a second request for the same slot -> 409 DUPLICATE_REQUEST', async () => {
    const res = await request(API).post('/requests').set('Authorization', judy).send(body());
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_REQUEST');
  });

  test('S2-17 student list contains it, with paging info', async () => {
    const res = await request(API).get('/requests?status=pending&limit=100').set('Authorization', judy);
    expect(res.status).toBe(200);
    expect(res.body.data.some((r) => r.id === requestId)).toBe(true);
    expect(res.body.meta).toEqual(expect.objectContaining({ page: 1, limit: 100 }));
  });

  test('S2-18 another student opens it -> 403', async () => {
    const res = await request(API).get(`/requests/${requestId}`).set('Authorization', moheeb);
    expect(res.status).toBe(403);
  });

  test('S2-19 an instructor of another slot opens it -> 403', async () => {
    const res = await request(API).get(`/requests/${requestId}`).set('Authorization', omar);
    expect(res.status).toBe(403);
  });

  test('S2-20 student edits it before it is opened -> 200', async () => {
    const res = await request(API).patch(`/requests/${requestId}`).set('Authorization', judy)
      .send({ preferredStart: addMinutes(slot.startTime, 10), preferredEnd: addMinutes(slot.startTime, 20) });
    expect(res.status).toBe(200);
    expect(res.body.data.preferredStart).toBe(addMinutes(slot.startTime, 10));
  });

  test('S2-21 instructor opens it -> openedAt is set, student can no longer edit', async () => {
    const res = await request(API).get(`/requests/${requestId}`).set('Authorization', sara);
    expect(res.status).toBe(200);
    expect(res.body.data.openedAt).not.toBeNull();
    expect(res.body.data.canEdit).toBe(false);
  });

  test('S2-22 student edits after it was opened -> 409 REQUEST_LOCKED', async () => {
    const res = await request(API).patch(`/requests/${requestId}`).set('Authorization', judy).send({ priority: 'low' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('REQUEST_LOCKED');
  });

  test('S2-23 student tries to confirm their own request -> 403', async () => {
    const res = await request(API).patch(`/requests/${requestId}/status`).set('Authorization', judy).send({ status: 'confirmed' });
    expect(res.status).toBe(403);
  });

  test('S2-24 reject without a reason -> 400', async () => {
    const res = await request(API).patch(`/requests/${requestId}/status`).set('Authorization', sara).send({ status: 'rejected' });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe('reason');
  });

  test('S2-25 instructor confirms -> 200 confirmed', async () => {
    const res = await request(API).patch(`/requests/${requestId}/status`).set('Authorization', sara).send({ status: 'confirmed' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('confirmed');
  });

  test('S2-26 confirm it again -> 409 INVALID_TRANSITION', async () => {
    const res = await request(API).patch(`/requests/${requestId}/status`).set('Authorization', sara).send({ status: 'confirmed' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  test('S2-27 instructor inbox filtered by confirmed contains it, with the seat counted', async () => {
    const res = await request(API).get(`/requests?status=confirmed&slotId=${slot.id}`).set('Authorization', sara);
    expect(res.status).toBe(200);
    const mine = res.body.data.find((r) => r.id === requestId);
    expect(mine).toBeDefined();
    expect(mine.slot.confirmedCount).toBeGreaterThanOrEqual(1);
  });

  test('S2-28 inbox with a wrong filter value -> 400', async () => {
    const res = await request(API).get('/requests?status=done&sort=random').set('Authorization', sara);
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.field)).toEqual(['status', 'sort']);
  });
});

// ======================================================================= Notifications
describe('Notifications (bell)', () => {
  let instructorNote; // the "request_created" notification Dr Sara got for our request

  test('S2-29 instructor got a notification for the new request', async () => {
    const res = await request(API).get('/notifications?limit=50').set('Authorization', sara);
    expect(res.status).toBe(200);
    expect(typeof res.body.meta.unreadCount).toBe('number');
    instructorNote = res.body.data.find((n) => n.type === 'request_created' && n.message.includes(TITLE));
    expect(instructorNote).toBeDefined();
  });

  test('S2-30 student got a notification that it was confirmed', async () => {
    const res = await request(API).get('/notifications?limit=50').set('Authorization', judy);
    expect(res.status).toBe(200);
    expect(res.body.data.some((n) => n.type === 'request_confirmed' && n.message.includes(TITLE))).toBe(true);
  });

  test('S2-31 student marks the instructor\'s notification as read -> 403', async () => {
    const res = await request(API).patch(`/notifications/${instructorNote.id}/read`).set('Authorization', judy);
    expect(res.status).toBe(403);
  });

  test('S2-32 instructor marks it as read -> 200', async () => {
    const res = await request(API).patch(`/notifications/${instructorNote.id}/read`).set('Authorization', sara);
    expect(res.status).toBe(200);
    expect(res.body.data.isRead).toBe(true);
  });

  test('S2-33 mark all as read -> unread count becomes 0', async () => {
    const res = await request(API).patch('/notifications/read-all').set('Authorization', sara);
    expect(res.status).toBe(200);
    expect(typeof res.body.data.updated).toBe('number');
    const after = await request(API).get('/notifications?unreadOnly=true').set('Authorization', sara);
    expect(after.body.meta.unreadCount).toBe(0);
  });

  test('S2-34 notifications with wrong filters -> 400', async () => {
    const res = await request(API).get('/notifications?unreadOnly=yes&since=yesterday').set('Authorization', sara);
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.field)).toEqual(['unreadOnly', 'since']);
  });
});

// ======================================================================= AI (Gemini)
// Gemini is an outside service: when it is busy the API answers 502 AI_UNAVAILABLE, which is also correct.
describe('AI (FAQ check, FAQ ideas)', () => {
  test('S2-35 FAQ check with an invalid body -> 400 (Gemini is not called)', async () => {
    const res = await request(API).post('/requests/faq-check').set('Authorization', judy).send({ slotId: 'nope', title: 'a' });
    expect(res.status).toBe(400);
  });

  test('S2-36 FAQ check with a real question -> 200 with a verdict (or 502 if Gemini is busy)', async () => {
    const res = await request(API).post('/requests/faq-check').set('Authorization', judy)
      .send({ slotId: slot.id, title: 'Lab report submission', description: 'Where do we submit the lab report, and in which format?' });
    expect([200, 502]).toContain(res.status);
    if (res.status === 200) {
      expect(['answered', 'partial', 'none']).toContain(res.body.data.verdict);
      expect(Array.isArray(res.body.data.sources)).toBe(true);
    } else {
      expect(res.body.error.code).toBe('AI_UNAVAILABLE');
    }
  });

  test('S2-37 student asks for FAQ ideas -> 403', async () => {
    const res = await request(API).post('/faqs/suggest').set('Authorization', judy).send({});
    expect(res.status).toBe(403);
  });

  test('S2-38 instructor asks for FAQ ideas -> 200 list (or 502 if Gemini is busy)', async () => {
    const res = await request(API).post('/faqs/suggest').set('Authorization', sara).send({});
    expect([200, 502]).toContain(res.status);
    if (res.status === 200) {
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(typeof res.body.meta.analyzed).toBe('number');
    }
  });
});

// ======================================================================= Cleanup (also tests cancel + delete)
describe('Cleanup (cancel the request, delete the FAQ)', () => {
  test('S2-39 cancel without a reason -> 400', async () => {
    const res = await request(API).patch(`/requests/${requestId}/status`).set('Authorization', judy).send({ status: 'cancelled' });
    expect(res.status).toBe(400);
  });

  test('S2-40 student cancels the confirmed request with a reason -> 200', async () => {
    const res = await request(API).patch(`/requests/${requestId}/status`).set('Authorization', judy)
      .send({ status: 'cancelled', reason: 'Jest test finished' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
    expect(res.body.data.cancelledBy).toBe('student');
    requestId = null; // nothing left to clean up
  });

  test('S2-41 another instructor deletes the FAQ -> 403', async () => {
    const res = await request(API).delete(`/faqs/${faqId}`).set('Authorization', omar);
    expect(res.status).toBe(403);
  });

  test('S2-42 owner deletes the FAQ -> 204, then it is gone (404)', async () => {
    const res = await request(API).delete(`/faqs/${faqId}`).set('Authorization', sara);
    expect(res.status).toBe(204);
    const again = await request(API).delete(`/faqs/${faqId}`).set('Authorization', sara);
    expect(again.status).toBe(404);
    faqId = null;
  });
});
