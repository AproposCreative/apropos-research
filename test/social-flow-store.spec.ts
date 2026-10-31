import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
const mocks = vi.hoisted(() => ({ db: null as any, auth: vi.fn(), token: vi.fn(), bucket: vi.fn() }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => mocks.db, getAdminStorageBucket: (...args: unknown[]) => mocks.bucket(...args) }));
vi.mock('@/lib/editorial-access', () => ({ editorialRequestAccess: mocks.auth }));
vi.mock('@/lib/instagram-config', () => ({ resolveInstagramAccessToken: mocks.token }));
import { readSocialDraft, saveSocialDraft } from '@/lib/social/draft-store';
import { claimSocialPublish, readSocialPublish, saveSocialPublish, reconcileSocialPublish } from '@/lib/social/publish-store';
import { runSocialPublish, type SocialPublisher } from '@/lib/social/publish-runner';
import { GET, POST } from '@/app/api/instagram/publish/route';
import { GET as draftGET, PUT as draftPUT } from '@/app/api/design-editor/draft/route';
import { sameSocialDraft, socialDraftSchema, type SocialEditorDraft } from '@/lib/social/editor-draft';
import { facebookCommentNotice, sortSocialReceipts } from '@/lib/social/receipt-feedback';
import type { SocialPublishInput } from '@/lib/social/publish-types';
import { MetaRequestError } from '@/lib/social/meta-error';
const source = 'a'.repeat(64);
const draft: SocialEditorDraft = { title: 'TONY', subtitle: 'En sommer former Bourdain.', subtitleStatus: 'manual', caption: 'Læs anmeldelsen.', theme: 'dark', size: 'story', titleSizePercent: 110, subtitleSizePercent: 90, eyebrowValues: ['Film'], storyMetaShuffleSeed: 2, facebook: false };
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
const digest = createHash('sha256').update(jpeg).digest('hex');
const input: SocialPublishInput = { requestId: '68ef40d6-159b-446f-8792-511e94de6c61', articleId: 'article', imageUrl: `https://firebasestorage.googleapis.com/v0/b/test-bucket/o/${encodeURIComponent('instagram-publish/owner-'+digest+'.jpg')}?alt=media&token=download`, imageSha256: digest,
  caption: 'En sommer former Bourdain.', articleUrl: 'https://www.aproposmagazine.com/articles/tony', isStory: false, card: { title: 'TONY', excerpt: 'En sommer former Bourdain.' }, channels: { instagram: true, facebook: false } };
