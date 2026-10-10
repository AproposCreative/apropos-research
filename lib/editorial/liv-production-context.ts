import { z } from 'zod';
import { withoutPaidAi } from '@/lib/ai/no-paid-calls';
import { readProviderHold } from '@/lib/ai/provider-hold';
import { getLivDailyPlan } from '@/lib/liv/daily-plan-store';
import { readDeliveryState } from '@/lib/liv/delivery-store';
import { addDays, copenhagenClock, deliveryHealth, isPublicationDay, nextPublicationDay, publicationTime,
  validDay, LIV_CADENCE_ANCHOR_DAY } from '@/lib/liv/delivery-policy';
import { editorialContext, getLivWork } from '@/lib/mcp/editorial';
import { getSubmissionOptions } from './submission-options';
import { getSubmissionStatus, submissionStore } from './submissions';
import { livProductionSubmissionId, type LivProductionIdentity } from './liv-production-identity';
import { editorialWorkflow } from './workflows';

export const livProductionContextInput = z.object({
  day: z.string().refine(validDay).optional().describe('Copenhagen publication date; defaults to today if scheduled, otherwise the next scheduled date.'),
  kind: z.enum(['scheduled', 'reserve']).default('scheduled'),
}).strict();

/** Read-only composition of existing state. No copied archive, paid work or daily-slot mutation. Owner-only MCP tool. */
export async function getLivProductionContext(uid: string, raw: unknown, now = new Date()) {
  return withoutPaidAi(async () => {
    const input = livProductionContextInput.parse(raw), today = copenhagenClock(now).day;
    const state = await readDeliveryState();
    const day = input.kind === 'reserve' ? state.reservePreparation?.dayKey || LIV_CADENCE_ANCHOR_DAY : input.day || nextPublicationDay(today, true);
    if (input.kind === 'scheduled' && !isPublicationDay(day)) throw Error('mcp_liv_off_day');
    const production: LivProductionIdentity = { day, kind: input.kind };
    const submissionId = livProductionSubmissionId(uid, production);
    const runId = `${input.kind === 'reserve' ? 'reserve' : 'prepare'}-${day}`;
    const [plan, retained, editorial, options, provider, saved, plans] = await Promise.all([
      getLivDailyPlan(day), getLivWork(runId), editorialContext(), getSubmissionOptions(), readProviderHold().catch(() => ({ blocked: true, reason: 'status_unavailable' })),
      submissionStore().collection.doc(submissionId).get(),
      Promise.all(Array.from({ length: 7 }, (_, i) => getLivDailyPlan(addDays(today, i)))),
    ]);
    const prior = retained as typeof retained & { title?: string; topic?: unknown; status?: string; checkpointHash?: string; webflowItemId?: string; reason?: string };
    return {
      mode: 'chatgpt-first', checkedAt: now.toISOString(), production, submissionId,
      requestId: `liv-${input.kind}-${day}`, scheduledFor: input.kind === 'scheduled' ? publicationTime(day) : null,
      workflow: editorialWorkflow({ workflow: 'liv' }), editorial, options,
      existingSubmission: saved.exists ? await getSubmissionStatus(uid, submissionId) : null,
      plan, planIsResearchApproval: false,
      retainedWork: { runId, found: prior.found, title: prior.title ?? null, topic: prior.topic ?? null,
        status: prior.status ?? null, reason: prior.reason ?? null, checkpointHash: prior.checkpointHash ?? null,
        webflowItemId: prior.webflowItemId ?? null, nextTool: prior.found ? 'get_liv_work' : null,
        instruction: 'Genbrug checkpoint/kilder før skrivning. Et gammelt emnehint eller fejlet skriveforsøg er ikke en færdig artikel eller godkendt research.' },
      automaticDelivery: deliveryHealth(state, now),
      week: plans.map((p, i) => { const date = addDays(today, i), slot = state.slots[date];
        return { day: date, publicationDay: isPublicationDay(date),
          status: slot?.state === 'published' ? 'published' : !isPublicationDay(date) ? 'off_day' :
            state.entries.some(e => e.kind === 'scheduled' && e.scheduledDay === date && e.state === 'ready' && e.expiresDay >= date && !e.publicationBlockers?.length && e.decision !== 'rejected') ? 'ready' :
            p?.status === 'failed' ? 'blocked' : p ? 'planned' : 'unplanned',
          publicUrl: slot?.publicUrl ?? null, plan: p, planIsReadyArticle: false }; }),
      backendAi: { allowed: false, estimatedDkk: 0, providerHold: provider, holdChanged: false,
        subscriptionUsage: 'not_observable_here', infrastructureCostsExcluded: true },
      automaticPublicationApproval: false, countsAsUnattendedLiv: false,
      nextAction: saved.exists ? 'resume_existing_submission' : prior.webflowItemId ? 'inspect_existing_cms_article_before_any_create' : 'research_in_chat_and_prepare_submission',
    };
  });
}
