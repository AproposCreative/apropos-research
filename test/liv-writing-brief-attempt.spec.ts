import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ rows: new Map<string, Record<string, any>>(), create: vi.fn(),
  dbAvailable: true, keyAvailable: true, failSave: false, queue: Promise.resolve() as Promise<unknown> }));
vi.mock('@/lib/openai', () => ({ getOpenAIClient: () => state.keyAvailable ? { chat: { completions: { create: state.create } } } : null }));
vi.mock('@/lib/liv/model-config', () => ({ livModels: () => ({ utility: 'gpt-5.6-luna' }) }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => state.dbAvailable ? {
  collection: (collection: string) => ({ doc: (id: string) => ({ id: `${collection}/${id}`,
    set: async (patch: object) => {
      if (state.failSave) throw new Error('save failed');
      state.rows.set(`${collection}/${id}`, { ...state.rows.get(`${collection}/${id}`), ...structuredClone(patch) });
    },
  }) }),
  runTransaction: (fn: any) => {
    const task = state.queue.catch(() => {}).then(() => fn({
      get: async (ref: any) => ({ data: () => structuredClone(state.rows.get(ref.id)) }),
      create: (ref: any, row: object) => state.rows.set(ref.id, structuredClone(row)),
      set: (ref: any, patch: object) => state.rows.set(ref.id, { ...state.rows.get(ref.id), ...structuredClone(patch) }),
    }));
    state.queue = task; return task;
  },
} : null }));
import { writingBriefAttempt } from '@/lib/liv/writing-brief-attempt';
import { buildLivWritingBrief } from '@/lib/liv/writing-brief';
import { withLivCostContext } from '@/lib/liv/cost-context';
import { LivCostPretransportError } from '@/lib/liv/cost-errors';

const request = { model: 'gpt-5.6-luna', max_completion_tokens: 6000,
  messages: [{ role: 'user' as const, content: 'Source input and exact passage IDs.' }] };
const response = (raw = '{}', finishReason = 'stop') => ({ id: 'chat-test', model: request.model,
  choices: [{ finish_reason: finishReason, message: { content: raw, refusal: null } }],
  usage: { prompt_tokens: 100, completion_tokens: 200 } });
const sources = [
  { id: 'S1', url: 'https://one.example/story', title: 'Film', text: 'Et dokumenteret navn og en handling i et sommerhus.', contentHash: 'h1', retrievedAt: '2026-09-28T08:00:00Z', publishedAt: null },
  { id: 'S2', url: 'https://two.example/story', title: 'Kontekst', text: 'En uafhængig kilde beskriver hvem der har instrueret filmen.', contentHash: 'h2', retrievedAt: '2026-09-28T08:00:00Z', publishedAt: null },
];
const notes = [
  { sourceId: 'S1', kind: 'fact', summary: 'Handlingen foregår i et sommerhus.', evidenceId: 'S1P1' },
  { sourceId: 'S2', kind: 'fact', summary: 'Den anden kilde nævner instruktøren.', evidenceId: 'S2P1' },
  { sourceId: 'S1', kind: 'fact', summary: 'Den første kilde dokumenterer et navn.', evidenceId: 'S1P1' },
];
beforeEach(() => {
  vi.resetAllMocks(); state.rows.clear(); state.dbAvailable = true; state.keyAvailable = true; state.failSave = false;
  state.queue = Promise.resolve(); state.create.mockResolvedValue(response());
});

it('claims before transport, archives exact input/output/usage and reuses concurrent and sequential calls', async () => {
  state.create.mockImplementation(async () => {
    expect([...state.rows.values()][0]).toMatchObject({ status: 'processing', runId: 'reserve-test',
      requestJson: JSON.stringify(request) });
    return response('retained paid output');
  });
  const [a,b] = await withLivCostContext({ runId: 'reserve-test', stage: 'research-brief' }, () =>
    Promise.all([writingBriefAttempt('liv-daily', request, 45000), writingBriefAttempt('liv-daily', request, 45000)]));
  expect(a).toEqual(b); a.raw = 'mutated';
  state.keyAvailable = false;
  expect(await writingBriefAttempt('liv-daily', request, 45000)).toEqual(b);
  expect(state.create).toHaveBeenCalledTimes(1);
  expect(state.create).toHaveBeenCalledWith(request, { timeout: 45000, maxRetries: 0 });
  expect([...state.rows.values()][0]).toMatchObject({ status: 'complete', raw: 'retained paid output',
    usage: { prompt_tokens: 100 }, providerResponseId: 'chat-test', rawHash: expect.any(String) });
});

