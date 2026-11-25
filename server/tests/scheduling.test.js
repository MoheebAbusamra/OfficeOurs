// [S1] Tests for S1 endpoints: normal + invalid cases
// They call the running backend (npm run dev) on the real Supabase database, like the frontend does.
// Run from the server folder: npm test -- tests/scheduling.test.js
// Needs TEST_PASSWORD in server/.env (the password of the test accounts 241339, I-1001 and I-1002).
import 'dotenv/config';
import request from 'supertest';
import { jest } from '@jest/globals';
 
// Real database calls can take a few seconds, so allow 20 s per test instead of Jest's default 5 s
jest.setTimeout(20000);
 
const API = 'http://localhost:3000/api/v1';
const PASSWORD = process.env.TEST_PASSWORD;
 
// Tokens for the 3 test accounts, filled in beforeAll
let student; // 241339 (Judy, group CS-Y3-G1)
let sara; // I-1001, teaches modules 1 and 2
let omar; // I-1002, teaches modules 3 and 4
 
// The slot that the tests create (and delete again at the end)
let slotId;
const NEW_SLOT = { slotDate: '2026-12-06', startTime: '16:00', endTime: '17:00', location: 'Jest Room' }; // a Sunday
 
beforeAll(async () => {
  // Omar only exists to test "not your slot". 201 the first time, 409 after that: both are fine.
  await request(API).post('/auth/register').send({ universityId: 'I-1002', password: PASSWORD });
 
  const s = await request(API).post('/auth/login').send({ universityId: '241339', password: PASSWORD });
  const i = await request(API).post('/auth/login').send({ universityId: 'I-1001', password: PASSWORD });
  const o = await request(API).post('/auth/login').send({ universityId: 'I-1002', password: PASSWORD });
  if (!s.body.data || !i.body.data || !o.body.data) {
    throw new Error('Login failed: is the server running (npm run dev) and is TEST_PASSWORD in server/.env correct?');
  }
  student = `Bearer ${s.body.data.token}`;
  sara = `Bearer ${i.body.data.token}`;
  omar = `Bearer ${o.body.data.token}`;
});
 
afterAll(async () => {
  // Clean up if a test failed before the delete test ran
  if (slotId) await request(API).delete(`/slots/${slotId}`).set('Authorization', sara);
});
 
