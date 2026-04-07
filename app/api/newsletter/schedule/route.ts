import { NextRequest, NextResponse } from 'next/server';
import { getNewsletterUserIdFromRequest } from '@/lib/newsletter/auth-request';
import {
  cancelScheduledSend,
  createScheduledSend,
  listFinishedScheduledForUser,
  listPendingScheduledForUser,
} from '@/lib/newsletter/scheduled-send-store';

const MIN_LEAD_MS = 120_000;
const MAX_LEAD_MS = 90 * 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const uid = await getNewsletterUserIdFromRequest(req);
  if (!uid) {
    return NextResponse.json({ error: 'Ikke autoriseret' }, { status: 401 });
  }
  try {
    const pending = await listPendingScheduledForUser(uid);
    let history: Awaited<ReturnType<typeof listFinishedScheduledForUser>> = [];
    try {
      history = await listFinishedScheduledForUser(uid, 12);
    } catch {
      /* Fx manglende Firestore-sammensat indeks — pending virker stadig */
    }
    return NextResponse.json({ pending, history });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Ukendt fejl' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const uid = await getNewsletterUserIdFromRequest(req);
  if (!uid) {
    return NextResponse.json({ error: 'Ikke autoriseret' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const scheduledAtRaw = typeof body.scheduledAt === 'string' ? body.scheduledAt.trim() : '';
    const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
    const html = typeof body.html === 'string' ? body.html : '';

    if (!scheduledAtRaw || !subject || !html) {
      return NextResponse.json(
        { error: 'scheduledAt, subject og html kræves' },
        { status: 400 }
      );
    }

    const scheduledFor = new Date(scheduledAtRaw);
    if (Number.isNaN(scheduledFor.getTime())) {
      return NextResponse.json({ error: 'Ugyldigt tidspunkt' }, { status: 400 });
    }

    const now = Date.now();
    if (scheduledFor.getTime() < now + MIN_LEAD_MS) {
      return NextResponse.json(
        { error: 'Vælg et tidspunkt mindst 2 minutter ude i fremtiden' },
        { status: 400 }
      );
    }
    if (scheduledFor.getTime() > now + MAX_LEAD_MS) {
      return NextResponse.json({ error: 'Kan ikke planlægge mere end 90 dage frem' }, { status: 400 });
    }

    const id = await createScheduledSend({ uid, scheduledFor, subject, html });
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Ukendt fejl';
    return NextResponse.json({ error: msg }, { status: msg.includes('Firestore') ? 503 : 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const uid = await getNewsletterUserIdFromRequest(req);
  if (!uid) {
    return NextResponse.json({ error: 'Ikke autoriseret' }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get('id')?.trim();
  if (!id) {
    return NextResponse.json({ error: 'Query-param id kræves' }, { status: 400 });
  }

  const ok = await cancelScheduledSend(id, uid);
  if (!ok) {
    return NextResponse.json({ error: 'Kunne ikke annullere (findes ikke eller ikke din)' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
