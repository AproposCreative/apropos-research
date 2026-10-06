import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { memoryFirestore } from './helpers/mcp-firestore';
const fake = vi.hoisted(() => ({ db: null as any, getUser: vi.fn(), member: vi.fn(), send: vi.fn() }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => fake.db, getAdminAuth: () => ({ getUser: fake.getUser }) }));
vi.mock('@/lib/mcp/oauth', () => ({ activeMember: fake.member }));
vi.mock('resend', () => ({ Resend: class { emails = { send: fake.send }; } }));
vi.mock('@/lib/config/env', () => ({ env: { CRON_SECRET: 'test-cron-only' } }));
import { deliverMcpWelcome, dispatchMcpWelcomes } from '@/lib/mcp/welcome';
import { MCP_WELCOME_VERSION, mcpWelcomeContent } from '@/lib/mcp/welcome-content';
import { GET } from '@/app/api/cron/mcp-welcome/route';
import { NextRequest } from 'next/server';
const memory = memoryFirestore(), now = Date.parse('2026-10-06T12:00:00Z');
function queue(uid = 'editor') {
  memory.rows.set(`mcpWelcomeMail/${uid}`, { uid, grantId: `grant-${uid}`, authenticatedAt: now, version: MCP_WELCOME_VERSION,
    createdAt: now, pending: true, status: 'queued', attempts: 0, nextAt: now, leaseUntil: 0 });
  memory.rows.set(`mcpGrants/grant-${uid}`, { uid, revoked: false, expiresAt: now + 30 * 86400000 });
}
beforeEach(() => {
  memory.clear(); fake.db = memory.db; vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now);
  vi.stubEnv('RESEND_API_KEY', 'mock-key'); vi.stubEnv('RESEND_FROM_EMAIL', 'Apropos <noreply@news.aproposmagazine.com>');
  fake.member.mockResolvedValue({ uid: 'editor' });
  fake.getUser.mockResolvedValue({ email: 'editor@aproposmagazine.com', emailVerified: true, disabled: false });
  fake.send.mockResolvedValue({ data: { id: 'mail-1' }, error: null });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
it('does not backfill existing users or grants', async () => {
  memory.rows.set('mcpGrants/old', { uid: 'editor' });
  expect(await deliverMcpWelcome('editor')).toEqual({ status: 'unchanged' });
  expect(fake.send).not.toHaveBeenCalled(); expect(memory.rows.size).toBe(1);
});
it('sends once even with concurrent after/cron, records acceptance rather than delivery', async () => {
  queue(); await Promise.all([deliverMcpWelcome('editor'), deliverMcpWelcome('editor')]);
  expect(fake.send).toHaveBeenCalledTimes(1);
  expect(fake.send.mock.calls[0][0]).toMatchObject({ to: 'editor@aproposmagazine.com' });
  expect(memory.rows.get('mcpWelcomeMail/editor')).toMatchObject({ status: 'accepted', pending: false, providerId: 'mail-1' });
  await deliverMcpWelcome('editor', now + 40 * 86400000); expect(fake.send).toHaveBeenCalledTimes(1);
});
it('reuses the exact frozen message and provider key after timeout', async () => {
  queue(); fake.send.mockRejectedValueOnce(Error('timeout'));
  expect(await deliverMcpWelcome('editor')).toEqual({ status: 'unconfirmed' });
  vi.stubEnv('RESEND_FROM_EMAIL', 'changed@aproposmagazine.com');
  await deliverMcpWelcome('editor', now + 300000);
  expect(fake.send.mock.calls[1][0]).toEqual(fake.send.mock.calls[0][0]);
  expect(fake.send.mock.calls[1][1].idempotencyKey).toBe(fake.send.mock.calls[0][1].idempotencyKey);
  expect(fake.send.mock.calls[1][1].signal).toBeInstanceOf(AbortSignal);
});
it('reuses the key if provider accepted but the receipt write failed', async () => {
  queue(); let failed = false;
  const original = memory.db.collection.bind(memory.db);
  fake.db = { ...memory.db, collection: (name: string) => {
    const c = original(name), doc = c.doc.bind(c);
    c.doc = (id: string) => { const ref = doc(id), update = ref.update;
      ref.update = async (data: any) => { if (data.status === 'accepted' && !failed) { failed = true; throw Error('storage_timeout'); } return update(data); }; return ref; };
    return c;
  } };
  await deliverMcpWelcome('editor'); await deliverMcpWelcome('editor', now + 300000);
  expect(fake.send).toHaveBeenCalledTimes(2);
  expect(fake.send.mock.calls[1][1].idempotencyKey).toBe(fake.send.mock.calls[0][1].idempotencyKey);
  expect(memory.rows.get('mcpWelcomeMail/editor').status).toBe('accepted');
});
it.each([{ attempts: 5 }, { firstAttemptAt: now - 23 * 3600000 }])('never rebuys an uncertain email outside its safe window: %j', async change => {
  queue(); Object.assign(memory.rows.get('mcpWelcomeMail/editor'), change);
  await deliverMcpWelcome('editor'); expect(fake.send).not.toHaveBeenCalled();
  expect(memory.rows.get('mcpWelcomeMail/editor')).toMatchObject({ pending: false, status: 'needs_reconciliation' });
});
it.each([{ revoked: true }, { expiresAt: now - 1 }, { uid: 'someone-else' }])('cancels unavailable connection: %j', async change => {
  queue(); Object.assign(memory.rows.get('mcpGrants/grant-editor'), change);
  await deliverMcpWelcome('editor'); expect(fake.send).not.toHaveBeenCalled();
  expect(memory.rows.get('mcpWelcomeMail/editor').status).toBe('cancelled');
});
it.each([{ emailVerified: false }, { disabled: true }, { email: 'outsider@example.com' }])('requires verified active team recipient %j', async change => {
  queue(); fake.getUser.mockResolvedValue({ email: 'editor@aproposmagazine.com', emailVerified: true, ...change });
  await deliverMcpWelcome('editor'); expect(fake.send).not.toHaveBeenCalled();
});
it('preserves work during missing configuration or membership service outage', async () => {
  queue(); vi.stubEnv('RESEND_API_KEY', ''); expect((await deliverMcpWelcome('editor')).status).toBe('configuration_missing');
  vi.stubEnv('RESEND_API_KEY', 'mock'); fake.member.mockResolvedValue(null);
  expect((await deliverMcpWelcome('editor')).status).toBe('access_unconfirmed');
  expect(fake.send).not.toHaveBeenCalled(); expect(memory.rows.get('mcpWelcomeMail/editor').attempts).toBe(0);
});
it('does not change recipient after an uncertain send', async () => {
  queue(); fake.send.mockRejectedValueOnce(Error('timeout')); await deliverMcpWelcome('editor');
  fake.getUser.mockResolvedValue({ email: 'changed@aproposmagazine.com', emailVerified: true });
  await deliverMcpWelcome('editor', now + 300000);
  expect(fake.send).toHaveBeenCalledTimes(1); expect(memory.rows.get('mcpWelcomeMail/editor').status).toBe('cancelled');
});
it('recovers pending work through bounded cron without new entries', async () => {
  queue(); expect(await dispatchMcpWelcomes()).toMatchObject({ processed: 1, results: ['accepted'] });
  expect(await dispatchMcpWelcomes()).toMatchObject({ processed: 0 });
});
it('requires cron authentication before accessing pending mail', async () => {
  queue();
  expect((await GET(new NextRequest('https://example.test/api/cron/mcp-welcome'))).status).toBe(403);
  expect(fake.send).not.toHaveBeenCalled();
  const response = await GET(new NextRequest('https://example.test/api/cron/mcp-welcome', { headers: { authorization: 'Bearer test-cron-only' } }));
  expect(await response.json()).toEqual({ processed: 1, results: ['accepted'] });
});
it('contains a watch link, usable plain text and no personal draft, attachment or paid-generation promise', () => {
  const content = mcpWelcomeContent();
  expect(content.text).toContain('/connect/chatgpt/welcome'); expect(content.html).toContain('Apropos AI');
  expect(content.text).toContain('prisaccept'); expect(content.html).not.toContain('<video');
  expect(content.text).not.toContain('Liv');
});
