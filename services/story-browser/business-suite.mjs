// Only visible UI interactions. No private Meta endpoints, session export API,
// CAPTCHA solver, credential logging, injected DOM writes or automatic resend.
const profile = 'aproposmagazineofficial';
const articlePath = value => { const u = new URL(value); return u.protocol === 'https:' &&
  ['www.aproposmagazine.com', 'aproposmagazine.com'].includes(u.hostname) && /^\/articles\/[^/]+$/.test(u.pathname) ? u.pathname : null; };
const home = 'https://business.facebook.com/latest/home?asset_id=153671808120715&business_id=1007740821530860';
export const META_HOME = home;
export const INSTAGRAM_PROFILE = `https://www.instagram.com/${profile}/`;

export async function metaConnectionReady(page) {
  return await page.getByRole('button', { name: 'Opret story', exact: true }).isVisible().catch(() => false) &&
    await page.getByRole('heading', { name: 'Apropos Magazine', exact: true }).isVisible().catch(() => false);
}
export async function prepareStory(page, task, imagePath) {
  if (!articlePath(task.articleUrl) || task.stickerLabel !== 'Læs anmeldelsen') throw Error('invalid_story_task');
  await page.goto(home);
  await page.getByRole('button', { name: 'Opret story', exact: true }).waitFor({ state: 'visible', timeout: 30_000 });
  if (!await metaConnectionReady(page)) throw Error('meta_login_required');
  await page.getByRole('button', { name: 'Opret story', exact: true }).click();
  const channels = page.getByRole('combobox', { name: /^Del her:/ });
  await channels.waitFor({ state: 'visible' });
  await channels.click();
  const facebook = page.getByRole('option', { name: 'Apropos Magazine', exact: true });
  if (await facebook.getAttribute('aria-selected') === 'true') await facebook.click();
  const instagram = page.getByRole('option', { name: profile, exact: true });
  if (await instagram.getAttribute('aria-selected') !== 'true') await instagram.click();
  await page.getByRole('heading', { name: 'Opret story', exact: true }).click();
  if ((await channels.innerText()).trim() !== profile) throw Error('story_channel_mismatch');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Tilføj billede/video', exact: true }).click();
  await (await chooser).setFiles(imagePath);
  await page.getByRole('button', { name: 'Rediger', exact: true }).click({ timeout: 60_000 });
  const editor = page.getByRole('dialog', { name: 'Rediger billede', exact: true });
  await editor.getByRole('button', { name: 'Flere klistermærker', exact: true }).click();
  await editor.getByRole('button', { name: 'Create link sticker', exact: true }).click();
  const form = page.getByRole('tooltip').filter({ has: page.getByRole('textbox', { name: 'Link', exact: true }) });
  await form.getByRole('textbox', { name: 'Link', exact: true }).fill(task.articleUrl);
  await form.getByRole('textbox', { name: 'Brugerdefineret klistermærketekst∙Valgfrit', exact: true }).fill(task.stickerLabel);
  if (await form.getByRole('textbox', { name: 'Link', exact: true }).inputValue() !== task.articleUrl) throw Error('story_link_changed');
  await form.getByRole('button', { name: 'Anvend', exact: true }).click();
  await editor.getByRole('button', { name: 'Anvend', exact: true }).click();
  await editor.waitFor({ state: 'hidden' });
  // Preserve the supplied design as the base image; Meta's native link sticker
  // is the additional interactive layer, as in the owner's verified test.
  if ((await channels.innerText()).trim() !== profile) throw Error('story_channel_mismatch');
  return { channel: profile, articleUrl: task.articleUrl, stickerLabel: task.stickerLabel };
}

/** Verify the newest Story through the real Instagram viewer. No API ID guessing.
 * The caller must additionally bind the displayed image to the approved JPEG. */
export async function readCurrentStories(context) {
  const page = await context.newPage();
  try {
    await page.goto(INSTAGRAM_PROFILE);
    if (!await page.locator('a[href="/direct/inbox/"]').isVisible()) throw Error('meta_login_required');
    await page.getByRole('button', { name: `${profile}s profilbillede`, exact: true }).click({ timeout: 20_000 });
    try { await page.waitForURL(/\/stories\/aproposmagazineofficial\/\d+\//, { timeout: 10_000 }); }
    catch { if (page.url() === INSTAGRAM_PROFILE) return { page, ids: [] }; throw Error('story_viewer_unavailable'); }
    const pause = page.getByRole('button', { name: 'Pause', exact: true });
    if (await pause.isVisible()) await pause.click();
    const ids = [];
    for (let i = 0; i < 20; i++) {
      ids.push(page.url());
      const next = page.getByRole('button', { name: 'Næste', exact: true });
      if (!await next.isVisible()) break;
      if (i === 19) throw Error('too_many_active_stories');
      await next.click();
      if (await pause.isVisible()) await pause.click();
    }
    return { page, ids };
  } catch (error) { await page.close(); throw error; }
}

export async function verifyStoryLink(context, expectedArticle, imageMatches, previousUrls) {
  const { page } = await readCurrentStories(context);
  try {
    const storyUrl = page.url();
    if (previousUrls.includes(storyUrl)) return { linkVerified: false };
    if (!await imageMatches(page)) return { linkVerified: false };
    const mediaId = new URL(storyUrl).pathname.match(/\/stories\/aproposmagazineofficial\/(\d+)\//)?.[1];
    const buttons = page.getByRole('button');
    const candidates = await buttons.evaluateAll(elements => elements.map((el, index) => {
      const r = el.getBoundingClientRect();
      return { index, empty: !el.textContent?.trim() && !el.getAttribute('aria-label'), width: r.width, height: r.height };
    }).filter(x => x.empty && x.width > 50 && x.height > 20));
    if (candidates.length !== 1) return { mediaId, storyUrl, linkVerified: false };
    await buttons.nth(candidates[0].index).click();
    const visit = page.getByRole('link', { name: 'Gå til link Vinkeltegn mod højre', exact: true });
    const href = await visit.getAttribute('href');
    const destination = href?.startsWith('https://l.instagram.com/') ? new URL(href).searchParams.get('u') : href;
    if (!destination || articlePath(destination) !== articlePath(expectedArticle)) return { mediaId, storyUrl, linkVerified: false };
    const popup = page.waitForEvent('popup');
    await visit.click();
    const article = await popup;
    try {
      await article.waitForURL(u => u.hostname === 'www.aproposmagazine.com' && articlePath(u.href) === articlePath(expectedArticle));
      await article.getByRole('heading', { level: 1 }).waitFor({ state: 'visible' });
      return { mediaId, storyUrl, linkVerified: true, articleUrl: expectedArticle };
    } finally { await article.close(); }
  } finally { await page.close(); }
}

export async function clickPublish(page, beforePublish) {
  await beforePublish(); // Persisted, transactional one-click lock BEFORE clicking.
  await page.getByRole('button', { name: 'Del', exact: true }).click({ timeout: 15_000 });
  // A timeout here is ambiguous; no second click, new job or alternate transport.
  await page.getByRole('heading', { name: 'Opret story', exact: true }).waitFor({ state: 'hidden', timeout: 60_000 });
}
