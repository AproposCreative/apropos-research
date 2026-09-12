import { beforeEach, expect, it, vi } from 'vitest';
import { articleFingerprint } from '@/lib/factcheck/grounded';
import type { GeneratedArticle } from '@/lib/liv/generate-article';
import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import sharp from 'sharp';
import { livImageArticleHash } from '@/lib/liv/article-image-hash';
import { insertLivBodyMedia } from '@/lib/liv/automatic-media';
import { LivCostPretransportError } from '@/lib/liv/cost-errors';
const state = vi.hoisted(() => ({ row: null as any, rows: new Map<string, any>(), calls: vi.fn(), retrieve: vi.fn(), readImage: vi.fn(), transactionTail: Promise.resolve() }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => {
  const doc = (id: string) => ({ id,
    get: async () => ({ data: () => structuredClone(state.rows.get(id)) }),
    set: async (value: any) => {
      state.row = { ...state.rows.get(id), ...structuredClone(value) }; state.rows.set(id, state.row);
    },
  });
  return { collection: () => ({ doc }), runTransaction: (fn: any) => {
    // Serialize transactional claims to model Firestore's conflicting-write
    // retries. Concurrent owners may not both consume one not_started receipt.
    const result = state.transactionTail.then(() => fn({
    get: async (ref: ReturnType<typeof doc>) => ref.get(), create: (ref: ReturnType<typeof doc>, value: any) => {
      if (state.rows.has(ref.id)) throw new Error('already-exists');
      state.row = structuredClone(value); state.rows.set(ref.id, state.row);
    },
    update: async (ref: ReturnType<typeof doc>, value: any) => {
      const row = { ...state.rows.get(ref.id) };
      for (const [key, entry] of Object.entries(value)) {
        if (entry instanceof FieldValue && entry.isEqual(FieldValue.delete())) delete row[key];
        else row[key] = structuredClone(entry);
      }
      state.row = row; state.rows.set(ref.id, row);
    },
    }));
    state.transactionTail = result.then(() => undefined, () => undefined);
    return result;
  } };
} }));
vi.mock('@/lib/openai', () => ({ getOpenAIClient: () => ({ chat: { completions: { create: state.calls } } }) }));
vi.mock('@/lib/factcheck/source-reader', () => ({ retrieveSource: state.retrieve }));
vi.mock('@/lib/liv/stored-image-reader', () => ({ readLivStoredImage: state.readImage }));
import { applyLivFactPatches, applyLivTargetedPatches, repairLivArticleFacts, resumeLivFactRevision } from '@/lib/liv/fact-revision';
import { checkLivArticleLength } from '@/lib/liv/article-length';
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
  vi.resetAllMocks(); state.row = null; state.rows.clear(); state.transactionTail = Promise.resolve();
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

function seedPaidLegacyRevision(first: GeneratedArticle, diagnostic: any) {
  const inputHash = createHash('sha256').update(JSON.stringify(first)).digest('hex');
  const id = createHash('sha256').update(`liv-fact-revision-v1:${inputHash}`).digest('hex');
  state.rows.set(id, { inputHash, previous: first, report: diagnostic, patchResult: secondPatches,
    rawResponse: JSON.stringify(secondPatches), finishReason: 'stop', status: 'processing' });
}

it('resumes an already-paid legacy second correction, preserving its parent audit and count-two marker without granting factual approval', async () => {
  const { original, first, parentId, parent, diagnostic } = await firstRevision();
  seedPaidLegacyRevision(first, diagnostic);
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
  expect(state.calls).not.toHaveBeenCalled();
  const thirdReport = report(second); thirdReport.results[0].claim = 'En tredje ny påstand.';
  await expect(repairLivArticleFacts(second, thirdReport)).rejects.toThrow('not_applicable');
  expect(await resumeLivFactRevision(second, thirdReport)).toBeNull();
  expect(state.calls).not.toHaveBeenCalled();
});

