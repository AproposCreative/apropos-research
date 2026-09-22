import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ rows: new Map<string, any>(), queue: Promise.resolve() as Promise<unknown> }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => {
  const doc = (path: string) => ({ id: path.split('/').at(-1), path, get: async () => ({ data: () => state.rows.get(path) }) });
  return { collection: (name: string) => ({ doc: (id: string) => doc(`${name}/${id}`) }),
    getAll: async (...refs: any[]) => refs.map(ref => ({ id: ref.id, data: () => state.rows.get(ref.path) })),
    runTransaction: (fn: any) => { const task = state.queue.catch(() => {}).then(() => fn({
      get: async (ref: any) => ({ data: () => structuredClone(state.rows.get(ref.path)) }),
      set: (ref: any, data: any) => state.rows.set(ref.path, structuredClone(data)),
    })); state.queue = task; return task; },
  };
} }));
import { confirmObservation, readObservationBaseline, observationKey } from '@/lib/liv/observations';
import { readObservationEvidence, readObservationReference, constrainObservationCitations } from '@/lib/liv/observation-evidence';
import { observationInput, observationWitness } from '@/lib/liv/observation-contract';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { livImageArticleHash } from '@/lib/liv/article-image-hash';
import type { GeneratedArticle } from '@/lib/liv/generate-article';

const runId = 'prepare-2026-09-22';
const quote = 'Milo fik gåsehud under koncertens sidste nummer.';
const article = { title: 'En koncert med nerve', slug: 'en-koncert', intro: 'Apropos har været til koncert.',
  content: `<p>${quote}</p>`, subtitle: 'Musik og nærvær', excerpt: 'Kort uddrag' } as GeneratedArticle;
const checkpointHash = cmsFieldHash(article as unknown as Record<string, unknown>);
const input = { runId, expectedCheckpointHash: checkpointHash, event: 'Koncert i København, hele koncerten',
  experiencedOn: '2026-09-20', articleQuote: quote, observation: 'Jeg fik gåsehud under det sidste nummer ved denne koncert.',
  confirmOwnExperience: true as const, shareWithEditorial: true as const };
const rowPath = `livDailyArticles/${runId}`;
const evidencePath = `livObservations/${observationKey(runId, checkpointHash)}`;
const fields = { title: article.title, subtitle: article.subtitle, excerpt: article.excerpt, intro: article.intro, content: article.content };
const text = Object.values(fields).join('\n\n');

