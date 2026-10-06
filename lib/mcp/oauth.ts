import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { editorialRole, normalizeAccessEmail, type AccessEntry } from '@/lib/auth-policy';
import { OWNER_EMAIL } from '@/lib/editorial-capabilities';
import { allowedRedirect, MCP_ORIGIN, MCP_RESOURCE, MCP_SCOPES } from './config';

export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const opaque = () => randomBytes(32).toString('base64url');
const key = z.string().regex(/^[a-zA-Z0-9_-]{43}$/);
const scope = z.string().max(200).transform(s => [...new Set(s.split(' ').filter(Boolean))])
  .refine(s => s.length > 0 && s.includes('apropos:read') && s.every(x => (MCP_SCOPES as readonly string[]).includes(x)));
const db = () => { const db = getAdminDb(); if (!db) throw Error('mcp_unavailable'); return db; };
const collection = (name: string) => db().collection(`mcp${name}`);
export type McpIdentity = { uid: string; role: 'admin' | 'editor'; owner: boolean; scopes: string[]; grantId: string };
export class OAuthError extends Error { constructor(readonly code: string, readonly status = 400) { super(code); } }
const invalid = () => new OAuthError('invalid_grant');

/** Every token use checks the real Firebase account and current allowlist. No positive cache. */
export async function activeMember(uid: string, authenticatedAt: number) {
  const auth = getAdminAuth(); if (!auth) return null;
  try {
    const user = await auth.getUser(uid), email = normalizeAccessEmail(user.email);
    if (!email || !email.endsWith('@aproposmagazine.com') || !user.emailVerified || user.disabled ||
      !Number.isFinite(authenticatedAt) || Date.parse(user.tokensValidAfterTime || '') > authenticatedAt) return null;
    const [entryDoc, revocation] = await Promise.all([db().collection('editorialAccess').doc(email).get(), collection('Revocations').doc(uid).get()]);
    if ((revocation.data()?.revokedAt ?? -1) >= authenticatedAt) return null;
    const entry = entryDoc.data() as AccessEntry | undefined;
    if (entry?.active === false) return null;
    // Domain membership is MCP-only. It does not expand the web app's allowlist
    // or grant owner capabilities to a colleague with an admin-looking claim.
    const owner = email === OWNER_EMAIL;
    const role = owner ? editorialRole({ email, emailVerified: user.emailVerified, disabled: user.disabled, entry }) : 'editor';
    return role ? { uid, role, owner } : null;
  } catch { return null; }
}

export async function activeOwner(uid: string, authenticatedAt: number) {
  const member = await activeMember(uid, authenticatedAt);
  return member?.owner ? { ...member, owner: true as const } : null;
}

/** First-party connection pages use Firebase, not a model-supplied identity. */
export async function mcpRequestAccess(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  const auth = getAdminAuth();
  if (!token || !auth) return null;
  try {
    const claims = await auth.verifyIdToken(token, true);
    return activeMember(claims.uid, claims.auth_time * 1000);
  } catch { return null; }
}

/** Small global bucket for public OAuth endpoints; untrusted callers cannot create unlimited records. */
export async function oauthRateLimit(kind: string, limit: number) {
  const ref = collection('RateLimits').doc(`${kind}-${Math.floor(Date.now() / 3600000)}`);
  await db().runTransaction(async tx => {
    const count = (await tx.get(ref)).data()?.count || 0;
    if (count >= limit) throw new OAuthError('rate_limited', 429);
    tx.set(ref, { count: count + 1, expiresAt: new Date(Date.now() + 7200000) });
  });
}

export const registrationSchema = z.object({
  redirect_uris: z.array(z.string().refine(allowedRedirect)).min(1).max(3),
  client_name: z.string().max(100).optional(),
  token_endpoint_auth_method: z.literal('none').default('none'),
  grant_types: z.array(z.enum(['authorization_code', 'refresh_token'])).optional(),
  response_types: z.array(z.literal('code')).optional(),
}).strip();
export async function registerClient(value: unknown) {
  const input = registrationSchema.parse(value);
  await oauthRateLimit('register', 30);
  const id = opaque();
  const client = { client_id: id, client_name: 'ChatGPT', redirect_uris: [...new Set(input.redirect_uris)],
    token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] };
  await collection('Clients').doc(id).create({ ...client, createdAt: Date.now() });
  return client;
}
export const authorizeSchema = z.object({
  client_id: key, redirect_uri: z.string().refine(allowedRedirect), response_type: z.literal('code'),
  code_challenge: key, code_challenge_method: z.literal('S256'),
  state: z.string().min(8).max(2048), resource: z.literal(MCP_RESOURCE),
  scope: scope.prefault('apropos:read apropos:draft apropos:publish'),
}).strip();
export async function startAuthorization(value: unknown, browserSecret: string) {
  const input = authorizeSchema.parse(value);
  const client = (await collection('Clients').doc(input.client_id).get()).data();
  if (!client?.redirect_uris?.includes(input.redirect_uri)) throw new OAuthError('invalid_client');
  await oauthRateLimit('authorize', 120);
  const id = opaque();
  await collection('Authorizations').doc(digest(id)).create({ ...input, browserHash: digest(browserSecret),
    expiresAt: Date.now() + 600000, consumed: false });
  return id;
}
export async function readAuthorization(id: string, browserSecret: string) {
  key.parse(id); key.parse(browserSecret);
  const row = (await collection('Authorizations').doc(digest(id)).get()).data();
  if (!row || row.consumed || row.expiresAt < Date.now() || row.browserHash !== digest(browserSecret)) throw invalid();
  return row;
}
export async function consent(id: string, browserSecret: string, uid: string, allow: boolean) {
  const row = await readAuthorization(id, browserSecret);
  const now = Date.now(); if (!await activeMember(uid, now)) throw new OAuthError('access_denied', 403);
  const code = opaque(), authRef = collection('Authorizations').doc(digest(id));
  await db().runTransaction(async tx => {
    const current = (await tx.get(authRef)).data();
    if (!current || current.consumed || current.expiresAt < now || current.browserHash !== digest(browserSecret)) throw invalid();
    tx.update(authRef, { consumed: true });
    if (allow) tx.create(collection('Codes').doc(digest(code)), { ...row, uid, authenticatedAt: now,
      expiresAt: now + 60000, consumed: false });
  });
  const url = new URL(row.redirect_uri);
  url.searchParams.set(allow ? 'code' : 'error', allow ? code : 'access_denied');
  url.searchParams.set('state', row.state); url.searchParams.set('iss', MCP_ORIGIN);
  return url.href;
}

