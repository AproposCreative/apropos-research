import { NextRequest, NextResponse } from 'next/server';

const GRAPH_HOST = 'https://graph.facebook.com';
const API_VERSION = 'v24.0';

/**
 * POST /api/instagram/exchange-token
 *
 * Converts a short-lived User Access Token into a **never-expiring Page Access Token**.
 *
 * Flow:
 *   1. short-lived user token  →  long-lived user token (60 days)
 *   2. long-lived user token   →  permanent Page Access Token (never expires)
 *
 * Body: { shortLivedToken: string }
 * Requires env: META_APP_ID, META_APP_SECRET, FACEBOOK_PAGE_ID
 */
export async function POST(request: NextRequest) {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  const pageId = process.env.FACEBOOK_PAGE_ID?.trim();

  if (!appId || !appSecret) {
    return NextResponse.json(
      {
        error:
          'META_APP_ID og META_APP_SECRET skal sættes i env for at kunne udveksle tokens. ' +
          'Find dem i Meta App Dashboard → Settings → Basic.',
      },
      { status: 503 },
    );
  }

  let body: { shortLivedToken?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ugyldig JSON.' }, { status: 400 });
  }

  const shortToken = body.shortLivedToken?.trim();
  if (!shortToken) {
    return NextResponse.json(
      { error: 'shortLivedToken er påkrævet.' },
      { status: 400 },
    );
  }

  // ── Step 1: Exchange short-lived → long-lived user token ──────────
  const exchangeUrl = new URL(`${GRAPH_HOST}/${API_VERSION}/oauth/access_token`);
  exchangeUrl.searchParams.set('grant_type', 'fb_exchange_token');
  exchangeUrl.searchParams.set('client_id', appId);
  exchangeUrl.searchParams.set('client_secret', appSecret);
  exchangeUrl.searchParams.set('fb_exchange_token', shortToken);

  const exchangeRes = await fetch(exchangeUrl.toString());
  const exchangeData = await exchangeRes.json().catch(() => ({}));

  if (!exchangeRes.ok || !exchangeData.access_token) {
    return NextResponse.json(
      {
        error:
          'Kunne ikke udveksle til long-lived token. ' +
          (exchangeData?.error?.message || 'Tjek at tokenet er gyldigt og app-credentials er korrekte.'),
      },
      { status: 502 },
    );
  }

  const longLivedUserToken: string = exchangeData.access_token;
  const expiresIn: number | undefined = exchangeData.expires_in;

  // ── Step 2: Get permanent Page Access Token ───────────────────────
  // When requested with a long-lived user token, the returned page token never expires.
  const targetPageId = pageId;

  if (!targetPageId) {
    // No page ID — try to list all pages so the user can pick one
    const pagesRes = await fetch(
      `${GRAPH_HOST}/${API_VERSION}/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(longLivedUserToken)}`,
    );
    const pagesData = await pagesRes.json().catch(() => ({}));

    if (!pagesRes.ok || !pagesData.data?.length) {
      return NextResponse.json(
        {
          error:
            'FACEBOOK_PAGE_ID er ikke sat, og kunne ikke hente sider. ' +
            (pagesData?.error?.message || 'Sæt FACEBOOK_PAGE_ID i env.'),
          longLivedUserToken,
          longLivedExpiresIn: expiresIn,
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: false,
      message:
        'FACEBOOK_PAGE_ID er ikke sat. Vælg en side fra listen herunder og sæt dens ID som FACEBOOK_PAGE_ID.',
      pages: pagesData.data.map((p: any) => ({
        id: p.id,
        name: p.name,
        pageAccessToken: p.access_token,
      })),
      longLivedUserToken,
      longLivedExpiresIn: expiresIn,
    });
  }

  // Fetch the specific page's permanent token
  const pageRes = await fetch(
    `${GRAPH_HOST}/${API_VERSION}/${targetPageId}?fields=id,name,access_token&access_token=${encodeURIComponent(longLivedUserToken)}`,
  );
  const pageData = await pageRes.json().catch(() => ({}));

  if (!pageRes.ok || !pageData.access_token) {
    return NextResponse.json(
      {
        error:
          'Kunne ikke hente Page Access Token. ' +
          (pageData?.error?.message || 'Tjek at FACEBOOK_PAGE_ID er korrekt og at brugeren har adgang til siden.'),
        longLivedUserToken,
      },
      { status: 502 },
    );
  }

  // ── Step 3: Verify the page token is long-lived ───────────────────
  const debugRes = await fetch(
    `${GRAPH_HOST}/${API_VERSION}/debug_token?input_token=${encodeURIComponent(pageData.access_token)}&access_token=${encodeURIComponent(appId + '|' + appSecret)}`,
  );
  const debugData = await debugRes.json().catch(() => ({}));
  const tokenExpires = debugData?.data?.expires_at;
  const neverExpires = tokenExpires === 0 || !tokenExpires;

  return NextResponse.json({
    success: true,
    pageAccessToken: pageData.access_token,
    pageName: pageData.name,
    pageId: pageData.id,
    neverExpires,
    expiresAt: neverExpires ? null : new Date(tokenExpires * 1000).toISOString(),
    hint:
      'Kopiér pageAccessToken og sæt den som INSTAGRAM_ACCESS_TOKEN i Vercel → Environment Variables → Production. Redeploy bagefter.',
  });
}
