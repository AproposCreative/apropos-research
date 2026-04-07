import { NextRequest, NextResponse } from 'next/server';
import { getNewsletterUserIdFromRequest } from '@/lib/newsletter/auth-request';
import { executeClaimedScheduledNewsletterJob } from '@/lib/newsletter/execute-scheduled-job';
import { claimNextDueScheduledSend } from '@/lib/newsletter/scheduled-send-store';

export const maxDuration = 300;

/**
 * Kør én forfalden planlagt udsendelse for den indloggede bruger (samme logik som cron).
 * Bruges hvis job er overskredet men endnu ikke sendt — fx før Firestore-indeks var på plads.
 */
export async function POST(_req: NextRequest) {
  const uid = await getNewsletterUserIdFromRequest(_req);
  if (!uid) {
    return NextResponse.json({ error: 'Ikke autoriseret' }, { status: 401 });
  }

  try {
    const job = await claimNextDueScheduledSend({ restrictToUid: uid });
    if (!job) {
      return NextResponse.json({
        ok: true,
        processed: 0,
        message: 'Ingen forfalden planlagt udsendelse for din konto',
      });
    }
    const { summary } = await executeClaimedScheduledNewsletterJob(job);
    return NextResponse.json({ ok: true, processed: 1, summary });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Ukendt fejl';
    const firestoreIndex =
      /index|FAILED_PRECONDITION/i.test(msg) && /Firestore|firestore|Firebase|composite/i.test(msg);
    return NextResponse.json(
      {
        error: msg,
        hint: firestoreIndex
          ? 'Opret det sammensatte Firestore-indeks som Firebase foreslår (status + uid + scheduledFor), eller kør: firebase deploy --only firestore:indexes (fra repo-roden).'
          : undefined,
      },
      { status: 500 }
    );
  }
}
