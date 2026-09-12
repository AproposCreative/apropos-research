import { beforeEach, expect, it, vi } from 'vitest';
import { articleFingerprint } from '@/lib/factcheck/grounded';
import type { GeneratedArticle } from '@/lib/liv/generate-article';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { livImageArticleHash } from '@/lib/liv/article-image-hash';
import { insertLivBodyMedia } from '@/lib/liv/automatic-media';
const state = vi.hoisted(() => ({ row: null as any, rows: new Map<string, any>(), calls: vi.fn(), retrieve: vi.fn(), readImage: vi.fn() }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => {
  const doc = (id: string) => ({ id,
    get: async () => ({ data: () => structuredClone(state.rows.get(id)) }),
    set: async (value: any) => {
      state.row = { ...state.rows.get(id), ...structuredClone(value) }; state.rows.set(id, state.row);
    },
  });
  return { collection: () => ({ doc }), runTransaction: async (fn: any) => fn({
    get: async (ref: ReturnType<typeof doc>) => ref.get(), create: (ref: ReturnType<typeof doc>, value: any) => {
      if (state.rows.has(ref.id)) throw new Error('already-exists');
      state.row = structuredClone(value); state.rows.set(ref.id, state.row);
    },
  }) };
} }));
vi.mock('@/lib/openai', () => ({ getOpenAIClient: () => ({ chat: { completions: { create: state.calls } } }) }));
vi.mock('@/lib/factcheck/source-reader', () => ({ retrieveSource: state.retrieve }));
vi.mock('@/lib/liv/stored-image-reader', () => ({ readLivStoredImage: state.readImage }));
import { applyLivFactPatches, repairLivArticleFacts, resumeLivFactRevision } from '@/lib/liv/fact-revision';
const article = (): GeneratedArticle => ({ title: 'Kulturens rum', subtitle: 'En feature', intro: 'Et konkret spørgsmål.',
  content: `<p>Bo er hans borgerlige navn. ${'En egen vurdering af rummelighed. '.repeat(35)}</p><p>Et modargument.</p><p>Konklusion.</p>`,
  excerpt: 'Et konkret spørgsmål.', slug: 'kulturens-rum', tags: [], section: 'Kultur', rawResponse: 'paid-original',
  researchSources: [{ title: 'A', source: 'a.dk', url: 'https://a.dk/article' }, { title: 'B', source: 'b.dk', url: 'https://b.dk/article' }] });
const patches = { patches: [{ field: 'content', before: 'Bo er hans borgerlige navn.', after: 'Kirketjeneren hedder Bo.' }] };
const report = (a: GeneratedArticle): any => ({ ok: true, verificationMethod: 'retrieved-sources', complete: false,
  articleHash: articleFingerprint([a.title, a.subtitle, a.excerpt, a.seoTitle, a.seoDescription, a.ratingReason, a.intro, a.content].filter(Boolean).join('\n\n')),
  coverage: { expectedUnits: 1, checkedUnits: 1 }, results: [{ claim: 'Bo er hans borgerlige navn.', status: 'unverifiable', evidence: 'Ikke dokumenteret', citations: [] }],
  checkedAt: new Date().toISOString(), blockers: ['Missing evidence'], sources: [] });
