import { NextRequest, NextResponse } from 'next/server';
import { resolveInstagramAccessToken } from '@/lib/instagram-config';
import { editorialRequestAccess } from '@/lib/editorial-access';
import { socialPublishSchema } from '@/lib/social/publish-types';
import { claimSocialPublish, readSocialPublish, readSocialPublishIdentity, recentSocialPublishes, saveSocialPublish, reconcileSocialPublish } from '@/lib/social/publish-store';
import { metaPublisher, instagramContainerPublished } from '@/lib/social/meta-publisher';
import { runSocialPublish } from '@/lib/social/publish-runner';
import { verifyPublishImage } from '@/lib/social/publish-image';
import { after } from 'next/server';
import { dispatchBrowserStory, storyBrowserConfigured, storyBrowserRequested, storyBrowserRequest } from '@/lib/social/story-browser';
export const maxDuration = 300;
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store' };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });

export async function GET(request: NextRequest) {
  const access = await editorialRequestAccess(request);
  if (!access) return json({ error: 'Log ind som redaktør.' }, 401);
  try {
    const requestId = request.nextUrl.searchParams.get('requestId');
    const articleId = request.nextUrl.searchParams.get('articleId');
    if (requestId) {
      if (!/^[a-f0-9-]{36}$/i.test(requestId)) return json({ error: 'Ugyldigt kvitterings-ID.' }, 400);
      let receipt = await readSocialPublish(access.uid, requestId);
      if (!receipt) return json({ error: 'Intet publiceringsforsøg registreret.' }, 404);
      const { token } = await resolveInstagramAccessToken();
      if (token && receipt.delivery !== 'business-suite') {
        const publisher = metaPublisher({ token, instagramId: process.env.INSTAGRAM_ACCOUNT_ID || '', facebookPageId: process.env.FACEBOOK_PAGE_ID });
        const published = !!(receipt.containerId && ['sending', 'uncertain'].includes(receipt.instagram.status) &&
          await instagramContainerPublished(receipt.containerId, token).catch(() => false));
        const links: Array<{ channel: 'instagram' | 'facebook'; id: string; url: string }> = [];
        for (const channel of ['instagram', 'facebook'] as const) {
          const result = receipt[channel];
          if (result.status === 'published' && result.id && !result.url) {
            const url = await publisher.link(channel, result.id).catch(() => null);
            if (url) links.push({ channel, id: result.id, url });
          }
        }
        if (published || links.length) receipt = await reconcileSocialPublish(access.uid, receipt.id, { containerId: receipt.containerId, published, links });
      }
      return json({ receipt });
    }
    if (articleId) {
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(articleId)) return json({ error: 'Ugyldig artikel.' }, 400);
      return json({ receipts: await recentSocialPublishes(access.uid, articleId) });
    }
    const { token } = await resolveInstagramAccessToken();
    return json({ configured: Boolean(process.env.INSTAGRAM_ACCOUNT_ID?.trim() && token),
      facebookConfigured: Boolean(process.env.FACEBOOK_PAGE_ID?.trim() && token),
      storyLinkDelivery: storyBrowserRequested() ? 'business-suite' : null });
  } catch { return json({ error: 'Status kunne ikke hentes. Der sendes ikke et nyt opslag.' }, 503); }
}

export async function POST(request: NextRequest) {
  const access = await editorialRequestAccess(request);
  if (!access) return json({ error: 'Log ind som redaktør.' }, 401);
  const parsed = socialPublishSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: 'Udgivelsen mangler en gyldig artikel, billedversion, kanalvalg eller forsøgs-ID.' }, 400);
  const input = parsed.data;
  const article = new URL(input.articleUrl);
  if (article.protocol !== 'https:' || !['www.aproposmagazine.com', 'aproposmagazine.com'].includes(article.hostname) ||
    !/^\/articles\/[^/]+$/.test(article.pathname) || article.search || article.hash) return json({ error: 'Ugyldigt artikellink.' }, 400);
  const instagramId = process.env.INSTAGRAM_ACCOUNT_ID?.trim(), facebookPageId = process.env.FACEBOOK_PAGE_ID?.trim();
  const { token } = await resolveInstagramAccessToken();
  if (!instagramId || !token || (input.channels.facebook && !facebookPageId)) return json({ error: 'En valgt kanal er ikke konfigureret. Intet er sendt.' }, 503);
  try {
    await verifyPublishImage(access.uid, input);
    if (await readSocialPublishIdentity(access.uid, input, instagramId)) {
      const claim = await claimSocialPublish(access.uid, input, instagramId);
      return json({ receipt: claim.receipt, replay: true });
    }
    if (input.isStory && storyBrowserRequested()) {
      if (!storyBrowserConfigured()) return json({ error: 'Story-serveren er ikke tilsluttet. Intet er udgivet.', connectionRequired: true, notDispatched: true }, 503);
      // Validate the independent hosted connection before reserving a new post.
      // Existing operations still replay below through the shared identity lock.
      try {
        const status = await storyBrowserRequest('/status');
        const state = await status.json();
        if (!status.ok || state.connected !== true) throw Error();
      } catch { return json({ error: 'Story-forbindelsen skal tilsluttes af ejeren. Intet er udgivet.', connectionRequired: true, notDispatched: true }, 503); }
    }
    const browserStory = input.isStory && storyBrowserConfigured();
    const claim = await claimSocialPublish(access.uid, input, instagramId, browserStory ? { browserStory: true } : undefined);
    if (!claim.created) return json({ receipt: claim.receipt, replay: true });
    if (input.isStory && storyBrowserConfigured()) {
      const receipt = claim.receipt;
      after(async () => { await dispatchBrowserStory(receipt.id).catch(() => { /* Durable task and duplicate lock remain. GET never resends. */ }); });
      return json({ receipt }, 202);
    }
    const receipt = await runSocialPublish(claim.receipt, input,
      metaPublisher({ token, instagramId, facebookPageId }), saveSocialPublish);
    return json({ receipt });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (['social_publish_request_changed', 'social_publish_channels_changed', 'social_publish_already_requested'].includes(message)) {
      return json({ error: 'Denne billed- og tekstversion har allerede et publiceringsforsøg. Hent kvitteringen; der er ikke sendt igen.' }, 409);
    }
    return json({ error: 'Udgivelsen kunne ikke bekræftes. Hent status for samme forsøg før et nyt klik.' }, 503);
  }
}
