import { getAdminDb } from '@/lib/firebase-admin';
import { copenhagenClock } from '@/lib/liv/delivery-policy';
import { providerFailure, type ProviderFailure } from './provider-error';

type Row = Record<string, any>;
type Bucket = 'shared' | 'image-gen';
export type CostAction = {
  storyId?: string; purpose?: 'production' | 'editorial-change' | 'development-pilot'; contentVersion?: string;
  bucket: Bucket; scope: string; runId: string; stage: string; lastAt: string;
  calls: number; estimatedDkk: number; reservedDkk: number; unknownCalls: number;
  repeatedRequests: number; failure: ProviderFailure | null;
};
const identifier = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v);
const money = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
const scopes = ['liv', 'writer', 'seo', 'accreditation', 'image-gen'];

/** Projection only: no prompts, responses, credentials, URLs or provider request IDs. */
export function projectCostActions(rows: Array<{ call: Row; receipt?: Row }>, bucket: Bucket): CostAction[] {
  const groups = new Map<string, CostAction & { seen: Set<string> }>();
  for (const { call, receipt } of rows) {
    if (!identifier(call.runId) || !identifier(call.stage) || !scopes.includes(call.scope ?? 'liv') ||
      !money(call.reservedDkkMicros) || typeof call.createdAt !== 'string' || !Number.isFinite(Date.parse(call.createdAt))) {
      throw new Error('cost_action_invalid');
    }
    const attribution = { ...(identifier(call.storyId) ? { storyId: call.storyId } : {}),
      ...(['production','editorial-change','development-pilot'].includes(call.purpose) ? { purpose: call.purpose } : {}),
      ...(/^[a-f0-9]{64}$/.test(call.contentVersion || '') ? { contentVersion: call.contentVersion } : {}) };
    const scope = call.scope ?? 'liv', key = JSON.stringify([scope, call.runId, call.stage, attribution]);
    let group = groups.get(key);
    if (!group) {
      group = { bucket, scope, runId: call.runId, stage: call.stage, lastAt: call.createdAt, ...attribution,
        calls: 0, estimatedDkk: 0, reservedDkk: 0, unknownCalls: 0, repeatedRequests: 0, failure: null, seen: new Set() };
      groups.set(key, group);
    }
    group.calls++;
    group.lastAt = group.lastAt > call.createdAt ? group.lastAt : call.createdAt;
    if (receipt?.reservationRetained === false && money(receipt.usageBasedUpperDkkMicros)) {
      group.estimatedDkk += receipt.usageBasedUpperDkkMicros / 1e6;
    } else { group.unknownCalls++; group.reservedDkk += call.reservedDkkMicros / 1e6; }
    const recorded = receipt?.outcome?.providerFailure;
    const allowed: ProviderFailure[] = ['quota_exhausted', 'rate_limited', 'authentication_failed', 'access_denied', 'provider_unavailable'];
    const failure = allowed.includes(recorded) ? recorded : providerFailure({ status: receipt?.outcome?.httpStatus });
    if (failure) group.failure = failure;
    if (/^[a-f0-9]{64}$/.test(call.requestHash || '')) {
      if (group.seen.has(call.requestHash)) group.repeatedRequests++;
      group.seen.add(call.requestHash);
    }
  }
  return [...groups.values()].map(({ seen: _seen, ...row }) => row).sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

/** Explicit UI request only; bounded, read-only ledger scan. Never calls an AI provider. */
export async function readCostActions(month = copenhagenClock().day.slice(0, 7)) {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('cost_month_invalid');
  const db = getAdminDb();
  if (!db) throw new Error('cost_actions_unavailable');
  const buckets = await Promise.all((['shared', 'image-gen'] as const).map(async bucket => {
    const collection = db.collection(bucket === 'shared' ? 'livCostLedger' : 'imageGenCostLedger');
    const snapshot = await collection.where('month', '==', month).limit(1001).get();
    if (snapshot.size > 1000) throw new Error('cost_actions_limit');
    const rows: Array<{ call: Row; receipt?: Row }> = [];
    for (let offset = 0; offset < snapshot.docs.length; offset += 100) {
      const docs = snapshot.docs.slice(offset, offset + 100);
      if (docs.some(d => !/^call-[a-f0-9-]{36}$/.test(d.id))) throw new Error('cost_action_invalid');
      const receipts = await db.getAll(...docs.map(d => collection.doc(`result-${d.id.slice(5)}`)));
      docs.forEach((d, i) => rows.push({ call: d.data(), receipt: receipts[i].data() }));
    }
    return projectCostActions(rows, bucket);
  }));
  const actions = buckets.flat().sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  const stories = new Map<string, { id: string; bucket: Bucket; estimatedDkk: number; reservedDkk: number; calls: number }>();
  for (const a of actions) {
    const id = a.storyId ?? a.runId, key = `${a.bucket}:${id}`;
    const row = stories.get(key) ?? { id, bucket: a.bucket, estimatedDkk: 0, reservedDkk: 0, calls: 0 };
    row.estimatedDkk += a.estimatedDkk; row.reservedDkk += a.reservedDkk; row.calls += a.calls;
    stories.set(key, row);
  }
  return { month, checkedAt: new Date().toISOString(), billedDkk: null,
    coverage: 'tracked_calls_only' as const, actions, stories: [...stories.values()].sort((a,b) => b.estimatedDkk - a.estimatedDkk) };
}
