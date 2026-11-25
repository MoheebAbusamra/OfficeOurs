// [Shared] Temporary mock backend: same data as supabase/seed.sql, same response shapes as docs/openapi.yaml.
// Used only when VITE_USE_MOCKS=true. Delete this file (and the import in http.js) once the real backend is ready.
// Demo login: any seeded ID (e.g. 241339 student, I-1001 instructor) with any password of 8+ characters.

const wait = ms => new Promise(r => setTimeout(r, ms));
const iso = d => d.toISOString().slice(0, 10);
const addDays = (n, from = new Date()) => { const d = new Date(from); d.setDate(d.getDate() + n); return d; };
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const overlaps = (a1, a2, b1, b2) => toMin(a1) < toMin(b2) && toMin(b1) < toMin(a2);
const now = () => new Date().toISOString();
let seq = 100;
const newId = prefix => `${prefix}-${++seq}`;

// ---------------- Seed data ----------------
const groups = { 1: 'CS-Y3-G1', 2: 'CS-Y3-G2', 3: 'CS-Y3-G3' };
const modules = [
  { id: 1, code: '25CSCI37H', name: 'Introduction to Cloud Computing' },
  { id: 2, code: '25CSCI32H', name: 'Distributed Systems' },
  { id: 3, code: '25CSCI35H', name: 'Human-Computer Interaction' },
  { id: 4, code: '25CSCI31H', name: 'Software Project Management' },
  { id: 5, code: '25CSCI34H', name: 'Artificial Neural Networks' },
];
const people = [
  ['I-1001', 'Dr. Sara Hassan', 'instructor', null], ['I-1002', 'Dr. Omar Nabil', 'instructor', null],
  ['I-1003', 'Dr. Mona Fathy', 'instructor', null], ['241339', 'Judy Tarek', 'student', 1],
  ['248690', 'Moheeb Abusamra', 'student', 2], ['244690', 'Ahmed Ellebishy', 'student', 3],
  ['240101', 'Nour Adel', 'student', 1], ['240102', 'Youssef Kamal', 'student', 1],
  ['240201', 'Mariam Samir', 'student', 2], ['240202', 'Karim Fouad', 'student', 2],
  ['240301', 'Laila Mostafa', 'student', 3], ['240302', 'Hassan Ali', 'student', 3],
].map(([universityId, fullName, role, groupId]) => ({
  universityId, fullName, role, groupId,
  email: `${fullName.replace('Dr. ', '').toLowerCase().replace(' ', '.')}@officeours.test`,
}));
const groupModules = { 1: [1, 2, 3, 4], 2: [1, 2, 4, 5], 3: [1, 3, 4, 5] };
const instructorModules = { 'I-1001': [1, 2], 'I-1002': [3, 4], 'I-1003': [5, 1] };
const schedule = [ // [groupId, moduleId, dayOfWeek, start, end, kind]
  [1, 1, 0, '09:00', '11:00', 'lecture'], [1, 2, 0, '12:00', '14:00', 'lecture'], [1, 3, 1, '10:00', '12:00', 'lecture'],
  [1, 1, 2, '10:00', '12:00', 'lab'], [1, 4, 3, '09:00', '11:00', 'lecture'], [1, 2, 4, '13:00', '15:00', 'tutorial'],
  [2, 2, 0, '09:00', '11:00', 'lecture'], [2, 5, 1, '12:00', '14:00', 'lecture'], [2, 1, 2, '14:00', '16:00', 'lecture'],
  [2, 4, 3, '10:00', '12:00', 'lecture'], [2, 1, 3, '13:00', '15:00', 'lab'], [2, 5, 4, '09:00', '11:00', 'tutorial'],
  [3, 3, 0, '11:00', '13:00', 'lecture'], [3, 1, 1, '09:00', '11:00', 'lecture'], [3, 5, 2, '12:00', '14:00', 'lecture'],
  [3, 4, 3, '14:00', '16:00', 'lecture'], [3, 1, 4, '10:00', '12:00', 'lab'], [3, 3, 4, '13:00', '15:00', 'tutorial'],
].map(([groupId, moduleId, dayOfWeek, startTime, endTime, kind]) => ({ groupId, moduleId, dayOfWeek, startTime, endTime, kind }));
const holidays = [{ date: '2026-12-25', name: 'Christmas Day' }, { date: '2027-01-07', name: 'Coptic Christmas Day' }, { date: '2027-01-25', name: 'Revolution Day January 25' }];

