import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { memoryFirestore } from './helpers/mcp-firestore';
const fake = vi.hoisted(() => ({ db: null as any, getUser: vi.fn() }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => fake.db, getAdminAuth: () => ({ getUser: fake.getUser }) }));
import { activeOwner, registerClient, startAuthorization, readAuthorization, consent, exchangeToken, authenticateMcp, revokeToken, revokeConnections, opaque, digest, oauthRateLimit } from '@/lib/mcp/oauth';
import { MCP_RESOURCE, MCP_ORIGIN, allowedRedirect } from '@/lib/mcp/config';
import { sameOrigin, smallBody } from '@/lib/mcp/http';
const memory = memoryFirestore(); const email = 'frederik@aproposmagazine.com';
beforeEach(() => { memory.clear(); fake.db = memory.db; vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-04T20:30:00Z'));
  fake.getUser.mockResolvedValue({ uid: 'frederik', email, emailVerified: true, disabled: false }); });
afterEach(() => vi.useRealTimers());
const redirect = 'https://chatgpt.com/connector_platform_oauth_redirect';
async function setup(scopes = 'apropos:read apropos:draft apropos:publish') {
  const client = await registerClient({ redirect_uris: [redirect] });
  const verifier = opaque(), cookie = opaque();
  const request = await startAuthorization({ client_id: client.client_id, redirect_uri: redirect, response_type: 'code', resource: MCP_RESOURCE,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', state: 'caller-state', scope: scopes }, cookie);
  return { client, verifier, cookie, request };
}
async function code(scopes?: string) {
  const data = await setup(scopes); const url = new URL(await consent(data.request, data.cookie, 'frederik', true));
  expect(url.searchParams.get('state')).toBe('caller-state'); expect(url.searchParams.get('iss')).toBe(MCP_ORIGIN);
  return { ...data, input: { client_id: data.client.client_id, grant_type: 'authorization_code', redirect_uri: redirect,
    resource: MCP_RESOURCE, code_verifier: data.verifier, code: url.searchParams.get('code')! } };
}
const request = (token: string) => new Request(MCP_RESOURCE, { headers: { authorization: `Bearer ${token}` } });
it.each(['https://evil.example/callback', 'https://chatgpt.com.evil.example/connector_platform_oauth_redirect', `${redirect}?extra=1`, 'http://chatgpt.com/connector/oauth/12345678'])('rejects attacker redirects %s', async url => {
  expect(allowedRedirect(url)).toBe(false); await expect(registerClient({ redirect_uris: [url] })).rejects.toThrow(); expect(memory.rows.size).toBe(0);
});
it('supports documented ChatGPT callbacks only', () => { expect(allowedRedirect(redirect)).toBe(true); expect(allowedRedirect('https://chatgpt.com/connector/oauth/abcdefgh123')).toBe(true); });
it('requires owner verification and allowlist on each token use', async () => {
  const { input } = await code(); const token = await exchangeToken(input);
  expect(await authenticateMcp(request(token.access_token))).toMatchObject({ uid: 'frederik', owner: true });
  memory.rows.set(`editorialAccess/${email}`, { active: false }); expect(await authenticateMcp(request(token.access_token))).toBeNull();
});
it.each([{ email: 'casper@aproposmagazine.com' }, { email: 'milo@aproposmagazine.com' }, { email: 'other@example.com' }, { emailVerified: false }, { disabled: true }])('denies non-owner or unavailable account %j', async change => {
  const data = await setup(); fake.getUser.mockResolvedValue({ email, emailVerified: true, disabled: false, ...change });
  expect(await activeOwner('uid', Date.now())).toBeNull(); await expect(consent(data.request, data.cookie, 'uid', true)).rejects.toThrow('access_denied');
});
it('requires the browser-bound cookie and a live single-use request', async () => {
  const data = await setup(); await expect(readAuthorization(data.request, opaque())).rejects.toThrow();
  await consent(data.request, data.cookie, 'frederik', false); await expect(consent(data.request, data.cookie, 'frederik', true)).rejects.toThrow();
});
it('expires authorization and codes without calling a provider', async () => {
  const data = await setup(); vi.advanceTimersByTime(600001); await expect(readAuthorization(data.request, data.cookie)).rejects.toThrow();
  const { input } = await code(); vi.advanceTimersByTime(60001); await expect(exchangeToken(input)).rejects.toThrow();
});
it.each(['code_verifier', 'redirect_uri', 'resource', 'client_id'])('binds the code to PKCE, callback, resource and client: %s', async key => {
  const { input } = await code(); await expect(exchangeToken({ ...input, [key]: key === 'client_id' || key === 'code_verifier' ? opaque() : 'https://attacker.example' })).rejects.toThrow();
  await expect(exchangeToken(input)).resolves.toHaveProperty('access_token');
});
it('allows one of two concurrent code exchanges, stores only token hashes', async () => {
  const { input } = await code(); const results = await Promise.allSettled([exchangeToken(input), exchangeToken(input)]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  const success = results.find(r => r.status === 'fulfilled') as PromiseFulfilledResult<any>;
  const stored = JSON.stringify([...memory.rows]); expect(stored).not.toContain(success.value.access_token); expect(stored).not.toContain(success.value.refresh_token);
  expect(memory.rows.has(`mcpAccessTokens/${digest(success.value.access_token)}`)).toBe(true);
});
it('rotates refresh tokens, rejects replay and revokes the token family', async () => {
  const { input } = await code(); const tokens = await exchangeToken(input);
  const refresh = { client_id: input.client_id, resource: MCP_RESOURCE, grant_type: 'refresh_token', refresh_token: tokens.refresh_token };
  const next = await exchangeToken(refresh); expect(await authenticateMcp(request(next.access_token))).not.toBeNull();
  await expect(exchangeToken(refresh)).rejects.toThrow('invalid_grant'); expect(await authenticateMcp(request(next.access_token))).toBeNull();
});
it('does not escalate scopes during refresh', async () => {
  const { input } = await code('apropos:read'); const tokens = await exchangeToken(input);
  await expect(exchangeToken({ client_id: input.client_id, resource: MCP_RESOURCE, grant_type: 'refresh_token', refresh_token: tokens.refresh_token, scope: 'apropos:read apropos:publish' })).rejects.toThrow('invalid_scope');
});
it('expires access tokens and respects Firebase revocation immediately', async () => {
  const { input } = await code(); const token = await exchangeToken(input);
  fake.getUser.mockResolvedValue({ email, emailVerified: true, tokensValidAfterTime: new Date(Date.now() + 1000).toISOString() });
  expect(await authenticateMcp(request(token.access_token))).toBeNull();
  fake.getUser.mockResolvedValue({ email, emailVerified: true }); vi.advanceTimersByTime(900001); expect(await authenticateMcp(request(token.access_token))).toBeNull();
});
it('revokes one grant only with the correct client, then all personal grants', async () => {
  const { input } = await code(); const token = await exchangeToken(input);
  await revokeToken(token.access_token, opaque()); expect(await authenticateMcp(request(token.access_token))).not.toBeNull();
  await revokeToken(token.access_token, input.client_id); expect(await authenticateMcp(request(token.access_token))).toBeNull();
  const next = await code(); const other = await exchangeToken(next.input); await revokeConnections('frederik'); expect(await authenticateMcp(request(other.access_token))).toBeNull();
});
it('rejects missing bearer, wrong audience and unknown tokens', async () => {
  expect(await authenticateMcp(new Request(MCP_RESOURCE))).toBeNull(); expect(await authenticateMcp(request(opaque()))).toBeNull();
  const { input } = await code(); const token = await exchangeToken(input);
  memory.rows.get(`mcpAccessTokens/${digest(token.access_token)}`).resource = 'https://other.example'; expect(await authenticateMcp(request(token.access_token))).toBeNull();
});
it('revokes more than one hundred grants and outstanding authorization codes', async () => {
  const { input } = await code(); const pending = await code();
  // The target grant appears beyond the batch limit; the watermark still denies it.
  for (let i = 0; i < 101; i++) memory.rows.set(`mcpGrants/old-${i}`, { uid: 'frederik' });
  const token = await exchangeToken(input); await revokeConnections('frederik');
  expect(await authenticateMcp(request(token.access_token))).toBeNull(); await expect(exchangeToken(pending.input)).rejects.toThrow();
  vi.advanceTimersByTime(1);
  const fresh = await code(); expect(await authenticateMcp(request((await exchangeToken(fresh.input)).access_token))).not.toBeNull();
});
it('bounds anonymous request volume atomically', async () => {
  const result = await Promise.allSettled(Array.from({ length: 4 }, () => oauthRateLimit('test', 2)));
  expect(result.filter(r => r.status === 'fulfilled')).toHaveLength(2);
});
it('requires first-party Origin for consent and bounds streamed request bodies', async () => {
  expect(() => sameOrigin(new Request(`${MCP_ORIGIN}/oauth/consent`, { headers: { origin: 'https://evil.example' } }))).toThrow();
  expect(() => sameOrigin(new Request(`${MCP_ORIGIN}/oauth/consent`, { headers: { origin: MCP_ORIGIN } }))).not.toThrow();
  await expect(smallBody(new Request(MCP_ORIGIN, { method: 'POST', body: 'a'.repeat(8001) }))).rejects.toThrow('request_too_large');
});
