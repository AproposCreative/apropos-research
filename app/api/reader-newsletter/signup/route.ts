import { createReaderNewsletterRequestHandler, assertReaderNewsletterServiceIdentity } from '@/lib/reader-newsletter/request-adapter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// This narrow route uses the existing Research Admin composition. No new app,
// credentials, SDK helper, public editorial access or Functions/IAM change.
export async function POST(request: Request): Promise<Response> {
  const handle = createReaderNewsletterRequestHandler({
    environment: process.env,
    createServices: async () => {
      const { getAdminDb, getAdminAuth } = await import('@/lib/firebase-admin');
      const db = getAdminDb();
      const auth = getAdminAuth();
      if (!db || !auth) throw new Error('newsletter_services_unavailable');
      assertReaderNewsletterServiceIdentity(db, auth);
      const { getAppCheck } = await import('firebase-admin/app-check');
      return { db, auth, appCheck: getAppCheck(auth.app) };
    },
  });
  return handle(request);
}
