import { NextRequest, NextResponse } from 'next/server';
import { getNewsletterUserIdFromRequest } from '@/lib/newsletter/auth-request';
import { todayDayKeyUTC } from '@/lib/liv/daily-history-store';
import {
  clearLivDailyPlan,
  getLivDailyPlan,
  setLivDailyPlan,
} from '@/lib/liv/daily-plan-store';
import { expandDirective } from '@/lib/liv/expand-directive';

function dayKeyFor(mode: string | null): string {
  if (mode === 'tomorrow') {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return todayDayKeyUTC(d);
  }
  return todayDayKeyUTC();
}

export async function GET(req: NextRequest) {
  const uid = await getNewsletterUserIdFromRequest(req);
  if (!uid) return NextResponse.json({ error: 'Ikke autoriseret' }, { status: 401 });

  const dayKey = dayKeyFor(req.nextUrl.searchParams.get('for'));
  const plan = await getLivDailyPlan(dayKey);
  return NextResponse.json({ ok: true, dayKey, plan });
}

export async function POST(req: NextRequest) {
  const uid = await getNewsletterUserIdFromRequest(req);
  if (!uid) return NextResponse.json({ error: 'Ikke autoriseret' }, { status: 401 });

  const dayKey = dayKeyFor(req.nextUrl.searchParams.get('for'));
  let body: {
    topicHint?: string;
    directiveHint?: string;
    mustUseTrending?: boolean;
  } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // keep defaults
  }

  const topicHint = body.topicHint?.trim() || '';
  const directiveHint = body.directiveHint?.trim() || '';
  const mustUseTrending = body.mustUseTrending !== false;

  if (!topicHint && !directiveHint) {
    return NextResponse.json(
      { error: 'Skriv mindst et emne eller en retning.' },
      { status: 400 }
    );
  }

  const expanded = await expandDirective({ topicHint, directiveHint });
  await setLivDailyPlan({
    dayKey,
    topicHint,
    directiveHint,
    expandedDirective: expanded.expandedDirective,
    mustUseTrending,
    createdBy: uid,
  });
  const plan = await getLivDailyPlan(dayKey);
  return NextResponse.json({
    ok: true,
    dayKey,
    plan,
    expandedFromAi: !!expanded.expandedDirective,
  });
}

export async function DELETE(req: NextRequest) {
  const uid = await getNewsletterUserIdFromRequest(req);
  if (!uid) return NextResponse.json({ error: 'Ikke autoriseret' }, { status: 401 });
  const dayKey = dayKeyFor(req.nextUrl.searchParams.get('for'));
  await clearLivDailyPlan(dayKey);
  return NextResponse.json({ ok: true, dayKey, deleted: true });
}
