import { NextRequest, NextResponse } from 'next/server';
import { exchangeShortLivedToPageToken } from '@/lib/meta/page-token-exchange';

/**
 * POST /api/instagram/exchange-token
 * Kun konvertering (uden gem). Brug /api/instagram/renew-token fra UI.
 */
export async function POST(request: NextRequest) {
  let body: { shortLivedToken?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ugyldig JSON.' }, { status: 400 });
  }

  const shortToken = body.shortLivedToken?.trim();
  if (!shortToken) {
    return NextResponse.json({ error: 'shortLivedToken er påkrævet.' }, { status: 400 });
  }

  const result = await exchangeShortLivedToPageToken(shortToken);
  if ('error' in result) {
    return NextResponse.json(
      {
        error: result.error,
        pages: result.pages,
        pageAccessToken: result.pageAccessToken,
      },
      { status: result.status },
    );
  }

  return NextResponse.json({
    success: true,
    verified: true,
    pageAccessToken: result.pageAccessToken,
    pageName: result.pageName,
    pageId: result.pageId,
    neverExpires: result.neverExpires,
    expiresAt: result.expiresAt,
  });
}
