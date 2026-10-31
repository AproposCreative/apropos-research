import { afterEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
const ui = vi.hoisted(() => ({ prepare: vi.fn(), publish: vi.fn(), read: vi.fn(), verify: vi.fn() }));
vi.mock('../services/story-browser/business-suite.mjs', () => ({
  META_HOME: 'https://business.facebook.com/latest/home', INSTAGRAM_PROFILE: 'https://www.instagram.com/aproposmagazineofficial/',
  metaConnectionReady: vi.fn().mockResolvedValue(true), prepareStory: ui.prepare, clickPublish: ui.publish, readCurrentStories: ui.read, verifyStoryLink: ui.verify,
}));
import { createStoryRuntime } from '../services/story-browser/runtime.mjs';
afterEach(() => vi.clearAllMocks());
async function fixture() {
  const bytes = await sharp({ create: { width: 1080, height: 1920, channels: 3, background: '#000' } }).jpeg().toBuffer();
  const digest = createHash('sha256').update(bytes).digest('hex');
  const task = { id: 'one', ownerUid: 'owner', objectPath: `instagram-publish/owner-${digest}.jpg`, imageSha256: digest,
    articleUrl: 'https://www.aproposmagazine.com/articles/tony', stickerLabel: 'Læs anmeldelsen' };
  const page = { close: vi.fn().mockResolvedValue(undefined) };
  const context = { newPage: vi.fn().mockResolvedValue(page), close: vi.fn().mockResolvedValue(undefined), storageState: async () => ({ cookies: [], origins: [] }) };
  const browser = { newContext: vi.fn().mockResolvedValue(context) };
  const store = { claim: vi.fn().mockResolvedValue({ claimed: true, task }), session: vi.fn().mockResolvedValue({ cookies: [], origins: [] }),
    beforePublish: vi.fn(), finish: vi.fn().mockResolvedValue({ phase: 'done' }), saveSession: vi.fn() };
  const bucket = { file: vi.fn().mockReturnValue({ getMetadata: async () => [{ size: bytes.length, contentType: 'image/jpeg' }], download: async () => [bytes] }) };
  const revalidate = vi.fn();
  ui.prepare.mockResolvedValue({}); ui.publish.mockImplementation(async (_page, before: () => Promise<void>) => { await before(); });
  ui.read.mockResolvedValue({ page, ids: ['https://www.instagram.com/stories/aproposmagazineofficial/old/'] });
  ui.verify.mockResolvedValue({ mediaId: '123', storyUrl: 'https://www.instagram.com/stories/aproposmagazineofficial/123/', linkVerified: true });
  return { runtime: createStoryRuntime({ browser, store, bucket, sharp, revalidate }), store, browser, context, bucket, task, revalidate };
}
it('executes the approved image once, revalidates before the click and records independent readback', async () => {
  const f = await fixture();
  expect(await f.runtime.process('one')).toMatchObject({ accepted: true, phase: 'done' });
  expect(ui.prepare).toHaveBeenCalledOnce(); expect(ui.publish).toHaveBeenCalledOnce(); expect(f.revalidate).toHaveBeenCalledWith(f.task);
  expect(f.store.beforePublish).toHaveBeenCalledWith('one'); expect(f.store.finish).toHaveBeenCalledWith('one', expect.objectContaining({ linkVerified: true, mediaId: '123' }));
  expect(f.context.close).toHaveBeenCalledOnce();
});
it('stops tampered bytes before opening a browser or reaching Meta', async () => {
  const f = await fixture(); f.task.imageSha256 = '0'.repeat(64);
  expect(await f.runtime.process('one')).toMatchObject({ accepted: false });
  expect(f.browser.newContext).not.toHaveBeenCalled(); expect(ui.prepare).not.toHaveBeenCalled(); expect(ui.publish).not.toHaveBeenCalled();
});
it('does not create an alternate session or provider fallback if the hosted login is missing', async () => {
  const f = await fixture(); f.store.session.mockResolvedValue(undefined);
  expect(await f.runtime.process('one')).toMatchObject({ accepted: false });
  expect(f.store.finish).toHaveBeenCalledWith('one', { loginRequired: true }); expect(ui.publish).not.toHaveBeenCalled();
});
it('does not execute or log in again when a persisted task is already claimed', async () => {
  const f = await fixture(); f.store.claim.mockResolvedValue({ claimed: false, busy: false });
  expect(await f.runtime.process('one')).toMatchObject({ accepted: false });
  expect(f.store.session).not.toHaveBeenCalled(); expect(f.browser.newContext).not.toHaveBeenCalled();
});
it('stops when current personal approval is revoked, without a second publish attempt', async () => {
  const f = await fixture(); f.revalidate.mockRejectedValue(Error('revoked'));
  expect(await f.runtime.process('one')).toMatchObject({ accepted: false });
  expect(f.store.beforePublish).not.toHaveBeenCalled(); expect(ui.publish).toHaveBeenCalledOnce(); expect(f.context.close).toHaveBeenCalledOnce();
});

async function setupFixture(popupHost = 'www.facebook.com') {
  const pages: any[] = []; let opened: ((page: any) => void) | undefined;
  function page(label: string) {
    let url = 'https://business.facebook.com/latest/home', closed = false;
    const p = { url: () => url, isClosed: () => closed, close: async () => { closed = true; },
      goto: async (value: string) => { url = value; },
      waitForURL: async (match: (url: URL) => boolean) => { if (!match(new URL(url))) throw Error('domain_rejected'); },
      screenshot: async () => Buffer.from(label),
      mouse: { click: async () => { const popup = page('popup'); await popup.goto('https://'+popupHost+'/login'); opened?.(popup); } },
    }; pages.push(p); return p;
  }
  const context = { pages: () => pages, newPage: async () => page('main'), close: vi.fn(),
    waitForEvent: () => new Promise(resolve => { opened = resolve; }) };
  const store = { session: async () => undefined, saveSession: vi.fn() };
  return { runtime: createStoryRuntime({ browser: { newContext: async () => context }, store, bucket: {}, sharp, revalidate: vi.fn() }), pages, store };
}
it('follows a real provider login popup and returns to the original page after it closes', async () => {
  const f = await setupFixture(); const start = await f.runtime.setup('owner', { action: 'begin' });
  const popup = await f.runtime.setup('owner', { action: 'click', setupId: start.setupId, x: 1, y: 1 });
  expect(Buffer.from(popup.screenshot, 'base64').toString()).toBe('popup');
  await f.pages[1].close();
  const back = await f.runtime.setup('owner', { action: 'refresh', setupId: start.setupId });
  expect(Buffer.from(back.screenshot, 'base64').toString()).toBe('main'); expect(f.store.saveSession).not.toHaveBeenCalled();
});
it('never displays a login popup outside Facebook and Instagram', async () => {
  const f = await setupFixture('attacker.test'); const start = await f.runtime.setup('owner', { action: 'begin' });
  await expect(f.runtime.setup('owner', { action: 'click', setupId: start.setupId, x: 1, y: 1 })).rejects.toThrow('domain_rejected');
  expect(f.store.saveSession).not.toHaveBeenCalled();
});
it('keeps a hosted login setup bound to its original owner and exact setup ID', async () => {
  const f = await setupFixture(); const start = await f.runtime.setup('owner', { action: 'begin' });
  await expect(f.runtime.setup('other', { action: 'refresh', setupId: start.setupId })).rejects.toThrow('story_setup_expired');
  await expect(f.runtime.setup('owner', { action: 'refresh', setupId: 'wrong' })).rejects.toThrow('story_setup_expired');
  expect((await f.runtime.setup('owner', { action: 'refresh', setupId: start.setupId })).setupId).toBe(start.setupId);
});
