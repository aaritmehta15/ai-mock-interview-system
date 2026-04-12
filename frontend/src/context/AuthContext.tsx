import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { setAuthToken, clearAuthToken } from '../lib/api';

interface AuthCtx {
  user: User | null;
  loading: boolean;
  accessToken: string | null;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]               = useState<User | null>(null);
  const [loading, setLoading]         = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const idToken = await u.getIdToken();
        setAuthToken(idToken);
        // Store Google OAuth access token (needed for Gmail)
        const stored = sessionStorage.getItem('google_access_token');
        if (stored) setAccessToken(stored);
      } else {
        clearAuthToken();
        setAccessToken(null);
      }
      setLoading(false);
    });
  }, []);

  const signInWithGoogle = React.useCallback(async () => {
    const result = await signInWithPopup(auth, googleProvider);
    try {
      const oauthToken = (result as any)._tokenResponse?.oauthAccessToken;
      if (oauthToken) {
        sessionStorage.setItem('google_access_token', oauthToken);
        setAccessToken(oauthToken);
      }
    } catch {}
  }, []);

  const logout = React.useCallback(async () => {
    await signOut(auth);
    sessionStorage.removeItem('google_access_token');
  }, []);

  const value = React.useMemo(() => ({
    user,
    loading,
    accessToken,
    signInWithGoogle,
    logout
  }), [user, loading, accessToken, signInWithGoogle, logout]);

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
