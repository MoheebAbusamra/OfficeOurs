// Calls to the queue endpoints: queue position, call next/skip/done, check-in, history + notes
import { http } from './http';

// Queue (#7 student position, #11 instructor controls)
export const getQueuePosition = requestId => http.get(`/queue/position/${requestId}`);
export const getSlotQueue = slotId => http.get(`/queue/slots/${slotId}`);
export const callNext = slotId => http.post(`/queue/slots/${slotId}/next`);
export const skipEntry = (entryId, reason) => http.patch(`/queue/entries/${entryId}/skip`, { reason });
export const closeQueue = slotId => http.post(`/queue/slots/${slotId}/close`);

// QR check-in page (#12), public: the token in the QR is the secret
export const getCheckIn = token => http.get(`/check-in/${token}`);
export const checkIn = token => http.post(`/check-in/${token}`);

// Meeting history + notes (#4)
export const getMeetings = params => http.get('/meetings', params); // { q, moduleId, from, to, page, limit }
export const getMeeting = id => http.get(`/meetings/${id}`);
export const saveMeetingNotes = (id, notes) => http.patch(`/meetings/${id}/notes`, { notes });
