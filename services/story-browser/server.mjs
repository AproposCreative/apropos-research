import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { createStoryRuntime } from './runtime.mjs';

const secret = process.env.SOCIAL_STORY_BROWSER_SECRET?.trim();
if (!secret || secret.length < 32) throw Error('story_service_unconfigured');
const bucketName = process.env.SOCIAL_STORY_STORAGE_BUCKET;
if (!bucketName) throw Error('story_storage_unconfigured');
const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
async function state(action, extra = {}) {
  const response = await fetch('https://ai.aproposmagazine.com/api/internal/social-story-worker', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-story-service-secret': secret }, body: JSON.stringify({ action, ...extra }), redirect: 'error', signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw Error('story_state_unconfirmed'); return response.json();
}
const store = { status: () => state('status'), session: async () => (await state('session')).state || undefined,
  saveSession: value => state('saveSession', { state: value }), claim: operationId => state('claim', { operationId }),
  beforePublish: operationId => state('beforePublish', { operationId }), finish: (operationId, result) => state('finish', { operationId, result }) };
// This container has no Firebase/Admin credentials or database IAM permissions.
// It receives only an approved job and its existing, version-bound image URL.
const bucket = { file: path => ({ getMetadata: async () => [{ contentType: 'image/jpeg', size: 0 }], download: async imageUrl => {
  const u = new URL(imageUrl);
  if (u.protocol !== 'https:' || u.hostname !== 'firebasestorage.googleapis.com' || u.username || u.password || u.pathname !== `/v0/b/${bucketName}/o/${encodeURIComponent(path)}`) throw Error('invalid_story_image');
  const response = await fetch(u.href, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
  if (!response.ok || Number(response.headers.get('content-length') || 0) > 8*1024*1024) throw Error('invalid_story_image');
  const reader = response.body.getReader(), chunks = []; let length = 0;
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > 8*1024*1024) throw Error('invalid_story_image'); chunks.push(value); } }
  finally { await reader.cancel().catch(() => {}); }
  return [Buffer.concat(chunks)];
} }) };
const runtime = createStoryRuntime({ browser, store, bucket, sharp,
  revalidate: async task => {
    const response = await fetch('https://ai.aproposmagazine.com/api/internal/social-story-approval', { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-story-service-secret': secret }, body: JSON.stringify({ operationId: task.id }),
      redirect: 'error', signal: AbortSignal.timeout(15_000) });
    const approval = await response.json();
    if (!response.ok || approval.approved !== true || approval.imageSha256 !== task.imageSha256 || approval.articleUrl !== task.articleUrl)
      throw Error('story_approval_unavailable');
  },
});
const allowedKeys = new Set(['Enter', 'Tab', 'Shift+Tab', 'Backspace', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const authorized = value => typeof value === 'string' && Buffer.byteLength(value) === Buffer.byteLength(secret) && timingSafeEqual(Buffer.from(value), Buffer.from(secret));
http.createServer(async (req, res) => {
  const reply = (body, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(body)); };
  if (req.method === 'GET' && req.url === '/health') return reply({ ok: true });
  if (!authorized(req.headers['x-story-service-secret'])) return reply({ error: 'unauthorized' }, 401);
  try {
    if (req.method === 'GET' && req.url === '/status') return reply(await runtime.status());
    if (req.method !== 'POST' || !['/process', '/setup'].includes(req.url)) return reply({ error: 'not_found' }, 404);
    let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 12_000) return reply({ error: 'invalid_request' }, 413); }
    const body = JSON.parse(raw);
    if (req.url === '/process') {
      if (!/^[a-f0-9]{64}$/.test(body.operationId || '')) return reply({ error: 'invalid_request' }, 400);
      // Hold the authenticated request open while Chromium runs. Cloud Run's
      // request lifecycle keeps CPU available; no fire-and-forget background work.
      return reply(await runtime.process(body.operationId));
    }
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(body.ownerUid || '') || !['begin', 'refresh', 'click', 'text', 'key', 'instagram', 'finish', 'cancel'].includes(body.action) ||
      (body.action === 'text' && (typeof body.text !== 'string' || body.text.length > 2000)) ||
      (body.action === 'key' && !allowedKeys.has(body.key)) ||
      (body.action === 'click' && (!Number.isFinite(body.x) || !Number.isFinite(body.y) || body.x < 0 || body.x > 1650 || body.y < 0 || body.y > 1045))) return reply({ error: 'invalid_request' }, 400);
    return reply(await runtime.setup(body.ownerUid, body));
  } catch { return reply({ error: 'story_connection_action_unconfirmed' }, 503); }
}).listen(Number(process.env.PORT || 8080));
process.on('SIGTERM', () => { void browser.close().finally(() => process.exit(0)); });
