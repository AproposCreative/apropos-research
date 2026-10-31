import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';

// Execute the actual candidate TypeScript, replacing every runtime dependency
// with inert, in-memory effects before linking. No Firebase/Admin import occurs.
const sourceRoot = new URL('../lib/podcast/', import.meta.url);
const articleId = '6ae5df9e1a88dda9a0b30ba2';
const revision = `cms-sha256-v1:${'a'.repeat(64)}`;
const clone = value => JSON.parse(JSON.stringify(value));
const original = {
  id: 'ai-original-id', guid: 'stable-original-guid', articleSlug: 'original-slug',
  title: 'Original article', subtitle: 'Original subtitle',
  audioURL: 'https://media.invalid/original.m4a', hosts: ['Original host'],
  publishedAt: '2026-10-30T10:00:00.000Z', durationSeconds: 450,
  audioBytes: 12053291, description: 'Original description',
  imageURL: 'https://media.invalid/original.jpg', language: 'da', kind: 'ai',
  articleId, sourceContentRevision: revision,
};
const legacy = {
  id: 'legacy-id', guid: 'legacy-guid', articleSlug: 'legacy-slug',
  title: 'Legacy article', subtitle: 'Legacy subtitle',
  audioURL: 'https://media.invalid/legacy.m4a', hosts: ['Legacy host'],
  publishedAt: '2026-10-29T10:00:00.000Z', kind: 'human',
};
const manifest = episodes => ({ version: 1, updatedAt: '2026-10-30T11:00:00.000Z', episodes });
const incoming = overrides => ({
  slug: 'new-human-slug', title: 'New human recording',
  articleUrl: 'https://editorial.invalid/articles/new-human-slug',
  audioUrl: 'https://media.invalid/new-human.m4a', hosts: ['New host'],
  publishedAt: '2026-10-31T10:00:00.000Z', kind: 'human', ...overrides,
});

async function harness(initial, { downloadError, metadataError, initialMetadata = {}, beforeDownload, beforeSave } = {}) {
  const files = new Map();
  if (initial !== undefined) files.set('manifest.json', typeof initial === 'string' ? initial : JSON.stringify(initial));
  const metadata = new Map();
  if (initial !== undefined) metadata.set('manifest.json', {
    generation: '7', metageneration: '3', contentType: 'application/json',
    metadata: { firebaseStorageDownloadTokens: 'fixture-token' }, ...clone(initialMetadata),
  });
  let nextGeneration = 20;
  const state = { files, metadata, writes: [], feedBuilds: 0, warnings: [], downloads: 0, metadataReads: [] };
  const context = vm.createContext({
    Buffer, process: { env: {} },
    console: { warn: (...args) => state.warnings.push(args) },
  });
  const file = path => ({
    exists: async () => [files.has(path)],
    download: async () => {
      state.downloads++;
      if (downloadError) throw downloadError;
      if (beforeDownload) await beforeDownload(path, state);
      return [Buffer.from(files.get(path))];
    },
    getMetadata: async () => {
      state.metadataReads.push(path);
      if (metadataError) throw metadataError;
      if (!files.has(path)) throw Object.assign(new Error('Synthetic missing object'), {code: 404});
      return [clone(metadata.get(path))];
    },
    save: async (bytes, options = {}) => {
      if (beforeSave) await beforeSave(path, state);
      const current = metadata.get(path), conditions = options.preconditionOpts || {};
      if (conditions.ifGenerationMatch !== undefined &&
          (String(conditions.ifGenerationMatch) === '0' ? files.has(path)
            : String(conditions.ifGenerationMatch) !== current?.generation)) {
        throw Object.assign(new Error('Synthetic generation conflict'), {code: 412});
      }
      if (conditions.ifMetagenerationMatch !== undefined &&
          String(conditions.ifMetagenerationMatch) !== current?.metageneration) {
        throw Object.assign(new Error('Synthetic metageneration conflict'), {code: 412});
      }
      const value = Buffer.isBuffer(bytes) ? bytes.toString('utf8') : String(bytes);
      state.writes.push({ path, value, options: clone(options) }); files.set(path, value);
      metadata.set(path, {...clone(options.metadata || {}), generation: String(++nextGeneration), metageneration: '1'});
    },
  });
  const stubs = new Map([
    ['crypto', { randomUUID: () => '00000000-0000-4000-8000-000000000001' }],
    ['@/lib/podcast/bucket', {
      MANIFEST_PATH: 'manifest.json', FEED_PATH: 'feed.xml',
      getPodcastBucket: () => ({ file }),
      publishedAudioPath: slug => `audio/${slug}.m4a`,
      resolvePodcastBucketName: () => 'fixture.invalid',
    }],
    ['@/lib/podcast/rss', { buildPodcastRssXml: () => { state.feedBuilds++; return '<rss />'; } }],
    ['@/lib/podcast/show-config', {
      podcastRssFeedUrl: () => 'https://fixture.invalid/rss',
      podcastShowCoverUrl: () => 'https://fixture.invalid/cover.jpg',
    }],
    ['./feed-metadata', { readPodcastFeedMetadata: async () => ({}) }],
    ['./delivery-facts', { readPodcastDeliveryFacts: async () => ({}) }],
  ]);
  const modules = new Map();
  async function moduleFor(specifier) {
    if (modules.has(specifier)) return modules.get(specifier);
    if (stubs.has(specifier)) {
      const values = stubs.get(specifier);
      const stub = new vm.SyntheticModule(Object.keys(values), function () {
        for (const [key, value] of Object.entries(values)) this.setExport(key, value);
      }, { context, identifier: specifier });
      modules.set(specifier, stub); return stub;
    }
    const name = specifier === '@/lib/podcast/manifest-format' ? 'manifest-format.ts'
      : specifier === 'candidate:manifest' ? 'manifest.ts' : null;
    assert.ok(name, `Unexpected import blocked: ${specifier}`);
    const url = new URL(name, sourceRoot);
    const text = await readFile(url, 'utf8');
    const mod = new vm.SourceTextModule(stripTypeScriptTypes(text, { mode: 'strip', sourceUrl: url.href }), {
      context, identifier: url.href,
    });
    modules.set(specifier, mod); return mod;
  }
  const main = await moduleFor('candidate:manifest');
  await main.link(moduleFor); await main.evaluate();
  return { state, api: main.namespace, format: modules.get('@/lib/podcast/manifest-format').namespace };
}

