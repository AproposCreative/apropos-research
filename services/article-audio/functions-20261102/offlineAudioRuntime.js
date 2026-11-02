// SDK-free adapter for the existing narration_queue producer. Constructed by the
// reviewed worker with its existing Firestore/Storage clients; importing is inert.
const {createHash} = require("node:crypto");
const maintenance = require("./offlineAudioMaintenance");
const {narrationAddress, sameNarrationNamespace} = require("./articleLocale");
const {canonicalJSON} = require("./offlineAudioSource.cjs");
const {createCatalogACLGuard, metadataIdentity} = require("./catalogACL.cjs");
const {createNarrationOwnership} = require("./offlineAudioQueueOwnership");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const audioFile = path => /\.(m4a|mp3|aac|wav|mp4)$/i.test(path);
const generation = value => /^[1-9]\d*$/.test(String(value));
const identity = value => JSON.stringify(maintenance.objectIdentity(value));

function createLegacyOfflineRuntime({db, bucket, readRecipe, render, liveSource, englishEnabled = false, policy = () => ({enabled: false})}) {
  if (!db || !bucket || typeof bucket.name !== "string" || typeof readRecipe !== "function" || typeof render !== "function") {
    throw new Error("Existing producer capabilities required");
  }
  const ownership = createNarrationOwnership({db});
  const catalogGuard = createCatalogACLGuard({bucket});
  const assertEnabled = async () => {
    if (policy()?.enabled !== true) throw new Error("Automatic offline maintenance disabled");
    await catalogGuard.capture();
  };
  async function readArticle(id) {
    if (!/^(?:en_)?[a-f\d]{24}$/.test(id)) throw new Error("Canonical article ID required");
    const english = /^en_/.test(id);
    if (english && englishEnabled !== true) throw new Error("English offline audio disabled");
    const collection = english ? "articles_en" : "articles";
    const doc = await db.collection(collection).doc(id).get();
    if (!doc.exists) throw new Error("Published article disappeared");
    const article = doc.data();
    maintenance.sourceOf(article);
    if (article.id !== id) throw new Error("Canonical document identity changed");
    const live = await liveSource.one(id);
    if (!live || live.id !== id || live.contentRevision !== article.contentRevision) throw new Error("Current live CMS publication changed");
    if (!english) {
    const matches = await db.collection(collection).where("fieldData.slug", "==", article.fieldData.slug).limit(10001).get();
    if (matches.docs.length > 10000) throw new Error("Canonical slug inventory exceeds bound");
    const published = matches.docs.filter(doc => {
      try {return maintenance.sourceOf(doc.data()).articleSlug === article.fieldData.slug;} catch {return false;}
    });
    if (published.length !== 1 || published[0].id !== id) throw new Error("Canonical slug is no longer unique");
    }
    return article;
  }
  async function exactBytes(path, observed, maximum = 256 * 1024 * 1024) {
    if (!generation(observed.generation) || !generation(observed.metageneration) ||
        !Number.isSafeInteger(Number(observed.size)) || Number(observed.size) < 1 || Number(observed.size) > maximum) {
      throw Object.assign(new Error("Invalid generation-bound input"), {code: "UNSUPPORTED_INPUT_SHAPE"});
    }
    // Read that generation, then recheck the live object's metadata. A new live
    // generation/metageneration cannot authorize these old bytes.
    const [bytes] = await bucket.file(path, {generation: String(observed.generation)}).download();
    const [after] = await bucket.file(path).getMetadata(path === "podcasts/manifest.json" ? {projection: "full"} : undefined);
    if (!Buffer.isBuffer(bytes) || bytes.length !== Number(observed.size) ||
        (path === "podcasts/manifest.json" ? metadataIdentity(after) !== metadataIdentity(observed) :
          JSON.stringify(after) !== JSON.stringify(observed))) throw new Error("Storage input changed during read");
    return bytes;
  }
  async function readObject(path) {
    if (typeof path !== "string" || !/^podcasts\/(articles|narration)\//.test(path) || path.includes("..")) {
      throw new Error("Exact podcast object path required");
    }
    const [metadata] = await bucket.file(path).getMetadata();
    let sidecar = null;
    if (audioFile(path) && metadata.metadata?.offlineAudioBinding) {
      try {
        const sidecarPath = `${path}.json`, [sidecarMetadata] = await bucket.file(sidecarPath).getMetadata();
        sidecar = JSON.parse((await exactBytes(sidecarPath, sidecarMetadata, 1024 * 1024)).toString("utf8"));
      } catch (error) {
        // Definitive missing/malformed proof blocks THIS object. Auth, transport
        // and generation uncertainty still abort the complete inventory.
        if (error?.code !== 404 && error?.code !== "UNSUPPORTED_INPUT_SHAPE" && !(error instanceof SyntaxError)) throw error;
      }
    }
    const object = {path, generation: String(metadata.generation), metageneration: String(metadata.metageneration),
      size: Number(metadata.size), metadata: metadata.metadata || {}, sidecar};
    // Retain known unusable/empty objects in complete path inventory. They cannot
    // pass objectIdentity/validBinding, and must still prevent a false vacancy.
    return object;
  }
  async function readCatalog() {
    const path = "podcasts/manifest.json", snapshot = await catalogGuard.capture(), metadata = snapshot.metadata;
    const manifest = JSON.parse((await exactBytes(path, metadata, 8 * 1024 * 1024)).toString("utf8"));
    if (!Array.isArray(manifest.episodes) || manifest.episodes.length > 4096) throw new Error("Invalid complete raw catalog");
    return {manifest, metadata, generation: String(metadata.generation), metageneration: String(metadata.metageneration)};
  }
  async function readAudio(path, expectedGeneration) {
    const [metadata] = await bucket.file(path).getMetadata();
    if (String(metadata.generation) !== expectedGeneration) throw new Error("Original audio generation changed");
    return exactBytes(path, metadata);
  }
  async function allObjects(prefixes = ["podcasts/articles/", "podcasts/narration/"]) {
    const objects = [], paths = new Set();
    for (const prefix of prefixes) {
      let query = {prefix, autoPaginate: false, maxResults: 250};
      const pages = new Set();
      while (query) {
        const pageKey = JSON.stringify(query);
        if (pages.has(pageKey)) throw new Error("Storage inventory pagination repeated");
        pages.add(pageKey);
        const [files, next] = await bucket.getFiles(query);
        for (const file of files) {
          if (paths.has(file.name) || paths.size >= 20000) throw new Error("Storage inventory is incomplete or ambiguous");
          paths.add(file.name);objects.push(await readObject(file.name));
        }
        query = next || null;
      }
    }
    return objects;
  }
  async function loadSnapshot() {
    await assertEnabled();
    const result = await db.collection("articles").where("isDraft", "==", false).limit(10001).get();
    if (result.docs.length > 10000) throw new Error("Canonical inventory exceeds bounded limit");
    const live = new Map((await liveSource.all()).map(item => [item.id, item]));
    const articles = result.docs.map(doc => {
      const article = doc.data();
      if (doc.id !== article.id) throw new Error("Canonical document identity mismatch");
      return article;
    }).filter(article => live.get(article.id)?.contentRevision === article.contentRevision);
    const catalog = await readCatalog(), objects = await allObjects(), audioJobs = await readAudioJobs();
    const snapshot = {version: 1, complete: true, bucket: bucket.name, articles,
      catalog: catalog.manifest, objects, queueInventoryComplete: true, audioJobs,
      historicalProofs: [], humanAttachments: [], narrationScripts: {},
      ...(englishEnabled === true ? {englishInventory: {enabled: true, complete: false}} : {})};
    // No positive historical AI proof is invented. Unproven old AI uses the
    // existing renderer, subject to explicit activation and its provider quota.
    for (const article of articles) {
      try {
        const source = maintenance.sourceOf(article);
        snapshot.narrationScripts[source.articleId] = await readRecipe({slug: source.articleSlug, articleId: source.articleId});
      } catch {} // Bad CMS source stays blocked; never repair/re-hash it here.
    }
    for (const row of snapshot.catalog.episodes) {
      if (row.kind === "ai") continue;
      try {
        const path = maintenance.pathFromURL(row.audioURL, bucket.name), object = objects.find(o => o.path === path);
        // Foreign EN-looking rows cannot acquire DA human-read authority even
        // when their kind or remaining source association is malformed.
        if (/^en_/.test(row.articleId || "") || /^(?:ai-)?en_/.test(row.id || "") ||
            /^podcasts\/(?:articles|narration)\/en_/.test(path || "")) continue;
        if (!object) continue;
        const bytes = await readAudio(path, object.generation);
        snapshot.humanAttachments.push(maintenance.qualifyPublishedHumanAttachment({snapshot, episodeID: row.id, bytes}));
      } catch {} // Ambiguous or non-M4A input cannot acquire a fake M4A proof.
    }
    if (englishEnabled === true) {
      // The original primary DA snapshot is complete before any EN-only read.
      // Planning is pure: no admission, reservation, provider or persistent state.
      const primary = maintenance.planOfflineAudioMaintenance({snapshot, policy: policy(),
        verifyHistoricalProof: () => false,
        verifyHumanAttachment: (proof, original, source) => proof.authority === "published-human-storage-v1" &&
          proof.objectPath === original.path && proof.objectGeneration === original.generation && proof.articleId === source.articleId &&
          snapshot.humanAttachments.some(actual => JSON.stringify(actual) === JSON.stringify(proof)),
        qualifyNarration: ({article}) => snapshot.narrationScripts[article.id]});
      // Snapshot observation only; the existing transactional admit/claim remain
      // authoritative. Terminal/parked/unknown claims never gain retry authority
      // and do not make unrelated EN qualification wait forever.
      const observedExecutablePrimary = primary.works.some(work => {
        const matches = audioJobs.filter(job => job.id === work.key);
        if (!matches.length) return true;
        if (matches.length !== 1) return false;
        const job = matches[0], expected = maintenance.payloadFor(work);
        return job.status === "pending" && job.noNotify === true && job.slug === expected.slug && job.articleId === expected.articleId &&
          canonicalJSON(job.offlineMaintenance) === canonicalJSON(expected.offlineMaintenance) &&
          canonicalJSON(job.offlineRepair || null) === canonicalJSON(expected.offlineRepair || null) &&
          (!Number.isFinite(job.availableAtMs) || job.availableAtMs <= Date.now());
      });
      if (observedExecutablePrimary) {
        snapshot.englishInventory = {enabled: true, complete: false, reason: "deferred_for_primary_work"};
      } else try {
        if (typeof liveSource.allEnglish !== "function") throw new Error("English LIVE capability absent");
        const en = await db.collection("articles_en").where("isDraft", "==", false).limit(401).get();
        if (en.docs.length > 400) throw new Error("English mirror bound");
        const enLive = new Map((await liveSource.allEnglish()).map(item => [item.id, item]));
        const verified = en.docs.map(doc => {
          const article = doc.data();
          if (doc.id !== article.id) throw new Error("English document mismatch");
          const source = maintenance.sourceOf(article);
          if (!narrationAddress(source.articleId, source.articleSlug).english) throw new Error("English collection mismatch");
          return article;
        }).filter(article => enLive.get(article.id)?.contentRevision === article.contentRevision);
        if (articles.length + verified.length > 10000) {
          snapshot.englishInventory = {enabled: true, complete: false, reason: "english_combined_inventory_bound"};
        } else {
          articles.push(...verified);snapshot.englishInventory = {enabled: true, complete: true};
          for (const article of verified) {
            try {const source = maintenance.sourceOf(article);snapshot.narrationScripts[source.articleId] =
              await readRecipe({slug: source.articleSlug, articleId: source.articleId});} catch {}
          }
        }
      } catch {snapshot.englishInventory = {enabled: true, complete: false, reason: "english_inventory_unqualified"};}
    }
    await assertEnabled();
    return snapshot;
  }
  async function readAudioJobs() {
    const result = await db.collection("narration_queue").limit(20001).get();
    if (result.docs.length > 20000) throw new Error("Audio queue inventory exceeds bounded limit");
    return result.docs.map(doc => ({...doc.data(), id: doc.id}));
  }
  async function upload(path, bytes, token, metadata, options) {
    await assertEnabled();
    if (options?.ifGenerationMatch !== 0 || !Buffer.isBuffer(bytes)) throw new Error("Immutable creation required");
    await bucket.file(path).save(bytes, {resumable: false, preconditionOpts: {ifGenerationMatch: 0},
      metadata: {contentType: "audio/mp4", metadata: {...metadata, firebaseStorageDownloadTokens: token}}});
    const [actual] = await bucket.file(path).getMetadata();
    if (!generation(actual.generation) || Number(actual.size) !== bytes.length ||
        actual.metadata?.firebaseStorageDownloadTokens !== token) throw new Error("Immutable upload not acknowledged");
    return actual;
  }
  const adapters = {
    readRuntimePolicy: async () => {if (policy()?.enabled === true) await assertEnabled();return policy();},
    assertRuntimePolicy: assertEnabled, readArticle, readObject, readAudio, readCatalog,
    readNarrationScript: work => readRecipe({slug: work.source.articleSlug, articleId: work.source.articleId}),
    async assertNoAudio(work, {allowImmutablePath, preparingBinding = null}) {
      const catalog = (await readCatalog()).manifest;
      const prefixes = [`podcasts/narration/${narrationAddress(work.source.articleId, work.source.articleSlug).stem}/`, `podcasts/articles/${narrationAddress(work.source.articleId, work.source.articleSlug).stem}/`];
      if (catalog.episodes.some(row => row.id === work.targetID || row.articleId === work.source.articleId ||
          (!narrationAddress(work.source.articleId, work.source.articleSlug).english && sameNarrationNamespace(work.source.articleId, row.articleId) && row.articleSlug === work.source.articleSlug) || prefixes.some(prefix =>
            maintenance.pathFromURL(row.audioURL, bucket.name)?.startsWith(prefix)))) throw new Error("Audio catalog vacancy changed");
      const objects = await allObjects(prefixes);
      const acceptedOutput = allowImmutablePath && objects.find(object => object.path === allowImmutablePath && maintenance.validBinding(object, work.source));
      if (objects.some(object => {
        if ((preparingBinding || acceptedOutput) && object.path === `${allowImmutablePath}.json`) return false;
        if (object.path !== allowImmutablePath) return true;
        if (preparingBinding) return object.metadata.offlineAudioBinding !== JSON.stringify(preparingBinding) || object.size !== preparingBinding.audioBytes;
        return !maintenance.validBinding(object, work.source);
      })) {
        throw new Error("Audio storage vacancy changed");
      }
      const jobs = await readAudioJobs();
      const ownsCanonicalReservation = job => job.id === narrationAddress(work.source.articleId, work.source.articleSlug).queueID && job.status === "offline_reserved" &&
        job.slug === work.source.articleSlug && job.articleId === work.source.articleId && job.offlineMaintenanceReservation === work.key;
      if (jobs.some(job => job.id !== work.key && !ownsCanonicalReservation(job) &&
          (job.id === narrationAddress(work.source.articleId, work.source.articleSlug).queueID || job.articleId === work.source.articleId || (!narrationAddress(work.source.articleId, work.source.articleSlug).english && sameNarrationNamespace(work.source.articleId, job.articleId) && job.slug === work.source.articleSlug)) &&
          !(["no_article", "empty", "deferred_quota"].includes(job.status) && job.result === job.status &&
            (!narrationAddress(work.source.articleId, work.source.articleSlug).english || (job.articleId === work.source.articleId && job.slug === work.source.articleSlug))))) {
        throw new Error("Existing audio job prevents duplicate synthesis");
      }
    },
    async publicURL(path, token) {
      if (!token) {const [metadata] = await bucket.file(path).getMetadata();token = metadata.metadata?.firebaseStorageDownloadTokens?.split(",")[0];}
      if (typeof token !== "string" || !/^[a-f\d-]{36}$/i.test(token)) throw new Error("Existing object token required");
      return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
    },
    uploadHuman: (rendered, bytes, options) => upload(rendered.path, bytes, rendered.token, rendered.metadata, options),
    uploadAI: (rendered, bytes, options) => upload(rendered.path, bytes, rendered.token, rendered.metadata, options),
    async writeSidecar(path, payload, options) {
      await assertEnabled();
      if (options?.ifGenerationMatch !== 0) throw new Error("Immutable sidecar required");
      await bucket.file(path).save(Buffer.from(JSON.stringify(payload)), {resumable: false,
        preconditionOpts: {ifGenerationMatch: 0}, metadata: {contentType: "application/json"}});
    },
    async commitCatalog({manifest, metadata, ifGenerationMatch, ifMetagenerationMatch}) {
      await assertEnabled();
      if (!generation(ifGenerationMatch) || !generation(ifMetagenerationMatch)) throw new Error("Both catalog CAS values required");
      const snapshot = await catalogGuard.capture();
      if (String(snapshot.metadata.generation) !== String(ifGenerationMatch) || String(snapshot.metadata.metageneration) !== String(ifMetagenerationMatch)) throw Error("Catalog CAS authority changed");
      return catalogGuard.commit({snapshot, bytes: Buffer.from(JSON.stringify(manifest)), metadata, beforeCommit: assertEnabled});
    },
    async verifyEvidence(evidence, original, source) {
      if (evidence.kind !== "human_attachment") return false;
      const snapshot = {complete: true, bucket: bucket.name, articles: [await readArticle(source.articleId)],
        catalog: (await readCatalog()).manifest, objects: [await readObject(original.path)]};
      const rows = snapshot.catalog.episodes.filter(row => maintenance.pathFromURL(row.audioURL, bucket.name) === original.path);
      if (rows.length !== 1) return false;
      const proof = maintenance.qualifyPublishedHumanAttachment({snapshot, episodeID: rows[0].id,
        bytes: await readAudio(original.path, original.generation)});
      return JSON.stringify(proof) === JSON.stringify(evidence);
    },
    async readPublication() {return {published: true, manifest: (await readCatalog()).manifest};},
    async verifyPublication(work, publication) {
      const rows = publication.manifest.episodes.filter(row => row.id === work.targetID);
      if (rows.length !== 1) return false;
      const row = rows[0], path = maintenance.pathFromURL(row.audioURL, bucket.name);
      const before = await readObject(path);
      if (!maintenance.validBinding(before, work.source) || Number(row.audioBytes) !== before.size) return false;
      const bytes = await readAudio(path, before.generation), after = await readObject(path);
      const expected = before.metadata.audioSHA256 || JSON.parse(before.metadata.offlineAudioBinding).audioSHA256;
      return identity(before) === identity(after) && hash(bytes) === expected;
    },
    async generateAndPublishNarration(options) {
      const work = options.maintenanceWork;
      if (!work || work.bucket !== bucket.name) throw new Error("Original maintenance work required");
      await assertEnabled();
      let preparingBinding;
      if (work.action === "ai_create") {
        await adapters.assertNoAudio(work, {allowImmutablePath: null});
        await ownership.reserveCreate(work);
      }
      const assertCurrent = async () => {
        await options.assertCurrent();
        if (work.action === "ai_create") {
          await ownership.assertCreate(work);
          await adapters.assertNoAudio(work, {allowImmutablePath: preparingBinding?.objectPath || null, preparingBinding});
        }
      };
      let committedPublication;
      const rendered = await render({...options, assertCurrent,
        registerImmutableOutput: async binding => {
          if (binding.articleId !== work.source.articleId || binding.articleSlug !== work.source.articleSlug ||
              binding.sourceContentRevision !== work.source.sourceContentRevision ||
              !/^[a-f\d]{64}$/.test(binding.audioSHA256 || "") || !Number.isSafeInteger(binding.audioBytes) || binding.audioBytes < 1 ||
              binding.objectPath !== `podcasts/narration/${narrationAddress(work.source.articleId, work.source.articleSlug).stem}/${narrationAddress(work.source.articleId, work.source.articleSlug).stem}--cms-${work.source.sourceContentRevision.slice(14)}--${binding.audioSHA256}.m4a`) {
            throw new Error("Actual immutable render output identity required");
          }
          await assertCurrent();preparingBinding = Object.freeze({...binding});
        },
        publishMaintenance: async ({binding, audioURL, episode}) => {
        if (JSON.stringify({articleId: binding.articleId, articleSlug: binding.articleSlug,
          sourceContentRevision: binding.sourceContentRevision}) !== JSON.stringify(work.source)) throw new Error("Rendered source changed");
        committedPublication = await maintenance.publishRawReplacement({work, bucket: bucket.name,
          replacement: {path: binding.objectPath, audioURL, episode}, assertCurrent, ...adapters});
        return committedPublication;
      }});
      if (rendered?.status === "published" && committedPublication?.published !== true) throw new Error("No exact AI catalog commit receipt");
      return {...rendered, ...(committedPublication ? {publication: committedPublication} : {})};
    },
  };
  // Snapshot-local recipe cache only. A runtime is created per trigger invocation;
  // every work guard independently re-reads the actual producer recipe.
  let currentSnapshot;
  const qualifiedLoad = async () => {currentSnapshot = await loadSnapshot();return currentSnapshot;};
  return {adapters, loadSnapshot: qualifiedLoad,
    createEntrypoints: () => {
      // The planner's synchronous qualifier uses the exact script captured by this load.
      const entrypoints = maintenance.createAutomaticOfflineEntrypoints({db, bucket: bucket.name, policy: policy(),
        store: maintenance.createLegacyMaintenanceStore({db, aggregateCharacterLimit: policy().maxAggregateAICharacters ?? 0}),
        loadSnapshot: qualifiedLoad, adapters, verifyHistoricalProof: () => false,
        verifyHumanAttachment: (proof, original, source) => proof.authority === "published-human-storage-v1" &&
          proof.objectPath === original.path && proof.objectGeneration === original.generation && proof.articleId === source.articleId &&
          currentSnapshot?.humanAttachments.some(actual => JSON.stringify(actual) === JSON.stringify(proof)),
        qualifyNarration: ({article}) => currentSnapshot?.narrationScripts[article.id]});
      return Object.fromEntries(Object.entries(entrypoints).map(([name, run]) => [name, async (...args) => {
        if (policy()?.enabled === true && (name !== "onQueueCreated" || args[0]?.data?.data()?.offlineMaintenance)) await assertEnabled();
        return run(...args);
      }]));
    }};
}
module.exports = {createLegacyOfflineRuntime};
