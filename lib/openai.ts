import OpenAI from 'openai';
import { config } from '@/lib/config/env';

let _client: OpenAI | null = null;

/**
 * Singleton OpenAI client. Returns null when OPENAI_API_KEY is not set,
 * allowing callers to handle the missing-key case explicitly.
 */
export function getOpenAIClient(): OpenAI | null {
  if (!config.openai.apiKey) return null;
  if (!_client) {
    _client = new OpenAI({ apiKey: config.openai.apiKey });
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
