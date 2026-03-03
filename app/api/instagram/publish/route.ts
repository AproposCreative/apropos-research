import { NextRequest, NextResponse } from 'next/server';

const INSTAGRAM_API_VERSION = 'v24.0';
const GRAPH_HOST = 'https://graph.facebook.com';

/**
 * GET /api/instagram/publish
 * Returnerer om Instagram-publish er konfigureret (til UI / test).
 */
export async function GET() {
  const ok =
    !!process.env.INSTAGRAM_ACCOUNT_ID?.trim() &&
    !!process.env.INSTAGRAM_ACCESS_TOKEN?.trim();
  return NextResponse.json({ configured: ok });
}

/**
 * POST /api/instagram/publish
 * Body: { imageUrl: string, caption?: string }
 * - imageUrl: Offentlig URL til JPEG-billedet (fx fra Firebase Storage)
 * - caption: Tekst til opslaget (valgfri)
 *
 * Kræver env: INSTAGRAM_ACCOUNT_ID (IG Business Account ID), INSTAGRAM_ACCESS_TOKEN (PAGE access token).
 * Bruger graph.facebook.com + Page token som i Meta Instagram API med Facebook Login.
 */
export async function POST(request: NextRequest) {
  const igId = process.env.INSTAGRAM_ACCOUNT_ID;
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;

  if (!igId || !accessToken) {
    return NextResponse.json(
      { error: 'Instagram-publish er ikke konfigureret (manglende INSTAGRAM_ACCOUNT_ID eller INSTAGRAM_ACCESS_TOKEN).' },
      { status: 503 }
    );
  }

  let body: { imageUrl?: string; caption?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ugyldig JSON i body.' }, { status: 400 });
  }

  const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : '';
  if (!imageUrl || !imageUrl.startsWith('http')) {
    return NextResponse.json({ error: 'Manglende eller ugyldig imageUrl.' }, { status: 400 });
  }

  try {
    // 1) Opret container (Instagram henter billedet fra imageUrl)
    const createRes = await fetch(
      `${GRAPH_HOST}/${INSTAGRAM_API_VERSION}/${igId}/media`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          image_url: imageUrl,
          caption: (body.caption ?? '').trim() || undefined,
        }),
      }
    );

    const createData = await createRes.json().catch(() => ({}));
    if (!createRes.ok) {
      console.error('Instagram media create error:', createRes.status, createData);
      const msg = createData.error?.message ?? '';
      const isTokenExpired =
        createData.error?.code === 190 ||
        /session has expired|error validating access token|token.*expired/i.test(String(msg));
      const userMessage = isTokenExpired
        ? 'Instagram-tokenet er udløbet. Opdater INSTAGRAM_ACCESS_TOKEN i .env.local med et nyt Page access token fra Meta (se docs/INSTAGRAM_PUBLISH.md).'
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

    // 2) Publicer containeren
    const publishRes = await fetch(
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

    const publishData = await publishRes.json().catch(() => ({}));
    if (!publishRes.ok) {
      console.error('Instagram media_publish error:', publishRes.status, publishData);
      const msg = publishData.error?.message ?? '';
      const isTokenExpired =
        publishData.error?.code === 190 ||
        /session has expired|error validating access token|token.*expired/i.test(String(msg));
      const userMessage = isTokenExpired
        ? 'Instagram-tokenet er udløbet. Opdater INSTAGRAM_ACCESS_TOKEN i .env.local med et nyt Page access token fra Meta (se docs/INSTAGRAM_PUBLISH.md).'
        : (msg || 'Instagram kunne ikke publicere.');
      return NextResponse.json(
        { error: userMessage },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      mediaId: publishData.id,
    });
  } catch (e) {
    console.error('Instagram publish error:', e);
    return NextResponse.json(
      { error: 'Der opstod en fejl under publicering.' },
      { status: 500 }
    );
  }
}
