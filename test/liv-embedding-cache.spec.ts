import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ rows: new Map<string, any>(), create: vi.fn(), available: true, failSave: false,
  queue: Promise.resolve() as Promise<unknown> }));
vi.mock('@/lib/openai', () => ({ getOpenAIClient: () => ({ embeddings: { create: state.create } }) }));
vi.mock('@/lib/firebase', () => ({ storage: {} }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => state.available ? {
  collection: (collection: string) => ({ doc: (id: string) => ({ id: `${collection}/${id}`,
    set: async (patch: unknown) => {
      if (state.failSave) throw new Error('save unavailable');
      state.rows.set(`${collection}/${id}`, { ...state.rows.get(`${collection}/${id}`), ...patch as object });
    },
  }) }),
  runTransaction: (fn: any) => {
    const task = state.queue.catch(() => {}).then(() => fn({
      get: async (ref: any) => ({ data: () => structuredClone(state.rows.get(ref.id)) }),
      create: (ref: any, row: unknown) => state.rows.set(ref.id, structuredClone(row)),
      set: (ref: any, patch: object) => state.rows.set(ref.id, { ...state.rows.get(ref.id), ...structuredClone(patch) }),
    }));
    state.queue = task; return task;
  },
} : null }));
import { getEmbedding } from '@/lib/embeddings';
import { checkSourceSimilarity } from '@/lib/liv/source-similarity';
import { currentLivCostContext, withLivCostContext } from '@/lib/liv/cost-context';
import { LivCostPretransportError } from '@/lib/liv/cost-errors';

beforeEach(() => {
  vi.resetAllMocks(); state.rows.clear(); state.available = true; state.failSave = false; state.queue = Promise.resolve();
  state.create.mockImplementation(async request => {
    expect([...state.rows.values()].some(row => row.status === 'processing')).toBe(true);
    const vector = Array.from({ length: 1536 }, (_, index) => index === (request.input.startsWith('Source') ? 1 : 0) ? 1 : 0);
    return { model: request.model, data: [{ embedding: vector }], usage: { prompt_tokens: 60, total_tokens: 60 } };
  });
});

it('persists vectors and usage by exact normalized bounded model input, reusing sequential and concurrent calls', async () => {
  const [first, second] = await Promise.all([getEmbedding('Exact   input'), getEmbedding('Exact input')]);
  expect(first).toEqual(second);
  expect(await getEmbedding('Exact input')).toEqual(first);
  expect(state.create).toHaveBeenCalledTimes(1);
  expect(state.create).toHaveBeenCalledWith({ model: 'text-embedding-3-small', input: 'Exact input', dimensions: 1536 },
    { maxRetries: 0, timeout: 30_000 });
  expect([...state.rows.values()][0]).toMatchObject({ status: 'complete', usage: { prompt_tokens: 60 }, vectorHash: expect.any(String) });
  first[0] = 999;
  expect((await getEmbedding('Exact input'))[0]).toBe(1); // callers cannot mutate the cached proof
});

it('pays for a changed input, never reuses a merely similar text', async () => {
  await getEmbedding('Exact input'); await getEmbedding('Changed input');
  expect(state.create).toHaveBeenCalledTimes(2);
});

it('labels paid cache misses within the authenticated parent budget, with no call on a later run cache hit', async () => {
  state.create.mockImplementation(async () => {
    expect(currentLivCostContext()).toMatchObject({ runId: 'prepare-2026-09-13', stage: 'embedding' });
    return { data: [{ embedding: Array(1536).fill(1) }], usage: { prompt_tokens: 50 } };
  });
  await withLivCostContext({ runId: 'prepare-2026-09-13', stage: 'writer' }, () => getEmbedding('Saved source excerpt'));
  await withLivCostContext({ runId: 'prepare-2026-09-14', stage: 'safety' }, () => getEmbedding('Saved source excerpt'));
  expect(state.create).toHaveBeenCalledTimes(1);
});

it('still evaluates full-text copying beyond the cached 4000-character semantic prefix', async () => {
  const generated = 'Independent writing about unrelated aspects of culture. '.repeat(90);
  const source = 'Source details involving documented performers and their work. '.repeat(90);
  const first = await checkSourceSimilarity({ generated, source });
  expect(first.pass).toBe(true);
  const copied = 'Denne helt konkrete sætning med mindst tolv særlige ord må aldrig kopieres fra en ekstern kilde.';
  const second = await checkSourceSimilarity({ generated: `${generated} ${copied}`, source: `${source} ${copied}` });
  expect(second).toMatchObject({ pass: false, complete: true, scores: { copiedPassage: true } });
  expect(state.create).toHaveBeenCalledTimes(2); // vectors reused, full lexical verdict recomputed
});

