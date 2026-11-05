import { withoutPaidAi } from '@/lib/ai/no-paid-calls';
import { addDays, copenhagenClock } from '@/lib/liv/delivery-policy';
import { logger } from '@/lib/logger';
import { seoDb } from './processor';
import { snapshotHash } from './snapshot';
import { ACTIVE_SEO_STATUSES, SEO_QUEUE_WINDOW, isPublicationEventJob, requiresSeoProposalRevision } from './chat-queue';
import { SEO_CLOUD_SCHEDULE, parseScheduledSeoRequest } from './chat-schedule';
import { TERMINAL_QUALITY_STATES, type QualityJob } from './jobs';

export { SEO_CLOUD_SCHEDULE } from './chat-schedule';
export const SEO_PUBLICATION_REVIEW_TARGET_HOURS = 24;
const EDITORIAL_ATTENTION_WINDOW = 50;
type Batch = { taskIds: string[]; checked: string[]; candidateIds: string[]; limit: number;
  createdAt: string; updatedAt?: string; lastError?: string; selection?: { partial: boolean };
  slotHour?: number; batchNumber?: number };
type Issue = { code: string; taskId?: string; slotHour?: number };
type ScheduledEntry = { batchId: string; requestId: string; slotHour: number; batchNumber: number; createdAt: string };

function publicationBacklog(jobs: QualityJob[], now: Date, partial: boolean) {
  const waiting = jobs.filter(job => isPublicationEventJob(job) &&
    (!TERMINAL_QUALITY_STATES.includes(job.status) || job.status === 'needs_editor'));
  const articles = new Map<string, number>();
  for (const job of waiting) {
    const at = Date.parse(job.createdAt);
    if (!Number.isFinite(at)) continue;
    const key = job.snapshot.itemId ? `${job.snapshot.itemId}:${job.snapshot.locale}` : job.id;
    articles.set(key, Math.min(articles.get(key) ?? Infinity, at));
  }
  const times = [...articles.values()], oldest = times.length ? Math.min(...times) : null;
  return { targetHours: SEO_PUBLICATION_REVIEW_TARGET_HOURS, pendingJobs: waiting.length,
    pendingArticles: articles.size,
    overdueArticles: times.filter(at => now.getTime() - at >= SEO_PUBLICATION_REVIEW_TARGET_HOURS * 3600_000).length,
    oldestQueuedAt: oldest === null ? null : new Date(oldest).toISOString(),
    oldestWaitHours: oldest === null ? 0 : Math.max(0, Math.floor((now.getTime() - oldest) / 3600_000)), partial };
}

