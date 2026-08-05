import type { MemoryBackend } from '@/lib/accreditation/memory-backend';
import { createFirestoreMemoryBackend } from '@/lib/accreditation/memory-firestore-adapter';
import {
  createInMemoryMemoryBackend,
  createJsonMemoryBackend,
} from '@/lib/accreditation/memory-json-adapter';
import { sanitizeLivOutput } from '@/lib/accreditation/sanitize';
import type {
  ContactProfile,
  ConversationSummary,
  MemoryBackendKind,
  MemoryHealth,
  UpsertContactProfileInput,
} from '@/lib/accreditation/memory-types';

export type {
  ContactProfile,
  ConversationSummary,
  ContactCategory,
  ContactRelationshipStatus,
  MemoryHealth,
  MemorySyncMeta,
  UpsertContactProfileInput,
} from '@/lib/accreditation/memory-types';

export {
  classifyCategory,
  isAutomatedSenderHeuristic,
  normalizeContactEmail,
} from '@/lib/accreditation/memory-types';

let _backend: MemoryBackend | null = null;
let _forcedKind: MemoryBackendKind | null = null;

function resolveBackendKind(): MemoryBackendKind {
  if (_forcedKind) return _forcedKind;
  const explicit = (
    process.env.ACCREDITATION_MEMORY_BACKEND ||
    ''
  )
    .trim()
    .toLowerCase();
  if (explicit === 'firestore' || explicit === 'json' || explicit === 'memory') {
    return explicit;
  }
  // Vitest / unit tests default to in-memory unless overridden
  if (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test') {
    return 'memory';
  }
  // Production / Vercel: Firestore is mandatory for durable memory
  if (process.env.VERCEL === '1' || process.env.NODE_ENV === 'production') {
    return 'firestore';
  }
  return 'json';
}

export function getMemoryBackendKind(): MemoryBackendKind {
  return resolveBackendKind();
}

/** Test-only: force a backend kind and reset singleton. */
export function __setMemoryBackendForTests(
  kind: MemoryBackendKind | null,
  backend?: MemoryBackend
): void {
  _forcedKind = kind;
  _backend = backend || null;
}

export function getMemoryBackend(): MemoryBackend {
  if (_backend) return _backend;
  const kind = resolveBackendKind();
  if (kind === 'firestore') {
    _backend = createFirestoreMemoryBackend();
  } else if (kind === 'memory') {
    _backend = createInMemoryMemoryBackend();
  } else {
    _backend = createJsonMemoryBackend();
  }
  return _backend;
}

