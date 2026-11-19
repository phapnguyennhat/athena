import * as SecureStore from 'expo-secure-store';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import type { TokenPair } from '@/lib/auth-api';

const ACCESS_KEY = 'athena.accessToken';
const REFRESH_KEY = 'athena.refreshToken';

type Session = TokenPair;

type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

type AuthContextValue = {
  status: AuthStatus;
  session: Session | null;
  setSession: (pair: TokenPair) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function readItem(key: string) {
  if (Platform.OS === 'web') {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

async function writeItem(key: string, value: string | null) {
  if (Platform.OS === 'web') {
    try {
      if (value === null) globalThis.localStorage?.removeItem(key);
      else globalThis.localStorage?.setItem(key, value);
    } catch {
      /* ignore quota / private mode */
    }
    return;
  }
  if (value === null) await SecureStore.deleteItemAsync(key);
  else await SecureStore.setItemAsync(key, value);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [accessToken, refreshToken] = await Promise.all([readItem(ACCESS_KEY), readItem(REFRESH_KEY)]);
      if (cancelled) return;
      if (accessToken && refreshToken) {
        setSessionState({ accessToken, refreshToken, expiresIn: 0 });
        setStatus('signedIn');
      } else {
        setStatus('signedOut');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setSession = async (pair: TokenPair) => {
    await Promise.all([writeItem(ACCESS_KEY, pair.accessToken), writeItem(REFRESH_KEY, pair.refreshToken)]);
    setSessionState(pair);
    setStatus('signedIn');
  };

  const signOut = async () => {
    await Promise.all([writeItem(ACCESS_KEY, null), writeItem(REFRESH_KEY, null)]);
    setSessionState(null);
    setStatus('signedOut');
  };

  return (
    <AuthContext.Provider value={{ status, session, setSession, signOut }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const value = use(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}

/** @deprecated Prefer useAuth().status — kept for any sync call sites during migration. */
export const isSignedIn = false;
