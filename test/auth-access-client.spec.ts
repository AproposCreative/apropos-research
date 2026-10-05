import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACCESS_MESSAGE, ACCESS_TIMEOUT_MESSAGE, ACCESS_UNAVAILABLE_MESSAGE, AUTH_ACCESS_TIMEOUT_MS, requireAllowedUser } from '../lib/auth-access-client';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const user = { getIdToken: async () => 'isolated-test-token' };

describe('bounded editorial access checks', () => {
  it('accepts only the server-confirmed identity and strict owner capability', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ allowed: true, capabilities: { owner: true } }));
    vi.stubGlobal('fetch', fetcher);
    expect(await requireAllowedUser(user)).toEqual({ owner: true });
    expect(fetcher).toHaveBeenCalledWith('/api/auth/access', expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }));
    fetcher.mockResolvedValue(Response.json({ allowed: true, capabilities: { owner: 'true' } }));
    expect(await requireAllowedUser(user)).toEqual({ owner: false });
  });

  it.each([401, 403])('keeps access denied on %s', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ allowed: false }, { status })));
    await expect(requireAllowedUser(user)).rejects.toThrow(ACCESS_MESSAGE);
  });

  it('does not mistake an HTTP 200 without explicit permission for access', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ capabilities: { owner: true } })));
    await expect(requireAllowedUser(user)).rejects.toThrow(ACCESS_MESSAGE);
  });

  it.each(['network', 'server', 'invalid-json'])('reports %s failure without exposing request details', async reason => {
    const fetcher = reason === 'network' ? vi.fn().mockRejectedValue(new Error('private request details'))
      : vi.fn().mockResolvedValue(reason === 'server' ? new Response('', { status: 503 }) : new Response('not-json'));
    vi.stubGlobal('fetch', fetcher);
    await expect(requireAllowedUser(user)).rejects.toThrow(ACCESS_UNAVAILABLE_MESSAGE);
  });

  it('times out a hanging request and aborts it', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_url, init) => { signal = init.signal; return new Promise(() => {}); }));
    const result = expect(requireAllowedUser(user)).rejects.toThrow(ACCESS_TIMEOUT_MESSAGE);
    await vi.advanceTimersByTimeAsync(AUTH_ACCESS_TIMEOUT_MS);
    await result;
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds token refresh too and never starts a late network request', async () => {
    vi.useFakeTimers();
    let resolveToken!: (token: string) => void;
    const token = new Promise<string>(resolve => { resolveToken = resolve; });
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const result = expect(requireAllowedUser({ getIdToken: () => token })).rejects.toThrow(ACCESS_TIMEOUT_MESSAGE);
    await vi.advanceTimersByTimeAsync(AUTH_ACCESS_TIMEOUT_MS);
    await result;
    resolveToken('late-test-token');
    await Promise.resolve();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('clears the timeout after success', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ allowed: true })));
    expect(await requireAllowedUser(user)).toEqual({ owner: false });
    expect(vi.getTimerCount()).toBe(0);
  });
});
