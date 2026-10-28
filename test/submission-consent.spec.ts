import { beforeEach, expect, it, vi } from 'vitest';
import { memoryFirestore } from './helpers/mcp-firestore';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
const state = vi.hoisted(() => ({ db: null as any, member: true }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => state.db }));
vi.mock('@/lib/mcp/oauth', () => ({ activeMember: async () => state.member }));
vi.mock('@/lib/mcp/publication', () => ({ assertPublicationEnabled: vi.fn() }));
vi.mock('@/lib/editorial/submission-options', () => ({ getSubmissionOptions: async () => ({
  authors: [{ id: 'author', name: 'Liv' }], categories: [{ id: 'category', name: 'Kultur' }], topics: [], requiredFields: [] }) }));
import { acceptSubmissionConsent, submissionConsentOffer, assertPublicationConsent, consentArticleHash, matchesConsentArticle } from '@/lib/editorial/submission-consent';
import { editableArticle } from '@/lib/mcp/workspace';
import { articleReadingPreview } from '@/lib/editorial/submission-preview';
import { imageGenerationEvidence } from '@/lib/editorial/image-generation-evidence';
const id = 'a'.repeat(64), path = `editorialSubmissions/${id}`;
const trailer = 'https://www.youtube.com/watch?v=ycGRitcszLI';
let memory: ReturnType<typeof memoryFirestore>;
it('accepts only the exact CMS projection of an already approved trailer link', () => {
  const article = { title: 'The Terminal List', content: `<p>Review.</p><a href="${trailer}">Trailer</a>` };
  const expected = { ...article, videoTrailer: trailer, video_trailer: trailer };
  const hash = consentArticleHash(article, 'review');
  expect(matchesConsentArticle(article, expected, hash, 'review')).toBe(true);
  for (const changed of [
    { ...expected, title: 'Changed' },
    { ...expected, content: '<p>Review.</p>' },
    { ...expected, videoTrailer: trailer.replace('ycGRitcszLI', 'abcdefghijk') },
    { ...expected, video_trailer: trailer.replace('ycGRitcszLI', 'abcdefghijk') },
    { ...expected, seoDescription: 'New description' },
  ]) expect(matchesConsentArticle(article, changed, hash, 'review')).toBe(false);
  const noLink = { ...article, content: '<p>Review.</p>' };
  expect(matchesConsentArticle(noLink, { ...noLink, videoTrailer: trailer, video_trailer: trailer }, consentArticleHash(noLink), undefined)).toBe(false);
  const explicit = { ...article, videoTrailer: 'https://www.youtube.com/watch?v=abcdefghijk' };
  expect(matchesConsentArticle(explicit, expected, consentArticleHash(explicit, 'review'), 'review')).toBe(false);
});
it('stores a trailer separately, shows it in preview, and binds its identity to consent', async () => {
  const row = memory.rows.get(path);
  row.article = editableArticle.parse({ ...row.article, videoTrailer: 'https://youtu.be/ycGRitcszLI' });
  expect(row.article.videoTrailer).toBe(trailer);
  expect(articleReadingPreview(row.article).videoTrailer).toBe(trailer);
  expect(row.article.content).not.toContain('youtube');
  const offer = (await submissionConsentOffer('owner', id))!;
  await acceptSubmissionConsent('owner', id, 3, offer.id, 'chat-preview');
  const current = memory.rows.get(path);
  current.prepared = { expected: { ...current.article, video_trailer: trailer } };
  expect(assertPublicationConsent(current, offer.id).id).toBe(offer.id);
  current.prepared.expected.videoTrailer = 'https://www.youtube.com/watch?v=abcdefghijk';
  expect(() => assertPublicationConsent(current, offer.id)).toThrow('preview_changed');
});
it.each(['javascript:alert(1)', 'https://youtube.com.evil.test/watch?v=ycGRitcszLI', 'http://youtube.com/watch?v=ycGRitcszLI', 'https://www.youtube.com/'])('rejects unsafe or invalid trailer input %s', videoTrailer => {
  expect(() => editableArticle.parse({ title: 'Title', content: '<p>Review</p>', videoTrailer })).toThrow();
});
beforeEach(() => {
  memory = memoryFirestore(); state.db = memory.db; state.member = true;
  const article = { title: 'Titel', subtitle: 'Underrubrik', intro: 'Intro', slug: 'titel', seoTitle: 'SEO', seoDescription: 'Beskrivelse',
    author: 'author', category: 'category', subjectType: 'culture', featuredImage: 'https://images.test/cover.png',
    featuredImageAlt: 'Cover', fotoCredit: 'Kilde', content: '<p>Tekst <a href="https://source.test">kilde</a></p><figure><img src="https://images.test/body1.png" alt="Et"><figcaption>Kilde</figcaption></figure><figure><img src="https://images.test/body2.png" alt="To"><figcaption>Kilde</figcaption></figure>' };
  memory.rows.set(path, { id, uid: 'owner', revision: 3, contentHash: 'b'.repeat(64), status: 'draft',
    executionPolicy: 'chatgpt-first-v1', article, originalArticle: article, research: [], choices: { kind: 'culture-guide', media: 'provided', aiFinalChecks: 'human' } });
});
it('offers one consent without approving anything; a double click queues once with a durable replay', async () => {
  const offer = (await submissionConsentOffer('owner', id))!;
  expect(offer.label).toBe('Godkend og udgiv'); expect(memory.rows.get(path)).not.toHaveProperty('approval');
  const results = await Promise.all([acceptSubmissionConsent('owner', id, 3, offer.id, 'chat-preview'), acceptSubmissionConsent('owner', id, 3, offer.id, 'external-preview')]);
  expect(results.map(r => r.replay).sort()).toEqual([false, true]);
  expect(memory.rows.get(path)).toMatchObject({ status: 'processing', publicationConsentPending: true,
    approval: { ceilingDkkMicros: 0, contentHash: 'b'.repeat(64) }, publicationConsent: { id: offer.id, revision: 3, status: 'pending' } });
  expect([...memory.rows.keys()].filter(p => p.includes('/publicationConsents/'))).toHaveLength(1);
  expect(await acceptSubmissionConsent('owner', id, 3, offer.id, 'chat-preview')).toMatchObject({ replay: true });
});
it('binds the exact media selection in the same deliberate click, without pretending generator verification', async () => {
  const assetPath = `${path}/chatAssets/${'c'.repeat(64)}`;
  memory.rows.set(assetPath, { uid: 'owner', assetId: 'c'.repeat(64), status: 'attached', url: memory.rows.get(path).article.featuredImage,
    role: 'cover', originalHash: 'd'.repeat(64), generationEvidence: imageGenerationEvidence({ origin: 'chatgpt-generated', kind: 'illustration' }, {}) });
  const offer = (await submissionConsentOffer('owner', id))!;
  expect(offer.includesPersonalImageSelection).toBe(true);
  await acceptSubmissionConsent('owner', id, 3, offer.id, 'chat-preview');
  expect(memory.rows.get(path).mediaSelection.selectionHash).toBe(offer.selectionHash);
  expect(memory.rows.get(`${path}/mediaSelections/${offer.selectionHash}`)).toMatchObject({ exactPromptExecutionVerified: false, consentId: offer.id });
});
it('refuses missing media, paid/legacy flow, wrong owner, stale version and changed media evidence', async () => {
  const offer = (await submissionConsentOffer('owner', id))!;
  await expect(acceptSubmissionConsent('other', id, 3, offer.id, 'chat-preview')).rejects.toThrow('not_found');
  await expect(acceptSubmissionConsent('owner', id, 2, offer.id, 'chat-preview')).rejects.toThrow('preview_changed');
  memory.rows.get(path).article.featuredImage = '';
  expect(await submissionConsentOffer('owner', id)).toBeNull();
  await expect(acceptSubmissionConsent('owner', id, 3, offer.id, 'chat-preview')).rejects.toThrow('preview_changed');
  memory.rows.get(path).executionPolicy = 'chat-final-checks-v1';
  expect(await submissionConsentOffer('owner', id)).toBeNull();
  expect(memory.rows.get(path).status).toBe('draft');
});
it('binds all editorial fields and link/image identity, while allowing measured dimensions only', async () => {
  const offer = (await submissionConsentOffer('owner', id))!;
  await acceptSubmissionConsent('owner', id, 3, offer.id, 'chat-preview');
  const row = memory.rows.get(path); row.prepared = { expected: structuredClone(row.article) };
  row.prepared.expected.content = row.article.content.replace('<img ', '<img width="960" height="540" ');
  expect(assertPublicationConsent(row, offer.id)).toMatchObject({ id: offer.id });
  for (const field of ['title', 'seoTitle', 'slug', 'author', 'fotoCredit', 'featuredImage', 'rating']) {
    const changed = structuredClone(row); changed.prepared.expected[field] = field === 'rating' ? 6 : 'Changed';
    expect(() => assertPublicationConsent(changed, offer.id)).toThrow('preview_changed');
  }
  for (const change of [row.article.content.replace('source.test', 'evil.test'), row.article.content.replace('body1.png', 'other.png'), '<p>Omskrevet tekst</p>']) {
    const changed = structuredClone(row); changed.prepared.expected.content = change;
    expect(() => assertPublicationConsent(changed, offer.id)).toThrow('preview_changed');
  }
  row.revision++; expect(() => assertPublicationConsent(row, offer.id)).toThrow('preview_changed');
  expect(consentArticleHash(row.article)).toMatch(/^[a-f0-9]{64}$/);
});
it('does not inherit a previous revision’s consent or a revoked member’s click', async () => {
  const offer = (await submissionConsentOffer('owner', id))!;
  state.member = false;
  await expect(acceptSubmissionConsent('owner', id, 3, offer.id, 'external-preview')).rejects.toThrow('owner_access_changed');
  state.member = true; await acceptSubmissionConsent('owner', id, 3, offer.id, 'external-preview');
  Object.assign(memory.rows.get(path), { revision: 4, contentHash: cmsFieldHash({ new: 'version' }), status: 'draft' });
  await expect(acceptSubmissionConsent('owner', id, 3, offer.id, 'external-preview')).rejects.toThrow('preview_changed');
  const next = (await submissionConsentOffer('owner', id))!;
  expect(next).toMatchObject({ revision: 4, label: 'Godkend og udgiv' });
  expect(next.id).not.toBe(offer.id);
  await acceptSubmissionConsent('owner', id, 4, next.id, 'chat-preview');
  expect([...memory.rows.keys()].filter(p => p.includes('/publicationConsents/'))).toHaveLength(2);
  expect(memory.rows.get(path).publicationConsent.revision).toBe(4);
});
it('stores the chosen Copenhagen schedule and never repurposes a replay as publish-now', async () => {
  const date = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10) + 'T10:00';
  const offer = (await submissionConsentOffer('owner', id))!;
  await acceptSubmissionConsent('owner', id, 3, offer.id, 'chat-preview', date);
  const consent = memory.rows.get(path).publicationConsent;
  expect(consent.localTime).toBe(date); expect(Date.parse(consent.publishAt)).toBeGreaterThan(Date.now());
  await expect(acceptSubmissionConsent('owner', id, 3, offer.id, 'chat-preview', 'now')).rejects.toThrow('preview_changed');
});
it('binds the displayed compressed bytes in new consent without rewriting the original selection', async () => {
  const row = memory.rows.get(path), assetId = 'c'.repeat(64), originalHash = 'd'.repeat(64), hash = 'e'.repeat(64);
  const originalUrl = row.article.featuredImage, url = 'https://images.test/cover.webp';
  memory.rows.set(`${path}/chatAssets/${assetId}`, { uid: 'owner', assetId, status: 'attached',
    url: originalUrl, hash: originalHash, originalHash, role: 'cover' });
  row.article.featuredImage = url;
  row.publishedTarget = { itemId: 'f'.repeat(24), mediaDerivatives: [
    { assetId, originalHash, originalUrl, url, hash, field: 'thumb', role: 'cover', receiptId: 'compression-proof' },
  ] };
  const offer = (await submissionConsentOffer('owner', id))!;
  expect(offer.media).toEqual([{ url, hash }]);
  await acceptSubmissionConsent('owner', id, 3, offer.id, 'chat-preview');
  const current = memory.rows.get(path);
  current.prepared = { expected: structuredClone(current.article) };
  current.assets = [{ url, hash }];
  expect(assertPublicationConsent(current, offer.id)).toMatchObject({ media: [{ url, hash }] });
  current.assets[0].hash = originalHash;
  expect(() => assertPublicationConsent(current, offer.id)).toThrow('preview_changed');
  expect(memory.rows.get(`${path}/chatAssets/${assetId}`).originalHash).toBe(originalHash);
});
