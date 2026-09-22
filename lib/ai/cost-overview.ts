import type { CostAction } from './cost-actions';

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
