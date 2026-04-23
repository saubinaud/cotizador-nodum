import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../config/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('nodum_token'));
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('nodum_user');
    if (!saved || saved === 'undefined') return null;
    try { return JSON.parse(saved); } catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => {
          if (!r.ok) throw new Error('Invalid token');
          return r.json();
        })
        .then((data) => {
          const u = data.data?.user || data.data || data;
          setUser(u);
          localStorage.setItem('nodum_user', JSON.stringify(u));
        })
        .catch(() => {
          logout();
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Credenciales incorrectas');
    }
    const data = await res.json();
    const t = data.data?.token || data.token;
    const u = data.data?.user || data.user;
    setToken(t);
    setUser(u);
    localStorage.setItem('nodum_token', t);
    localStorage.setItem('nodum_user', JSON.stringify(u));
    return u;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('nodum_token');
    localStorage.removeItem('nodum_user');
  }, []);

  return (
    <AuthContext.Provider value={{ token, user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
