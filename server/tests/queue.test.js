// Tests for the queue endpoints: normal + invalid cases
// The database (db.js), login check and outside services are replaced by in-memory fakes,
// so the real routes, validation and business rules in logic.js run without touching Supabase.
import { jest } from '@jest/globals';
import { randomUUID } from 'node:crypto';

process.env.NODE_ENV = 'test';
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
const TOMORROW = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date(Date.now() + 86400000));

// ---------------- In-memory data ----------------
const people = {
  S1: { university_id: 'S1', full_name: 'Judy Tarek', email: 'judy@test.com', role: 'student' },
  S2: { university_id: 'S2', full_name: 'Moheeb Abusamra', email: 'moheeb@test.com', role: 'student' },
  S3: { university_id: 'S3', full_name: 'Ahmed Ellebishy', email: 'ahmed@test.com', role: 'student' },
  I1: { university_id: 'I1', full_name: 'Dr. Sara Hassan', email: 'sara@test.com', role: 'instructor' },
  I2: { university_id: 'I2', full_name: 'Dr. Omar Nabil', email: 'omar@test.com', role: 'instructor' },
};
let slots, requests, entries, meetings, notifications;

function reset() {
  slots = [
    { id: randomUUID(), instructor_id: 'I1', module_id: 1, slot_date: TODAY, start_time: '10:00:00', end_time: '12:00:00', location: 'Room C-204', capacity: 5, status: 'active' },
    { id: randomUUID(), instructor_id: 'I1', module_id: 1, slot_date: TOMORROW, start_time: '10:00:00', end_time: '12:00:00', location: 'Room C-205', capacity: 5, status: 'active' },
  ];
  requests = [];
  entries = [];
  meetings = [];
  notifications = [];
}

const addRequest = (studentId, slot, status = 'confirmed') => {
  const r = { id: randomUUID(), student_id: studentId, slot_id: slot.id, title: `Question from ${studentId}`, status, preferred_start: '10:00:00', preferred_end: '10:15:00' };
  requests.push(r);
  return r;
};
const addEntry = (request, position, extra = {}) => {
  const e = { id: randomUUID(), slot_id: request.slot_id, request_id: request.id, position, status: 'waiting', qr_token: randomUUID(), checked_in_at: null, called_at: null, finished_at: null, ...extra };
  entries.push(e);
  return e;
};

// Rows shaped like the Supabase selects in db.js (joined objects included)
const slotRow = s => s && { ...s, instructor: people[s.instructor_id], module: { id: 1, code: '25CSCI37H', name: 'Cloud Computing' } };
const entryRow = e => {
  if (!e) return null;
  const r = requests.find(x => x.id === e.request_id);
  return { ...e, request: { ...r, student: people[r.student_id] } };
};
const meetingRow = m => m && {
  ...m,
  request: { title: requests.find(r => r.id === m.request_id)?.title },
  slot: { slot_date: slots.find(s => s.id === m.slot_id).slot_date, module_id: 1, module: { id: 1, code: '25CSCI37H', name: 'Cloud Computing' } },
  student: people[m.student_id],
  instructor: people[m.instructor_id],
};

// ---------------- Fakes for the modules logic.js and routes.js import ----------------
const fakeDb = {
  getSlot: async id => slotRow(slots.find(s => s.id === id)),
  getRequestWithSlot: async id => {
    const r = requests.find(x => x.id === id);
    return r && { ...r, student: people[r.student_id], slot: slotRow(slots.find(s => s.id === r.slot_id)) };
  },
  setRequestCompleted: async id => { const r = requests.find(x => x.id === id); if (r?.status === 'confirmed') r.status = 'completed'; },
  getEntryById: async id => entryRow(entries.find(e => e.id === id)),
  getEntryByRequest: async id => entryRow(entries.find(e => e.request_id === id)),
  getEntryByToken: async t => entryRow(entries.find(e => e.qr_token === t)),
  listSlotEntries: async slotId => entries.filter(e => e.slot_id === slotId).sort((a, b) => a.position - b.position).map(entryRow),
  maxPosition: async slotId => Math.max(0, ...entries.filter(e => e.slot_id === slotId).map(e => e.position)),
  insertEntry: async row => {
    if (entries.some(e => e.request_id === row.request_id || (e.slot_id === row.slot_id && e.position === row.position))) {
      const err = new Error('duplicate'); err.dbCode = '23505'; throw err;
    }
    return entryRow(addEntry(requests.find(r => r.id === row.request_id), row.position));
  },
  updateEntryIfStatus: async (id, from, patch) => {
    const e = entries.find(x => x.id === id);
    if (!e || !from.includes(e.status)) return null;
    Object.assign(e, patch);
    return entryRow(e);
  },
  markCheckedIn: async (id, at) => {
    const e = entries.find(x => x.id === id);
    if (!e || e.checked_in_at) return null;
    e.checked_in_at = at;
    return { id, checked_in_at: at };
  },
  countAhead: async (slotId, position) => entries.filter(e => e.slot_id === slotId && ['waiting', 'in_meeting'].includes(e.status) && e.position < position).length,
  insertMeeting: async row => {
    if (meetings.some(m => m.request_id === row.request_id)) return null;
    const m = { id: randomUUID(), instructor_notes: null, student_notes: null, ...row };
    meetings.push(m);
    return { id: m.id };
  },
  recentMeetingTimes: async id => meetings.filter(m => m.instructor_id === id && m.ended_at),
  listMeetings: async ({ column, universityId }) => meetings.filter(m => m[column] === universityId).map(meetingRow),
  getMeeting: async id => meetingRow(meetings.find(m => m.id === id)),
  updateMeetingNotes: async (id, column, notes) => { const m = meetings.find(x => x.id === id); m[column] = notes; return meetingRow(m); },
};

