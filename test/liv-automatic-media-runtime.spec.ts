import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
const mocks = vi.hoisted(() => ({ row: undefined as any, writes: vi.fn(), stages: vi.fn(), save: vi.fn(), download: vi.fn(),
  stageRows: {} as Record<string, any>, files: new Map<string, Buffer>(), getMetadata: vi.fn(),
  chat: vi.fn(), generate: vi.fn(), read: vi.fn(), dbAvailable: true, keyAvailable: true, tail: Promise.resolve() as Promise<unknown> }));
vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => mocks.dbAvailable ? {
    collection: () => ({ doc: () => ({
      get: async () => ({ exists: false, data: () => undefined }),
      collection: () => ({ kind: 'stages', doc: (stage: string) => ({ stage }) }) }) }),
    runTransaction: (fn: any) => {
      const result = mocks.tail.then(async () => {
      const writes: Array<() => void> = [];
      const value = await fn({
      get: async (ref: any) => ref.kind === 'stages'
        ? { docs: Object.entries(mocks.stageRows).map(([id, data]) => ({ id, data: () => structuredClone(data) })) }
        : { data: () => structuredClone(ref.stage ? mocks.stageRows[ref.stage] : mocks.row) },
      set: (ref: any, patch: any, options?: any) => writes.push(() => {
        if (ref.stage) {
          mocks.stages(patch, options);
          mocks.stageRows[ref.stage] = options?.merge ? { ...mocks.stageRows[ref.stage], ...patch } : patch;
        } else {
          mocks.writes(patch);
          mocks.row = options?.merge ? { ...mocks.row, ...patch } : patch;
        }
      }),
      });
      writes.forEach(write => write()); return value;
      });
      mocks.tail = result.catch(() => undefined); return result;
    },
  } : null,
  getAdminStorageBucket: () => ({ file: (path: string) => ({
    save: async (bytes: Buffer, options: unknown) => { await mocks.save(bytes, options); mocks.files.set(path, bytes); },
    download: (options: unknown) => mocks.download(path, options), getMetadata: mocks.getMetadata,
  }) }),
}));
vi.mock('@/lib/openai', () => ({ getOpenAIClient: () => mocks.keyAvailable ? { chat: { completions: { create: mocks.chat } }, images: { generate: mocks.generate } } : null }));
vi.mock('@/lib/liv/model-config', () => ({ livModels: () => ({ utility: 'test-utility-model' }) }));
vi.mock('@/lib/liv/public-media-reader', () => ({ readPublicMedia: mocks.read }));
import { livMediaRuntime, aproposIllustrationStyle } from '@/lib/liv/automatic-media-runtime';
import type { GeneratedArticle } from '@/lib/liv/generate-article';
import { livImageArticleHash } from '@/lib/liv/article-image-hash';
import { prepareLivAutomaticMedia } from '@/lib/liv/automatic-media';
import { LivCostPretransportError } from '@/lib/liv/cost-errors';
const id = 'b'.repeat(64);
const article = { title: 'Kunst i byen', intro: 'Kunst med mening', slug: 'kunst-i-byen', content: '<p>Indhold</p>' } as GeneratedArticle;
let image: Buffer;
beforeAll(async () => { image = await sharp({ create: { width: 1000, height: 600, channels: 3, background: '#ff3388' } }).png().toBuffer(); });
beforeEach(() => {
  vi.resetAllMocks(); mocks.row = undefined; mocks.stageRows = {}; mocks.files.clear(); mocks.dbAvailable = true; mocks.keyAvailable = true; mocks.tail = Promise.resolve();
  vi.stubEnv('FIREBASE_STORAGE_BUCKET', 'test-bucket');
  vi.stubEnv('LIV_IMAGE_MODEL', 'gpt-image-1.5');
  vi.stubEnv('AI_IMAGE_GENERATION_ENABLED', 'true');
  vi.stubEnv('LIV_OFFICIAL_IMAGE_HOSTS', 'sfstudios.dk');
  mocks.save.mockResolvedValue(undefined); mocks.download.mockImplementation(async path => [mocks.files.get(path) ?? image]);
  mocks.generate.mockResolvedValue({ data: [{ b64_json: image.toString('base64') }], usage: { total_tokens: 100 } });
  mocks.chat.mockResolvedValue({ choices: [{ finish_reason: 'stop', message: { content: '{"images":[]}' } }], usage: { total_tokens: 30 } });
});
afterEach(() => vi.unstubAllEnvs());
it('claims once and records the original text, rejecting blind paid retries', async () => {
  const deps = livMediaRuntime();
  expect(await deps.claim(id, article, 'illustration', 'minimal')).toBeNull();
  expect(mocks.row).toMatchObject({ status: 'processing', article, style: 'minimal', estimatedCost: null });
  await expect(deps.claim(id, article, 'illustration', 'minimal')).rejects.toThrow('reconciliation');
  expect(mocks.writes).toHaveBeenCalledTimes(1);
  expect(mocks.generate).not.toHaveBeenCalled();
});
it('returns the exact completed revision without spending again', async () => {
  const deps = livMediaRuntime();
  await deps.claim(id, article, 'illustration', 'expressive');
  const completed = { ...article, content: 'Finished content' };
  await deps.complete(id, completed);
  expect(await deps.claim(id, article, 'illustration', 'expressive')).toEqual(completed);
  expect(mocks.generate).not.toHaveBeenCalled();
});
it('stores the raw provider image immutably and records actual usage before returning', async () => {
  const deps = livMediaRuntime();
  await deps.claim(id, article, 'illustration', 'minimal');
  expect(await deps.generate('Et enkelt kunstmotiv', id, 'hero')).toEqual(image);
  expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-image-1.5', n: 1, prompt: expect.stringContaining('Minimal classic ink') }), expect.objectContaining({ maxRetries: 0 }));
  expect(mocks.save).toHaveBeenCalledWith(image, expect.objectContaining({ preconditionOpts: { ifGenerationMatch: 0 } }));
  const hash = createHash('sha256').update(image).digest('hex');
  expect(mocks.stages).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'complete', original: expect.objectContaining({ contentHash: hash }), usage: { total_tokens: 100 }, estimatedCost: null }), { merge: true });
  expect(mocks.stages.mock.invocationCallOrder[0]).toBeLessThan(mocks.generate.mock.invocationCallOrder[0]);
});
it('records uncertain provider attempts, makes no automatic retries, and leaves them for reconciliation', async () => {
  const deps = livMediaRuntime();
  await deps.claim(id, article, 'illustration', 'expressive');
  mocks.generate.mockRejectedValue(new Error('timeout'));
  await expect(deps.generate('Motiv', id, 'hero')).rejects.toThrow('timeout');
  await deps.fail(id);
  expect(mocks.row.status).toBe('failed');
  await expect(deps.claim(id, article, 'illustration', 'expressive')).rejects.toThrow('reconciliation');
  expect(mocks.generate).toHaveBeenCalledTimes(1);
  expect(mocks.save).not.toHaveBeenCalled();
});
it('honours the existing image-generation switch and time budget before an API call', async () => {
  vi.stubEnv('AI_IMAGE_GENERATION_ENABLED', 'false');
  await expect(livMediaRuntime().generate('Motiv', id, 'hero')).rejects.toThrow('disabled');
  vi.stubEnv('AI_IMAGE_GENERATION_ENABLED', 'true');
  await expect(livMediaRuntime(Date.now() - 1).generate('Motiv', id, 'hero')).rejects.toThrow('time_budget');
  expect(mocks.generate).not.toHaveBeenCalled();
  expect(mocks.stages).not.toHaveBeenCalled();
});
it('never opens another source host or invents photo credits', async () => {
  mocks.read.mockImplementation(async (url, kind) => kind === 'html' ? Buffer.from('<figure><img src="https://images.example.com/still.png"><figcaption>Foto: Anna / SF Studios</figcaption></figure>') : image);
  const result = await livMediaRuntime().candidates({ ...article, imageSuggestions: [
    { url: 'https://images.example.com/still.png', sourcePageUrl: 'https://sfstudios.dk/film', source: 'SF' },
    { url: 'https://elsewhere.example.com/photo.png', sourcePageUrl: 'https://sfstudios.dk.evil.example.com/film', source: 'Unknown' },
  ] });
  expect(result).toHaveLength(1);
  expect(result[0].credit).toBe('Foto: Anna / SF Studios');
  expect(mocks.read.mock.calls.map(call => call[0])).toEqual(['https://sfstudios.dk/film', 'https://images.example.com/still.png']);
});
it('fails closed on truncated model JSON or uncertain visual review', async () => {
  const deps = livMediaRuntime();
  await deps.claim(id, article, 'illustration', 'expressive');
  mocks.chat.mockResolvedValueOnce({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] });
  await expect(deps.plan(article, 'illustration', 'expressive', [], id)).rejects.toThrow('incomplete');
  mocks.chat.mockResolvedValueOnce({ choices: [{ finish_reason: 'stop', message: { content: '{"pass":false}' } }] });
  expect(await deps.review(article, 'illustration', [{ bytes: image, alt: 'Motiv', caption: 'Tekst' }], id)).toBe(false);
  expect(mocks.chat.mock.calls.map(call => ({ reasoning: call[0].reasoning_effort, limit: call[0].max_completion_tokens })))
    .toEqual([{ reasoning: 'low', limit: 4000 }, { reasoning: 'low', limit: 2000 }]);
});
it('does not silently create clients or credentials if the existing configuration is missing', () => {
  mocks.keyAvailable = false;
  expect(() => livMediaRuntime()).toThrow('model_unavailable');
  mocks.dbAvailable = false;
  expect(() => livMediaRuntime()).toThrow('storage_unavailable');
});
it('defines both requested styles with no collage and few focal objects', () => {
  expect(aproposIllustrationStyle('expressive')).toContain('cobalt blue, hot pink and yellow');
  expect(aproposIllustrationStyle('minimal')).toContain('at most one restrained accent');
  for (const style of ['expressive', 'minimal'] as const) {
    expect(aproposIllustrationStyle(style)).toContain('No collage');
    expect(aproposIllustrationStyle(style)).toContain('very few objects');
  }
});

