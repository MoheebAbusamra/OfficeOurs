// [S1] Business rules: no overlapping slots, no slots on holidays/weekends, clash ranking, dashboard stats, notifications
import { AppError } from '../../shared/errors.js';
import * as db from './db.js';
import { fetchEgyptHolidays } from './calendarific.js';
 
// GET /modules: a student gets their group's modules, an instructor the modules they teach
export async function listModules(user) {
  let rows;
  if (user.role === 'student') {
    rows = await db.findModulesOfGroup(user.groupId);
  } else {
    rows = await db.findModulesOfInstructor(user.universityId);
  }
 
  const modules = [];
  for (const row of rows) {
    modules.push(row.modules);
  }
  return modules;
}
 
// GET /instructors?moduleId=: instructors who teach the user's modules (or one of them)
export async function listInstructors(user, moduleId) {
  // 1. Which module ids to look at: one module, or all of the user's modules
  const moduleIds = [];
  const myModules = await listModules(user);
  for (const m of myModules) {
    if (!moduleId || m.id === Number(moduleId)) moduleIds.push(m.id);
  }
  if (moduleIds.length === 0) return [];
 
  // 2. Find who teaches them. One instructor can teach 2 of the modules,
  //    so we skip anyone already in the list.
  const rows = await db.findTeachersOfModules(moduleIds);
  const instructors = [];
  for (const row of rows) {
    const person = row.university_registry;
    const alreadyAdded = instructors.some(i => i.universityId === person.university_id);
    if (!alreadyAdded) {
      instructors.push({ universityId: person.university_id, fullName: person.full_name });
    }
  }
 
  // 3. Sort by name, A to Z
  instructors.sort((a, b) => a.fullName.localeCompare(b.fullName));
  return instructors;
}
 
// Turns one database row into the Slot shape from openapi.yaml.
// Used by both GET /slots and GET /slots/{id}, so the shape is written only once.
// "schedule" is the student's timetable (empty array for instructors).
function toSlotResponse(row, confirmedCount, schedule) {
  const startTime = row.start_time.slice(0, 5); // "10:00:00" -> "10:00"
  const endTime = row.end_time.slice(0, 5);
 
  // Day of the week of the slot: 0 = Sunday ... 6 = Saturday.
  // "T00:00:00Z" + getUTCDay() so the server's time zone cannot shift the day.
  const day = new Date(`${row.slot_date}T00:00:00Z`).getUTCDay();
 
  // Clash = a class on the same day whose time overlaps the slot.
  // Two times overlap when each one starts before the other ends.
  // Times like "09:00" can be compared as text because they always have 2 digits.
  let clashes = false;
  for (const entry of schedule) {
    const classStart = entry.start_time.slice(0, 5);
    const classEnd = entry.end_time.slice(0, 5);
    if (entry.day_of_week === day && classStart < endTime && startTime < classEnd) {
      clashes = true;
    }
  }
 
  return {
    id: row.id,
    instructor: { universityId: row.university_registry.university_id, fullName: row.university_registry.full_name },
    module: row.modules, // null when the slot is open to all of the instructor's modules
    slotDate: row.slot_date,
    startTime,
    endTime,
    location: row.location,
    capacity: row.capacity,
    confirmedCount,
    isFull: confirmedCount >= row.capacity,
    status: row.status,
    clashesWithSchedule: clashes,
  };
}
 