it('resumes a paid legacy correction when parent object keys are recursively reordered, including selectedImage', async () => {
  const original = article();
  original.content = original.content.replace('Et modargument.', secondClaim);
  const buffers = await Promise.all(['red', 'green', 'blue'].map(background =>
    sharp({ create: { width: 10, height: 10, channels: 3, background } }).webp().toBuffer()));
  original.preparedMedia = buffers.map((bytes, i) => ({ role: ['hero', 'body-1', 'body-2'][i],
    url: `https://assets.test/${i}`, contentHash: createHash('sha256').update(bytes).digest('hex'),
    alt: 'En illustration', caption: 'En billedtekst' })) as any;
  original.selectedImage = { articleHash: livImageArticleHash(original), url: 'https://assets.test/0', id: 'original-image' } as any;
  state.readImage.mockImplementation(async (url: string) => buffers[Number(url.split('/').at(-1))]);
  for (const output of [patches, { pass: true }, { pass: true }]) {
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
  seedPaidLegacyRevision(first, diagnostic);
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
  expect(state.calls).toHaveBeenCalledTimes(3);
  expect(state.readImage).toHaveBeenCalledTimes(6);
});

it.each(['missing', 'incomplete', 'snapshot-mismatch'])('rejects a second correction with %s parent before source or model calls', async kind => {
  const { first, parentId, parent, diagnostic } = await firstRevision();
  seedPaidLegacyRevision(first, diagnostic);
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
  seedPaidLegacyRevision(first, diagnostic);
  await expect(repairLivArticleFacts(first, diagnostic)).rejects.toThrow('not_applicable');
  expect(state.calls).not.toHaveBeenCalled(); expect(state.retrieve).not.toHaveBeenCalled();
  expect(state.rows.size).toBe(2);
  expect(state.rows.get(parentId)).toEqual(parent);
});

it('resumes an exact-hash first failure and reuses the archived result without a fresh verification call', async () => {
  const first = article(); const diagnostic = report(first);
  const corrected = await resumeLivFactRevision(first, diagnostic);
  expect(corrected?.factRevisionCount).toBe(1);
  expect(corrected?.content).toContain(patches.patches[0].after);
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

function longArticle() {
  const paragraphs = Array.from({ length: 10 }, (_, index) => `Afsnit${index} ${Array(index === 0 ? 149 : 99).fill('kultur').join(' ')}`);
  const a: GeneratedArticle = { ...article(), subjectType: 'film' };
  a.content = paragraphs.map(text => `<p>${text}</p>`).join('');
  return { a, paragraphs, output: { patches: [], bodyEdits: paragraphs.slice(5).map((before, i) => ({ index: i + 5, before, after: '' })) } };
}

it('shortens a 1050-word paid draft to 550 while preserving figures, headings, subject type and paid provenance', () => {
  const { a, output } = longArticle();
  const figure = '<figure data-id="paid"><img src="https://assets.test/1" alt="Gemte pixels"><figcaption>Credit må ikke ændres.</figcaption></figure>';
  a.content = a.content.replace('<p>Afsnit3', `${figure}<h2>En egen tese</h2><p>Afsnit3`) + figure.replace('paid', 'paid2');
  expect(checkLivArticleLength(a.content).wordCount).toBe(1050);
  const revised = applyLivTargetedPatches(a, output, checkLivArticleLength(a.content));
  expect(checkLivArticleLength(revised.content)).toMatchObject({ wordCount: 550, pass: true });
  expect(revised.content).toContain(figure);
  expect(revised.content).toContain('<h2>En egen tese</h2>');
  expect(revised.rawResponse).toBe(a.rawResponse);
  expect(revised.subjectType).toBe(a.subjectType);
  expect(revised.researchSources).toBe(a.researchSources);
  expect(a.content).toContain('Afsnit9');
});

it('corrects an actual factual failure AND length in one archived text call, never fabricating a successful report', async () => {
  const { a, output } = longArticle();
  a.intro = 'Filmen hedder Oasis Live 25.';
  a.content = a.content.replace('Afsnit0', 'Oasis Live 25');
  const diagnostic = report(a); diagnostic.results[0].claim = a.intro;
  const combined = { ...output, patches: [
    { field: 'intro', before: a.intro, after: 'Filmen hedder Oasis: Don’t Look Back In Anger.' },
    { field: 'content', before: 'Oasis Live 25', after: 'Oasis: Don’t Look Back In Anger' },
  ] };
  state.calls.mockResolvedValueOnce({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(combined) } }] });
  const length = checkLivArticleLength(a.content);
  const revised = await repairLivArticleFacts(a, diagnostic, { length });
  expect(revised.intro).toContain('Don’t Look Back In Anger');
  expect(revised.content).toContain('Don’t Look Back In Anger');
  expect(checkLivArticleLength(revised.content).pass).toBe(true);
  expect(revised.factRevisionCount).toBe(1);
  expect(state.row.report).toEqual(diagnostic);
  expect(state.row.report.complete).toBe(false);
  expect(state.row.length).toEqual(length);
  expect(state.row.rawResponse).toBe(JSON.stringify(combined));
  expect(await resumeLivFactRevision(a, diagnostic, { length })).toEqual(revised);
  expect(state.calls).toHaveBeenCalledTimes(1);
  expect(await resumeLivFactRevision(revised, report(revised))).toBeNull();
  await expect(repairLivArticleFacts(revised, report(revised))).rejects.toThrow('not_applicable');
  expect(state.calls).toHaveBeenCalledTimes(1);
});

