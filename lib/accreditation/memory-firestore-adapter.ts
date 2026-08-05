import { getAdminDb } from '@/lib/firebase-admin';
import { sanitizeLivOutput } from '@/lib/accreditation/sanitize';
import type { MemoryBackend } from '@/lib/accreditation/memory-backend';
import {
  emailDomain,
  mergeRecentSubjects,
  normalizeContactEmail,
  type ContactCategory,
  type ContactProfile,
  type ContactRelationshipStatus,
  type ConversationSummary,
  type MemoryHealth,
  type MemorySyncMeta,
  type UpsertContactProfileInput,
} from '@/lib/accreditation/memory-types';

export const ACCREDITATION_CONTACTS_COLLECTION = 'accreditationContacts';
export const ACCREDITATION_SUMMARIES_COLLECTION = 'accreditationConversationSummaries';
export const ACCREDITATION_MEMORY_META_COLLECTION = 'accreditationMemoryMeta';
export const MAILBOX_ARCHIVE_SYNC_DOC = 'mailbox_archive';

function nowIso(): string {
  return new Date().toISOString();
}

function fromDoc(data: Record<string, unknown>, email: string): ContactProfile {
  return {
    email: normalizeContactEmail(email),
    name: typeof data.name === 'string' ? data.name : undefined,
    companyHint: typeof data.companyHint === 'string' ? data.companyHint : undefined,
    domain:
      typeof data.domain === 'string' ? data.domain : emailDomain(email) || undefined,
    roleHint: typeof data.roleHint === 'string' ? data.roleHint : undefined,
    relationshipStatus: (typeof data.relationshipStatus === 'string'
      ? data.relationshipStatus
      : 'unknown') as ContactRelationshipStatus,
    category: (typeof data.category === 'string'
      ? data.category
      : 'unknown') as ContactCategory,
    sourceMailbox: typeof data.sourceMailbox === 'string' ? data.sourceMailbox : undefined,
    interactionCount: Number(data.interactionCount || 0),
    firstSeenAt: typeof data.firstSeenAt === 'string' ? data.firstSeenAt : nowIso(),
    lastSeenAt: typeof data.lastSeenAt === 'string' ? data.lastSeenAt : nowIso(),
    lastRequestId: typeof data.lastRequestId === 'string' ? data.lastRequestId : undefined,
    lastThreadId: typeof data.lastThreadId === 'string' ? data.lastThreadId : undefined,
    recentSubjects: Array.isArray(data.recentSubjects)
      ? data.recentSubjects.filter((s): s is string => typeof s === 'string').slice(0, 8)
      : [],
    notes: typeof data.notes === 'string' ? data.notes : undefined,
    importSource: typeof data.importSource === 'string' ? data.importSource : undefined,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : nowIso(),
  };
}

/**
 * Production Firestore adapter.
 * Fails visibly when Admin DB is unavailable — never pretends memory is durable.
 */