test('normalization retains exact complete AI/human source tuples and every supported field', async () => {
  const { format } = await harness(manifest([]));
  for (const episode of [original, { ...original, kind: 'human', sourceContentRevision: 'human-source-revision-7' }]) {
    const normalized = clone(format.normalizeManifestEpisode(clone(episode)));
    for (const [key, value] of Object.entries(episode)) assert.deepEqual(normalized[key], value, key);
  }
  const unbound = format.normalizeManifestEpisode(clone(legacy));
  assert.equal(Object.hasOwn(unbound, 'articleId'), false);
  assert.equal(Object.hasOwn(unbound, 'sourceContentRevision'), false);
});

test('normalization rejects supplied partial or malformed source proof instead of stripping it', async () => {
  const { format } = await harness(manifest([]));
  const variants = [
    { articleId }, { sourceContentRevision: revision },
    { articleId: null, sourceContentRevision: revision },
    { articleId, sourceContentRevision: null },
    { articleId: '', sourceContentRevision: revision },
    { articleId: 'a/b', sourceContentRevision: revision },
    { articleId: ' padded ', sourceContentRevision: revision },
    { articleId: 42, sourceContentRevision: revision },
    { articleId, sourceContentRevision: 'not-a-cms-hash' },
    { articleId, sourceContentRevision: ` ${revision}` },
  ];
  for (const proof of variants) {
    const row = { ...legacy, kind: 'ai', ...proof };
    assert.throws(() => format.normalizeManifestEpisode(row), undefined, JSON.stringify(proof));
  }
});

test('actual read, unrelated upsert, saved JSON and reread preserve other episode identities/proof', async () => {
  const { state, api } = await harness(manifest([clone(original), clone(legacy)]));
  const first = await api.readPodcastManifest();
  assert.equal(first.episodes[0].articleId, articleId);
  await api.upsertManifestEpisode(incoming());
  const saved = JSON.parse(state.files.get('manifest.json'));
  assert.equal(saved.version, 1); assert.equal(saved.episodes.length, 3);
  assert.deepEqual(saved.episodes.map(row => row.articleSlug), ['new-human-slug', 'original-slug', 'legacy-slug']);
  for (const expected of [original, legacy]) {
    const row = saved.episodes.find(value => value.id === expected.id);
    for (const [key, value] of Object.entries(expected)) assert.deepEqual(row[key], value, key);
  }
  const reread = await api.readPodcastManifest();
  assert.equal(reread.episodes.find(row => row.id === original.id).sourceContentRevision, revision);
  assert.deepEqual(state.writes.map(write => write.path), ['manifest.json', 'feed.xml']);
});

