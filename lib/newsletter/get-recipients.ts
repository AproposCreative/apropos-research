import { env } from '@/lib/config/env';
import { fetchNewsletterEmails } from '@/lib/newsletter/webflow-forms';
import { fetchNewsletterSignupEmails } from '@/lib/newsletter/webflow-sources';
import {
  getUnsubscribedEmails,
  removeUnsubscribeRecordsForEmails,
} from '@/lib/newsletter/unsubscribe-store';

export type RecipientResult = {
  emails: string[];
  total: number;
  unsubscribedCount: number;
  source: 'forms-api' | 'cms-collection' | 'none';
  formName?: string;
  error?: string;
};

/** Webflow Forms API kræver scope `forms:read` på Site token. */
const FORMS_SCOPE_HINT_DA =
  'Dit Webflow API-token mangler rettigheden «Forms: read». Under Webflow: Site settings → Apps & integrations → API access — opret eller opdater et Site token med Forms read, og opdater WEBFLOW_API_TOKEN (og evt. data/webflow-config.json). Standard-nyhedsbrevs-tilmeldinger i Webflow er formular-svar, ikke CMS — du behøver ikke noget «signup collection ID» medmindre I selv har oprettet en CMS-collection til e-mails.';

/** Når env har WEBFLOW_NEWSLETTER_SIGNUPS_COLLECTION_ID men Webflow kender ikke collection. */
const SIGNUP_COLLECTION_NOTFOUND_HINT_DA =
  'Fjern WEBFLOW_NEWSLETTER_SIGNUPS_COLLECTION_ID i .env.local og under Vercel → Settings → Environment Variables (begge steder hvis du deployer). Standard-tilmeldinger er formular-svar, ikke CMS. Brug et site-token med «Forms: read».';

/** Samme Webflow-tekst kan komme fra andre kald — uden signup-collection i env. */
const WEBFLOW_NOTFOUND_GENERIC_DA =
  'Tjek WEBFLOW_SITE_ID og at WEBFLOW_API_TOKEN er et site-token til samme site. Formular-listen kræver «Forms: read». Publicér sitet i Webflow efter ændringer i formularer.';

function isFormsScopeError(msg: string): boolean {
  return /forms:read|missing.*scopes|OAuthForbidden|not_authorized|insufficient_scope/i.test(
    msg
  );
}

function isWebflowResourceNotFound(msg: string): boolean {
  return /requested resource not found|dom could not be found|resource_not_found/i.test(msg);
}

function clarifyFetchError(
  err: string | undefined,
  opts: { hadSignupCollectionId: boolean }
): string | undefined {
  if (!err) return undefined;
  if (isFormsScopeError(err)) return FORMS_SCOPE_HINT_DA;
  if (isWebflowResourceNotFound(err)) {
    const hint = opts.hadSignupCollectionId
      ? SIGNUP_COLLECTION_NOTFOUND_HINT_DA
      : WEBFLOW_NOTFOUND_GENERIC_DA;
    return `${err} — ${hint}`;
  }
  return err;
}

/**
 * Hent aktive nyhedsbrevs-modtagere.
 * Standard i Webflow er **formular-svar** (Forms API, kræver `forms:read` på site-token).
 * Hvis `WEBFLOW_NEWSLETTER_SIGNUPS_COLLECTION_ID` er sat, prøves CMS først (kun relevant hvis I
 * selv har en collection til e-mails). Ellers / ved 0 fra CMS: Forms API (`WEBFLOW_NEWSLETTER_FORM_ID`
 * eller auto-find «Subscribe»/«nyhedsbrev»). Frameldte filtreres via Firestore; gen-tilmelding i Webflow
 * rydder automatisk frameldings-dokumentet for den e-mail.
 */
export async function getNewsletterRecipients(): Promise<RecipientResult> {
  const formId = env.WEBFLOW_NEWSLETTER_FORM_ID?.trim() || undefined;
  const colId = env.WEBFLOW_NEWSLETTER_SIGNUPS_COLLECTION_ID?.trim() || undefined;
  const hadSignupCollectionId = Boolean(colId);

  let rawEmails: string[] = [];
  let source: RecipientResult['source'] = 'none';
  let formName: string | undefined;
  let fetchErr: string | undefined;

  if (colId) {
    const emailSlug = env.WEBFLOW_SIGNUP_EMAIL_FIELD_SLUG || 'email';
    const r = await fetchNewsletterSignupEmails(colId, emailSlug);
    if (r.emails.length > 0) {
      rawEmails = r.emails;
      source = 'cms-collection';
      fetchErr = r.error;
    } else if (r.error && isWebflowResourceNotFound(r.error)) {
      /* Forkert/slettet collection: ignorer og hent via formular så env ikke blokerer. */
      fetchErr = undefined;
    } else {
      fetchErr = r.error;
    }
  }

  if (rawEmails.length === 0) {
    const r = await fetchNewsletterEmails(formId || undefined);
    if (r.emails.length > 0) {
      rawEmails = r.emails;
      source = 'forms-api';
      formName = r.formName;
      fetchErr = r.error;
    } else if (r.error) {
      fetchErr = fetchErr ? `${fetchErr} · ${r.error}` : r.error;
    } else {
      /* API OK, 0 svar — stadig forbundet til Webflow-formularen */
      source = 'forms-api';
      formName = r.formName;
    }
  }

  fetchErr = clarifyFetchError(fetchErr, { hadSignupCollectionId });

  if (rawEmails.length === 0) {
    const unsubOnly = await getUnsubscribedEmails();
    return {
      emails: [],
      total: 0,
      unsubscribedCount: unsubOnly.size,
      source,
      formName,
      error: fetchErr || (source === 'none' ? 'Ingen tilmeldinger fundet' : undefined),
    };
  }

  const norm = (e: string) => e.trim().toLowerCase();
  let unsub = await getUnsubscribedEmails();
  const resubscribed = [...new Set(rawEmails.map(norm))].filter((e) => unsub.has(e));
  if (resubscribed.length > 0) {
    await removeUnsubscribeRecordsForEmails(resubscribed);
    for (const e of resubscribed) unsub.delete(e);
  }
  const filtered = rawEmails.filter((e) => !unsub.has(norm(e)));

  return {
    emails: filtered,
    total: rawEmails.length,
    unsubscribedCount: unsub.size,
    source,
    formName,
    error: fetchErr,
  };
}
