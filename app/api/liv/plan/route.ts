import { NextRequest, NextResponse } from 'next/server';
import { getNewsletterUserIdFromRequest } from '@/lib/newsletter/auth-request';
import { todayDayKeyUTC } from '@/lib/liv/daily-history-store';
import {
  clearLivDailyPlan,
  getLivDailyPlan,
  setLivDailyPlan,
} from '@/lib/liv/daily-plan-store';
import { expandDirective } from '@/lib/liv/expand-directive';
import { isLivArticleFormat, type LivArticleFormat } from '@/lib/liv/review-format';
import { isLivEditorialKind, type LivEditorialKind } from '@/lib/liv/editorial-kind';
import { addDays, copenhagenClock } from '@/lib/liv/delivery-policy';

function dayKeyFor(mode: string | null): string {
  if (process.env.LIV_DELIVERY_QUEUE_ENABLED === 'true' || process.env.LIV_DELIVERY_PREPARE_ENABLED === 'true') {
    return addDays(copenhagenClock().day, mode === 'tomorrow' ? 1 : 0);
  }
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
    articleFormat?: LivArticleFormat;
    editorialKind?: LivEditorialKind;
  } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // keep defaults
  }

  if (body.articleFormat !== undefined && !isLivArticleFormat(body.articleFormat)) return NextResponse.json({ error: 'Ugyldigt artikelformat.' }, { status: 400 });
  if (body.editorialKind !== undefined && (!isLivEditorialKind(body.editorialKind) || body.articleFormat === 'research-review')) {
    return NextResponse.json({ error: 'Ugyldig redaktionel type.' }, { status: 400 });
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
    articleFormat: body.articleFormat || 'article',
    ...(body.editorialKind ? { editorialKind: body.editorialKind } : {}),
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