it('supports explicit length-only correction without inventing a grounded fact report or starting it during resume', async () => {
  const { a, output } = longArticle(); const length = checkLivArticleLength(a.content);
  expect(await resumeLivFactRevision(a, undefined, { length })).toBeNull();
  state.calls.mockResolvedValueOnce({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output) } }] });
  const revised = await repairLivArticleFacts(a, undefined, { length });
  expect(state.row.report).toBeUndefined();
  expect(checkLivArticleLength(revised.content).pass).toBe(true);
  expect(await resumeLivFactRevision(a)).toEqual(revised);
  expect(state.calls).toHaveBeenCalledTimes(1);
});

it('does not replace an already-paid legacy factual response to meet a newly requested length policy', async () => {
  const { a } = longArticle(); a.intro = patches.patches[0].before;
  const originalPatches = { patches: [{ ...patches.patches[0], field: 'intro' }] };
  state.calls.mockResolvedValueOnce({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(originalPatches) } }] });
  const revised = await repairLivArticleFacts(a, report(a));
  expect(await repairLivArticleFacts(a, report(a), { length: checkLivArticleLength(a.content) })).toEqual(revised);
  expect(await resumeLivFactRevision(a, report(a), { length: checkLivArticleLength(a.content) })).toEqual(revised);
  expect(checkLivArticleLength(revised.content).pass).toBe(false);
  expect(state.calls).toHaveBeenCalledTimes(1);
  expect(state.row.length).toBeUndefined();
});

it('replays saved raw JSON after interruption between raw persistence and parsed-result persistence, without another call', async () => {
  const { a, output } = longArticle(); const length = checkLivArticleLength(a.content);
  const inputHash = createHash('sha256').update(JSON.stringify(a)).digest('hex');
  const id = createHash('sha256').update(`liv-fact-revision-v1:${inputHash}`).digest('hex');
  state.rows.set(id, { inputHash, previous: a, length, status: 'processing', rawResponse: JSON.stringify(output), finishReason: 'stop' });
  const revised = await resumeLivFactRevision(a);
  expect(checkLivArticleLength(revised!.content).pass).toBe(true);
  expect(state.calls).not.toHaveBeenCalled();
  expect(state.retrieve).not.toHaveBeenCalled();
  expect(state.rows.get(id).rawResponse).toBe(JSON.stringify(output));
});

