import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Lazy initialization - only initialize when needed
let _app: ReturnType<typeof getApp> | null = null;
let _auth: ReturnType<typeof getAuth> | null = null;
let _db: ReturnType<typeof getFirestore> | null = null;
let _storage: ReturnType<typeof getStorage> | null = null;

function getFirebaseConfig() {
  // Use process.env directly to avoid SSR issues with env module
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
  };
}

function initializeFirebase() {
  // Return existing app if already initialized
  if (getApps().length > 0) {
    const existingApp = getApp();
    if (!_app) {
      _app = existingApp;
      _auth = getAuth(_app);
      _db = getFirestore(_app);
      _storage = getStorage(_app);
    }
    return;
  }

  const config = getFirebaseConfig();
  
  // Only initialize if we have required config
  if (!config.apiKey || !config.projectId) {
    if (typeof window !== 'undefined') {
      console.warn('Firebase config is missing. Some features may not work.');
    }
    return;
  }

  try {
    _app = initializeApp(config);
    _auth = getAuth(_app);
    _db = getFirestore(_app);
    _storage = getStorage(_app);
  } catch (error) {
    console.error('Failed to initialize Firebase:', error);
  }
}

// Getter function for client-side auth - only initializes on client-side
export function getFirebaseAuth() {
  // Only initialize on client-side
  if (typeof window === 'undefined') {
    return null;
  }
  
  // Initialize if not already done
  if (!_auth) {
    initializeFirebase();
  }
  
  return _auth;
}

// Export for backward compatibility (lazy getters)
// These will be null on server-side, but will initialize on client-side when accessed
export const app = typeof window !== 'undefined' ? (() => { initializeFirebase(); return _app; })() : null;
export const auth = typeof window !== 'undefined' ? (() => { initializeFirebase(); return _auth; })() : null;
export const db = typeof window !== 'undefined' ? (() => { initializeFirebase(); return _db; })() : null;
export const storage = typeof window !== 'undefined' ? (() => { initializeFirebase(); return _storage; })() : null;
