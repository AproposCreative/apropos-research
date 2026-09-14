import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ rows: new Map<string, any>(), calls: vi.fn(), tail: Promise.resolve(), failRawSave: false }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => {
  const doc = (id: string): any => ({ id, collection: (name: string) => ({ doc: (child: string) => doc(`${id}/${name}/${child}`) }) });
  return { collection: () => ({ doc }), runTransaction: (fn: any) => {
    const run = state.tail.then(() => fn({
      get: async (ref: { id: string }) => ({ data: () => structuredClone(state.rows.get(ref.id)) }),
      create: (ref: { id: string }, row: any) => { if (state.rows.has(ref.id)) throw Error('exists'); state.rows.set(ref.id, structuredClone(row)); },
      update: (ref: { id: string }, update: any) => {
        if (state.failRawSave && typeof update.rawResponse === 'string') throw Error('storage_unavailable');
        state.rows.set(ref.id, { ...state.rows.get(ref.id), ...structuredClone(update) });
      },
    })); state.tail = run.then(() => undefined, () => undefined); return run;
  } };
} }));
vi.mock('@/lib/openai', () => ({ getOpenAIClient: () => ({ chat: { completions: { create: state.calls } } }) }));
vi.mock('@/lib/liv/voice', () => ({ loadLivVoice: () => ({ text: 'Livs kanoniske stemme', hash: 'voice-hash', version: 'test' }) }));
import { prepareLivShorteningProposal } from '@/lib/liv/shortening-proposal';
import { currentLivCostContext } from '@/lib/liv/cost-context';
import { LivCostPretransportError } from '@/lib/liv/cost-errors';
import type { GeneratedArticle } from '@/lib/liv/generate-article';
const words = (n: number) => Array(n).fill('kultur').join(' ');
const article = { title: 'Artiklen', intro: 'Introduktion', content: `<p>${words(200)}</p>`.repeat(3), researchSources: [] } as unknown as GeneratedArticle;
const input = { itemId: 'a'.repeat(24), requestId: 'shorten-test-001', expectedPayloadHash: 'b'.repeat(64), expectedCmsHash: 'c'.repeat(64), targetWords: 500 };
const response = () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ bodyEdits: [{ index: 0, before: words(200), after: words(100) }] }) } }], usage: { completion_tokens: 200 } });
beforeEach(() => { state.rows.clear(); state.tail = Promise.resolve(); state.failRawSave = false; state.calls.mockReset().mockResolvedValue(response()); });
it('persists paid output and replays exactly without generating again', async () => {
  const result = await prepareLivShorteningProposal(input, article);
  expect(result).toMatchObject({ status: 'preview', beforeWords: 600, afterWords: 500, publicationReady: false, editorialReviewRequired: true });
  expect(await prepareLivShorteningProposal(input, article)).toEqual(result);
  expect(state.calls).toHaveBeenCalledTimes(1);
  const saved = [...state.rows.values()][0];
  expect(saved.rawResponse).toBe(response().choices[0].message.content);
  expect(saved.article).toEqual(article); expect(saved.voice.hash).toBe('voice-hash');
});
it('uses a bounded call inside the existing cost context and includes Liv voice', async () => {
  state.calls.mockImplementation(async (body, options) => {
    expect(currentLivCostContext()).toMatchObject({ stage: 'shortening-proposal' });
    expect(body.max_completion_tokens).toBe(6000); expect(options).toEqual({ timeout: 90000, maxRetries: 0 });
    expect(body.messages[0].content).toContain('Livs kanoniske stemme');
    return response();
  });
  await prepareLivShorteningProposal(input, article);
});
it('rejects changed input under an existing request ID', async () => {
  await prepareLivShorteningProposal(input, article);
  await expect(prepareLivShorteningProposal({ ...input, targetWords: 490 }, article)).rejects.toThrow('request_conflict');
  await expect(prepareLivShorteningProposal(input, { ...article, title: 'Changed' })).rejects.toThrow('request_conflict');
  expect(state.calls).toHaveBeenCalledTimes(1);
});
it('retains invalid paid JSON and never retries it with the provider', async () => {
  state.calls.mockResolvedValue({ choices: [{ finish_reason: 'stop', message: { content: 'invalid' } }] });
  for (let i = 0; i < 2; i++) await expect(prepareLivShorteningProposal(input, article)).rejects.toThrow('candidate_invalid');
  expect(state.calls).toHaveBeenCalledTimes(1); expect([...state.rows.values()][0].rawResponse).toBe('invalid');
});
it.each(['length', 'content_filter'])('retains incomplete output %s', async finish_reason => {
  state.calls.mockResolvedValue({ ...response(), choices: [{ ...response().choices[0], finish_reason }] });
  for (let i = 0; i < 2; i++) await expect(prepareLivShorteningProposal(input, article)).rejects.toThrow('model_incomplete');
  expect(state.calls).toHaveBeenCalledTimes(1);
});
it('does not regenerate after a transport exception', async () => {
  state.calls.mockRejectedValueOnce(Error('lost connection'));
  await expect(prepareLivShorteningProposal(input, article)).rejects.toThrow('lost connection');
  await expect(prepareLivShorteningProposal(input, article)).rejects.toThrow('requires_reconciliation');
  expect(state.calls).toHaveBeenCalledTimes(1);
});
it('does not regenerate if saving provider output failed', async () => {
  state.failRawSave = true;
  await expect(prepareLivShorteningProposal(input, article)).rejects.toThrow('storage_unavailable');
  state.failRawSave = false;
  await expect(prepareLivShorteningProposal(input, article)).rejects.toThrow('requires_reconciliation');
  expect(state.calls).toHaveBeenCalledTimes(1);
});
it('serializes competing requests before model dispatch', async () => {
  const results = await Promise.allSettled([prepareLivShorteningProposal(input, article), prepareLivShorteningProposal(input, article)]);
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect(state.calls).toHaveBeenCalledTimes(1);
});
it('rebuilds preview from saved output without another call after a preview interruption', async () => {
  const first = await prepareLivShorteningProposal(input, article);
  const row = [...state.rows.values()][0]; delete row.proposal; row.status = 'generated';
  expect(await prepareLivShorteningProposal(input, article)).toEqual(first);
  expect(state.calls).toHaveBeenCalledTimes(1);
});
it('permits the same request after a proven pretransport cost denial, retaining the attempt', async () => {
  state.calls.mockRejectedValueOnce(new LivCostPretransportError('liv_budget_exceeded'));
  await expect(prepareLivShorteningProposal(input, article)).rejects.toThrow('liv_budget_exceeded');
  expect(await prepareLivShorteningProposal(input, article)).toMatchObject({ status: 'preview' });
  expect([...state.rows.values()].some(row => row.status === 'not_started' && row.providerAttempted === false)).toBe(true);
  expect(state.calls).toHaveBeenCalledTimes(2); // First was denied before transport.
});
it('does not treat an untrusted cost-error message as proof that transport was skipped', async () => {
  state.calls.mockRejectedValueOnce(new Error('liv_budget_exceeded'));
  await expect(prepareLivShorteningProposal(input, article)).rejects.toThrow();
  await expect(prepareLivShorteningProposal(input, article)).rejects.toThrow('requires_reconciliation');
  expect(state.calls).toHaveBeenCalledTimes(1);
});