test('partial or invalid existing source tuples abort upsert without changing manifest or RSS', async () => {
  const variants = [
    { articleId }, { sourceContentRevision: revision },
    { articleId: null, sourceContentRevision: revision },
    { articleId, sourceContentRevision: 42 },
    { articleId: '../bad', sourceContentRevision: revision },
    { articleId, sourceContentRevision: 'cms-sha256-v1:short' },
  ];
  for (const proof of variants) {
    const start = manifest([{ ...legacy, kind: 'ai', ...proof }, clone(original)]);
    const { state, api } = await harness(start);
    const previous = state.files.get('manifest.json');
    await assert.rejects(api.upsertManifestEpisode(incoming()));
    assert.equal(state.files.get('manifest.json'), previous);
    assert.equal(state.writes.length, 0); assert.equal(state.feedBuilds, 0);
  }
});

test('malformed existing catalogs never become empty or reduced saved catalogs', async () => {
  for (const raw of ['{broken', 'null', '[]', '{}', '{"episodes":null}',
    JSON.stringify(manifest([null])), JSON.stringify(manifest([{}])),
    JSON.stringify(manifest([clone(original), { ...legacy, title: '' }]))]) {
    const { state, api } = await harness(raw);
    await assert.rejects(api.upsertManifestEpisode(incoming()));
    assert.equal(state.files.get('manifest.json'), raw);
    assert.equal(state.writes.length, 0); assert.equal(state.feedBuilds, 0);
  }
});

test('same-slug new audio does not inherit the replaced recording source proof', async () => {
  const { state, api } = await harness(manifest([clone(original), clone(legacy)]));
  await api.upsertManifestEpisode(incoming({ slug: original.articleSlug, audioUrl: 'https://media.invalid/replaced.m4a' }));
  const saved = JSON.parse(state.files.get('manifest.json'));
  const replaced = saved.episodes.find(row => row.articleSlug === original.articleSlug);
  assert.equal(replaced.audioURL, 'https://media.invalid/replaced.m4a');
  assert.equal(Object.hasOwn(replaced, 'articleId'), false);
  assert.equal(Object.hasOwn(replaced, 'sourceContentRevision'), false);
  assert.equal(saved.episodes.filter(row => row.articleSlug === original.articleSlug).length, 1);
});

test('producer-supplied complete proof passes builder/upsert; invalid new proof writes nothing', async () => {
  const { format, state, api } = await harness(manifest([clone(legacy)]));
  const built = format.buildManifestEpisode({ slug: 'new-bound', title: 'Bound',
    audioURL: 'https://media.invalid/bound.m4a', kind: 'ai', articleId, sourceContentRevision: revision });
  assert.equal(built.articleId, articleId); assert.equal(built.sourceContentRevision, revision);
  await api.upsertManifestEpisode(incoming({ slug: 'new-bound', kind: 'ai', articleId, sourceContentRevision: revision }));
  const saved = JSON.parse(state.files.get('manifest.json'));
  assert.equal(saved.episodes[0].articleId, articleId);
  assert.equal(saved.episodes[0].sourceContentRevision, revision);
  for (const proof of [{ articleId }, { sourceContentRevision: revision }, { articleId, sourceContentRevision: 'bad' }]) {
    const isolated = await harness(manifest([clone(legacy)]));
    const previous = isolated.state.files.get('manifest.json');
    await assert.rejects(isolated.api.upsertManifestEpisode(incoming({ kind: 'ai', ...proof })));
    assert.equal(isolated.state.files.get('manifest.json'), previous);
    assert.equal(isolated.state.writes.length, 0);
  }
});

test('actual storage read failure propagates before any write', async () => {
  const failure = new Error('synthetic storage outage');
  const { state, api } = await harness(manifest([clone(original)]), { downloadError: failure });
  await assert.rejects(api.upsertManifestEpisode(incoming()), error => error === failure);
  assert.equal(state.writes.length, 0); assert.equal(state.feedBuilds, 0);
});

