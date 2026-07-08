import { NextResponse } from 'next/server';
import { getInstagramConfigMeta, resolveInstagramAccessToken } from '@/lib/instagram-config';
import { runInstagramTokenDiagnostics } from '@/lib/meta/instagram-token-diagnostics';

/** GET /api/instagram/status — aktivt token + diagnose (til Social-fanen). */
export async function GET() {
  const meta = await getInstagramConfigMeta();
  const { token, source } = await resolveInstagramAccessToken();

  if (!token) {
    return NextResponse.json({
      configured: false,
      meta,
      verify: null,
      summary: 'Intet token gemt. Indsæt bruger-token fra Explorer og klik «Forny token».',
    });
  }

  const verify = await runInstagramTokenDiagnostics(token);

  return NextResponse.json({
    configured: true,
    meta: { ...meta, source },
    verify,
    summary: verify.summary,
  });
}
