import { useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config/api';

export function useApi() {
  const { token, logout } = useAuth();

  const request = useCallback(
    async (method, path, body) => {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const opts = { method, headers };
      if (body && method !== 'GET') opts.body = JSON.stringify(body);

      const res = await fetch(`${API_BASE}${path}`, opts);

      if (res.status === 401) {
        logout();
        throw new Error('Sesion expirada');
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Error ${res.status}`);
      }

      if (res.status === 204) return null;
      return res.json();
    },
    [token, logout]
  );

  const get = useCallback((path) => request('GET', path), [request]);
  const post = useCallback((path, body) => request('POST', path, body), [request]);
  const put = useCallback((path, body) => request('PUT', path, body), [request]);
  const del = useCallback((path) => request('DELETE', path), [request]);

  return { get, post, put, del };
}
