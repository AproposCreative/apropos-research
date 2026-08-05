/**
 * Shared backend kind for all accreditation operational persistence.
 * Mirrors memory-store: Firestore in production/Vercel; JSON local; memory in tests.
 */
export type AccreditationPersistenceKind = 'firestore' | 'json' | 'memory';

let _forcedKind: AccreditationPersistenceKind | null = null;

export function __setAccreditationPersistenceKindForTests(
  kind: AccreditationPersistenceKind | null
): void {
  _forcedKind = kind;
}

export function resolveAccreditationPersistenceKind(): AccreditationPersistenceKind {
  if (_forcedKind) return _forcedKind;
  const explicit = (process.env.ACCREDITATION_PERSISTENCE_BACKEND || '').trim().toLowerCase();
  if (explicit === 'firestore' || explicit === 'json' || explicit === 'memory') {
    return explicit;
  }
  // Align with contact-memory override when set
  const mem = (process.env.ACCREDITATION_MEMORY_BACKEND || '').trim().toLowerCase();
  if (mem === 'firestore' || mem === 'json' || mem === 'memory') {
    return mem;
  }
  if (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test') {
    return 'memory';
  }
  if (process.env.VERCEL === '1' || process.env.NODE_ENV === 'production') {
    return 'firestore';
  }
  return 'json';
}

export function isFirestorePersistence(): boolean {
  return resolveAccreditationPersistenceKind() === 'firestore';
}
