import { NextRequest, NextResponse } from 'next/server';
import { saveInstagramAccessToken } from '@/lib/instagram-config';
import { runInstagramTokenDiagnostics } from '@/lib/meta/instagram-token-diagnostics';
import { exchangeShortLivedToPageToken } from '@/lib/meta/page-token-exchange';

/**
 * POST /api/instagram/renew-token
 * Konverterer Explorer-token → gemmer page-token → tester Instagram + Facebook.
 * Body: { shortLivedToken: string }
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
    return NextResponse.json({ error: 'Indsæt bruger-token fra Graph API Explorer.' }, { status: 400 });
  }

  const exchanged = await exchangeShortLivedToPageToken(shortToken);
  if ('error' in exchanged) {
    return NextResponse.json(
      {
        success: false,
        step: 'exchange',
        error: exchanged.error,
        pages: exchanged.pages,
      },
      { status: exchanged.status },
    );
  }

  let savedTo: string[] = [];
  try {
    const saved = await saveInstagramAccessToken(exchanged.pageAccessToken);
    savedTo = saved.savedTo;
  } catch (e) {
    return NextResponse.json(
      {
        success: false,
        step: 'save',
        error: e instanceof Error ? e.message : 'Kunne ikke gemme token.',
        pageName: exchanged.pageName,
      },
      { status: 500 },
    );
  }

  const status = await runInstagramTokenDiagnostics(exchanged.pageAccessToken);

  return NextResponse.json({
    success: status.ok,
    steps: {
      exchange: { ok: true, pageName: exchanged.pageName, neverExpires: exchanged.neverExpires },
      save: { ok: true, savedTo },
      verify: status,
    },
    pageName: exchanged.pageName,
    tokenPreview: `${exchanged.pageAccessToken.slice(0, 8)}…`,
  });
}