test('genuinely absent manifest still permits a first legacy online publication', async () => {
  const { state, api } = await harness(undefined);
  await api.upsertManifestEpisode(incoming());
  const saved = JSON.parse(state.files.get('manifest.json'));
  assert.equal(saved.episodes.length, 1); assert.equal(saved.version, 1);
  assert.equal(Object.hasOwn(saved.episodes[0], 'articleId'), false);
  assert.equal(Object.hasOwn(saved.episodes[0], 'sourceContentRevision'), false);
  assert.equal(state.downloads, 0);
});

test('case-insensitive AI kind remains AI and cannot bypass strict source revision validation', async () => {
  const { format } = await harness(manifest([]));
  for (const kind of ['AI', 'Ai', 'aI']) {
    const normalized = format.normalizeManifestEpisode({ ...original, kind });
    assert.equal(normalized.kind, 'ai');
    assert.equal(normalized.sourceContentRevision, revision);
    assert.throws(() => format.normalizeManifestEpisode({ ...original, kind, sourceContentRevision: 'not-a-cms-hash' }));
    const input = { slug: original.articleSlug, title: original.title, audioURL: original.audioURL,
      kind, articleId, sourceContentRevision: revision };
    assert.equal(format.buildManifestEpisode(input).kind, 'ai');
    assert.throws(() => format.buildManifestEpisode({ ...input, sourceContentRevision: 'not-a-cms-hash' }));
    const isolated = await harness(manifest([{ ...original, kind, sourceContentRevision: 'not-a-cms-hash' }]));
    await assert.rejects(isolated.api.upsertManifestEpisode(incoming()));
    assert.equal(isolated.state.writes.length, 0);
    const invalidIncoming = await harness(manifest([clone(legacy)]));
    await assert.rejects(invalidIncoming.api.upsertManifestEpisode(incoming({ kind, articleId, sourceContentRevision: 'not-a-cms-hash' })));
    assert.equal(invalidIncoming.state.writes.length, 0);
  }
});

test('Unicode control/format characters are rejected consistently with native asset admission', async () => {
  const { format } = await harness(manifest([]));
  for (const proof of [
    { articleId: `abc\u200bdef`, sourceContentRevision: revision },
    { articleId, sourceContentRevision: `human\u202erevision` },
  ]) {
    const row = { ...original, kind: 'human', ...proof };
    assert.throws(() => format.normalizeManifestEpisode(row));
    const isolated = await harness(manifest([row]));
    await assert.rejects(isolated.api.upsertManifestEpisode(incoming()));
    assert.equal(isolated.state.writes.length, 0);
  }
});

test('known snapshot uses both CAS values and preserves writable headers, full custom metadata and original token list', async () => {
  const initialMetadata = { cacheControl: 'private, max-age=42', contentType: 'application/custom+json',
    contentDisposition: 'inline', contentEncoding: 'identity', contentLanguage: 'da',
    customTime: '2026-10-30T11:00:00.000Z', temporaryHold: false, eventBasedHold: false,
    metadata: {firebaseStorageDownloadTokens: 'first-token,second-token', editorialMarker: 'keep', rawValue: ' untouched '} };
  const {state, api} = await harness(manifest([clone(original)]), {initialMetadata});
  await api.upsertManifestEpisode(incoming());
  const write = state.writes.find(value => value.path === 'manifest.json');
  assert.deepEqual(write.options.preconditionOpts, {ifGenerationMatch: '7', ifMetagenerationMatch: '3'});
  assert.deepEqual(write.options.metadata, initialMetadata);
  assert.equal(state.metadataReads.filter(path => path === 'manifest.json').length, 1);
});

test('worker G2 publication after Research G1 read wins without stale overwrite or RSS save', async () => {
  const concurrent = JSON.stringify(manifest([{...original, audioURL: 'https://media.invalid/worker-g2.m4a'}]));
  const {state, api} = await harness(manifest([clone(original)]), {beforeSave: (path, state) => {
    if (path !== 'manifest.json') return;
    state.files.set(path, concurrent);
    state.metadata.set(path, {...state.metadata.get(path), generation: '8', metageneration: '1'});
  }});
  await assert.rejects(api.upsertManifestEpisode(incoming()), /generation conflict/);
  assert.equal(state.files.get('manifest.json'), concurrent);
  assert.equal(state.writes.length, 0); assert.equal(state.feedBuilds, 0);
});