// Upcoming slots: next 14 days, weekly pattern, Friday/Saturday skipped (same as seed.sql)
const pattern = [ // [instructorId, moduleId, dayOfWeek, start, end, location, capacity]
  ['I-1001', 1, 0, '10:00', '12:00', 'Room C-204', 6], ['I-1001', 1, 2, '10:00', '12:00', 'Room C-204', 6],
  ['I-1001', 2, 3, '13:00', '14:00', 'Room C-204', 3], ['I-1002', 3, 1, '11:00', '13:00', 'Room B-110', 5],
  ['I-1002', 4, 4, '09:00', '10:30', 'Room B-110', 4], ['I-1003', 5, 2, '14:00', '16:00', 'Lab A-015', 5],
  ['I-1003', 1, 3, '10:00', '11:00', 'Lab A-015', 3],
];
const slots = [];
for (let i = 1; i <= 14; i++) {
  const d = addDays(i);
  pattern.filter(p => p[2] === d.getDay()).forEach(([instructorId, moduleId, , startTime, endTime, location, capacity]) =>
    slots.push({ id: newId('slot'), instructorId, moduleId, slotDate: iso(d), startTime, endTime, location, capacity, status: 'active' }));
}
const pastSlot = { id: 'slot-past', instructorId: 'I-1001', moduleId: 1, slotDate: iso(addDays(-3)), startTime: '10:00', endTime: '12:00', location: 'Room C-204', capacity: 6, status: 'active' };
slots.push(pastSlot);
const firstSlot = id => slots.find(s => s.instructorId === id && s.slotDate > iso(new Date()));

const faqs = [
  ['I-1001', 1, 'When is the cloud project deadline?', 'The final project is due in week 12. Check the module page for the exact date and submission link.'],
  ['I-1001', 1, 'Can we use AWS free tier instead of Floci?', 'No. Deployment must use Floci (AWS emulator); you may add Vercel or Cloudflare on top.'],
  ['I-1001', 2, 'How is the distributed systems coursework graded?', 'Coursework is 40% of the module: 20% lab tasks and 20% the group project.'],
  ['I-1002', 3, 'How many participants do we need for usability testing?', 'At least 5 participants per design iteration is enough for this module.'],
  ['I-1003', 5, 'Which framework should we use for the ANN assignment?', 'Either TensorFlow/Keras or PyTorch is accepted; explain your choice in the report.'],
].map(([instructorId, moduleId, question, answer]) => ({ id: newId('faq'), instructorId, moduleId, question, answer }));

const s1 = firstSlot('I-1001');
const requests = [
  { id: 'req-1', studentId: '241339', slotId: s1.id, title: 'Floci Lambda deployment question', description: 'My Lambda deploys to Floci but API Gateway returns 502 when I call it.', preferredStart: '10:00', preferredEnd: '10:15', priority: 'high', status: 'confirmed', openedAt: now() },
  { id: 'req-2', studentId: '244690', slotId: s1.id, title: 'Clarification on cloud service models', description: 'I need help choosing and justifying the cloud model for our project report.', preferredStart: '10:15', preferredEnd: '10:30', priority: 'normal', status: 'pending', openedAt: null },
  { id: 'req-3', studentId: '240101', slotId: s1.id, title: 'Project deadline date', description: 'When exactly is the final cloud project due and where do we submit?', preferredStart: '10:30', preferredEnd: '10:40', priority: 'low', status: 'rejected', openedAt: now(), statusReason: 'This is answered in the FAQ: week 12, see the module page.' },
  { id: 'req-4', studentId: '241339', slotId: pastSlot.id, title: 'Help with milestone 1 architecture diagram', description: 'I am not sure how to show the three layers and the external APIs on the diagram.', preferredStart: '10:00', preferredEnd: '10:15', priority: 'normal', status: 'completed', openedAt: now() },
].map(r => ({ faqSuggestion: null, statusReason: null, cancelledBy: null, createdAt: now(), updatedAt: now(), ...r }));
const queue = [
  { id: 'q-1', slotId: s1.id, requestId: 'req-1', position: 1, status: 'waiting', qrToken: 'demo-token-123', checkedInAt: null, calledAt: null, finishedAt: null },
  { id: 'q-2', slotId: pastSlot.id, requestId: 'req-4', position: 1, status: 'done', qrToken: 'demo-token-old', checkedInAt: now(), calledAt: now(), finishedAt: now() },
];
const meetings = [{ id: 'meet-1', requestId: 'req-4', slotId: pastSlot.id, studentId: '241339', instructorId: 'I-1001', startedAt: `${pastSlot.slotDate}T10:00:00Z`, endedAt: `${pastSlot.slotDate}T10:15:00Z`, instructorNotes: 'Explained the 3 layers; add Supabase and the external APIs to the diagram.', studentNotes: 'Redraw diagram with labels for each cloud service.' }];
const notifications = [
  { recipientId: '241339', type: 'request_confirmed', message: 'Dr. Sara Hassan confirmed "Floci Lambda deployment question". Check your email for the QR code.', link: '/student/requests' },
  { recipientId: 'I-1001', type: 'request_created', message: 'New request from Ahmed Ellebishy: "Clarification on cloud service models".', link: '/instructor/inbox' },
].map(n => ({ id: newId('n'), isRead: false, createdAt: now(), ...n }));
const registered = new Set(); // IDs that registered in this browser session

