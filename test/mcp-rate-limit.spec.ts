import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { memoryFirestore } from './helpers/mcp-firestore';
const fake = vi.hoisted(() => ({ db: null as any }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => fake.db, getAdminAuth: () => null }));
import { OAuthRateLimitError, oauthRateLimit } from '@/lib/mcp/oauth';
import { limitMcpToolCall, limitMcpTransport, MCP_TOOL_CALLS_PER_HOUR, MCP_TRANSPORT_REQUESTS_PER_HOUR } from '@/lib/mcp/rate-limit';

const memory = memoryFirestore();
beforeEach(() => {
  memory.clear(); fake.db = memory.db; vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-27T20:26:32.685Z'));
});
afterEach(() => vi.useRealTimers());

it('allows a full book workflow without spending tool quota on stateless transport', async () => {
  for (let i = 0; i < 80; i++) {
    for (let request = 0; request < 4; request++) await limitMcpTransport('owner');
    await limitMcpToolCall('owner');
  }
  const counts = [...memory.rows.values()].map(r => r.count).sort((a, b) => a - b);
  expect(counts).toEqual([80, 320]);
});

it('enforces the same 240 logical calls atomically, without another allowance on reconnect', async () => {
  const result = await Promise.allSettled(Array.from({ length: MCP_TOOL_CALLS_PER_HOUR + 5 }, () => limitMcpToolCall('owner')));
  expect(result.filter(r => r.status === 'fulfilled')).toHaveLength(240);
  const rejected = result.find(r => r.status === 'rejected') as PromiseRejectedResult;
  expect(rejected.reason).toBeInstanceOf(OAuthRateLimitError);
  expect(rejected.reason).toMatchObject({ code: 'rate_limited', status: 429, limit: 240,
    resetAt: Date.parse('2026-10-27T21:00:00Z'), retryAfterSeconds: 2008 });
  await expect(limitMcpToolCall('owner')).rejects.toThrow('rate_limited');
  await expect(limitMcpToolCall('different-owner')).resolves.toBeUndefined();
  expect([...memory.rows.values()].map(r => r.count)).toEqual([240, 1]);
});

it('keeps a hard transport ceiling and does not reset or erase historical buckets', async () => {
  await oauthRateLimit('tools-owner', 240);
  const result = await Promise.allSettled(Array.from({ length: MCP_TRANSPORT_REQUESTS_PER_HOUR + 1 }, () => limitMcpTransport('owner')));
  expect(result.filter(r => r.status === 'fulfilled')).toHaveLength(1200);
  expect([...memory.rows.values()].map(r => r.count)).toEqual([1, 1200]);
});

it('allows continuation at the fixed UTC boundary and preserves the previous receipt', async () => {
  vi.setSystemTime(new Date('2026-10-27T20:59:59.999Z'));
  await oauthRateLimit('boundary', 1);
  await expect(oauthRateLimit('boundary', 1)).rejects.toMatchObject({ retryAfterSeconds: 1 });
  vi.advanceTimersByTime(1);
  await expect(oauthRateLimit('boundary', 1)).resolves.toBeUndefined();
  expect([...memory.rows.values()].map(r => r.count)).toEqual([1, 1]);
});
