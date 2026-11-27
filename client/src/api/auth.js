// Calls to the backend auth endpoints: register (student ID), login, logout, current user (#A)
import { http } from './http';

export const register = (universityId, password) => http.post('/auth/register', { universityId, password });
export const login = (universityId, password) => http.post('/auth/login', { universityId, password });
export const logout = () => http.post('/auth/logout');
export const getMe = () => http.get('/auth/me');
