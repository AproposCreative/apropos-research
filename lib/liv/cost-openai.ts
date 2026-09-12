import OpenAI from 'openai';
import type { ClientOptions } from 'openai';
import type { APIPromise } from 'openai/core/api-promise';
import { createHash, randomUUID } from 'node:crypto';
import { currentLivCostContext } from './cost-context';
import { createLivCostLedger, type LivCostLedger, type LivCostOutcome } from './cost-ledger';
import { quoteLivImageRequest, quoteLivOpenAIRequest, readLivProviderUsage } from './cost-pricing';
import { LivCostPretransportError } from './cost-errors';
type FinalRequestOptions = Awaited<Parameters<OpenAI['request']>[0]>;
const guardedTransports = new WeakSet<typeof fetch>();

/** Fetch boundary also covers module-level cached SDK resources created outside ALS. */
export function livBudgetFetch(transport: typeof fetch, ledger: LivCostLedger = createLivCostLedger()): typeof fetch {
  if (guardedTransports.has(transport)) return transport;
  const guarded: typeof fetch = async (input, init) => {
    const context = currentLivCostContext();
    if (!context) return transport(input, init);
    if (context.blocked) throw new Error('liv_cost_context_blocked');
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.origin !== 'https://api.openai.com' || url.search || url.hash || url.username || url.password ||
      init?.method?.toUpperCase() !== 'POST' || typeof init.body !== 'string') throw new LivCostPretransportError('liv_cost_transport_uncovered');
    const endpoint = url.pathname.replace(/^\/v1(?=\/)/, '');
    let body: unknown;
    try { body = JSON.parse(init.body); } catch { throw new LivCostPretransportError('liv_cost_request_unbounded'); }
    let quote;
    try { quote = endpoint === '/images/generations' ? quoteLivImageRequest(endpoint, body) : quoteLivOpenAIRequest(endpoint, body); }
    catch (error) {
      // Local synchronous validation only, before reservation or provider transport.
      if (error instanceof Error && /^liv_cost_[a-z_]+$/.test(error.message)) throw new LivCostPretransportError(error.message);
      throw error;
    }
    const reservation = await ledger.reserve({ callId: randomUUID(), context, quote,
      requestHash: createHash('sha256').update(`${endpoint}\n${init.body}`).digest('hex') });
    let response: Response;
    try { response = await transport(input, { ...init, redirect: 'error' }); }
    catch (error) {
      try { await ledger.complete(reservation, { status: 'ambiguous', usage: null, providerRequestId: null, responseModel: null, httpStatus: null }); }
      catch { context.blocked = true; }
      throw error;
    }
    let parsed: unknown = null;
    try {
      // Liv calls are non-streaming. Do not consume the caller's response/body.
      if (response.headers.get('content-type')?.includes('application/json')) parsed = await response.clone().json();
    } catch { /* Missing/unreadable usage retains the full reservation, never zero. */ }
    const row = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
    const requestId = response.headers.get('x-request-id');
    const outcome: LivCostOutcome = { status: response.ok ? 'response' : 'ambiguous',
      usage: readLivProviderUsage(parsed, endpoint), httpStatus: response.status,
      providerRequestId: requestId && /^[a-z0-9_-]{1,150}$/i.test(requestId) ? requestId : null,
      responseModel: typeof row.model === 'string' && /^[a-z0-9.-]{1,100}$/i.test(row.model) ? row.model : null };
    try { await ledger.complete(reservation, outcome); }
    catch {
      // Preserve the paid response for the existing text/image checkpoint writer.
      // The durable pre-call reservation remains; no further calls in this run.
      context.blocked = true;
    }
    return response;
  };
  guardedTransports.add(guarded);
  return guarded;
}

/** Outside Liv ALS, request options and SDK retry behavior remain unchanged. */
export class LivBudgetOpenAI extends OpenAI {
  constructor(options: ClientOptions, ledger?: LivCostLedger) {
    super({ ...options, fetch: livBudgetFetch(options.fetch || globalThis.fetch.bind(globalThis), ledger) });
  }
  override request<T>(options: FinalRequestOptions | Promise<FinalRequestOptions>, remainingRetries: number | null = null): APIPromise<T> {
    if (!currentLivCostContext()) return super.request<T>(options, remainingRetries);
    const bounded = Promise.resolve(options).then(value => {
      const body = value.body && typeof value.body === 'object' && !Array.isArray(value.body)
        ? value.body as Record<string, unknown> : null;
      if (value.stream || body?.stream || body?.background) throw new LivCostPretransportError('liv_cost_streaming_uncovered');
      const text = ['/chat/completions', '/responses'].includes(value.path);
      const messages = value.path === '/chat/completions' && Array.isArray(body?.messages)
        ? body.messages.map(message => !message || !Array.isArray(message.content) ? message : { ...message,
          content: message.content.map((part: { type?: string; image_url?: { url?: string; detail?: string } }) =>
            part?.type !== 'image_url' || !part.image_url ? part : { ...part, image_url: { ...part.image_url,
              // Preserve explicit low/high; bound automatic vision without downgrading QA to low.
              detail: !part.image_url.detail || part.image_url.detail === 'auto' ? 'high' : part.image_url.detail } }) }) : undefined;
      return { ...value, maxRetries: 0, ...(body && text ? { body: { ...body,
        ...(messages ? { messages } : {}),
        // Prevent a project-wide Fast/priority default from defeating the price bound.
        service_tier: 'default', ...(value.path === '/responses' && Array.isArray(body.tools) && body.tools.length
          ? { max_tool_calls: body.max_tool_calls ?? 1 } : {}) } } : {}) };
    });
    return super.request<T>(bounded, 0);
  }
}