export async function getMemoryHealth(): Promise<MemoryHealth> {
  const kind = resolveBackendKind();
  if (kind === 'firestore') {
    try {
      return await getMemoryBackend().health();
    } catch (e) {
      return {
        backend: 'firestore',
        ok: false,
        label: 'Firestore memory unavailable',
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }
  return getMemoryBackend().health();
}

export async function getContactProfile(
  email: string
): Promise<ContactProfile | undefined> {
  return getMemoryBackend().getContactProfile(email);
}

export async function upsertContactProfile(
  input: UpsertContactProfileInput
): Promise<ContactProfile> {
  return getMemoryBackend().upsertContactProfile(input);
}

export async function listContactProfiles(): Promise<ContactProfile[]> {
  return getMemoryBackend().listContactProfiles();
}

export async function getConversationSummary(
  requestId: string
): Promise<ConversationSummary | undefined> {
  return getMemoryBackend().getConversationSummary(requestId);
}

export async function upsertConversationSummary(input: {
  requestId: string;
  threadId?: string;
  summary: string;
  lastDirection?: 'inbound' | 'outbound';
}): Promise<ConversationSummary> {
  return getMemoryBackend().upsertConversationSummary(input);
}

/** Compact context block for AI prompts — no secrets, no full bodies. */
export async function loadMemoryForReply(params: {
  requestId?: string;
  contactEmail?: string;
}): Promise<string> {
  const parts: string[] = [];
  if (params.contactEmail) {
    try {
      const profile = await getContactProfile(params.contactEmail);
      if (profile) {
        parts.push(
          [
            'Kontaktprofil:',
            `- ${profile.name || profile.email} <${profile.email}>`,
            profile.companyHint ? `- company: ${profile.companyHint}` : null,
            profile.domain ? `- domain: ${profile.domain}` : null,
            profile.roleHint ? `- role: ${profile.roleHint}` : null,
            `- category: ${profile.category}`,
            `- relationship: ${profile.relationshipStatus}`,
            profile.sourceMailbox ? `- sourceMailbox: ${profile.sourceMailbox}` : null,
            `- interactions: ${profile.interactionCount}`,
            profile.lastRequestId ? `- lastRequest: ${profile.lastRequestId}` : null,
            profile.recentSubjects.length
              ? `- recentSubjects: ${profile.recentSubjects.slice(0, 4).join(' · ')}`
              : null,
            profile.notes ? `- notes: ${profile.notes}` : null,
          ]
            .filter(Boolean)
            .join('\n')
        );
      }
    } catch (e) {
      if (resolveBackendKind() === 'firestore') {
        throw e;
      }
    }
  }
  if (params.requestId) {
    try {
      const summary = await getConversationSummary(params.requestId);
      if (summary?.summary) {
        parts.push(`Samtale-resume:\n${summary.summary}`);
      }
    } catch (e) {
      if (resolveBackendKind() === 'firestore') {
        throw e;
      }
    }
  }
  return parts.join('\n\n');
}

export async function updateMemoryAfterEvent(params: {
  requestId: string;
  threadId?: string;
  contactEmail?: string;
  contactName?: string;
  direction: 'inbound' | 'outbound';
  /** Short safe blurb — already truncated; never pass full private bodies. */
  blurb: string;
  subject?: string;
  sourceMailbox?: string;
}): Promise<void> {
  const backend = getMemoryBackend();
  if (params.contactEmail) {
    const existing = await backend.getContactProfile(params.contactEmail);
    let relationship = existing?.relationshipStatus || 'unknown';
    if (params.direction === 'inbound' && (existing?.interactionCount || 0) > 0) {
      relationship = 'established_two_way';
    } else if (params.direction === 'outbound' && relationship === 'unknown') {
      relationship = 'one_way';
    }
    await backend.upsertContactProfile({
      email: params.contactEmail,
      name: params.contactName,
      lastRequestId: params.requestId,
      lastThreadId: params.threadId,
      recentSubject: params.subject,
      sourceMailbox: params.sourceMailbox,
      relationshipStatus:
        existing?.category === 'automated' ? 'automated' : relationship,
      category: existing?.category,
    });
  }

  const prev = (await backend.getConversationSummary(params.requestId))?.summary || '';
  const line = sanitizeLivOutput(
    `${params.direction === 'inbound' ? 'Ind' : 'Ud'}: ${params.blurb}`
  ).slice(0, 220);
  const merged = [prev, line].filter(Boolean).join(' · ').slice(-780);
  await backend.upsertConversationSummary({
    requestId: params.requestId,
    threadId: params.threadId,
    summary: merged,
    lastDirection: params.direction,
  });
}

/** @deprecated sync helper kept for older tests — prefer async APIs. */
export function writeContactProfiles(profiles: ContactProfile[]): void {
  if (resolveBackendKind() === 'firestore') {
    throw new Error('writeContactProfiles is not supported on Firestore backend');
  }
  // Best-effort for JSON/memory tests that still call the sync helper
  void (async () => {
    const backend = getMemoryBackend();
    if (backend.resetForTests) await backend.resetForTests();
    for (const p of profiles) {
      await backend.upsertContactProfile({
        email: p.email,
        name: p.name,
        companyHint: p.companyHint,
        domain: p.domain,
        roleHint: p.roleHint,
        relationshipStatus: p.relationshipStatus,
        category: p.category,
        sourceMailbox: p.sourceMailbox,
        lastRequestId: p.lastRequestId,
        lastThreadId: p.lastThreadId,
        notes: p.notes,
        preserveInteractionCount: true,
        interactionCount: p.interactionCount,
        firstSeenAt: p.firstSeenAt,
        lastSeenAt: p.lastSeenAt,
        importSource: p.importSource,
      });
    }
  })();
}
