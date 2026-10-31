import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { META_HOME, INSTAGRAM_PROFILE, metaConnectionReady, prepareStory, clickPublish, readCurrentStories, verifyStoryLink } from './business-suite.mjs';

const hostAllowed = value => {
  const u = new URL(value);
  return u.protocol === 'https:' && ['facebook.com', 'instagram.com'].some(host => u.hostname === host || u.hostname.endsWith('.'+host));
};
function boundedState(state) {
  return { cookies: state.cookies.filter(c => /(^|\.)facebook\.com$|(^|\.)instagram\.com$/.test(c.domain.replace(/^\./, ''))),
    origins: state.origins.filter(o => hostAllowed(o.origin)) };
}

export function createStoryRuntime({ browser, store, bucket, sharp, revalidate }) {
  let setup = null, running = false, setupRunning = false, setupOwner = null, setupEpoch = 0;
  const contextOptions = state => ({ storageState: state, viewport: { width: 1650, height: 1045 }, locale: 'da-DK', timezoneId: 'Europe/Copenhagen' });
  async function setupPage() {
    // OAuth may open a new provider window or close it after returning. Follow
    // only actual pages in this setup context, always on Facebook/Instagram.
    const pages = setup.context.pages().filter(page => !page.isClosed());
    const page = pages[pages.length-1]; if (!page) throw Error('story_setup_expired');
    await page.waitForURL(url => hostAllowed(url.href), { timeout: 20_000 });
    const viewport = page.viewportSize();
    if (page !== setup.page || viewport?.width !== 1650 || viewport?.height !== 1045) await page.setViewportSize({ width: 1650, height: 1045 });
    setup.page = page;
  }
  async function matchesImage(page, original) {
    // Read only a rendered Story image asset, not private application state.
    const images = await page.locator('img').evaluateAll(els => els.map(el => {
      const r = el.getBoundingClientRect(); return { src: el.currentSrc, width: r.width, height: r.height };
    }).filter(x => x.width > 200 && x.height > 300));
    if (images.length !== 1) return false;
    const u = new URL(images[0].src);
    if (u.protocol !== 'https:' || !/(^|\.)(cdninstagram\.com|fbcdn\.net)$/.test(u.hostname)) return false;
    const response = await page.request.get(u.href, { timeout: 15_000, maxRedirects: 0 });
    if (!response.ok()) return false;
    const bytes = await response.body(); if (bytes.length > 8*1024*1024) return false;
    const thumb = data => sharp(data).resize(32, 56, { fit: 'fill' }).removeAlpha().raw().toBuffer();
    const [a, b] = await Promise.all([thumb(original), thumb(bytes)]);
    // The extra native sticker and JPEG recompression may differ. Requiring a
    // fresh Story URL, a single candidate and close visual agreement binds the
    // readback to the approved design; uncertainty never authorises a resend.
    return a.length === b.length && a.reduce((sum, value, i) => sum+Math.abs(value-b[i]), 0)/a.length < 12;
  }
  return {
    async process(id) {
      if (running || setupRunning || (setup && setup.expiresAt >= Date.now())) return { busy: true };
      running = true;
      let task, context, directory, deadline;
      try {
        if (setup) { await setup.context.close(); setup = null; }
        const claim = await store.claim(id);
        if (!claim.claimed) return { accepted: false, busy: !!claim.busy };
        task = claim.task;
        const state = await store.session();
        if (!state) throw Error('meta_login_required');
        if (task.objectPath !== `instagram-publish/${task.ownerUid}-${task.imageSha256}.jpg`) throw Error('invalid_story_image');
        const file = bucket.file(task.objectPath), [metadata] = await file.getMetadata();
        if (Number(metadata.size) > 8*1024*1024 || metadata.contentType !== 'image/jpeg') throw Error('invalid_story_image');
        const [bytes] = await file.download(task.imageUrl);
        if (bytes.length > 8*1024*1024 || createHash('sha256').update(bytes).digest('hex') !== task.imageSha256) throw Error('invalid_story_image');
        const image = await sharp(bytes).metadata();
        if (image.width !== 1080 || image.height !== 1920) throw Error('invalid_story_image_dimensions');
        directory = await mkdtemp(join(tmpdir(), 'apropos-story-'));
        const path = join(directory, 'approved.jpg'); await writeFile(path, bytes);
        context = await browser.newContext(contextOptions(state));
        const activeContext = context;
        deadline = setTimeout(() => { void activeContext.close().catch(() => {}); }, 230_000);
        const previous = await readCurrentStories(context);
        const previousUrls = previous.ids; await previous.page.close();
        const page = await context.newPage();
        await prepareStory(page, task, path);
        await clickPublish(page, async () => { await revalidate(task); await store.beforePublish(id); });
        let result = { linkVerified: false };
        for (let i = 0; i < 4; i++) {
          result = await verifyStoryLink(context, task.articleUrl, candidate => matchesImage(candidate, bytes), previousUrls).catch(() => result);
          if (result.mediaId) break;
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
        const receipt = await store.finish(id, result);
        await store.saveSession(boundedState(await context.storageState()));
        return { accepted: true, phase: receipt.phase };
      } catch (error) {
        if (task) await store.finish(id, { loginRequired: error?.message === 'meta_login_required' }).catch(() => {});
        return { accepted: false, error: 'story_stopped_check_receipt' };
      } finally {
        if (deadline) clearTimeout(deadline);
        await context?.close().catch(() => {});
        if (directory) await rm(directory, { recursive: true, force: true });
        running = false;
      }
    },
    async setup(ownerUid, input) {
      if (input.action === 'cancel') {
        if ((setup && setup.ownerUid !== ownerUid) || (setupRunning && setupOwner !== ownerUid)) throw Error('story_browser_busy');
        setupEpoch++;
        const current = setup;
        setup = null;
        await current?.context.close();
        return { ...await store.status(), cancelled: true };
      }
      if (running || setupRunning) throw Error('story_browser_busy');
      setupRunning = true; setupOwner = ownerUid;
      const epoch = setupEpoch;
      try {
      if (setup && setup.expiresAt < Date.now()) { await setup.context.close(); setup = null; }
      if (input.action === 'begin') {
        if (setup && setup.ownerUid !== ownerUid) throw Error('story_browser_busy');
        if (!setup) {
          const context = await browser.newContext(contextOptions(await store.session()));
          try {
            const page = await context.newPage();
            await page.goto(META_HOME);
            if (epoch !== setupEpoch) throw Error('story_setup_expired');
            setup = { id: randomUUID(), ownerUid, context, page, expiresAt: Date.now()+15*60_000 };
          } catch (error) { await context.close(); throw error; }
        }
      } else {
        if (!setup || setup.ownerUid !== ownerUid || setup.id !== input.setupId) throw Error('story_setup_expired');
        await setupPage();
        if (!hostAllowed(setup.page.url())) throw Error('story_setup_domain');
        if (input.action === 'click') {
          const popup = setup.context.waitForEvent('page', { timeout: 1200 }).catch(() => null);
          await setup.page.mouse.click(input.x, input.y); await popup;
        }
        else if (input.action === 'text') await setup.page.keyboard.insertText(input.text);
        else if (input.action === 'key') await setup.page.keyboard.press(input.key);
        else if (input.action === 'instagram') await setup.page.goto(INSTAGRAM_PROFILE);
        else if (input.action === 'finish') {
          const meta = await setup.context.newPage();
          try {
            await meta.goto(META_HOME);
            await meta.getByRole('button', { name: 'Opret story', exact: true }).waitFor({ state: 'visible', timeout: 20_000 });
            if (!await metaConnectionReady(meta)) throw Error('meta_login_required');
            const check = await readCurrentStories(setup.context); await check.page.close();
            await store.saveSession(boundedState(await setup.context.storageState()));
          } finally { await meta.close(); }
          await setup.context.close(); setup = null;
          return { connected: true };
        }
      }
      // Setup is human-driven and confined to the two named services. Never
      // expose cookies, storage, page HTML, arbitrary URLs or evaluation access.
      await setupPage();
      if (epoch !== setupEpoch) throw Error('story_setup_expired');
      if (!hostAllowed(setup.page.url())) throw Error('story_setup_domain');
      // Human activity renews the idle window. Never discard an active login
      // simply because the first screenshot was opened fifteen minutes ago.
      setup.expiresAt = Date.now()+15*60_000;
      return { connected: false, setupId: setup.id, expiresAt: setup.expiresAt,
        screenshot: (await setup.page.screenshot({ type: 'jpeg', quality: 70 })).toString('base64'), width: 1650, height: 1045 };
      } finally { setupRunning = false; setupOwner = null; }
    },
    status: () => store.status(),
  };
}
