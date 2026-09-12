/** Official list prices checked 2026-09-12. Not an invoice or an FX quote.
 * https://developers.openai.com/api/docs/pricing
 * https://developers.openai.com/api/docs/models/gpt-image-1.5
 * Highest standard long-context/cache-write rate is used; no cache discounts assumed.
 */
export const LIV_PRICE_VERSION = 'openai-standard-2026-09-12';
/** Review reminder, NOT a self-expiring authorization or a promise of future prices. */
export const LIV_PRICE_REVIEW_AFTER = '2026-10-12T00:00:00.000Z';
export const LIV_PRICE_VALID_UNTIL = LIV_PRICE_REVIEW_AFTER; // Existing summary consumers.
const SOURCE = 'https://developers.openai.com/api/docs/pricing';
/** Operational hold for one high 1536x1024 image, not a provider-enforced token
 * cap. The docs' 6208-token/$0.20 table is not a safe hold for our observed
 * 6544–6630 output-token receipts. Reserve 8192 at the unchanged $32/M rate;
 * settle to actual usage, retaining breach protection above this allowance.
 * https://developers.openai.com/api/docs/guides/image-generation#cost-and-latency
 */
export const LIV_IMAGE_OUTPUT_TOKEN_ALLOWANCE = 8192;
const textRates: Record<string, { input: number; output: number }> = {
  'gpt-5.6-sol': { input: 10, output: 30 },
  'gpt-5.6-terra': { input: 5, output: 18 },
  'gpt-5.6-luna': { input: 0.5, output: 1.8 },
};
export type LivPriceQuote = {
  model: string; endpoint: string; version: string; source: string;
  inputTokenBound: number; outputTokenBound: number; toolCallBound: number;
  inputUsdPerMillion: number; outputUsdPerMillion: number; fixedUsdBound: number;
  reservedUsdMicros: number; kind: 'text' | 'image' | 'embedding';
};
const integer = (value: unknown, max: number): value is number => Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= max;
export function quoteLivOpenAIRequest(endpoint: string, value: unknown): LivPriceQuote {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('liv_cost_request_unbounded');
  const body = value as Record<string, unknown>;
  const model = typeof body.model === 'string' ? body.model : '';
  const serialized = JSON.stringify(body);
  if (Buffer.byteLength(serialized) > 4_000_000 || body.stream || body.background || body.previous_response_id || body.conversation ||
    body.audio || body.modalities || body.prediction || body.prompt || body.prompt_cache_retention ||
    (body.service_tier && body.service_tier !== 'default')) throw new Error('liv_cost_request_unbounded');
  const common = { model, endpoint, version: LIV_PRICE_VERSION, source: SOURCE };
  if (endpoint === '/embeddings' && model === 'text-embedding-3-small') {
    const inputs = Array.isArray(body.input) ? body.input : [body.input];
    if (!inputs.length || inputs.length > 100 || inputs.some(x => typeof x !== 'string' || !x.length) ||
      Object.keys(body).some(key => !['model', 'input', 'encoding_format', 'dimensions', 'user'].includes(key))) {
      throw new Error('liv_cost_request_unbounded');
    }
    const input = Buffer.byteLength(serialized) + 1024;
    return { ...common, source: 'https://developers.openai.com/api/docs/models/text-embedding-3-small',
      kind: 'embedding', inputTokenBound: input, outputTokenBound: 0, toolCallBound: 0,
      inputUsdPerMillion: 0.02, outputUsdPerMillion: 0, fixedUsdBound: 0,
      reservedUsdMicros: Math.ceil(input * 0.02) };
  }
  const rates = textRates[model];
  if (!rates) throw new Error('liv_cost_pricing_unknown');
  if (!['/chat/completions', '/responses'].includes(endpoint)) throw new Error('liv_cost_endpoint_uncovered');
  const allowed = endpoint === '/responses'
    ? ['model', 'input', 'instructions', 'max_output_tokens', 'tools', 'max_tool_calls', 'reasoning', 'include', 'tool_choice', 'store', 'text', 'service_tier', 'metadata']
    : ['model', 'messages', 'max_completion_tokens', 'max_tokens', 'reasoning_effort', 'response_format', 'temperature', 'top_p', 'n', 'stop', 'store', 'service_tier', 'metadata'];
  if (Object.keys(body).some(key => !allowed.includes(key))) throw new Error('liv_cost_request_unbounded');
  if (endpoint === '/responses') {
    if (typeof body.input !== 'string' || !body.input.length || (body.instructions !== undefined && typeof body.instructions !== 'string')) {
      throw new Error('liv_cost_input_unbounded');
    }
  } else if (!Array.isArray(body.messages) || !body.messages.length || body.messages.some(message => {
    if (!message || typeof message !== 'object' || message.audio || message.tool_calls || message.function_call) return true;
    if (typeof message.content === 'string') return false;
    return !Array.isArray(message.content) || message.content.some((part: { type?: unknown; text?: unknown; image_url?: { url?: unknown } }) =>
      !part || !(part.type === 'text' && typeof part.text === 'string') &&
      !(part.type === 'image_url' && typeof part.image_url?.url === 'string'));
  })) throw new Error('liv_cost_input_unbounded');
  if (body.n !== undefined && body.n !== 1) throw new Error('liv_cost_request_unbounded');
  const output = endpoint === '/responses' ? body.max_output_tokens : body.max_completion_tokens ?? body.max_tokens;
  if (!integer(output, 128_000)) throw new Error('liv_cost_output_unbounded');
  const tools = body.tools ?? [];
  if (!Array.isArray(tools) || tools.length > 1 || tools.some(tool => !tool || tool.type !== 'web_search' ||
    Object.keys(tool).some(key => !['type', 'search_context_size', 'filters', 'user_location', 'external_web_access'].includes(key))) ||
    (tools.length && endpoint !== '/responses')) throw new Error('liv_cost_tools_unbounded');
  const toolCalls = tools.length ? body.max_tool_calls : 0;
  if (tools.length && !integer(toolCalls, 2)) throw new Error('liv_cost_tools_unbounded');
  // Image URLs/base64 are transport bytes, not text tokens. GPT-5.6 high detail
  // has 2,500 patches * 1.2 tokens (+1 documented rounding allowance).
  // https://developers.openai.com/api/docs/guides/images-vision
  let imageTokens = 0;
  const textOnly = JSON.stringify(body, (key, value) => {
    if (key !== 'image_url') return value;
    if (!value || !['high', 'low'].includes(value.detail)) throw new Error('liv_cost_image_detail_unbounded');
    imageTokens += value.detail === 'low' ? 309 : 3001;
    return { detail: value.detail };
  });
  const promptBound = Buffer.byteLength(textOnly) + 1024 + imageTokens;
  // Responses search context is limited to 128k. This is a temporary hold, NOT
  // recorded consumption. Successful calls settle to provider usage below.
  // https://developers.openai.com/api/docs/guides/tools-web-search
  const input = tools.length ? (Math.max(promptBound, 128_000) + Number(output)) * (Number(toolCalls) + 1) : promptBound;
  const outputBound = Number(output) * (Number(toolCalls) + 1);
  const fixed = Number(toolCalls) * 0.01;
  return { ...common, kind: 'text', inputTokenBound: input, outputTokenBound: outputBound, toolCallBound: Number(toolCalls),
    inputUsdPerMillion: rates.input, outputUsdPerMillion: rates.output, fixedUsdBound: fixed,
    reservedUsdMicros: Math.ceil(input * rates.input + outputBound * rates.output + fixed * 1_000_000) };
}

