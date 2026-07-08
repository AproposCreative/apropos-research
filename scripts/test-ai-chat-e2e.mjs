#!/usr/bin/env node
/**
 * Smoke + E2E for article chat API (/api/ai-chat).
 *
 *   node scripts/test-ai-chat-e2e.mjs
 *   TEST_BASE_URL=http://localhost:3000 node scripts/test-ai-chat-e2e.mjs --full
 */
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: join(root, '.env') });
config({ path: join(root, '.env.local') });

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';
const full = process.argv.includes('--full');
const results = [];

function pass(label, detail = '') {
  results.push({ ok: true, label, detail });
  console.log(`✓ ${label}${detail ? ` — ${detail}` : ''}`);
}

function fail(label, detail = '') {
  results.push({ ok: false, label, detail });
  console.error(`✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

async function api(path, body, headers = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { res, json };
}

function uuid() {
  return globalThis.crypto?.randomUUID?.() || `req-${Date.now()}`;
}

async function main() {
  console.log(`\nAI Chat E2E — ${BASE}\n`);

  // 1. Health
  try {
    const { res } = await api('/api/health');
    if (res.ok) pass('Health endpoint', `${res.status}`);
    else fail('Health endpoint', `${res.status}`);
  } catch (e) {
    fail('Health endpoint', e.message);
  }

  // 2. Simple greeting (mirrors UI "hej" path — no research)
  try {
    const { res, json } = await api('/api/ai-chat', {
      message: 'hej',
      articleData: { generationMode: 'fast', section: 'Musik', author: 'Test' },
      chatHistory: [],
      notes: '',
      authorTOV: '',
      authorName: 'Test',
    });
    if (!res.ok) {
      fail('Simple greeting', `${res.status}: ${json.error || json.message || JSON.stringify(json).slice(0, 200)}`);
    } else if (!json.response || typeof json.response !== 'string') {
      fail('Simple greeting', 'missing response field');
    } else {
      pass('Simple greeting', `${json.response.length} chars`);
    }
  } catch (e) {
    fail('Simple greeting', e.message);
  }

  // 3. Fast mode title+intro (short generation)
  try {
    const clientRequestId = uuid();
    const { res, json } = await api('/api/ai-chat', {
      message: 'Generer kun en arbejdstitel og en indledning om dansk indiepop i 2026.',
      articleData: {
        generationMode: 'fast',
        section: 'Musik',
        category: 'Musik',
        author: 'Test',
        rating: 4,
        topic: 'indiepop',
      },
      chatHistory: [],
      notes: 'Kort test — fokus på ny dansk indiepop.',
      authorTOV: '',
      authorName: 'Test',
      clientRequestId,
    });
    if (!res.ok) {
      fail('Fast mode title+intro', `${res.status}: ${json.error || json.message || JSON.stringify(json).slice(0, 300)}`);
    } else if (!json.response) {
      fail('Fast mode title+intro', 'missing response');
    } else {
      const hasTitle =
        /arbejdstitel|titel/i.test(json.response) ||
        (json.articleUpdate?.title && json.articleUpdate.title.length > 3);
      pass(
        'Fast mode title+intro',
        `${json.response.length} chars${hasTitle ? ', title detected' : ''}${json.articleUpdate ? ', articleUpdate' : ''}`
      );
    }

    // Progress polling (should be completed or empty after sync response)
    const prog = await api(`/api/ai-chat/progress?id=${encodeURIComponent(clientRequestId)}`);
    if (prog.res.ok) {
      pass('Progress endpoint', prog.json.completed ? 'completed' : 'ok');
    } else {
      fail('Progress endpoint', `${prog.res.status}`);
    }
  } catch (e) {
    fail('Fast mode title+intro', e.message);
  }

  // 4. Optional full editorial brief (slow, uses research if title set)
  if (full) {
    try {
      const { res, json } = await api('/api/ai-chat', {
        message:
          'Skriv en kort anmeldelse (ca. 200 ord) af en fiktiv dansk film "Midnat i Aarhus". 4 stjerner.',
        articleData: {
          generationMode: 'fast',
          section: 'Film',
          category: 'Film',
          author: 'Test',
          rating: 4,
          title: 'Midnat i Aarhus',
        },
        chatHistory: [],
        notes: '',
        authorTOV: '',
        authorName: 'Test',
      });
      if (!res.ok) {
        fail('Full brief (fast)', `${res.status}: ${json.error || json.message}`);
      } else if (!json.response || json.response.length < 100) {
        fail('Full brief (fast)', 'response too short');
      } else {
        pass('Full brief (fast)', `${json.response.length} chars`);
      }
    } catch (e) {
      fail('Full brief (fast)', e.message);
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed\n`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