beforeEach(() => {
  vi.resetAllMocks(); state.row = null; state.rows.clear();
  state.calls.mockResolvedValue({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(patches) } }] });
  state.retrieve.mockImplementation(async (url: string) => ({ url, publishedAt: '2026-09-10T00:00:00Z', text: 'Kirketjeneren hedder Bo.' }));
});
it('patches an exact fact while preserving raw paid text, paragraph structure, sources and other fields', () => {
  const a = article(); const b = applyLivFactPatches(a, patches);
  expect(b.content).toContain('Kirketjeneren hedder Bo.');
  expect(a.content).toContain('borgerlige');
  expect(b.rawResponse).toBe(a.rawResponse); expect(b.researchSources).toBe(a.researchSources);
  expect(b.slug).toBe(a.slug);
});
it.each([
  { patches: [] }, { patches: [{ field: 'slug', before: 'kulturens-rum', after: 'new' }] },
  { patches: [{ field: 'content', before: '<p>', after: '<div>' }] },
  { patches: [{ field: 'content', before: 'not found', after: 'new' }] },
  { patches: [{ field: 'content', before: 'Bo', after: 'https://example.com' }] },
  { patches: [{ field: 'content', before: 'vurdering', after: 'opfattelse' }] },
])('rejects broad, ambiguous, structural or invalid edits %j', value => {
  expect(() => applyLivFactPatches(article(), value)).toThrow();
});
it('never edits image markup, captions or alt text', () => {
  const a = article(); a.content += '<figure><img src="saved.webp" alt="Bo"><figcaption>Gammel billedtekst</figcaption></figure>';
  expect(() => applyLivFactPatches(a, { patches: [{ field: 'content', before: 'Gammel billedtekst', after: 'Ny billedtekst' }] })).toThrow('scope_exceeded');
});
it('rejects a replacement that changes more than one quarter of the body', () => {
  const a = article(); a.content = '<p>Bo er hans borgerlige navn.</p>';
  expect(() => applyLivFactPatches(a, patches)).toThrow('scope_exceeded');
});
it('archives one provider result and replays the same saved revision without a second paid call', async () => {
  const a = article(); const b = await repairLivArticleFacts(a, report(a));
  expect(b.factRevisionId).toMatch(/^[a-f0-9]{64}$/);
  expect(state.row.previous.rawResponse).toBe('paid-original');
  expect(state.row.report.complete).toBe(false);
  expect(state.row.patchResult).toEqual(patches);
  expect(await repairLivArticleFacts(a, report(a))).toEqual(b);
  expect(state.calls).toHaveBeenCalledTimes(1);
});
it.each(['other-version', 'second-attempt', 'incomplete-coverage'])('refuses %s before any paid call', async kind => {
  const a = article(); const r = report(a);
  if (kind === 'other-version') r.articleHash = 'old';
  if (kind === 'second-attempt') { a.factRevisionId = 'already-revised'; a.factRevisionCount = 2; }
  if (kind === 'incomplete-coverage') r.coverage.checkedUnits = 0;
  await expect(repairLivArticleFacts(a, r)).rejects.toThrow('not_applicable');
  expect(state.calls).not.toHaveBeenCalled();
});
it('retains an ambiguous paid call instead of charging again', async () => {
  const a = article(); state.calls.mockRejectedValueOnce(new Error('timeout'));
  await expect(repairLivArticleFacts(a, report(a))).rejects.toThrow('timeout');
  await expect(repairLivArticleFacts(a, report(a))).rejects.toThrow('reconciliation');
  expect(state.calls).toHaveBeenCalledTimes(1); expect(state.row.previous).toEqual(a);
});
it('does not relabel media provenance without validating existing pixels', async () => {
  const a = article(); a.selectedImage = { articleHash: 'wrong' } as any;
  a.preparedMedia = [];
  await expect(repairLivArticleFacts(a, report(a))).rejects.toThrow('media_invalid');
  expect(state.row.status).not.toBe('complete');
  expect(state.readImage).not.toHaveBeenCalled();
});

it.each([true, false])('reuses three immutable assets only with fresh visual acceptance=%s', async pass => {
  const a = article();
  const buffers = await Promise.all(['red', 'green', 'blue'].map(background => sharp({ create: { width: 10, height: 10, channels: 3, background } }).webp().toBuffer()));
  a.preparedMedia = buffers.map((bytes, i) => ({ role: ['hero', 'body-1', 'body-2'][i], url: `https://assets.test/${i}`,
    contentHash: createHash('sha256').update(bytes).digest('hex'), alt: 'En illustration', caption: 'En billedtekst' })) as any;
  a.selectedImage = { articleHash: livImageArticleHash(a), url: 'https://assets.test/0', id: 'original-image' } as any;
  state.readImage.mockImplementation(async (url: string) => buffers[Number(url.split('/').at(-1))]);
  state.calls.mockResolvedValueOnce({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(patches) } }] })
    .mockResolvedValueOnce({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ pass, reason: 'Visual check' }) } }] })
    .mockResolvedValueOnce({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ fixable: false, corrections: [] }) } }] });
  if (pass) {
    const b = await repairLivArticleFacts(a, report(a));
    expect(b.preparedMedia).toEqual(a.preparedMedia);
    expect(b.selectedImage).toMatchObject({ id: 'original-image', articleHash: livImageArticleHash(b) });
    expect(b.selectedImage!.articleHash).not.toBe(a.selectedImage!.articleHash);
    expect(state.row.visualReview).toMatchObject({ pass: true, articleHash: livImageArticleHash(b) });
    await repairLivArticleFacts(a, report(a));
  } else {
    await expect(repairLivArticleFacts(a, report(a))).rejects.toThrow('media_rejected');
    await expect(repairLivArticleFacts(a, report(a))).rejects.toThrow('media_rejected');
    expect(state.row.status).not.toBe('complete');
  }
  expect(state.calls).toHaveBeenCalledTimes(pass ? 2 : 3); expect(state.readImage).toHaveBeenCalledTimes(3);
});

