'use client';

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import AproposAILoadingScreen from '@/components/AproposAILoadingScreen';
import { 
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail
} from 'firebase/auth';
import { getFirebaseAuth } from './firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signIn: async () => {},
  signUp: async () => {},
  resetPassword: async () => {},
  signInWithGoogle: async () => {},
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

/** Mindst så længe vises AI-boot (logo + sort), så SVG og baggrund når at føles færdige. */
const MIN_AI_BOOT_MS = 2000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiBootOpen, setAiBootOpen] = useState(false);
  const aiBootStartRef = useRef<number | null>(null);
  const wasOnAiRef = useRef(false);
  const [loaderMounted, setLoaderMounted] = useState(false);
  const isAiRoute = pathname?.startsWith('/ai') ?? false;
  const bootActive = loading || aiBootOpen;

  useLayoutEffect(() => {
    if (!isAiRoute) {
      setLoaderMounted(false);
      return;
    }
    if (bootActive) setLoaderMounted(true);
  }, [isAiRoute, bootActive]);

  useEffect(() => {
    if (!isAiRoute) {
      wasOnAiRef.current = false;
      setAiBootOpen(false);
      aiBootStartRef.current = null;
      return;
    }
    if (!wasOnAiRef.current) {
      wasOnAiRef.current = true;
      aiBootStartRef.current = Date.now();
      setAiBootOpen(true);
    }
  }, [isAiRoute]);

  useEffect(() => {
    if (!isAiRoute || loading) return;
    const started = aiBootStartRef.current ?? Date.now();
    const elapsed = Date.now() - started;
    const remaining = Math.max(0, MIN_AI_BOOT_MS - elapsed);
    const id = window.setTimeout(() => {
      setAiBootOpen(false);
      aiBootStartRef.current = null;
    }, remaining);
    return () => clearTimeout(id);
  }, [isAiRoute, loading]);

  useEffect(() => {
    const firebaseAuth = getFirebaseAuth();
    if (!firebaseAuth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // Attach Firebase ID token to all same-origin /api/* fetches (middleware auth gate).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;

      const isLocalApi =
        url.startsWith('/api/') ||
        (url.startsWith(window.location.origin) && url.includes('/api/'));

      if (!isLocalApi) {
        return originalFetch(input, init);
      }

      const auth = getFirebaseAuth();
      const currentUser = auth?.currentUser;
      if (!currentUser) {
        return originalFetch(input, init);
      }

      try {
        const token = await currentUser.getIdToken();
        const headers = new Headers(init?.headers);
        if (!headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${token}`);
        }
        return originalFetch(input, { ...init, headers });
      } catch {
        return originalFetch(input, init);
      }
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const firebaseAuth = getFirebaseAuth();
    if (!firebaseAuth) throw new Error('Firebase not initialized');
    await signInWithEmailAndPassword(firebaseAuth, email, password);
  };

  const signUp = async (email: string, password: string) => {
    const firebaseAuth = getFirebaseAuth();
    if (!firebaseAuth) throw new Error('Firebase not initialized');
    await createUserWithEmailAndPassword(firebaseAuth, email, password);
  };

  const signInWithGoogle = async () => {
    const firebaseAuth = getFirebaseAuth();
    if (!firebaseAuth) throw new Error('Firebase not initialized');
    const provider = new GoogleAuthProvider();
    await signInWithPopup(firebaseAuth, provider);
  };

  const resetPassword = async (email: string) => {
    const firebaseAuth = getFirebaseAuth();
    if (!firebaseAuth) throw new Error('Firebase not initialized');
    await sendPasswordResetEmail(firebaseAuth, email);
  };

  const logout = async () => {
    const firebaseAuth = getFirebaseAuth();
    if (!firebaseAuth) throw new Error('Firebase not initialized');
    await signOut(firebaseAuth);
  };

  const value = {
    user,
    loading,
    signIn,
    signUp,
    resetPassword,
    signInWithGoogle,
    logout,
  };

  const showAiBootLayer = isAiRoute && loaderMounted;
  const showChildren = !loading && (!isAiRoute || !aiBootOpen);

  return (
    <AuthContext.Provider value={value}>
      {showAiBootLayer ? (
        <AproposAILoadingScreen
          active={bootActive}
          onExited={() => setLoaderMounted(false)}
        />
      ) : null}
      {showChildren ? children : null}
    </AuthContext.Provider>
  );
}
