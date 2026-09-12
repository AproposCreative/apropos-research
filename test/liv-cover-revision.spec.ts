import { beforeEach, expect, it, vi } from 'vitest';
const database = vi.hoisted(() => ({ rows: new Map<string, Record<string, any>>(), available: true }));
vi.mock('@/lib/firebase-admin', () => {
  const doc = (collection: string, id: string) => ({ id, key: `${collection}/${id}`,
    get: async () => ({ data: () => structuredClone(database.rows.get(`${collection}/${id}`)) }) });
  return { getAdminStorageBucket: vi.fn(), getAdminDb: () => database.available ? {
    collection: (name: string) => ({ doc: (id: string) => doc(name, id),
      where: (field: string, _op: string, value: unknown) => ({ limit: (limit: number) => ({ query: name, field, value, limit }) }) }),
    runTransaction: async (fn: any) => {
      const writes: Array<() => void> = [];
      const result = await fn({
        get: async (ref: any) => {
          if (writes.length) throw new Error('read_after_write');
          if (ref.query) return { docs: [...database.rows].filter(([key, row]) => key.startsWith(`${ref.query}/`) && row[ref.field] === ref.value)
            .slice(0, ref.limit).map(([key, row]) => ({ id: key.split('/')[1], data: () => structuredClone(row) })) };
          return { exists: database.rows.has(ref.key), data: () => structuredClone(database.rows.get(ref.key)) };
        },
        set: (ref: any, value: any) => writes.push(() => database.rows.set(ref.key, structuredClone(value))),
        create: (ref: any, value: any) => {
          if (database.rows.has(ref.key)) throw new Error('exists');
          writes.push(() => database.rows.set(ref.key, structuredClone(value)));
        },
      });
      writes.forEach(write => write()); return result;
    },
  } : null };
});
import { reviseLivCover, type CoverRevisionDependencies, type CoverRevisionInput } from '@/lib/liv/cover-revision';
import { COVER_SOURCE_CREDIT, type PreparedCover } from '@/lib/liv/cover-revision-media';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { livImageArticleHash } from '@/lib/liv/article-image-hash';
import { claimDelivery, readDeliveryPayload, updateDelivery } from '@/lib/liv/delivery-store';
import type { GeneratedArticle } from '@/lib/liv/generate-article';
import type { WebflowArticleFields } from '@/lib/webflow/types';

const itemId = '6aa51107feea4b5112862f09', dayKey = '2026-09-12';
const collectionId = 'a'.repeat(24), localeId = 'b'.repeat(24);
const originalHash = '1'.repeat(64), newHash = '2'.repeat(64);
const oldHero = 'https://owned.example/old-hero.webp', newHero = 'https://owned.example/new-hero.webp';
const body = '<p>Original paid prose.</p><figure><img src="https://owned.example/one.webp"><figcaption>Illustration: Apropos Magazine / AI</figcaption></figure><figure><img src="https://owned.example/two.webp"><figcaption>Illustration: Apropos Magazine / AI</figcaption></figure>';
const originalExpected = { title: 'Alle Guds farver', slug: 'alle-guds-farver', content: body, intro: 'Original intro.',
  featuredImage: oldHero, featuredImageAlt: 'Original AI hero', featuredImageHash: originalHash,
  fotoCredit: 'Illustration: Apropos Magazine / AI', aiGenerated: true,
  imageSourceUrls: ['https://soundvenue.com/film/research', 'https://kino.dk/film/research'] } as WebflowArticleFields;
const expectedPayloadHash = cmsFieldHash(originalExpected as unknown as Record<string, unknown>);
const input: CoverRevisionInput = { dayKey, itemId, requestId: 'cover-selection-01', reason: 'User selected exact official press still',
  expectedPayloadHash, expectedCmsHash: '', replaceMobile: true,
  imageUrl: 'https://distribution.paradisbio.dk/log/film/Alle%20Guds%20Farver%20(374)/Alle%20Guds%20Farver_01.jpg',
  sourcePageUrl: 'https://distribution.paradisbio.dk/film.asp?id=374',
  alt: 'Pressebillede fra Alle Guds farver: En person i farverig drag og en præst foran et Kirken til Pride-banner.',
  caption: 'Pressebillede fra Alle Guds farver. Kilde: Øst for Paradis.' };