beforeEach(() => {
  state.rows.clear(); state.queue = Promise.resolve();
  state.rows.set(rowPath, { status: 'skipped_factcheck', articleCheckpoint: article, articleCheckpointHash: livImageArticleHash(article) });
});
it('stores only an explicit self-attestation and replays a duplicate exactly', async () => {
  const [a, b] = await Promise.all([confirmObservation(input, 'milo-id', 'Milo'), confirmObservation(input, 'milo-id', 'Milo')]);
  expect(a).toEqual(b);
  expect(state.rows.get(evidencePath).records).toHaveLength(1);
  expect(state.rows.get(rowPath).status).toBe('skipped_factcheck');
  expect((await readObservationBaseline(runId, 'milo-id', 'Milo')).confirmed?.userId).toBe('milo-id');
  expect((await readObservationBaseline(runId, 'casper-id', 'Casper')).confirmed).toBeNull();
});
it('does not overwrite a signed record', async () => {
  await confirmObservation(input, 'milo-id', 'Milo');
  await expect(confirmObservation({ ...input, observation: 'En helt anden beskrivelse af min oplevelse.' }, 'milo-id', 'Milo')).rejects.toThrow('already_confirmed');
});
it.each([{ confirmOwnExperience: false }, { shareWithEditorial: false }, { userId: 'other' }, { witness: 'Other' },
  { observation: '[udfyld] en oplevelse som ikke er skrevet' }])('rejects missing consent, impersonation fields and empty templates %j', patch => {
  expect(observationInput.safeParse({ ...input, ...patch }).success).toBe(false);
});
it.each(['webflowItemId','cmsSaveStarted','preparationProof'])('does not mutate work after CMS handoff: %s', field => {
  state.rows.get(rowPath)[field] = 'set';
  return expect(confirmObservation(input, 'milo-id', 'Milo')).rejects.toThrow('closed');
});
it('requires attribution to the real authenticated witness and the literal quote', async () => {
  await expect(confirmObservation(input, 'casper-id', 'Casper')).rejects.toThrow('quote_mismatch');
  await expect(confirmObservation({ ...input, articleQuote: 'Milo stod helt oppe foran scenen.' }, 'milo-id', 'Milo')).rejects.toThrow('quote_mismatch');
  expect(state.rows.has(evidencePath)).toBe(false);
});
it('rejects future and impossible event dates', async () => {
  await expect(confirmObservation({ ...input, experiencedOn: '2099-01-01' }, 'milo-id', 'Milo')).rejects.toThrow('invalid');
  await expect(confirmObservation({ ...input, experiencedOn: '2026-02-31' }, 'milo-id', 'Milo')).rejects.toThrow('invalid');
});
it('does not carry confirmation onto a changed checkpoint or different run', async () => {
  await confirmObservation(input, 'milo-id', 'Milo');
  const changed = { ...article, content: article.content + '<p>Ny tekst.</p>' };
  state.rows.set(rowPath, { status: 'processing', articleCheckpoint: changed, articleCheckpointHash: livImageArticleHash(changed) });
  expect(await readObservationReference(runId, changed)).toBeUndefined();
  expect(await readObservationReference('prepare-2026-09-23', article)).toBeUndefined();
  await expect(readObservationEvidence({ runId, checkpointHash, evidenceHash: state.rows.get(evidencePath).evidenceHash }, text, fields)).rejects.toThrow('changed');
});
it('feeds the existing review with scoped testimony, not a dated public source', async () => {
  await confirmObservation(input, 'milo-id', 'Milo');
  const reference = await readObservationReference(runId, article);
  const sources = await readObservationEvidence(reference, text, fields);
  expect(sources[0].publishedAt).toBeNull();
  expect(sources[0].evidenceKind).toBe('colleague-self-attestation');
  expect(sources[0].text).toContain(input.observation);
  const raw = { units: [{ id: 'u1', opinionOnly: false, claims: [{ claim: quote, status: 'verified', explanation: 'Milos bekræftelse.',
    citations: [{ sourceId: sources[0].id, quote: input.observation }] }] }] };
  expect(constrainObservationCitations(raw, sources)).toEqual(raw);
  const wider = structuredClone(raw); wider.units[0].claims[0].claim = 'Koncerten varede mere end tre timer.';
  expect(JSON.stringify(constrainObservationCitations(wider, sources))).toContain('out-of-scope:');
  const wrongQuote = structuredClone(raw); wrongQuote.units[0].claims[0].citations[0].quote = 'Dette er ikke noget Milo har bekræftet.';
  expect(JSON.stringify(constrainObservationCitations(wrongQuote, sources))).toContain('out-of-scope:');
  expect(raw.units[0].claims[0].citations[0].sourceId).toBe('colleague-1');
});
it('rejects tampered receipt content and mismatching editorial field context', async () => {
  await confirmObservation(input, 'milo-id', 'Milo');
  const reference = await readObservationReference(runId, article);
  await expect(readObservationEvidence(reference, text + ' andet', fields)).rejects.toThrow();
  state.rows.get(evidencePath).records[0].observation = 'Ændret efter bekræftelse';
  await expect(readObservationEvidence(reference, text, fields)).rejects.toThrow('changed');
});
it('only maps the three permitted verified-account emails to witness names', () => {
  expect(observationWitness('MILO@aproposmagazine.com')).toBe('Milo');
  expect(observationWitness('casper@aproposmagazine.com')).toBe('Casper');
  expect(observationWitness('frederik@aproposmagazine.com')).toBe('Frederik Kragh');
  expect(observationWitness('other@aproposmagazine.com')).toBeNull();
});
