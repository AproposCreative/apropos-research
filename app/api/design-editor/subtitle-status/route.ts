import { NextRequest, NextResponse } from 'next/server';
import { editorialRequestAccess } from '@/lib/editorial-access';
import { readSocialSubtitleStatus } from '@/lib/ai/social-subtitle-budget';

const headers = { 'Cache-Control': 'no-store' };

/** Checks an already authorized resumption. No AI, budget write or new grant. */
export async function GET(req: NextRequest) {
  if (!(await editorialRequestAccess(req))) {
    return NextResponse.json({ error: 'Log ind som redaktør.' }, { status: 401, headers });
  }
  try {
    return NextResponse.json(await readSocialSubtitleStatus(), { headers });
  } catch {
    return NextResponse.json({ error: 'AI-status kunne ikke kontrolleres.' }, { status: 503, headers });
  }
}