const sent = { brevo: [], ses: [], s3: [] };
jest.unstable_mockModule('../src/services/queue/db.js', () => fakeDb);
jest.unstable_mockModule('../src/services/queue/notify.js', () => ({
  notify: async (recipientId, type, message, link) => { notifications.push({ recipientId, type, message, link }); },
}));
jest.unstable_mockModule('../src/services/queue/brevo.js', () => ({
  sendWithBrevo: async mail => { sent.brevo.push(mail); return { status: 'sent', messageId: 'brevo-1' }; },
}));
jest.unstable_mockModule('../src/services/queue/ses.js', () => ({
  copyToSes: async mail => { sent.ses.push(mail); return { status: 'stored', messageId: 'ses-1' }; },
}));
jest.unstable_mockModule('../src/services/queue/storage.js', () => ({
  storeQrImage: async (token, png) => { sent.s3.push({ token, png }); return { status: 'stored', key: `qr/${token}.png` }; },
}));
// Login fake: "Bearer <universityId>" logs in as that person
jest.unstable_mockModule('../src/shared/auth.js', () => ({
  requireAuth: (req, res, next) => {
    const id = (req.get('authorization') || '').replace('Bearer ', '');
    if (!people[id]) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Please log in first', details: [] } });
    const p = people[id];
    req.user = { universityId: p.university_id, fullName: p.full_name, role: p.role };
    next();
  },
  requireRole: (...roles) => (req, res, next) => (roles.includes(req.user.role)
    ? next()
    : res.status(403).json({ error: { code: 'FORBIDDEN', message: 'wrong role', details: [] } })),
}));

const { default: request } = await import('supertest');
const { app } = await import('../src/index.js');
const { handleMessageBody } = await import('../src/services/queue/events.js');
const { handler: lambdaHandler } = await import('../src/services/queue/lambda.js');

const as = id => ({ Authorization: `Bearer ${id}` });
const confirmedEvent = requestId => JSON.stringify({ eventType: 'RequestConfirmed', eventId: randomUUID(), occurredAt: new Date().toISOString(), data: { requestId } });

