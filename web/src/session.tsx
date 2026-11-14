import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, getToken, setToken, type Me } from './lib/api';

interface SessionCtx {
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<void>;
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<SessionCtx>(null as unknown as SessionCtx);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setMe(null);
      setLoading(false);
      return;
    }
    try {
      setMe(await api<Me>('/api/auth/me'));
    } catch (err) {
      if ((err as { status?: number }).status === 401) setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onLogout = () => setMe(null);
    window.addEventListener('sy:logout', onLogout);
    return () => window.removeEventListener('sy:logout', onLogout);
  }, [refresh]);

  const login = useCallback(
    async (token: string) => {
      setToken(token);
      await refresh();
    },
    [refresh],
  );

  const logout = useCallback(async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setToken(null);
    setMe(null);
  }, []);

  return <Ctx.Provider value={{ me, loading, refresh, login, logout }}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);

export function useTheme(): [boolean, () => void] {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('sy.theme', next ? 'dark' : 'light');
    } catch {
      /* ignore */
    }
    setDark(next);
  };
  return [dark, toggle];
}

export function initTheme() {
  let pref: string | null = null;
  try {
    pref = localStorage.getItem('sy.theme');
  } catch {
    /* ignore */
  }
  const dark = pref ? pref === 'dark' : window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', !!dark);
}
