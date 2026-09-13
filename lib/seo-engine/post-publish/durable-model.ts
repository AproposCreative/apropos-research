import { createHash, randomUUID } from 'node:crypto';
import type { ReviewModelCall } from './review';
import { getLivCostPretransportError } from '@/lib/liv/cost-errors';

export type ModelStageRecord = {
  requestHash: string;
  owner: string;
  status: 'started' | 'responded' | 'uncertain' | 'not_started';
  startedAt: string;
  response?: string;
  respondedAt?: string;
  notStartedReason?: 'cost_denied';
  costDenials?: Array<{ owner: string; startedAt: string; recordedAt: string; code: string; providerAttempted: false }>;
};

/** Transactions must be atomic across processes, including the initial create. */
export interface ModelStageStore {
  transact<T>(key: string, fn: (current: ModelStageRecord | null) => {
    next?: ModelStageRecord;
    result: T;
  }): Promise<T>;
}

export function modelRequestHash(request: Parameters<ReviewModelCall>[0], model: string): string {
  return createHash('sha256').update(JSON.stringify({ model, ...request })).digest('hex');
}

/**
 * A completed stage is replayed locally; uncertain transport is never paid again
 * automatically. The caller can resume verification after a saved review without
 * rerunning the review. Neither a timeout nor an expired worker lease proves that
 * a provider request did not run.
 */
export function durableReviewModel(args: {
  jobId: string;
  model: string;
  store: ModelStageStore;
  call: ReviewModelCall;
  now?: () => Date;
}): ReviewModelCall {
  return async request => {
    const key = createHash('sha256').update(`${args.jobId}:${request.stage}`).digest('hex');
    const requestHash = modelRequestHash(request, args.model);
    const owner = randomUUID();
    const now = () => (args.now?.() ?? new Date()).toISOString();
    const claimed = await args.store.transact<{ response: string } | { claimed: true }>(key, current => {
      if (current) {
        if (current.requestHash !== requestHash) throw new Error('seo_model_request_changed');
        if (current.status === 'responded' && typeof current.response === 'string') {
          return { result: { response: current.response } };
        }
        if (current.status !== 'not_started' || current.notStartedReason !== 'cost_denied' ||
          current.response !== undefined || current.respondedAt !== undefined ||
          !current.costDenials?.length || current.costDenials.at(-1)?.providerAttempted !== false) {
          throw new Error('seo_model_requires_reconciliation');
        }
      }
      return { next: { requestHash, owner, status: 'started', startedAt: now(),
        ...(current?.costDenials ? { costDenials: current.costDenials } : {}) }, result: { claimed: true } };
    });
    if ('response' in claimed) return claimed.response;
    let response: string;
    try {
      response = await args.call(request);
    } catch (error) {
      const denial = getLivCostPretransportError(error);
      await args.store.transact(key, current => {
        if (!current || current.owner !== owner || current.status !== 'started') throw new Error('seo_model_stage_conflict');
        if (denial) return { next: { ...current, status: 'not_started', notStartedReason: 'cost_denied',
          costDenials: [...(current.costDenials || []), { owner, startedAt: current.startedAt,
            recordedAt: now(), code: denial.code, providerAttempted: false }] }, result: undefined };
        return { next: { ...current, status: 'uncertain' }, result: undefined };
      });
      throw error;
    }
    // Persist before parsing: malformed paid output must also be recoverable.
    // Retrying this storage operation is safe; retrying the provider is not.
    let storageError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await args.store.transact(key, current => {
          if (!current || current.owner !== owner || current.requestHash !== requestHash) throw new Error('seo_model_stage_conflict');
          if (current.status === 'responded' && current.response !== response) throw new Error('seo_model_response_conflict');
          return { next: { ...current, status: 'responded', response, respondedAt: now() }, result: undefined };
        });
        return response;
      } catch (error) { storageError = error; }
    }
    throw storageError;
  };
}
