import { copenhagenClock } from '@/lib/liv/delivery-policy';

// Same official cloud task; these bounds describe the scheduled workflow, not
// authority for the server to call a model or create another timer.
export const SEO_CLOUD_SCHEDULE = { taskId: '6acb8f8eaaa88190b605cf30ca98e982',
  effectiveDay: '2026-10-12', hour: 9, graceHours: 1, timeZone: 'Europe/Copenhagen',
  intradayEffectiveDay: '2026-11-06', hours: [9, 13, 17, 21], maxBatchesPerRun: 4 } as const;

export type ScheduledSeoRequest = { day: string; slotHour: number; batchNumber: number };
export function seoScheduledRunContext(now = new Date()) {
  const clock = copenhagenClock(now);
  const minute = Number(new Intl.DateTimeFormat('en-GB', { timeZone: SEO_CLOUD_SCHEDULE.timeZone,
    minute: '2-digit' }).format(now));
  // Observed cloud starts can be a few minutes early. Boundary retries keep
  // one identity; this is context, never proof of the timer's origin.
  const slotHour = [...SEO_CLOUD_SCHEDULE.hours].reverse().find(hour => hour * 60 <= clock.hour * 60 + minute + 15) ?? 9;
  const requestIdPrefix = `apropos-seo-${clock.day}-h${String(slotHour).padStart(2, '0')}`;
  return { day: clock.day, slotHour, timeZone: SEO_CLOUD_SCHEDULE.timeZone,
    requestIdPrefix,
    requestIds: Array.from({ length: SEO_CLOUD_SCHEDULE.maxBatchesPerRun }, (_, index) => `${requestIdPrefix}-b${index + 1}`),
    batchLimit: 2, maxBatches: SEO_CLOUD_SCHEDULE.maxBatchesPerRun };
}
export function parseScheduledSeoRequest(requestId: string, now = new Date()): ScheduledSeoRequest | null {
  const match = /^apropos-seo-(\d{4}-\d{2}-\d{2})-h(09|13|17|21)-b([1-4])$/.exec(requestId);
  if (!match || match[1] !== copenhagenClock(now).day) return null;
  return { day: match[1], slotHour: Number(match[2]), batchNumber: Number(match[3]) };
}