export function createFirestoreMemoryBackend(): MemoryBackend {
  function requireDb() {
    const db = getAdminDb();
    if (!db) {
      throw new Error(
        'Firestore unavailable: accreditation memory requires Firebase Admin in production (getAdminDb returned null)'
      );
    }
    return db;
  }

  return {
    async getContactProfile(email: string) {
      const db = requireDb();
      const id = normalizeContactEmail(email);
      if (!id.includes('@')) return undefined;
      const snap = await db.collection(ACCREDITATION_CONTACTS_COLLECTION).doc(id).get();
      if (!snap.exists) return undefined;
      return fromDoc(snap.data() || {}, id);
    },

    async upsertContactProfile(input: UpsertContactProfileInput) {
      const db = requireDb();
      const email = normalizeContactEmail(input.email);
      if (!email.includes('@')) {
        throw new Error('Contact profile requires a valid email');
      }
      const ref = db.collection(ACCREDITATION_CONTACTS_COLLECTION).doc(email);
      const prevSnap = await ref.get();
      const prev = prevSnap.exists ? fromDoc(prevSnap.data() || {}, email) : undefined;
      const ts = nowIso();
      const next: ContactProfile = {
        email,
        name: input.name || prev?.name,
        companyHint: input.companyHint || prev?.companyHint,
        domain: input.domain || prev?.domain || emailDomain(email),
        roleHint: input.roleHint || prev?.roleHint,
        relationshipStatus:
          input.relationshipStatus || prev?.relationshipStatus || 'unknown',
        category: input.category || prev?.category || 'unknown',
        sourceMailbox: input.sourceMailbox || prev?.sourceMailbox,
        interactionCount: input.preserveInteractionCount
          ? input.interactionCount ?? prev?.interactionCount ?? 0
          : (prev?.interactionCount || 0) + 1,
        firstSeenAt: input.firstSeenAt || prev?.firstSeenAt || ts,
        lastSeenAt: input.lastSeenAt || ts,
        lastRequestId: input.lastRequestId || prev?.lastRequestId,
        lastThreadId: input.lastThreadId || prev?.lastThreadId,
        recentSubjects: mergeRecentSubjects(prev?.recentSubjects, input.recentSubject),
        notes: input.notes
          ? sanitizeLivOutput(input.notes).slice(0, 400)
          : prev?.notes,
        importSource: input.importSource || prev?.importSource,
        updatedAt: ts,
      };

      // Strip undefined for Firestore
      const payload: Record<string, unknown> = { ...next };
      for (const [k, v] of Object.entries(payload)) {
        if (v === undefined) delete payload[k];
      }
      await ref.set(payload, { merge: true });
      return next;
    },

    async listContactProfiles() {
      const db = requireDb();
      const snap = await db.collection(ACCREDITATION_CONTACTS_COLLECTION).get();
      return snap.docs.map((d) => fromDoc(d.data(), d.id));
    },

    async getConversationSummary(requestId: string) {
      const db = requireDb();
      const id = requestId.trim().toUpperCase();
      if (!id) return undefined;
      const snap = await db.collection(ACCREDITATION_SUMMARIES_COLLECTION).doc(id).get();
      if (!snap.exists) return undefined;
      const data = snap.data() || {};
      return {
        requestId: id,
        threadId: typeof data.threadId === 'string' ? data.threadId : undefined,
        summary: typeof data.summary === 'string' ? data.summary : '',
        lastDirection:
          data.lastDirection === 'inbound' || data.lastDirection === 'outbound'
            ? data.lastDirection
            : undefined,
        updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : nowIso(),
      } satisfies ConversationSummary;
    },

    async upsertConversationSummary(input) {
      const db = requireDb();
      const requestId = input.requestId.trim().toUpperCase();
      const next: ConversationSummary = {
        requestId,
        threadId: input.threadId,
        summary: sanitizeLivOutput(input.summary).slice(0, 800),
        lastDirection: input.lastDirection,
        updatedAt: nowIso(),
      };
      const payload: Record<string, unknown> = { ...next };
      for (const [k, v] of Object.entries(payload)) {
        if (v === undefined) delete payload[k];
      }
      await db
        .collection(ACCREDITATION_SUMMARIES_COLLECTION)
        .doc(requestId)
        .set(payload, { merge: true });
      return next;
    },

    async getSyncMeta() {
      const db = requireDb();
      const snap = await db
        .collection(ACCREDITATION_MEMORY_META_COLLECTION)
        .doc(MAILBOX_ARCHIVE_SYNC_DOC)
        .get();
      if (!snap.exists) return null;
      const data = snap.data() || {};
      return {
        id: 'mailbox_archive' as const,
        lastSyncAt: String(data.lastSyncAt || ''),
        contactCount: Number(data.contactCount || 0),
        imported: Number(data.imported || 0),
        upserted: Number(data.upserted || 0),
        skipped: Number(data.skipped || 0),
        automatedCount: Number(data.automatedCount || 0),
        humanOrRoleCount: Number(data.humanOrRoleCount || 0),
      };
    },

    async setSyncMeta(meta) {
      const db = requireDb();
      const next: MemorySyncMeta = { id: 'mailbox_archive', ...meta };
      await db
        .collection(ACCREDITATION_MEMORY_META_COLLECTION)
        .doc(MAILBOX_ARCHIVE_SYNC_DOC)
        .set(next, { merge: true });
      return next;
    },

    async health(): Promise<MemoryHealth> {
      try {
        const db = getAdminDb();
        if (!db) {
          return {
            backend: 'firestore',
            ok: false,
            label: 'Firestore unavailable (Firebase Admin not configured)',
            error: 'getAdminDb returned null',
          };
        }
        const sync = await this.getSyncMeta();
        let contactCount = sync?.contactCount;
        if (contactCount == null) {
          const snap = await db.collection(ACCREDITATION_CONTACTS_COLLECTION).limit(1).get();
          contactCount = snap.size; // may be 0 or 1 — full count is expensive; prefer sync meta
        }
        return {
          backend: 'firestore',
          ok: true,
          label: `Firestore memory · ${sync?.contactCount ?? '?'} contacts`,
          contactCount: sync?.contactCount,
          lastSyncAt: sync?.lastSyncAt || null,
        };
      } catch (e) {
        return {
          backend: 'firestore',
          ok: false,
          label: 'Firestore memory error',
          error: e instanceof Error ? e.message : String(e),
        };
      }
    },
  };
}
