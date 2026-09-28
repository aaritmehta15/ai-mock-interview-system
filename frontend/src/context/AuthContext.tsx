import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { setAuthToken, clearAuthToken } from '../lib/api';

export interface FastPassUser {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  isFastPass: boolean;
}

export type AppUser = User | FastPassUser;

interface AuthCtx {
  user: AppUser | null;
  loading: boolean;
  accessToken: string | null;
  signInWithGoogle: () => Promise<void>;
  fastPassLogin: (roleName?: string) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx | null>(null);

const FAST_PASS_STORAGE_KEY = 'apex_fast_pass_user';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(() => {
    try {
      const stored = sessionStorage.getItem(FAST_PASS_STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch {
      // fallback
    }
    return null;
  });
  const [loading, setLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        sessionStorage.removeItem(FAST_PASS_STORAGE_KEY);
        const oauthToken = sessionStorage.getItem('google_access_token');
        if (oauthToken) {
          setAccessToken(oauthToken);
          setAuthToken(oauthToken);
        } else {
          const idToken = await u.getIdToken();
          setAuthToken(idToken);
        }
      } else {
        // If not a fast-pass user, clear state
        const stored = sessionStorage.getItem(FAST_PASS_STORAGE_KEY);
        if (!stored) {
          setUser(null);
          clearAuthToken();
          setAccessToken(null);
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = React.useCallback(async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const oauthToken = (result as any)._tokenResponse?.oauthAccessToken;
      if (oauthToken) {
        sessionStorage.setItem('google_access_token', oauthToken);
        setAccessToken(oauthToken);
        setAuthToken(oauthToken);
      }
    } catch (e) {
      console.error("Sign in error:", e);
    }
  }, []);

  const fastPassLogin = React.useCallback((roleName: string = 'Staff Candidate') => {
    const demoUser: FastPassUser = {
      uid: `demo_user_${Date.now()}`,
      displayName: roleName,
      email: 'candidate@apex-mock.dev',
      photoURL: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=faces',
      isFastPass: true,
    };
    sessionStorage.setItem(FAST_PASS_STORAGE_KEY, JSON.stringify(demoUser));
    setUser(demoUser);
    setAuthToken('demo-fast-pass-token');
    setLoading(false);
  }, []);

  const logout = React.useCallback(async () => {
    sessionStorage.removeItem(FAST_PASS_STORAGE_KEY);
    sessionStorage.removeItem('google_access_token');
    clearAuthToken();
    setUser(null);
    try {
      await signOut(auth);
    } catch {
      // ignore
    }
  }, []);

  const value = React.useMemo(() => ({
    user,
    loading,
    accessToken,
    signInWithGoogle,
    fastPassLogin,
    logout,
  }), [user, loading, accessToken, signInWithGoogle, fastPassLogin, logout]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
