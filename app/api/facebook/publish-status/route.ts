import { NextResponse } from 'next/server';

const INSTAGRAM_API_VERSION = 'v24.0';
const GRAPH_HOST = 'https://graph.facebook.com';

function tokenRefreshHint(): string {
  return process.env.NODE_ENV === 'production'
    ? 'Facebook/Instagram-tokenet er muligvis udløbet. Opdater INSTAGRAM_ACCESS_TOKEN i Vercel (Production env).'
    : 'Facebook/Instagram-tokenet er muligvis udløbet. Opdater INSTAGRAM_ACCESS_TOKEN i .env.local.';
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
      const isTokenExpired =
        data?.error?.code === 190 ||
        /session has expired|error validating access token|token.*expired/i.test(msg);
      return NextResponse.json({
        configured: true,
        reachable: false,
        pageId,
        pageName: null,
        error: isTokenExpired ? tokenRefreshHint() : msg,
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