beforeEach(() => {
  reset();
  sent.brevo = []; sent.ses = []; sent.s3 = [];
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

// =====================================================================
describe('#14 Add to queue on confirmation (SNS -> SQS -> Lambda)', () => {
  test('Q-01 confirmed event queues the student, stores the QR in S3, emails it (Brevo) and copies it to SES', async () => {
    const r = addRequest('S1', slots[0]);
    const out = await handleMessageBody(confirmedEvent(r.id));
    expect(out).toMatchObject({ created: true, position: 1 });
    expect(entries).toHaveLength(1);
    expect(sent.s3).toHaveLength(1);
    expect(sent.s3[0].png.subarray(1, 4).toString()).toBe('PNG');
    expect(sent.brevo[0]).toMatchObject({ to: 'judy@test.com' });
    expect(sent.brevo[0].html).toContain(`/check-in/${entries[0].qr_token}`);
    expect(sent.ses).toHaveLength(1);
  });

  test('Q-02 positions go up in confirmation order', async () => {
    const a = addRequest('S1', slots[0]);
    const b = addRequest('S2', slots[0]);
    await handleMessageBody(confirmedEvent(a.id));
    const out = await handleMessageBody(confirmedEvent(b.id));
    expect(out.position).toBe(2);
  });

  test('Q-03 the same event twice does not queue twice or send a second email', async () => {
    const r = addRequest('S1', slots[0]);
    await handleMessageBody(confirmedEvent(r.id));
    const again = await handleMessageBody(confirmedEvent(r.id));
    expect(again.created).toBe(false);
    expect(entries).toHaveLength(1);
    expect(sent.brevo).toHaveLength(1);
  });

  test('Q-04 an SNS envelope around the event is unwrapped', async () => {
    const r = addRequest('S1', slots[0]);
    const body = JSON.stringify({ Type: 'Notification', Message: confirmedEvent(r.id) });
    expect(await handleMessageBody(body)).toMatchObject({ created: true });
  });

  test('Q-05 a request that is not confirmed is dropped (not queued)', async () => {
    const r = addRequest('S1', slots[0], 'pending');
    expect(await handleMessageBody(confirmedEvent(r.id))).toMatchObject({ dropped: true, reason: 'REQUEST_NOT_CONFIRMED' });
    expect(entries).toHaveLength(0);
  });

  test('Q-06 Lambda handler processes SQS records and reports none failed', async () => {
    const r = addRequest('S1', slots[0]);
    const out = await lambdaHandler({ Records: [{ messageId: 'm1', body: confirmedEvent(r.id) }] });
    expect(out.batchItemFailures).toEqual([]);
    expect(entries).toHaveLength(1);
  });

  test('Q-07 Lambda reports a broken message as failed so SQS retries it', async () => {
    const out = await lambdaHandler({ Records: [{ messageId: 'bad', body: '{not json' }] });
    expect(out.batchItemFailures).toEqual([{ itemIdentifier: 'bad' }]);
  });

  test('Q-08 RequestCancelled takes the student out of the queue', async () => {
    const r = addRequest('S1', slots[0]);
    const e = addEntry(r, 1);
    await handleMessageBody(JSON.stringify({ eventType: 'RequestCancelled', data: { requestId: r.id } }));
    expect(e.status).toBe('skipped');
  });
});

// =====================================================================
describe('#7 GET /queue/position/{requestId}', () => {
  test('Q-10 student sees how many are ahead and an estimate, never names', async () => {
    const a = addEntry(addRequest('S2', slots[0]), 1);
    addEntry(addRequest('S3', slots[0]), 2);
    const mine = addEntry(addRequest('S1', slots[0]), 3);
    const res = await request(app).get(`/api/v1/queue/position/${mine.request_id}`).set(as('S1'));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'waiting', ahead: 2, estimatedWaitMinutes: 30, checkedIn: false, position: 3 });
    expect(JSON.stringify(res.body)).not.toMatch(/Moheeb|Ahmed/);
    expect(a.status).toBe('waiting');
  });

  test('Q-11 someone else\'s request -> 403', async () => {
    const e = addEntry(addRequest('S2', slots[0]), 1);
    const res = await request(app).get(`/api/v1/queue/position/${e.request_id}`).set(as('S1'));
    expect(res.status).toBe(403);
  });

  test('Q-12 invalid id -> 400, unknown id -> 404, no login -> 401, instructor -> 403', async () => {
    expect((await request(app).get('/api/v1/queue/position/abc').set(as('S1'))).status).toBe(400);
    expect((await request(app).get(`/api/v1/queue/position/${randomUUID()}`).set(as('S1'))).status).toBe(404);
    expect((await request(app).get(`/api/v1/queue/position/${randomUUID()}`)).status).toBe(401);
    expect((await request(app).get(`/api/v1/queue/position/${randomUUID()}`).set(as('I1'))).status).toBe(403);
  });
});

