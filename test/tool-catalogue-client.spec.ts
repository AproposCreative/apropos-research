import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { toolCatalogueQuery, TOOL_CATALOGUE_TIMEOUT_MS } from '@/lib/tool-catalogue-client';
import { describeTools } from '@/lib/tool-availability';

const clients: QueryClient[] = [];
function client() { const value = new QueryClient(); clients.push(value); return value; }
const account = (uid = 'owner') => ({ uid, getIdToken: vi.fn(async () => 'fixture-not-real') });
const catalogue = { checkedAt: '2026-10-13T12:00:00Z', tools: describeTools({ paidAiBlocked: true, accreditationPaused: true, inboxAutoRespond: false }, { owner: true }) };
afterEach(() => { clients.splice(0).forEach(c => c.clear()); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('shared startup/tool catalogue', () => {
  it('deduplicates startup + menu and reuses the result when the menu mounts', async () => {
    const read = vi.fn(async () => Response.json(catalogue));
    vi.stubGlobal('fetch', read);
    const q = client(), user = account(), options = toolCatalogueQuery(user, true);
    const [a, b] = await Promise.all([q.fetchQuery(options), q.fetchQuery(options)]);
    expect(a).toEqual(b);
    expect(await q.fetchQuery(options)).toEqual(catalogue);
    expect(read).toHaveBeenCalledTimes(1);
    expect(user.getIdToken).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0][0]).toBe('/api/editorial/tools');
    expect(read.mock.calls[0][1]).toMatchObject({ cache: 'no-store', headers: { Authorization: 'Bearer fixture-not-real' } });
  });
  it('keeps account and owner capability caches separate', async () => {
    const q = client();
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(catalogue)));
    await q.fetchQuery(toolCatalogueQuery(account('owner'), true));
    expect(q.getQueryData(toolCatalogueQuery(account('staff'), false).queryKey)).toBeUndefined();
    expect(q.getQueryData(toolCatalogueQuery(account('owner'), false).queryKey)).toBeUndefined();
  });
  it.each([401, 503])('does not cache a %i as a healthy catalogue or retry', async status => {
    const read = vi.fn(async () => Response.json({}, { status }));
    vi.stubGlobal('fetch', read);
    const q = client(), options = toolCatalogueQuery(account(), true);
    await expect(q.fetchQuery(options)).rejects.toThrow('tools_unavailable');
    expect(q.getQueryData(options.queryKey)).toBeUndefined();
    expect(read).toHaveBeenCalledTimes(1);
    expect(options.retryOnMount).toBe(false);
  });
  it('rejects a malformed catalogue rather than marking it ready', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ tools: 'not-an-array' })));
    await expect(client().fetchQuery(toolCatalogueQuery(account(), true))).rejects.toThrow('tools_invalid');
  });
  it('bounds stalled token retrieval; late resolution cannot send a request', async () => {
    vi.useFakeTimers();
    const read = vi.fn(); vi.stubGlobal('fetch', read);
    let resolve!: (token: string) => void;
    const user = { uid: 'slow', getIdToken: () => new Promise<string>(r => { resolve = r; }) };
    const request = client().fetchQuery(toolCatalogueQuery(user, true));
    const rejection = expect(request).rejects.toThrow('tools_timeout');
    await vi.advanceTimersByTimeAsync(TOOL_CATALOGUE_TIMEOUT_MS);
    await rejection;
    resolve('fixture-not-real'); await Promise.resolve();
    expect(read).not.toHaveBeenCalled();
  });
  it('aborts a stalled HTTP request without a second request', async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal;
    const read = vi.fn(async (_url, options) => { requestSignal = options.signal; return await new Promise<Response>(() => {}); });
    vi.stubGlobal('fetch', read);
    const request = client().fetchQuery(toolCatalogueQuery(account(), true));
    const rejection = expect(request).rejects.toThrow('tools_timeout');
    await vi.advanceTimersByTimeAsync(TOOL_CATALOGUE_TIMEOUT_MS);
    await rejection;
    expect(requestSignal!.aborted).toBe(true);
    expect(read).toHaveBeenCalledTimes(1);
  });
});
