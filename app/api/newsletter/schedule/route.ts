import { NextRequest, NextResponse } from 'next/server';
import { getNewsletterUserIdFromRequest } from '@/lib/newsletter/auth-request';
import {
  cancelScheduledSend,
  createScheduledSend,
  listFinishedScheduledForUser,
  listPendingScheduledForUser,
} from '@/lib/newsletter/scheduled-send-store';
import {
  copenhagenMinutesPastWeeklySlot,
  getCopenhagenIsoWeekKey,
} from '@/lib/newsletter/copenhagen-time';
import { getWeeklyAutoSettings } from '@/lib/newsletter/weekly-auto-settings';
import {
  listRecentWeeklyAutoSends,
  readWeeklyAutoPlanDoc,
  tryRecordWeeklyCronNoRun,
} from '@/lib/newsletter/weekly-send-history';
import { listRecentManualSends } from '@/lib/newsletter/manual-send-log';

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
    let weeklyAutoLog: Awaited<ReturnType<typeof listRecentWeeklyAutoSends>> = [];
    try {
      weeklyAutoLog = await listRecentWeeklyAutoSends(8);
    } catch {
      /* Fx manglende indeks for newsletterWeeklySends */
    }
    let manualSendLog: Awaited<ReturnType<typeof listRecentManualSends>> = [];
    try {
      manualSendLog = await listRecentManualSends(uid, 15);
    } catch {
      /* Fx manglende indeks */
    }

    let weeklyAutoPlan: {
      enabled: boolean;
      weekdayIso: number;
      hour: number;
      minute: number;
      weekKey: string;
      doc: Awaited<ReturnType<typeof readWeeklyAutoPlanDoc>>;
    } | null = null;
    try {
      const settings = await getWeeklyAutoSettings();
      const weekKey = getCopenhagenIsoWeekKey(new Date());
      let doc = await readWeeklyAutoPlanDoc(weekKey);

      /** Efter planlagt tid: max ~15 min til næste cron + lidt sendemargin — ellers ingen Firestore-doc = «hængende» UI */
      const STALE_MINUTES_AFTER_WEEKLY_SLOT = 30;
      const now = new Date();
      if (
        settings.enabled &&
        !doc &&
        copenhagenMinutesPastWeeklySlot(
          now,
          settings.weekdayIso,
          settings.hour,
          settings.minute
        ) >= STALE_MINUTES_AFTER_WEEKLY_SLOT
      ) {
        const wrote = await tryRecordWeeklyCronNoRun(weekKey);
        if (wrote) {
          doc = await readWeeklyAutoPlanDoc(weekKey);
          try {
            weeklyAutoLog = await listRecentWeeklyAutoSends(8);
          } catch {
            /* som ovenfor */
          }
        }
      }

      weeklyAutoPlan = {
        enabled: settings.enabled,
        weekdayIso: settings.weekdayIso,
        hour: settings.hour,
        minute: settings.minute,
        weekKey,
        doc,
      };
    } catch {
      /* Firestore / indstillinger */
    }

    return NextResponse.json({ pending, history, weeklyAutoLog, manualSendLog, weeklyAutoPlan });
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
