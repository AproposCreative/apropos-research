import { NextRequest, NextResponse } from 'next/server';
import { resolveInstagramAccessToken } from '@/lib/instagram-config';

export const maxDuration = 120;
export const runtime = 'nodejs';

const INSTAGRAM_API_VERSION = 'v24.0';
const GRAPH_HOST = 'https://graph.facebook.com';
const PROCESSING_INITIAL_POLL_MS = 800;
const PROCESSING_MAX_POLL_MS = 3000;
const PROCESSING_MAX_WAIT_MS = 60_000; // 60s max wait

function tokenRefreshHint(graphMessage?: string): string {
  const sessionInvalidated = /password|session has been invalidated|security reasons/i.test(
    String(graphMessage || ''),
  );
  if (sessionInvalidated) {
    return process.env.NODE_ENV === 'production'
      ? 'Facebook-sessionen er invalideret (ofte efter adgangskodeskift). Gå til Indstillinger → Social: nyt bruger-token fra Graph API Explorer, konvertér, opdater INSTAGRAM_ACCESS_TOKEN i Vercel, og redeploy.'
      : 'Facebook-sessionen er invalideret (ofte efter adgangskodeskift). Indstillinger → Social: nyt token, konvertér, opdater INSTAGRAM_ACCESS_TOKEN i .env.local, og genstart dev-server.';
  }
  return process.env.NODE_ENV === 'production'
    ? 'Instagram-tokenet er udløbet. Opdater INSTAGRAM_ACCESS_TOKEN i Vercel (Production env) med et nyt Page access token fra Meta, og redeploy (se docs/INSTAGRAM_PUBLISH.md).'
    : 'Instagram-tokenet er udløbet. Opdater INSTAGRAM_ACCESS_TOKEN i .env.local med et nyt Page access token fra Meta (se docs/INSTAGRAM_PUBLISH.md).';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getContainerStatus(containerId: string, accessToken: string) {
  const statusRes = await fetch(
    `${GRAPH_HOST}/${INSTAGRAM_API_VERSION}/${containerId}?fields=status_code,status,error_message`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
  const statusData = await statusRes.json().catch(() => ({}));
  return { ok: statusRes.ok, data: statusData };
}

async function waitForContainerReady(containerId: string, accessToken: string) {
  let lastStatusCode = '';
  let elapsed = 0;
  let delay = PROCESSING_INITIAL_POLL_MS;

  while (elapsed < PROCESSING_MAX_WAIT_MS) {
    const { ok, data } = await getContainerStatus(containerId, accessToken);
    if (ok) {
      const statusCode = String(data.status_code || '').toUpperCase();
      lastStatusCode = statusCode;
      if (statusCode === 'FINISHED' || statusCode === 'PUBLISHED') {
        return { ready: true as const, timedOut: false as const, statusCode, error: null as string | null };
      }
      if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
        return {
          ready: false as const,
          timedOut: false as const,
          statusCode,
          error: String(data.error_message || data.status || 'Instagram kunne ikke behandle billedet.'),
        };
      }
    }
    await sleep(delay);
    elapsed += delay;
    delay = Math.min(delay * 1.5, PROCESSING_MAX_POLL_MS);
  }
  return {
    ready: false as const,
    timedOut: true as const,
    statusCode: lastStatusCode || 'IN_PROGRESS',
    error: 'Instagram er stadig ved at behandle billedet. Forsøger publicering alligevel...',
  };
}

async function getPageAccessToken(pageId: string, userToken: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${GRAPH_HOST}/${INSTAGRAM_API_VERSION}/${pageId}?fields=access_token&access_token=${encodeURIComponent(userToken)}`,
    );
    const data = await res.json().catch(() => ({}));
    return data.access_token || null;
  } catch {
    return null;
  }
}

async function publishToFacebookPagePhoto(args: {
  pageId: string;
  accessToken: string;
  imageUrl: string;
  message?: string;
}) {
  const { pageId, accessToken, imageUrl, message } = args;

  const pageToken = await getPageAccessToken(pageId, accessToken) || accessToken;

  const params = new URLSearchParams();
  params.set('url', imageUrl);
  if (message) params.set('message', message);
  params.set('access_token', pageToken);

  const fbRes = await fetch(`${GRAPH_HOST}/${INSTAGRAM_API_VERSION}/${pageId}/photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const fbData = await fbRes.json().catch(() => ({}));

  if (!fbRes.ok) {
    const errMsg = String(fbData?.error?.message || '');
    if (/publish_actions|permission.*not available/i.test(errMsg)) {
      return {
        ok: false,
        data: {
          error: {
            message:
              'Facebook kræver "pages_manage_posts"-tilladelsen. ' +
              'Generer et nyt Page token i Graph API Explorer med pages_manage_posts, ' +
              'og opdater INSTAGRAM_ACCESS_TOKEN.',
          },
        },
        status: fbRes.status,
      };
    }
  }

  return { ok: fbRes.ok, data: fbData, status: fbRes.status };
}

async function commentOnFacebookPost(args: {
  postId: string;
  pageId: string;
  accessToken: string;
  message: string;
}) {
  const { postId, pageId, accessToken, message } = args;
  const pageToken = await getPageAccessToken(pageId, accessToken) || accessToken;
  const params = new URLSearchParams();
  params.set('message', message);
  params.set('access_token', pageToken);

  const commentRes = await fetch(`${GRAPH_HOST}/${INSTAGRAM_API_VERSION}/${postId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const commentData = await commentRes.json().catch(() => ({}));
  return { ok: commentRes.ok, data: commentData, status: commentRes.status };
}

/**
 * GET /api/instagram/publish
 * Returnerer om Instagram-publish er konfigureret (til UI / test).
 */
export async function GET() {
  const { token } = await resolveInstagramAccessToken();
  const ok = !!process.env.INSTAGRAM_ACCOUNT_ID?.trim() && !!token;
  return NextResponse.json({ configured: ok });
}

/**
 * POST /api/instagram/publish
 * Body: { imageUrl: string, caption?: string, isStory?: boolean, articleUrl?: string }
 * - imageUrl: Offentlig URL til JPEG-billedet (fx fra Firebase Storage)
 * - caption: Tekst til feed-opslag (valgfri)
 * - isStory: true => publicer som Instagram Story
 *
 * Kræver env: INSTAGRAM_ACCOUNT_ID (IG Business Account ID), INSTAGRAM_ACCESS_TOKEN (PAGE access token).
 * Bruger graph.facebook.com + Page token som i Meta Instagram API med Facebook Login.
 */
export async function POST(request: NextRequest) {
  const igId = process.env.INSTAGRAM_ACCOUNT_ID;
  const { token: accessToken } = await resolveInstagramAccessToken();
  const facebookPageId = process.env.FACEBOOK_PAGE_ID?.trim();

  if (!igId || !accessToken) {
    return NextResponse.json(
      { error: 'Instagram-publish er ikke konfigureret (manglende INSTAGRAM_ACCOUNT_ID eller INSTAGRAM_ACCESS_TOKEN).' },
      { status: 503 }
    );
  }

  let body: { imageUrl?: string; caption?: string; isStory?: boolean; articleUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ugyldig JSON i body.' }, { status: 400 });
  }

  const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : '';
  const isStory = body.isStory === true;
  const articleUrl = typeof body.articleUrl === 'string' && /^https?:\/\//i.test(body.articleUrl.trim())
    ? body.articleUrl.trim()
    : '';
  if (!imageUrl || !imageUrl.startsWith('http')) {
    return NextResponse.json({ error: 'Manglende eller ugyldig imageUrl.' }, { status: 400 });
  }

  try {
    // 1) Opret container (Instagram henter billedet fra imageUrl)
    const createPayload = isStory
      ? {
          image_url: imageUrl,
          media_type: 'STORIES',
        }
      : {
          image_url: imageUrl,
          caption: (body.caption ?? '').trim() || undefined,
        };

    const createRes = await fetch(
      `${GRAPH_HOST}/${INSTAGRAM_API_VERSION}/${igId}/media`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(createPayload),
      }
    );

    const createData = await createRes.json().catch(() => ({}));
    if (!createRes.ok) {
      console.error('Instagram media create error:', createRes.status, createData);
      const msg = createData.error?.message ?? '';
      const isTokenExpired =
        createData.error?.code === 190 ||
        /session has expired|error validating access token|token.*expired|password|session has been invalidated/i.test(
          String(msg),
        );
      const userMessage = isTokenExpired
        ? tokenRefreshHint(msg)
        : (msg || 'Instagram kunne ikke oprette opslag.');
      return NextResponse.json(
        { error: userMessage },
        { status: 502 }
      );
    }

    const containerId = createData.id;
    if (!containerId) {
      return NextResponse.json(
        { error: 'Instagram returnerede ikke container-id.' },
        { status: 502 }
      );
    }

    // 2) Vent til containeren er færdigbehandlet (Meta kan ellers svare "Media ID is not available")
    const readiness = await waitForContainerReady(containerId, accessToken);
    if (!readiness.ready && !readiness.timedOut) {
      return NextResponse.json(
        { error: readiness.error || 'Instagram er ikke klar til publicering endnu.' },
        { status: 502 }
      );
    }

    // 3) Publicer containeren (med kort retry på race conditions)
    let publishRes: Response | null = null;
    let publishData: any = {};
    for (let attempt = 0; attempt < 6; attempt += 1) {
      publishRes = await fetch(
        `${GRAPH_HOST}/${INSTAGRAM_API_VERSION}/${igId}/media_publish`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ creation_id: containerId }),
        }
      );

      publishData = await publishRes.json().catch(() => ({}));
      if (publishRes.ok) break;

      const msg = String(publishData?.error?.message || '');
      const mediaIdNotReady = /media id is not available|not available|still processing/i.test(msg);
      if (mediaIdNotReady && attempt < 5) {
        await sleep(2000);
        continue;
      }
      break;
    }

    if (!publishRes || !publishRes.ok) {
      console.error('Instagram media_publish error:', publishRes.status, publishData);
      const msg = publishData.error?.message ?? '';
      const isTokenExpired =
        publishData.error?.code === 190 ||
        /session has expired|error validating access token|token.*expired|password|session has been invalidated/i.test(
          String(msg),
        );
      const userMessage = isTokenExpired
        ? tokenRefreshHint(msg)
        : /media id is not available|not available|still processing/i.test(String(msg))
          ? 'Instagram er stadig ved at behandle billedet. Vent 5-10 sekunder og prøv igen.'
        : (msg || 'Instagram kunne ikke publicere.');
      return NextResponse.json(
        { error: userMessage },
        { status: 502 }
      );
    }

    let facebookPublished: boolean | null = null;
    let facebookPostId: string | null = null;
    let facebookError: string | null = null;
    let facebookCommentPublished: boolean | null = null;
    let facebookCommentId: string | null = null;
    let facebookCommentError: string | null = null;

    // Optional: also publish the same content to Facebook Page when configured.
    if (!isStory && facebookPageId) {
      try {
        const fbPublish = await publishToFacebookPagePhoto({
          pageId: facebookPageId,
          accessToken,
          imageUrl,
          message: (body.caption ?? '').trim() || undefined,
        });
        if (fbPublish.ok) {
          facebookPublished = true;
          facebookPostId = String(fbPublish.data?.post_id || fbPublish.data?.id || '');
          if (facebookPostId && articleUrl) {
            try {
              const fbComment = await commentOnFacebookPost({
                postId: facebookPostId,
                pageId: facebookPageId,
                accessToken,
                message: articleUrl,
              });
              if (fbComment.ok) {
                facebookCommentPublished = true;
                facebookCommentId = String(fbComment.data?.id || '');
              } else {
                facebookCommentPublished = false;
                const rawCommentErr = String(fbComment.data?.error?.message || '');
                facebookCommentError = /insufficient permissions|#200/i.test(rawCommentErr)
                  ? 'Mangler tilladelse til kommentarer (pages_manage_engagement). Opslaget er live — tilføj artikellink manuelt.'
                  : rawCommentErr || 'Kunne ikke kommentere med artikellink på Facebook.';
                console.error('Facebook first comment error:', fbComment.status, fbComment.data);
              }
            } catch (commentErr) {
              facebookCommentPublished = false;
              facebookCommentError = 'Kunne ikke kommentere med artikellink på Facebook.';
              console.error('Facebook first comment failed:', commentErr);
            }
          }
        } else {
          facebookPublished = false;
          facebookError = String(fbPublish.data?.error?.message || 'Kunne ikke poste automatisk til Facebook.');
          console.error('Facebook page publish error:', fbPublish.status, fbPublish.data);
        }
      } catch (fbErr) {
        facebookPublished = false;
        facebookError = 'Kunne ikke poste automatisk til Facebook.';
        console.error('Facebook page publish failed:', fbErr);
      }
    }

    const warnings: string[] = [];
    if (facebookPublished === true && facebookCommentPublished === false && articleUrl) {
      warnings.push('facebook_comment');
    }
    if (facebookPublished === false && facebookPageId) {
      warnings.push('facebook_publish');
    }

    return NextResponse.json({
      success: true,
      partialSuccess: warnings.length > 0,
      warnings,
      mediaId: publishData.id,
      facebookPublished,
      facebookPostId,
      facebookError,
      facebookCommentPublished,
      facebookCommentId,
      facebookCommentError,
    });
  } catch (e) {
    console.error('Instagram publish error:', e);
    return NextResponse.json(
      { error: 'Der opstod en fejl under publicering.' },
      { status: 500 }
    );
  }
}
