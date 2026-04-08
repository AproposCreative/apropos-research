import { NextRequest, NextResponse } from 'next/server';
import { getNewsletterUserIdFromRequest } from '@/lib/newsletter/auth-request';
import { getNewsletterRecipients } from '@/lib/newsletter/get-recipients';

/**
 * Kræver Firebase ID-token. Tjekker om nyhedsbrevs-modtagere kan hentes fra Webflow (aproposmagazine).
 */
export async function GET(req: NextRequest) {
  const uid = await getNewsletterUserIdFromRequest(req);
  if (!uid) {
    return NextResponse.json({ error: 'Ikke autoriseret' }, { status: 401 });
  }

  try {
    const r = await getNewsletterRecipients();
    const connected =
      (r.source === 'forms-api' || r.source === 'cms-collection') && !r.error;
    return NextResponse.json({
      connected,
      recipientCount: r.emails.length,
      totalSignups: r.total,
      unsubscribedCount: r.unsubscribedCount,
      source: r.source,
      formName: r.formName ?? null,
      error: r.error ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Ukendt fejl', connected: false },
      { status: 500 }
    );
  }
}
