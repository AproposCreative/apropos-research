import type { Firestore } from 'firebase-admin/firestore';
import { getAdminDb, getAdminStorageBucket } from '@/lib/firebase-admin';
import { isFirestorePersistence } from '@/lib/accreditation/persistence/env';

export const COLLECTIONS = {
  agentControl: 'accreditationAgentControl',
  requests: 'accreditationRequests',
  approvals: 'accreditationApprovals',
  emailThreads: 'accreditationEmailThreads',
  audit: 'accreditationAudit',
  idCounter: 'accreditationIdCounter',
  accessPackages: 'accreditationAccessPackages',
  imapCursors: 'accreditationImapCursors',
  imapDedupe: 'accreditationImapDedupe',
  contactOverview: 'accreditationImapContactOverview',
  livChat: 'accreditationLivChat',
  leases: 'accreditationLeases',
  sendLocks: 'accreditationSendLocks',
} as const;

export const STORAGE_PREFIX = 'accreditation-attachments';

/** Production must fail visibly — never pretend ephemeral FS is durable. */
export function requireFirestore(): Firestore {
  const db = getAdminDb();
  if (!db) {
    throw new Error(
      'Firestore unavailable: accreditation operational state requires Firebase Admin in production (getAdminDb returned null)'
    );
  }
  return db;
}

export function requireStorageBucket(): NonNullable<ReturnType<typeof getAdminStorageBucket>> {
  if (isFirestorePersistence()) {
    const bucket = getAdminStorageBucket(
      process.env.FIREBASE_ADMIN_STORAGE_BUCKET ||
        process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
        undefined
    );
    if (!bucket) {
      throw new Error(
        'Firebase Storage unavailable: accreditation attachments require Admin Storage bucket in production'
      );
    }
    return bucket;
  }
  const bucket = getAdminStorageBucket();
  if (!bucket) {
    throw new Error('Firebase Storage unavailable');
  }
  return bucket;
}

function deepStripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => deepStripUndefined(item));
  }
  // Only recurse into plain objects; leave class instances (Date, FieldValue, …) untouched.
  if (value !== null && typeof value === 'object' && (value as object).constructor === Object) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = deepStripUndefined(v);
    }
    return out;
  }
  return value;
}

/**
 * Recursively removes `undefined` values from an object before writing to
 * Firestore, which rejects `undefined` (including inside nested objects and
 * array elements such as `messages[].resendEmailId`).
 */
export function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  return deepStripUndefined(obj) as T;
}

export async function getSignedDownloadUrl(
  storagePath: string,
  expiresMs = 15 * 60 * 1000
): Promise<string> {
  const bucket = requireStorageBucket();
  const objectPath = storagePath.startsWith(`${STORAGE_PREFIX}/`)
    ? storagePath
    : `${STORAGE_PREFIX}/${storagePath}`;
  const file = bucket.file(objectPath);
  const [url] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + expiresMs,
  });
  return url;
}