// =====================================================================
describe('#11 Instructor queue: list, call next, skip, close', () => {
  test('Q-20 owner sees the full queue with names', async () => {
    addEntry(addRequest('S1', slots[0]), 1);
    const res = await request(app).get(`/api/v1/queue/slots/${slots[0].id}`).set(as('I1'));
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({ position: 1, status: 'waiting', student: { fullName: 'Judy Tarek' } });
    expect(res.body.meta.slot).toMatchObject({ isToday: true, location: 'Room C-204' });
  });

  test('Q-21 another instructor -> 403, unknown slot -> 404', async () => {
    expect((await request(app).get(`/api/v1/queue/slots/${slots[0].id}`).set(as('I2'))).status).toBe(403);
    expect((await request(app).get(`/api/v1/queue/slots/${randomUUID()}`).set(as('I1'))).status).toBe(404);
  });

  test('Q-22 call next: first student in_meeting and notified', async () => {
    const e = addEntry(addRequest('S1', slots[0]), 1);
    addEntry(addRequest('S2', slots[0]), 2);
    const res = await request(app).post(`/api/v1/queue/slots/${slots[0].id}/next`).set(as('I1'));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ finished: null, current: { id: e.id, status: 'in_meeting' }, remaining: 1 });
    expect(notifications).toContainEqual(expect.objectContaining({ recipientId: 'S1', type: 'queue_called' }));
  });

  test('Q-23 call next again: current -> done, meeting saved, request completed, next called', async () => {
    const r1 = addRequest('S1', slots[0]);
    addEntry(r1, 1, { status: 'in_meeting', called_at: new Date(Date.now() - 600000).toISOString() });
    addEntry(addRequest('S2', slots[0]), 2);
    const res = await request(app).post(`/api/v1/queue/slots/${slots[0].id}/next`).set(as('I1'));
    expect(res.status).toBe(200);
    expect(res.body.data.finished).toMatchObject({ status: 'done' });
    expect(res.body.data.current.student.universityId).toBe('S2');
    expect(meetings).toHaveLength(1);
    expect(meetings[0]).toMatchObject({ request_id: r1.id, student_id: 'S1', instructor_id: 'I1' });
    expect(r1.status).toBe('completed');
    expect(notifications).toContainEqual(expect.objectContaining({ recipientId: 'S1', type: 'meeting_completed' }));
  });

  test('Q-24 empty queue -> 409 QUEUE_EMPTY', async () => {
    const res = await request(app).post(`/api/v1/queue/slots/${slots[0].id}/next`).set(as('I1'));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('QUEUE_EMPTY');
  });

  test('Q-25 call next on a slot that is not today -> 409 SLOT_NOT_TODAY', async () => {
    addEntry(addRequest('S1', slots[1]), 1);
    const res = await request(app).post(`/api/v1/queue/slots/${slots[1].id}/next`).set(as('I1'));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLOT_NOT_TODAY');
  });

  test('Q-26 skip a waiting student with a reason; skipping again -> 409', async () => {
    const e = addEntry(addRequest('S1', slots[0]), 1);
    const res = await request(app).patch(`/api/v1/queue/entries/${e.id}/skip`).set(as('I1')).send({ reason: 'Not at the door' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('skipped');
    expect(notifications[0].message).toContain('Not at the door');
    const again = await request(app).patch(`/api/v1/queue/entries/${e.id}/skip`).set(as('I1')).send({});
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_FINISHED');
  });

  test('Q-27 skip: reason too long -> 400, not the owner -> 403', async () => {
    const e = addEntry(addRequest('S1', slots[0]), 1);
    const long = await request(app).patch(`/api/v1/queue/entries/${e.id}/skip`).set(as('I1')).send({ reason: 'x'.repeat(301) });
    expect(long.status).toBe(400);
    expect(long.body.error.details[0].field).toBe('reason');
    expect((await request(app).patch(`/api/v1/queue/entries/${e.id}/skip`).set(as('I2')).send({})).status).toBe(403);
  });

  test('Q-28 close: current finished, the rest skipped and notified', async () => {
    addEntry(addRequest('S1', slots[0]), 1, { status: 'in_meeting', called_at: new Date().toISOString() });
    addEntry(addRequest('S2', slots[0]), 2);
    addEntry(addRequest('S3', slots[0]), 3);
    const res = await request(app).post(`/api/v1/queue/slots/${slots[0].id}/close`).set(as('I1'));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ finished: 1, skipped: 2 });
    expect(meetings).toHaveLength(1);
    expect(notifications.filter(n => n.recipientId !== 'S1')).toHaveLength(2);
  });

  test('Q-29 a student cannot run the queue -> 403', async () => {
    expect((await request(app).post(`/api/v1/queue/slots/${slots[0].id}/next`).set(as('S1'))).status).toBe(403);
  });
});