// GET /slots
export async function listSlots(user, query) {
  // Today as "YYYY-MM-DD" in the server's local time ("en-CA" happens to use that format)
  const today = new Date().toLocaleDateString('en-CA');
 
  // 1. Read the slots from the database with the filters from the URL
  let rows;
  let schedule = [];
  if (user.role === 'instructor') {
    // Instructors: only their own slots, also past and cancelled ones
    rows = await db.findSlots({
      instructorId: user.universityId,
      moduleId: query.moduleId,
      from: query.from,
      to: query.to,
      status: query.status,
    });
  } else {
    // Students: only active slots from today on (and never before "from")
    let from = today;
    if (query.from && query.from > today) from = query.from;
    rows = await db.findSlots({
      instructorId: query.instructorId,
      moduleId: query.moduleId,
      from,
      to: query.to,
      status: 'active',
    });
    schedule = await db.findSchedule(user.groupId);
  }
 
  // 2. Students: keep only slots for their modules, and drop weekends and holidays
  if (user.role === 'student') {
    const myModules = await listModules(user);
    const myModuleIds = [];
    for (const m of myModules) myModuleIds.push(m.id);
 
    // A slot without a module is open to all modules of that instructor,
    // so we also need to know which instructors teach the student's modules
    const teachers = await db.findTeachersOfModules(myModuleIds);
    const myInstructorIds = [];
    for (const t of teachers) myInstructorIds.push(t.university_registry.university_id);
 
    const holidayRows = await db.findHolidayDates(today);
    const holidayDates = [];
    for (const h of holidayRows) holidayDates.push(h.holiday_date);
 
    const kept = [];
    for (const row of rows) {
      const day = new Date(`${row.slot_date}T00:00:00Z`).getUTCDay();
      const isWeekend = day === 5 || day === 6; // Friday or Saturday
      const isHoliday = holidayDates.includes(row.slot_date);
      let isMyModule;
      if (row.module_id === null) {
        isMyModule = myInstructorIds.includes(row.instructor_id);
      } else {
        isMyModule = myModuleIds.includes(row.module_id);
      }
      if (isMyModule && !isWeekend && !isHoliday) kept.push(row);
    }
    rows = kept;
  }
 
  // 3. Search text "q": instructor name, module code or name, or location
  if (query.q) {
    const search = query.q.toLowerCase();
    const kept = [];
    for (const row of rows) {
      let text = `${row.university_registry.full_name} ${row.location}`;
      if (row.modules) text += ` ${row.modules.code} ${row.modules.name}`;
      if (text.toLowerCase().includes(search)) kept.push(row);
    }
    rows = kept;
  }
 
  // 4. Count the confirmed requests of each slot: { "slot-id": 2, ... }
  const counts = {};
  if (rows.length > 0) {
    const slotIds = [];
    for (const row of rows) slotIds.push(row.id);
    const confirmed = await db.findConfirmedRequests(slotIds);
    for (const r of confirmed) {
      counts[r.slot_id] = (counts[r.slot_id] || 0) + 1;
    }
  }
 
  // 5. Shape every slot like openapi.yaml
  const slots = [];
  for (const row of rows) {
    slots.push(toSlotResponse(row, counts[row.id] || 0, schedule));
  }
 
  // 6. Slots that clash with a class go last. The database already sorted by date and time,
  //    and sort() keeps that order for slots with the same clash value.
  slots.sort((a, b) => Number(a.clashesWithSchedule) - Number(b.clashesWithSchedule));
 
  // 7. Pages: page 1 = items 0-19, page 2 = items 20-39, ... (limit 20 by default)
  const page = Number(query.page || 1);
  const limit = Number(query.limit || 20);
  const start = (page - 1) * limit;
  return {
    data: slots.slice(start, start + limit),
    meta: { page, limit, total: slots.length },
  };
}
 
// GET /slots/{id}
export async function getSlot(user, id) {
  const row = await db.findSlotById(id);
  if (!row) {
    throw new AppError(404, 'NOT_FOUND', 'Slot not found');
  }
 
  const confirmed = await db.findConfirmedRequests([id]);
 
  let schedule = [];
  if (user.role === 'student') {
    schedule = await db.findSchedule(user.groupId);
  }
 
  return toSlotResponse(row, confirmed.length, schedule);
}
 
