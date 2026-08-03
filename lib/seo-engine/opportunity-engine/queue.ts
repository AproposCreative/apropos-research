/**
 * Collapse legacy opportunity documents that represent the same page/query.
 *
 * Older fingerprints included the signal set, so one changing metric could create
 * several visible rows for the same opportunity. Prefer the most recently updated
 * record; fall back to the strongest lifecycle state when timestamps are absent.
 */
export function collapseOpportunityHistory<T extends {
  slug: string;
  locale?: string;
  url?: string | null;
  status: string;
  score: number;
  updatedAt?: string | null;
  createdAt?: string | null;
  evidence?: { query?: string | null };
}>(rows: T[]): T[] {
  const byPageQuery = new Map<string, T>();

  for (const row of rows) {
    const page = (row.url || `${row.locale || ''}:${row.slug}`).toLowerCase().trim();
    const query = (row.evidence?.query || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const key = `${page}|${query}`;
    const current = byPageQuery.get(key);
    if (!current || isNewerOrMoreRelevant(row, current)) byPageQuery.set(key, row);
  }

  return [...byPageQuery.values()].sort((a, b) => b.score - a.score);
}

function isNewerOrMoreRelevant<T extends {
  status: string;
  updatedAt?: string | null;
  createdAt?: string | null;
}>(candidate: T, current: T): boolean {
  const candidateAt = Date.parse(candidate.updatedAt || candidate.createdAt || '');
  const currentAt = Date.parse(current.updatedAt || current.createdAt || '');
  if (Number.isFinite(candidateAt) && Number.isFinite(currentAt) && candidateAt !== currentAt) {
    return candidateAt > currentAt;
  }
  if (Number.isFinite(candidateAt) !== Number.isFinite(currentAt)) {
    return Number.isFinite(candidateAt);
  }
  return statusPriority(candidate.status) > statusPriority(current.status);
}

function statusPriority(status: string): number {
  return {
    applied: 7,
    rolled_back: 6,
    approved: 5,
    open: 4,
    skipped: 3,
    rejected: 2,
    dismissed: 1,
  }[status] || 0;
}