it.each(['liv_cost_context_blocked', 'liv_cost_ledger_requires_reconciliation'])('records wrapped %s without claiming non-payment', async code => {
  const deps = livMediaRuntime();
  await deps.claim(id, article, 'illustration', 'expressive');
  const failure = new Error('Connection error with private request', { cause: new Error(code) });
  failure.name = 'APIConnectionError';
  mocks.chat.mockRejectedValueOnce(failure);
  await expect(deps.review(article, 'illustration', [{ bytes: image, alt: 'Motiv', caption: 'Tekst' }], id)).rejects.toBe(failure);
  const stage = mocks.stageRows['visual-review'];
  expect(stage.status).toBe('processing');
  expect(stage.notStarted).toBeUndefined();
  expect(stage.failureDiagnostic).toMatchObject({ version: 1, jobId: id, stage: 'visual-review',
    attemptId: stage.attemptId, requestHash: stage.requestHash,
    causes: [{ errorName: 'APIConnectionError', status: null, code: null }, { errorName: 'Error', status: null, code }] });
  expect(JSON.stringify(stage)).not.toContain('private');
  expect(mocks.chat).toHaveBeenCalledTimes(1);
});

it('diagnoses a cross-class denial lookalike but never authorizes unpaid recovery', async () => {
  const deps = livMediaRuntime();
  await deps.claim(id, article, 'illustration', 'expressive');
  const failure = Object.assign(new Error('liv_cost_request_unbounded'), {
    name: 'LivCostPretransportError', code: 'liv_cost_request_unbounded', providerAttempted: false,
  });
  mocks.generate.mockRejectedValueOnce(new Error('Connection error', { cause: failure }));
  await expect(deps.generate('Motiv', id, 'hero')).rejects.toThrow('Connection error');
  expect(mocks.stageRows['hero-call']).toMatchObject({ status: 'processing', failureDiagnostic: {
    causes: [{ errorName: 'Error', status: null, code: null },
      { errorName: 'LivCostPretransportError', status: null, code: 'liv_cost_request_unbounded' }],
  } });
  expect(mocks.stageRows['hero-call'].notStarted).toBeUndefined();
  await deps.fail(id);
  await expect(livMediaRuntime().claim(id, article, 'illustration', 'expressive')).rejects.toThrow('reconciliation');
});

