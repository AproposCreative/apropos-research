import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
const state = vi.hoisted(() => ({ rows: new Map<string, any>(), assets: new Map<string, Buffer>(), tail: Promise.resolve() as Promise<unknown>,
  chat: vi.fn(), read: vi.fn(), generate: vi.fn(), writes: vi.fn(), available: true }));
vi.mock('@/lib/openai', () => ({ getOpenAIClient: () => ({ chat: { completions: { create: state.chat } }, images: { generate: state.generate } }) }));
vi.mock('@/lib/liv/stored-image-reader', () => ({ readLivStoredImage: state.read }));
vi.mock('@/lib/firebase-admin', () => {
  const ref = (path: string): any => ({ path, get: async () => ({ data: () => structuredClone(state.rows.get(path)) }),
    collection: (name: string) => ({ doc: (id: string) => ref(`${path}/${name}/${id}`) }) });
  return { getAdminDb: () => state.available ? { collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
    runTransaction: (fn: any) => {
      const task = state.tail.catch(() => {}).then(async () => {
        const writes: Array<() => void> = [];
        const result = await fn({ get: async (reference: any) => { if (writes.length) throw new Error('read_after_write'); return reference.get(); },
          create: (reference: any, data: any) => { if (state.rows.has(reference.path)) throw new Error('exists');
            writes.push(() => { state.rows.set(reference.path, structuredClone(data)); state.writes(reference.path); }); },
          set: (reference: any, data: any) => writes.push(() => { state.rows.set(reference.path, structuredClone(data)); state.writes(reference.path); }),
          update: (reference: any, data: any) => writes.push(() => { state.rows.set(reference.path,
            structuredClone({ ...state.rows.get(reference.path), ...data })); state.writes(reference.path); }),
        }); writes.forEach(write => write()); return result;
      }); state.tail = task; return task;
    },
  } : null };
});
import { reviewLivEditorialEditMedia } from '@/lib/liv/editorial-edit-media-review';
import { prepareLivAutomaticMedia, insertLivBodyMedia, type MediaEvidence } from '@/lib/liv/automatic-media';
import { buildLivCmsPayload } from '@/lib/liv/build-cms-payload';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { livImageArticleHash } from '@/lib/liv/article-image-hash';
import { applyLivFactPatches, resumeLivFactRevision } from '@/lib/liv/fact-revision';
import { LivCostPretransportError } from '@/lib/liv/cost-errors';
import type { GeneratedArticle } from '@/lib/liv/generate-article';
import { readLivVisualEvidence, isAnonymousVisibleCaption } from '@/lib/liv/visual-evidence';
const day = '2026-09-15', runId = `prepare-${day}`, requestId = 'final-copyedit-fixture';
const path = `livDailyArticles/${runId}/editorialEdits/${requestId}`, checkPath = `${path}/checks/visual-review`;
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const fullHash = (article: GeneratedArticle) => cmsFieldHash(article as unknown as Record<string, unknown>);
let pending: GeneratedArticle;
const response = (value: unknown = { pass: true, reason: 'Distinct conceptual illustrations remain relevant to the corrected article.' }) => ({
  choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }], usage: { prompt_tokens: 400, completion_tokens: 30 } });
