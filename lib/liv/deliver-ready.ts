import { copenhagenClock, publicationTime } from '@/lib/liv/delivery-policy';
import * as store from '@/lib/liv/delivery-store';
import { publishVerifiedLivArticle, verifyLiveLivArticle } from '@/lib/liv/publish-verified';
import { getLivDailyPlan } from '@/lib/liv/daily-plan-store';
import { editorialPlanHash } from '@/lib/liv/rolling-plan';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { finishLivDaily } from '@/lib/liv/daily-history-store';
import { markPlanUsed } from '@/lib/liv/daily-plan-store';
import type { WebflowArticleFields } from '@/lib/webflow/types';

/** No generation, CMS creation, Instagram or site-wide publication in this worker. */
export async function deliverReadyArticle(now = new Date(), dependencies = {
  ...store, publish: publishVerifiedLivArticle, verify: verifyLiveLivArticle,
  planHash: async (day: string) => editorialPlanHash(await getLivDailyPlan(day)),
  record: async (day: string, itemId: string, expected: WebflowArticleFields, scheduled: boolean) => {
    await finishLivDaily(day, { status: 'published', topic: expected.title, title: expected.title,
      slug: expected.slug, webflowItemId: itemId, gateResults: [{ name: 'delivery-live-readback', pass: true,
        detail: 'CMS-revision, offentlig tekst og billeder verificeret.' }] });
    if (scheduled) await markPlanUsed(day);
  },
}) {
  const clock = copenhagenClock(now);
  if (clock.hour < 10) return { status: 'before_deadline' };
  const state = await dependencies.readDeliveryState();
  // Finish a previous day's ambiguous publication before processing today's slot.
  const day = Object.entries(state.slots).find(([, s]) => s.state === 'attempted')?.[0] ?? clock.day;
  const slot = await dependencies.claimDelivery(day, now.getTime());
  if (!slot) return { status: state.slots[day]?.state === 'published' ? 'published' : 'waiting', day };
  let attempted = slot.state === 'attempted';
  try {
    const expected = await dependencies.readDeliveryPayload(slot.itemId);
    const entry = state.entries.find(e => e.itemId === slot.itemId);
    if (!entry || (!attempted && entry.expiresDay < clock.day)) throw new Error('liv_delivery_expired');
    if (entry.payloadHash !== cmsFieldHash(expected as unknown as Record<string, unknown>)) throw new Error('liv_delivery_payload_changed');
    if (!attempted && entry.planHash && entry.planHash !== await dependencies.planHash(day)) throw new Error('liv_delivery_plan_changed');
    const receipt = attempted
      ? await dependencies.verify({ itemId: slot.itemId, expected, fieldDataHash: slot.fieldDataHash! })
      : await dependencies.publish({ itemId: slot.itemId, expected, publicationDate: publicationTime(day),
        assertLease: () => dependencies.updateDelivery(day, slot.token, current => {
          if (current.state !== 'selected' || current.leaseUntil <= Date.now()) throw new Error('liv_delivery_lease_lost');
        }), beforePublish: async hash => {
        await dependencies.updateDelivery(day, slot.token, current => {
          if (current.state !== 'selected' || current.leaseUntil <= Date.now()) throw new Error('liv_delivery_lease_lost');
          current.state = 'attempted';
          current.fieldDataHash = hash;
        });
        attempted = true;
      } });
    await dependencies.record(day, slot.itemId, expected, entry.kind === 'scheduled');
    await dependencies.updateDelivery(day, slot.token, (current, manifest) => {
      current.state = 'published';
      current.publicUrl = receipt.publicUrl;
      current.checkedAt = receipt.checkedAt;
      current.leaseUntil = 0;
      manifest.entries.find(e => e.itemId === slot.itemId)!.state = 'published';
    });
    return { status: 'published', day, ...receipt };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'liv_delivery_failed';
    await dependencies.updateDelivery(day, slot.token, (current, manifest) => {
      // Only definitive pre-write rejection allows a different story for this day.
      // Network errors retry the same ready item; ambiguous writes only retry reads.
      if (!attempted && ['liv_publication_checks_failed', 'liv_publication_draft_changed',
        'liv_delivery_expired', 'liv_delivery_payload_changed', 'liv_delivery_plan_changed'].includes(reason)) {
        manifest.entries.find(e => e.itemId === slot.itemId)!.state = 'rejected';
        delete manifest.slots[day];
      } else {
        current.leaseUntil = 0;
        current.nextAttemptAt = now.getTime() + Math.min(60, 15 * current.attempts) * 60_000;
      }
    });
    return { status: attempted ? 'reconciliation_required' : 'retry_required', day, reason };
  }
}
