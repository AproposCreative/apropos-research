import { withoutPaidAi } from '@/lib/ai/no-paid-calls';
import { addDays, copenhagenClock } from '@/lib/liv/delivery-policy';
import { logger } from '@/lib/logger';
import { seoDb } from './processor';
import { snapshotHash } from './snapshot';
import { ACTIVE_SEO_STATUSES, SEO_QUEUE_WINDOW } from './chat-queue';
import { TERMINAL_QUALITY_STATES, type QualityJob } from './jobs';

// Verified existing cloud task. No server impersonation of ChatGPT and no new timer.
export const SEO_CLOUD_SCHEDULE = { taskId: '6acb8f8eaaa88190b605cf30ca98e982',
  effectiveDay: '2026-10-12', hour: 9, graceHours: 1, timeZone: 'Europe/Copenhagen' } as const;
type Batch = { taskIds: string[]; checked: string[]; candidateIds: string[]; limit: number;
  createdAt: string; updatedAt?: string; lastError?: string; selection?: { partial: boolean } };
type Issue = { code: string; taskId?: string };

export function assessSeoChatHealth(input: { now: Date; mode: string; day: string;
  batch: Batch | null; tasks: QualityJob[]; active: QualityJob[]; partial: boolean }) {
  const { now, day, batch, tasks } = input, clock = copenhagenClock(now);
  const expected = day >= SEO_CLOUD_SCHEDULE.effectiveDay && input.mode === 'chatgpt-first';
  const due = expected && (day < clock.day || clock.hour >= SEO_CLOUD_SCHEDULE.hour + SEO_CLOUD_SCHEDULE.graceHours);
  const issues: Issue[] = [];
  if (due && !batch) issues.push({ code: 'scheduled_run_not_observed' });
  const safeError = batch?.lastError && /^seo_[a-z_0-9]+$/.test(batch.lastError) ? batch.lastError : null;
  if (safeError) issues.push({ code: /(?:_401|_403|auth_missing)$/.test(safeError) ? 'service_access_failed' : 'claim_failed' });
  const batchTasks = tasks.filter(job => batch?.taskIds.includes(job.id));
  const complete = !!batch && !safeError && batchTasks.length === batch.taskIds.length &&
    (batch.taskIds.length >= batch.limit || batch.checked.length >= batch.candidateIds.length) &&
    batchTasks.every(job => job.status === 'needs_editor' || (['kept', 'applied'].includes(job.status) && !!job.publicReceipt));
  if (due && batch && !complete && now.getTime() - Date.parse(batch.createdAt) > 2 * 3600_000) {
    issues.push({ code: 'scheduled_run_incomplete' });
  }
  for (const job of input.active) {
    if (TERMINAL_QUALITY_STATES.includes(job.status)) continue;
    if (job.writeStartedAt && now.getTime() - Date.parse(job.writeStartedAt) > 30 * 60_000) {
      issues.push({ code: 'write_readback_pending', taskId: job.id });
    } else if (job.processor === 'chatgpt-first' && now.getTime() - Date.parse(job.updatedAt) > 2 * 3600_000) {
      issues.push({ code: 'review_stalled', taskId: job.id });
    }
    if (/^seo_webflow_.*_(401|403)$|^seo_webflow_auth_missing$/.test(job.reason || '')) {
      issues.push({ code: 'service_access_failed', taskId: job.id });
    }
  }
  if (batchTasks.some(job => ['needs_editor', 'failed', 'stale'].includes(job.status))) issues.push({ code: 'editorial_attention' });
  return { day, checkedAt: now.toISOString(), processor: input.mode, schedule: SEO_CLOUD_SCHEDULE,
    status: issues.length ? 'attention' : complete ? 'completed' : batch ? 'in_progress' : expected ? 'waiting' : 'not_due',
    runObserved: !!batch, completedTasks: batchTasks.filter(job => ['kept', 'applied'].includes(job.status) && job.publicReceipt).length,
    editorialAttentionTasks: batchTasks.filter(job => job.status === 'needs_editor').length,
    issues, scanPartial: input.partial || Boolean(batch?.selection?.partial),
    // An authenticated request identity is not proof of the cloud timer's origin.
    timerOriginVerified: false, paidModelCalls: 0, automaticRepairAttempted: false };
}
export type SeoChatHealth = ReturnType<typeof assessSeoChatHealth> & { previousDay?: ReturnType<typeof assessSeoChatHealth> };

/** Read-only UI check; bounded existing database reads, no credential probes. */
export function readSeoChatHealth(now = new Date()): Promise<SeoChatHealth> {
  return withoutPaidAi(async () => {
    const db = seoDb(), control = (await db.collection('seoPostPublishControl').doc('processor').get()).data();
    const mode = control?.mode === 'chatgpt-first' ? 'chatgpt-first' : 'api';
    const { day } = copenhagenClock(now);
    const activeRows = await db.collection('seoPostPublishJobs').where('status', 'in', ACTIVE_SEO_STATUSES).limit(SEO_QUEUE_WINDOW + 1).get();
    const active = activeRows.docs.slice(0, SEO_QUEUE_WINDOW).map(d => ({ ...d.data(), id: d.id } as QualityJob));
    async function readDay(date: string) {
      const id = `chat-${snapshotHash({ uid: control?.uid || '', requestId: `apropos-seo-${date}` })}`;
      const batch = (await db.collection('seoPostPublishControl').doc(id).get()).data() as Batch | undefined;
      const tasks = await Promise.all((batch?.taskIds || []).slice(0, 2).map(async id => {
        const row = await db.collection('seoPostPublishJobs').doc(id).get();
        return row.exists ? { ...row.data(), id } as QualityJob : null;
      }));
      return assessSeoChatHealth({ now, mode, day: date, batch: batch || null,
        tasks: tasks.filter((job): job is QualityJob => !!job), active, partial: activeRows.docs.length > SEO_QUEUE_WINDOW });
    }
    return { ...await readDay(day), previousDay: await readDay(addDays(day, -1)) };
  });
}

/** Existing 15-minute cron records health; only changes produce a warning.
 * No emails, model calls, CMS writes, retries, reservation or hold resets. */
export async function observeSeoChatHealth(now = new Date()) {
  const health = await readSeoChatHealth(now);
  const signature = snapshotHash({ day: health.day, status: health.status, issues: health.issues,
    completedTasks: health.completedTasks, previousStatus: health.previousDay?.status, previousIssues: health.previousDay?.issues });
  const changed = await seoDb().runTransaction(async tx => {
    const current = seoDb().collection('seoPostPublishControl').doc('chat-health');
    const previous = (await tx.get(current)).data();
    tx.set(current, { ...health, signature });
    tx.set(seoDb().collection('seoPostPublishControl').doc(`chat-health-${health.day}`), { ...health, signature });
    return previous?.signature !== signature;
  });
  if (changed && (health.issues.length || health.previousDay?.issues.length)) logger.warn('[seo-chat] health changed', {
    day: health.day, issues: health.issues, previousDayIssues: health.previousDay?.issues || [],
  });
  return { ...health, changed };
}
