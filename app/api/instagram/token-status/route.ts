import { NextResponse } from 'next/server';
import { resolveInstagramAccessToken } from '@/lib/instagram-config';
import { runInstagramTokenDiagnostics } from '@/lib/meta/instagram-token-diagnostics';

/**
 * GET /api/instagram/token-status
 * Diagnosticerer aktivt Instagram-token (Firestore/fil/env).
 */
export async function GET() {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();

  if (!appId || !appSecret) {
    return NextResponse.json({
      ok: false,
      error: 'Sæt META_APP_ID og META_APP_SECRET i env for at kunne diagnostikere token.',
    });
  }

  const { token: pageToken, source: tokenSource } = await resolveInstagramAccessToken();

  if (!pageToken) {
    return NextResponse.json({
      ok: false,
      error:
        'Intet Instagram-token fundet. Brug «Forny token» på Indstillinger → Social.',
    });
  }

  try {
    const status = await runInstagramTokenDiagnostics(pageToken);
    return NextResponse.json({
      ok: status.ok,
      issue: status.issue,
      primaryAction: status.primaryAction,
      tokenSource,
      debug: status.debug
        ? {
            isValid: status.debug.isValid,
            type: status.debug.type,
            expiresDescription: status.debug.expiresDescription,
            missingScopes: status.debug.missingScopes,
            scopes: [],
          }
        : undefined,
      instagramProfile: status.instagramUsername
        ? { ok: true, username: status.instagramUsername }
        : status.ok
          ? null
          : { ok: false, error: status.summary },
      hints: status.primaryAction ? [status.primaryAction] : [],
      recommendation: null,
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : 'Ukendt fejl ved token-diagnose.',
    });
  }
}
