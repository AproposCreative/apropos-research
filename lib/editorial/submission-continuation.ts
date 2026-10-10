import { readSubmission } from './submissions';
import { runSubmissionStep } from './submission-worker';
import { withoutPaidAi } from '@/lib/ai/no-paid-calls';

/** Drain only new zero-AI work. Each step retains its existing lease, receipt and checks.
 * A timeout never buys/replays a stage: the next cron reads the same durable state. */
export async function continueSubmissionPreparation(uid: string, id: string) {
  const row = await readSubmission(uid, id);
  if (row.executionPolicy !== 'chatgpt-first-v1') return runSubmissionStep(uid, id);
  return withoutPaidAi(async () => {
    const deadline = Date.now() + 60_000;
    let result: Awaited<ReturnType<typeof runSubmissionStep>> = { status: row.status };
    for (let steps = 0; steps < 8 && Date.now() < deadline; steps++) {
      result = await runSubmissionStep(uid, id);
      if (result.status !== 'processing') break;
    }
    return result;
  });
}
