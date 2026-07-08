import {
  classifyMetaGraphError,
  issueUserMessage,
  type MetaTokenIssue,
} from '@/lib/meta/token-errors';

const API_VERSION = 'v24.0';
const GRAPH_HOST = 'https://graph.facebook.com';

const RECOMMENDED_SCOPES = [
  'instagram_basic',
  'instagram_content_publish',
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
] as const;

export type InstagramTokenDiagnostics = {
  ok: boolean;
  issue: MetaTokenIssue;
  primaryAction: string | null;
  instagramUsername?: string;
  facebookOk: boolean;
  facebookPageName?: string;
  facebookError?: string;
  summary: string;
  debug?: {
    isValid: boolean;
    type: string;
    expiresDescription: string;
    missingScopes: string[];
  };
};

export async function runInstagramTokenDiagnostics(
  pageToken: string,
): Promise<InstagramTokenDiagnostics> {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  const igId = process.env.INSTAGRAM_ACCOUNT_ID?.trim();
  const facebookPageId = process.env.FACEBOOK_PAGE_ID?.trim();

  if (!appId || !appSecret) {
    return {
      ok: false,
      issue: 'unknown',
      primaryAction: 'Sæt META_APP_ID og META_APP_SECRET.',
      facebookOk: false,
      summary: 'Meta app-credentials mangler.',
    };
  }

  const appAccessToken = `${appId}|${appSecret}`;
  const debugUrl = `${GRAPH_HOST}/${API_VERSION}/debug_token?input_token=${encodeURIComponent(pageToken)}&access_token=${encodeURIComponent(appAccessToken)}`;

  const debugRes = await fetch(debugUrl);
  const debugJson = await debugRes.json().catch(() => ({}));
  const d = debugJson?.data as Record<string, unknown> | undefined;

  if (!d) {
    return {
      ok: false,
      issue: 'unknown',
      primaryAction: issueUserMessage('unknown'),
      facebookOk: false,
      summary: String(debugJson?.error?.message || 'Token kunne ikke diagnosticeres.'),
    };
  }

  const isValid = d.is_valid === true;
  const expiresAtUnix = typeof d.expires_at === 'number' ? d.expires_at : null;
  const expiresDescription =
    expiresAtUnix === 0
      ? 'Permanent (ingen udløb)'
      : expiresAtUnix != null && expiresAtUnix > 0
        ? new Date(expiresAtUnix * 1000).toLocaleString('da-DK')
        : 'Ukendt';

  const scopes = Array.isArray(d.scopes) ? (d.scopes as string[]) : [];
  const missingScopes = RECOMMENDED_SCOPES.filter((s) => !scopes.includes(s));
  const tokenType = typeof d.type === 'string' ? d.type : 'UNKNOWN';

  let issue: MetaTokenIssue = isValid ? 'ok' : 'revoked';
  let instagramUsername: string | undefined;
  let instagramOk = true;

  if (igId) {
    const igRes = await fetch(`${GRAPH_HOST}/${API_VERSION}/${igId}?fields=id,username`, {
      headers: { Authorization: `Bearer ${pageToken}` },
    });
    const igData = await igRes.json().catch(() => ({}));
    if (igRes.ok && igData?.id) {
      instagramUsername = typeof igData.username === 'string' ? igData.username : undefined;
    } else {
      instagramOk = false;
      const msg = String(igData?.error?.message || '');
      const igIssue = classifyMetaGraphError(
        msg,
        Number(igData?.error?.code || 0),
        Number(igData?.error?.error_subcode || 0),
      );
      if (igIssue !== 'unknown') issue = igIssue;
    }
  }

  let facebookOk = false;
  let facebookPageName: string | undefined;
  let facebookError: string | undefined;

  if (facebookPageId) {
    const fbRes = await fetch(
      `${GRAPH_HOST}/${API_VERSION}/${facebookPageId}?fields=id,name`,
      { headers: { Authorization: `Bearer ${pageToken}` } },
    );
    const fbData = await fbRes.json().catch(() => ({}));
    if (fbRes.ok && fbData?.id) {
      facebookOk = true;
      facebookPageName = String(fbData.name || '');
    } else {
      facebookError = String(fbData?.error?.message || 'Facebook-test fejlede.');
      const fbIssue = classifyMetaGraphError(
        facebookError,
        Number(fbData?.error?.code || 0),
        Number(fbData?.error?.error_subcode || 0),
      );
      if (fbIssue !== 'unknown' && issue === 'ok') issue = fbIssue;
    }
  } else {
    facebookOk = true;
  }

  const ok = isValid && instagramOk && facebookOk;
  const primaryAction = issueUserMessage(ok ? 'ok' : issue);

  let summary: string;
  if (ok) {
    summary = instagramUsername
      ? `Klar — Instagram @${instagramUsername}${facebookPageName ? `, Facebook ${facebookPageName}` : ''}.`
      : `Klar — token virker.${facebookPageName ? ` Facebook: ${facebookPageName}.` : ''}`;
  } else if (issue === 'session_invalidated') {
    summary = 'Session invalideret — generér nyt bruger-token i Explorer og prøv igen.';
  } else {
    summary = primaryAction || 'Token virker ikke endnu.';
  }

  return {
    ok,
    issue,
    primaryAction,
    instagramUsername,
    facebookOk,
    facebookPageName,
    facebookError,
    summary,
    debug: {
      isValid,
      type: tokenType,
      expiresDescription,
      missingScopes: [...missingScopes],
    },
  };
}