// ---------------- Shapers (DB row -> API shape) ----------------
const person = id => people.find(p => p.universityId === id);
const ref = id => ({ universityId: id, fullName: person(id)?.fullName });
const mod = id => modules.find(m => m.id === id) || null;
const userOut = p => ({
  universityId: p.universityId, fullName: p.fullName, email: p.email, role: p.role, group: groups[p.groupId] || null,
  modules: (p.role === 'student' ? groupModules[p.groupId] : instructorModules[p.universityId]).map(mod),
  schedule: p.role === 'student' ? schedule.filter(s => s.groupId === p.groupId).map(({ groupId, moduleId, ...s }) => ({ ...s, module: mod(moduleId) })) : [],
});
const confirmedCount = slotId => requests.filter(r => r.slotId === slotId && r.status === 'confirmed').length;
const clashes = (slot, user) => user?.role === 'student' && schedule.some(s => s.groupId === user.groupId
  && s.dayOfWeek === new Date(slot.slotDate).getDay() && overlaps(s.startTime, s.endTime, slot.startTime, slot.endTime));
const slotOut = (s, user) => ({
  id: s.id, instructor: ref(s.instructorId), module: mod(s.moduleId), slotDate: s.slotDate, startTime: s.startTime, endTime: s.endTime,
  location: s.location, capacity: s.capacity, confirmedCount: confirmedCount(s.id), isFull: confirmedCount(s.id) >= s.capacity,
  status: s.status, clashesWithSchedule: clashes(s, user),
});
const requestOut = (r, user) => ({
  ...r, student: ref(r.studentId), slot: slotOut(slots.find(s => s.id === r.slotId), user),
  canEdit: user?.universityId === r.studentId && r.status === 'pending' && !r.openedAt,
  queueEntryId: queue.find(q => q.requestId === r.id)?.id || null,
});
const queueOut = q => { const r = requests.find(x => x.id === q.requestId); return { ...q, student: ref(r.studentId), title: r.title }; };
const meetingOut = m => {
  const r = requests.find(x => x.id === m.requestId);
  return { ...m, title: r.title, student: ref(m.studentId), instructor: ref(m.instructorId), module: mod(slots.find(s => s.id === m.slotId).moduleId),
    durationMinutes: m.endedAt ? Math.round((new Date(m.endedAt) - new Date(m.startedAt)) / 60000) : null };
};
const notify = (recipientId, type, message, link) => notifications.unshift({ id: newId('n'), recipientId, type, message, link, isRead: false, createdAt: now() });

// ---------------- Responses ----------------
const ok = (data, meta, status = 200) => ({ status, json: meta ? { data, meta } : { data } });
const fail = (status, code, message, details = []) => ({ status, json: { error: { code, message, details } } });
const page = (items, q) => {
  const p = Math.max(1, Number(q.page) || 1), l = Math.min(100, Number(q.limit) || 20);
  return ok(items.slice((p - 1) * l, p * l), { page: p, limit: l, total: items.length });
};
const required = (body, fields) => {
  const missing = fields.filter(f => body?.[f] === undefined || body?.[f] === '');
  return missing.length ? fail(400, 'VALIDATION_ERROR', `Please fill in: ${missing.join(', ')}`, missing.map(field => ({ field, issue: 'required' }))) : null;
};