export function assessSeoChatHealth(input: { now: Date; mode: string; day: string;
  batch: Batch | null; batches?: Batch[]; tasks: QualityJob[]; active: QualityJob[];
  editorial?: QualityJob[]; partial: boolean; intradayEffectiveDay?: string }) {
  const { now, day } = input, clock = copenhagenClock(now);
  const batches = input.batches ?? (input.batch ? [input.batch] : []);
  const expected = day >= SEO_CLOUD_SCHEDULE.effectiveDay && input.mode === 'chatgpt-first';
  // New expected timer slots are activated only after the actual cloud task's
  // schedule has been changed and its verification recorded. Deploy != timer.
  const intraday = Boolean(input.intradayEffectiveDay && day >= input.intradayEffectiveDay);
  const slots: number[] = intraday ? [...SEO_CLOUD_SCHEDULE.hours] : [SEO_CLOUD_SCHEDULE.hour];
  const dueSlots = expected ? slots.filter(hour => day < clock.day || clock.hour >= hour + SEO_CLOUD_SCHEDULE.graceHours) : [];
  const issues: Issue[] = [];
  for (const slotHour of dueSlots) {
    if (!batches.some(batch => (batch.slotHour ?? 9) === slotHour && (batch.batchNumber ?? 1) === 1)) {
      issues.push({ code: 'scheduled_run_not_observed', ...(intraday ? { slotHour } : {}) });
    }
  }
  const taskMap = new Map(input.tasks.map(job => [job.id, job]));
  const completeBatches = batches.map(batch => {
    const safeError = batch.lastError && /^seo_[a-z_0-9]+$/.test(batch.lastError) ? batch.lastError : null;
    if (safeError) issues.push({ code: /(?:_401|_403|auth_missing)$/.test(safeError) ? 'service_access_failed' : 'claim_failed' });
    const tasks = batch.taskIds.map(id => taskMap.get(id)).filter((job): job is QualityJob => !!job);
    const complete = !safeError && tasks.length === batch.taskIds.length &&
      (batch.taskIds.length >= batch.limit || batch.checked.length >= batch.candidateIds.length) &&
      tasks.every(job => job.status === 'needs_editor' || (['kept', 'applied'].includes(job.status) && !!job.publicReceipt));
    if (dueSlots.includes(batch.slotHour ?? 9) && !complete && now.getTime() - Date.parse(batch.createdAt) > 2 * 3600_000) {
      issues.push({ code: 'scheduled_run_incomplete', ...(intraday ? { slotHour: batch.slotHour ?? 9 } : {}) });
    }
    return complete;
  });
  const batchTaskIds = new Set(batches.flatMap(batch => batch.taskIds));
  const batchTasks = input.tasks.filter(job => batchTaskIds.has(job.id));
  const unresolved = [...new Map([...input.active, ...(input.editorial || []), ...batchTasks].map(job => [job.id, job])).values()];
  for (const job of unresolved) {
    if (requiresSeoProposalRevision(job)) issues.push({ code: 'proposal_revision_required', taskId: job.id });
    if (TERMINAL_QUALITY_STATES.includes(job.status)) continue;
    if (job.writeStartedAt && now.getTime() - Date.parse(job.writeStartedAt) > 30 * 60_000) {
      issues.push({ code: 'write_readback_pending', taskId: job.id });
    } else if (!requiresSeoProposalRevision(job) && job.processor === 'chatgpt-first' && now.getTime() - Date.parse(job.updatedAt) > 2 * 3600_000) {
      issues.push({ code: 'review_stalled', taskId: job.id });
    }
    if (/^seo_webflow_.*_(401|403)$|^seo_webflow_auth_missing$/.test(job.reason || '')) {
      issues.push({ code: 'service_access_failed', taskId: job.id });
    }
  }
  const editorial = unresolved.filter(job => job.status === 'needs_editor');
  if (editorial.length || batchTasks.some(job => ['failed', 'stale'].includes(job.status))) issues.push({ code: 'editorial_attention' });
  const scanPartial = input.partial || batches.some(batch => Boolean(batch.selection?.partial));
  const backlog = publicationBacklog(unresolved, now, scanPartial);
  if (expected && backlog.overdueArticles > 0) issues.push({ code: 'publication_review_overdue' });
  if (expected && scanPartial) issues.push({ code: 'queue_scan_partial' });
  const uniqueIssues = [...new Map(issues.map(issue => [JSON.stringify(issue), issue])).values()];
  const complete = batches.length > 0 && completeBatches.every(Boolean);
  return { day, checkedAt: now.toISOString(), processor: input.mode,
    schedule: { ...SEO_CLOUD_SCHEDULE, mode: intraday ? 'intraday' : 'daily', hours: slots },
    status: uniqueIssues.length ? 'attention' : complete ? 'completed' : batches.length ? 'in_progress' : expected ? 'waiting' : 'not_due',
    runObserved: batches.length > 0,
    observedSlots: [...new Set(batches.map(batch => batch.slotHour ?? 9))].sort((a, b) => a - b),
    observedBatches: batches.length,
    completedTasks: batchTasks.filter(job => ['kept', 'applied'].includes(job.status) && job.publicReceipt).length,
    editorialAttentionTasks: editorial.length,
    revisionRequiredTasks: unresolved.filter(requiresSeoProposalRevision).length,
    backlog, issues: uniqueIssues, scanPartial,
    // Authenticated request identity is not proof of the cloud timer's origin.
    timerOriginVerified: false, paidModelCalls: 0, automaticRepairAttempted: false };
}
export type SeoChatHealth = ReturnType<typeof assessSeoChatHealth> & { previousDay?: ReturnType<typeof assessSeoChatHealth> };

/** Read-only bounded checks. Registry entries are actual batches; an absent
 * optional b2/b3/b4 after an empty queue is not a missed scheduled run. */
