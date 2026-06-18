import { NextResponse } from 'next/server';
import { resolveInstagramAccessToken } from '@/lib/instagram-config';
import { classifyMetaGraphError, issueUserMessage } from '@/lib/meta/token-errors';

const INSTAGRAM_API_VERSION = 'v24.0';
const GRAPH_HOST = 'https://graph.facebook.com';

/** Dyb link til Social-fanen (læses af klienten). */
const SETTINGS_SOCIAL = '/settings?tab=social';

function tokenErrorUserMessage(): string {
  return process.env.NODE_ENV === 'production'
    ? 'Facebook accepterede ikke forbindelsen. Tokenet er ofte udløbet eller tilbagekaldt — det skal fornyes.'
    : 'Facebook accepterede ikke forbindelsen. Token i .env.local er ofte udløbet eller forkert — forny det.';
}

function permissionUserMessage(): string {
  return 'Tokenet mangler tilladelser eller adgang til den valgte Facebook-side.';
}

function nextStepSocial(): string {
  return 'Åbn Indstillinger → fanen Social: klik «Kør diagnose», og følg trinene for nyt Instagram/Facebook-token.';
}

export async function GET() {
  const pageId = process.env.FACEBOOK_PAGE_ID?.trim();
  const { token: accessToken } = await resolveInstagramAccessToken();

  if (!pageId || !accessToken) {
    return NextResponse.json({
      configured: false,
      reachable: false,
      pageId: pageId || null,
      pageName: null,
      error: 'Integrationen er ikke sat op (mangler Facebook-side eller Instagram-token i miljøet).',
      nextStep: nextStepSocial(),
      settingsHref: SETTINGS_SOCIAL,
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

      const tokenIssue = classifyMetaGraphError(msg, errCode, errSubcode);
      const issueMsg = issueUserMessage(tokenIssue);

      let friendlyError = msg;
      if (tokenIssue === 'session_invalidated' && issueMsg) {
        friendlyError = issueMsg;
      } else if (isTokenExpired) {
        friendlyError = tokenErrorUserMessage();
      } else if (isPermissionIssue) {
        friendlyError = permissionUserMessage();
      } else if (isObjectMissing) {
        friendlyError =
          'Facebook-siden kunne ikke findes med det angivne side-ID, eller tokenet har ikke adgang. Tjek side-ID og token under Indstillinger → Social.';
      }

      return NextResponse.json({
        configured: true,
        reachable: false,
        pageId,
        pageName: null,
        error: friendlyError,
        nextStep: nextStepSocial(),
        settingsHref: SETTINGS_SOCIAL,
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
      nextStep: null,
      settingsHref: null,
    });
  } catch (error) {
    return NextResponse.json({
      configured: true,
      reachable: false,
      pageId,
      pageName: null,
      error: `Test fejlede: ${error instanceof Error ? error.message : String(error)}`,
      nextStep: nextStepSocial(),
      settingsHref: SETTINGS_SOCIAL,
    });
  }
}
