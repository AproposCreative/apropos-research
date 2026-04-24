import type { LivDailyPlan } from '@/lib/liv/daily-plan-store';

function parseEnvBool(v: string | undefined): boolean | undefined {
  if (v == null || v === '') return undefined;
  const l = v.toLowerCase();
  if (l === '0' || l === 'false' || l === 'no' || l === 'off') return false;
  if (l === '1' || l === 'true' || l === 'yes' || l === 'on') return true;
  return undefined;
}

/**
 * Sammenfletter redaktionens dagsplan (Firestore) med valgfri
 * LIV_DAILY_DEFAULT_* env (til fx et stående sommer-haletil emne), som kun
 * gælder når planen ikke allerede har et emne.
 */
export function resolveLivTopicInputsFromPlan(plan: LivDailyPlan | null): {
  topicHint: string | undefined;
  mustUseTrending: boolean;
} {
  const envHint = (process.env.LIV_DAILY_DEFAULT_TOPIC_HINT || '').trim() || undefined;
  const planHint = plan?.topicHint?.trim() || undefined;
  const topicHint = planHint || envHint || undefined;

  const planMust = plan ? plan.mustUseTrending !== false : undefined;
  const envMust = parseEnvBool(process.env.LIV_DAILY_DEFAULT_MUST_USE_TRENDING);

  let mustUseTrending: boolean;
  if (planHint) {
    mustUseTrending = planMust !== false;
  } else if (topicHint) {
    mustUseTrending = envMust !== undefined ? envMust : false;
  } else {
    mustUseTrending = plan ? planMust !== false : true;
  }

  return { topicHint, mustUseTrending };
}
