// [S2] Holds the logged-in user, role and the token returned by the backend /auth/login (session storage, #B)
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as authApi from '@/api/auth';
import { tokenStore } from '@/api/http';

const AuthContext = createContext(null);

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(tokenStore.get())); // restoring a saved session

  const clear = useCallback(() => {
    tokenStore.set(null);
    setUser(null);
  }, []);

  // On refresh: if a token is saved, ask the backend who we are
  useEffect(() => {
    if (!tokenStore.get()) return;
    authApi.getMe()
      .then(res => setUser(res.data))
      .catch(clear)
      .finally(() => setLoading(false));
  }, [clear]);

  // http.js fires this when the backend answers 401 (expired token)
  useEffect(() => {
    window.addEventListener('officeours:logout', clear);
    return () => window.removeEventListener('officeours:logout', clear);
  }, [clear]);

  const login = useCallback(async (universityId, password) => {
    const res = await authApi.login(universityId, password);
    tokenStore.set(res.data.token);
    setUser(res.data.user);
    return res.data.user;
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout().catch(() => {});
    clear();
  }, [clear]);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

// Where each role lands after login
export const homeFor = user => (user?.role === 'instructor' ? '/instructor/dashboard' : '/student/slots');
