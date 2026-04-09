import { NextResponse } from 'next/server';

const API_VERSION = 'v24.0';
const GRAPH_HOST = 'https://graph.facebook.com';

const RECOMMENDED_SCOPES = [
  'instagram_basic',
  'instagram_content_publish',
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
] as const;

/**
 * GET /api/instagram/token-status
 * Diagnosticerer INSTAGRAM_ACCESS_TOKEN via Meta debug_token + valgfri IG-profil-test.
 * Kræver META_APP_ID, META_APP_SECRET og INSTAGRAM_ACCESS_TOKEN i env.
 */
export async function GET() {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  const pageToken = process.env.INSTAGRAM_ACCESS_TOKEN?.trim();
  const igId = process.env.INSTAGRAM_ACCOUNT_ID?.trim();

  if (!appId || !appSecret) {
    return NextResponse.json({
      ok: false,
      error: 'Sæt META_APP_ID og META_APP_SECRET i env for at kunne diagnostikere token.',
    });
  }

  if (!pageToken) {
    return NextResponse.json({
      ok: false,
      error: 'INSTAGRAM_ACCESS_TOKEN er ikke sat.',
    });
  }

  const appAccessToken = `${appId}|${appSecret}`;
  const debugUrl = `${GRAPH_HOST}/${API_VERSION}/debug_token?input_token=${encodeURIComponent(pageToken)}&access_token=${encodeURIComponent(appAccessToken)}`;

  try {
    const debugRes = await fetch(debugUrl);
    const debugJson = await debugRes.json().catch(() => ({}));
    const d = debugJson?.data as Record<string, unknown> | undefined;

    if (!d) {
      return NextResponse.json({
        ok: false,
        error: debugJson?.error?.message || 'debug_token returnerede intet data.',
      });
    }

    const isValid = d.is_valid === true;
    const expiresAtUnix = typeof d.expires_at === 'number' ? d.expires_at : null;
    const expiresDescription =
      expiresAtUnix === 0
        ? 'Ingen udløbsdato (typisk permanent Page-token)'
        : expiresAtUnix != null && expiresAtUnix > 0
          ? new Date(expiresAtUnix * 1000).toISOString()
          : 'Ukendt (Meta returnerede ikke expires_at)';

    const scopes = Array.isArray(d.scopes) ? (d.scopes as string[]) : [];
    const missingScopes = RECOMMENDED_SCOPES.filter((s) => !scopes.includes(s));
    const tokenType = typeof d.type === 'string' ? d.type : 'UNKNOWN';

    const dataAccessExpiresAt =
      typeof d.data_access_expires_at === 'number' && d.data_access_expires_at > 0
        ? new Date(d.data_access_expires_at * 1000).toISOString()
        : null;

    let instagramProfile: {
      ok: boolean;
      username?: string;
      error?: string;
    } | null = null;

    const hints: string[] = [];

    if (igId) {
      const igRes = await fetch(`${GRAPH_HOST}/${API_VERSION}/${igId}?fields=id,username`, {
        headers: { Authorization: `Bearer ${pageToken}` },
      });
      const igData = await igRes.json().catch(() => ({}));
      if (igRes.ok && igData?.id) {
        instagramProfile = {
          ok: true,
          username: typeof igData.username === 'string' ? igData.username : undefined,
        };
      } else {
        const msg = String(igData?.error?.message || 'Kunne ikke læse Instagram-konto.');
        instagramProfile = { ok: false, error: msg };
        if (/190|expired|session/i.test(msg)) {
          hints.push('Instagram Graph afviser tokenet (ofte udløb). Opdater INSTAGRAM_ACCESS_TOKEN.');
        } else if (/permission|scope/i.test(msg)) {
          hints.push('Token kan ikke tilgå Instagram Business-kontoen — tjek instagram_basic / instagram_content_publish og at IG er tilkoblet siden.');
        }
      }
    }

    const instagramOk = instagramProfile === null || instagramProfile.ok === true;

    if (!isValid) {
      hints.push('Token er ugyldigt eller tilbagekaldt. Generér et nyt permanent Page-token (Indstillinger → Social) og opdater INSTAGRAM_ACCESS_TOKEN.');
    }
    if (tokenType === 'USER' && (!isValid || !instagramOk)) {
      hints.push(
        'Miljøet har et bruger-token, og noget fejler. Når det virker igen: konvertér på Indstillinger → Social og læg den lange page-streng i INSTAGRAM_ACCESS_TOKEN (ikke Explorer-tokenet).'
      );
    } else if (tokenType !== 'PAGE' && tokenType !== 'UNKNOWN' && tokenType !== 'USER') {
      hints.push(
        `Token-typen er «${tokenType}». Brug helst et Page Access Token (PAGE) fra konverteringens resultat til Instagram-nøglen i miljøet.`
      );
    }
    if (missingScopes.length > 0) {
      hints.push(`Manglende anbefalede tilladelser på tokenet: ${missingScopes.join(', ')}. Generér nyt bruger-token i Graph API Explorer med alle scopes, og konvertér igen.`);
    }

    /** Når alt virker men typen stadig er USER: vej til langvarigt page-token i miljøet. */
    let recommendation: string | null = null;
    if (tokenType === 'USER' && isValid && instagramOk) {
      recommendation =
        'For langvarigt page-token: på denne side under «Instagram & Facebook» — indsæt kort bruger-token fra Graph API Explorer kun i feltet til konvertering (ikke direkte i .env), klik «Konvertér til langvarigt token», og kopier den lange streng fra den grønne boks (trin 2). Erstat hele INSTAGRAM_ACCESS_TOKEN i .env.local og Vercel med den streng. Genstart dev-server og redeploy. Diagnose bør derefter vise Type: PAGE og ofte uden udløb.';
    }

    return NextResponse.json({
      ok: isValid && instagramOk,
      debug: {
        isValid,
        type: tokenType,
        expiresDescription,
        expiresAtUnix,
        scopes,
        missingScopes,
        dataAccessExpiresAt,
        appIdOnToken: d.app_id,
      },
      instagramProfile,
      hints,
      recommendation,
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : 'Ukendt fejl ved token-diagnose.',
    });
  }
}