export function readSeoChatHealth(now = new Date()): Promise<SeoChatHealth> {
  return withoutPaidAi(async () => {
    const db = seoDb();
    const [processorRow, scheduleRow] = await Promise.all([
      db.collection('seoPostPublishControl').doc('processor').get(),
      db.collection('seoPostPublishControl').doc('chat-schedule').get(),
    ]);
    const control = processorRow.data(), schedule = scheduleRow.data();
    const intradayEffectiveDay = schedule?.mode === 'intraday' &&
      /^\d{4}-\d{2}-\d{2}$/.test(schedule.effectiveDay || '') &&
      Number.isFinite(Date.parse(schedule.verifiedAt || '')) && Date.parse(schedule.verifiedAt) <= now.getTime()
      ? schedule.effectiveDay as string : undefined;
    const mode = control?.mode === 'chatgpt-first' ? 'chatgpt-first' : 'api';
    const { day } = copenhagenClock(now);
    const [activeRows, editorialRows] = await Promise.all([
      db.collection('seoPostPublishJobs').where('status', 'in', ACTIVE_SEO_STATUSES).limit(SEO_QUEUE_WINDOW + 1).get(),
      db.collection('seoPostPublishJobs').where('status', '==', 'needs_editor').limit(EDITORIAL_ATTENTION_WINDOW + 1).get(),
    ]);
    const active = activeRows.docs.slice(0, SEO_QUEUE_WINDOW).map(d => ({ ...d.data(), id: d.id } as QualityJob));
    const editorial = editorialRows.docs.slice(0, EDITORIAL_ATTENTION_WINDOW).map(d => ({ ...d.data(), id: d.id } as QualityJob));
    async function readDay(date: string) {
      const legacyId = `chat-${snapshotHash({ uid: control?.uid || '', requestId: `apropos-seo-${date}` })}`;
      const [legacyRow, registryRow] = await Promise.all([
        db.collection('seoPostPublishControl').doc(legacyId).get(),
        db.collection('seoPostPublishControl').doc(`chat-runs-${date}`).get(),
      ]);
      const entries = Object.values(registryRow.data()?.entries || {}) as ScheduledEntry[];
      const valid = entries.slice(0, 16).filter(entry => {
        if (!entry || typeof entry !== 'object') return false;
        const parsed = parseScheduledSeoRequest(entry.requestId || '', new Date(`${date}T12:00:00Z`));
        return parsed && entry.slotHour === parsed.slotHour && entry.batchNumber === parsed.batchNumber &&
          entry.batchId === `chat-${snapshotHash({ uid: control?.uid || '', requestId: entry.requestId })}`;
      });
      const uniqueEntries = [...new Map(valid.map(entry => [entry.batchId, entry])).values()];
      const batches = (await Promise.all(uniqueEntries.map(async entry => {
        const row = await db.collection('seoPostPublishControl').doc(entry.batchId).get();
        return row.exists ? { ...row.data(), slotHour: entry.slotHour, batchNumber: entry.batchNumber } as Batch : null;
      }))).filter((batch): batch is Batch => !!batch);
      if (legacyRow.exists) batches.unshift({ ...legacyRow.data(), slotHour: 9, batchNumber: 1 } as Batch);
      const ids = [...new Set(batches.flatMap(batch => batch.taskIds.slice(0, 2)))];
      const tasks = await Promise.all(ids.map(async id => {
        const row = await db.collection('seoPostPublishJobs').doc(id).get();
        return row.exists ? { ...row.data(), id } as QualityJob : null;
      }));
      return assessSeoChatHealth({ now, mode, day: date, batch: null, batches,
        tasks: tasks.filter((job): job is QualityJob => !!job), active, editorial, intradayEffectiveDay,
        partial: activeRows.docs.length > SEO_QUEUE_WINDOW || editorialRows.docs.length > EDITORIAL_ATTENTION_WINDOW || valid.length !== entries.length });
    }
    return { ...await readDay(day), previousDay: await readDay(addDays(day, -1)) };
  });
}

/** Existing observer: no emails, model calls, CMS writes or reservation resets. */
export async function observeSeoChatHealth(now = new Date()) {
  const health = await readSeoChatHealth(now);
  const signature = snapshotHash({ day: health.day, status: health.status, issues: health.issues,
    completedTasks: health.completedTasks, backlog: { pendingArticles: health.backlog.pendingArticles, overdueArticles: health.backlog.overdueArticles },
    previousStatus: health.previousDay?.status, previousIssues: health.previousDay?.issues });
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
