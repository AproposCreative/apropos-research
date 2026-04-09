import { NextRequest, NextResponse } from 'next/server';
import { getNewsletterUserIdFromRequest } from '@/lib/newsletter/auth-request';
import {
  DEFAULT_WEEKLY_AUTO_SETTINGS,
  getWeeklyAutoSettings,
  saveWeeklyAutoSettings,
  type WeeklyAutoSettings,
} from '@/lib/newsletter/weekly-auto-settings';

function parseBody(body: unknown): WeeklyAutoSettings | null {
  if (!body || typeof body !== 'object') return null;
  const o = body as Record<string, unknown>;
  if (typeof o.enabled !== 'boolean') return null;
  const weekdayIso = Number(o.weekdayIso);
  const hour = Number(o.hour);
  const minute = Number(o.minute);
  if (!Number.isFinite(weekdayIso) || !Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return {
    enabled: o.enabled,
    weekdayIso,
    hour,
    minute,
  };
}

export async function GET(req: NextRequest) {
  const uid = await getNewsletterUserIdFromRequest(req);
  if (!uid) {
    return NextResponse.json({ error: 'Ikke autoriseret' }, { status: 401 });
  }
  try {
    const settings = await getWeeklyAutoSettings();
    return NextResponse.json({
      ...settings,
      defaults: DEFAULT_WEEKLY_AUTO_SETTINGS,
      timezone: 'Europe/Copenhagen',
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Ukendt fejl' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const uid = await getNewsletterUserIdFromRequest(req);
  if (!uid) {
    return NextResponse.json({ error: 'Ikke autoriseret' }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => null);
    const parsed = parseBody(body);
    if (!parsed) {
      return NextResponse.json(
        { error: 'Forventet JSON: { enabled, weekdayIso, hour, minute }' },
        { status: 400 }
      );
    }
    await saveWeeklyAutoSettings(parsed);
    const settings = await getWeeklyAutoSettings();
    return NextResponse.json({ ok: true, ...settings });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Ukendt fejl';
    return NextResponse.json({ error: msg }, { status: msg.includes('Firestore') ? 503 : 500 });
  }
}
