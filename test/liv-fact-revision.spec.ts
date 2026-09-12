import { beforeEach, expect, it, vi } from 'vitest';
import { articleFingerprint } from '@/lib/factcheck/grounded';
import type { GeneratedArticle } from '@/lib/liv/generate-article';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { livImageArticleHash } from '@/lib/liv/article-image-hash';
import { insertLivBodyMedia } from '@/lib/liv/automatic-media';
const state = vi.hoisted(() => ({ row: null as any, calls: vi.fn(), retrieve: vi.fn(), readImage: vi.fn() }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => {
  const ref = { get: async () => ({ data: () => state.row }), set: async (value: any) => { state.row = { ...state.row, ...value }; } };
  return { collection: () => ({ doc: () => ref }), runTransaction: async (fn: any) => fn({
    get: async () => ({ data: () => state.row }), create: (_ref: any, value: any) => { state.row = value; },
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
  vi.resetAllMocks(); state.row = null;
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
  if (kind === 'second-attempt') a.factRevisionId = 'already-revised';
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
  expect(await resumeLivFactRevision(revised)).toBeNull();
  expect(state.calls).toHaveBeenCalledTimes(1);
});
