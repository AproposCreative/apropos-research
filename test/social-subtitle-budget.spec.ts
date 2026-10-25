import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ db: null as unknown, allowed: vi.fn() }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => mocks.db }));
vi.mock('@/lib/ai/no-paid-calls', () => ({ assertPaidAiAllowed: mocks.allowed }));
vi.mock('@/lib/ai/provider-hold', () => ({ providerHoldRef: () => ({ path: 'holds/provider' }) }));
import { claimSocialSubtitle, finishSocialSubtitle, socialSubtitleKey, socialSubtitleQuoteDkkMicros,
  SOCIAL_SUBTITLE_LIMIT_DKK_MICROS } from '../lib/ai/social-subtitle-budget';

const input = { articleId: '6accb9d4a4cfa06c22daba31', title: 'En titel',
  subtitle: 'En længere undertekst, der ikke kan være på kortet.', size: 'square' as const };
const budgetPath = 'aiExecutionPolicies/social-subtitle-10dkk-2026-10-25-v1';

function fakeStore() {
  const rows = new Map<string, Record<string, unknown>>();
  const ref = (path: string) => ({ path });
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
    expect(first).toEqual({ state: 'reserved', key: socialSubtitleKey(input) });
    expect(rows.get(budgetPath)?.usedUpperDkkMicros).toBe(socialSubtitleQuoteDkkMicros(prompt));
    expect(rows.get(budgetPath)?.calls).toBe(1);
    expect(await claimSocialSubtitle(input, 'editor-1', prompt)).toEqual({ state: 'pending' });
    await finishSocialSubtitle(socialSubtitleKey(input), ['En afsluttet AI-sætning.']);
    expect(await claimSocialSubtitle(input, 'editor-1', prompt)).toEqual({ state: 'ready', candidates: ['En afsluttet AI-sætning.'] });
    expect(rows.get(budgetPath)?.calls).toBe(1);
  });
  it('treats an uncertain response as spent upper bound and never retries the same key', async () => {
    const rows = fakeStore();
    await claimSocialSubtitle(input, 'editor-1', JSON.stringify(input));
    await finishSocialSubtitle(socialSubtitleKey(input), null);
    expect(await claimSocialSubtitle(input, 'editor-1', JSON.stringify(input))).toEqual({ state: 'failed', reason: 'unknown' });
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
      .toEqual({ state: 'failed', reason: 'quota_exhausted' });
    expect(rows.get(budgetPath)?.calls).toBe(1);
  });
  it('closes the SoMe circuit when reading an older cached quota failure', async () => {
    const rows = fakeStore(), prompt = JSON.stringify(input);
    await claimSocialSubtitle(input, 'editor-1', prompt);
    rows.set(`socialSubtitleAI/${socialSubtitleKey(input)}`, { status: 'failed', failure: 'quota_exhausted' });
    expect(await claimSocialSubtitle(input, 'editor-1', prompt))
      .toEqual({ state: 'failed', reason: 'quota_exhausted' });
    expect(rows.get(budgetPath)?.blocked).toBe(true);
    expect(rows.get(budgetPath)?.calls).toBe(1);
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
