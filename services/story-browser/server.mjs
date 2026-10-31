import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { sessionCipher, storyStore } from './store.mjs';
import { createStoryRuntime } from './runtime.mjs';

const secret = process.env.INTERNAL_API_SECRET?.trim();
const cipher = sessionCipher(secret); // Missing auth/encryption fails startup closed.
const app = initializeApp({ credential: applicationDefault(), projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_ADMIN_PROJECT_ID });
const bucketName = process.env.SOCIAL_STORY_STORAGE_BUCKET;
if (!bucketName) throw Error('story_storage_unconfigured');
const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
const runtime = createStoryRuntime({ browser, store: storyStore(getFirestore(app), cipher), bucket: getStorage(app).bucket(bucketName), sharp,
  revalidate: async task => {
    const response = await fetch('https://ai.aproposmagazine.com/api/internal/social-story-approval', { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-api-secret': secret }, body: JSON.stringify({ operationId: task.id }),
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
  if (!authorized(req.headers['x-internal-api-secret'])) return reply({ error: 'unauthorized' }, 401);
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
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(body.ownerUid || '') || !['begin', 'refresh', 'click', 'text', 'key', 'instagram', 'finish'].includes(body.action) ||
      (body.action === 'text' && (typeof body.text !== 'string' || body.text.length > 2000)) ||
      (body.action === 'key' && !allowedKeys.has(body.key)) ||
      (body.action === 'click' && (!Number.isFinite(body.x) || !Number.isFinite(body.y) || body.x < 0 || body.x > 1650 || body.y < 0 || body.y > 1045))) return reply({ error: 'invalid_request' }, 400);
    return reply(await runtime.setup(body.ownerUid, body));
  } catch { return reply({ error: 'story_connection_action_unconfirmed' }, 503); }
}).listen(Number(process.env.PORT || 8080));
process.on('SIGTERM', () => { void browser.close().finally(() => process.exit(0)); });