const media = { original: { contentHash: '3'.repeat(64), url: input.imageUrl, width: 3840, height: 1920, bytes: 6612197, storagePath: 'original' },
  image: { contentHash: newHash, url: newHero, width: 1920, height: 1080, bytes: 100000, storagePath: 'stored' },
  source: { imageUrl: input.imageUrl, sourcePageUrl: input.sourcePageUrl, alt: input.alt, caption: input.caption },
  sourcePageHash: '4'.repeat(64), retrievedAt: '2026-09-12T10:00:00Z', credit: COVER_SOURCE_CREDIT,
  attribution: 'distributor-source', photographer: null, rightsStatus: 'unverified', crop: 'center-cover' } satisfies PreparedCover;
const active = () => database.rows.get(`livDelivery/item-${itemId}`)!;
const manifest = () => database.rows.get('livDelivery/manifest')!;
const revision = () => [...database.rows].find(([key]) => key.startsWith('livCoverRevisions/'))?.[1];
const audit = () => [...database.rows].find(([key]) => key.startsWith('livCoverRevisionAudits/'))?.[1];
const prepKey = `livDailyArticles/prepare-${dayKey}`;
let cms: Record<string, any>, schema: Record<string, any>, deps: CoverRevisionDependencies;
beforeEach(() => {
  vi.clearAllMocks(); database.rows.clear(); database.available = true;
  const article = { title: originalExpected.title, slug: originalExpected.slug, intro: originalExpected.intro, content: body,
    rawResponse: 'immutable paid writer output', factRevisionId: 'old-fact-revision',
    preparedMedia: ['hero', 'body-1', 'body-2'].map((role, index) => ({ role, url: index ? `body-${index}` : oldHero,
      contentHash: index ? String(index + 4).repeat(64) : originalHash, kind: 'illustration', credit: 'Illustration: Apropos Magazine / AI' })),
  } as GeneratedArticle;
  article.selectedImage = { contentHash: originalHash, articleHash: livImageArticleHash(article), url: oldHero } as GeneratedArticle['selectedImage'];
  database.rows.set(prepKey, { status: 'draft', preparationAttempts: 9, reason: 'previous-diagnostic',
    webflowItemId: itemId, articleCheckpoint: article, articleCheckpointHash: livImageArticleHash(article),
    preparationProof: { expected: originalExpected, hash: expectedPayloadHash, editorialPassed: true, structurePassed: true },
    gateResults: [{ name: 'factcheck', pass: true, evidence: { original: true } }] });
  database.rows.set(`livDelivery/item-${itemId}`, { expected: originalExpected, payloadHash: expectedPayloadHash });
  database.rows.set('livDelivery/manifest', { entries: [{ itemId, title: originalExpected.title, slug: originalExpected.slug,
    state: 'selected', kind: 'scheduled', scheduledDay: dayKey, expiresDay: dayKey, payloadHash: expectedPayloadHash }],
  slots: { [dayKey]: { itemId, token: 'old-worker', state: 'selected', leaseUntil: 0, nextAttemptAt: Date.now() + 3600000,
    attempts: 1, lastFailure: { reason: 'prewrite_failure', attempted: false } } } });
  cms = { id: itemId, cmsLocaleId: localeId, isDraft: true, isArchived: false, lastPublished: null,
    fieldData: { name: originalExpected.title, slug: originalExpected.slug, content: body, intro: originalExpected.intro,
      'ai-generated': true, thumb: { url: oldHero, alt: originalExpected.featuredImageAlt },
      'mobile-image': { url: oldHero, alt: 'Old mobile' }, 'unique-stream-now-cover': { url: 'https://owned.example/custom.webp' },
      'foto-credit': originalExpected.fotoCredit, 'start-dato': 'original date' } };
  schema = { id: collectionId, fields: [{ slug: 'thumb', type: 'Image' }, { slug: 'foto-credit', type: 'PlainText' },
    { slug: 'mobile-image', type: 'Image' }] };
  input.expectedCmsHash = cmsFieldHash(cms.fieldData); input.replaceMobile = true;
  deps = { collectionId, localeId, prepare: vi.fn().mockResolvedValue(media),
    verifyImage: vi.fn().mockResolvedValue(true),
    review: vi.fn().mockResolvedValue({ pass: true, reason: 'Actual crop reviewed', model: 'fixture', finishReason: 'stop', usage: null, contentHash: newHash }),
    read: vi.fn().mockImplementation(async path => structuredClone(path === `collections/${collectionId}` ? schema : cms)),
    patch: vi.fn().mockImplementation(async (_id, fields) => { Object.assign(cms.fieldData, fields); }),
    inspect: vi.fn().mockImplementation(async () => ({ itemId, localeId, checkedAt: new Date().toISOString(),
      fieldDataHash: cmsFieldHash(cms.fieldData), draftConfirmed: true, publicationReady: true,
      checks: [{ id: 'image:stored-bytes-match', ok: true }, { id: 'image:body-matches', ok: true }] })),
  };
});