it.each(['invalid-json', 'out-of-range', 'null', 'false', '0'])('retains a %s paid length response and never pays to reroll it', async kind => {
  const { a, output } = longArticle(); const length = checkLivArticleLength(a.content);
  if (kind === 'out-of-range') output.bodyEdits = output.bodyEdits.slice(0, 1);
  const raw = kind === 'invalid-json' ? 'not json' : ['null', 'false', '0'].includes(kind) ? kind : JSON.stringify(output);
  state.calls.mockResolvedValueOnce({ choices: [{ finish_reason: 'stop', message: { content: raw } }] });
  await expect(repairLivArticleFacts(a, undefined, { length })).rejects.toThrow();
  await expect(repairLivArticleFacts(a, undefined, { length })).rejects.toThrow();
  expect(state.calls).toHaveBeenCalledTimes(1);
  expect(state.row.rawResponse).toBe(raw);
  expect(state.row.status).not.toBe('complete');
});

it.each([true, false])('reuses all three paid assets for a combined shortening only after fresh relevance acceptance=%s', async pass => {
  const { a, output } = longArticle();
  const buffers = await Promise.all(['red', 'green', 'blue'].map(background =>
    sharp({ create: { width: 10, height: 10, channels: 3, background } }).webp().toBuffer()));
  a.preparedMedia = buffers.map((bytes, i) => ({ role: ['hero', 'body-1', 'body-2'][i], url: `https://assets.test/${i}`,
    contentHash: createHash('sha256').update(bytes).digest('hex'), alt: 'Et gemt motiv', caption: 'AI-illustration: Kulturens rum.' })) as any;
  a.content = insertLivBodyMedia(a.content, a.preparedMedia!);
  a.selectedImage = { articleHash: livImageArticleHash(a), url: 'https://assets.test/0', id: 'paid-hero' } as any;
  state.readImage.mockImplementation(async (url: string) => buffers[Number(url.split('/').at(-1))]);
  for (const result of [output, { pass, reason: 'Actual new relevance review' }, { fixable: false }]) {
    state.calls.mockResolvedValueOnce({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result) } }] });
  }
  const args = [a, undefined, { length: checkLivArticleLength(a.content) }] as const;
  if (pass) {
    const revised = await repairLivArticleFacts(...args);
    expect(checkLivArticleLength(revised.content)).toMatchObject({ wordCount: 550, pass: true });
    expect(revised.preparedMedia).toEqual(a.preparedMedia);
    expect(revised.selectedImage!.articleHash).toBe(livImageArticleHash(revised));
    expect(revised.selectedImage!.articleHash).not.toBe(a.selectedImage!.articleHash);
    expect(state.row.visualReviewRaw).toContain('Actual new relevance review');
    expect(await resumeLivFactRevision(a)).toEqual(revised);
  } else {
    await expect(repairLivArticleFacts(...args)).rejects.toThrow('media_rejected');
    await expect(resumeLivFactRevision(a)).rejects.toThrow('media_rejected');
    expect(state.row.status).not.toBe('complete');
  }
  expect(state.calls).toHaveBeenCalledTimes(pass ? 2 : 3);
  expect(state.readImage).toHaveBeenCalledTimes(3);
});

it.each(['caption', 'linked-attribution', 'quote', 'duplicate-index', 'html', 'replacement', 'stale-evidence'])('rejects unsafe %s shortening', kind => {
  const { a, output } = longArticle();
  let length = checkLivArticleLength(a.content);
  if (kind === 'caption') a.content = a.content.replace('<p>Afsnit5', '<figure><p>Afsnit5').replace('<p>Afsnit6', '</figure><p>Afsnit6');
  if (kind === 'quote') a.content = a.content.replace('<p>Afsnit5', '<blockquote><p>Afsnit5').replace('<p>Afsnit6', '</blockquote><p>Afsnit6');
  if (kind === 'linked-attribution') a.content = a.content.replace('Afsnit5', '<a href="https://source.test">Afsnit5</a>');
  if (kind === 'duplicate-index') output.bodyEdits.push(output.bodyEdits[0]);
  if (kind === 'html') output.bodyEdits[0].after = '<script>bad</script>';
  if (kind === 'replacement') output.bodyEdits = Array.from({ length: 10 }, (_, index) => ({ index,
    before: [...a.content.matchAll(/<p>(.*?)<\/p>/g)][index]?.[1] || '', after: 'ny tekst' }));
  if (kind === 'stale-evidence') length = { ...length, wordCount: 999 };
  else length = checkLivArticleLength(a.content);
  expect(() => applyLivTargetedPatches(a, output, length)).toThrow();
});