test('G1 metadata followed by G2 downloaded bytes still cannot pass G1 CAS or retry', async () => {
  const concurrent = JSON.stringify(manifest([{...original, guid: 'worker-g2-identity'}]));
  const {state, api} = await harness(manifest([clone(original)]), {beforeDownload: (path, state) => {
    if (path !== 'manifest.json') return;
    state.files.set(path, concurrent);
    state.metadata.set(path, {...state.metadata.get(path), generation: '8', metageneration: '1'});
  }});
  await assert.rejects(api.upsertManifestEpisode(incoming()), /generation conflict/);
  assert.equal(state.files.get('manifest.json'), concurrent);
  assert.equal(state.downloads, 1); assert.equal(state.writes.length, 0); assert.equal(state.feedBuilds, 0);
});

test('metadata-only concurrent update wins without lost custom metadata or feed publication', async () => {
  const {state, api} = await harness(manifest([clone(original)]), {beforeSave: (path, state) => {
    if (path !== 'manifest.json') return;
    const current = state.metadata.get(path);
    state.metadata.set(path, {...current, metageneration: '4', metadata: {...current.metadata, concurrentMarker: 'new'}});
  }});
  const before = state.files.get('manifest.json');
  await assert.rejects(api.upsertManifestEpisode(incoming()), /metageneration conflict/);
  assert.equal(state.files.get('manifest.json'), before);
  assert.equal(state.metadata.get('manifest.json').metadata.concurrentMarker, 'new');
  assert.equal(state.writes.length, 0); assert.equal(state.feedBuilds, 0);
});

test('unknown metadata errors and held/unknown retention policies fail before any catalog or RSS write', async () => {
  const unavailable = Object.assign(new Error('Synthetic metadata unavailable'), {code: 503});
  const unknown = await harness(manifest([clone(original)]), {metadataError: unavailable});
  await assert.rejects(unknown.api.upsertManifestEpisode(incoming()), error => error === unavailable);
  assert.equal(unknown.state.writes.length, 0); assert.equal(unknown.state.downloads, 0);
  for (const initialMetadata of [{generation: null}, {metageneration: '0'}, {temporaryHold: true},
    {eventBasedHold: true}, {retention: {mode: 'Locked'}}, {retentionExpirationTime: '2030-01-01T00:00:00Z'},
    {futureRetentionMode: 'unsupported'}]) {
    const {state, api} = await harness(manifest([clone(original)]), {initialMetadata});
    await assert.rejects(api.upsertManifestEpisode(incoming()));
    assert.equal(state.writes.length, 0); assert.equal(state.feedBuilds, 0);
  }
});

test('authoritative absence uses generation zero and cannot overwrite an object created after the absence read', async () => {
  const initial = await harness(undefined);
  await initial.api.upsertManifestEpisode(incoming());
  const write = initial.state.writes.find(value => value.path === 'manifest.json');
  assert.deepEqual(write.options.preconditionOpts, {ifGenerationMatch: 0});
  const concurrent = JSON.stringify(manifest([clone(legacy)]));
  const raced = await harness(undefined, {beforeSave: (path, state) => {
    if (path !== 'manifest.json') return;
    state.files.set(path, concurrent);
    state.metadata.set(path, {generation: '9', metageneration: '1', metadata: {firebaseStorageDownloadTokens: 'concurrent-token'}});
  }});
  await assert.rejects(raced.api.upsertManifestEpisode(incoming()), /generation conflict/);
  assert.equal(raced.state.files.get('manifest.json'), concurrent);
  assert.equal(raced.state.writes.length, 0); assert.equal(raced.state.feedBuilds, 0);
});

test('encoded catalogs fail before automatic decompression can turn preserved encoding into a false header', async () => {
  for (const contentEncoding of ['gzip', 'br', 'GZIP', '', 'unknown']) {
    const {state, api} = await harness(manifest([clone(original)]), {initialMetadata: {contentEncoding}});
    const before = state.files.get('manifest.json');
    await assert.rejects(api.upsertManifestEpisode(incoming()), /encoding/i);
    assert.equal(state.downloads, 0); assert.equal(state.writes.length, 0); assert.equal(state.feedBuilds, 0);
    assert.equal(state.files.get('manifest.json'), before);
  }
});
