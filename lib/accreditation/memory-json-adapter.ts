import { readJsonFile, writeJsonFile } from '@/lib/funding/json-store';
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

const PROFILE_FILE = 'accreditation_contact_profiles.json';
const SUMMARY_FILE = 'accreditation_conversation_summaries.json';
const SYNC_FILE = 'accreditation_memory_sync_meta.json';

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeProfile(raw: Partial<ContactProfile> & { email: string }): ContactProfile {
  const email = normalizeContactEmail(raw.email);
  return {
    email,
    name: raw.name,
    companyHint: raw.companyHint,
    domain: raw.domain || emailDomain(email),
    roleHint: raw.roleHint,
    relationshipStatus: (raw.relationshipStatus || 'unknown') as ContactRelationshipStatus,
    category: (raw.category || 'unknown') as ContactCategory,
    sourceMailbox: raw.sourceMailbox,
    interactionCount: raw.interactionCount ?? 0,
    firstSeenAt: raw.firstSeenAt || raw.lastSeenAt || nowIso(),
    lastSeenAt: raw.lastSeenAt || nowIso(),
    lastRequestId: raw.lastRequestId,
    lastThreadId: raw.lastThreadId,
    recentSubjects: Array.isArray(raw.recentSubjects) ? raw.recentSubjects.slice(0, 8) : [],
    notes: raw.notes ? sanitizeLivOutput(raw.notes).slice(0, 400) : undefined,
    importSource: raw.importSource,
    updatedAt: raw.updatedAt || nowIso(),
  };
}

/** Gitignored JSON adapter for local development and tests. */
export function createJsonMemoryBackend(): MemoryBackend {
  return {
    async getContactProfile(email: string) {
      const key = normalizeContactEmail(email);
      const all = readJsonFile<ContactProfile[]>(PROFILE_FILE, []);
      const hit = all.find((p) => p.email === key);
      return hit ? normalizeProfile(hit) : undefined;
    },

    async upsertContactProfile(input: UpsertContactProfileInput) {
      const email = normalizeContactEmail(input.email);
      if (!email.includes('@')) {
        throw new Error('Contact profile requires a valid email');
      }
      const all = readJsonFile<ContactProfile[]>(PROFILE_FILE, []);
      const idx = all.findIndex((p) => p.email === email);
      const prev = idx >= 0 ? normalizeProfile(all[idx]) : undefined;
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
      if (idx >= 0) all[idx] = next;
      else all.push(next);
      writeJsonFile(PROFILE_FILE, all.slice(-800));
      return next;
    },

    async listContactProfiles() {
      return readJsonFile<ContactProfile[]>(PROFILE_FILE, []).map(normalizeProfile);
    },

    async getConversationSummary(requestId: string) {
      return readJsonFile<ConversationSummary[]>(SUMMARY_FILE, []).find(
        (s) => s.requestId === requestId
      );
    },

    async upsertConversationSummary(input) {
      const all = readJsonFile<ConversationSummary[]>(SUMMARY_FILE, []);
      const idx = all.findIndex((s) => s.requestId === input.requestId);
      const next: ConversationSummary = {
        requestId: input.requestId,
        threadId: input.threadId,
        summary: sanitizeLivOutput(input.summary).slice(0, 800),
        lastDirection: input.lastDirection,
        updatedAt: nowIso(),
      };
      if (idx >= 0) all[idx] = { ...all[idx], ...next };
      else all.push(next);
      writeJsonFile(SUMMARY_FILE, all.slice(-400));
      return next;
    },

    async getSyncMeta() {
      return readJsonFile<MemorySyncMeta | null>(SYNC_FILE, null);
    },

    async setSyncMeta(meta) {
      const next: MemorySyncMeta = { id: 'mailbox_archive', ...meta };
      writeJsonFile(SYNC_FILE, next);
      return next;
    },

    async health(): Promise<MemoryHealth> {
      const profiles = await this.listContactProfiles();
      const sync = await this.getSyncMeta();
      return {
        backend: 'json',
        ok: true,
        label: `Local JSON memory (${profiles.length} contacts)`,
        contactCount: profiles.length,
        lastSyncAt: sync?.lastSyncAt || null,
      };
    },

    async resetForTests() {
      writeJsonFile(PROFILE_FILE, []);
      writeJsonFile(SUMMARY_FILE, []);
      writeJsonFile(SYNC_FILE, null);
    },
  };
}

/** Pure in-memory backend for unit tests (no disk). */
export function createInMemoryMemoryBackend(): MemoryBackend {
  const profiles = new Map<string, ContactProfile>();
  const summaries = new Map<string, ConversationSummary>();
  let syncMeta: MemorySyncMeta | null = null;

  return {
    async getContactProfile(email) {
      return profiles.get(normalizeContactEmail(email));
    },
    async upsertContactProfile(input) {
      const email = normalizeContactEmail(input.email);
      const prev = profiles.get(email);
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
      profiles.set(email, next);
      return next;
    },
    async listContactProfiles() {
      return [...profiles.values()];
    },
    async getConversationSummary(requestId) {
      return summaries.get(requestId);
    },
    async upsertConversationSummary(input) {
      const next: ConversationSummary = {
        requestId: input.requestId,
        threadId: input.threadId,
        summary: sanitizeLivOutput(input.summary).slice(0, 800),
        lastDirection: input.lastDirection,
        updatedAt: nowIso(),
      };
      const prev = summaries.get(input.requestId);
      const merged = prev ? { ...prev, ...next } : next;
      summaries.set(input.requestId, merged);
      return merged;
    },
    async getSyncMeta() {
      return syncMeta;
    },
    async setSyncMeta(meta) {
      syncMeta = { id: 'mailbox_archive', ...meta };
      return syncMeta;
    },
    async health() {
      return {
        backend: 'memory',
        ok: true,
        label: `In-memory test backend (${profiles.size} contacts)`,
        contactCount: profiles.size,
        lastSyncAt: syncMeta?.lastSyncAt || null,
      };
    },
    async resetForTests() {
      profiles.clear();
      summaries.clear();
      syncMeta = null;
    },
  };
}
