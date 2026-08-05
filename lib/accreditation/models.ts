/**
 * Accreditation model routing.
 *
 * FAST lane — intake classification, URL extraction, attachment metadata,
 *             deterministic structured JSON tasks.
 * AGENT lane — external dialogue, ambiguous reasoning, follow-ups,
 *              form decisions, final delivery, studio chat.
 *
 * Production recommendation for AGENT: gpt-5.1 (or the strongest verified
 * GPT-5-class model available on the OpenAI account). Override via
 * OPENAI_ACCREDITATION_AGENT_MODEL. Default falls back to OPENAI_RESEARCH_MODEL
 * then OPENAI_MODEL.
 */
import { env } from '@/lib/config/env';
import type { LivModelLane, LivPromptTask } from '@/lib/accreditation/liv-system-prompt';
import { LIV_TASK_LANE } from '@/lib/accreditation/liv-system-prompt';

/** Documented production default when env is unset — may be overridden per account. */
export const ACCREDITATION_AGENT_MODEL_RECOMMENDATION = 'gpt-5.1';

export function getAccreditationFastModel(): string {
  return (
    (env.OPENAI_ACCREDITATION_FAST_MODEL || process.env.OPENAI_ACCREDITATION_FAST_MODEL || '').trim() ||
    (env.OPENAI_MODEL || process.env.OPENAI_MODEL || '').trim() ||
    'gpt-5.4-mini'
  );
}

export function getAccreditationAgentModel(): string {
  return (
    (env.OPENAI_ACCREDITATION_AGENT_MODEL || process.env.OPENAI_ACCREDITATION_AGENT_MODEL || '').trim() ||
    (env.OPENAI_RESEARCH_MODEL || process.env.OPENAI_RESEARCH_MODEL || '').trim() ||
    (env.OPENAI_MODEL || process.env.OPENAI_MODEL || '').trim() ||
    ACCREDITATION_AGENT_MODEL_RECOMMENDATION
  );
}

export function resolveAccreditationModel(lane: LivModelLane): string {
  return lane === 'agent' ? getAccreditationAgentModel() : getAccreditationFastModel();
}

export function resolveAccreditationModelForTask(task: LivPromptTask): string {
  return resolveAccreditationModel(LIV_TASK_LANE[task]);
}

export function accreditationModelPublicConfig(): {
  fast: string;
  agent: string;
  agentRecommendation: string;
} {
  return {
    fast: getAccreditationFastModel(),
    agent: getAccreditationAgentModel(),
    agentRecommendation: ACCREDITATION_AGENT_MODEL_RECOMMENDATION,
  };
}