it('isolates private scopes and different exact inputs, excluding retrieval time from the prompt identity', async () => {
  state.create.mockResolvedValue(response(JSON.stringify({ notes })));
  await buildLivWritingBrief(sources, 'Film', { sourceScope: 'writer-user-a' });
  await buildLivWritingBrief(sources.map(s => ({ ...s, retrievedAt: '2026-09-28T10:00:00Z' })), 'Film', { sourceScope: 'writer-user-a' });
  expect(state.create).toHaveBeenCalledTimes(1);
  await buildLivWritingBrief(sources, 'Film', { sourceScope: 'writer-user-b' });
  await buildLivWritingBrief(sources, 'Another topic', { sourceScope: 'writer-user-a' });
  expect(state.create).toHaveBeenCalledTimes(3);
});

it.each(['json', 'evidence', 'insufficient', 'truncated', 'refused'])('preserves paid rejected output with the actual validation reason: %s', async kind => {
  const raw = kind === 'json' ? '{' : JSON.stringify({ notes: notes.map(n => ({ ...n,
    ...(kind === 'evidence' ? { evidenceId: 'S99P1' } : {}),
    ...(kind === 'insufficient' ? { kind: 'opinion' } : {}) })) });
  const result = response(raw, kind === 'truncated' ? 'length' : 'stop');
  if (kind === 'refused') Object.assign(result.choices[0].message, { refusal: 'No' });
  state.create.mockResolvedValue(result);
  await expect(buildLivWritingBrief(sources, 'Film')).rejects.toThrow();
  await expect(buildLivWritingBrief(sources, 'Film')).rejects.toThrow();
  expect(state.create).toHaveBeenCalledTimes(1);
  const row = [...state.rows.values()][0];
  expect(row).toMatchObject({ status: 'complete', raw, validation: { valid: false, code: expect.stringMatching(/^research_brief_/) } });
  if (kind === 'insufficient') expect(row.validation).toMatchObject({ code: 'research_brief_insufficient',
    counts: { hosts: 2, facts: 0, opinions: 3, duplicateNotes: 0 } });
});

it.each(['timeout', 'save-failure', 'forged-budget'])('never repurchases ambiguous output: %s', async kind => {
  if (kind === 'save-failure') state.failSave = true;
  else state.create.mockRejectedValue(new Error(kind === 'timeout' ? 'timeout' : 'liv_cost_call_limit_exceeded'));
  await expect(writingBriefAttempt('liv-daily', request, 45000)).rejects.toThrow();
  state.failSave = false;
  await expect(writingBriefAttempt('liv-daily', request, 45000)).rejects.toThrow('research_brief_requires_reconciliation');
  expect(state.create).toHaveBeenCalledTimes(1);
});

it('allows a guarded attempt only after a typed pretransport budget denial', async () => {
  state.create.mockRejectedValueOnce(new Error('connection', { cause: new LivCostPretransportError('liv_cost_call_limit_exceeded') }));
  await expect(writingBriefAttempt('liv-daily', request, 45000)).rejects.toThrow();
  expect([...state.rows.values()][0]).toMatchObject({ status: 'not_started', notStartedReason: 'cost_denied' });
  expect([...state.rows.values()][0]).not.toHaveProperty('raw');
  await writingBriefAttempt('liv-daily', request, 45000);
  expect(state.create).toHaveBeenCalledTimes(2);
});

it.each(['store', 'key', 'tampered'])('fails closed without paying when %s is unavailable or invalid', async kind => {
  if (kind === 'store') state.dbAvailable = false;
  if (kind === 'key') state.keyAvailable = false;
  if (kind === 'tampered') {
    await writingBriefAttempt('liv-daily', request, 45000);
    [...state.rows.values()][0].raw = 'changed'; state.create.mockClear();
  }
  await expect(writingBriefAttempt('liv-daily', request, 45000)).rejects.toThrow();
  expect(state.create).not.toHaveBeenCalled();
});
