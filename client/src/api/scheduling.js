// [S1] Calls to S1 endpoints: modules, instructors, slots, holidays, dashboard
import { http } from './http';

// Lookups for filters
export const getModules = () => http.get('/modules');
export const getInstructors = params => http.get('/instructors', params); // { moduleId }

// Slots (#1 browse/search, #8 create/edit/delete)
export const getSlots = params => http.get('/slots', params); // { instructorId, moduleId, from, to, q, status, page, limit }
export const getSlot = id => http.get(`/slots/${id}`);
export const createSlot = slot => http.post('/slots', slot);
export const updateSlot = (id, changes) => http.patch(`/slots/${id}`, changes);
export const deleteSlot = id => http.del(`/slots/${id}`);

// Holidays (#15) + instructor dashboard (#10)
export const getHolidays = year => http.get('/holidays', { year });
export const getDashboard = () => http.get('/dashboard');
