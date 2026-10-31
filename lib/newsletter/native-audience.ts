import { createHash } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import type { NewsletterSignup } from './signup-details';

export type NativeNewsletterBinding = Readonly<{ projectID: string; appID: string }>;
// Candidate pin from the current local app identity. Apply only after runtime qualification.
// This reader does not add appID/UID to the existing authoritative record schema.
const REVIEWED_NATIVE_NEWSLETTER_BINDING: NativeNewsletterBinding | null = {
  projectID: 'apropos-magazine-6004a',
  appID: '1:817066738308:ios:a9ee127ef2f6404a7ab8d1',
};
const SUBSCRIBERS = 'reader_newsletter_subscribers';
const MAX_MEMBERS = 10000;
const PROJECT = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const APP = /^1:(\d{6,30}):ios:([a-f0-9]{6,64})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
type Environment = Record<string, string | undefined>;
type ReaderDB = {
  projectId: string;
  collection(name: string): { limit(count: number): { get(): Promise<{
    docs: Array<{ id: string; data(): unknown }>;
  }> } };
};
const fail = (): never => { throw new Error('native_newsletter_audience_unavailable'); };

// The installed SDK exposes the selected database project at runtime but not
// in its public TypeScript interface. Read only this value, validate it, and
// fail before any query if the SDK cannot yet identify the database.
export function nativeNewsletterDatabase(db: Pick<ReaderDB, 'collection'> | null): ReaderDB | null {
  if (!db) return null;
  try {
    const projectId: unknown = Reflect.get(db, 'projectId');
    if (typeof projectId !== 'string') return fail();
    return { projectId, collection: name => db.collection(name) };
  } catch { return fail(); }
}

export function nativeNewsletterSignup(id: string, value: unknown): NewsletterSignup {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const row = value as Record<string, unknown>;
  const fields = ['schemaVersion', 'email', 'source', 'consentVersion', 'requestID', 'subscribedAtMs'];
  if (Object.keys(row).some(key => !fields.includes(key)) || row.schemaVersion !== 1 ||
      typeof row.email !== 'string' || row.email !== row.email.trim().toLowerCase() ||
      row.email.length > 254 || !/^[^\s@\x00-\x1f\x7f]+@[^\s@\x00-\x1f\x7f]+\.[^\s@\x00-\x1f\x7f]+$/.test(row.email) ||
      id !== createHash('sha256').update(row.email).digest('hex') ||
      row.source !== 'ios-onboarding' || row.consentVersion !== 'apropos-newsletter-v1' ||
      typeof row.requestID !== 'string' || !UUID.test(row.requestID) ||
      typeof row.subscribedAtMs !== 'number' || !Number.isSafeInteger(row.subscribedAtMs) || row.subscribedAtMs <= 0) return fail();
  const date = new Date(row.subscribedAtMs);
  return { email: row.email, signedUpAt: Number.isFinite(date.getTime()) ? date.toISOString() : null };
}

// Dependency injection is for hermetic checks; the production wrapper below
// binds this to the existing default Admin database and the reviewed identity.
export async function readNativeNewsletterAudience(environment: Environment,
  binding: NativeNewsletterBinding | null, getDB: () => ReaderDB | null
): Promise<{ enabled: boolean; signups: NewsletterSignup[] }> {
  if (environment.READER_NEWSLETTER_ENABLED !== 'true') return { enabled: false, signups: [] };
  if (!binding || !PROJECT.test(binding.projectID) || !APP.test(binding.appID) ||
      environment.READER_NEWSLETTER_AUDIENCE_REVIEWED !== 'true' ||
      environment.READER_NEWSLETTER_SUPPRESSION_REVIEWED !== 'true' ||
      environment.READER_NEWSLETTER_SOURCE_KIND !== 'research' ||
      environment.READER_NEWSLETTER_APP_ID !== binding.appID ||
      environment.READER_NEWSLETTER_AUDIENCE_PROJECT_ID !== binding.projectID ||
      environment.READER_NEWSLETTER_SUPPRESSION_PROJECT_ID !== binding.projectID) return fail();
  try {
    const db = getDB();
    if (!db || db.projectId !== binding.projectID) return fail();
    // Bounded complete read. Cap+1 detects overflow; never silently truncate.
    const snapshot = await db.collection(SUBSCRIBERS).limit(MAX_MEMBERS + 1).get();
    if (!Array.isArray(snapshot.docs) || snapshot.docs.length > MAX_MEMBERS) return fail();
    const ids = new Set<string>();
    const signups = snapshot.docs.map(doc => {
      if (typeof doc.id !== 'string' || ids.has(doc.id)) return fail();
      ids.add(doc.id);
      return nativeNewsletterSignup(doc.id, doc.data());
    });
    return { enabled: true, signups };
  } catch { return fail(); }
}

export function readNativeNewsletterSignups() {
  return readNativeNewsletterAudience(process.env, REVIEWED_NATIVE_NEWSLETTER_BINDING,
    () => nativeNewsletterDatabase(getAdminDb()));
}
