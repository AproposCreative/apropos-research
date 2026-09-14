import { getAdminDb } from '@/lib/firebase-admin';
import { validateLivCostPolicy } from '@/lib/liv/cost-ledger';
import { IMAGE_GEN_LEDGER } from './budget';
import { imageGenHash } from './article';
import { readImageGenStyleConfig } from './style-config';

export async function imageGenQuotes() {
  const db = getAdminDb(); if (!db) throw new Error('image_gen_budget_unavailable');
  const policy = validateLivCostPolicy((await db.collection(IMAGE_GEN_LEDGER).doc('policy').get()).data());
  const styleConfig = await readImageGenStyleConfig();
  if (policy.monthlyLimitDkkMicros > 150_000_000) throw new Error('image_gen_budget_invalid');
  // Conservative operational ceilings for the fixed v1 calls, not invoices.
  // Image: <=12k prompt bytes, <=2 bounded references, <=8192 output allowance.
  // Ideas: one bounded text call plus one bounded web search. No paid QA loop.
  const ceilingUsd = { ideas: 0.30, generate: 1, edit: 1 };
  return Object.fromEntries(Object.entries(ceilingUsd).map(([operation, usd]) => [operation, {
    id: imageGenHash(JSON.stringify([operation, usd, policy, styleConfig.version])),
    estimateUpToDkk: Math.ceil(usd * policy.usdToDkkCeiling * 100) / 100,
    kind: 'operational-estimate-not-invoice',
  }])) as Record<'ideas' | 'generate' | 'edit', { id: string; estimateUpToDkk: number; kind: string }>;
}