it('retains genuine branded denial evidence alongside the diagnostic', async () => {
  const deps = livMediaRuntime();
  await deps.claim(id, article, 'illustration', 'expressive');
  mocks.generate.mockRejectedValueOnce(new Error('Connection error', { cause: new LivCostPretransportError('liv_cost_monthly_budget_exceeded') }));
  await expect(deps.generate('Motiv', id, 'hero')).rejects.toThrow('Connection error');
  expect(mocks.stageRows['hero-call']).toMatchObject({ status: 'not_started',
    notStarted: { providerAttempted: false, code: 'liv_cost_monthly_budget_exceeded' },
    failureDiagnostic: { jobId: id, stage: 'hero-call' } });
});

it('redacts unsafe codes, names, messages, bodies and stacks and bounds cyclic causes', async () => {
  const deps = livMediaRuntime();
  await deps.claim(id, article, 'illustration', 'expressive');
  const failure = { name: 'sk-secret', code: 'sk-secret', message: 'Bearer private', status: 429,
    stack: '/Users/private/key', body: { apiKey: 'private' }, cause: null as unknown };
  failure.cause = failure;
  mocks.generate.mockRejectedValueOnce(failure);
  await expect(deps.generate('Motiv', id, 'hero')).rejects.toBe(failure);
  expect(mocks.stageRows['hero-call'].failureDiagnostic.causes).toEqual([{ errorName: 'UnknownError', status: 429, code: null }]);
  expect(JSON.stringify(mocks.stageRows['hero-call'])).not.toMatch(/private|sk-secret/);
});

