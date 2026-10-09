import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { authApi, setToken, clearToken, getToken } from './api';
import type { Profile } from './types';

interface AuthContextValue {
  isAuthenticated: boolean;
  profile: Profile | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signUp: (username: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(!!getToken());
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const p = await authApi.getProfile();
        if (!cancelled) {
          setProfile(p);
          setIsAuthenticated(true);
        }
      } catch {
        clearToken();
        if (!cancelled) setIsAuthenticated(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const refreshProfile = async () => {
    if (!getToken()) return;
    try {
      const p = await authApi.getProfile();
      setProfile(p);
    } catch (err) {
      console.error('Failed to refresh profile:', err);
    }
  };

  const signIn = async (username: string, password: string) => {
    const { token } = await authApi.login(username, password);
    setToken(token);
    setIsAuthenticated(true);
    const p = await authApi.getProfile();
    setProfile(p);
  };

  const signUp = async (username: string, email: string, password: string) => {
    await authApi.register(username, email, password);
  };

  const signOut = async () => {
    clearToken();
    setProfile(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, profile, loading, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