beforeEach(async () => {
  vi.resetAllMocks(); state.rows.clear(); state.assets.clear(); state.tail = Promise.resolve(); state.available = true;
  const media: MediaEvidence[] = await Promise.all((['hero', 'body-1', 'body-2'] as const).map(async (role, i) => {
    const bytes = await sharp({ create: { width: 1200, height: i ? 800 : 675, channels: 3, background: ['red', 'blue', 'green'][i] } }).webp().toBuffer();
    const url = `https://storage.googleapis.com/fixture/${role}.webp`; state.assets.set(url, bytes);
    return { role, url, storagePath: `fixture/${role}.webp`, contentHash: digest(bytes), sourceHash: digest(bytes),
      bytes: bytes.length, width: 1200, height: i ? 800 : 675, alt: `Konceptuel illustration ${i}`,
      caption: `AI-illustration: Kultur og ansvar ${i}`, credit: 'Illustration: Apropos / AI',
      sourceUrl: null, sourcePageUrl: null, kind: 'illustration' };
  }));
  const original = { title: 'Kultur og ansvar', subtitle: 'En selvstændig læsning', slug: 'kultur-ansvar', intro: 'En konkret kulturhistorie.',
    excerpt: 'En konkret kulturhistorie.', content: insertLivBodyMedia('<p>Arrangementet fandt sted på museet.</p><p>En selvstændig læsning af romanen og dens skaber.</p><p>En diskussion af kultur, historie og ansvar.</p><p>En længere afslutning, der bevarer artiklens kritiske perspektiv og selvstændige argument.</p>', media),
    section: 'Kultur', tags: [], articleFormat: 'article', rawResponse: 'preserved paid raw', factRevisionId: 'b'.repeat(64), factRevisionCount: 1,
    preparedMedia: media } as GeneratedArticle;
  original.selectedImage = { ...media[0], id: `${'a'.repeat(64)}-hero`, sourceUrl: '',
    articleHash: livImageArticleHash(original), width: 1200, height: 675, rightsStatus: 'unverified', visualReview: 'automated', createdAt: '2026-09-12T12:00:00Z' };
  const input = { requestId, dayKey: day, scope: 'prepare', expectedArticleHash: livImageArticleHash(original), expectedCheckpointHash: fullHash(original),
    reason: 'Use the documented planned event rather than asserting it occurred.',
    patches: [{ field: 'content', before: 'fandt sted', after: 'var annonceret' }] };
  pending = applyLivFactPatches(original, input);
  pending.selectedImage = { ...original.selectedImage, visualReview: 'pending', editorialEdit: { runId, requestId } };
  state.rows.set(path, { input, inputHash: cmsFieldHash(input), previousArticle: original, article: pending,
    previousArticleHash: input.expectedArticleHash, articleHash: livImageArticleHash(pending), previousCheckpointHash: input.expectedCheckpointHash,
    checkpointHash: fullHash(pending), mediaJobId: 'a'.repeat(64), mediaRevisionIds: ['b'.repeat(64)], authority: 'authorized-operator',
    previousRun: { dayKey: day, status: 'skipped_moderation', articleCheckpoint: original, continuationReady: false },
    previousPlan: { dayKey: day, status: 'failed' } });
  state.read.mockImplementation(async url => state.assets.get(url)); state.chat.mockResolvedValue(response());
});
afterEach(() => expect(state.generate).not.toHaveBeenCalled());

async function photographicCheckpoint() {
  const audit = state.rows.get(path);
  const original = structuredClone(audit.previousArticle) as GeneratedArticle;
  const alts = ['Et pressefoto.', 'To mænd går side om side på en vinterlig bygade.',
    'En mand og en kvinde står uden for en café med hver sin kaffekop.'];
  original.preparedMedia = original.preparedMedia!.map((image, i) => {
    const caption = i === 1 ? 'En gåtur gennem byen med en underspillet, anspændt stemning.' : 'Et hverdagsøjeblik med social uro.';
    original.content = original.content.replace(`alt="${image.alt}"`, `alt="${alts[i]}"`).replace(image.caption, caption);
    return { ...image, kind: 'photography', alt: alts[i], caption };
  });
  original.selectedImage!.articleHash = livImageArticleHash(original);
  const input = { ...audit.input, expectedArticleHash: livImageArticleHash(original), expectedCheckpointHash: fullHash(original) };
  pending = applyLivFactPatches(original, input);
  pending.selectedImage = { ...original.selectedImage!, visualReview: 'pending', editorialEdit: { runId, requestId } };
  Object.assign(audit, { input, inputHash: cmsFieldHash(input), previousArticle: original, article: pending,
    previousArticleHash: input.expectedArticleHash, previousCheckpointHash: input.expectedCheckpointHash,
    checkpointHash: fullHash(pending), articleHash: livImageArticleHash(pending),
    previousRun: { ...audit.previousRun, articleCheckpoint: original } });
  const approved = await reviewLivEditorialEditMedia(pending, day);
  state.rows.set(`livDailyArticles/${runId}`, { articleCheckpoint: approved, articleCheckpointHash: livImageArticleHash(approved) });
  state.chat.mockClear(); state.writes.mockClear(); state.read.mockClear();
  const fields = { title: approved.title, subtitle: approved.subtitle, excerpt: approved.excerpt, intro: approved.intro, content: approved.content };
  const text = Object.values(fields).filter(Boolean).join('\n\n');
  return { approved, fields, text, reference: { runId, checkpointHash: fullHash(approved) } };
}

