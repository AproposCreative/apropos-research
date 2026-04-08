import { env } from '@/lib/config/env';
import { getWebflowConfig } from '@/lib/webflow-config';

function resolveToken(): string | undefined {
  const cfg = getWebflowConfig();
  return cfg.apiToken || env.WEBFLOW_API_TOKEN || undefined;
}

function resolveSiteId(): string | undefined {
  const cfg = getWebflowConfig();
  return cfg.siteId || env.WEBFLOW_SITE_ID || undefined;
}

/** Webflow CMS i repo bruger Accept-Version; officielle form-eksempler bruger kun Bearer — prøver begge. */
function webflowHeaderVariants(token: string): HeadersInit[] {
  return [
    { Authorization: `Bearer ${token}`, 'Accept-Version': '1.0.0' },
    { Authorization: `Bearer ${token}` },
  ];
}

async function fetchWithWebflowAuth(url: string, token: string): Promise<Response> {
  let last: Response | null = null;
  for (const headers of webflowHeaderVariants(token)) {
    const res = await fetch(url, { headers });
    last = res;
    if (res.ok) return res;
    if (res.status === 401 || res.status === 403) return res;
  }
  return last!;
}

function formatWebflowError(j: Record<string, unknown>, status: number): string {
  const msg = typeof j.message === 'string' ? j.message : '';
  const code = typeof j.code === 'string' ? j.code : '';
  if (code === 'forms_require_republish' || status === 409) {
    return (
      msg ||
      'Webflow: publicér sitet igen (Designer → Publish) — formular-API er først aktiv efter publicering.'
    );
  }
  if (code === 'missing_scopes' || code === 'not_authorized') {
    return msg || 'Webflow-token mangler nødvendig rettighed (fx Forms: read).';
  }
  return msg || `Webflow ${status}`;
}

export type WebflowForm = {
  id: string;
  displayName: string;
  /** Til site-wide submissions-API (`elementId`); vigtig for forms i komponenter. */
  formElementId?: string | null;
};

/** List alle forms for sitet — kræver `forms:read` scope. */
export async function listForms(): Promise<{ forms: WebflowForm[]; error?: string }> {
  const token = resolveToken();
  const siteId = resolveSiteId();
  if (!token || !siteId) {
    return { forms: [], error: 'Webflow token eller site ID mangler' };
  }

  const limit = 100;
  const all: WebflowForm[] = [];
  let offset = 0;
  while (offset < 5000) {
    const url = `https://api.webflow.com/v2/sites/${siteId}/forms?limit=${limit}&offset=${offset}`;
    const res = await fetchWithWebflowAuth(url, token);
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return { forms: [], error: formatWebflowError(j, res.status) };
    }
    const raw = j.forms;
    const page = Array.isArray(raw) ? raw : [];
    for (const f of page as Array<{ id?: string; displayName?: string; formElementId?: string | null }>) {
      if (f?.id) {
        all.push({
          id: f.id,
          displayName: f.displayName || f.id,
          formElementId: f.formElementId ?? null,
        });
      }
    }
    if (page.length < limit) break;
    offset += limit;
  }
  return { forms: all };
}

function submissionNotFoundError(status: number, message: string): boolean {
  if (status === 404) return true;
  return /not found|dom could not be found|resource_not_found/i.test(message);
}

type FetchSubmissionsOpts = {
  formElementId?: string | null;
  formDisplayName?: string;
};

/** Hent én side submissions (Webflow v2 JSON-form). */
async function parseSubmissionsResponse(res: Response): Promise<{
  page: Array<Record<string, unknown>>;
  error?: string;
}> {
  const j = (await res.json().catch(() => ({}))) as {
    formSubmissions?: Array<Record<string, unknown>>;
    message?: string;
  } & Record<string, unknown>;
  if (!res.ok) {
    return {
      page: [],
      error: formatWebflowError(j as Record<string, unknown>, res.status),
    };
  }
  return { page: j.formSubmissions || [] };
}

/**
 * Hent alle submissions for en form. Prøver først `/forms/{id}/submissions`;
 * ved 404 (fx form i komponent) falder den tilbage til `/form_submissions?elementId=…`.
 */