const revisionStages = ['textPatch', 'visualReview', 'descriptionCorrection', 'descriptionReview'] as const;
const modelResult = (value: unknown) => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }] });
async function costStageFixture() {
  const a = article();
  const buffers = await Promise.all(['red', 'green', 'blue'].map(background =>
    sharp({ create: { width: 10, height: 10, channels: 3, background } }).webp().toBuffer()));
  a.preparedMedia = buffers.map((bytes, i) => ({ role: ['hero', 'body-1', 'body-2'][i], url: `https://assets.test/${i}`,
    contentHash: createHash('sha256').update(bytes).digest('hex'), alt: 'En stol i cirklen', caption: 'AI-illustration: Plads til fællesskab.',
    credit: 'Illustration: Apropos Magazine / AI', width: 10, height: 10, kind: 'illustration' })) as any;
  a.content = insertLivBodyMedia(a.content, a.preparedMedia!);
  a.selectedImage = { articleHash: livImageArticleHash(a), url: 'https://assets.test/0', id: 'paid-hero' } as any;
  state.readImage.mockImplementation(async (url: string) => buffers[Number(url.split('/').at(-1))]);
  const outputs = [patches, { pass: false, reason: 'The chair is outside the circle' },
    { fixable: true, corrections: [{ role: 'body-1', alt: 'En stol uden for cirklen', caption: a.preparedMedia![1].caption }] },
    { pass: true, reason: 'Accurate labels and relevant paid pixels' }];
  state.calls.mockReset();
  return { a, outputs };
}

it.each(revisionStages)('reclaims only the known-unpaid %s stage, preserving earlier paid responses and denial audit', async stage => {
  const { a, outputs } = await costStageFixture(); const deniedIndex = revisionStages.indexOf(stage);
  for (const output of outputs.slice(0, deniedIndex)) state.calls.mockResolvedValueOnce(modelResult(output));
  const denied = new Error('SDK connection wrapper', { cause: new LivCostPretransportError('liv_budget_month_limit') });
  state.calls.mockRejectedValueOnce(denied);
  await expect(repairLivArticleFacts(a, report(a))).rejects.toBe(denied);
  const before = structuredClone(state.row);
  expect(before[`${stage}Attempt`]).toMatchObject({ status: 'not_started', providerAttempted: false, notStartedReason: 'cost_denied' });
  expect(before[`${stage}CostDenials`]).toHaveLength(1);
  expect(before.status).toBe('processing');
  for (const output of outputs.slice(deniedIndex)) state.calls.mockResolvedValueOnce(modelResult(output));
  const revised = await resumeLivFactRevision(a);
  expect(revised?.factRevisionCount).toBe(1);
  expect(state.row.status).toBe('complete');
  expect(state.row[`${stage}CostDenials`]).toEqual(before[`${stage}CostDenials`]);
  expect(state.row[`${stage}Attempt`].id).not.toBe(before[`${stage}Attempt`].id);
  for (const key of ['previous', 'report', 'rawResponse', 'patchResult', 'visualReview', 'visualReviewRaw', 'descriptionCorrection', 'descriptionCorrectionRaw']) {
    if (before[key] !== undefined) expect(state.row[key]).toEqual(before[key]);
  }
  expect(state.calls).toHaveBeenCalledTimes(outputs.length + 1); // Four successful calls, one proven non-transport denial.
  expect(revised?.preparedMedia?.map(image => image.contentHash)).toEqual(a.preparedMedia!.map(image => image.contentHash));
});

