import { createHash } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import { getOpenAIClient } from '@/lib/openai';
import { withLivCostStage } from './cost-context';
import { getLivCostPretransportError } from './cost-errors';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const pending = new Map<string, Promise<number[]>>();
const validVector = (value: unknown): value is number[] => Array.isArray(value) && value.length === 1536 &&
  value.every(item => typeof item === 'number' && Number.isFinite(item)) && value.some(item => item !== 0);

/** Cache provider vectors, never an approval or a corpus comparison. The caller
 * must still run lexical checks over the full current texts and apply thresholds. */
export function getLivCachedEmbedding(input: string): Promise<number[]> {
  const request = { model: 'text-embedding-3-small', input, dimensions: 1536 };
  const inputHash = hash(JSON.stringify(request));
  const key = `v1-${inputHash}`;
  const active = pending.get(key);
  if (active) return active.then(vector => [...vector]);
  const operation = (async () => {
    const db = getAdminDb();
    if (!db) throw new Error('liv_embedding_store_unavailable');
    const ref = db.collection('livEmbeddingCache').doc(key);
    const saved = await db.runTransaction(async tx => {
      const row = (await tx.get(ref)).data();
      if (row) {
        if (row.inputHash !== inputHash) throw new Error('liv_embedding_cache_mismatch');
        if (row.status === 'not_started' && row.notStartedReason === 'cost_denied' &&
          !['vector', 'vectorHash', 'usage', 'completedAt'].some(field => field in row)) {
          tx.set(ref, { status: 'processing' }, { merge: true });
          return null; // The next call must pass the budget guard again.
        }
        if (row.status !== 'complete') throw new Error('liv_embedding_requires_reconciliation');
        return row;
      }
      tx.create(ref, { status: 'processing', inputHash, model: request.model, dimensions: request.dimensions,
        createdAt: new Date().toISOString() });
      return null;
    });
    if (saved) {
      if (!validVector(saved.vector) || saved.vectorHash !== hash(JSON.stringify(saved.vector))) throw new Error('liv_embedding_cache_invalid');
      return saved.vector;
    }
    const client = getOpenAIClient();
    if (!client) throw new Error('liv_embedding_model_unavailable');
    // Budget hook belongs at this cache miss, not at every comparison.
    const response = await withLivCostStage('embedding', () =>
      client.embeddings.create(request, { timeout: 30_000, maxRetries: 0 })).catch(async error => {
      const refusal = getLivCostPretransportError(error);
      if (refusal) await ref.set({ status: 'not_started',
        notStartedReason: ['liv_cost_monthly_budget_exceeded', 'liv_cost_call_limit_exceeded',
          'liv_cost_policy_missing_or_expired'].includes(refusal.code) ? 'cost_denied' : 'pretransport_refused',
        notStartedAt: new Date().toISOString() }, { merge: true });
      // Never infer non-payment from a message or clear an ambiguous attempt.
      throw error;
    });
    const vector = response.data[0]?.embedding || [];
    await ref.set(JSON.parse(JSON.stringify({ status: 'complete', vector, vectorHash: hash(JSON.stringify(vector)),
      usage: response.usage || null, model: response.model, completedAt: new Date().toISOString() })), { merge: true });
    if (!validVector(vector)) throw new Error('liv_embedding_invalid');
    return vector;
  })();
  pending.set(key, operation);
  return operation.then(vector => [...vector]).finally(() => pending.delete(key));
}
