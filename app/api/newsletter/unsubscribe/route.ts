import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/config/env';
import { verifyUnsubscribeToken } from '@/lib/newsletter/unsubscribe-token';
import { addUnsubscribe } from '@/lib/newsletter/unsubscribe-store';
import { deleteNewsletterSignupByEmail } from '@/lib/newsletter/webflow-sources';
import { deleteNewsletterFormSubmissionsByEmail } from '@/lib/newsletter/webflow-forms';
import { getPublicAppOriginFromRequest } from '@/lib/newsletter/public-app-url';

function redirectFrameld(req: NextRequest, query: Record<string, string>) {
  const origin = getPublicAppOriginFromRequest(req);
  const u = new URL('/newsletter/frameld', origin);
  for (const [k, v] of Object.entries(query)) {
    u.searchParams.set(k, v);
  }
  return NextResponse.redirect(u, 302);
}

/**
 * Ét klik fra nyhedsbrev: verificerer token, gemmer framelding i Firestore, fjerner fra Webflow, redirect til bekræftelsesside.
 */
export async function GET(req: NextRequest) {
  const secret = env.NEWSLETTER_UNSUBSCRIBE_SECRET?.trim();
  if (!secret) {
    return redirectFrameld(req, { status: 'error', reason: 'config' });
  }

  const raw = req.nextUrl.searchParams.get('t');
  if (!raw?.trim()) {
    return redirectFrameld(req, { status: 'error', reason: 'missing_token' });
  }

  let token = raw.trim();
  try {
    token = decodeURIComponent(token);
  } catch {
    /* use raw */
  }

  const verified = verifyUnsubscribeToken(token, secret);
  if (!verified) {
    return redirectFrameld(req, { status: 'error', reason: 'invalid' });
  }

  const emailNorm = verified.email.trim().toLowerCase();
  const result = await addUnsubscribe(emailNorm);

  if (!result.ok) {
    return redirectFrameld(req, { status: 'error', reason: 'server' });
  }

  const colId = env.WEBFLOW_NEWSLETTER_SIGNUPS_COLLECTION_ID?.trim();
  const emailSlug = env.WEBFLOW_SIGNUP_EMAIL_FIELD_SLUG || 'email';
  if (colId) {
    const cms = await deleteNewsletterSignupByEmail(emailNorm, colId, emailSlug);
    if (cms.error && cms.deleted === 0) {
      console.warn('[newsletter/unsubscribe] Webflow CMS delete:', cms.error);
    }
  }

  const formDel = await deleteNewsletterFormSubmissionsByEmail(
    emailNorm,
    env.WEBFLOW_NEWSLETTER_FORM_ID?.trim()
  );
  if (formDel.error && formDel.deleted === 0 && !colId) {
    console.warn('[newsletter/unsubscribe] Webflow form submissions delete:', formDel.error);
  } else if (formDel.error && formDel.deleted > 0) {
    console.warn('[newsletter/unsubscribe] Webflow partial delete:', formDel.error);
  }

  return redirectFrameld(req, { status: 'ok' });
}