it('reuses the draft vector across different source comparisons without reusing their verdicts', async () => {
  const generated = 'Independent writing about culture and ideas. '.repeat(12);
  const first = await checkSourceSimilarity({ generated, source: 'Source one about documented performers. '.repeat(12) });
  const second = await checkSourceSimilarity({ generated, source: generated });
  expect(first.pass).toBe(true);
  expect(second.pass).toBe(false);
  expect(state.create).toHaveBeenCalledTimes(2);
});

it.each(['timeout', 'save-failure'])('does not repeat an ambiguous embedding charge: %s', async kind => {
  if (kind === 'timeout') state.create.mockRejectedValue(new Error('timeout'));
  if (kind === 'save-failure') state.failSave = true;
  await expect(getEmbedding('Exact input')).rejects.toThrow();
  state.failSave = false;
  await expect(getEmbedding('Exact input')).rejects.toThrow('requires_reconciliation');
  expect(state.create).toHaveBeenCalledTimes(1);
});

it('does not call a provider if the durable cache cannot be reserved', async () => {
  state.available = false;
  await expect(getEmbedding('Exact input')).rejects.toThrow('store_unavailable');
  expect(state.create).not.toHaveBeenCalled();
});

it.each(['liv_cost_monthly_budget_exceeded', 'liv_cost_call_limit_exceeded', 'liv_cost_policy_missing_or_expired'])(
  'retries a proven unpaid %s only through the guard and then caches the paid vector', async code => {
    state.create.mockRejectedValueOnce(new Error('SDK connection wrapper', { cause: new LivCostPretransportError(code) }));
    await expect(getEmbedding('Exact input')).rejects.toThrow();
    const denied = [...state.rows.values()][0];
    expect(denied).toMatchObject({ status: 'not_started', notStartedReason: 'cost_denied' });
    expect(denied).not.toHaveProperty('vector');
    expect(denied).not.toHaveProperty('usage');
    expect(JSON.stringify(denied)).not.toContain('SDK connection');
    const [a, b] = await Promise.all([getEmbedding('Exact input'), getEmbedding('Exact input')]);
    expect(a).toEqual(b);
    expect(await getEmbedding('Exact input')).toEqual(a);
    expect(state.create).toHaveBeenCalledTimes(2); // one denied, one permitted
    expect([...state.rows.values()][0].status).toBe('complete');
  });

it.each(['message', 'forged-cause', 'other-pretransport', 'receipt-save', 'paid-residue', 'retry-timeout'])(
  'does not unlock an unsafe unpaid-cache retry: %s', async kind => {
    let error: Error = new LivCostPretransportError('liv_cost_monthly_budget_exceeded');
    if (kind === 'message') error = new Error('liv_cost_monthly_budget_exceeded');
    if (kind === 'forged-cause') error = new Error('wrapper', { cause: { name: 'LivCostPretransportError', code: 'liv_cost_monthly_budget_exceeded', providerAttempted: false } });
    if (kind === 'other-pretransport') error = new LivCostPretransportError('liv_cost_request_unbounded');
    if (kind === 'receipt-save') state.failSave = true;
    state.create.mockRejectedValueOnce(error);
    await expect(getEmbedding('Exact input')).rejects.toThrow();
    state.failSave = false;
    if (kind === 'paid-residue') [...state.rows.values()][0].vector = [];
    if (kind === 'retry-timeout') {
      state.create.mockRejectedValueOnce(new Error('provider timeout'));
      await expect(getEmbedding('Exact input')).rejects.toThrow('provider timeout');
      expect([...state.rows.values()][0].status).toBe('processing');
    }
    await expect(getEmbedding('Exact input')).rejects.toThrow('requires_reconciliation');
    expect(state.create).toHaveBeenCalledTimes(kind === 'retry-timeout' ? 2 : 1);
  });

it.each([[], [1, 2], Array(1536).fill(0), [...Array(1535).fill(1), NaN]])('never accepts an invalid paid vector', async vector => {
  state.create.mockResolvedValue({ data: [{ embedding: vector }] });
  await expect(getEmbedding('Exact input')).rejects.toThrow('embedding_invalid');
  await expect(getEmbedding('Exact input')).rejects.toThrow('cache_invalid');
  expect(state.create).toHaveBeenCalledTimes(1);
});

it('rejects changed cached vector bytes instead of turning them into a passing comparison', async () => {
  await getEmbedding('Exact input');
  [...state.rows.values()][0].vector[3] = 1;
  await expect(getEmbedding('Exact input')).rejects.toThrow('cache_invalid');
  expect(state.create).toHaveBeenCalledTimes(1);
});