it('corrects a wrong image description once, retaining the failed review and requiring a new real review', async () => {
  const a = article();
  const buffers = await Promise.all(['red', 'green', 'blue'].map(background => sharp({ create: { width: 10, height: 10, channels: 3, background } }).webp().toBuffer()));
  a.preparedMedia = buffers.map((bytes, i) => ({ role: ['hero', 'body-1', 'body-2'][i], url: `https://assets.test/${i}`,
    contentHash: createHash('sha256').update(bytes).digest('hex'), alt: 'En stol i cirklen', caption: 'AI-illustration: Plads til fællesskab.',
    credit: 'Illustration: Apropos Magazine / AI', width: 10, height: 10, kind: 'illustration' })) as any;
  a.content = insertLivBodyMedia(a.content, a.preparedMedia!);
  a.selectedImage = { articleHash: livImageArticleHash(a), url: 'https://assets.test/0', id: 'original-image' } as any;
  state.readImage.mockImplementation(async (url: string) => buffers[Number(url.split('/').at(-1))]);
  const responses = [patches, { pass: false, reason: 'Chair is outside, not inside circle.' },
    { fixable: true, corrections: [{ role: 'body-1', alt: 'En stol uden for cirklen', caption: a.preparedMedia![1].caption }] },
    { pass: true, reason: 'Now accurate and relevant.' }];
  for (const result of responses) state.calls.mockResolvedValueOnce({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result) } }] });
  const b = await repairLivArticleFacts(a, report(a));
  expect(b.content).toContain('alt="En stol uden for cirklen"');
  expect(b.preparedMedia!.map(image => image.url)).toEqual(a.preparedMedia!.map(image => image.url));
  expect(b.selectedImage!.articleHash).toBe(livImageArticleHash(b));
  expect(state.row.visualReview.pass).toBe(false);
  expect(state.row.descriptionReview.pass).toBe(true);
  expect(state.row.descriptionReview.articleHash).toBe(livImageArticleHash(b));
  expect(state.row.previous).toEqual(a);
  expect(await repairLivArticleFacts(a, report(a))).toEqual(b);
  expect(state.calls).toHaveBeenCalledTimes(4); expect(state.readImage).toHaveBeenCalledTimes(3);
});

it('finds archived correction results without replacing them or paying again', async () => {
  const a = article(); expect(await resumeLivFactRevision(a)).toBeNull();
  const revised = await repairLivArticleFacts(a, report(a));
  expect(await resumeLivFactRevision(a)).toEqual(revised);
  expect(await resumeLivFactRevision({ ...revised, factRevisionCount: 2 })).toBeNull();
  expect(state.calls).toHaveBeenCalledTimes(1);
});

const secondClaim = 'Bo må stadig skifte mellem forskellige måder at være synlig på.';
const secondPatches = { patches: [{ field: 'content', before: secondClaim,
  after: 'Bo skifter mellem forskellige måder at være synlig på.' }] };
async function firstRevision() {
  const original = article();
  original.content = original.content.replace('Et modargument.', secondClaim);
  const first = await repairLivArticleFacts(original, report(original));
  const parentId = first.factRevisionId!;
  const parent = structuredClone(state.rows.get(parentId));
  const diagnostic = report(first);
  diagnostic.results[0].claim = secondClaim;
  state.calls.mockClear(); state.retrieve.mockClear();
  state.calls.mockResolvedValue({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(secondPatches) } }] });
  return { original, first, parentId, parent, diagnostic };
}