export function quoteLivImageRequest(endpoint: string, value: unknown): LivPriceQuote {
  const body = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (endpoint !== '/images/generations' || body.model !== 'gpt-image-1.5') throw new Error('liv_cost_pricing_unknown');
  if (typeof body.prompt !== 'string' || !body.prompt.trim() || Buffer.byteLength(body.prompt) > 32_000 ||
    (body.n !== undefined && body.n !== 1) || body.size !== '1536x1024' || body.quality !== 'high' ||
    body.stream || body.partial_images || body.image) throw new Error('liv_cost_image_unbounded');
  if (Object.keys(body).some(key => !['model', 'prompt', 'n', 'size', 'quality', 'output_format', 'output_compression', 'background', 'moderation', 'user'].includes(key))) {
    throw new Error('liv_cost_image_unbounded');
  }
  const input = Buffer.byteLength(body.prompt) + 1024;
  return { model: 'gpt-image-1.5', endpoint, version: LIV_PRICE_VERSION,
    source: 'https://developers.openai.com/api/docs/models/gpt-image-1.5', kind: 'image',
    inputTokenBound: input, outputTokenBound: LIV_IMAGE_OUTPUT_TOKEN_ALLOWANCE, toolCallBound: 0,
    inputUsdPerMillion: 5, outputUsdPerMillion: 32, fixedUsdBound: 0,
    reservedUsdMicros: Math.ceil(input * 5 + LIV_IMAGE_OUTPUT_TOKEN_ALLOWANCE * 32) };
}

export type LivProviderUsage = { inputTokens: number; outputTokens: number; cachedInputTokens: number | null;
  reasoningTokens: number | null; toolCalls: number | null };
export function readLivProviderUsage(value: unknown, endpoint: string): LivProviderUsage | null {
  if (!value || typeof value !== 'object') return null;
  const response = value as Record<string, unknown>;
  const usage = response.usage as Record<string, unknown> | undefined;
  if (!usage) return null;
  const input = usage.input_tokens ?? usage.prompt_tokens;
  const output = endpoint === '/embeddings' ? 0 : usage.output_tokens ?? usage.completion_tokens;
  if (!Number.isSafeInteger(input) || Number(input) <= 0 || !Number.isSafeInteger(output) || Number(output) < 0) return null;
  const inputDetails = (usage.input_tokens_details ?? usage.prompt_tokens_details) as Record<string, unknown> | undefined;
  const outputDetails = (usage.output_tokens_details ?? usage.completion_tokens_details) as Record<string, unknown> | undefined;
  const optional = (x: unknown) => Number.isSafeInteger(x) && Number(x) >= 0 ? Number(x) : null;
  return { inputTokens: Number(input), outputTokens: Number(output), cachedInputTokens: optional(inputDetails?.cached_tokens),
    reasoningTokens: optional(outputDetails?.reasoning_tokens), toolCalls: endpoint === '/responses'
      ? Array.isArray(response.output) ? response.output.filter(x => x?.type === 'web_search_call').length : null : 0 };
}
/** Provider-reported aggregate input/output usage, priced conservatively; never an invoice.
 * Missing tool-count evidence retains the bounded fee, not the entire context allowance.
 */
export function usageUsdUpperBound(quote: LivPriceQuote, usage: LivProviderUsage): number | null {
  const calls = quote.toolCallBound ? usage.toolCalls ?? quote.toolCallBound : 0;
  return Math.ceil(usage.inputTokens * quote.inputUsdPerMillion + usage.outputTokens * quote.outputUsdPerMillion + calls * 10_000);
}
