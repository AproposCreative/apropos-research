import { NextRequest, NextResponse } from 'next/server';
import {
  getInstagramConfigMeta,
  saveInstagramAccessToken,
} from '@/lib/instagram-config';
import { runInstagramTokenDiagnostics } from '@/lib/meta/instagram-token-diagnostics';

/**
 * GET /api/instagram/config — metadata om aktivt token (aldrig fuld streng).
 * POST /api/instagram/config — body: { accessToken: string }
 */
export async function GET() {
  const meta = await getInstagramConfigMeta();
  return NextResponse.json(meta);
}

export async function POST(request: NextRequest) {
  let body: { accessToken?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ugyldig JSON.' }, { status: 400 });
  }

  const accessToken = typeof body.accessToken === 'string' ? body.accessToken.trim() : '';
  if (!accessToken) {
    return NextResponse.json({ error: 'accessToken er påkrævet.' }, { status: 400 });
  }

  try {
    const result = await saveInstagramAccessToken(accessToken);
    const meta = await getInstagramConfigMeta();
    const verify = await runInstagramTokenDiagnostics(accessToken);
    return NextResponse.json({
      success: verify.ok,
      savedTo: result.savedTo,
      tokenPreview: result.tokenPreview,
      ...meta,
      verify,
      summary: verify.summary,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Kunne ikke gemme token.' },
      { status: 400 },
    );
  }
}
