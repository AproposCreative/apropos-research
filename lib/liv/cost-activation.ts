import { createHash } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import { config } from '@/lib/config/env';
import { livModels } from './model-config';
import { LIV_COST_COLLECTION, validateLivCostPolicy, type LivBudgetPolicy } from './cost-ledger';
import { quoteLivOpenAIRequest } from './cost-pricing';

/** Representative current text paths, after the SDK's standard-tier/tool bound
 * normalization. No provider calls. This is a configuration/quote preflight,
 * not a model availability probe or proof of all possible runtime inputs.
 */
export function inspectSharedCostActivation() {
  const chat = (model: string, max: number) => ({ model, service_tier: 'default', max_completion_tokens: max,
    messages: [{ role: 'user', content: 'Activation quote check' }] });
  const requests = [
    { stage: 'writer-generation', endpoint: '/chat/completions', body: chat(config.openai.model, 10000) },
    { stage: 'writer-research', endpoint: '/responses', body: { model: config.openai.researchModel,
      input: 'Activation source lookup quote check', tools: [{ type: 'web_search', search_context_size: 'low' }],
      reasoning: { effort: 'low' }, tool_choice: 'required', include: ['web_search_call.action.sources'],
      store: false, max_output_tokens: 3000, max_tool_calls: 1, service_tier: 'default' } },
    { stage: 'seo-engine', endpoint: '/chat/completions', body: { ...chat(config.openai.model, 4000),
      response_format: { type: 'json_object' }, temperature: 0.2 } },
    { stage: 'seo-legacy-meta', endpoint: '/chat/completions', body: { ...chat('gpt-4o-mini', 2000), response_format: { type: 'json_object' } } },
    ...Object.entries(livModels()).map(([stage, model]) => ({ stage: `liv-${stage}`,
      endpoint: '/chat/completions', body: chat(model, 4000) })),
  ];
  const checks = requests.map(({ stage, endpoint, body }) => {
    try { return { stage, supported: true as const, quote: quoteLivOpenAIRequest(endpoint, body) }; }
    catch (error) { return { stage, supported: false as const,
      code: error instanceof Error && /^liv_cost_[a-z_]+$/.test(error.message) ? error.message : 'liv_cost_preflight_failed' }; }
  });
  return { ready: checks.every(check => check.supported), checks,
    limitations: ['representative_text_requests_only', 'model_access_not_probed', 'unscoped_calls_not_covered'] };
}

/** Privileged, explicitly invoked setup only; never called by request handlers.
 * Main loads EXISTING production credentials, checks exact deployment SHA and
 * current policy, then supplies that reviewed policy as a compare-and-set.
 * Run before AI_SHARED_COST_ENABLED=true. Does NOT set the flag, create a base
 * FX policy, reset totals, import historical costs or change pricing assumptions.
 * Retries preserve the original sharedTrackingStartedAt and immutable receipt.
 */
export async function activateSharedCostPolicy(input: { deploymentSha: string; expectedPolicy: LivBudgetPolicy }, now = new Date()) {
  if (!/^[a-f0-9]{40}$/.test(input.deploymentSha) || !Number.isFinite(now.getTime())) throw new Error('liv_cost_activation_invalid');
  const expected = validateLivCostPolicy(input.expectedPolicy);
  const preflight = inspectSharedCostActivation();
  if (!preflight.ready) throw new Error('liv_cost_activation_unpriced');
  const database = getAdminDb();
  if (!database) throw new Error('liv_cost_store_unavailable');
  const fingerprint = createHash('sha256').update(JSON.stringify({ expected, checks: preflight.checks })).digest('hex');
  const collection = database.collection(LIV_COST_COLLECTION);
  const policyRef = collection.doc('policy');
  const receiptRef = collection.doc(`shared-activation-${input.deploymentSha}`);
  return database.runTransaction(async tx => {
    const policy = (await tx.get(policyRef)).data();
    const receipt = (await tx.get(receiptRef)).data();
    if (JSON.stringify(validateLivCostPolicy(policy)) !== JSON.stringify(expected)) throw new Error('liv_cost_activation_policy_changed');
    if (receipt && receipt.fingerprint !== fingerprint) throw new Error('liv_cost_activation_conflict');
    const started = policy?.sharedTrackingStartedAt ?? now.toISOString();
    if (typeof started !== 'string' || !Number.isFinite(Date.parse(started)) || Date.parse(started) > now.getTime()) {
      throw new Error('liv_cost_activation_invalid');
    }
    if (!receipt) tx.create(receiptRef, { deploymentSha: input.deploymentSha, fingerprint, recordedAt: now.toISOString(),
      sharedTrackingStartedAt: started, policy: expected, checks: preflight.checks, historicalCostsImported: false });
    tx.set(policyRef, { sharedScopesEnabled: true, sharedTrackingStartedAt: started }, { merge: true });
    return { sharedScopesEnabled: true, sharedTrackingStartedAt: started, deploymentSha: input.deploymentSha,
      receiptId: receiptRef.id, flagChanged: false, historicalCostsImported: false };
  });
}
