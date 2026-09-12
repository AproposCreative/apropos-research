import { getOpenAIClient, models } from '@/lib/openai';
import { durableReviewModel } from './durable-model';
import { firestoreModelStageStore } from './model-store';
import type { ReviewModelCall } from './review';

/** Uses the application's existing authenticated server client, never browser credentials. */
export function productionReviewModel(jobId: string): ReviewModelCall {
  const client = getOpenAIClient();
  if (!client) throw new Error('seo_openai_auth_missing');
  const model = models.default;
  return durableReviewModel({
    jobId, model, store: firestoreModelStageStore(),
    call: async request => {
      const response = await client.chat.completions.create({
        model,
        messages: [{ role: 'system', content: request.system }, { role: 'user', content: request.input }],
        response_format: { type: 'json_object' },
        max_completion_tokens: 4000,
      }, { timeout: 90_000, maxRetries: 0 });
      const choice = response.choices[0];
      if (!choice || choice.message.refusal || choice.finish_reason !== 'stop') {
        throw new Error('seo_model_response_incomplete');
      }
      if (!choice.message.content?.trim()) throw new Error('seo_model_response_empty');
      return choice.message.content;
    },
  });
}
