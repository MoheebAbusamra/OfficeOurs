// [S1] Business rules: no overlapping slots, no slots on holidays/weekends, clash ranking, dashboard stats, notifications
import { AppError } from '../../shared/errors.js';
import * as db from './db.js';
 
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
 