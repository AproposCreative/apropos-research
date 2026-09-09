// Run with node --test. Kept outside Vitest's *.spec.* matching during recovery.
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';

async function pureModule(file) {
  const source = stripTypeScriptTypes(readFileSync(file, 'utf8'));
  assert.ok(!/\bimport\s/.test(source), 'Pure test modules cannot have runtime dependencies');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}
const audience = await pureModule('lib/editorial/audience-signals.ts');
const cms = await pureModule('lib/editorial/cms-preflight.ts');
const meta = await pureModule('lib/liv/cms-webflow-meta.ts');

test('audience aggregates title variants and compares one day with seven-day mean', () => {
  const result = audience.buildAudienceSignals([
    { path: '/articles/kunst?utm_source=x', title: 'Museet åbner igen', views: 40 },
    { path: '/articles/kunst/', title: 'Ny titel', views: 60 },
    { path: '/', title: 'Forside', views: 10000 },
  ], [{ path: '/articles/kunst', title: 'Museet', views: 140 }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].views, 100);
  assert.equal(result[0].baselineDailyViews, 20);
  assert.equal(result[0].growthRatio, 5);
});

test('tiny samples, invalid numbers and stable popular articles do not trend', () => {
  assert.deepEqual(audience.buildAudienceSignals([
    { path: '/articles/lille', title: 'Lille', views: 10 },
    { path: '/articles/fejl', title: 'Fejl', views: Infinity },
    { path: '/articles/stor', title: 'Stor', views: 1000 },
  ], [{ path: '/articles/stor', title: 'Stor', views: 7000 }]), []);
});

test('canonical source removes trackers but preserves meaningful query parameters', () => {
  assert.equal(audience.canonicalSourceUrl('https://www.example.org/a/?utm_source=x&id=2#top'), 'https://example.org/a?id=2');
  assert.equal(audience.canonicalSourceUrl('javascript:alert(1)'), null);
  assert.equal(audience.canonicalSourceUrl('https://user:password@example.org'), null);
});

const article = { title: 'Et museum i forandring', subtitle: 'Kunsten finder nye rum', intro: 'Museets sale har fået nye værker.', slug: 'museum-forandring', section: 'Kultur', content: 'kunst '.repeat(1000), seoTitle: 'Et museum i forandring', seoDescription: 'En analyse af museets nye retning.', researchSources: [{ url: 'https://example.org/a' }, { url: 'https://example.net/b' }] };

test('structurally complete CMS draft is never a publication approval', () => {
  const result = cms.checkCmsDraft(article);
  assert.equal(result.structureReady, true);
  assert.equal(result.publicationReady, false);
  assert.equal(result.readTime, 5);
});

test('CMS detects missing SEO, em dash, duplicates in sources and short text', () => {
  const result = cms.checkCmsDraft({ ...article, title: 'Titel — tekst', content: 'kort', seoTitle: '', researchSources: [{ url: 'https://example.org/a' }, { url: 'https://example.org/a' }] });
  for (const id of ['seo', 'style', 'length', 'sources']) assert.equal(result.checks.find(c => c.id === id).ok, false);
});

test('CMS topics do not invent music tags; URL does not prove press credit', () => {
  const topics = meta.buildTopicsSelectedForCms({ title: 'Museet', category: 'Billedkunst' }, { ...article, tags: ['Museum'] });
  assert.ok(!topics.includes('Musik'));
  assert.ok(!topics.includes('Festival'));
  assert.equal(meta.fotoCreditFromFeaturedUrl('https://example.org/press.jpg'), undefined);
});

async function gates({ complete = true, grounded = false, claims = [{ status: 'verified' }], tips = 'Fin tekst.' } = {}) {
  const source = stripTypeScriptTypes(readFileSync('lib/liv/run-safety-gates.ts', 'utf8'))
    .replace(/^import .*;\s*$/gm, '').replace(/^export /gm, '');
  const values = [{ data: { metrics: { wordCount: 1000, plagiarismRisk: 'low' } } }, { ok: true, verificationMethod: grounded ? 'retrieved-sources' : undefined, results: claims }, { data: { tips } }];
  const context = vm.createContext({
    URL,
    logger: { warn() {} },
    internalApiHeaders: () => ({}),
    checkSourceSimilarity: async () => ({ pass: true, complete, scores: { embeddingSim: 0, ngramJaccard: 0, openingSim: 0 } }),
    fetch: async () => { assert.ok(values.length); const value = values.shift(); return { ok: true, status: 200, json: async () => value }; },
  });
  const run = vm.runInContext(`${source}\nrunSafetyGates`, context);
  return run({ baseUrl: 'https://invalid.example', title: 'Test', content: 'kunst '.repeat(1000), sourceExcerpt: 'kilde '.repeat(100), requireCompleteVerification: true });
}

test('auto-publish rejects model-only factcheck, empty claims and failed embedding', async () => {
  for (const options of [{}, { grounded: true, claims: [] }, { grounded: true, complete: false }, { grounded: true, tips: '' }, { grounded: true, claims: [{ status: 'unverifiable' }] }]) {
    const result = await gates(options);
    assert.equal(result.pass, false);
    assert.equal(result.failedGate, 'verification-complete');
  }
});

test('complete synthetic gate responses pass; this does not assert live verification', async () => {
  assert.equal((await gates({ grounded: true })).pass, true);
});

test('discovery covers ten beats before repeating a beat and never infers first-hand reviews', async () => {
  const store = await pureModule('lib/editorial/signal-store.ts');
  const source = stripTypeScriptTypes(readFileSync('lib/editorial/engine.ts', 'utf8'))
    .replace(/^import[\s\S]*?;\s*/gm, '').replace(/^export /gm, '');
  const context = vm.createContext({
    ...store,
    audienceMatch: audience.audienceMatch,
    performMultiStrategySearch: async queries => [0, 1].map(i => ({
      title: `${queries[0].query} film ${i}`,
      content: 'Et dokumenteret nyhedssignal, som endnu kræver redaktionel vurdering.',
      source: 'Test News', url: `https://example.org/${encodeURIComponent(queries[0].query)}/${i}`,
    })),
  });
  const discover = vm.runInContext(`${source}\ndiscoverSignals`, context);
  const stories = await discover({ limit: 10 });
  assert.equal(stories.length, 10);
  assert.equal(new Set(stories.map(s => s.beat)).size, 10);
  assert.ok(stories.every(s => s.suggestedArticleType !== 'review'));
});
