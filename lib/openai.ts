import type OpenAI from 'openai';
import { config } from '@/lib/config/env';
import { LivBudgetOpenAI } from '@/lib/liv/cost-openai';
import { createImageGenCostLedger } from '@/lib/image-gen/budget';

let _client: OpenAI | null = null;
let _imageClient: OpenAI | null = null;

/** Dedicated ledger; the ordinary client rejects image-gen context instead of charging Liv. */
export function getImageGenOpenAIClient(): OpenAI | null {
  if (!config.openai.apiKey) return null;
  return _imageClient ??= new LivBudgetOpenAI({ apiKey: config.openai.apiKey, maxRetries: 0 }, createImageGenCostLedger());
}

/**
 * Singleton OpenAI client. Returns null when OPENAI_API_KEY is not set,
 * allowing callers to handle the missing-key case explicitly.
 * Cost coverage is server ALS only (Liv plus opt-in Writer/SEO boundaries).
 * With shared accounting enabled, missing ALS is rejected before transport.
 * This is not an account-wide budget or invoice. See withSharedCostContext.
 */
export function getOpenAIClient(): OpenAI | null {
  if (!config.openai.apiKey) return null;
  if (!_client) {
    _client = new LivBudgetOpenAI({ apiKey: config.openai.apiKey });
  }
  return _client;
}

/**
 * Convenience re-export of the configured model names so callers don't
 * need to import `config` separately for everyday usage.
 */
export const models = {
  get default() {
    return config.openai.model;
  },
  get research() {
    return config.openai.researchModel;
  },
  /** Accreditation structured/fast tasks */
  get accreditationFast() {
    return config.openai.accreditationFastModel;
  },
  /** Accreditation dialogue/agent tasks — prefer gpt-5.1 in production */
  get accreditationAgent() {
    return config.openai.accreditationAgentModel;
  },
} as const;
