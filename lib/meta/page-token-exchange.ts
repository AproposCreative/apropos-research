import { classifyMetaGraphError, issueUserMessage } from '@/lib/meta/token-errors';

const GRAPH_HOST = 'https://graph.facebook.com';
const API_VERSION = 'v24.0';

export type PageTokenExchangeResult =
  | {
      ok: true;
      pageAccessToken: string;
      pageName: string;
      pageId: string;
      neverExpires: boolean;
      expiresAt: string | null;
    }
  | {
      ok: false;
      error: string;
      status: number;
      pages?: Array<{ id: string; name: string; pageAccessToken: string }>;
      pageAccessToken?: string;
    };

async function verifyPageTokenWorks(args: {
  pageToken: string;
  pageId: string;
  igId?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { pageToken, pageId, igId } = args;

  const pageRes = await fetch(
    `${GRAPH_HOST}/${API_VERSION}/${pageId}?fields=id,name`,
    { headers: { Authorization: `Bearer ${pageToken}` } },
  );
  const pageData = await pageRes.json().catch(() => ({}));
  if (!pageRes.ok) {
    const msg = String(pageData?.error?.message || 'Facebook-side kunne ikke læses.');
    const issue = classifyMetaGraphError(
      msg,
      Number(pageData?.error?.code || 0),
      Number(pageData?.error?.error_subcode || 0),
    );
    return { ok: false, error: issueUserMessage(issue) || msg };
  }

  if (igId) {
    const igRes = await fetch(`${GRAPH_HOST}/${API_VERSION}/${igId}?fields=id,username`, {
      headers: { Authorization: `Bearer ${pageToken}` },
    });
    const igData = await igRes.json().catch(() => ({}));
    if (!igRes.ok) {
      const msg = String(igData?.error?.message || 'Instagram-konto kunne ikke læses.');
      const issue = classifyMetaGraphError(
        msg,
        Number(igData?.error?.code || 0),
        Number(igData?.error?.error_subcode || 0),
      );
      return { ok: false, error: issueUserMessage(issue) || msg };
    }
  }

  return { ok: true };
}

export async function exchangeShortLivedToPageToken(
  shortToken: string,
): Promise<PageTokenExchangeResult> {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  const targetPageId = process.env.FACEBOOK_PAGE_ID?.trim();
  const igId = process.env.INSTAGRAM_ACCOUNT_ID?.trim();

  if (!appId || !appSecret) {
    return {
      ok: false,
      status: 503,
      error:
        'META_APP_ID og META_APP_SECRET mangler. Sæt dem i .env.local eller Vercel.',
    };
  }

  try {
    const dbgUrl = `${GRAPH_HOST}/${API_VERSION}/debug_token?input_token=${encodeURIComponent(shortToken)}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`;
    const dbgRes = await fetch(dbgUrl);
    const dbgJson = await dbgRes.json().catch(() => ({}));
    if (dbgJson?.data?.type === 'PAGE') {
      return {
        ok: false,
        status: 400,
        error:
          'Indsæt et kort bruger-token fra Explorer (User), ikke et page-token.',
      };
    }
  } catch {
    /* optional */
  }

  const exchangeUrl = new URL(`${GRAPH_HOST}/${API_VERSION}/oauth/access_token`);
  exchangeUrl.searchParams.set('grant_type', 'fb_exchange_token');
  exchangeUrl.searchParams.set('client_id', appId);
  exchangeUrl.searchParams.set('client_secret', appSecret);
  exchangeUrl.searchParams.set('fb_exchange_token', shortToken);

  const exchangeRes = await fetch(exchangeUrl.toString());
  const exchangeData = await exchangeRes.json().catch(() => ({}));

  if (!exchangeRes.ok || !exchangeData.access_token) {
    return {
      ok: false,
      status: 502,
      error:
        exchangeData?.error?.message ||
        'Kunne ikke udveksle token. Tjek Explorer-token og Meta app-credentials.',
    };
  }

  const longLivedUserToken: string = exchangeData.access_token;

  if (!targetPageId) {
    const pagesRes = await fetch(
      `${GRAPH_HOST}/${API_VERSION}/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(longLivedUserToken)}`,
    );
    const pagesData = await pagesRes.json().catch(() => ({}));
    if (!pagesRes.ok || !pagesData.data?.length) {
      return {
        ok: false,
        status: 400,
        error:
          pagesData?.error?.message ||
          'FACEBOOK_PAGE_ID mangler, og sider kunne ikke hentes.',
      };
    }
    return {
      ok: false,
      status: 400,
      error: 'Sæt FACEBOOK_PAGE_ID i miljøet, eller vælg side nedenfor.',
      pages: pagesData.data.map((p: { id: string; name: string; access_token: string }) => ({
        id: p.id,
        name: p.name,
        pageAccessToken: p.access_token,
      })),
    };
  }

  const pageRes = await fetch(
    `${GRAPH_HOST}/${API_VERSION}/${targetPageId}?fields=id,name,access_token&access_token=${encodeURIComponent(longLivedUserToken)}`,
  );
  const pageData = await pageRes.json().catch(() => ({}));

  if (!pageRes.ok || !pageData.access_token) {
    return {
      ok: false,
      status: 502,
      error:
        pageData?.error?.message ||
        'Kunne ikke hente page-token. Tjek FACEBOOK_PAGE_ID og side-adgang.',
    };
  }

  const debugRes = await fetch(
    `${GRAPH_HOST}/${API_VERSION}/debug_token?input_token=${encodeURIComponent(pageData.access_token)}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`,
  );
  const debugData = await debugRes.json().catch(() => ({}));
  const tokenExpires = debugData?.data?.expires_at;
  const neverExpires = tokenExpires === 0 || !tokenExpires;

  const verification = await verifyPageTokenWorks({
    pageToken: pageData.access_token,
    pageId: pageData.id,
    igId: igId || undefined,
  });

  if ('error' in verification) {
    return {
      ok: false,
      status: 502,
      error: verification.error,
      pageAccessToken: pageData.access_token,
    };
  }

  return {
    ok: true,
    pageAccessToken: pageData.access_token,
    pageName: pageData.name,
    pageId: pageData.id,
    neverExpires,
    expiresAt: neverExpires ? null : new Date(tokenExpires * 1000).toISOString(),
  };
}