export async function fetchFormSubmissions(
  formId: string,
  opts?: FetchSubmissionsOpts
): Promise<{ submissions: Array<Record<string, unknown>>; error?: string }> {
  const token = resolveToken();
  const siteId = resolveSiteId();
  if (!token || !siteId) {
    return { submissions: [], error: 'Webflow token eller site ID mangler' };
  }

  const limit = 100;
  const maxItems = 10000;

  async function fetchPages(
    buildUrl: (off: number) => string,
    filter?: (row: Record<string, unknown>) => boolean
  ): Promise<{ submissions: Array<Record<string, unknown>>; error?: string }> {
    const all: Array<Record<string, unknown>> = [];
    let offset = 0;
    while (offset < maxItems) {
      const res = await fetchWithWebflowAuth(buildUrl(offset), token);
      const { page, error } = await parseSubmissionsResponse(res);
      if (error) {
        return { submissions: all, error };
      }
      const slice = filter ? page.filter(filter) : page;
      all.push(...slice);
      if (page.length < limit) break;
      offset += limit;
    }
    return { submissions: all };
  }

  const perFormUrl = (off: number) =>
    `https://api.webflow.com/v2/sites/${siteId}/forms/${formId}/submissions?limit=${limit}&offset=${off}`;

  let firstError: string | undefined;
  let offset = 0;
  const primaryAll: Array<Record<string, unknown>> = [];
  while (offset < maxItems) {
    const res = await fetchWithWebflowAuth(perFormUrl(offset), token);
    const msg = res.ok
      ? ''
      : formatWebflowError(
          (await res.clone().json().catch(() => ({}))) as Record<string, unknown>,
          res.status
        );
    if (!res.ok) {
      if (submissionNotFoundError(res.status, msg) && (opts?.formElementId || opts?.formDisplayName)) {
        firstError = undefined;
        break;
      }
      return { submissions: [], error: msg || `Webflow ${res.status}` };
    }
    const data = (await res.json().catch(() => ({}))) as {
      formSubmissions?: Array<Record<string, unknown>>;
    };
    const page = data.formSubmissions || [];
    primaryAll.push(...page);
    if (page.length < limit) {
      return { submissions: primaryAll };
    }
    offset += limit;
  }

  if (primaryAll.length > 0) {
    return { submissions: primaryAll };
  }

  const elementId = opts?.formElementId?.trim();
  if (elementId) {
    const siteUrl = (off: number) => {
      const q = new URLSearchParams({ limit: String(limit), offset: String(off), elementId });
      return `https://api.webflow.com/v2/sites/${siteId}/form_submissions?${q}`;
    };
    const r = await fetchPages(siteUrl);
    if (r.submissions.length > 0 || !r.error) {
      return r;
    }
    firstError = r.error;
  }

  const name = opts?.formDisplayName?.trim();
  if (name) {
    const nameLower = name.toLowerCase();
    const siteUrlAll = (off: number) => {
      const q = new URLSearchParams({ limit: String(limit), offset: String(off) });
      return `https://api.webflow.com/v2/sites/${siteId}/form_submissions?${q}`;
    };
    const r = await fetchPages(siteUrlAll, (row) => {
      const dn = typeof row.displayName === 'string' ? row.displayName.toLowerCase() : '';
      return dn === nameLower;
    });
    if (r.submissions.length > 0 || !r.error) {
      return r;
    }
    firstError = r.error || firstError;
  }

  return {
    submissions: [],
    error:
      firstError ||
      'Kunne ikke hente formular-svar (404). Publicér sitet i Webflow igen, eller tjek WEBFLOW_NEWSLETTER_FORM_ID.',
  };
}

/**
 * List alle form_submissions på site-niveau (undgår GET /forms som kan fejle med «dom could not be found»).
 * @see https://developers.webflow.com/data/reference/forms/form-submissions/list-submissions-by-site
 */
async function fetchAllSiteFormSubmissions(
  token: string,
  siteId: string
): Promise<{ submissions: Array<Record<string, unknown>>; error?: string }> {
  const limit = 100;
  const all: Array<Record<string, unknown>> = [];
  let offset = 0;
  while (offset < 10000) {
    const q = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    const url = `https://api.webflow.com/v2/sites/${siteId}/form_submissions?${q}`;
    const res = await fetchWithWebflowAuth(url, token);
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return { submissions: all, error: formatWebflowError(j, res.status) };
    }
    const page = (j.formSubmissions as Array<Record<string, unknown>>) || [];
    all.push(...page);
    if (page.length < limit) break;
    offset += limit;
  }
  return { submissions: all };
}

function newsletterFormNameRegex(): RegExp {
  return /subscri|tilmeld|nyhedsbrev|newsletter|signup|sign.up/i;
}

function filterSubmissionsForNewsletter(
  submissions: Array<Record<string, unknown>>,
  formIdOrName?: string
): Array<Record<string, unknown>> {
  const search = (formIdOrName || '').trim();
  if (search && !/^[a-f0-9]{24}$/i.test(search)) {
    const sl = search.toLowerCase();
    return submissions.filter((s) => {
      const dn = String(s.displayName || '').toLowerCase();
      return dn.includes(sl);
    });
  }
  return submissions.filter((s) => newsletterFormNameRegex().test(String(s.displayName || '')));
}