export async function exchangeToken(input: Record<string, string>) {
  key.parse(input.client_id);
  if (input.resource !== MCP_RESOURCE) throw new OAuthError('invalid_target');
  const refresh = input.grant_type === 'refresh_token';
  if (!refresh && input.grant_type !== 'authorization_code') throw new OAuthError('unsupported_grant_type');
  const secret = key.parse(refresh ? input.refresh_token : input.code);
  const ref = collection(refresh ? 'RefreshTokens' : 'Codes').doc(digest(secret));
  const initial = (await ref.get()).data();
  if (!initial || !await activeMember(initial.uid, initial.authenticatedAt)) throw invalid();
  const access = opaque(), nextRefresh = opaque(), grantId = refresh ? initial.grantId : opaque(), now = Date.now();
  const grantRef = collection('Grants').doc(grantId);
  const ok = await db().runTransaction(async tx => {
    const row = (await tx.get(ref)).data();
    const grant = refresh ? (await tx.get(grantRef)).data() : undefined;
    if (!row || row.client_id !== input.client_id || row.resource !== MCP_RESOURCE || row.expiresAt < now ||
        (refresh && (!grant || grant.revoked || grant.expiresAt < now))) throw invalid();
    if (!refresh) {
      if (row.redirect_uri !== input.redirect_uri || !/^[a-zA-Z0-9._~-]{43,128}$/.test(input.code_verifier || '') ||
        createHash('sha256').update(input.code_verifier).digest('base64url') !== row.code_challenge) throw invalid();
    }
    if (row.consumed) {
      if (refresh) tx.update(grantRef, { revoked: true, reason: 'refresh_replay' });
      return false;
    }
    const scopes = input.scope ? scope.parse(input.scope) : row.scope;
    if (scopes.some((s: string) => !row.scope.includes(s))) throw new OAuthError('invalid_scope');
    tx.update(ref, { consumed: true });
    const binding = { uid: row.uid, authenticatedAt: row.authenticatedAt, client_id: row.client_id,
      resource: MCP_RESOURCE, scope: scopes, grantId, issuedAt: now };
    if (!refresh) tx.create(grantRef, { uid: row.uid, clientId: row.client_id, scopes, createdAt: now, expiresAt: now + 30 * 86400000, revoked: false });
    tx.create(collection('AccessTokens').doc(digest(access)), { ...binding, expiresAt: now + 900000 });
    tx.create(collection('RefreshTokens').doc(digest(nextRefresh)), { ...binding, consumed: false, expiresAt: Math.min(grant?.expiresAt || now + 30 * 86400000, now + 7 * 86400000) });
    return true;
  });
  if (!ok) throw invalid();
  return { access_token: access, token_type: 'Bearer', expires_in: 900, refresh_token: nextRefresh,
    scope: input.scope || initial.scope.join(' ') };
}
export async function authenticateMcp(request: Request): Promise<McpIdentity | null> {
  const token = request.headers.get('authorization')?.match(/^Bearer ([a-zA-Z0-9_-]{43})$/)?.[1];
  if (!token) return null;
  const row = (await collection('AccessTokens').doc(digest(token)).get()).data();
  if (!row || row.expiresAt < Date.now() || row.resource !== MCP_RESOURCE) return null;
  const grant = (await collection('Grants').doc(row.grantId).get()).data();
  if (!grant || grant.revoked || grant.uid !== row.uid || grant.clientId !== row.client_id || grant.expiresAt < Date.now()) return null;
  const identity = await activeMember(row.uid, row.authenticatedAt);
  return identity ? { ...identity, scopes: row.scope, grantId: row.grantId } : null;
}
export async function revokeToken(token: string, clientId: string) {
  key.parse(token); key.parse(clientId);
  const [access, refresh] = await Promise.all(['AccessTokens', 'RefreshTokens'].map(name => collection(name).doc(digest(token)).get()));
  const row = access.data() || refresh.data();
  if (row?.client_id === clientId) await collection('Grants').doc(row.grantId).update({ revoked: true });
}
export async function revokeConnections(uid: string) {
  // A durable user watermark covers ALL grants and unexchanged codes, including
  // more than one batch of historical connections. No pagination gap.
  await collection('Revocations').doc(uid).set({ revokedAt: Date.now() });
  const grants = await collection('Grants').where('uid', '==', uid).limit(100).get();
  const batch = db().batch(); grants.docs.forEach(doc => batch.update(doc.ref, { revoked: true })); await batch.commit();
}
