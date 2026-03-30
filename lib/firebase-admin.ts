/**
 * Firebase Admin SDK for server-side operations (API routes).
 *
 * The client-side Firebase SDK (`lib/firebase.ts`) returns null for `db` on
 * the server, so any Route Handler that needs Firestore must use Admin.
 *
 * Required env vars (all optional — features degrade gracefully):
 *   FIREBASE_ADMIN_PROJECT_ID
 *   FIREBASE_ADMIN_CLIENT_EMAIL
 *   FIREBASE_ADMIN_PRIVATE_KEY
 *
 * If only NEXT_PUBLIC_FIREBASE_PROJECT_ID is available the Admin SDK will
 * initialise with applicationDefault() credentials, which works when
 * running under `gcloud auth application-default login`.
 */

import { initializeApp, getApps, cert, applicationDefault, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

let _adminApp: App | null = null;
let _adminDb: Firestore | null = null;

function resolveProjectId(): string | undefined {
  return (
    process.env.FIREBASE_ADMIN_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    undefined
  );
}

function initAdmin(): App | null {
  if (_adminApp) return _adminApp;

  const existing = getApps();
  if (existing.length > 0) {
    _adminApp = existing[0]!;
    return _adminApp;
  }

  const projectId = resolveProjectId();
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  try {
    if (projectId && clientEmail && privateKey) {
      _adminApp = initializeApp({
        credential: cert({ projectId, clientEmail, privateKey }),
      });
    } else if (projectId) {
      _adminApp = initializeApp({
        credential: applicationDefault(),
        projectId,
      });
    } else {
      console.warn('[firebase-admin] No project ID found — Admin SDK not initialised.');
      return null;
    }
    return _adminApp;
  } catch (err) {
    console.error('[firebase-admin] Initialisation failed:', err);
    return null;
  }
}

export function getAdminDb(): Firestore | null {
  if (_adminDb) return _adminDb;
  const app = initAdmin();
  if (!app) return null;
  _adminDb = getFirestore(app);
  return _adminDb;
}
