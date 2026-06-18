import { NextRequest, NextResponse } from 'next/server';
import { getNewsletterUserIdFromRequest } from '@/lib/newsletter/auth-request';
import { sendPushNotification } from '@/lib/push/send-notification';
import type { PushAudience, PushDestinationKind } from '@/lib/push/types';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const uid = await getNewsletterUserIdFromRequest(req);
  if (!uid) {
    return NextResponse.json({ error: 'Ikke autoriseret' }, { status: 401 });
  }

  let body: {
    title?: string;
    body?: string;
    imageUrl?: string;
    destination?: PushDestinationKind;
    articleSlug?: string;
    audience?: PushAudience;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Ugyldig JSON' }, { status: 400 });
  }

  const destination = body.destination || 'none';
  if (!['none', 'article', 'podcast'].includes(destination)) {
    return NextResponse.json({ error: 'Ugyldig destination' }, { status: 400 });
  }

  try {
    const result = await sendPushNotification(
      {
        title: String(body.title || ''),
        body: typeof body.body === 'string' ? body.body : undefined,
        imageUrl: typeof body.imageUrl === 'string' ? body.imageUrl : undefined,
        destination,
        articleSlug: typeof body.articleSlug === 'string' ? body.articleSlug : undefined,
        audience: body.audience === 'new_articles' ? 'new_articles' : 'all_users',
      },
      { sentBy: uid }
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Kunne ikke sende push';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