/**
 * Udtræk unikke e-mails fra form submissions.
 * Understøtter både `formData` (per-form endpoint) og `formResponse` (site-wide list).
 */
const EMAIL_IN_SUBMISSION_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

/** Én formular-række → normaliseret e-mail eller null (samme logik som extractEmailsFromSubmissions). */
export function getSubmissionEmailFromRow(sub: Record<string, unknown>): string | null {
  const fd = (sub.formData ?? sub.formResponse ?? sub) as Record<string, unknown>;
  const candidates = [fd.email, fd.Email, fd['e-mail'], fd['E-mail'], fd.EMAIL];
  for (const c of candidates) {
    if (typeof c !== 'string') continue;
    const e = c.trim().toLowerCase();
    if (EMAIL_IN_SUBMISSION_RE.test(e)) return e;
  }
  if (fd && typeof fd === 'object') {
    for (const v of Object.values(fd)) {
      if (typeof v !== 'string') continue;
      const e = v.trim().toLowerCase();
      if (EMAIL_IN_SUBMISSION_RE.test(e)) return e;
    }
  }
  return null;
}

function submissionRowId(sub: Record<string, unknown>): string | null {
  const id = sub.id ?? sub._id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

function collectSubmissionIdsForEmail(
  submissions: Array<Record<string, unknown>>,
  normalizedEmail: string,
  into: Set<string>
): void {
  const target = normalizedEmail.trim().toLowerCase();
  for (const sub of submissions) {
    if (getSubmissionEmailFromRow(sub) !== target) continue;
    const sid = submissionRowId(sub);
    if (sid) into.add(sid);
  }
}

/**
 * Sletter alle Webflow form submissions for nyhedsbrevsformularer der matcher e-mailen.
 * Kræver `forms:write` på API-token. Bruges ved framelding.
 */
export async function deleteNewsletterFormSubmissionsByEmail(
  normalizedEmail: string,
  formIdOrName?: string
): Promise<{ deleted: number; error?: string }> {
  const token = resolveToken();
  const siteId = resolveSiteId();
  if (!token || !siteId) {
    return { deleted: 0, error: 'Webflow token eller site ID mangler' };
  }

  const search = (formIdOrName || '').trim();
  const looksLikeFormObjectId = /^[a-f0-9]{24}$/i.test(search);
  const ids = new Set<string>();

  if (looksLikeFormObjectId) {
    const direct = await fetchFormSubmissions(search, {});
    collectSubmissionIdsForEmail(direct.submissions, normalizedEmail, ids);
  }

  const siteWide = await fetchAllSiteFormSubmissions(token, siteId);
  const filtered = filterSubmissionsForNewsletter(siteWide.submissions, formIdOrName);
  collectSubmissionIdsForEmail(filtered, normalizedEmail, ids);

  if (ids.size === 0) {
    const viaList = await fetchNewsletterSubmissionsViaListForms(formIdOrName);
    collectSubmissionIdsForEmail(viaList.submissions, normalizedEmail, ids);
  }

  if (ids.size === 0) {
    return { deleted: 0 };
  }

  let deleted = 0;
  let lastErr: string | undefined;
  for (const submissionId of ids) {
    const url = `https://api.webflow.com/v2/sites/${siteId}/form_submissions/${submissionId}`;
    let res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}`, 'Accept-Version': '1.0.0' },
    });
    if (!res.ok && res.status !== 204) {
      res = await fetch(url, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    }
    if (res.ok || res.status === 204) {
      deleted++;
    } else {
      const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      lastErr = formatWebflowError(j, res.status);
    }
  }

  if (deleted === 0 && lastErr) {
    return { deleted: 0, error: lastErr };
  }
  return { deleted, error: deleted < ids.size ? lastErr : undefined };
}

async function fetchNewsletterSubmissionsViaListForms(
  formIdOrName?: string
): Promise<{ submissions: Array<Record<string, unknown>>; error?: string }> {
  const { forms, error: listErr } = await listForms();
  if (listErr) return { submissions: [], error: listErr };
  if (forms.length === 0) return { submissions: [], error: 'Ingen forms fundet på Webflow-sitet' };

  let form: WebflowForm | undefined;
  const search = (formIdOrName || '').trim().toLowerCase();

  if (search) {
    form = forms.find((f) => f.id === formIdOrName);
    if (!form) {
      form = forms.find((f) => f.displayName.toLowerCase().includes(search));
    }
  }
  if (!form) {
    form = forms.find((f) => newsletterFormNameRegex().test(f.displayName));
  }
  if (!form) {
    return { submissions: [], error: 'Kunne ikke finde subscribe-form til sletning af svar' };
  }

  const { submissions, error: subErr } = await fetchFormSubmissions(form.id, {
    formElementId: form.formElementId,
    formDisplayName: form.displayName,
  });
  if (subErr && submissions.length === 0) {
    return { submissions: [], error: subErr };
  }
  return { submissions };
}

export function extractEmailsFromSubmissions(
  submissions: Array<Record<string, unknown>>
): string[] {
  const seen = new Set<string>();
  const emails: string[] = [];

  for (const sub of submissions) {
    const found = getSubmissionEmailFromRow(sub);
    if (found && !seen.has(found)) {
      seen.add(found);
      emails.push(found);
    }
  }

  return emails;
}

/**
 * Alt-i-en: find formular-svar → udtræk e-mails.
 * Rækkefølge: (1) direkte form-ID submissions, (2) site-wide form_submissions + filtrering,
 * (3) list forms + per-form (fallback).
 */
export async function fetchNewsletterEmails(
  formIdOrName?: string
): Promise<{ emails: string[]; formId?: string; formName?: string; error?: string }> {
  const token = resolveToken();
  const siteId = resolveSiteId();
  if (!token || !siteId) {
    return { emails: [], error: 'Webflow token eller site ID mangler' };
  }

  const search = (formIdOrName || '').trim();
  const looksLikeFormObjectId = /^[a-f0-9]{24}$/i.test(search);

  if (looksLikeFormObjectId) {
    const direct = await fetchFormSubmissions(search, {});
    const fromDirect = extractEmailsFromSubmissions(direct.submissions);
    if (fromDirect.length > 0) {
      return { emails: fromDirect, formId: search, formName: search };
    }
  }

  const siteWide = await fetchAllSiteFormSubmissions(token, siteId);
  if (siteWide.submissions.length > 0) {
    const filtered = filterSubmissionsForNewsletter(siteWide.submissions, formIdOrName);
    const emails = extractEmailsFromSubmissions(filtered);
    if (emails.length > 0) {
      const first = filtered[0];
      const formName =
        typeof first?.displayName === 'string' ? first.displayName : 'Nyhedsbrevs-formular';
      return { emails, formName };
    }
  }

  if (siteWide.error && !siteWide.submissions.length) {
    const listFallback = await fetchNewsletterEmailsViaListForms(formIdOrName);
    if (listFallback.emails.length > 0 || listFallback.error) {
      return listFallback;
    }
    return { emails: [], error: siteWide.error };
  }

  if (siteWide.submissions.length > 0 && filterSubmissionsForNewsletter(siteWide.submissions, formIdOrName).length === 0) {
    const names = [...new Set(siteWide.submissions.map((s) => String(s.displayName || '(uden navn)')))]
      .slice(0, 15)
      .join(', ');
    return {
      emails: [],
      error: names
        ? `Ingen formular matchede nyhedsbrevs-filter. Fundne formular-navne på sitet: ${names}. Sæt WEBFLOW_NEWSLETTER_FORM_ID til form-ID eller et unikt delstreng af navnet.`
        : 'Ingen formular-svar på sitet endnu.',
    };
  }

  return fetchNewsletterEmailsViaListForms(formIdOrName);
}

async function fetchNewsletterEmailsViaListForms(
  formIdOrName?: string
): Promise<{ emails: string[]; formId?: string; formName?: string; error?: string }> {
  const { forms, error: listErr } = await listForms();
  if (listErr) return { emails: [], error: listErr };
  if (forms.length === 0) return { emails: [], error: 'Ingen forms fundet på Webflow-sitet' };

  let form: WebflowForm | undefined;
  const search = (formIdOrName || '').trim().toLowerCase();

  if (search) {
    form = forms.find((f) => f.id === formIdOrName);
    if (!form) {
      form = forms.find((f) => f.displayName.toLowerCase().includes(search));
    }
  }
  if (!form) {
    form = forms.find((f) => newsletterFormNameRegex().test(f.displayName));
  }
  if (!form) {
    const names = forms.map((f) => `${f.displayName} (${f.id})`).join(', ');
    return { emails: [], error: `Kunne ikke finde subscribe-form. Tilgængelige: ${names}` };
  }

  const { submissions, error: subErr } = await fetchFormSubmissions(form.id, {
    formElementId: form.formElementId,
    formDisplayName: form.displayName,
  });
  if (subErr && submissions.length === 0) {
    return { emails: [], formId: form.id, formName: form.displayName, error: subErr };
  }

  const emails = extractEmailsFromSubmissions(submissions);
  return { emails, formId: form.id, formName: form.displayName };
}