it('hands off actual reviewed ALT observations, not interpretive captions, with unchanged bytes, audits and full article', async () => {
  const { fields, text, reference } = await photographicCheckpoint();
  const before = structuredClone([...state.rows]);
  const evidence = await readLivVisualEvidence(reference, text, fields);
  expect(evidence.map(source => source.text)).toEqual(['To mænd går side om side på en vinterlig bygade.',
    'En mand og en kvinde står uden for en café med hver sin kaffekop.']);
  expect(evidence.every(source => source.publishedAt === null && source.evidenceKind === 'verified-image-observation')).toBe(true);
  expect(evidence.map(source => source.id)).toEqual(['visual-body-1-alt', 'visual-body-2-alt']);
  expect(state.read).toHaveBeenCalledTimes(3); expect(state.chat).not.toHaveBeenCalled(); expect(state.writes).not.toHaveBeenCalled();
  expect([...state.rows]).toEqual(before);
});

it.each(['missing', 'processing', 'refused', 'failed', 'receipt-hash', 'audit-hash', 'future', 'pixels', 'article', 'fields', 'client-pass'])(
  'rejects invalid visual handoff %s without paid calls or writes', async failure => {
    const { fields, text, reference } = await photographicCheckpoint();
    const receipt = state.rows.get(checkPath);
    if (failure === 'missing') state.rows.delete(checkPath);
    if (failure === 'processing') receipt.status = 'processing';
    if (failure === 'refused') receipt.refusal = true;
    if (failure === 'failed') receipt.rawResponse = JSON.stringify({ pass: false, reason: 'Not visible' });
    if (failure === 'receipt-hash') receipt.articleHash = 'f'.repeat(64);
    if (failure === 'audit-hash') receipt.auditHash = 'f'.repeat(64);
    if (failure === 'future') receipt.completedAt = '2099-01-01T00:00:00Z';
    if (failure === 'pixels') state.read.mockResolvedValue(Buffer.from('changed pixels'));
    if (failure === 'article') reference.checkpointHash = 'f'.repeat(64);
    if (failure === 'fields') fields.content += '<p>Unreviewed content</p>';
    await expect(readLivVisualEvidence(failure === 'client-pass' ? { ...reference, pass: true } : reference, text, fields)).rejects.toThrow();
    expect(state.chat).not.toHaveBeenCalled(); expect(state.writes).not.toHaveBeenCalled();
  });

it.each(['Frank går side om side på en vinterlig bygade.', 'To mænd går side om side på en vinterlig bygade i København.',
  'En mand og hans kone står uden for en café med hver sin kaffekop.', 'To mænd går side om side på en vinterlig bygade efter et mord.',
  'En mand står uden for en café og er vred.', 'En mand står uden for en café. Han hedder Frank.'])(
  'never admits identity, relationships, place names, events or emotion from pixels: %s', text => {
    expect(isAnonymousVisibleCaption(text)).toBe(false);
  });
it.each(['En kvinde sidder på en bænk.', 'To personer står ved et bord.', 'En mand går på en gade.'])(
  'supports reusable anonymous visible grammar: %s', text => expect(isAnonymousVisibleCaption(text)).toBe(true));
it('read-only review mode never starts a missing provider receipt', async () => {
  await expect(reviewLivEditorialEditMedia(pending, day, { readOnly: true })).rejects.toThrow('requires_reconciliation');
  expect(state.chat).not.toHaveBeenCalled(); expect(state.writes).not.toHaveBeenCalled();
});

