import { AsyncLocalStorage } from 'node:async_hooks';
import { createHmac, timingSafeEqual } from 'node:crypto';

export type LivCostContext = { runId: string; stage: string; blocked?: boolean };
const storage = new AsyncLocalStorage<LivCostContext>();
export const LIV_COST_HEADER = 'x-liv-cost-context';
const valid = (value: string) => /^[a-zA-Z0-9_-]{1,100}$/.test(value);
export const currentLivCostContext = () => storage.getStore();

/** Establish only at an authenticated, server-owned Liv boundary, never from a request body. */
export function withLivCostContext<T>(context: Pick<LivCostContext, 'runId' | 'stage'>, run: () => T): T {
  if (!valid(context.runId) || !valid(context.stage)) throw new Error('liv_cost_context_invalid');
  return storage.run({ ...context }, run);
}
export function withLivCostStage<T>(stage: string, run: () => T): T {
  const parent = storage.getStore();
  if (!parent) return run();
  if (!valid(stage) || parent.blocked) throw new Error('liv_cost_context_blocked');
  // Share the poison flag across parallel stages if persistence fails after transport.
  return storage.run({ runId: parent.runId, stage,
    get blocked() { return parent.blocked; }, set blocked(value) { parent.blocked = value; } }, run);
}

function signingKey() {
  const key = process.env.INTERNAL_API_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  if (!key || key.length < 32) throw new Error('liv_cost_context_secret_unavailable');
  return key;
}
function equal(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
/** Add to internalApiHeaders(...) for this exact path; contains no credentials. */
export function livCostHeaders(path: string, now = Date.now()): Record<string, string> {
  const context = storage.getStore();
  if (!context) return {};
  if (context.blocked || !/^\/api\/[a-z0-9/-]+$/i.test(path)) throw new Error('liv_cost_context_blocked');
  const payload = Buffer.from(JSON.stringify({ v: 1, runId: context.runId, path, issuedAt: now, expiresAt: now + 300_000 })).toString('base64url');
  return { [LIV_COST_HEADER]: `${payload}.${createHmac('sha256', signingKey()).update(payload).digest('base64url')}` };
}
/** Missing header preserves unrelated manual requests. A present invalid header never downgrades to manual. */
export function withLivCostRequest<T>(request: { url: string; headers: Headers }, stage: string, run: () => T, now = Date.now()): T {
  const header = request.headers.get(LIV_COST_HEADER);
  if (header === null) return run();
  const bearer = request.headers.get('authorization')?.replace(/^Bearer /, '') || '';
  const internal = process.env.INTERNAL_API_SECRET?.trim(), cron = process.env.CRON_SECRET?.trim();
  const authenticated = (internal && (equal(request.headers.get('x-internal-api-secret') || '', internal) || equal(bearer, internal))) ||
    (cron && equal(bearer, cron));
  if (!authenticated || header.length > 1500) throw new Error('liv_cost_context_unauthorized');
  const [payload, signature, extra] = header.split('.');
  const expected = createHmac('sha256', signingKey()).update(payload || '').digest('base64url');
  if (extra || !signature || !equal(signature, expected)) throw new Error('liv_cost_context_unauthorized');
  let data: { v?: unknown; runId?: unknown; path?: unknown; issuedAt?: unknown; expiresAt?: unknown };
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); }
  catch { throw new Error('liv_cost_context_invalid'); }
  if (!data || data.v !== 1 || typeof data.runId !== 'string' || data.path !== new URL(request.url).pathname ||
    typeof data.issuedAt !== 'number' || typeof data.expiresAt !== 'number' || !Number.isSafeInteger(data.issuedAt) ||
    !Number.isSafeInteger(data.expiresAt) || data.issuedAt > now || data.expiresAt <= now ||
    data.expiresAt - data.issuedAt !== 300_000) throw new Error('liv_cost_context_invalid');
  return withLivCostContext({ runId: data.runId, stage }, run);
}