function store() {
  const rows = new Map<string, any>(); let tail = Promise.resolve();
  const snapshot = (path: string) => ({ exists: rows.has(path), data: () => rows.has(path) ? structuredClone(rows.get(path)) : undefined });
  const ref = (path: string) => ({ path, get: async () => snapshot(path), update: async (row: any) => { rows.set(path, { ...rows.get(path), ...structuredClone(row) }); } });
  const query = (name: string, filters: [string, any][] = []): any => ({
    doc: (id: string) => ref(name+'/'+id), where: (key: string, _op: string, value: any) => query(name, [...filters, [key, value]]),
    get: async () => ({ docs: [...rows].filter(([path, row]) => path.startsWith(name+'/') && filters.every(([key, value]) => row[key] === value)).map(([path]) => snapshot(path)) }),
  });
  mocks.db = { collection: query,
    runTransaction: (work: (tx: any) => Promise<any>) => {
      const next = tail.then(async () => {
        const writes: (() => void)[] = [];
        const result = await work({ get: async (r: any) => snapshot(r.path),
          set: (r: any, value: any) => writes.push(() => rows.set(r.path, structuredClone(value))),
          create: (r: any, value: any) => writes.push(() => { if (rows.has(r.path)) throw Error('duplicate'); rows.set(r.path, structuredClone(value)); }),
          update: (r: any, value: any) => writes.push(() => rows.set(r.path, { ...rows.get(r.path), ...structuredClone(value) })),
        }); writes.forEach(write => write()); return result;
      }); tail = next.catch(() => {}); return next;
    } };
  return rows;
}
const transport = (): SocialPublisher => ({ create: vi.fn().mockResolvedValue('100'), ready: vi.fn().mockResolvedValue(undefined), instagram: vi.fn().mockResolvedValue('200'), facebook: vi.fn().mockResolvedValue('30_40'), link: vi.fn().mockResolvedValue('https://www.instagram.com/p/example/') });
const req = (path: string, body?: unknown) => new NextRequest('https://example.test'+path, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks(); store(); mocks.auth.mockResolvedValue({ uid: 'owner', owner: true }); mocks.token.mockResolvedValue({ token: 'SECRET-test-token' });
  mocks.bucket.mockReturnValue({ file: () => ({ getMetadata: async () => [{ size: jpeg.length, contentType: 'image/jpeg' }], download: async () => [jpeg] }) });
  vi.stubEnv('INSTAGRAM_ACCOUNT_ID', '123'); vi.stubEnv('FACEBOOK_PAGE_ID', '456'); vi.stubEnv('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET', 'test-bucket');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it('saves source-bound drafts, replays lost acknowledgments and rejects stale devices', async () => {
  const first = await saveSocialDraft('owner', 'article', source, 0, draft);
  expect(first.record.revision).toBe(1);
  expect((await saveSocialDraft('owner', 'article', source, 0, draft)).conflict).toBe(false);
  expect((await saveSocialDraft('owner', 'article', source, 0, { ...draft, title: 'Stale' })).conflict).toBe(true);
  expect((await readSocialDraft('owner', 'article', source)).draft).toEqual(draft);
  expect((await readSocialDraft('another-editor', 'article', source)).draft).toBeNull();
  expect((await readSocialDraft('owner', 'article', 'b'.repeat(64))).draft).toBeNull();
});
it('binds draft APIs to authenticated identity and returns no-store conflicts', async () => {
  mocks.auth.mockResolvedValueOnce(null);
  expect((await draftGET(req('/api/design-editor/draft'))).status).toBe(401);
  const request = () => req('/api/design-editor/draft', { articleId: 'article', sourceHash: source, expectedRevision: 0, draft });
  expect((await draftPUT(request())).status).toBe(200);
  const stale = await draftPUT(req('/api/design-editor/draft', { articleId: 'article', sourceHash: source, expectedRevision: 0, draft: { ...draft, caption: 'Stale' } }));
  expect(stale.status).toBe(409); expect(stale.headers.get('cache-control')).toContain('no-store');
  expect((await draftPUT(req('/api/design-editor/draft', { ownerUid: 'spoof', articleId: 'article', sourceHash: source, expectedRevision: 1, draft }))).status).toBe(400);
});
it('allows exactly one executor under concurrent clicks, request IDs and upload tokens', async () => {
  const claims = await Promise.all(Array.from({ length: 8 }, (_, i) => claimSocialPublish('owner', { ...input, requestId: `68ef40d6-159b-446f-8792-511e94de6c6${i}`, imageUrl: input.imageUrl+'&variation='+i }, '123')));
  expect(claims.filter(c => c.created)).toHaveLength(1);
  expect(new Set(claims.map(c => c.receipt.id)).size).toBe(1);
});
it('rejects changed versions and hidden channel additions under an existing request', async () => {
  await claimSocialPublish('owner', input, '123');
  await expect(claimSocialPublish('owner', { ...input, caption: 'Changed' }, '123')).rejects.toThrow('request_changed');
  await expect(claimSocialPublish('owner', { ...input, channels: { instagram: true, facebook: true } }, '123')).rejects.toThrow('channels_changed');
  expect(await readSocialPublish('another-editor', input.requestId)).toBeNull();
});
it('writes intent before publication and never implicitly cross-posts', async () => {
  const { receipt } = await claimSocialPublish('owner', input, '123'), publisher = transport();
  vi.mocked(publisher.instagram).mockImplementation(async () => {
    expect((await readSocialPublish('owner', input.requestId))?.instagram.status).toBe('sending'); return '200';
  });
  const result = await runSocialPublish(receipt, input, publisher, saveSocialPublish);
  expect(result.instagram.status).toBe('published'); expect(result.instagram.url).toContain('instagram.com');
  expect(publisher.facebook).not.toHaveBeenCalled(); expect(result.comment.status).toBe('skipped');
});
it('keeps accepted Instagram when Facebook times out, and never sends again on replay', async () => {
  const both = { ...input, channels: { instagram: true as const, facebook: true } };
  const { receipt } = await claimSocialPublish('owner', both, '123'), publisher = transport();
  vi.mocked(publisher.facebook).mockRejectedValue(Error('timeout SECRET-test-token'));
  const result = await runSocialPublish(receipt, both, publisher, saveSocialPublish);
  expect(result.instagram.status).toBe('published'); expect(result.facebook.status).toBe('uncertain');
  expect(result.comment.status).toBe('skipped');
  expect((await claimSocialPublish('owner', both, '123')).created).toBe(false);
  expect(JSON.stringify(await readSocialPublish('owner', input.requestId))).not.toContain('SECRET');
});
it('does not call Meta if the dispatch-intent write fails', async () => {
  const { receipt } = await claimSocialPublish('owner', input, '123'), publisher = transport();
  await runSocialPublish(receipt, input, publisher, async row => { if (row.instagram.status === 'sending') throw Error('disk failed'); });
  expect(publisher.instagram).not.toHaveBeenCalled(); expect(receipt.instagram.status).toBe('failed');
});
it('retains a sending lock after acceptance when the final store write is lost', async () => {
  const { receipt } = await claimSocialPublish('owner', input, '123'), publisher = transport();
  await runSocialPublish(receipt, input, publisher, async row => { if (row.instagram.status !== 'pending' && row.instagram.status !== 'sending') throw Error('write lost'); await saveSocialPublish(row); });
  expect((await readSocialPublish('owner', input.requestId))?.instagram.status).toBe('sending');
  expect((await claimSocialPublish('owner', input, '123')).created).toBe(false);
  expect(publisher.instagram).toHaveBeenCalledOnce();
});
it('preserves confirmed posts when permalink readback fails', async () => {
  const { receipt } = await claimSocialPublish('owner', input, '123'), publisher = transport();
  vi.mocked(publisher.link).mockRejectedValue(Error('read error'));
  expect((await runSocialPublish(receipt, input, publisher, saveSocialPublish)).instagram.status).toBe('published');
});
it('keeps readback merges from overwriting later Facebook or comment receipts', async () => {
  const { receipt } = await claimSocialPublish('owner', input, '123');
  await saveSocialPublish({ ...receipt, instagram: { status: 'published', id: '200' }, facebook: { status: 'published', id: '30_40' }, phase: 'done', complete: true });
  const result = await reconcileSocialPublish('owner', receipt.id, { links: [{ channel: 'instagram', id: '200', url: 'https://www.instagram.com/p/example/' }] });
  expect(result.facebook.id).toBe('30_40'); expect(result.phase).toBe('done');
});
it('distinguishes a definite Meta rejection from an ambiguous network response', async () => {
  const { receipt } = await claimSocialPublish('owner', input, '123'), publisher = transport();
  vi.mocked(publisher.instagram).mockRejectedValue(new MetaRequestError(true, 190));
  const result = await runSocialPublish(receipt, input, publisher, saveSocialPublish);
  expect(result.instagram.status).toBe('failed'); expect(result.instagram.error).toContain('Indstillinger');
});
it('requires personal POST and explicit channels, rejects story Facebook and wrong image identity', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  mocks.auth.mockResolvedValueOnce(null); expect((await POST(req('/api/instagram/publish', input))).status).toBe(401);
  expect((await POST(req('/api/instagram/publish', { imageUrl: input.imageUrl }))).status).toBe(400);
  expect((await POST(req('/api/instagram/publish', { ...input, isStory: true, channels: { instagram: true, facebook: true } }))).status).toBe(400);
  expect((await POST(req('/api/instagram/publish', { ...input, imageUrl: 'https://internal.invalid/image.jpg' }))).status).toBe(503);
  expect(fetch).not.toHaveBeenCalled();
});
it('exercises real route, exact JPEG hash, Graph receipts, replay and GET without another POST', async () => {
  const fetch = vi.fn(async (url: string, options: RequestInit) => {
    if (options.method === 'POST' && url.endsWith('/media')) return Response.json({ id: '100' });
    if (url.includes('status_code')) return Response.json({ status_code: 'FINISHED' });
    if (url.endsWith('/media_publish')) return Response.json({ id: '200' });
    if (url.includes('permalink')) return Response.json({ permalink: 'https://www.instagram.com/p/example/' });
    throw Error('Unexpected graph operation');
  }); vi.stubGlobal('fetch', fetch);
  const first = await POST(req('/api/instagram/publish', input)); expect(first.status).toBe(200);
  const receipt = (await first.json()).receipt; expect(receipt.instagram.url).toContain('/p/example/');
  expect((await (await POST(req('/api/instagram/publish', input))).json()).replay).toBe(true);
  expect((await GET(req('/api/instagram/publish?requestId='+input.requestId))).status).toBe(200);
  expect(fetch.mock.calls.filter(([url]) => url.endsWith('/media_publish'))).toHaveLength(1);
  expect(fetch.mock.calls.some(([url]) => /\/photos|\/comments/.test(url))).toBe(false);
});
it('publishes only the two explicitly selected posts, with no Facebook comment or article link write', async () => {
  const fetch = vi.fn(async (url: string, options: RequestInit) => {
    expect(url).not.toContain('SECRET');
    if (url.endsWith('/123/media')) return Response.json({ id: '100' });
    if (url.includes('status_code')) return Response.json({ status_code: 'FINISHED' });
    if (url.endsWith('/media_publish')) return Response.json({ id: '200' });
    if (url.includes('fields=access_token')) return Response.json({ access_token: 'page-secret' });
    if (url.endsWith('/456/photos')) {
      expect(new URLSearchParams(options.body as string).get('url')).toBe(input.imageUrl);
      expect(new URLSearchParams(options.body as string).get('message')).toBe(input.caption);
      expect(options.body).not.toContain(encodeURIComponent(input.articleUrl));
      expect((options.headers as Record<string, string>)['Content-Type']).toBe('application/x-www-form-urlencoded');
      return Response.json({ id: '888', post_id: '456_999' });
    }
    if (url.includes('permalink_url')) return Response.json({ permalink_url: 'https://www.facebook.com/example/posts/999' });
    if (url.includes('permalink')) return Response.json({ permalink: 'https://www.instagram.com/p/example/' });
    throw Error('Unexpected operation');
  }); vi.stubGlobal('fetch', fetch);
  const both = { ...input, channels: { instagram: true as const, facebook: true } };
  const receipt = (await (await POST(req('/api/instagram/publish', both))).json()).receipt;
  expect(receipt.facebook.id).toBe('456_999'); expect(receipt.comment.status).toBe('skipped');
  expect(receipt.phase).toBe('done');
  expect(facebookCommentNotice(receipt)).toBeNull();
  expect(receipt.facebook.url).toContain('facebook.com/example/posts/999');
  await POST(req('/api/instagram/publish', both));
  expect(fetch.mock.calls.filter(([url]) => url.endsWith('/photos'))).toHaveLength(1);
  expect(fetch.mock.calls.filter(([url]) => url.endsWith('/comments'))).toHaveLength(0);
});
it('publishes Stories with no feed caption, Facebook photo or comment', async () => {
  const bodies: any[] = [];
  const fetch = vi.fn(async (url: string, options: RequestInit) => {
    if (url.endsWith('/media')) { bodies.push(JSON.parse(options.body as string)); return Response.json({ id: '100' }); }
    if (url.includes('status_code')) return Response.json({ status_code: 'FINISHED' });
    if (url.endsWith('/media_publish')) return Response.json({ id: '200' });
    if (url.includes('permalink')) return Response.json({});
    throw Error('Unexpected operation');
  }); vi.stubGlobal('fetch', fetch);
  const receipt = (await (await POST(req('/api/instagram/publish', { ...input, isStory: true }))).json()).receipt;
  expect(receipt.instagram.status).toBe('published'); expect(bodies[0]).toEqual({ image_url: input.imageUrl, media_type: 'STORIES' });
  expect(fetch.mock.calls.some(([url]) => /photos|comments/.test(url))).toBe(false);
});
it('recovers a lost Instagram acknowledgement by GET container readback with zero POST calls', async () => {
  const { receipt } = await claimSocialPublish('owner', input, '123');
  await saveSocialPublish({ ...receipt, containerId: '100', instagram: { status: 'uncertain' }, complete: true, phase: 'stopped' });
  const fetch = vi.fn(async (_url: string, options: RequestInit) => { expect(options.method).toBeUndefined(); return Response.json({ status_code: 'PUBLISHED' }); });
  vi.stubGlobal('fetch', fetch);
  const response = await GET(req('/api/instagram/publish?requestId='+input.requestId));
  expect((await response.json()).receipt.instagram.status).toBe('published'); expect(fetch).toHaveBeenCalledOnce();
  expect((await claimSocialPublish('owner', input, '123')).created).toBe(false);
});
it('refuses a forged JPEG digest before any Meta call', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  mocks.bucket.mockReturnValue({ file: () => ({ getMetadata: async () => [{ size: 4, contentType: 'image/jpeg' }], download: async () => [Buffer.from([0xff, 0xd8, 0xff, 0x01])] }) });
  expect((await POST(req('/api/instagram/publish', input))).status).toBe(503); expect(fetch).not.toHaveBeenCalled();
});
it('never publishes when durable storage is unavailable', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch); mocks.db = null;
  expect((await POST(req('/api/instagram/publish', input))).status).toBe(503); expect(fetch).not.toHaveBeenCalled();
});
it('uses the approved design identity across Safari/Chrome JPEG byte differences', async () => {
  const first = await claimSocialPublish('owner', input, '123');
  const next = await claimSocialPublish('owner', { ...input, requestId: '68ef40d6-159b-446f-8792-511e94de6c62', imageSha256: 'b'.repeat(64), imageUrl: input.imageUrl+'&another-device=1', card: { ...input.card, theme: 'light', titleSizePercent: 100, subtitleSizePercent: 100 } }, '123');
  expect(next.created).toBe(false); expect(next.receipt.id).toBe(first.receipt.id);
  expect(next.receipt.imageSha256).toBe(input.imageSha256);
});
it('keeps old draft and publish identities at default spacing, while preserving custom spacing', async () => {
  expect(sameSocialDraft(draft, { ...draft, titleSubtitleGap: 24 })).toBe(true);
  expect(sameSocialDraft(draft, { ...draft, titleSubtitleGap: 0 })).toBe(false);
  const saved = await saveSocialDraft('owner', 'article', source, 0, { ...draft, titleSubtitleGap: 8 });
  expect((await readSocialDraft('owner', 'article', source)).draft?.titleSubtitleGap).toBe(8);
  expect(saved.record.revision).toBe(1);
  const original = await claimSocialPublish('owner', input, '123');
  const normal = await claimSocialPublish('owner', { ...input, requestId: '68ef40d6-159b-446f-8792-511e94de6c62', card: { ...input.card, titleSubtitleGap: 24 } }, '123');
  expect(normal.created).toBe(false); expect(normal.receipt.id).toBe(original.receipt.id);
  const custom = await claimSocialPublish('owner', { ...input, requestId: '68ef40d6-159b-446f-8792-511e94de6c63', card: { ...input.card, titleSubtitleGap: 8 } }, '123');
  expect(custom.created).toBe(true); expect(custom.receipt.approved.card.titleSubtitleGap).toBe(8);
  expect((await claimSocialPublish('owner', { ...input, requestId: '68ef40d6-159b-446f-8792-511e94de6c64', card: { ...input.card, titleSubtitleGap: 8 } }, '123')).created).toBe(false);
});
it.each([-1, 121, 1.5])('rejects invalid spacing %s before touching Meta', async gap => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  expect(socialDraftSchema.safeParse({ ...draft, titleSubtitleGap: gap }).success).toBe(false);
  expect((await POST(req('/api/instagram/publish', { ...input, card: { ...input.card, titleSubtitleGap: gap } }))).status).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
});
it('preserves historical denied comments and post locks without prompting for comment access or replay', async () => {
  const both = { ...input, channels: { instagram: true as const, facebook: true } };
  const { receipt } = await claimSocialPublish('owner', both, '123');
  Object.assign(receipt, { complete: true, phase: 'stopped', instagram: { status: 'published', id: '200', url: 'https://www.instagram.com/p/example/' },
    facebook: { status: 'published', id: '30_40', url: 'https://www.facebook.com/example/posts/40' },
    comment: { status: 'failed', errorCode: 200, error: 'Meta afviste handlingen (kode 200).' } });
  await saveSocialPublish(receipt);
  expect(facebookCommentNotice(receipt)?.text).toContain('Tidligere forsøg');
  expect(facebookCommentNotice(receipt)).not.toHaveProperty('settings');
  const old = { ...receipt, comment: { status: 'failed' as const, error: 'Meta afviste handlingen (kode 200).' } };
  expect(facebookCommentNotice(old)).toEqual(facebookCommentNotice(receipt));
  expect((await claimSocialPublish('owner', both, '123')).created).toBe(false);
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  const replay = await (await POST(req('/api/instagram/publish', both))).json();
  expect(replay.replay).toBe(true); expect(replay.receipt.comment).toEqual(receipt.comment);
  expect((await (await GET(req('/api/instagram/publish?requestId='+input.requestId))).json()).receipt.comment).toEqual(receipt.comment);
  expect(fetch).not.toHaveBeenCalled();
  const newer = { ...receipt, id: 'story', createdAt: '2026-10-31T13:52:29.162Z', channels: { instagram: true as const, facebook: false } };
  receipt.createdAt = '2026-10-31T13:51:10.183Z';
  expect(sortSocialReceipts([receipt, newer]).map(r => r.id)).toEqual(['story', receipt.id]);
  expect(facebookCommentNotice(newer)).toBeNull();
  expect(facebookCommentNotice({ ...receipt, comment: { status: 'uncertain' } })?.text).toContain('ikke bekræftet');
});