it('allows one distinct second fact correction, preserving its parent audit, paid originals, and count-two marker without granting factual approval', async () => {
  const { original, first, parentId, parent, diagnostic } = await firstRevision();
  const second = await repairLivArticleFacts(first, diagnostic);
  expect(second).toEqual({ ...first, content: first.content.replace(secondClaim, secondPatches.patches[0].after),
    factRevisionCount: 2, factRevisionId: expect.stringMatching(/^[a-f0-9]{64}$/) });
  expect(second.factRevisionId).not.toBe(parentId);
  expect(second.rawResponse).toBe(original.rawResponse);
  expect(state.rows.size).toBe(2);
  expect(state.rows.get(parentId)).toEqual(parent);
  const child = state.rows.get(second.factRevisionId!);
  expect(child.previous).toEqual(first);
  expect(child.previous.factRevisionId).toBe(parentId);
  expect(child.report).toEqual(diagnostic);
  expect(child.report.complete).toBe(false);
  expect(child.patchResult).toEqual(secondPatches);
  expect(child.rawResponse).toBe(JSON.stringify(secondPatches));
  expect(parent.previous).toEqual(original);
  expect(parent.rawResponse).toBe(JSON.stringify(patches));
  expect(await repairLivArticleFacts(first, diagnostic)).toEqual(second);
  expect(state.calls).toHaveBeenCalledTimes(1);
  const thirdReport = report(second); thirdReport.results[0].claim = 'En tredje ny påstand.';
  await expect(repairLivArticleFacts(second, thirdReport)).rejects.toThrow('not_applicable');
  expect(await resumeLivFactRevision(second, thirdReport)).toBeNull();
  expect(state.calls).toHaveBeenCalledTimes(1);
});

it('accepts a distinct second correction when parent object keys are recursively reordered, including selectedImage', async () => {
  const original = article();
  original.content = original.content.replace('Et modargument.', secondClaim);
  const buffers = await Promise.all(['red', 'green', 'blue'].map(background =>
    sharp({ create: { width: 10, height: 10, channels: 3, background } }).webp().toBuffer()));
  original.preparedMedia = buffers.map((bytes, i) => ({ role: ['hero', 'body-1', 'body-2'][i],
    url: `https://assets.test/${i}`, contentHash: createHash('sha256').update(bytes).digest('hex'),
    alt: 'En illustration', caption: 'En billedtekst' })) as any;
  original.selectedImage = { articleHash: livImageArticleHash(original), url: 'https://assets.test/0', id: 'original-image' } as any;
  state.readImage.mockImplementation(async (url: string) => buffers[Number(url.split('/').at(-1))]);
  for (const output of [patches, { pass: true }, secondPatches, { pass: true }]) {
    state.calls.mockResolvedValueOnce({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output) } }] });
  }
  const first = await repairLivArticleFacts(original, report(original));
  const parentId = first.factRevisionId!;
  const reverseKeys = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(reverseKeys);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).reverse()
      .map(([key, nested]) => [key, reverseKeys(nested)]));
    return value;
  };
  const parent = { ...structuredClone(state.rows.get(parentId)), article: reverseKeys(first) as GeneratedArticle };
  expect(parent.article).toEqual(first);
  expect(JSON.stringify(parent.article)).not.toBe(JSON.stringify(first));
  expect(Object.keys(parent.article.selectedImage!)).toEqual(Object.keys(first.selectedImage!).reverse());
  expect(Object.keys(parent.article.preparedMedia![0])).toEqual(Object.keys(first.preparedMedia![0]).reverse());
  state.rows.set(parentId, parent);
  const diagnostic = report(first); diagnostic.results[0].claim = secondClaim;
  const second = await repairLivArticleFacts(first, diagnostic);
  expect(second.factRevisionCount).toBe(2);
  expect(second.content).toContain(secondPatches.patches[0].after);
  expect(second.preparedMedia).toEqual(first.preparedMedia);
  expect(second.selectedImage!.articleHash).toBe(livImageArticleHash(second));
  expect(state.rows.get(parentId)).toEqual(parent);
  expect(state.rows.get(second.factRevisionId!)?.previous).toEqual(first);
  // Only parent equality changes; keep the existing order-sensitive archive-id contract.
  const inputHash = createHash('sha256').update(JSON.stringify(first)).digest('hex');
  expect(second.factRevisionId).toBe(createHash('sha256').update(`liv-fact-revision-v1:${inputHash}`).digest('hex'));
  expect(state.calls).toHaveBeenCalledTimes(4);
  expect(state.readImage).toHaveBeenCalledTimes(6);
});