// =====================================================================
describe('#12 QR check-in (public)', () => {
  test('Q-30 GET shows the meeting details for a valid token', async () => {
    const e = addEntry(addRequest('S1', slots[0]), 1);
    const res = await request(app).get(`/api/v1/check-in/${e.qr_token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ studentName: 'Judy Tarek', instructorName: 'Dr. Sara Hassan', location: 'Room C-204', position: 1, checkedInAt: null, isMeetingDay: true });
  });

  test('Q-31 invalid or unknown token -> 404', async () => {
    expect((await request(app).get('/api/v1/check-in/not-a-token')).status).toBe(404);
    expect((await request(app).post(`/api/v1/check-in/${randomUUID()}`)).status).toBe(404);
  });

  test('Q-32 check-in works once on the meeting day', async () => {
    addEntry(addRequest('S2', slots[0]), 1);
    const e = addEntry(addRequest('S1', slots[0]), 2);
    const res = await request(app).post(`/api/v1/check-in/${e.qr_token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ ahead: 1 });
    expect(res.body.data.checkedInAt).toBeTruthy();
    const again = await request(app).post(`/api/v1/check-in/${e.qr_token}`);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_CHECKED_IN');
  });

  test('Q-33 wrong day -> 409 NOT_MEETING_DAY', async () => {
    const e = addEntry(addRequest('S1', slots[1]), 1);
    const res = await request(app).post(`/api/v1/check-in/${e.qr_token}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NOT_MEETING_DAY');
  });

  test('Q-34 finished entry -> 409 ENTRY_FINISHED', async () => {
    const e = addEntry(addRequest('S1', slots[0]), 1, { status: 'done' });
    const res = await request(app).post(`/api/v1/check-in/${e.qr_token}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ENTRY_FINISHED');
  });
});

// =====================================================================
describe('#4 Meeting history and notes', () => {
  const addMeeting = (studentId, notes = {}) => {
    const r = addRequest(studentId, slots[0], 'completed');
    const m = { id: randomUUID(), request_id: r.id, slot_id: slots[0].id, student_id: studentId, instructor_id: 'I1',
      started_at: '2026-11-20T08:00:00Z', ended_at: '2026-11-20T08:20:00Z', instructor_notes: null, student_notes: null, ...notes };
    meetings.push(m);
    return m;
  };

  test('Q-40 each user sees only their own meetings, with duration', async () => {
    addMeeting('S1');
    addMeeting('S2');
    const res = await request(app).get('/api/v1/meetings').set(as('S1'));
    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 1 });
    expect(res.body.data[0]).toMatchObject({ durationMinutes: 20, student: { universityId: 'S1' }, module: { code: '25CSCI37H' } });
    expect((await request(app).get('/api/v1/meetings').set(as('I1'))).body.meta.total).toBe(2);
  });

  test('Q-41 search by notes text', async () => {
    addMeeting('S1', { instructor_notes: 'Redraw the architecture diagram' });
    addMeeting('S1', { instructor_notes: 'Fix the SQS policy' });
    const res = await request(app).get('/api/v1/meetings').query({ q: 'diagram' }).set(as('S1'));
    expect(res.body.data).toHaveLength(1);
  });

  test('Q-42 bad filters -> 400 with field details', async () => {
    const res = await request(app).get('/api/v1/meetings').query({ from: '2026-13-40', limit: 500 }).set(as('S1'));
    expect(res.status).toBe(400);
    expect(res.body.error.details.map(d => d.field).sort()).toEqual(['from', 'limit']);
  });

  test('Q-43 student saves student notes, instructor saves instructor notes', async () => {
    const m = addMeeting('S1');
    const s = await request(app).patch(`/api/v1/meetings/${m.id}/notes`).set(as('S1')).send({ notes: '  My summary  ' });
    expect(s.status).toBe(200);
    expect(s.body.data).toMatchObject({ studentNotes: 'My summary', instructorNotes: null });
    const i = await request(app).patch(`/api/v1/meetings/${m.id}/notes`).set(as('I1')).send({ notes: 'Good progress' });
    expect(i.body.data).toMatchObject({ studentNotes: 'My summary', instructorNotes: 'Good progress' });
  });

  test('Q-44 notes: missing -> 400, too long -> 400, not my meeting -> 403, unknown -> 404', async () => {
    const m = addMeeting('S1');
    expect((await request(app).patch(`/api/v1/meetings/${m.id}/notes`).set(as('S1')).send({})).status).toBe(400);
    expect((await request(app).patch(`/api/v1/meetings/${m.id}/notes`).set(as('S1')).send({ notes: 'x'.repeat(5001) })).status).toBe(400);
    expect((await request(app).patch(`/api/v1/meetings/${m.id}/notes`).set(as('S2')).send({ notes: 'hi' })).status).toBe(403);
    expect((await request(app).get(`/api/v1/meetings/${randomUUID()}`).set(as('S1'))).status).toBe(404);
  });

  test('Q-45 broken JSON body -> 400 INVALID_JSON (no crash)', async () => {
    const m = addMeeting('S1');
    const res = await request(app).patch(`/api/v1/meetings/${m.id}/notes`).set(as('S1')).set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});
