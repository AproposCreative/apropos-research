export type MetaTokenIssue =
  | 'ok'
  | 'session_invalidated'
  | 'token_expired'
  | 'permission'
  | 'revoked'
  | 'unknown';

export function classifyMetaGraphError(message: string, code?: number, subcode?: number): MetaTokenIssue {
  const msg = message.toLowerCase();
  if (
    code === 190 &&
    (subcode === 460 ||
      subcode === 463 ||
      /password|session has been invalidated|changed their password|security reasons/i.test(message))
  ) {
    return 'session_invalidated';
  }
  if (code === 190 || /expired|session has expired/i.test(msg)) {
    return 'token_expired';
  }
  if (code === 10 || code === 200 || /permission|scope|insufficient/i.test(msg)) {
    return 'permission';
  }
  if (/invalidated|revoked|not authorized|oauth/i.test(msg)) {
    return 'revoked';
  }
  return 'unknown';
}

export function issueUserMessage(issue: MetaTokenIssue): string | null {
  switch (issue) {
    case 'session_invalidated':
      return (
        'Meta har invalideret tokenet (ofte efter skift af Facebook-adgangskode eller sikkerhedsændring). ' +
        'Det er ikke det samme som daglig udløb — generér et nyt bruger-token i Graph API Explorer, konvertér her, og opdater INSTAGRAM_ACCESS_TOKEN i Vercel.'
      );
    case 'token_expired':
      return 'Tokenet er udløbet. Generér nyt bruger-token i Graph API Explorer, konvertér, og opdater INSTAGRAM_ACCESS_TOKEN.';
    case 'permission':
      return 'Tokenet mangler tilladelser. Generér nyt token med alle anbefalede scopes og konvertér igen.';
    case 'revoked':
      return 'Tokenet er tilbagekaldt. Generér et nyt permanent page-token og opdater INSTAGRAM_ACCESS_TOKEN.';
    case 'ok':
      return null;
    default:
      return 'Tokenet virker ikke mod Meta API. Generér et nyt page-token via konvertering ovenfor.';
  }
}
