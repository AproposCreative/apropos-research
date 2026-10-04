import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { memoryFirestore } from './helpers/mcp-firestore';
const mock = vi.hoisted(() => ({ db: null as any, access: vi.fn() }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => mock.db }));
vi.mock('@/lib/editorial-access', () => ({ editorialRequestAccess: mock.access }));
import { readConnectionStatus } from '@/lib/mcp/connections';
import { GET } from '@/app/oauth/connections/route';

const memory = memoryFirestore(), uid = 'frederik', now = Date.parse('2026-10-04T21:00:00Z');
beforeEach(() => {
  memory.clear(); vi.clearAllMocks(); mock.db = memory.db;
  mock.access.mockResolvedValue({ uid, owner: true });
  vi.useFakeTimers(); vi.setSystemTime(now);
});
afterEach(() => vi.useRealTimers());
function grant(id = 'live', changes: Record<string, unknown> = {}) {
  memory.rows.set(`mcpGrants/${id}`, { uid, createdAt: now - 1000, expiresAt: now + 1000, revoked: false, ...changes });
}
function audit(id = 'audit', changes: Record<string, unknown> = {}) {
  memory.rows.set(`mcpAudit/${id}`, { uid, grantId: 'live', status: 'ok', tool: 'get_workspace', startedAt: new Date(now - 500).toISOString(), ...changes });
}
it('distinguishes missing authorization, a grant, and observed tool use without certifying acceptance', async () => {
  expect(await readConnectionStatus(uid)).toMatchObject({ authorization: 'none', successfulToolCallObserved: false, inventoryComplete: true, clientAcceptanceVerified: false });
  grant();
  expect(await readConnectionStatus(uid)).toMatchObject({ authorization: 'granted', successfulToolCallObserved: false, clientAcceptanceVerified: false });
  audit(); const before = JSON.stringify([...memory.rows]);
  expect(await readConnectionStatus(uid)).toEqual({ checkedAt: new Date(now).toISOString(), authorization: 'granted', observedAuthorizations: 1,
    inventoryComplete: true, successfulToolCallObserved: true, clientAcceptanceVerified: false });
  expect(JSON.stringify([...memory.rows])).toBe(before);
});
it.each([{ uid: 'casper' }, { revoked: true }, { expiresAt: now }, { createdAt: now + 1 }, { createdAt: 'yesterday' }, { expiresAt: 'later' }])('ignores another owner, revoked, expired or invalid grants: %j', async changes => {
  grant('live', changes); audit();
  expect(await readConnectionStatus(uid)).toMatchObject({ authorization: 'none', observedAuthorizations: 0, successfulToolCallObserved: false });
});
it('honors the revoke-all watermark without deleting historical records', async () => {
  grant(); audit(); memory.rows.set(`mcpRevocations/${uid}`, { revokedAt: now - 1000 });
  expect(await readConnectionStatus(uid)).toMatchObject({ authorization: 'none', successfulToolCallObserved: false });
  expect(memory.rows.size).toBe(3);
});
it.each([{ status: 'error' }, { uid: 'casper' }, { grantId: 'old' }, { startedAt: 'invalid' },
  { startedAt: new Date(now - 2000).toISOString() }, { startedAt: new Date(now + 1).toISOString() }])('does not claim success from unrelated or invalid audit evidence: %j', async changes => {
  grant(); audit('audit', changes);
  expect(await readConnectionStatus(uid)).toMatchObject({ authorization: 'granted', successfulToolCallObserved: false });
});
it('does not report no connections from an incomplete inventory', async () => {
  for (let i = 0; i < 201; i++) grant(`revoked-${i}`, { revoked: true });
  grant();
  expect(await readConnectionStatus(uid)).toMatchObject({ authorization: 'unknown', inventoryComplete: false, observedAuthorizations: 0 });
});
it('does not expose tokens, client IDs, article content or audit metadata', async () => {
  grant('live', { clientId: 'SECRET-CLIENT', extra: 'PRIVATE-DATA' });
  audit('audit', { prompt: 'PRIVATE-PROMPT', access_token: 'SECRET-TOKEN' });
  const body = JSON.stringify(await readConnectionStatus(uid));
  expect(body).not.toMatch(/SECRET|PRIVATE|live|get_workspace/);
});
it.each([null, { uid: 'casper', owner: false }, { uid: 'milo', owner: false }])('denies missing/non-owner first-party sessions', async access => {
  mock.access.mockResolvedValue(access); mock.db = null;
  const response = await GET(new Request('https://ai.aproposmagazine.com/oauth/connections'));
  expect(response.status).toBe(403); expect(await response.json()).toEqual({ error: 'access_denied' });
});
it('uses the server-side owner identity, private/no-store response and no caller-selected UID', async () => {
  grant(); audit();
  const response = await GET(new Request('https://ai.aproposmagazine.com/oauth/connections?uid=casper'));
  expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  expect(await response.json()).toMatchObject({ authorization: 'granted', successfulToolCallObserved: true });
});
it('reports a status-service error, not a disconnected account or raw exception', async () => {
  mock.db = null;
  const response = await GET(new Request('https://ai.aproposmagazine.com/oauth/connections'));
  expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: 'connection_status_unavailable' });
});
