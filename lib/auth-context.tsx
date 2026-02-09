'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
