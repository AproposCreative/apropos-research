import { getAdminDb } from '@/lib/firebase-admin';
import { copenhagenClock } from '@/lib/liv/delivery-policy';
import type { CostAction } from './cost-actions';

export type CostPublication = { runId: string; itemId: string; title: string;
  state: 'published' | 'ready' | 'unfinished'; checkedAt: string | null };
const itemId = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value);
const date = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));

/** Uses explicit run→CMS identities and durable delivery readback receipts.
 * Never infers success from a run name/date, spend, plan or an enabled switch. */
export async function readCostPublications(actions: CostAction[], month: string): Promise<CostPublication[]> {
  const ids = [...new Set(actions.filter(a => a.bucket === 'shared' && a.scope === 'liv').map(a => a.runId))];
  if (!ids.length) return [];
  const db = getAdminDb(); if (!db) throw Error('cost_actions_unavailable');
  const runs = [];
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const rows = await db.getAll(...batch.map(id => db.collection('livDailyArticles').doc(id)));
    runs.push(...rows.map((row, index) => ({ runId: batch[index], ...row.data() })));
  }
  const delivery = db.collection('livDelivery');
  const state = (await delivery.doc('manifest').get()).data();
  // Old slots are compacted into immutable receipts, not deleted. Also read
  // next month's receipts: preparation spend can precede publication.
  const [year, mon] = month.split('-').map(Number);
  const days: string[] = [];
  for (let t = Date.UTC(year, mon - 1, 1); t < Date.UTC(year, mon + 1, 1); t += 86400_000) days.push(new Date(t).toISOString().slice(0, 10));
  const archived = await db.getAll(...days.map(day => delivery.doc(`receipt-${day}`)));
  const slots = [...Object.values(state?.slots || {}), ...archived.map(row => row.data())] as Array<Record<string, any> | undefined>;
  const today = copenhagenClock().day;
  return runs.filter(run => itemId(run.webflowItemId)).map(run => {
    const entry = state?.entries?.find((row: any) => row.itemId === run.webflowItemId);
    const receipt = slots.find(slot => slot?.itemId === run.webflowItemId && slot.state === 'published' &&
      date(slot.checkedAt) && typeof slot.publicUrl === 'string' && /^https:\/\/(www\.)?aproposmagazine\.com\//.test(slot.publicUrl) &&
      /^[a-f0-9]{64}$/.test(slot.fieldDataHash || ''));
    const ready = entry?.state === 'ready' && entry.expiresDay >= today && entry.decision !== 'rejected' &&
      !entry.publicationBlockers?.length && date(entry.preparedAt) && /^[a-f0-9]{64}$/.test(entry.payloadHash || '');
    return { runId: run.runId, itemId: run.webflowItemId, title: String(entry?.title || run.title || '').slice(0, 240),
      state: receipt ? 'published' : ready ? 'ready' : 'unfinished', checkedAt: receipt?.checkedAt || null };
  });
}
