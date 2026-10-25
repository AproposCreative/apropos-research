import { NextRequest, NextResponse } from 'next/server';
import { editorialRequestAccess } from '@/lib/editorial-access';
import { resumeSocialSubtitleBudget } from '@/lib/ai/social-subtitle-budget';

const headers = { 'Cache-Control': 'no-store' };

/** Owner action after a verified manual provider top-up. This performs no AI
 * call and cannot raise or reset the one-time 10 DKK limit. */
export async function POST(req: NextRequest) {
  const access = await editorialRequestAccess(req);
  if (!access?.owner) return NextResponse.json({ error: 'Kun ejeren kan genåbne AI-forkortelse.' }, { status: 403, headers });
  let body: unknown;
  try { body = await req.json(); } catch { body = null; }
  const expectedGeneration = (body as { expectedGeneration?: unknown } | null)?.expectedGeneration;
  if (!Number.isSafeInteger(expectedGeneration) || typeof expectedGeneration !== 'number' || expectedGeneration < 0) {
    return NextResponse.json({ error: 'Ugyldig genoptagelse.' }, { status: 400, headers });
  }
  try {
    const result = await resumeSocialSubtitleBudget(access.uid, expectedGeneration);
    return NextResponse.json({ resumed: true, generation: result.generation }, { headers });
  } catch {
    return NextResponse.json({ error: 'Genoptagelsen passer ikke til den aktuelle SoMe-status. Opdater siden og kontrollér saldoen.' }, { status: 409, headers });
  }
}