it.each(['pending', 'failed'])('accepts an audited yielded checkpoint with %s plan without rewriting paid work', async status => {
  const audit = state.rows.get(path);
  audit.previousPlan.status = status;
  audit.previousRun.status = 'processing';
  audit.previousRun.continuationReady = true;
  const approved = await reviewLivEditorialEditMedia(pending, day);
  expect(approved.content).toBe(pending.content);
  expect(state.chat).toHaveBeenCalledOnce();
});
it('rejects a processing checkpoint that was not yielded', async () => {
  state.rows.get(path).previousRun.status = 'processing';
  await expect(reviewLivEditorialEditMedia(pending, day)).rejects.toThrow('liv_edit_media_requires_reconciliation');
  expect(state.chat).not.toHaveBeenCalled();
});

it('blocks CMS before fresh proof, then reviews actual saved pixels and keeps the text, images, provenance and revision count intact', async () => {
  expect(() => buildLivCmsPayload({ article: pending, topic: { title: pending.title, score: 0 } })).toThrow('image_editorial_review_pending');
  const original = structuredClone(pending), audit = structuredClone(state.rows.get(path));
  const approved = await prepareLivAutomaticMedia(pending, { dayKey: day });
  expect(state.chat).toHaveBeenCalledOnce(); expect(state.read).toHaveBeenCalledTimes(3);
  expect(state.chat.mock.calls[0][0].messages[1].content[0].text).toContain('var annonceret');
  expect(state.chat.mock.calls[0][1]).toEqual({ timeout: 30000, maxRetries: 0 });
  expect(approved).toEqual({ ...original, selectedImage: { ...original.selectedImage,
    articleHash: livImageArticleHash(original), visualReview: 'automated' } });
  expect(pending).toEqual(original); expect(state.rows.get(path)).toEqual(audit);
  expect(state.rows.get(checkPath)).toMatchObject({ status: 'complete', rawResponse: response().choices[0].message.content,
    usage: response().usage, articleHash: fullHash(approved) });
  expect(buildLivCmsPayload({ article: approved, topic: { title: approved.title, score: 0 } }).content).toBe(pending.content);
});
it('recovers a saved successful review after checkpoint interruption without a second provider call', async () => {
  const approved = await reviewLivEditorialEditMedia(pending, day);
  state.chat.mockClear(); state.read.mockClear(); state.writes.mockClear();
  expect(await reviewLivEditorialEditMedia(pending, day)).toEqual(approved);
  expect(await prepareLivAutomaticMedia(approved, { dayKey: day })).toEqual(approved);
  expect(state.chat).not.toHaveBeenCalled(); expect(state.read).not.toHaveBeenCalled(); expect(state.writes).not.toHaveBeenCalled();
});
it('does not reopen a completed factual revision or purchase a model rewrite for the copyedited checkpoint', async () => {
  expect(await resumeLivFactRevision(pending)).toBeNull();
  expect(state.chat).not.toHaveBeenCalled(); expect(state.writes).not.toHaveBeenCalled();
  const approved = await prepareLivAutomaticMedia(pending, { dayKey: day });
  expect(await resumeLivFactRevision(approved)).toBeNull();
  expect(state.chat).toHaveBeenCalledOnce(); expect(approved.factRevisionCount).toBe(1);
});
it.each(['body', 'metadata', 'media', 'binding', 'day', 'audit', 'old-hash', 'plan', 'previous-run', 'patch', 'missing-audit', 'pixels', 'dimensions'])('rejects changed or unproved %s before paid review', async kind => {
  const audit = state.rows.get(path);
  if (kind === 'body') pending = { ...pending, content: pending.content + 'changed' };
  if (kind === 'metadata') pending = { ...pending, subtitle: 'changed' };
  if (kind === 'media') pending = { ...pending, preparedMedia: pending.preparedMedia!.map(image => ({ ...image, credit: 'new' })) };
  if (kind === 'binding') pending.selectedImage!.editorialEdit!.requestId = '../unsafe';
  if (kind === 'audit') audit.authority = 'unknown';
  if (kind === 'old-hash') audit.previousArticleHash = 'c'.repeat(64);
  if (kind === 'plan') audit.previousPlan.status = 'pending';
  if (kind === 'previous-run') audit.previousRun.webflowItemId = 'cms';
  if (kind === 'patch') audit.input.patches[0].after = 'Changed';
  if (kind === 'missing-audit') state.rows.delete(path);
  if (kind === 'pixels') state.read.mockResolvedValue(await sharp({ create: { width: 1200, height: 675, channels: 3, background: 'white' } }).webp().toBuffer());
  if (kind === 'dimensions') {
    // Keep the snapshot internally consistent, but mismatch actual immutable bytes.
    for (const version of [audit.previousArticle, audit.previousRun.articleCheckpoint, audit.article, pending]) version.preparedMedia[0].width = 1199;
    audit.previousCheckpointHash = fullHash(audit.previousArticle); audit.input.expectedCheckpointHash = audit.previousCheckpointHash;
    audit.inputHash = cmsFieldHash(audit.input); audit.checkpointHash = fullHash(audit.article);
  }
  await expect(reviewLivEditorialEditMedia(pending, kind === 'day' ? '2026-09-16' : day)).rejects.toThrow();
  expect(state.chat).not.toHaveBeenCalled(); expect(state.writes).not.toHaveBeenCalled();
});
it.each(['reject', 'missing-reason', 'invalid-json', 'truncated', 'refusal'])('retains a paid %s review and never silently repeats it', async kind => {
  const raw = response(kind === 'reject' ? { pass: false, reason: 'Not relevant.' } : kind === 'missing-reason' ? { pass: true } : undefined);
  if (kind === 'invalid-json') raw.choices[0].message.content = '{';
  if (kind === 'truncated') raw.choices[0].finish_reason = 'length';
  if (kind === 'refusal') Object.assign(raw.choices[0].message, { refusal: 'Cannot verify.' });
  state.chat.mockResolvedValue(raw);
  await expect(reviewLivEditorialEditMedia(pending, day)).rejects.toThrow('liv_edit_media_rejected');
  await expect(reviewLivEditorialEditMedia(pending, day)).rejects.toThrow('liv_edit_media_rejected');
  expect(state.chat).toHaveBeenCalledOnce(); expect(state.rows.get(checkPath).rawResponse).toBe(raw.choices[0].message.content);
  expect(pending.selectedImage!.visualReview).toBe('pending');
});
it('retains uncertain transport as processing, with no blind retry or fabricated unpaid evidence', async () => {
  state.chat.mockRejectedValue(new Error('network uncertain'));
  await expect(reviewLivEditorialEditMedia(pending, day)).rejects.toThrow('network uncertain');
  await expect(reviewLivEditorialEditMedia(pending, day)).rejects.toThrow('requires_reconciliation');
  expect(state.chat).toHaveBeenCalledOnce(); expect(state.rows.get(checkPath).status).toBe('processing');
  expect(state.rows.get(checkPath).providerAttempted).toBeUndefined();
});
it('can reclaim only branded exact pretransport denial and archives it', async () => {
  state.chat.mockRejectedValueOnce(new LivCostPretransportError('liv_cost_monthly_budget_exceeded'));
  await expect(reviewLivEditorialEditMedia(pending, day)).rejects.toThrow('liv_cost_monthly_budget_exceeded');
  const denied = structuredClone(state.rows.get(checkPath));
  expect(denied).toMatchObject({ status: 'not_started', providerAttempted: false });
  expect((await reviewLivEditorialEditMedia(pending, day)).selectedImage!.visualReview).toBe('automated');
  expect(state.rows.get(`${path}/checks/unpaid-${denied.attemptId}`)).toEqual(denied);
});
it('fences two simultaneous visual checks to a single paid request', async () => {
  const results = await Promise.allSettled([reviewLivEditorialEditMedia(pending, day), reviewLivEditorialEditMedia(pending, day)]);
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1); expect(state.chat).toHaveBeenCalledOnce();
});
