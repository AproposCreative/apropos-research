import { readJsonFile, writeJsonFile } from '@/lib/funding/json-store';
import { dedupeKey } from '@/lib/funding/normalize';
import { scoreFundingOpportunity } from '@/lib/funding/scoring';
import type { DeadlineStatus, FundingOpportunity } from '@/lib/funding/types';

const FILENAME = 'funding_opportunities.json';

export function readStoredOpportunities(): FundingOpportunity[] {
  return readJsonFile<FundingOpportunity[]>(FILENAME, []);
}

export function writeStoredOpportunities(opportunities: FundingOpportunity[]): void {
  writeJsonFile(FILENAME, opportunities);
}

export function mergeOpportunities(
  incoming: FundingOpportunity[],
  existing: FundingOpportunity[] = readStoredOpportunities()
): { merged: FundingOpportunity[]; added: number } {
  const byKey = new Map(existing.map((o) => [dedupeKey(o.title, o.funder), o]));
  let added = 0;
  for (const opp of incoming) {
    const key = dedupeKey(opp.title, opp.funder);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...opp, discoveredAt: opp.discoveredAt || new Date().toISOString(), updatedAt: new Date().toISOString() });
      added += 1;
    } else {
      byKey.set(key, {
        ...prev,
        ...opp,
        id: prev.id,
        discoveredAt: prev.discoveredAt,
        updatedAt: new Date().toISOString(),
      });
    }
  }
  const merged = Array.from(byKey.values()).sort(
    (a, b) => scoreFundingOpportunity(b) - scoreFundingOpportunity(a)
  );
  writeStoredOpportunities(merged);
  return { merged, added };
}

export function getOpportunityById(id: string): FundingOpportunity | undefined {
  return readStoredOpportunities().find((o) => o.id === id);
}

export function markExpiredDeadlines(): number {
  const now = Date.now();
  let changed = 0;
  const updated = readStoredOpportunities().map((opp) => {
    if (!opp.deadline) return opp;
    const parsed = Date.parse(opp.deadline);
    if (!Number.isFinite(parsed)) return opp;
    if (parsed < now && opp.deadlineStatus !== 'closed') {
      changed += 1;
      return { ...opp, deadlineStatus: 'closed' as DeadlineStatus, updatedAt: new Date().toISOString() };
    }
    return opp;
  });
  if (changed > 0) writeStoredOpportunities(updated);
  return changed;
}