it('keeps only four sanitized production frames across the cause chain', async () => {
  const deps = livMediaRuntime();
  await deps.claim(id, article, 'illustration', 'expressive');
  const root = new TypeError('Cannot read private value');
  root.stack = 'TypeError: private\n    at a (/var/task/.next/server/chunks/456.js:2:30)\n    at /var/task/.next/server/app/api/liv/route.js:8:90\n    at extra (/var/task/.next/server/chunks/789.js:1:99)';
  const failure = new Error('private', { cause: root });
  failure.stack = '    at forbidden (/var/task/.next/server/message.js:1:1)\n    at async run (/var/task/.next/server/chunks/[root]__123.js:1:234)\n    at b (/var/task/.next/server/chunks/123.js:2:10)';
  mocks.chat.mockRejectedValueOnce(failure);
  await expect(deps.review(article, 'illustration', [{ bytes: image, alt: 'Motiv', caption: 'Tekst' }], id)).rejects.toBe(failure);
  const causes = mocks.stageRows['visual-review'].failureDiagnostic.causes;
  expect(causes.map((cause: any) => cause.frames)).toEqual([
    ['async run .next/server/chunks/[root]__123.js:1:234', 'b .next/server/chunks/123.js:2:10'],
    ['a .next/server/chunks/456.js:2:30', '.next/server/app/api/liv/route.js:8:90'],
  ]);
  expect(JSON.stringify(causes)).not.toMatch(/private|forbidden|extra|var\/task/);
  expect(mocks.stageRows['visual-review'].status).toBe('processing');
  expect(mocks.stageRows['visual-review'].notStarted).toBeUndefined();
});

it.each([
  '    at fetch (https://example.com/.next/server/chunks/a.js:1:2)',
  '    at a (/var/task/.next/server/chunks/sk-private.js:1:2)',
  '    at token (/var/task/.next/server/chunks/a.js:1:2)',
  '    at a (/var/task/.next/server/chunks/a.js?secret=value:1:2)',
  '    at a (/var/task/.next/server/../secret.js:1:2)',
  '    at a (/Users/private/project/lib/a.ts:1:2)',
  '    at a (/var/task/.next/server/chunks/a.js:0:2)',
  '    at a (/var/task/.next/server/chunks/a.js:1234567890:2)',
  '    at eval (private, /var/task/.next/server/chunks/a.js:1:2)',
])('drops unsafe or unbounded stack frame %s', async frame => {
  const deps = livMediaRuntime();
  await deps.claim(id, article, 'illustration', 'expressive');
  const failure = new TypeError('private');
  failure.stack = `TypeError: private\n${frame}`;
  mocks.generate.mockRejectedValueOnce(failure);
  await expect(deps.generate('Motiv', id, 'hero')).rejects.toBe(failure);
  expect(mocks.stageRows['hero-call'].failureDiagnostic.causes).toEqual([{ errorName: 'TypeError', status: null, code: null }]);
});

it('caps diagnostics at eight causal entries and does not change paid sibling evidence', async () => {
  const deps = livMediaRuntime();
  await deps.claim(id, article, 'illustration', 'expressive');
  await deps.generate('Motiv', id, 'hero');
  const paid = structuredClone(mocks.stageRows['hero-call']);
  let failure: Error = new Error('liv_cost_context_blocked');
  for (let i = 0; i < 10; i++) failure = new Error('Connection error', { cause: failure });
  mocks.chat.mockRejectedValueOnce(failure);
  await expect(deps.review(article, 'illustration', [{ bytes: image, alt: 'Motiv', caption: 'Tekst' }], id)).rejects.toBe(failure);
  expect(mocks.stageRows['visual-review'].failureDiagnostic.causes).toHaveLength(8);
  expect(mocks.stageRows['hero-call']).toEqual(paid);
});

const savedPlan = { images: Array.from({ length: 3 }, (_, i) => ({ candidateId: null,
  prompt: `En original tegning med et enkelt kunstmotiv nummer ${i}.`,
  alt: `Tegning af kunstmotiv nummer ${i}`, caption: `En tegnet fortolkning af kunsten, motiv ${i}.` })) };
