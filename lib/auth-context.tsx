'use client';

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import AproposAILoadingScreen from '@/components/AproposAILoadingScreen';
import { useQueryClient } from '@tanstack/react-query';
import { toolCatalogueQuery } from './tool-catalogue-client';
import { 
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onIdTokenChanged,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { getFirebaseAuth } from './firebase';
import { isSameOriginApi, requestHeaders } from './auth-policy';
import { createEmailVerificationActions } from './email-verification';
import { requestAuthMail } from './auth-mail-client';
import { registerEditorialAccount } from './editorial-signup';
import { NO_CAPABILITIES, isOwnerPage, type EditorialCapabilities } from './editorial-capabilities';
import { autoSaveService } from './auto-save-service';
import { ACCESS_UNAVAILABLE_MESSAGE, requireAllowedUser } from './auth-access-client';

interface AuthContextType {
  capabilities: EditorialCapabilities;
  user: User | null;
  loading: boolean;
  accessError: string;
  verificationEmail: string | null;
  sendVerification: () => Promise<void>;
  checkVerification: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  capabilities: NO_CAPABILITIES,
  user: null,
  loading: true,
  accessError: '',
  verificationEmail: null,
  sendVerification: async () => {},
  checkVerification: async () => {},
  signIn: async () => {},
  signUp: async () => {},
  resetPassword: async () => {},
  signInWithGoogle: async () => {},
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const connectionOnly = pathname === '/connect/chatgpt';
  const [user, setUser] = useState<User | null>(null);
  const [capabilities, setCapabilities] = useState<EditorialCapabilities>(NO_CAPABILITIES);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState('');
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [{ sendVerification, checkVerification }] = useState(() =>
    createEmailVerificationActions(() => getFirebaseAuth()?.currentUser ?? null, async user => { await requireAllowedUser(user); }));
  const [loaderMounted, setLoaderMounted] = useState(false);
  const isAiRoute = pathname?.startsWith('/ai') ?? false;
  const bootActive = loading;

  useLayoutEffect(() => {
    if (!isAiRoute) {
      setLoaderMounted(false);
      return;
    }
    if (bootActive) setLoaderMounted(true);
  }, [isAiRoute, bootActive]);

  useEffect(() => {
    const firebaseAuth = getFirebaseAuth();
    if (!firebaseAuth) {
      setLoading(false);
      return;
    }

    let generation = 0;
    let acceptedUid: string | null = null;
    const check = async (candidate: User | null, background = false) => {
      const current = ++generation;
      const sameAccount = Boolean(candidate && candidate.uid === acceptedUid);
      // Rechecking a token/focused tab must not unmount the editor and lose work.
      // Every API request still independently revalidates current server access.
      if (!sameAccount) {
        acceptedUid = null;
        autoSaveService.setOwner(null);
        setUser(null);
        setCapabilities(NO_CAPABILITIES);
      }
      setVerificationEmail(candidate && !candidate.emailVerified ? candidate.email : null);
      if (!candidate) { setLoading(false); return; }
      // Password managers and focusing an input can refocus the window. A saved,
      // rejected session must not unmount the login form during that recheck.
      // We still clear stale identity/capabilities above and revalidate access.
      if (!sameAccount && !background) setLoading(true);
      try {
        const rights = await requireAllowedUser(candidate, connectionOnly);
        if (current !== generation) return;
        // Resolve the shared menu while the existing auth loader is visible.
        // Focus/token refresh never blocks or unmounts a working editor.
        if (!sameAccount && pathnameRef.current === '/ai') {
          await queryClient.fetchQuery(toolCatalogueQuery(candidate, rights.owner)).catch(() => undefined);
          if (current !== generation) return;
        }
        setAccessError('');
        acceptedUid = candidate.uid;
        autoSaveService.setOwner(candidate.uid);
        setCapabilities(rights);
        setUser(candidate);
      } catch (error) {
        if (current !== generation) return;
        acceptedUid = null;
        autoSaveService.setOwner(null);
        setUser(null);
        setCapabilities(NO_CAPABILITIES);
        setAccessError(error instanceof Error ? error.message : ACCESS_UNAVAILABLE_MESSAGE);
      } finally { if (current === generation) setLoading(false); }
    };
    const unsubscribe = onIdTokenChanged(firebaseAuth, check);
    const recheck = () => { void check(firebaseAuth.currentUser, true); };
    window.addEventListener('focus', recheck);
    return () => { generation++; unsubscribe(); window.removeEventListener('focus', recheck); };
  }, [connectionOnly, queryClient]);

  // Attach Firebase ID token to all same-origin /api/* fetches (middleware auth gate).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!isSameOriginApi(input, window.location.origin)) {
        return originalFetch(input, init);
      }

      const auth = getFirebaseAuth();
      const currentUser = auth?.currentUser;
      if (!currentUser) {
        return originalFetch(input, init);
      }

      try {
        const headers = requestHeaders(input, init);
        if (!headers.has('Authorization')) {
          const token = await currentUser.getIdToken();
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
    const result = await signInWithEmailAndPassword(firebaseAuth, email, password);
    await requireAllowedUser(result.user, connectionOnly);
  };

  const signUp = async (email: string, password: string) => {
    const firebaseAuth = getFirebaseAuth();
    if (!firebaseAuth) throw new Error('Firebase not initialized');
    await registerEditorialAccount(email, password, {
      create: (address, secret) => createUserWithEmailAndPassword(firebaseAuth, address, secret),
      current: () => firebaseAuth.currentUser,
      send: token => requestAuthMail({ kind: 'verify' }, token),
    });
  };

  const signInWithGoogle = async () => {
    const firebaseAuth = getFirebaseAuth();
    if (!firebaseAuth) throw new Error('Firebase not initialized');
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(firebaseAuth, provider);
    await requireAllowedUser(result.user, connectionOnly);
  };

  const resetPassword = async (email: string) => {
    await requestAuthMail({ kind: 'reset', email });
  };

  const logout = async () => {
    const firebaseAuth = getFirebaseAuth();
    if (!firebaseAuth) throw new Error('Firebase not initialized');
    await signOut(firebaseAuth);
  };

  const value = {
    capabilities,
    user,
    loading,
    accessError,
    verificationEmail,
    sendVerification,
    checkVerification,
    signIn,
    signUp,
    resetPassword,
    signInWithGoogle,
    logout,
  };

  const showAiBootLayer = isAiRoute && loaderMounted;
  // The public connection page owns its loading/login/error UI. Keep its dark
  // shell mounted during access checks instead of rendering an empty document.
  const showChildren = pathname === '/connect/chatgpt' || pathname === '/connect/chatgpt/welcome' || !loading;

  return (
    <AuthContext.Provider value={value}>
      {showAiBootLayer ? (
        <AproposAILoadingScreen
          active={bootActive}
          onExited={() => setLoaderMounted(false)}
        />
      ) : null}
      {showChildren ? (user && !capabilities.owner && isOwnerPage(pathname || '')
        ? <main className="p-8 text-white"><p>Denne funktion er kun tilgængelig for Frederik.</p><a href="/ai">Til mit arbejdsrum</a></main>
        : <div key={user?.uid || 'signed-out'} className="contents">{children}</div>) : null}
    </AuthContext.Provider>
  );
}