it.each(['missing', 'incomplete', 'snapshot-mismatch'])('rejects a second correction with %s parent before source or model calls', async kind => {
  const { first, parentId, parent, diagnostic } = await firstRevision();
  if (kind === 'missing') state.rows.delete(parentId);
  if (kind === 'incomplete') state.rows.set(parentId, { ...parent, status: 'processing' });
  if (kind === 'snapshot-mismatch') state.rows.set(parentId, { ...parent, article: { ...first, rawResponse: 'different-snapshot' } });
  await expect(repairLivArticleFacts(first, diagnostic)).rejects.toThrow('not_applicable');
  expect(state.calls).not.toHaveBeenCalled(); expect(state.retrieve).not.toHaveBeenCalled();
});

it.each([
  ['prior-failure-shorter', 'Bo er hans borgerlige navn.', 'HANS  BORGERLIGE navn'],
  ['prior-failure-longer', 'hans borgerlige navn', 'Bo er hans borgerlige navn.'],
  ['patch-before-shorter', patches.patches[0].before, 'Bo er hans borgerlige navn'],
  ['patch-before-longer', patches.patches[0].before, 'Bo er hans borgerlige navn, ifølge teksten.'],
  ['patch-after-shorter', patches.patches[0].after, 'KIRKETJENEREN hedder Bo'],
  ['patch-after-longer', patches.patches[0].after, 'Kirketjeneren hedder Bo, ifølge teksten.'],
])('rejects overlapping %s rather than treating different punctuation/case or excerpt length as a new defect', async (kind, oldSpan, newClaim) => {
  const { first, parentId, parent, diagnostic } = await firstRevision();
  // Isolate each historical span source so the guard is independently covered.
  parent.report.results = kind.startsWith('prior-failure')
    ? [{ ...parent.report.results[0], claim: oldSpan }] : [];
  parent.patchResult = { patches: kind.startsWith('patch-') ? [{ field: 'content',
    before: kind.startsWith('patch-before') ? oldSpan : 'Et helt andet gammelt udsagn.',
    after: kind.startsWith('patch-after') ? oldSpan : 'Et helt andet rettet udsagn.',
  }] : [] };
  state.rows.set(parentId, parent);
  diagnostic.results[0].claim = newClaim;
  await expect(repairLivArticleFacts(first, diagnostic)).rejects.toThrow('not_applicable');
  expect(state.calls).not.toHaveBeenCalled(); expect(state.retrieve).not.toHaveBeenCalled();
  expect(state.rows.size).toBe(1);
  expect(state.rows.get(parentId)).toEqual(parent);
});

it('resumes an exact-hash saved failure into a distinct correction and reuses the archived result without a fresh verification call', async () => {
  const { first, parentId, parent, diagnostic } = await firstRevision();
  const corrected = await resumeLivFactRevision(first, diagnostic);
  expect(corrected?.factRevisionCount).toBe(2);
  expect(corrected?.content).toContain(secondPatches.patches[0].after);
  expect(state.rows.get(parentId)).toEqual(parent);
  expect(state.rows.get(corrected!.factRevisionId!)?.report).toEqual(diagnostic);
  expect(await resumeLivFactRevision(first, diagnostic)).toEqual(corrected);
  expect(state.calls).toHaveBeenCalledTimes(1);
  expect(state.calls.mock.calls[0][0].messages[0].content).toContain('Du er faktaredaktør');
});

it.each(['stale-hash', 'complete-report', 'incomplete-coverage', 'diagnostic-error', 'all-verified'])('ignores %s prior diagnostics without paid source/model calls or an audit write', async kind => {
  const { first, parentId, parent, diagnostic } = await firstRevision();
  if (kind === 'stale-hash') diagnostic.articleHash = parent.report.articleHash;
  if (kind === 'complete-report') diagnostic.complete = true;
  if (kind === 'incomplete-coverage') diagnostic.coverage.checkedUnits = 0;
  if (kind === 'diagnostic-error') diagnostic.diagnostic = { code: 'model_response_incomplete', message: 'incomplete' };
  if (kind === 'all-verified') diagnostic.results[0].status = 'verified';
  expect(await resumeLivFactRevision(first, diagnostic)).toBeNull();
  expect(state.calls).not.toHaveBeenCalled(); expect(state.retrieve).not.toHaveBeenCalled();
  expect(state.rows.size).toBe(1); expect(state.rows.get(parentId)).toEqual(parent);
});
