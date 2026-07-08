import { NextRequest, NextResponse } from 'next/server';
import {
  isArticleAutoTranslateEnabledFromEnv,
  resolveAutoTranslateEnabled,
  setAutoTranslateEnabled,
} from '@/lib/webflow/article-translation-settings';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const enabled = await resolveAutoTranslateEnabled();
    return NextResponse.json({
      ok: true,
      enabled,
      envDefault: isArticleAutoTranslateEnabledFromEnv(),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Kunne ikke hente status' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { enabled?: boolean };
    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json({ ok: false, error: 'enabled skal være true eller false' }, { status: 400 });
    }
    await setAutoTranslateEnabled(body.enabled);
    return NextResponse.json({ ok: true, enabled: body.enabled });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Kunne ikke gemme indstilling' },
      { status: 500 }
    );
  }
}