it.each(revisionStages)('does not reclaim %s after an ambiguous network failure with the same budget-like message', async stage => {
  const { a, outputs } = await costStageFixture(); const deniedIndex = revisionStages.indexOf(stage);
  for (const output of outputs.slice(0, deniedIndex)) state.calls.mockResolvedValueOnce(modelResult(output));
  const ambiguous = Object.assign(new Error('liv_budget_month_limit'), { providerAttempted: false, name: 'LivCostPretransportError' });
  state.calls.mockRejectedValueOnce(ambiguous);
  await expect(repairLivArticleFacts(a, report(a))).rejects.toBe(ambiguous);
  const before = structuredClone(state.row);
  expect(before[`${stage}Attempt`].status).toBe('started');
  expect(before[`${stage}CostDenials`]).toBeUndefined();
  await expect(resumeLivFactRevision(a)).rejects.toThrow('reconciliation');
  expect(state.calls).toHaveBeenCalledTimes(deniedIndex + 1);
  expect(state.row).toEqual(before);
});

it.each(revisionStages)('atomically admits one concurrent reclaimer for %s, not two provider calls', async stage => {
  const { a, outputs } = await costStageFixture(); const deniedIndex = revisionStages.indexOf(stage);
  for (const output of outputs.slice(0, deniedIndex)) state.calls.mockResolvedValueOnce(modelResult(output));
  state.calls.mockRejectedValueOnce(new LivCostPretransportError('liv_budget_month_limit'));
  await expect(repairLivArticleFacts(a, report(a))).rejects.toThrow('liv_budget_month_limit');
  let release!: (value: unknown) => void;
  let started!: () => void;
  const startedPromise = new Promise<void>(resolve => { started = resolve; });
  state.calls.mockImplementationOnce(() => { started(); return new Promise(resolve => { release = resolve; }); });
  for (const output of outputs.slice(deniedIndex + 1)) state.calls.mockResolvedValueOnce(modelResult(output));
  const pair = Promise.allSettled([resumeLivFactRevision(a), resumeLivFactRevision(a)]);
  await startedPromise;
  await state.transactionTail;
  release(modelResult(outputs[deniedIndex]));
  const outcomes = await pair;
  expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect(outcomes.filter(result => result.status === 'rejected')).toHaveLength(1);
  expect(state.calls).toHaveBeenCalledTimes(outputs.length + 1);
  expect(state.row.status).toBe('complete');
  expect(state.row[`${stage}CostDenials`]).toHaveLength(1);
});

it.each(revisionStages)('consumes the unpaid %s receipt so a subsequent network ambiguity cannot reclaim again', async stage => {
  const { a, outputs } = await costStageFixture(); const deniedIndex = revisionStages.indexOf(stage);
  for (const output of outputs.slice(0, deniedIndex)) state.calls.mockResolvedValueOnce(modelResult(output));
  state.calls.mockRejectedValueOnce(new LivCostPretransportError('liv_budget_month_limit'));
  await expect(repairLivArticleFacts(a, report(a))).rejects.toThrow('liv_budget_month_limit');
  const denied = structuredClone(state.row[`${stage}Attempt`]);
  state.calls.mockRejectedValueOnce(new Error('Provider timeout after transport may have started'));
  await expect(resumeLivFactRevision(a)).rejects.toThrow('Provider timeout');
  expect(state.row[`${stage}Attempt`]).toMatchObject({ status: 'started' });
  expect(state.row[`${stage}Attempt`].id).not.toBe(denied.id);
  expect(state.row[`${stage}Attempt`].providerAttempted).toBeUndefined();
  const before = structuredClone(state.row);
  await expect(resumeLivFactRevision(a)).rejects.toThrow('reconciliation');
  expect(state.row).toEqual(before);
  expect(state.row[`${stage}CostDenials`]).toHaveLength(1);
  expect(state.calls).toHaveBeenCalledTimes(deniedIndex + 2);
});