// POST /slots (instructors only, checked in routes.js)
export async function createSlot(user, body) {
  const today = new Date().toLocaleDateString('en-CA');
  const location = body.location.trim();
 
  // 1. Simple field rules (400)
  if (body.endTime <= body.startTime) {
    throw new AppError(400, 'VALIDATION_ERROR', 'End time must be after start time', [{ field: 'endTime', issue: 'must be after start time' }]);
  }
  if (body.slotDate < today) {
    throw new AppError(400, 'VALIDATION_ERROR', 'The date cannot be in the past', [{ field: 'slotDate', issue: 'is in the past' }]);
  }
 
  // 2. The module (if one is chosen) must be one the instructor teaches
  if (body.moduleId) {
    const myModules = await listModules(user);
    const teachesIt = myModules.some(m => m.id === body.moduleId);
    if (!teachesIt) {
      throw new AppError(400, 'VALIDATION_ERROR', 'You do not teach this module', [{ field: 'moduleId', issue: 'not one of your modules' }]);
    }
  }
 
  // 3. Business rules (409): weekend, holiday, overlap with the instructor's own slots
  const day = new Date(`${body.slotDate}T00:00:00Z`).getUTCDay();
  if (day === 5 || day === 6) {
    throw new AppError(409, 'WEEKEND', 'Friday and Saturday are weekend days. Pick another date.');
  }
 
  // getHolidays() makes sure that year is in the cache (it calls Calendarific the first time)
  const holidays = await getHolidays(Number(body.slotDate.slice(0, 4)));
  const holiday = holidays.find(h => h.date === body.slotDate);
  if (holiday) {
    throw new AppError(409, 'HOLIDAY', `That date is a public holiday (${holiday.name}). Pick another date.`);
  }
 
  const sameDay = await db.findActiveSlotsOnDate(user.universityId, body.slotDate);
  for (const other of sameDay) {
    // Overlap = each one starts before the other ends (same idea as the clash check)
    if (other.start_time.slice(0, 5) < body.endTime && body.startTime < other.end_time.slice(0, 5)) {
      throw new AppError(409, 'SLOT_OVERLAP', 'This overlaps one of your other slots on that day.');
    }
  }
 
  // 4. Save it. capacity is 5 when it is not given (same default as the database)
  const row = await db.insertSlot({
    instructor_id: user.universityId,
    module_id: body.moduleId || null,
    slot_date: body.slotDate,
    start_time: body.startTime,
    end_time: body.endTime,
    location,
    capacity: body.capacity || 5,
  });
 
  // A new slot has no requests yet, and instructors have no timetable
  return toSlotResponse(row, 0, []);
}
 
