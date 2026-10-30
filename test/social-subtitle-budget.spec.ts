import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ db: null as unknown, allowed: vi.fn() }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => mocks.db }));
vi.mock('@/lib/ai/no-paid-calls', () => ({ assertPaidAiAllowed: mocks.allowed }));
vi.mock('@/lib/ai/provider-hold', () => ({ providerHoldRef: (db: { collection: (name: string) => { doc: (id: string) => unknown } }) => db.collection('holds').doc('provider') }));
import { claimSocialSubtitle, finishSocialSubtitle, readSocialSubtitleStatus, resumeSocialSubtitleBudget, socialSubtitleKey, socialSubtitleQuoteDkkMicros,
  SOCIAL_SUBTITLE_LIMIT_DKK_MICROS } from '../lib/ai/social-subtitle-budget';

const input = { articleId: '6accb9d4a4cfa06c22daba31', title: 'En titel',
  subtitle: 'En længere undertekst, der ikke kan være på kortet.', size: 'square' as const };
const budgetPath = 'aiExecutionPolicies/social-subtitle-10dkk-2026-10-25-v1';

function fakeStore() {
  const rows = new Map<string, Record<string, unknown>>();
  const ref = (path: string) => ({ path, get: async () => ({ exists: rows.has(path), data: () => rows.get(path) }) });
  const db = {
    collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
    runTransaction: async <T>(work: (tx: {
      get: (document: { path: string }) => Promise<{ exists: boolean; data: () => Record<string, unknown> | undefined }>;
      set: (document: { path: string }, value: Record<string, unknown>) => void;
      create: (document: { path: string }, value: Record<string, unknown>) => void;
      update: (document: { path: string }, value: Record<string, unknown>) => void;
    }) => Promise<T>) => {
      const writes: Array<() => void> = [];
      const result = await work({
        get: async document => ({ exists: rows.has(document.path), data: () => rows.get(document.path) }),
        set: (document, value) => writes.push(() => rows.set(document.path, value)),
        create: (document, value) => writes.push(() => { if (rows.has(document.path)) throw Error('duplicate'); rows.set(document.path, value); }),
        update: (document, value) => writes.push(() => rows.set(document.path, { ...rows.get(document.path), ...value })),
      });
      writes.forEach(write => write());
      return result;
    },
  };
  mocks.db = db;
  return rows;
}

beforeEach(() => { vi.clearAllMocks(); fakeStore(); });

