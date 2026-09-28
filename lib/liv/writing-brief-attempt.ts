import { createHash } from 'node:crypto';
import type OpenAI from 'openai';
import { getAdminDb } from '@/lib/firebase-admin';
import { getOpenAIClient } from '@/lib/openai';
import { currentLivCostContext } from './cost-context';
import { getLivCostPretransportError } from './cost-errors';

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const pending = new Map<string, Promise<BriefResponse>>();
type BriefResponse = { id: string; raw: string; finishReason: string | null; refusal: string | null };

/** Save the bounded paid extraction BEFORE interpreting it. Invalid JSON, a
 * missing source or an insufficient brief is still paid work, not a retry grant.
 * Scope is server-owned (the same private scope as the writer/source archive).
 */
export async function writingBriefAttempt(scope: string,
  request: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming, timeoutMs: number): Promise<BriefResponse> {
  if (!scope.trim() || scope.length > 200) throw new Error('research_brief_scope_invalid');
  const requestJson = JSON.stringify(request);
  if (requestJson.length > 180_000) throw new Error('research_brief_input_too_large');
  const inputHash = hash(requestJson), scopeHash = hash(scope);
  const id = hash(JSON.stringify(['writing-brief-v1', scopeHash, inputHash]));
  const active = pending.get(id);
  if (active) return structuredClone(await active);
  const operation = (async (): Promise<BriefResponse> => {
    const db = getAdminDb();
    if (!db) throw new Error('research_brief_store_unavailable');
    const ref = db.collection('livWritingBriefAttempts').doc(id);
    const client = getOpenAIClient();
    const saved = await db.runTransaction(async tx => {
      const row = (await tx.get(ref)).data();
      if (row) {
        if (row.inputHash !== inputHash || row.scopeHash !== scopeHash || row.model !== request.model || row.requestJson !== requestJson) {
          throw new Error('research_brief_cache_mismatch');
        }
        if (row.status === 'not_started' && row.notStartedReason === 'cost_denied' &&
            !['raw', 'rawHash', 'completedAt', 'usage', 'finishReason'].some(key => key in row)) {
          if (!client) throw new Error('research_brief_unavailable');
          tx.set(ref, { status: 'processing' }, { merge: true });
          return null;
        }
        if (row.status !== 'complete') throw new Error('research_brief_requires_reconciliation');
        return row;
      }
      if (!client) throw new Error('research_brief_unavailable');
      const context = currentLivCostContext();
      tx.create(ref, { status: 'processing', scopeHash, inputHash, model: request.model,
        // Exact source passages and IDs survive a validation failure, too.
        requestJson, createdAt: new Date().toISOString(),
        runId: context?.runId ?? null, stage: context?.stage ?? null });
      return null;
    });
    if (saved) {
      if (typeof saved.raw !== 'string' || saved.rawHash !== hash(saved.raw) ||
          !(typeof saved.finishReason === 'string' || saved.finishReason === null) ||
          !(typeof saved.refusal === 'string' || saved.refusal === null)) throw new Error('research_brief_cache_invalid');
      return { id, raw: saved.raw, finishReason: saved.finishReason, refusal: saved.refusal };
    }
    if (!client) throw new Error('research_brief_unavailable');
    const response = await client.chat.completions.create(request, { timeout: timeoutMs, maxRetries: 0 }).catch(async error => {
      const unpaid = getLivCostPretransportError(error);
      if (unpaid) await ref.set({ status: 'not_started',
        notStartedReason: ['liv_cost_monthly_budget_exceeded', 'liv_cost_call_limit_exceeded',
          'liv_cost_policy_missing_or_expired'].includes(unpaid.code) ? 'cost_denied' : 'pretransport_refused',
        notStartedAt: new Date().toISOString() }, { merge: true });
      // An unknown transport outcome remains processing. Never infer nonpayment
      // from an error string, clear the claim or automatically buy a replacement.
      throw error;
    });
    const raw = response.choices[0]?.message.content || '';
    const finishReason = response.choices[0]?.finish_reason ?? null;
    const refusal = response.choices[0]?.message.refusal ?? null;
    await ref.set({ status: 'complete', raw, rawHash: hash(raw), finishReason, refusal,
      responseModel: response.model ?? null, providerResponseId: response.id ?? null,
      usage: response.usage ?? null, completedAt: new Date().toISOString() }, { merge: true })
      .catch(() => { throw new Error('research_brief_requires_reconciliation'); });
    return { id, raw, finishReason, refusal };
  })();
  pending.set(id, operation);
  try { return structuredClone(await operation); }
  finally { pending.delete(id); }
}

/** Diagnostic only. This never changes the immutable paid response or approves
 * publication; all subsequent factual/editorial checks still apply. */
export async function recordWritingBriefValidation(id: string, result: {
  valid: boolean; code?: string; counts?: { hosts: number; facts: number; opinions: number; duplicateNotes: number };
}) {
  const db = getAdminDb();
  if (!db || !/^[a-f0-9]{64}$/.test(id)) throw new Error('research_brief_store_unavailable');
  await db.collection('livWritingBriefAttempts').doc(id).set({ validation: {
    ...result, checkedAt: new Date().toISOString(), version: 'writing-brief-validation-v1',
  } }, { merge: true }).catch(() => { throw new Error('research_brief_requires_reconciliation'); });
}