const seedFailed = () => {
  mocks.row = { status: 'failed', articleInputHash: livImageArticleHash(article), article, mode: 'illustration', style: 'expressive',
    createdAt: '2026-01-01T00:00:00.000Z', failedAt: '2026-01-01T00:03:00.000Z', estimatedCost: null };
  mocks.stageRows.plan = { plan: savedPlan, updatedAt: '2026-01-01T00:00:10.000Z' };
};
const storedOriginal = () => {
  const contentHash = createHash('sha256').update(image).digest('hex');
  const storagePath = `editorial-images/liv-daily/${id}/hero-original-${contentHash}.png`;
  return { storagePath, contentHash, bytes: image.length, width: 1000, height: 600,
    url: `https://firebasestorage.googleapis.com/v0/b/test-bucket/o/${encodeURIComponent(storagePath)}?alt=media&token=saved` };
};
it.each([[1200, 675, true], [1920, 1080, true], [1200, 800, false], [1920, 675, false]])('restores only exact native hero pairs %i x %i', async (width, height, valid) => {
  const bytes = await sharp({ create: { width, height, channels: 3, background: '#345678' } }).webp().toBuffer();
  const first = livMediaRuntime();
  await first.claim(id, article, 'photography', 'expressive');
  const stored = await first.store(id, 'hero', bytes);
  await first.record(id, 'plan', { plan: savedPlan });
  const evidence = { ...stored, role: 'hero', kind: 'photography', sourceHash: stored.contentHash,
    alt: 'Et konkret pressemotiv', caption: 'Et billede fra serien.', credit: 'Foto: CHRISTOPHER RAPHAEL',
    sourceUrl: 'https://press.test/photo.jpg', sourcePageUrl: 'https://www.netflix.com/tudum/articles/the-gentlemen' };
  await first.record(id, 'hero', { evidence });
  await first.fail(id);
  const audit = structuredClone(mocks.stageRows);
  const resumed = livMediaRuntime();
  await resumed.claim(id, article, 'photography', 'expressive');
  if (valid) expect(await resumed.resume!(id)).toEqual([{ evidence, bytes }]);
  else await expect(resumed.resume!(id)).rejects.toThrow('saved_evidence_invalid');
  expect(mocks.stageRows).toEqual(audit);
  expect(mocks.chat).not.toHaveBeenCalled();
  expect(mocks.generate).not.toHaveBeenCalled();
});
it('resumes a failed job from its saved plan and original without replacing the audit or calling providers', async () => {
  seedFailed();
  mocks.stageRows['hero-call'] = { status: 'complete', original: storedOriginal(), usage: { total_tokens: 123 } };
  const audit = structuredClone(mocks.stageRows);
  const deps = livMediaRuntime();
  expect(await deps.claim(id, article, 'illustration', 'expressive')).toBeNull();
  vi.stubEnv('AI_IMAGE_GENERATION_ENABLED', 'false');
  expect(await deps.plan(article, 'illustration', 'expressive', [], id)).toEqual(savedPlan);
  expect(await deps.generate(savedPlan.images[0].prompt, id, 'hero')).toEqual(image);
  expect(mocks.row).toMatchObject({ status: 'processing', resumeCount: 1, article,
    createdAt: '2026-01-01T00:00:00.000Z', failedAt: '2026-01-01T00:03:00.000Z' });
  expect(mocks.stageRows).toEqual(audit);
  expect(mocks.chat).not.toHaveBeenCalled();
  expect(mocks.generate).not.toHaveBeenCalled();
  expect(mocks.save).not.toHaveBeenCalled();
});
it('recovers a completed plan call before the plan stage was saved', async () => {
  seedFailed();
  delete mocks.stageRows.plan;
  mocks.stageRows['plan-call'] = { status: 'complete', result: savedPlan, usage: { total_tokens: 123 } };
  const deps = livMediaRuntime();
  await deps.claim(id, article, 'illustration', 'expressive');
  expect(await deps.plan(article, 'illustration', 'expressive', [], id)).toEqual(savedPlan);
  expect(mocks.chat).not.toHaveBeenCalled();
});
it.each(['plan-call', 'hero-call', 'body-1-call', 'body-2-call'])('rejects an ambiguous %s before spending or claiming a failed job', async stage => {
  seedFailed();
  if (stage === 'plan-call') delete mocks.stageRows.plan;
  mocks.stageRows[stage] = { status: 'processing', model: 'original-model' };
  const before = structuredClone(mocks.row);
  await expect(livMediaRuntime().claim(id, article, 'illustration', 'expressive')).rejects.toThrow('reconciliation');
  expect(mocks.row).toEqual(before);
  expect(mocks.chat).not.toHaveBeenCalled();
  expect(mocks.generate).not.toHaveBeenCalled();
});
it('rejects completed image calls without a stored result and assets without a saved plan', async () => {
  seedFailed();
  mocks.stageRows['hero-call'] = { status: 'complete', usage: { total_tokens: 123 } };
  await expect(livMediaRuntime().claim(id, article, 'illustration', 'expressive')).rejects.toThrow('reconciliation');
  mocks.stageRows['hero-call'].original = storedOriginal();
  delete mocks.stageRows.plan;
  await expect(livMediaRuntime().claim(id, article, 'illustration', 'expressive')).rejects.toThrow('reconciliation');
  expect(mocks.generate).not.toHaveBeenCalled();
});
it('allows only one resumption, fences stale workers, and preserves completed jobs from late failures', async () => {
  const old = livMediaRuntime();
  await old.claim(id, article, 'illustration', 'expressive');
  mocks.row.leaseUntil = new Date(Date.now() - 1).toISOString();
  mocks.stageRows.plan = { plan: savedPlan };
  const current = livMediaRuntime();
  await current.claim(id, article, 'illustration', 'expressive');
  await expect(livMediaRuntime().claim(id, article, 'illustration', 'expressive')).rejects.toThrow('reconciliation');
  await expect(old.generate('Do not spend', id, 'hero')).rejects.toThrow('reconciliation');
  await expect(old.complete(id, article)).rejects.toThrow('reconciliation');
  await old.fail(id);
  expect(mocks.row.status).toBe('processing');
  expect(mocks.generate).not.toHaveBeenCalled();
  await current.complete(id, article);
  await current.fail(id);
  expect(mocks.row.status).toBe('complete');
});
it('resumes expired legacy processing jobs but rejects mismatched article, mode and style', async () => {
  seedFailed();
  mocks.row.status = 'processing';
  await expect(livMediaRuntime().claim(id, { ...article, title: 'Changed' }, 'illustration', 'expressive')).rejects.toThrow('reconciliation');
  await expect(livMediaRuntime().claim(id, article, 'photography', 'expressive')).rejects.toThrow('reconciliation');
  await expect(livMediaRuntime().claim(id, article, 'illustration', 'minimal')).rejects.toThrow('reconciliation');
  expect(await livMediaRuntime().claim(id, article, 'illustration', 'expressive')).toBeNull();
});
it.each(['contentHash', 'storagePath', 'url', 'width'])('rejects corrupt saved original %s without regenerating', async field => {
  seedFailed();
  const original = storedOriginal();
  mocks.stageRows['hero-call'] = { status: 'complete', original: { ...original,
    [field]: field === 'width' ? 999 : field === 'url' ? 'https://evil.example/image.png' : 'incorrect' } };
  const deps = livMediaRuntime();
  await deps.claim(id, article, 'illustration', 'expressive');
  await expect(deps.generate('Motiv', id, 'hero')).rejects.toThrow('storage_mismatch');
  expect(mocks.generate).not.toHaveBeenCalled();
});
it('preserves a paid provider result even when the deadline expires during generation', async () => {
  vi.useFakeTimers();
  try {
    const deps = livMediaRuntime(Date.now() + 2000);
    await deps.claim(id, article, 'illustration', 'expressive');
    mocks.generate.mockImplementationOnce(async () => {
      vi.setSystemTime(Date.now() + 3000);
      return { data: [{ b64_json: image.toString('base64') }] };
    });
    expect(await deps.generate('Motiv', id, 'hero')).toEqual(image);
    expect(mocks.stageRows['hero-call']).toMatchObject({ status: 'complete', original: { bytes: image.length } });
  } finally { vi.useRealTimers(); }
});
it('reuses an immutable upload after an interrupted stage write and verifies its bytes', async () => {
  const deps = livMediaRuntime();
  mocks.save.mockRejectedValue({ code: 412 });
  const token = '11111111-1111-4111-8111-111111111111';
  mocks.getMetadata.mockResolvedValue([{ metadata: { firebaseStorageDownloadTokens: token } }]);
  expect((await deps.store(id, 'hero-original', image)).url).toContain(`token=${token}`);
  mocks.download.mockResolvedValue([Buffer.from('corrupt')]);
  await expect(deps.store(id, 'hero-original', image)).rejects.toThrow('storage_mismatch');
  expect(mocks.generate).not.toHaveBeenCalled();
});
it('resumes three saved assets after a visual timeout and archives the prior check without generating again', async () => {
  const input = { ...article, section: 'Kunst', content: '<p>Først.</p><p>Dernæst.</p><p>Til sidst.</p>' };
  const originals = await Promise.all(['#ff3388', '#2244cc', '#ffee00'].map((background, index) =>
    sharp({ create: { width: index === 1 ? 3000 : 1000, height: 600, channels: 3, background } }).png().toBuffer()));
  originals.forEach(bytes => mocks.generate.mockResolvedValueOnce({ data: [{ b64_json: bytes.toString('base64') }] }));
  mocks.chat.mockResolvedValueOnce({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(savedPlan) } }] });
  mocks.chat.mockRejectedValueOnce(new Error('timeout'));
  await expect(prepareLivAutomaticMedia(input, { dayKey: '2026-09-12' }, livMediaRuntime())).rejects.toThrow('liv_media_failed');
  const before = structuredClone(mocks.stageRows);
  const saves = mocks.save.mock.calls.length;
  const failedAt = mocks.row.failedAt;
  mocks.chat.mockResolvedValueOnce({ choices: [{ finish_reason: 'stop', message: { content: '{"pass":true}' } }] });
  const result = await prepareLivAutomaticMedia(input, { dayKey: '2026-09-12' }, livMediaRuntime());
  expect(result.preparedMedia).toHaveLength(3);
  expect(result.preparedMedia![1].height).toBeLessThan(500); // A valid wide source is scaled down for the body.
  expect(result.content.match(/<img /g)).toHaveLength(2);
  expect(mocks.generate).toHaveBeenCalledTimes(3);
  expect(mocks.chat).toHaveBeenCalledTimes(3); // One plan, the failed review, the resumed review.
  expect(mocks.save).toHaveBeenCalledTimes(saves);
  for (const stage of ['plan', 'plan-call', 'hero', 'body-1', 'body-2', 'hero-call', 'body-1-call', 'body-2-call']) expect(mocks.stageRows[stage]).toEqual(before[stage]);
  expect(Object.entries(mocks.stageRows).find(([stage]) => /^visual-review-/.test(stage))?.[1].previous).toEqual(before['visual-review']);
  expect(mocks.row).toMatchObject({ status: 'complete', resumeCount: 1, failedAt });
});
it('does not repeat a completed rejection or an approval bound to the exact review inputs', async () => {
  const images = [{ bytes: image, alt: 'Motiv', caption: 'Tekst' }];
  const first = livMediaRuntime();
  await first.claim(id, article, 'illustration', 'expressive');
  mocks.chat.mockResolvedValueOnce({ choices: [{ finish_reason: 'stop', message: { content: '{"pass":true}' } }] });
  expect(await first.review(article, 'illustration', images, id)).toBe(true);
  await first.fail(id);
  const second = livMediaRuntime();
  await second.claim(id, article, 'illustration', 'expressive');
  expect(await second.review(article, 'illustration', images, id)).toBe(true);
  expect(mocks.chat).toHaveBeenCalledTimes(1);
  await second.fail(id);
  mocks.stageRows['visual-review'].result.pass = false;
  const third = livMediaRuntime();
  await third.claim(id, article, 'illustration', 'expressive');
  expect(await third.review(article, 'illustration', images, id)).toBe(false);
  expect(mocks.chat).toHaveBeenCalledTimes(1);
});
it.each(['plan-call', 'hero-call', 'body-1-call', 'body-2-call', 'visual-review'])('saves exact unpaid %s evidence and archives it on guarded resumption', async stage => {
  const first = livMediaRuntime();
  await first.claim(id, article, 'illustration', 'expressive');
  if (stage !== 'plan-call') mocks.stageRows.plan = { plan: savedPlan };
  const invoke = (deps: ReturnType<typeof livMediaRuntime>) => stage === 'plan-call'
    ? deps.plan(article, 'illustration', 'expressive', [], id)
    : stage === 'visual-review' ? deps.review(article, 'illustration', [{ bytes: image, alt: 'Kunst', caption: 'Kunstmotiv' }], id)
      : deps.generate('Samme motiv', id, stage.replace('-call', '') as 'hero' | 'body-1' | 'body-2');
  const provider = stage === 'plan-call' || stage === 'visual-review' ? mocks.chat : mocks.generate;
  provider.mockRejectedValueOnce(new Error('SDK wrapper', { cause: new LivCostPretransportError('liv_cost_monthly_budget_exceeded') }));
  await expect(invoke(first)).rejects.toThrow('SDK wrapper');
  const unpaid = structuredClone(mocks.stageRows[stage]);
  expect(unpaid).toMatchObject({ status: 'not_started', notStarted: { version: 1, jobId: id, stage,
    providerAttempted: false, code: 'liv_cost_monthly_budget_exceeded', attemptId: unpaid.attemptId, requestHash: unpaid.requestHash } });
  await first.fail(id);
  const second = livMediaRuntime();
  await second.claim(id, article, 'illustration', 'expressive');
  await invoke(second);
  expect(mocks.stageRows[stage].status).toBe('complete');
  expect(mocks.stageRows[stage].notStarted).toBeUndefined();
  expect(mocks.stageRows[`${stage}-unpaid-${unpaid.attemptId}`]).toEqual({ previous: unpaid });
  expect(provider).toHaveBeenCalledTimes(2);
});
it('rejects changed unpaid-stage inputs, double reclamation and stale-owner denial writes', async () => {
  seedFailed();
  const first = livMediaRuntime();
  await first.claim(id, article, 'illustration', 'expressive');
  mocks.generate.mockRejectedValueOnce(new LivCostPretransportError('liv_cost_call_limit_exceeded'));
  await expect(first.generate('Motiv', id, 'hero')).rejects.toThrow('call_limit');
  await first.fail(id);
  const second = livMediaRuntime();
  const claims = await Promise.allSettled([second.claim(id, article, 'illustration', 'expressive'),
    livMediaRuntime().claim(id, article, 'illustration', 'expressive')]);
  expect(claims.map(x => x.status)).toEqual(['fulfilled', 'rejected']);
  await expect(second.generate('Changed motive', id, 'hero')).rejects.toThrow('reconciliation');
  expect(mocks.generate).toHaveBeenCalledTimes(1);
  let rejectPending!: (error: Error) => void;
  mocks.generate.mockImplementationOnce(() => new Promise((_, reject) => { rejectPending = reject; }));
  const pending = second.generate('Motiv', id, 'hero');
  await vi.waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(2));
  await expect(second.generate('Motiv', id, 'hero')).rejects.toThrow('reconciliation');
  mocks.row.owner = 'different-owner';
  rejectPending(new LivCostPretransportError('liv_cost_monthly_budget_exceeded'));
  await expect(pending).rejects.toThrow('reconciliation');
  expect(mocks.stageRows['hero-call'].status).toBe('processing');
});
it.each(['stage', 'requestHash', 'attemptId', 'providerAttempted'])('does not reclaim malformed unpaid evidence: %s', async field => {
  seedFailed();
  const first = livMediaRuntime();
  await first.claim(id, article, 'illustration', 'expressive');
  mocks.generate.mockRejectedValueOnce(new LivCostPretransportError('liv_cost_monthly_budget_exceeded'));
  await expect(first.generate('Motiv', id, 'hero')).rejects.toThrow('monthly_budget');
  await first.fail(id);
  mocks.stageRows['hero-call'].notStarted[field] = field === 'providerAttempted' ? true : 'wrong';
  await expect(livMediaRuntime().claim(id, article, 'illustration', 'expressive')).rejects.toThrow('reconciliation');
  expect(mocks.generate).toHaveBeenCalledTimes(1);
});
it('does not reuse historical unpaid evidence after a resumed call has an ambiguous transport outcome', async () => {
  seedFailed();
  const first = livMediaRuntime();
  await first.claim(id, article, 'illustration', 'expressive');
  mocks.generate.mockRejectedValueOnce(new LivCostPretransportError('liv_cost_monthly_budget_exceeded'));
  await expect(first.generate('Motiv', id, 'hero')).rejects.toThrow('monthly_budget');
  await first.fail(id);
  const second = livMediaRuntime(); await second.claim(id, article, 'illustration', 'expressive');
  mocks.generate.mockRejectedValueOnce(new Error('liv_cost_monthly_budget_exceeded')); // String is NOT unpaid evidence.
  await expect(second.generate('Motiv', id, 'hero')).rejects.toThrow('monthly_budget');
  await second.fail(id);
  await expect(livMediaRuntime().claim(id, article, 'illustration', 'expressive')).rejects.toThrow('reconciliation');
  expect(mocks.stageRows['hero-call'].notStarted).toBeUndefined();
  expect(mocks.generate).toHaveBeenCalledTimes(2);
});
it('resumes only a budget-denied image while preserving the completed paid sibling stages and plan', async () => {
  const input = { ...article, section: 'Kunst', content: '<p>Først.</p><p>Dernæst.</p><p>Til sidst.</p>' };
  const originals = await Promise.all(['#ff3388', '#2244cc', '#ffee00'].map(background =>
    sharp({ create: { width: 1000, height: 600, channels: 3, background } }).png().toBuffer()));
  mocks.chat.mockResolvedValueOnce({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(savedPlan) } }] });
  mocks.generate.mockResolvedValueOnce({ data: [{ b64_json: originals[0].toString('base64') }] })
    .mockRejectedValueOnce(new LivCostPretransportError('liv_cost_monthly_budget_exceeded'))
    .mockResolvedValueOnce({ data: [{ b64_json: originals[2].toString('base64') }] });
  await expect(prepareLivAutomaticMedia(input, { dayKey: '2026-09-12' }, livMediaRuntime())).rejects.toThrow('preparation_incomplete');
  expect(mocks.stageRows['body-1-call'].status).toBe('not_started');
  const before = structuredClone(mocks.stageRows);
  mocks.generate.mockResolvedValueOnce({ data: [{ b64_json: originals[1].toString('base64') }] });
  mocks.chat.mockResolvedValueOnce({ choices: [{ finish_reason: 'stop', message: { content: '{"pass":true}' } }] });
  const result = await prepareLivAutomaticMedia(input, { dayKey: '2026-09-12' }, livMediaRuntime());
  expect(result.preparedMedia).toHaveLength(3);
  expect(mocks.generate).toHaveBeenCalledTimes(4); // Three results plus the explicitly unpaid denial.
  expect(mocks.chat).toHaveBeenCalledTimes(2);
  for (const stage of ['plan', 'plan-call', 'hero', 'hero-call', 'body-2', 'body-2-call']) expect(mocks.stageRows[stage]).toEqual(before[stage]);
  const denied = before['body-1-call'];
  expect(mocks.stageRows[`body-1-call-unpaid-${denied.attemptId}`]).toEqual({ previous: denied });
});