describe('one-time SoMe AI cap', () => {
  it('reserves before transport and reuses the same cached result without paying twice', async () => {
    const rows = fakeStore(), prompt = JSON.stringify(input);
    const first = await claimSocialSubtitle(input, 'editor-1', prompt);
    expect(first).toEqual({ state: 'reserved', key: socialSubtitleKey(input), generation: 0 });
    expect(rows.get(budgetPath)?.usedUpperDkkMicros).toBe(socialSubtitleQuoteDkkMicros(prompt));
    expect(rows.get(budgetPath)?.calls).toBe(1);
    expect(await claimSocialSubtitle(input, 'editor-1', prompt)).toEqual({ state: 'pending' });
    await finishSocialSubtitle(socialSubtitleKey(input), ['En afsluttet AI-sætning.']);
    expect(await claimSocialSubtitle(input, 'editor-1', prompt)).toEqual({ state: 'ready', candidates: ['En afsluttet AI-sætning.'] });
    expect(rows.get(budgetPath)?.calls).toBe(1);
  });
  it('only buys a new cached variant after the previous one is ready', async () => {
    const rows = fakeStore(), prompt = JSON.stringify(input);
    await expect(claimSocialSubtitle(input, 'editor-1', prompt, 1)).rejects.toThrow('social_subtitle_variant_not_ready');
    expect(rows.has(budgetPath)).toBe(false);
    await claimSocialSubtitle(input, 'editor-1', prompt);
    await expect(claimSocialSubtitle(input, 'editor-1', prompt, 1)).rejects.toThrow('social_subtitle_variant_not_ready');
    await finishSocialSubtitle(socialSubtitleKey(input), ['Første bud.']);
    const next = await claimSocialSubtitle(input, 'editor-1', prompt, 1);
    expect(next).toEqual({ state: 'reserved', key: socialSubtitleKey(input, 0, 1), generation: 0 });
    expect(next.state === 'reserved' && next.key).not.toBe(socialSubtitleKey(input));
    expect(await claimSocialSubtitle(input, 'editor-1', prompt, 1)).toEqual({ state: 'pending' });
    await finishSocialSubtitle(socialSubtitleKey(input, 0, 1), ['Et andet bud.']);
    expect(await claimSocialSubtitle(input, 'editor-1', prompt, 1)).toEqual({ state: 'ready', candidates: ['Et andet bud.'] });
    expect(rows.get(budgetPath)?.calls).toBe(2);
  });
  it('allows an explicit later variant after a completed failure without retrying the failed key', async () => {
    const rows = fakeStore(), prompt = JSON.stringify(input);
    await claimSocialSubtitle(input, 'editor-1', prompt);
    await finishSocialSubtitle(socialSubtitleKey(input), ['Første bud.']);
    await claimSocialSubtitle(input, 'editor-1', prompt, 1);
    await finishSocialSubtitle(socialSubtitleKey(input, 0, 1), null, { prompt_tokens: 314, completion_tokens: 248 }, 'incomplete_response');
    expect(await claimSocialSubtitle(input, 'editor-1', prompt, 1))
      .toEqual({ state: 'failed', reason: 'incomplete_response', generation: 0 });
    expect(await claimSocialSubtitle(input, 'editor-1', prompt, 2))
      .toEqual({ state: 'reserved', key: socialSubtitleKey(input, 0, 2), generation: 0 });
    expect(rows.get(budgetPath)?.calls).toBe(3);
    expect(rows.get(`socialSubtitleAI/${socialSubtitleKey(input, 0, 1)}`)?.status).toBe('failed');
  });
  it('treats an uncertain response as spent upper bound and never retries the same key', async () => {
    const rows = fakeStore();
    await claimSocialSubtitle(input, 'editor-1', JSON.stringify(input));
    await finishSocialSubtitle(socialSubtitleKey(input), null);
    expect(await claimSocialSubtitle(input, 'editor-1', JSON.stringify(input))).toEqual({ state: 'failed', reason: 'unknown', generation: 0 });
    expect(rows.get(budgetPath)?.calls).toBe(1);
  });
  it('stops all later SoMe provider calls after a terminal quota rejection', async () => {
    const rows = fakeStore(), prompt = JSON.stringify(input);
    await claimSocialSubtitle(input, 'editor-1', prompt);
    await finishSocialSubtitle(socialSubtitleKey(input), null, null, 'quota_exhausted');
    expect(rows.get(budgetPath)?.blocked).toBe(true);
    expect(rows.get(budgetPath)?.blockedReason).toBe('quota_exhausted');
    const another = { ...input, articleId: '6accb9d4a4cfa06c22daba32' };
    expect(await claimSocialSubtitle(another, 'editor-1', JSON.stringify(another)))
      .toEqual({ state: 'failed', reason: 'quota_exhausted', generation: 0 });
    expect(rows.get(budgetPath)?.calls).toBe(1);
  });
  it('closes the SoMe circuit when reading an older cached quota failure', async () => {
    const rows = fakeStore(), prompt = JSON.stringify(input);
    await claimSocialSubtitle(input, 'editor-1', prompt);
    rows.set(`socialSubtitleAI/${socialSubtitleKey(input)}`, { status: 'failed', failure: 'quota_exhausted' });
    expect(await claimSocialSubtitle(input, 'editor-1', prompt))
      .toEqual({ state: 'failed', reason: 'quota_exhausted', generation: 0 });
    expect(rows.get(budgetPath)?.blocked).toBe(true);
    expect(rows.get(budgetPath)?.calls).toBe(1);
  });
  it('reopens only a quota-blocked budget with the matching generation and preserves prior failure', async () => {
    const rows = fakeStore(), prompt = JSON.stringify(input), firstKey = socialSubtitleKey(input);
    await claimSocialSubtitle(input, 'editor-1', prompt);
    await finishSocialSubtitle(firstKey, null, null, 'quota_exhausted');
    await expect(resumeSocialSubtitleBudget('owner', 1)).rejects.toThrow('social_subtitle_resume_conflict');
    expect(await resumeSocialSubtitleBudget('owner', 0)).toEqual({ generation: 1 });
    await expect(resumeSocialSubtitleBudget('owner', 0)).rejects.toThrow('social_subtitle_resume_conflict');
    const second = await claimSocialSubtitle(input, 'editor-1', prompt);
    expect(second).toEqual({ state: 'reserved', key: socialSubtitleKey(input, 1), generation: 1 });
    expect(second.state === 'reserved' && second.key).not.toBe(firstKey);
    expect(rows.get(`socialSubtitleAI/${firstKey}`)?.failure).toBe('quota_exhausted');
    expect(rows.get(budgetPath)?.calls).toBe(2);
    expect(rows.get(budgetPath)?.limitDkkMicros).toBe(SOCIAL_SUBTITLE_LIMIT_DKK_MICROS);
    expect(rows.get(budgetPath)?.resumedBy).toBe('owner');
    expect(rows.get(`socialSubtitleAI/${socialSubtitleKey(input, 1)}`)?.generation).toBe(1);
  });
  it('reads the current resumption without resetting a cap, failure or reservation', async () => {
    const rows = fakeStore();
    await claimSocialSubtitle(input, 'editor-1', JSON.stringify(input));
    await finishSocialSubtitle(socialSubtitleKey(input), null, null, 'quota_exhausted');
    expect(await readSocialSubtitleStatus()).toEqual({ generation: 0, blocked: true });
    await resumeSocialSubtitleBudget('owner', 0);
    const before = JSON.stringify([...rows]);
    expect(await readSocialSubtitleStatus()).toEqual({ generation: 1, blocked: false });
    expect(JSON.stringify([...rows])).toBe(before);
    rows.set('holds/provider', { blocked: true });
    expect(await readSocialSubtitleStatus()).toEqual({ generation: 1, blocked: true });
  });
  it('does not let a late old provider failure reblock an explicitly resumed generation', async () => {
    const rows = fakeStore(), another = { ...input, articleId: '6accb9d4a4cfa06c22daba32' };
    await claimSocialSubtitle(input, 'editor-1', JSON.stringify(input));
    await claimSocialSubtitle(another, 'editor-1', JSON.stringify(another));
    await finishSocialSubtitle(socialSubtitleKey(input), null, null, 'quota_exhausted');
    await resumeSocialSubtitleBudget('owner', 0);
    const before = { ...rows.get(budgetPath) };
    await finishSocialSubtitle(socialSubtitleKey(another), null, null, 'quota_exhausted');
    expect(rows.get(budgetPath)).toEqual(before);
    expect(rows.get(`socialSubtitleAI/${socialSubtitleKey(another)}`)?.failure).toBe('quota_exhausted');
    expect(await readSocialSubtitleStatus()).toEqual({ generation: 1, blocked: false });
  });
  it('fails closed for a missing or malformed recovery status', async () => {
    const rows = fakeStore();
    await expect(readSocialSubtitleStatus()).rejects.toThrow('social_subtitle_budget_invalid');
    rows.set(budgetPath, { id: 'other', generation: 1000 });
    await expect(readSocialSubtitleStatus()).rejects.toThrow('social_subtitle_budget_invalid');
  });
  it('rejects a new call before transport if the fixed lifetime cap is exhausted', async () => {
    const rows = fakeStore();
    rows.set(budgetPath, { id: 'social-subtitle-10dkk-2026-10-25-v1', mode: 'social-subtitle-ai-v1',
      limitDkkMicros: SOCIAL_SUBTITLE_LIMIT_DKK_MICROS, usedUpperDkkMicros: SOCIAL_SUBTITLE_LIMIT_DKK_MICROS, calls: 100 });
    await expect(claimSocialSubtitle(input, 'editor-1', JSON.stringify(input))).rejects.toThrow('social_subtitle_budget_exceeded');
    expect(rows.size).toBe(1);
  });
  it('respects the existing provider hold without modifying it', async () => {
    const rows = fakeStore();
    rows.set('holds/provider', { blocked: true });
    await expect(claimSocialSubtitle(input, 'editor-1', JSON.stringify(input))).rejects.toThrow('social_subtitle_provider_hold');
    expect(rows.get('holds/provider')).toEqual({ blocked: true });
    expect(rows.has(budgetPath)).toBe(false);
  });
  it('does not let a bad budget row turn into a fresh 10 kr. allowance', async () => {
    const rows = fakeStore();
    rows.set(budgetPath, { usedUpperDkkMicros: 0, calls: 0 });
    await expect(claimSocialSubtitle(input, 'editor-1', JSON.stringify(input))).rejects.toThrow('social_subtitle_budget_invalid');
  });
});