describe('Auth (register, login, me, logout)', () => {
  test('S1-01 register with an empty body -> 400', async () => {
    const res = await request(API).post('/auth/register').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.length).toBe(2); // universityId and password
  });
 
  test('S1-02 register with a short password -> 400', async () => {
    const res = await request(API).post('/auth/register').send({ universityId: '241339', password: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe('password');
  });
 
  test('S1-03 register with an ID that is not in the registry -> 404', async () => {
    const res = await request(API).post('/auth/register').send({ universityId: '999999', password: 'whatever123' });
    expect(res.status).toBe(404);
  });
 
  test('S1-04 register an ID that is already registered -> 409', async () => {
    const res = await request(API).post('/auth/register').send({ universityId: '241339', password: PASSWORD });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_REGISTERED');
  });
 
  test('S1-05 login with a wrong password -> 401', async () => {
    const res = await request(API).post('/auth/login').send({ universityId: '241339', password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });
 
  test('S1-06 login with an unknown ID gives the same 401', async () => {
    const res = await request(API).post('/auth/login').send({ universityId: '999999', password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });
 
  test('S1-07 login returns a token, an expiry date and the user', async () => {
    const res = await request(API).post('/auth/login').send({ universityId: '241339', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.expiresAt).toBeTruthy();
    expect(res.body.data.user.universityId).toBe('241339');
  });
 
  test('S1-08 me without a token -> 401', async () => {
    const res = await request(API).get('/auth/me');
    expect(res.status).toBe(401);
  });
 
  test('S1-09 me with a fake token -> 401', async () => {
    const res = await request(API).get('/auth/me').set('Authorization', 'Bearer abc');
    expect(res.status).toBe(401);
  });
 
  test('S1-10 me as a student has group, 4 modules and a schedule with HH:mm times', async () => {
    const res = await request(API).get('/auth/me').set('Authorization', student);
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('student');
    expect(res.body.data.group).toBe('CS-Y3-G1');
    expect(res.body.data.modules.length).toBe(4);
    expect(res.body.data.schedule[0].startTime).toMatch(/^\d{2}:\d{2}$/);
  });
 
  test('S1-11 me as an instructor has no group and no schedule', async () => {
    const res = await request(API).get('/auth/me').set('Authorization', sara);
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('instructor');
    expect(res.body.data.group).toBe(null);
    expect(res.body.data.schedule).toEqual([]);
  });
 
  test('S1-12 logout -> 204, then the same token is rejected', async () => {
    const login = await request(API).post('/auth/login').send({ universityId: '241339', password: PASSWORD });
    const token = `Bearer ${login.body.data.token}`;
    const out = await request(API).post('/auth/logout').set('Authorization', token);
    expect(out.status).toBe(204);
    const me = await request(API).get('/auth/me').set('Authorization', token);
    expect(me.status).toBe(401);
  });
});
 
describe('Modules and instructors', () => {
  test('S1-13 modules for a student are the group modules', async () => {
    const res = await request(API).get('/modules').set('Authorization', student);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(4);
  });
 
  test('S1-14 modules for an instructor are the taught modules', async () => {
    const res = await request(API).get('/modules').set('Authorization', sara);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
  });
 
  test('S1-15 instructors appear only once each', async () => {
    const res = await request(API).get('/instructors').set('Authorization', student);
    expect(res.status).toBe(200);
    const ids = res.body.data.map(i => i.universityId);
    expect(new Set(ids).size).toBe(ids.length);
  });
 
  test('S1-16 instructors for module 3 is only Omar', async () => {
    const res = await request(API).get('/instructors?moduleId=3').set('Authorization', student);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ universityId: 'I-1002', fullName: 'Dr. Omar Nabil' }]);
  });
 
  test('S1-17 instructors with moduleId=abc -> 400', async () => {
    const res = await request(API).get('/instructors?moduleId=abc').set('Authorization', student);
    expect(res.status).toBe(400);
  });
});
 
describe('Browse slots (GET /slots, GET /slots/:id)', () => {
  test('S1-18 student list has data and meta', async () => {
    const res = await request(API).get('/slots').set('Authorization', student);
    expect(res.status).toBe(200);
    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.limit).toBe(20);
  });
 
  test('S1-19 student only sees active, upcoming, weekday slots', async () => {
    const res = await request(API).get('/slots?limit=100').set('Authorization', student);
    const today = new Date().toLocaleDateString('en-CA');
    for (const slot of res.body.data) {
      expect(slot.status).toBe('active');
      expect(slot.slotDate >= today).toBe(true);
      const day = new Date(`${slot.slotDate}T00:00:00Z`).getUTCDay();
      expect(day === 5 || day === 6).toBe(false);
    }
  });
 
  test('S1-20 clashing slots come after non-clashing ones', async () => {
    const res = await request(API).get('/slots?limit=100').set('Authorization', student);
    let seenClash = false;
    for (const slot of res.body.data) {
      if (slot.clashesWithSchedule) seenClash = true;
      else expect(seenClash).toBe(false); // no free slot may come after a clashing one
    }
  });
 
  test('S1-21 paging: limit=2 returns at most 2 slots', async () => {
    const res = await request(API).get('/slots?limit=2').set('Authorization', student);
    expect(res.body.data.length).toBeLessThanOrEqual(2);
    expect(res.body.meta.limit).toBe(2);
  });
 
  test('S1-22 invalid filters -> 400 with the field names', async () => {
    const res = await request(API).get('/slots?moduleId=x&status=old&limit=500').set('Authorization', student);
    expect(res.status).toBe(400);
    const fields = res.body.error.details.map(d => d.field);
    expect(fields).toEqual(['moduleId', 'status', 'limit']);
  });
 
  test('S1-23 "to" before "from" -> 400', async () => {
    const res = await request(API).get('/slots?from=2026-12-02&to=2026-12-01').set('Authorization', student);
    expect(res.status).toBe(400);
  });
 
  test('S1-24 instructor sees only own slots', async () => {
    const res = await request(API).get('/slots?limit=100').set('Authorization', sara);
    expect(res.status).toBe(200);
    for (const slot of res.body.data) {
      expect(slot.instructor.universityId).toBe('I-1001');
    }
  });
 
  test('S1-25 slot details for an unknown id -> 404', async () => {
    const res = await request(API).get('/slots/00000000-0000-4000-8000-000000000000').set('Authorization', student);
    expect(res.status).toBe(404);
  });
 
  test('S1-26 slots without a token -> 401', async () => {
    const res = await request(API).get('/slots');
    expect(res.status).toBe(401);
  });
});
 
describe('Create slot (POST /slots)', () => {
  test('S1-27 a student cannot create slots -> 403', async () => {
    const res = await request(API).post('/slots').set('Authorization', student).send(NEW_SLOT);
    expect(res.status).toBe(403);
  });
 
  test('S1-28 missing fields -> 400', async () => {
    const res = await request(API).post('/slots').set('Authorization', sara).send({});
    expect(res.status).toBe(400);
    expect(res.body.error.details.length).toBe(4); // slotDate, startTime, endTime, location
  });
 
  test('S1-29 end before start -> 400', async () => {
    const res = await request(API).post('/slots').set('Authorization', sara).send({ ...NEW_SLOT, startTime: '17:00', endTime: '16:00' });
    expect(res.status).toBe(400);
  });
 
  test('S1-30 date in the past -> 400', async () => {
    const res = await request(API).post('/slots').set('Authorization', sara).send({ ...NEW_SLOT, slotDate: '2026-11-01' });
    expect(res.status).toBe(400);
  });
 
  test('S1-31 capacity 51 -> 400', async () => {
    const res = await request(API).post('/slots').set('Authorization', sara).send({ ...NEW_SLOT, capacity: 51 });
    expect(res.status).toBe(400);
  });
 
  test('S1-32 a module the instructor does not teach -> 400', async () => {
    const res = await request(API).post('/slots').set('Authorization', sara).send({ ...NEW_SLOT, moduleId: 5 });
    expect(res.status).toBe(400);
  });
 
  test('S1-33 Friday -> 409 WEEKEND', async () => {
    const res = await request(API).post('/slots').set('Authorization', sara).send({ ...NEW_SLOT, slotDate: '2026-12-04' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('WEEKEND');
  });
 
  test('S1-34 public holiday (Coptic Christmas) -> 409 HOLIDAY', async () => {
    const res = await request(API).post('/slots').set('Authorization', sara).send({ ...NEW_SLOT, slotDate: '2027-01-07' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('HOLIDAY');
  });
 
  test('S1-35 a valid slot -> 201 with capacity 5 by default', async () => {
    const res = await request(API).post('/slots').set('Authorization', sara).send(NEW_SLOT);
    expect(res.status).toBe(201);
    expect(res.body.data.capacity).toBe(5);
    expect(res.body.data.confirmedCount).toBe(0);
    slotId = res.body.data.id; // used by the next tests
  });
 
  test('S1-36 an overlapping slot -> 409 SLOT_OVERLAP', async () => {
    const res = await request(API).post('/slots').set('Authorization', sara).send({ ...NEW_SLOT, startTime: '16:30', endTime: '17:30' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLOT_OVERLAP');
  });
});
 
describe('Edit, cancel and delete (PATCH and DELETE /slots/:id)', () => {
  test('S1-37 edit with the same times does not overlap with itself', async () => {
    const res = await request(API).patch(`/slots/${slotId}`).set('Authorization', sara).send({ startTime: '16:00', endTime: '17:00', location: 'Jest Room 2', capacity: 8 });
    expect(res.status).toBe(200);
    expect(res.body.data.location).toBe('Jest Room 2');
    expect(res.body.data.capacity).toBe(8);
  });
 
  test('S1-38 moving the slot to a Friday -> 409 WEEKEND', async () => {
    const res = await request(API).patch(`/slots/${slotId}`).set('Authorization', sara).send({ slotDate: '2026-12-04' });
    expect(res.status).toBe(409);
  });
 
  test('S1-39 another instructor cannot edit it -> 403', async () => {
    const res = await request(API).patch(`/slots/${slotId}`).set('Authorization', omar).send({ capacity: 3 });
    expect(res.status).toBe(403);
  });
 
  test('S1-40 cancel sets the status to cancelled', async () => {
    const res = await request(API).patch(`/slots/${slotId}`).set('Authorization', sara).send({ status: 'cancelled' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
  });
 
  test('S1-41 a cancelled slot cannot be edited -> 409 SLOT_CLOSED', async () => {
    const res = await request(API).patch(`/slots/${slotId}`).set('Authorization', sara).send({ capacity: 3 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLOT_CLOSED');
  });
 
  test('S1-42 another instructor cannot delete it -> 403', async () => {
    const res = await request(API).delete(`/slots/${slotId}`).set('Authorization', omar);
    expect(res.status).toBe(403);
  });
 
  test('S1-43 the owner deletes it -> 204, and then it is gone (404)', async () => {
    const del = await request(API).delete(`/slots/${slotId}`).set('Authorization', sara);
    expect(del.status).toBe(204);
    const get = await request(API).get(`/slots/${slotId}`).set('Authorization', sara);
    expect(get.status).toBe(404);
    slotId = null; // nothing left to clean up
  });
});
 
describe('Holidays and dashboard', () => {
  test('S1-44 holidays 2026 include Coptic Christmas on 7 January', async () => {
    const res = await request(API).get('/holidays?year=2026').set('Authorization', student);
    expect(res.status).toBe(200);
    const dates = res.body.data.map(h => h.date);
    expect(dates).toContain('2026-01-07');
  });
 
  test('S1-45 holidays without a year -> 400', async () => {
    const res = await request(API).get('/holidays').set('Authorization', student);
    expect(res.status).toBe(400);
  });
 
  test('S1-46 dashboard for an instructor has all the numbers', async () => {
    const res = await request(API).get('/dashboard').set('Authorization', sara);
    expect(res.status).toBe(200);
    expect(typeof res.body.data.pendingRequests).toBe('number');
    expect(typeof res.body.data.upcomingSlots).toBe('number');
    expect(res.body.data.stats.acceptanceRate).toBeGreaterThanOrEqual(0);
    expect(res.body.data.stats.acceptanceRate).toBeLessThanOrEqual(1);
  });
 
  test('S1-47 dashboard for a student -> 403', async () => {
    const res = await request(API).get('/dashboard').set('Authorization', student);
    expect(res.status).toBe(403);
  });
});
 