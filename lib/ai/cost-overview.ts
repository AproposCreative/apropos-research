import type { CostAction } from './cost-actions';
import type { CostPublication } from './cost-publications';

export function costStageLabel(stage: string): string {
  const labels: Record<string, string> = { research: 'Research', writing: 'Skrivning',
    'research-writing': 'Research og skrivning', embedding: 'Tekstsammenligning',
    'source-similarity': 'Kildelighed', originality: 'Selvstændig omskrivning',
    'editorial-assessment': 'Fakta og redaktionel kontrol', media: 'Billeder',
    'generate-image': 'Billedgenerering', 'daily-workflow': 'Øvrigt artikelforløb',
    'ai-chat': 'Writer (ældre samlet registrering)' };
  return labels[stage] || stage;
}

/** Read-only regrouping of the same receipts. Failed work remains in the total;
 * absent common story IDs stay separate instead of inventing attribution. */
export function costStories(actions: CostAction[], publications: CostPublication[] = []) {
  const groups = new Map<string, { id: string; bucket: CostAction['bucket']; estimatedDkk: number;
    title?: string; publicationState?: CostPublication['state']; checkedAt?: string | null;
    reservedDkk: number; calls: number; unknownCalls: number; stages: Map<string, {
      stage: string; estimatedDkk: number; reservedDkk: number; calls: number; unknownCalls: number;
    }> }>();
  for (const action of actions) {
    const publication = action.bucket === 'shared' && action.scope === 'liv'
      ? publications.find(p => p.runId === action.runId) : undefined;
    const id = publication?.itemId || action.storyId || action.runId, key = `${action.bucket}:${id}`;
    const group = groups.get(key) || { id, bucket: action.bucket, estimatedDkk: 0, reservedDkk: 0,
      calls: 0, unknownCalls: 0, stages: new Map() };
    if (publication) Object.assign(group, { title: publication.title, publicationState: publication.state, checkedAt: publication.checkedAt });
    const stage = group.stages.get(action.stage) || { stage: action.stage, estimatedDkk: 0,
      reservedDkk: 0, calls: 0, unknownCalls: 0 };
    for (const metric of ['estimatedDkk', 'reservedDkk', 'calls', 'unknownCalls'] as const) {
      group[metric] += action[metric]; stage[metric] += action[metric];
    }
    group.stages.set(action.stage, stage); groups.set(key, group);
  }
  return [...groups.values()].map(g => ({ ...g, stages: [...g.stages.values()]
    .sort((a, b) => b.estimatedDkk - a.estimatedDkk || a.stage.localeCompare(b.stage)) }))
    .sort((a, b) => b.estimatedDkk - a.estimatedDkk || a.id.localeCompare(b.id));
}

/** Client-safe projection of the existing ledger response. No new reads or AI calls. */
export function costOverview(actions: CostAction[]) {
  const groups = new Map<string, { label: string; estimatedDkk: number; reservedDkk: number; calls: number }>();
  const labels = { production: 'Drift', 'editorial-change': 'Redaktionelle rettelser', 'development-pilot': 'Udviklingstest' };
  for (const action of actions) {
    const label = `${action.bucket === 'image-gen' ? 'Image-gen' : 'Liv, Writer og SEO'} · ${action.purpose ? labels[action.purpose] : 'Uden formålsmærkning'}`;
    const group = groups.get(label) ?? { label, estimatedDkk: 0, reservedDkk: 0, calls: 0 };
    group.estimatedDkk += action.estimatedDkk;
    group.reservedDkk += action.reservedDkk;
    group.calls += action.calls;
    groups.set(label, group);
  }
  return [...groups.values()].sort((a, b) => b.estimatedDkk - a.estimatedDkk || a.label.localeCompare(b.label));
}