it('does not attach an older caller’s pretransport denial to a newer owner', async () => {
  const a = article();
  state.calls.mockImplementationOnce(async () => {
    const [id, row] = [...state.rows.entries()][0];
    state.row = { ...row, textPatchAttempt: { ...row.textPatchAttempt, id: 'newer-owner' } };
    state.rows.set(id, state.row);
    throw new LivCostPretransportError('liv_budget_month_limit');
  });
  await expect(repairLivArticleFacts(a, report(a))).rejects.toThrow('liv_budget_month_limit');
  expect(state.row.textPatchAttempt).toMatchObject({ id: 'newer-owner', status: 'started' });
  expect(state.row.textPatchCostDenials).toBeUndefined();
  await expect(resumeLivFactRevision(a)).rejects.toThrow('reconciliation');
  expect(state.calls).toHaveBeenCalledTimes(1);
});

function seedReasoningExhaustion(a = article(), overrides: Record<string, unknown> = {}) {
  const inputHash = createHash('sha256').update(JSON.stringify(a)).digest('hex');
  const id = createHash('sha256').update(`liv-fact-revision-v1:${inputHash}`).digest('hex');
  const row = { status: 'processing', inputHash, previous: structuredClone(a), report: report(a),
    rawResponse: '', finishReason: 'length', refusal: false, model: 'saved-model',
    usage: { prompt_tokens: 17235, completion_tokens: 5000, total_tokens: 22235,
      completion_tokens_details: { reasoning_tokens: 5000 } },
    textPatchAttempt: { id: 'first-paid-attempt', contextHash: inputHash, status: 'started', startedAt: '2026-09-12T10:00:00Z' },
    ...overrides };
  state.rows.set(id, structuredClone(row)); state.row = structuredClone(row);
  return { a, id, row };
}

it('recovers one exact empty reasoning-limit receipt on the same revision identity, retaining the first PAID receipt', async () => {
  const { a, id, row } = seedReasoningExhaustion();
  const revised = await resumeLivFactRevision(a);
  expect(revised?.factRevisionId).toBe(id);
  expect(revised?.factRevisionCount).toBe(1);
  expect(revised?.rawResponse).toBe(a.rawResponse);
  expect(state.rows.size).toBe(1);
  expect(state.row.textPatchEmptyLengthRecovery).toMatchObject({ retryCount: 1, inputHash: row.inputHash,
    firstPaidReceipt: { rawResponse: '', finishReason: 'length', refusal: false, model: row.model, usage: row.usage },
    firstAttempt: row.textPatchAttempt });
  expect(state.row.previous).toEqual(row.previous);
  expect(state.row.report).toEqual(row.report);
  expect(state.row.rawResponse).toBe(JSON.stringify(patches));
  expect(state.row.textPatchAttempt.id).not.toBe(row.textPatchAttempt.id);
  expect(state.row.textPatchCostDenials).toBeUndefined(); // Never falsely classified as unpaid.
  expect(state.calls).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ reasoning_effort: 'low', max_completion_tokens: 10000 }),
    { timeout: 90000, maxRetries: 0 });
  expect(await resumeLivFactRevision(a)).toEqual(revised);
  expect(state.calls).toHaveBeenCalledTimes(1);
});

