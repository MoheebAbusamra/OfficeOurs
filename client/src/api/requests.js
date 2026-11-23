// [S2] Calls to S2 endpoints: requests, status, inbox, FAQs, AI FAQ check
import { http } from './http';

// AI check before submitting (#13)
export const checkFaq = ({ slotId, title, description }) => http.post('/requests/faq-check', { slotId, title, description });

// Requests: student = my requests, instructor = inbox (#5, #6, #9)
export const getRequests = params => http.get('/requests', params); // { status, priority, slotId, moduleId, unopened, q, sort, page, limit }
export const getRequest = id => http.get(`/requests/${id}`);
export const createRequest = request => http.post('/requests', request);
export const updateRequest = (id, changes) => http.patch(`/requests/${id}`, changes); // student edit while unopened (#2)
export const setRequestStatus = (id, status, reason) => http.patch(`/requests/${id}/status`, { status, reason }); // confirm / reject / cancel

// FAQ list used by the AI check
export const getFaqs = params => http.get('/faqs', params); // { instructorId, moduleId, q }
export const createFaq = faq => http.post('/faqs', faq);
export const updateFaq = (id, changes) => http.patch(`/faqs/${id}`, changes);
export const deleteFaq = id => http.del(`/faqs/${id}`);