// PATCH /slots/:id: edit the slot, or cancel it with { status: "cancelled" }
export async function updateSlot(user, id, body) {
  const today = new Date().toLocaleDateString('en-CA');
 
  // 1. The slot must exist and belong to this instructor
  const slot = await db.findSlotById(id);
  if (!slot) {
    throw new AppError(404, 'NOT_FOUND', 'Slot not found');
  }
  if (slot.instructor_id !== user.universityId) {
    throw new AppError(403, 'FORBIDDEN', 'You can only change your own slots');
  }
 
  // 2. Cancelled and past slots are closed: they cannot be changed any more
  if (slot.status === 'cancelled' || slot.slot_date < today) {
    throw new AppError(409, 'SLOT_CLOSED', 'This slot is cancelled or already over, so it cannot be changed.');
  }
 
  const activeRequests = await db.findActiveRequests(id);
 
  // 3a. CANCEL: cancel the slot, cancel its pending/confirmed requests and notify those students
  if (body.status === 'cancelled') {
    const updated = await db.updateSlot(id, { status: 'cancelled' });
 
    if (activeRequests.length > 0) {
      const requestIds = [];
      const notifications = [];
      for (const r of activeRequests) {
        requestIds.push(r.id);
        notifications.push({
          recipient_id: r.student_id,
          type: 'slot_cancelled',
          message: `${user.fullName} cancelled the office hours on ${slot.slot_date} at ${slot.start_time.slice(0, 5)}. Your request was cancelled.`,
          link: '/student/requests',
        });
      }
      await db.cancelRequests(requestIds, 'The instructor cancelled this slot');
      await db.insertNotifications(notifications);
    }
 
    return toSlotResponse(updated, 0, []); // no confirmed requests are left
  }
 
  // 3b. EDIT: take each new value from the body, or keep the old one if it was not sent
  const slotDate = body.slotDate !== undefined ? body.slotDate : slot.slot_date;
  const startTime = body.startTime !== undefined ? body.startTime : slot.start_time.slice(0, 5);
  const endTime = body.endTime !== undefined ? body.endTime : slot.end_time.slice(0, 5);
  const location = body.location !== undefined ? body.location.trim() : slot.location;
  const capacity = body.capacity !== undefined ? body.capacity : slot.capacity;
  const moduleId = body.moduleId !== undefined ? body.moduleId : slot.module_id;
 
  // 4. The same rules as create
  if (endTime <= startTime) {
    throw new AppError(400, 'VALIDATION_ERROR', 'End time must be after start time', [{ field: 'endTime', issue: 'must be after start time' }]);
  }
  if (slotDate < today) {
    throw new AppError(400, 'VALIDATION_ERROR', 'The date cannot be in the past', [{ field: 'slotDate', issue: 'is in the past' }]);
  }
  if (moduleId) {
    const myModules = await listModules(user);
    const teachesIt = myModules.some(m => m.id === moduleId);
    if (!teachesIt) {
      throw new AppError(400, 'VALIDATION_ERROR', 'You do not teach this module', [{ field: 'moduleId', issue: 'not one of your modules' }]);
    }
  }
 
  const day = new Date(`${slotDate}T00:00:00Z`).getUTCDay();
  if (day === 5 || day === 6) {
    throw new AppError(409, 'WEEKEND', 'Friday and Saturday are weekend days. Pick another date.');
  }
 
  const holidays = await getHolidays(Number(slotDate.slice(0, 4)));
  const holiday = holidays.find(h => h.date === slotDate);
  if (holiday) {
    throw new AppError(409, 'HOLIDAY', `That date is a public holiday (${holiday.name}). Pick another date.`);
  }
 
  const sameDay = await db.findActiveSlotsOnDate(user.universityId, slotDate);
  for (const other of sameDay) {
    if (other.id === id) continue; // skip this slot itself, it cannot overlap with itself
    if (other.start_time.slice(0, 5) < endTime && startTime < other.end_time.slice(0, 5)) {
      throw new AppError(409, 'SLOT_OVERLAP', 'This overlaps one of your other slots on that day.');
    }
  }
 
  // 5. Capacity cannot go below the students already confirmed
  let confirmedCount = 0;
  for (const r of activeRequests) {
    if (r.status === 'confirmed') confirmedCount++;
  }
  if (capacity < confirmedCount) {
    throw new AppError(409, 'CAPACITY_BELOW_CONFIRMED', `${confirmedCount} students are already confirmed, so capacity must be at least ${confirmedCount}.`, [
      { field: 'capacity', issue: `must be at least ${confirmedCount}` },
    ]);
  }
 
  // 6. Save the changes
  const updated = await db.updateSlot(id, {
    slot_date: slotDate,
    start_time: startTime,
    end_time: endTime,
    location,
    capacity,
    module_id: moduleId || null,
  });
 
  // 7. If the date, time or room changed, tell the students who have a request in this slot
  const changed =
    slotDate !== slot.slot_date ||
    startTime !== slot.start_time.slice(0, 5) ||
    endTime !== slot.end_time.slice(0, 5) ||
    location !== slot.location;
  if (changed && activeRequests.length > 0) {
    const notifications = [];
    for (const r of activeRequests) {
      notifications.push({
        recipient_id: r.student_id,
        type: 'slot_changed',
        message: `${user.fullName} changed the office hours to ${slotDate}, ${startTime} to ${endTime} in ${location}.`,
        link: '/student/requests',
      });
    }
    await db.insertNotifications(notifications);
  }
 
  return toSlotResponse(updated, confirmedCount, []);
}
 
// DELETE /slots/:id: only when nobody has a pending or confirmed request in it
export async function deleteSlot(user, id) {
  const slot = await db.findSlotById(id);
  if (!slot) {
    throw new AppError(404, 'NOT_FOUND', 'Slot not found');
  }
  if (slot.instructor_id !== user.universityId) {
    throw new AppError(403, 'FORBIDDEN', 'You can only delete your own slots');
  }
 
  const activeRequests = await db.findActiveRequests(id);
  if (activeRequests.length > 0) {
    throw new AppError(409, 'SLOT_HAS_REQUESTS', 'This slot has active requests, so it cannot be deleted. Cancel it instead.');
  }
 
  await db.deleteSlot(id);
}
 