it.each([
  { rawResponse: '{"patches":[' }, { rawResponse: ' ' }, { refusal: true }, { refusal: undefined },
  { finishReason: 'content_filter' }, { finishReason: undefined }, { usage: undefined },
  { usage: { prompt_tokens: 17235, completion_tokens: 5000, completion_tokens_details: { reasoning_tokens: 4999 } } },
  { patchResult: null }, { textPatchEmptyLengthRecovery: { retryCount: 1 } },
  { textPatchAttempt: { id: 'different-context', contextHash: 'wrong', status: 'started' } },
  { previous: { title: 'A different paid article' } },
  { visualReviewStarted: '2026-09-12T10:00:00Z' },
])('does not use empty-length recovery for partial/refused/ambiguous/mismatched or consumed evidence: %j', async overrides => {
  const { a, row } = seedReasoningExhaustion(article(), overrides);
  await expect(resumeLivFactRevision(a)).rejects.toThrow();
  expect(state.calls).not.toHaveBeenCalled();
  expect(state.row).toEqual(row);
});

it.each(['length', 'network', 'refusal', 'partial'])('never makes a second paid recovery call after the one retry ends with %s', async outcome => {
  const { a } = seedReasoningExhaustion();
  if (outcome === 'network') state.calls.mockRejectedValueOnce(new Error('network timeout'));
  else state.calls.mockResolvedValueOnce({ choices: [{ finish_reason: outcome === 'refusal' ? 'stop' : 'length',
    message: { content: outcome === 'partial' ? '{"patches":[' : '', refusal: outcome === 'refusal' ? 'refused' : null } }],
    usage: { prompt_tokens: 17235, completion_tokens: 5000, completion_tokens_details: { reasoning_tokens: 5000 } } });
  await expect(resumeLivFactRevision(a)).rejects.toThrow();
  const audit = structuredClone(state.row.textPatchEmptyLengthRecovery);
  await expect(resumeLivFactRevision(a)).rejects.toThrow();
  expect(state.calls).toHaveBeenCalledTimes(1);
  expect(state.row.textPatchEmptyLengthRecovery).toEqual(audit);
  expect(state.row.status).toBe('processing');
});

it('atomically consumes the single paid recovery slot across concurrent resumes', async () => {
  const { a } = seedReasoningExhaustion();
  let started!: () => void; let release!: (value: unknown) => void;
  const startedPromise = new Promise<void>(resolve => { started = resolve; });
  state.calls.mockImplementationOnce(() => { started(); return new Promise(resolve => { release = resolve; }); });
  const pair = Promise.allSettled([resumeLivFactRevision(a), resumeLivFactRevision(a)]);
  await startedPromise; await state.transactionTail;
  release(modelResult(patches));
  const results = await pair;
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
  expect(state.calls).toHaveBeenCalledTimes(1);
  expect(state.row.textPatchEmptyLengthRecovery.retryCount).toBe(1);
  expect(state.row.status).toBe('complete');
});

it('retains the first paid receipt through a proven budget denial of the recovery, without creating another paid retry slot', async () => {
  const { a, row } = seedReasoningExhaustion();
  state.calls.mockRejectedValueOnce(new LivCostPretransportError('liv_budget_month_limit'));
  await expect(resumeLivFactRevision(a)).rejects.toThrow('liv_budget_month_limit');
  const audit = structuredClone(state.row.textPatchEmptyLengthRecovery);
  expect(state.row.textPatchAttempt.status).toBe('not_started');
  expect(audit.firstPaidReceipt.usage).toEqual(row.usage);
  await resumeLivFactRevision(a);
  expect(state.row.textPatchEmptyLengthRecovery).toEqual(audit);
  expect(state.row.textPatchCostDenials).toHaveLength(1);
  expect(state.calls).toHaveBeenCalledTimes(2); // Denied transport plus ONE provider retry.
  expect(state.row.status).toBe('complete');
});

it('uses low reasoning for short media calls without increasing their declared output limits', async () => {
  const { a, outputs } = await costStageFixture();
  for (const output of outputs) state.calls.mockResolvedValueOnce(modelResult(output));
  await repairLivArticleFacts(a, report(a));
  expect(state.calls.mock.calls.map(([request]) => [request.reasoning_effort, request.max_completion_tokens]))
    .toEqual([['low', 10000], ['low', 2000], ['low', 2500], ['low', 2000]]);
});
