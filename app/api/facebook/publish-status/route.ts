import { NextResponse } from 'next/server';

const INSTAGRAM_API_VERSION = 'v24.0';
const GRAPH_HOST = 'https://graph.facebook.com';

function tokenRefreshHint(): string {
  return process.env.NODE_ENV === 'production'
    ? 'Facebook/Instagram-tokenet er muligvis udløbet. Opdater INSTAGRAM_ACCESS_TOKEN i Vercel (Production env).'
    : 'Facebook/Instagram-tokenet er muligvis udløbet. Opdater INSTAGRAM_ACCESS_TOKEN i .env.local.';
}

function permissionHint(): string {
  return 'Tokenet mangler sandsynligvis tilladelser (fx pages_show_list/pages_read_engagement/pages_manage_posts) eller adgang til den valgte Facebook-side.';
}

export async function GET() {
  const pageId = process.env.FACEBOOK_PAGE_ID?.trim();
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN?.trim();

  if (!pageId || !accessToken) {
    return NextResponse.json({
      configured: false,
      reachable: false,
      pageId: pageId || null,
      pageName: null,
      error: 'Mangler FACEBOOK_PAGE_ID eller INSTAGRAM_ACCESS_TOKEN.',
    });
  }

  try {
    const res = await fetch(
      `${GRAPH_HOST}/${INSTAGRAM_API_VERSION}/${pageId}?fields=id,name`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = String(data?.error?.message || 'Kunne ikke læse Facebook-side.');
      const errCode = Number(data?.error?.code || 0);
      const errSubcode = Number(data?.error?.error_subcode || 0);
      const isTokenExpired =
        errCode === 190 ||
        errSubcode === 463 ||
        /session has expired|error validating access token|token.*expired/i.test(msg);
      const isPermissionIssue =
        errCode === 10 ||
        errCode === 200 ||
        /permission|requires.*permission|insufficient/i.test(msg);
      const isObjectMissing =
        errCode === 100 ||
        /unsupported get request|does not exist|cannot be loaded/i.test(msg);

      let friendlyError = msg;
      if (isTokenExpired) {
        friendlyError = tokenRefreshHint();
      } else if (isPermissionIssue) {
        friendlyError = permissionHint();
      } else if (isObjectMissing) {
        friendlyError = `Facebook-siden kunne ikke findes eller tilgås (FACEBOOK_PAGE_ID=${pageId}). Tjek at page-id er korrekt, og at tokenet har adgang til siden.`;
      }

      return NextResponse.json({
        configured: true,
        reachable: false,
        pageId,
        pageName: null,
        error: friendlyError,
        debug: {
          errorCode: errCode || null,
          errorSubcode: errSubcode || null,
          graphMessage: msg,
        },
      });
    }

    return NextResponse.json({
      configured: true,
      reachable: true,
      pageId: String(data?.id || pageId),
      pageName: String(data?.name || ''),
      error: null,
    });
  } catch (error) {
    return NextResponse.json({
      configured: true,
      reachable: false,
      pageId,
      pageName: null,
      error: `Facebook test fejlede: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}