it('stages one cover revision, archives originals and preserves body, counters, dates and all gate evidence', async () => {
  const beforePrep = structuredClone(database.rows.get(prepKey)), beforeSlot = structuredClone(manifest().slots[dayKey]);
  const beforeCms = structuredClone(cms), beforePayload = structuredClone(active());
  const result = await reviseLivCover(input, deps);
  expect(result).toMatchObject({ status: 'cover_staged', itemId, publicationVerified: false });
  expect(deps.patch).toHaveBeenCalledExactlyOnceWith(itemId, { thumb: { url: newHero, alt: input.alt },
    'mobile-image': { url: newHero, alt: input.alt }, 'foto-credit': COVER_SOURCE_CREDIT }, localeId);
  expect(cms.fieldData.content).toBe(body);
  expect(cms.fieldData['unique-stream-now-cover']).toEqual(beforeCms.fieldData['unique-stream-now-cover']);
  expect(cms.fieldData).not.toHaveProperty('publish-date');
  expect(cms.lastPublished).toBeNull(); expect(cms.isDraft).toBe(true);
  expect(audit()).toMatchObject({ cms: beforeCms, payload: beforePayload, slot: beforeSlot,
    selection: 'explicit-human-selection', preparations: [{ id: `prepare-${dayKey}`, row: beforePrep }] });
  expect(manifest().coverRevision).toBeUndefined();
  expect(manifest().slots[dayKey]).toEqual({ ...beforeSlot, token: expect.any(String) });
  expect(manifest().slots[dayKey].token).not.toBe(beforeSlot.token);
  const updated = database.rows.get(prepKey)!;
  expect(updated.articleCheckpoint.content).toBe(body);
  expect(updated.articleCheckpoint.preparedMedia.slice(1)).toEqual(beforePrep!.articleCheckpoint.preparedMedia.slice(1));
  expect(updated.articleCheckpoint.selectedImage).toMatchObject({ url: newHero, contentHash: newHash, rightsStatus: 'unverified', visualReview: 'automated' });
  expect(updated.articleCheckpoint.preparedMedia[0]).toMatchObject({ role: 'hero', kind: 'photography', sourceUrl: input.imageUrl });
  expect(updated.articleCheckpoint.rawResponse).toBe(beforePrep!.articleCheckpoint.rawResponse);
  expect(updated.articleCheckpointHash).toBe(beforePrep!.articleCheckpointHash);
  expect(updated.preparationAttempts).toBe(9); expect(updated.gateResults).toEqual(beforePrep!.gateResults);
  expect(updated.preparationProof.expected).toEqual(active().expected);
  expect(active().expected.imageSourceUrls).toEqual([...originalExpected.imageSourceUrls!, input.sourcePageUrl]);
  expect(updated.preparationProof.hash).toBe(result.payloadHash);
  expect(await readDeliveryPayload(itemId)).toEqual(active().expected);
  expect(await claimDelivery(dayKey, Date.now())).toBeNull(); // Original backoff is preserved.
});
it('does not duplicate the selected press page if it is already in the source provenance', async () => {
  const expected = { ...originalExpected, imageSourceUrls: [...originalExpected.imageSourceUrls!, input.sourcePageUrl] };
  const payloadHash = cmsFieldHash(expected as unknown as Record<string, unknown>);
  Object.assign(active(), { expected, payloadHash });
  Object.assign(database.rows.get(prepKey)!.preparationProof, { expected, hash: payloadHash });
  manifest().entries[0].payloadHash = payloadHash;
  await reviseLivCover({ ...input, expectedPayloadHash: payloadHash }, deps);
  expect(active().expected.imageSourceUrls).toEqual(expected.imageSourceUrls);
  expect(audit()?.payload.expected.imageSourceUrls).toEqual(expected.imageSourceUrls);
});
it('returns the same completed receipt without fetching, reviewing or patching again', async () => {
  const first = await reviseLivCover(input, deps);
  const before = structuredClone([...database.rows]);
  vi.mocked(deps.read).mockClear();
  expect(await reviseLivCover(input, deps)).toEqual(first);
  expect(deps.read).not.toHaveBeenCalled(); expect(deps.prepare).toHaveBeenCalledTimes(1);
  expect(deps.review).toHaveBeenCalledTimes(1); expect(deps.patch).toHaveBeenCalledTimes(1);
  expect([...database.rows]).toEqual(before);
});
it('rejects reusing the request ID for a different selection or expected hash', async () => {
  await reviseLivCover(input, deps);
  await expect(reviseLivCover({ ...input, alt: 'A different description' }, deps)).rejects.toThrow('request_conflict');
  await expect(reviseLivCover({ ...input, expectedPayloadHash: 'f'.repeat(64) }, deps)).rejects.toThrow('request_conflict');
  expect(deps.patch).toHaveBeenCalledTimes(1);
});
it('preserves a custom mobile cover', async () => {
  cms.fieldData['mobile-image'].url = 'https://owned.example/custom-mobile.webp';
  input.replaceMobile = false; input.expectedCmsHash = cmsFieldHash(cms.fieldData);
  await reviseLivCover(input, deps);
  expect(vi.mocked(deps.patch).mock.calls[0][1]).not.toHaveProperty('mobile-image');
  expect(cms.fieldData['mobile-image'].url).toBe('https://owned.example/custom-mobile.webp');
});
it('does not write a mobile field absent from the schema', async () => {
  schema.fields.pop();
  input.replaceMobile = false;
  await reviseLivCover(input, deps);
  expect(vi.mocked(deps.patch).mock.calls[0][1]).not.toHaveProperty('mobile-image');
});
it('explicitly replaces a distinct mobile cover and verifies actual CDN bytes', async () => {
  cms.fieldData['mobile-image'].url = 'https://cdn.prod.website-files.com/old-mobile.webp';
  input.expectedCmsHash = cmsFieldHash(cms.fieldData);
  vi.mocked(deps.patch).mockImplementationOnce(async (_id, fields) => {
    Object.assign(cms.fieldData, fields);
    cms.fieldData['mobile-image'].url = 'https://cdn.prod.website-files.com/new-cover.webp';
  });
  await reviseLivCover(input, deps);
  expect(deps.verifyImage).toHaveBeenCalledExactlyOnceWith('https://cdn.prod.website-files.com/new-cover.webp', media);
});
it('keeps the mutation hold when the mobile CDN bytes do not match', async () => {
  vi.mocked(deps.verifyImage).mockResolvedValue(false);
  await expect(reviseLivCover(input, deps)).rejects.toThrow('mobile_mismatch');
  expect(manifest().coverRevision).toBeDefined(); expect(active().payloadHash).toBe(expectedPayloadHash);
});
it('rejects explicit mobile replacement if the schema lacks its image field', async () => {
  schema.fields.pop();
  await expect(reviseLivCover(input, deps)).rejects.toThrow('schema_invalid');
  expect(deps.prepare).not.toHaveBeenCalled(); expect(audit()).toBeUndefined();
});
it('fences old publishers and blocks claim/update and next-day expiry throughout preparation', async () => {
  vi.mocked(deps.prepare).mockImplementation(async () => {
    expect(manifest().coverRevision).toMatchObject({ itemId, day: dayKey });
    expect(await claimDelivery(dayKey, Date.now() + 7200000)).toBeNull();
    expect(await claimDelivery('2026-09-13', Date.now() + 86400000)).toBeNull();
    expect(manifest().slots[dayKey].attempts).toBe(1);
    await expect(updateDelivery(dayKey, 'old-worker', slot => { slot.state = 'attempted'; })).rejects.toThrow('lease_lost');
    await expect(updateDelivery(dayKey, manifest().slots[dayKey].token, slot => { slot.state = 'attempted'; })).rejects.toThrow('lease_lost');
    await expect(reviseLivCover(input, deps)).rejects.toThrow('busy');
    await expect(reviseLivCover({ ...input, requestId: 'another-request' }, deps)).rejects.toThrow('busy');
    return media;
  });
  await reviseLivCover(input, deps);
});
it.each(['attempted', 'published'])('does not revise a slot already %s', async state => {
  manifest().slots[dayKey].state = state;
  await expect(reviseLivCover(input, deps)).rejects.toThrow('conflict');
  expect(deps.prepare).not.toHaveBeenCalled(); expect(audit()).toBeUndefined();
});
it('does not steal an active publisher lease', async () => {
  manifest().slots[dayKey].leaseUntil = Date.now() + 100000;
  await expect(reviseLivCover(input, deps)).rejects.toThrow('busy');
  expect(deps.patch).not.toHaveBeenCalled();
});
it('does not overlap an active preparation worker', async () => {
  manifest().preparation = { token: 'preparer', leaseUntil: Date.now() + 10000 };
  await expect(reviseLivCover(input, deps)).rejects.toThrow('busy');
});
it.each([{ isDraft: false }, { lastPublished: '2026-09-12T10:00:00Z' }, { id: 'c'.repeat(24) }, { cmsLocaleId: 'd'.repeat(24) }, { isArchived: true }])('rejects a changed/live CMS identity %j', async patch => {
  Object.assign(cms, patch);
  await expect(reviseLivCover(input, deps)).rejects.toThrow('draft_changed');
  expect(deps.prepare).not.toHaveBeenCalled(); expect(audit()).toBeUndefined();
});
it('rejects stale expected payload and CMS hashes before acquiring a hold', async () => {
  await expect(reviseLivCover({ ...input, expectedPayloadHash: 'e'.repeat(64) }, deps)).rejects.toThrow('conflict');
  await expect(reviseLivCover({ ...input, expectedCmsHash: 'e'.repeat(64) }, deps)).rejects.toThrow('draft_changed');
  expect(manifest().coverRevision).toBeUndefined();
});
it('resumes after a pre-review failure without clearing the delivery hold or resetting attempts', async () => {
  vi.mocked(deps.prepare).mockRejectedValueOnce(new Error('download unavailable'));
  await expect(reviseLivCover(input, deps)).rejects.toThrow('download unavailable');
  expect(manifest().coverRevision).toBeDefined(); expect(revision()?.leaseUntil).toBe(0);
  await reviseLivCover(input, deps);
  expect(deps.review).toHaveBeenCalledTimes(1); expect(deps.patch).toHaveBeenCalledTimes(1);
  expect(manifest().slots[dayKey].attempts).toBe(1);
});
it('never repeats a paid review with an ambiguous result', async () => {
  vi.mocked(deps.review).mockRejectedValueOnce(new Error('lost paid response'));
  await expect(reviseLivCover(input, deps)).rejects.toThrow('lost paid response');
  await expect(reviseLivCover(input, deps)).rejects.toThrow('review_requires_reconciliation');
  expect(deps.prepare).toHaveBeenCalledTimes(1); expect(deps.review).toHaveBeenCalledTimes(1);
  expect(deps.patch).not.toHaveBeenCalled(); expect(manifest().coverRevision).toBeDefined();
});
it('retains a visual rejection without rerolling it', async () => {
  vi.mocked(deps.review).mockResolvedValue({ pass: false, reason: 'Bad crop', model: 'fixture', finishReason: 'stop', usage: null, contentHash: newHash });
  await expect(reviseLivCover(input, deps)).rejects.toThrow('visual_rejected');
  await expect(reviseLivCover(input, deps)).rejects.toThrow('visual_rejected');
  expect(deps.review).toHaveBeenCalledTimes(1); expect(deps.patch).not.toHaveBeenCalled();
  expect(audit()?.payload.expected.featuredImage).toBe(oldHero);
});
it('reconciles a lost PATCH response by readback only, then activates the saved revision', async () => {
  vi.mocked(deps.patch).mockImplementationOnce(async (_id, fields) => {
    Object.assign(cms.fieldData, fields); throw new Error('response lost');
  });
  await expect(reviseLivCover(input, deps)).rejects.toThrow('response lost');
  expect(manifest().coverRevision).toBeDefined(); expect(active().payloadHash).toBe(expectedPayloadHash);
  expect(database.rows.get(prepKey)!.preparationProof.hash).toBe(expectedPayloadHash);
  expect(await reviseLivCover(input, deps)).toMatchObject({ status: 'cover_staged' });
  expect(deps.prepare).toHaveBeenCalledTimes(1); expect(deps.review).toHaveBeenCalledTimes(1); expect(deps.patch).toHaveBeenCalledTimes(1);
});
it('does not resend an ambiguous PATCH when the old fields are still present', async () => {
  vi.mocked(deps.patch).mockRejectedValueOnce(new Error('timeout'));
  await expect(reviseLivCover(input, deps)).rejects.toThrow('timeout');
  await expect(reviseLivCover(input, deps)).rejects.toThrow('patch_requires_reconciliation');
  expect(deps.patch).toHaveBeenCalledTimes(1); expect(manifest().coverRevision).toBeDefined();
});
it('retains full failed readback evidence and resumes without another PATCH or review', async () => {
  vi.mocked(deps.inspect).mockResolvedValueOnce({ itemId, localeId, fieldDataHash: '', checkedAt: '', draftConfirmed: true,
    publicationReady: false, checks: [{ id: 'image:body-matches', ok: false }] });
  await expect(reviseLivCover(input, deps)).rejects.toThrow('readback_failed');
  expect(revision()?.inspection.checks[0].ok).toBe(false);
  expect(manifest().coverRevision).toBeDefined();
  await reviseLivCover(input, deps);
  expect(deps.patch).toHaveBeenCalledTimes(1); expect(deps.review).toHaveBeenCalledTimes(1);
  const readbacks = [...database.rows].filter(([key]) => key.startsWith('livCoverRevisionReadbacks/'));
  expect(readbacks).toHaveLength(2);
  expect(readbacks[0][1].inspection.checks[0].ok).toBe(false);
});
it('detects changed CMS text before patching', async () => {
  vi.mocked(deps.prepare).mockImplementationOnce(async () => { cms.fieldData.content += ' Edited elsewhere'; return media; });
  await expect(reviseLivCover(input, deps)).rejects.toThrow('draft_changed');
  expect(deps.patch).not.toHaveBeenCalled(); expect(manifest().coverRevision).toBeDefined();
});
it('does not activate if unrelated fields changed during the PATCH', async () => {
  vi.mocked(deps.patch).mockImplementationOnce(async (_id, fields) => { Object.assign(cms.fieldData, fields); cms.fieldData.content += ' changed'; });
  await expect(reviseLivCover(input, deps)).rejects.toThrow('patch_requires_reconciliation');
  expect(active().payloadHash).toBe(expectedPayloadHash); expect(manifest().coverRevision).toBeDefined();
});
it('does not overwrite a preparation checkpoint edited during readback', async () => {
  const inspect = deps.inspect;
  deps.inspect = vi.fn().mockImplementation(async args => {
    database.rows.get(prepKey)!.articleCheckpoint.content = 'New paid version';
    return inspect(args);
  });
  await expect(reviseLivCover(input, deps)).rejects.toThrow('conflict');
  expect(database.rows.get(prepKey)!.articleCheckpoint.content).toBe('New paid version');
  expect(active().payloadHash).toBe(expectedPayloadHash); expect(manifest().coverRevision).toBeDefined();
});
it.each([null, {}, [], { ...input, alt: 'short' }, { ...input, alt: 'a'.repeat(241) }, { ...input, caption: '<script>no</script>' },
  { ...input, expectedCmsHash: undefined }, { ...input, replaceMobile: 'true' },
  { ...input, sourcePageUrl: 'https://127.0.0.1/film.asp?id=374' }, { ...input, imageUrl: 'https://evil.test/image.jpg' },
  { ...input, credit: 'Invented photographer' }, { ...input, content: 'Replacement text' }])('rejects malformed or out-of-scope input %j', async raw => {
  await expect(reviseLivCover(raw, deps)).rejects.toThrow('liv_cover_invalid');
  expect(deps.read).not.toHaveBeenCalled(); expect(deps.prepare).not.toHaveBeenCalled(); expect(audit()).toBeUndefined();
});