// GET /holidays?year=2026: from the database cache, or from Calendarific the first time
export async function getHolidays(year) {
  // 1. Already cached? Then no API call is needed
  const cached = await db.findHolidaysOfYear(year);
  if (cached.length > 0) {
    const holidays = [];
    for (const row of cached) {
      holidays.push({ date: row.holiday_date, name: row.name });
    }
    return holidays;
  }
 
  // 2. Not cached yet: ask Calendarific (this can throw 502), then save the result
  const holidays = await fetchEgyptHolidays(year);
  if (holidays.length > 0) {
    const rows = [];
    for (const h of holidays) {
      rows.push({ holiday_date: h.date, name: h.name, year });
    }
    await db.saveHolidays(rows);
  }
  return holidays;
}
 
// GET /dashboard (instructors only): numbers from S1 slots, S2 requests and S3 meetings
export async function getDashboard(user) {
  const today = new Date().toLocaleDateString('en-CA');
 
  // 1. All my slots (S1). Upcoming = active and today or later
  const slots = await db.findSlots({ instructorId: user.universityId });
  let upcomingSlots = 0;
  const slotIds = [];
  for (const s of slots) {
    slotIds.push(s.id);
    if (s.status === 'active' && s.slot_date >= today) upcomingSlots++;
  }
 
  // 2. All requests on my slots (S2)
  let requests = [];
  if (slotIds.length > 0) {
    requests = await db.findRequestsOfSlots(slotIds);
  }
 
  // 3. Count them in one loop
  let pendingRequests = 0;
  let highPriorityPending = 0;
  let accepted = 0; // confirmed, or confirmed and then completed by S3
  let rejected = 0;
  let faqDeflections = 0;
  for (const r of requests) {
    if (r.status === 'pending') {
      pendingRequests++;
      if (r.priority === 'high') highPriorityPending++;
    }
    if (r.status === 'confirmed' || r.status === 'completed') accepted++;
    if (r.status === 'rejected') rejected++;
    if (r.faq_suggestion) faqDeflections++; // the AI found an FAQ answer for this question
  }
 
  // Acceptance rate = accepted / (accepted + rejected), e.g. 0.75. The page shows it as 75%
  let acceptanceRate = 0;
  if (accepted + rejected > 0) {
    acceptanceRate = Math.round((accepted / (accepted + rejected)) * 100) / 100;
  }
 
  // 4. Next meeting: the earliest confirmed request in an active slot from today on
  let nextMeeting = null;
  for (const r of requests) {
    if (r.status !== 'confirmed') continue;
    const slot = slots.find(s => s.id === r.slot_id);
    if (slot.status !== 'active' || slot.slot_date < today) continue;
 
    const candidate = {
      slotId: slot.id,
      date: slot.slot_date,
      startTime: r.preferred_start.slice(0, 5), // the student's chosen time inside the slot
      studentName: r.university_registry.full_name,
      title: r.title,
    };
    // Keep it if it is earlier than the one we have (first by date, then by time)
    if (
      nextMeeting === null ||
      candidate.date < nextMeeting.date ||
      (candidate.date === nextMeeting.date && candidate.startTime < nextMeeting.startTime)
    ) {
      nextMeeting = candidate;
    }
  }
 
  // 5. Meetings (S3): total, this week (the week starts on Sunday), and average length
  const meetings = await db.findMeetingsOfInstructor(user.universityId);
  const now = new Date();
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()); // last Sunday, 00:00
 
  let meetingsThisWeek = 0;
  let totalMinutes = 0;
  let finishedMeetings = 0;
  for (const m of meetings) {
    if (new Date(m.started_at) >= weekStart) meetingsThisWeek++;
    if (m.ended_at) {
      // Subtracting two dates gives milliseconds; / 60000 turns them into minutes
      totalMinutes += (new Date(m.ended_at) - new Date(m.started_at)) / 60000;
      finishedMeetings++;
    }
  }
  let avgMeetingMinutes = 0;
  if (finishedMeetings > 0) {
    avgMeetingMinutes = Math.round(totalMinutes / finishedMeetings);
  }
 
  return {
    pendingRequests,
    highPriorityPending,
    nextMeeting,
    upcomingSlots,
    stats: {
      meetingsThisWeek,
      meetingsTotal: meetings.length,
      avgMeetingMinutes,
      acceptanceRate,
      faqDeflections,
    },
  };
}
 