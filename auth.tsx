import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';
import type { SelfUser } from './types';

interface AuthState {
  user: SelfUser | null;
  loading: boolean;
  setUser: (u: SelfUser | null) => void;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SelfUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let dead = false;
    api
      .get<{ user: SelfUser | null }>('/api/me')
      .then((d) => !dead && setUser(d.user))
      .catch(() => !dead && setUser(null))
      .finally(() => !dead && setLoading(false));
    return () => {
      dead = true;
    };
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout');
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(() => ({ user, loading, setUser, logout }), [user, loading, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
