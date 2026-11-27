// Shared fetch wrapper: adds the login token, parses { data } / { error } responses, throws readable errors
// With VITE_USE_MOCKS=true every call is answered by mocks.js instead of the backend (same response shapes).
import { mockRequest } from './mocks';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';
const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';
const TOKEN_KEY = 'officeours.token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: token => (token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY)),
};

// Error with the backend's { code, message, details } so pages can show field errors
export class ApiError extends Error {
  constructor(status, { code = 'ERROR', message = 'Something went wrong. Please try again.', details = [] } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const toQuery = params => {
  const clean = Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return clean.length ? `?${new URLSearchParams(clean)}` : '';
};

async function request(method, path, { params, body } = {}) {
  const url = path + toQuery(params);
  const token = tokenStore.get();
  let status;
  let json;

  if (USE_MOCKS) {
    ({ status, json } = await mockRequest(method, url, body, token));
  } else {
    let res;
    try {
      res = await fetch(BASE_URL + url, {
        method,
        headers: {
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      window.dispatchEvent(new Event('officeours:server-down')); // shows the "can't reach the server" page
      throw new ApiError(0, { code: 'NETWORK_ERROR', message: 'Cannot reach the server. Check that the backend is running.' });
    }
    status = res.status;
    json = status === 204 ? null : await res.json().catch(() => null);
    // A gateway error without our { error } body means the API itself is down (an AI 502 has a body and is handled by the page)
    if ([502, 503, 504].includes(status) && !json?.error) window.dispatchEvent(new Event('officeours:server-down'));
  }

  if (status === 401 && token) window.dispatchEvent(new Event('officeours:logout'));
  if (status >= 400) throw new ApiError(status, json?.error);
  return json; // { data } or { data, meta } or null (204)
}

// true when the API answers its health check (used to reconnect after an outage)
export async function pingServer() {
  if (USE_MOCKS) return true;
  try {
    const res = await fetch(`${BASE_URL}/health`, { cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

export const http = {
  get: (path, params) => request('GET', path, { params }),
  post: (path, body) => request('POST', path, { body }),
  patch: (path, body) => request('PATCH', path, { body }),
  del: path => request('DELETE', path),
};