// ---------------- Routes: [method, path pattern, handler(params, query, body, user)] ----------------
const routes = [
  ['POST', '/auth/register', (p, q, b) => {
    const err = required(b, ['universityId', 'password']); if (err) return err;
    if (b.password.length < 8) return fail(400, 'VALIDATION_ERROR', 'Password must be at least 8 characters', [{ field: 'password', issue: 'too short' }]);
    const u = person(b.universityId.trim());
    if (!u) return fail(404, 'NOT_FOUND', 'This university ID was not found. Check it or contact the registrar.');
    if (registered.has(u.universityId)) return fail(409, 'ALREADY_REGISTERED', 'This ID is already registered. Log in instead.');
    registered.add(u.universityId);
    return ok(userOut(u), null, 201);
  }],
  ['POST', '/auth/login', (p, q, b) => {
    const err = required(b, ['universityId', 'password']); if (err) return err;
    const u = person(b.universityId.trim());
    if (!u || b.password.length < 8) return fail(401, 'INVALID_CREDENTIALS', 'Wrong university ID or password');
    return ok({ token: `mock-${u.universityId}`, expiresAt: addDays(1).toISOString(), user: userOut(u) });
  }],
  ['POST', '/auth/logout', () => ({ status: 204, json: null })],
  ['GET', '/auth/me', (p, q, b, u) => ok(userOut(u))],

  ['GET', '/modules', (p, q, b, u) => ok(userOut(u).modules)],
  ['GET', '/instructors', (p, q) => ok(people.filter(x => x.role === 'instructor' && (!q.moduleId || instructorModules[x.universityId].includes(Number(q.moduleId)))).map(x => ref(x.universityId)))],
  ['GET', '/slots', (p, q, b, u) => {
    const mine = u.role === 'student' ? groupModules[u.groupId] : null;
    const list = slots.filter(s => (u.role === 'instructor' ? s.instructorId === u.universityId : s.slotDate >= iso(new Date()) && s.status === 'active' && mine.includes(s.moduleId))
      && (!q.instructorId || s.instructorId === q.instructorId) && (!q.moduleId || s.moduleId === Number(q.moduleId))
      && (!q.from || s.slotDate >= q.from) && (!q.to || s.slotDate <= q.to) && (!q.status || s.status === q.status)
      && (!q.q || `${person(s.instructorId).fullName} ${mod(s.moduleId).code} ${mod(s.moduleId).name} ${s.location}`.toLowerCase().includes(q.q.toLowerCase())))
      .map(s => slotOut(s, u))
      .sort((a, c) => a.clashesWithSchedule - c.clashesWithSchedule || a.slotDate.localeCompare(c.slotDate) || a.startTime.localeCompare(c.startTime));
    return page(list, q);
  }],
  ['POST', '/slots', (p, q, b, u) => {
    const err = required(b, ['slotDate', 'startTime', 'endTime', 'location']); if (err) return err;
    if (toMin(b.endTime) <= toMin(b.startTime)) return fail(400, 'VALIDATION_ERROR', 'End time must be after start time', [{ field: 'endTime', issue: 'before start' }]);
    if (b.slotDate < iso(new Date())) return fail(400, 'VALIDATION_ERROR', 'Date cannot be in the past', [{ field: 'slotDate', issue: 'past' }]);
    if ([5, 6].includes(new Date(b.slotDate).getDay())) return fail(409, 'WEEKEND', 'Friday and Saturday are weekend days');
    if (holidays.some(h => h.date === b.slotDate)) return fail(409, 'HOLIDAY', 'That date is a public holiday');
    if (slots.some(s => s.instructorId === u.universityId && s.slotDate === b.slotDate && s.status === 'active' && overlaps(s.startTime, s.endTime, b.startTime, b.endTime)))
      return fail(409, 'SLOT_OVERLAP', 'This overlaps one of your existing slots');
    const s = { id: newId('slot'), instructorId: u.universityId, moduleId: b.moduleId ?? null, capacity: 5, status: 'active', ...b };
    slots.push(s);
    return ok(slotOut(s, u), null, 201);
  }],
  ['GET', '/slots/:id', (p, q, b, u) => { const s = slots.find(x => x.id === p.id); return s ? ok(slotOut(s, u)) : fail(404, 'NOT_FOUND', 'Slot not found'); }],
  ['PATCH', '/slots/:id', (p, q, b, u) => {
    const s = slots.find(x => x.id === p.id); if (!s) return fail(404, 'NOT_FOUND', 'Slot not found');
    if (s.instructorId !== u.universityId) return fail(403, 'FORBIDDEN', 'You can only edit your own slots');
    Object.assign(s, b);
    if (b.status === 'cancelled') requests.filter(r => r.slotId === s.id && ['pending', 'confirmed'].includes(r.status)).forEach(r => {
      Object.assign(r, { status: 'cancelled', cancelledBy: 'instructor', statusReason: 'Slot cancelled' });
      notify(r.studentId, 'slot_cancelled', `${u.fullName} cancelled the slot on ${s.slotDate}.`, '/student/requests');
    });
    return ok(slotOut(s, u));
  }],
  ['DELETE', '/slots/:id', (p) => {
    if (requests.some(r => r.slotId === p.id && ['pending', 'confirmed'].includes(r.status))) return fail(409, 'SLOT_HAS_REQUESTS', 'This slot has active requests. Cancel it instead.');
    const i = slots.findIndex(s => s.id === p.id); if (i < 0) return fail(404, 'NOT_FOUND', 'Slot not found');
    slots.splice(i, 1); return { status: 204, json: null };
  }],
  ['GET', '/holidays', (p, q) => q.year ? ok(holidays.filter(h => h.date.startsWith(q.year))) : fail(400, 'VALIDATION_ERROR', 'year is required')],
  ['GET', '/dashboard', (p, q, b, u) => {
    const mine = requests.filter(r => slots.find(s => s.id === r.slotId)?.instructorId === u.universityId);
    const pending = mine.filter(r => r.status === 'pending');
    const next = mine.filter(r => r.status === 'confirmed').map(r => ({ r, s: slots.find(s => s.id === r.slotId) })).sort((a, c) => a.s.slotDate.localeCompare(c.s.slotDate))[0];
    const decided = mine.filter(r => ['confirmed', 'rejected', 'completed'].includes(r.status));
    return ok({
      pendingRequests: pending.length, highPriorityPending: pending.filter(r => r.priority === 'high').length,
      nextMeeting: next ? { slotId: next.s.id, date: next.s.slotDate, startTime: next.r.preferredStart, studentName: person(next.r.studentId).fullName, title: next.r.title } : null,
      upcomingSlots: slots.filter(s => s.instructorId === u.universityId && s.slotDate >= iso(new Date())).length,
      stats: { meetingsThisWeek: 1, meetingsTotal: meetings.filter(m => m.instructorId === u.universityId).length, avgMeetingMinutes: 15,
        acceptanceRate: decided.length ? +(decided.filter(r => r.status !== 'rejected').length / decided.length).toFixed(2) : 0, faqDeflections: 1 },
    });
  }],
  ['GET', '/notifications', (p, q, b, u) => {
    const mine = notifications.filter(n => n.recipientId === u.universityId);
    const list = mine.filter(n => (q.unreadOnly !== 'true' || !n.isRead) && (!q.since || n.createdAt > q.since));
    return ok(list, { unreadCount: mine.filter(n => !n.isRead).length, total: list.length });
  }],
  ['PATCH', '/notifications/read-all', (p, q, b, u) => {
    const mine = notifications.filter(n => n.recipientId === u.universityId && !n.isRead);
    mine.forEach(n => { n.isRead = true; }); return ok({ updated: mine.length });
  }],
  ['PATCH', '/notifications/:id/read', (p) => { const n = notifications.find(x => x.id === p.id); if (!n) return fail(404, 'NOT_FOUND', 'Notification not found'); n.isRead = true; return ok(n); }],

  ['POST', '/requests/faq-check', (p, q, b) => {
    const err = required(b, ['slotId', 'title', 'description']); if (err) return err;
    const s = slots.find(x => x.id === b.slotId); if (!s) return fail(404, 'NOT_FOUND', 'Slot not found');
    // Fake AI: score = shared words. 2+ = answered, 1 = partly answered. Same response shape as the real Gemini check.
    const words = `${b.title} ${b.description}`.toLowerCase().split(/\W+/).filter(w => w.length > 3);
    const hits = faqs.filter(f => f.instructorId === s.instructorId).map(f => ({ f, score: words.filter(w => f.question.toLowerCase().includes(w)).length })).filter(h => h.score > 0).sort((a, c) => c.score - a.score);
    const titleWords = b.title.trim().split(/\s+/);
    const suggestedTitle = titleWords.length < 4 ? `${b.title.trim()}: ${b.description.trim().split(/\s+/).slice(0, 6).join(' ')}`.slice(0, 80) : null;
    if (!hits.length) return ok({ matched: false, verdict: 'none', faqId: null, faqQuestion: null, answer: null, sources: [], stillWorthAsking: null, suggestedTitle });
    const verdict = hits[0].score >= 2 ? 'answered' : 'partial';
    const used = hits.slice(0, 2);
    return ok({
      matched: true, verdict, faqId: used[0].f.id, faqQuestion: used[0].f.question,
      answer: used.map(h => h.f.answer).join(' '),
      sources: used.map(h => ({ faqId: h.f.id, question: h.f.question })),
      stillWorthAsking: verdict === 'partial' ? 'Ask about the parts of your setup that the FAQ does not mention.' : null,
      suggestedTitle,
    });
  }],
  ['GET', '/requests', (p, q, b, u) => {
    const list = requests.filter(r => (u.role === 'student' ? r.studentId === u.universityId : slots.find(s => s.id === r.slotId)?.instructorId === u.universityId)
      && (!q.status || r.status === q.status) && (!q.priority || r.priority === q.priority) && (!q.slotId || r.slotId === q.slotId)
      && (q.unopened !== 'true' || !r.openedAt) && (!q.q || `${r.title} ${r.description} ${person(r.studentId).fullName}`.toLowerCase().includes(q.q.toLowerCase())))
      .map(r => requestOut(r, u));
    return page(list, q);
  }],
  ['POST', '/requests', (p, q, b, u) => {
    const err = required(b, ['slotId', 'title', 'description', 'preferredStart', 'preferredEnd']); if (err) return err;
    if (b.title.length < 3) return fail(400, 'VALIDATION_ERROR', 'Title must be at least 3 characters', [{ field: 'title', issue: 'too short' }]);
    if (b.description.length < 10) return fail(400, 'VALIDATION_ERROR', 'Description must be at least 10 characters', [{ field: 'description', issue: 'too short' }]);
    const s = slots.find(x => x.id === b.slotId); if (!s) return fail(404, 'NOT_FOUND', 'Slot not found');
    if (s.status !== 'active') return fail(409, 'SLOT_NOT_ACTIVE', 'This slot is no longer active');
    if (confirmedCount(s.id) >= s.capacity) return fail(409, 'SLOT_FULL', 'This slot is full');
    if (toMin(b.preferredStart) < toMin(s.startTime) || toMin(b.preferredEnd) > toMin(s.endTime) || toMin(b.preferredEnd) <= toMin(b.preferredStart))
      return fail(409, 'WINDOW_OUTSIDE_SLOT', `Pick a time window between ${s.startTime} and ${s.endTime}`);
    if (requests.some(r => r.studentId === u.universityId && r.slotId === s.id && ['pending', 'confirmed'].includes(r.status)))
      return fail(409, 'DUPLICATE_REQUEST', 'You already have an active request for this slot');
    const r = { id: newId('req'), studentId: u.universityId, priority: 'normal', faqSuggestion: null, ...b, status: 'pending', openedAt: null, statusReason: null, cancelledBy: null, createdAt: now(), updatedAt: now() };
    requests.push(r);
    notify(s.instructorId, 'request_created', `New request from ${u.fullName}: "${r.title}".`, '/instructor/inbox');
    return ok(requestOut(r, u), null, 201);
  }],
  ['GET', '/requests/:id', (p, q, b, u) => {
    const r = requests.find(x => x.id === p.id); if (!r) return fail(404, 'NOT_FOUND', 'Request not found');
    if (u.role === 'instructor' && !r.openedAt) r.openedAt = now();
    return ok(requestOut(r, u));
  }],
  ['PATCH', '/requests/:id/status', (p, q, b, u) => {
    const r = requests.find(x => x.id === p.id); if (!r) return fail(404, 'NOT_FOUND', 'Request not found');
    const allowed = u.role === 'instructor' ? { pending: ['confirmed', 'rejected', 'cancelled'], confirmed: ['cancelled'] } : { pending: ['cancelled'], confirmed: ['cancelled'] };
    if (!allowed[r.status]?.includes(b?.status)) return fail(409, 'INVALID_TRANSITION', `Cannot change a ${r.status} request to ${b?.status}`);
    if (['rejected', 'cancelled'].includes(b.status) && !b.reason) return fail(400, 'VALIDATION_ERROR', 'Please give a reason', [{ field: 'reason', issue: 'required' }]);
    const s = slots.find(x => x.id === r.slotId);
    if (b.status === 'confirmed' && confirmedCount(s.id) >= s.capacity) return fail(409, 'SLOT_FULL', 'This slot is already full');
    Object.assign(r, { status: b.status, statusReason: b.reason || null, cancelledBy: b.status === 'cancelled' ? u.role : null, updatedAt: now() });
    if (b.status === 'confirmed') queue.push({ id: newId('q'), slotId: s.id, requestId: r.id, position: queue.filter(x => x.slotId === s.id).length + 1, status: 'waiting', qrToken: newId('token'), checkedInAt: null, calledAt: null, finishedAt: null });
    const other = u.role === 'instructor' ? r.studentId : s.instructorId;
    notify(other, `request_${b.status}`, `"${r.title}" was ${b.status} by ${u.fullName}.`, other === r.studentId ? '/student/requests' : '/instructor/inbox');
    return ok(requestOut(r, u));
  }],
  ['PATCH', '/requests/:id', (p, q, b, u) => {
    const r = requests.find(x => x.id === p.id); if (!r) return fail(404, 'NOT_FOUND', 'Request not found');
    if (r.studentId !== u.universityId) return fail(403, 'FORBIDDEN', 'You can only edit your own requests');
    if (r.status !== 'pending' || r.openedAt) return fail(409, 'REQUEST_LOCKED', 'The instructor already opened this request, so it can no longer be edited');
    Object.assign(r, b, { updatedAt: now() }); return ok(requestOut(r, u));
  }],
  ['GET', '/faqs', (p, q, b, u) => ok(faqs.filter(f => f.instructorId === (q.instructorId || u.universityId) && (!q.q || f.question.toLowerCase().includes(q.q.toLowerCase()))))],
  ['POST', '/faqs/suggest', (p, q, b, u) => {
    // Fake AI: two fixed drafts, with real counts and titles from this instructor's mock requests
    const mine = requests.filter(r => slots.find(s => s.id === r.slotId)?.instructorId === u.universityId);
    if (mine.length < 2) return ok([], { analyzed: mine.length });
    const idea = (rs, question, answer, moduleId) => ({ question, answer, moduleId, requestCount: rs.length, studentCount: new Set(rs.map(r => r.studentId)).size, exampleTitles: rs.slice(0, 3).map(r => r.title) });
    return ok([
      idea(mine.slice(0, 2), 'Why does API Gateway return 502 on Floci, and how do I fix it?', 'Most 502s come from a wrong Lambda handler name or a missing return value. Check the logs with [add the log command] and compare with the lab sheet at [add the link].', 1),
      idea(mine.slice(-1), 'Which cloud service model should our project use?', 'Most projects fit [add the recommended model]. Justify your choice in the report section [add the section number].', null),
    ], { analyzed: mine.length });
  }],
  ['POST', '/faqs', (p, q, b, u) => { const err = required(b, ['question', 'answer']); if (err) return err; const f = { id: newId('faq'), instructorId: u.universityId, moduleId: null, ...b }; faqs.push(f); return ok(f, null, 201); }],
  ['PATCH', '/faqs/:id', (p, q, b) => { const f = faqs.find(x => x.id === p.id); if (!f) return fail(404, 'NOT_FOUND', 'FAQ not found'); Object.assign(f, b); return ok(f); }],
  ['DELETE', '/faqs/:id', (p) => { const i = faqs.findIndex(x => x.id === p.id); if (i < 0) return fail(404, 'NOT_FOUND', 'FAQ not found'); faqs.splice(i, 1); return { status: 204, json: null }; }],

  ['GET', '/queue/position/:requestId', (p) => {
    const e = queue.find(x => x.requestId === p.requestId); if (!e) return fail(404, 'NOT_FOUND', 'This request is not in a queue yet');
    const ahead = queue.filter(x => x.slotId === e.slotId && ['waiting', 'in_meeting'].includes(x.status) && x.position < e.position).length;
    return ok({ status: e.status, ahead, estimatedWaitMinutes: ahead * 15, checkedIn: !!e.checkedInAt });
  }],
  ['GET', '/queue/slots/:slotId', (p) => ok(queue.filter(x => x.slotId === p.slotId).sort((a, c) => a.position - c.position).map(queueOut))],
  ['POST', '/queue/slots/:slotId/next', (p) => {
    const list = queue.filter(x => x.slotId === p.slotId).sort((a, c) => a.position - c.position);
    const current = list.find(x => x.status === 'in_meeting');
    if (current) {
      Object.assign(current, { status: 'done', finishedAt: now() });
      const r = requests.find(x => x.id === current.requestId); r.status = 'completed';
      meetings.unshift({ id: newId('meet'), requestId: r.id, slotId: r.slotId, studentId: r.studentId, instructorId: slots.find(s => s.id === r.slotId).instructorId, startedAt: current.calledAt, endedAt: now(), instructorNotes: null, studentNotes: null });
    }
    const next = list.find(x => x.status === 'waiting');
    if (!next && !current) return fail(409, 'QUEUE_EMPTY', 'Nobody is waiting in this queue');
    if (next) { Object.assign(next, { status: 'in_meeting', calledAt: now() }); notify(requests.find(x => x.id === next.requestId).studentId, 'queue_called', 'It is your turn. Please go in.', '/student/requests'); }
    return ok({ finished: current ? queueOut(current) : null, current: next ? queueOut(next) : null, remaining: list.filter(x => x.status === 'waiting').length });
  }],
  ['PATCH', '/queue/entries/:id/skip', (p) => {
    const e = queue.find(x => x.id === p.id); if (!e) return fail(404, 'NOT_FOUND', 'Queue entry not found');
    if (['done', 'skipped'].includes(e.status)) return fail(409, 'ALREADY_FINISHED', 'This entry is already finished');
    e.status = 'skipped'; return ok(queueOut(e));
  }],
  ['POST', '/queue/slots/:slotId/close', (p) => {
    const list = queue.filter(x => x.slotId === p.slotId && ['waiting', 'in_meeting'].includes(x.status));
    list.forEach(e => { e.status = e.status === 'in_meeting' ? 'done' : 'skipped'; });
    return ok({ finished: list.filter(e => e.status === 'done').length, skipped: list.filter(e => e.status === 'skipped').length });
  }],
  ['GET', '/check-in/:token', (p) => {
    const e = queue.find(x => x.qrToken === p.token); if (!e) return fail(404, 'NOT_FOUND', 'This QR code is not valid');
    const r = requests.find(x => x.id === e.requestId), s = slots.find(x => x.id === e.slotId);
    return ok({ studentName: person(r.studentId).fullName, instructorName: person(s.instructorId).fullName, slotDate: s.slotDate, startTime: r.preferredStart, location: s.location, position: e.position, checkedInAt: e.checkedInAt });
  }],
  ['POST', '/check-in/:token', (p) => {
    const e = queue.find(x => x.qrToken === p.token); if (!e) return fail(404, 'NOT_FOUND', 'This QR code is not valid');
    if (e.checkedInAt) return fail(409, 'ALREADY_CHECKED_IN', 'You are already checked in');
    if (['done', 'skipped'].includes(e.status)) return fail(409, 'ENTRY_FINISHED', 'This meeting is already finished');
    e.checkedInAt = now(); // mock skips the "only on the meeting day" rule so the demo works any day
    return ok({ checkedInAt: e.checkedInAt, ahead: queue.filter(x => x.slotId === e.slotId && x.status === 'waiting' && x.position < e.position).length });
  }],
  ['GET', '/meetings', (p, q, b, u) => page(meetings.filter(m => m[`${u.role}Id`] === u.universityId).map(meetingOut)
    .filter(m => !q.q || `${m.title} ${m.instructorNotes} ${m.studentNotes}`.toLowerCase().includes(q.q.toLowerCase())), q)],
  ['GET', '/meetings/:id', (p) => { const m = meetings.find(x => x.id === p.id); return m ? ok(meetingOut(m)) : fail(404, 'NOT_FOUND', 'Meeting not found'); }],
  ['PATCH', '/meetings/:id/notes', (p, q, b, u) => {
    const m = meetings.find(x => x.id === p.id); if (!m) return fail(404, 'NOT_FOUND', 'Meeting not found');
    if (typeof b?.notes !== 'string') return fail(400, 'VALIDATION_ERROR', 'notes is required', [{ field: 'notes', issue: 'required' }]);
    m[`${u.role}Notes`] = b.notes; return ok(meetingOut(m));
  }],
];

const PUBLIC = ['/auth/register', '/auth/login', '/check-in/'];

// Called by http.js instead of fetch. Returns { status, json } like the real backend.
export async function mockRequest(method, url, body, token) {
  await wait(250);
  const [path, search] = url.split('?');
  const query = Object.fromEntries(new URLSearchParams(search));
  const user = token?.startsWith('mock-') ? person(token.slice(5)) : null;
  for (const [m, pattern, handler] of routes) {
    if (m !== method) continue;
    const names = [];
    const rx = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, n) => { names.push(n); return '([^/]+)'; })}$`);
    const match = path.match(rx);
    if (!match) continue;
    if (!user && !PUBLIC.some(pub => path.startsWith(pub))) return fail(401, 'UNAUTHORIZED', 'Please log in first');
    const params = Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(match[i + 1])]));
    return handler(params, query, body, user);
  }
  return fail(404, 'NOT_FOUND', `Mock has no route for ${method} ${path}`);
}
