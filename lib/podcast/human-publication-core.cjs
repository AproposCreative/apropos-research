// LOCAL PROPOSAL ONLY. Inert: existing Firestore/Storage/CMS capabilities are injected.
const {createHash, randomUUID} = require('node:crypto');
const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' :
  value && typeof value === 'object' ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}' : JSON.stringify(value);
const digest = value => createHash('sha256').update(Buffer.isBuffer(value) ? value : canonical(value)).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const generation = value => /^[1-9]\d*$/.test(String(value));
const MANIFEST = 'podcasts/manifest.json';
const slugID = slug => slug.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
class HumanPublicationBlocked extends Error {}
// Existing authorized server principals only. Identity comes from the current
// Storage SDK authentication client, never a supplied upload field or key file.
const RESEARCH_PUBLICATION_ACTOR = 'firebase-adminsdk-fbsvc@apropos-magazine-6004a.iam.gserviceaccount.com';
function catalogACLProfile(entries) {
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 100) throw new Error('Catalog ACL must be explicitly complete');
  const seen = new Set();
  return entries.map(entry => {
    const entity = entry?.entity, role = entry?.role;
    if (typeof entity !== 'string' || entity.length > 400 || !/^(?:allUsers|allAuthenticatedUsers|(?:user|group)-[^\s\x00-\x1f\x7f]{1,380}|domain-[a-zA-Z0-9.-]{1,253}|project-(?:owners|editors|viewers)-[0-9]+)$/.test(entity) ||
        !['OWNER', 'READER'].includes(role) || seen.has(entity)) throw new Error('Catalog ACL has an unsupported or duplicate grant');
    seen.add(entity);return {entity, role};
  }).sort((a, b) => a.entity.localeCompare(b.entity));
}
function catalogCreatorUnion(entries, actorEmail) {
  if (!['817066738308-compute@developer.gserviceaccount.com',
    'firebase-adminsdk-fbsvc@apropos-magazine-6004a.iam.gserviceaccount.com'].includes(actorEmail)) throw new Error('Catalog ACL actor is not qualified');
  const profile = catalogACLProfile(entries), entity = 'user-' + actorEmail, existing = profile.find(entry => entry.entity === entity);
  if (existing && existing.role !== 'OWNER') throw new Error('Catalog ACL creator grant is ambiguous');
  if (!existing) profile.push({entity, role: 'OWNER'});
  if (profile.length > 100) throw new Error('Catalog ACL creator union exceeds bound');
  return profile.sort((a, b) => a.entity.localeCompare(b.entity));
}
function sourceIdentity(source, slug) {
  if (!source || !/^[a-f\d]{24}$/.test(source.articleId || '') || source.articleSlug !== slug ||
      !/^cms-sha256-v1:[a-f\d]{64}$/.test(source.sourceContentRevision || '')) throw new HumanPublicationBlocked('Exact live human article association required');
  return {articleId: source.articleId, articleSlug: slug, sourceContentRevision: source.sourceContentRevision};
}
function contentRevision(item) {
  return 'cms-sha256-v1:' + digest({id: item.id, fieldData: item.fieldData, createdOn: item.createdOn ?? null, lastPublished: item.lastPublished});
}
function qualifyLiveSource(mirror, live, slug) {
  if (!mirror || !live || mirror.id !== live.id || !/^[a-f\d]{24}$/.test(mirror.id || '') ||
      mirror.fieldData?.slug !== slug || live.fieldData?.slug !== slug || mirror.isDraft !== false || live.isDraft !== false ||
      mirror.isArchived === true || live.isArchived !== false || mirror.publicationState === 'withdrawn' ||
      typeof live.lastPublished !== 'string' || !Number.isFinite(Date.parse(live.lastPublished)) ||
      mirror.contentLanguage === 'en' || mirror.contentRevision !== contentRevision(mirror) || contentRevision(live) !== mirror.contentRevision) {
    throw new HumanPublicationBlocked('Current live canonical article changed');
  }
  return sourceIdentity({articleId: mirror.id, articleSlug: slug, sourceContentRevision: mirror.contentRevision}, slug);
}
function assertEditorial(metadata) {
  if (!metadata || typeof metadata.title !== 'string' || !metadata.title.trim() || metadata.title.length > 1000 ||
      (metadata.hosts !== undefined && (!Array.isArray(metadata.hosts) || !metadata.hosts.length || metadata.hosts.length > 20 || metadata.hosts.some(host => typeof host !== 'string' || !host.trim() || host.length > 200))) ||
      (metadata.description !== undefined && typeof metadata.description !== 'string') ||
      (metadata.imageURL !== undefined && (typeof metadata.imageURL !== 'string' || metadata.imageURL.length > 4096))) throw new HumanPublicationBlocked('Invalid human editorial metadata');
  if (metadata.imageURL?.trim()) {
    const url = new URL(metadata.imageURL);if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new HumanPublicationBlocked('Invalid cover URL');
  }
}
function createHumanPublisher({db, bucket, readSource, readPublicationActor, encode, probe, onStep = async () => {}, nonce = randomUUID}) {
  if (!db || !bucket || typeof bucket.name !== 'string' || typeof readSource !== 'function' || typeof encode !== 'function') throw new Error('Existing publication capabilities required');
  async function publicationAccess() {
    if (typeof readPublicationActor !== 'function') throw new HumanPublicationBlocked('Current Storage actor capability unavailable');
    const actor = await readPublicationActor();
    if (actor !== RESEARCH_PUBLICATION_ACTOR) throw new HumanPublicationBlocked('Current Storage actor is not the qualified Research actor');
    if (typeof bucket.getMetadata !== 'function') throw new HumanPublicationBlocked('Current bucket ACL policy unavailable');
    const [metadata] = await bucket.getMetadata({projection: 'full'}), policy = metadata?.iamConfiguration;
    if (metadata?.name !== bucket.name || policy?.uniformBucketLevelAccess?.enabled !== false ||
        (policy.bucketPolicyOnly !== undefined && policy.bucketPolicyOnly.enabled !== false)) throw new HumanPublicationBlocked('Current bucket ACL policy is ambiguous or uniform');
    return actor;
  }
  async function exactBytes(path, before, maximum) {
    if (!generation(before?.generation) || !generation(before?.metageneration) ||
        !Number.isSafeInteger(Number(before.size)) || Number(before.size) < 1 || Number(before.size) > maximum) throw new HumanPublicationBlocked('Invalid bounded input identity');
    const [bytes] = await bucket.file(path, {generation: String(before.generation)}).download();
    const [after] = await bucket.file(path).getMetadata({projection: 'full'});
    if (!Buffer.isBuffer(bytes) || bytes.length !== Number(before.size) || canonical(before) !== canonical(after)) throw new HumanPublicationBlocked('Original media changed during read');
    return bytes;
  }
  async function catalog() {
    const actor = await publicationAccess();
    const [metadata] = await bucket.file(MANIFEST).getMetadata({projection: 'full'});
    if ((metadata.contentEncoding !== undefined && metadata.contentEncoding !== 'identity') ||
        ['contexts', 'customerEncryption', 'kmsKeyName', 'retention', 'retentionExpirationTime'].some(key => Object.hasOwn(metadata, key)) ||
        (metadata.storageClass !== undefined && (typeof metadata.storageClass !== 'string' || !/^[A-Z][A-Z0-9_]{0,63}$/.test(metadata.storageClass))) ||
        metadata.temporaryHold === true || metadata.eventBasedHold === true) throw new HumanPublicationBlocked('Unsupported catalog metadata policy');
    const aclProfile = catalogACLProfile(metadata.acl), expectedACL = catalogCreatorUnion(aclProfile, actor);
    const rawBytes = await exactBytes(MANIFEST, metadata, 8 * 1024 * 1024), raw = JSON.parse(rawBytes.toString('utf8'));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Array.isArray(raw.episodes) || raw.episodes.length > 4096 ||
        raw.episodes.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new HumanPublicationBlocked('Invalid complete raw catalog');
    return {raw, rawBytes, metadata, aclProfile, expectedACL};
  }
  function target(raw, slug, source) {
    const rows = raw.episodes.filter(row => row.articleSlug === slug);
    if (rows.length > 1) throw new HumanPublicationBlocked('Ambiguous exact human target');
    const row = rows[0];
    // An operator's uploaded human recording replaces exactly this selected
    // canonical target. Preserve its real ID/GUID; never mint an alias/winner.
    const humanID = slugID(slug), aiID = `ai-${humanID}`;
    if (row && !['human', 'ai'].includes(row.kind)) throw new HumanPublicationBlocked('Unknown original audio kind');
    const hasSourceID = row && Object.hasOwn(row, 'articleId'), hasRevision = row && Object.hasOwn(row, 'sourceContentRevision');
    if (row && (hasSourceID !== hasRevision || (hasSourceID && (row.articleId !== source.articleId ||
        typeof row.sourceContentRevision !== 'string' || !/^cms-sha256-v1:[a-f\d]{64}$/.test(row.sourceContentRevision))))) throw new HumanPublicationBlocked('Original audio source association is incomplete or foreign');
    if (row && ((row.kind === 'ai' ? row.id !== aiID : ![humanID, aiID].includes(row.id)) ||
        raw.episodes.filter(other => other.id === row.id).length !== 1)) throw new HumanPublicationBlocked('Original human identity is not unique');
    if (!row && raw.episodes.some(other => other.id === slugID(slug))) throw new HumanPublicationBlocked('New human ID already used');
    return row || null;
  }
  return {async publish({jobId, slug}) {
    if (typeof jobId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(jobId) || typeof slug !== 'string' ||
        !/^[a-z0-9]+(?:-+[a-z0-9]+)*$/.test(slug) || slug.length > 240) throw new HumanPublicationBlocked('Exact human job identity required');
    await publicationAccess();
    const qualified = await readSource(slug), source = sourceIdentity(qualified, slug);
    assertEditorial(qualified.editorialMetadata);const metadata = clone(qualified.editorialMetadata);
    const incomingPath = `podcasts/incoming/${slug}/audio.m4a`;
    const [inputMetadata] = await bucket.file(incomingPath).getMetadata({projection: 'full'});
    if (!generation(inputMetadata.generation) || !generation(inputMetadata.metageneration) || !Number.isSafeInteger(Number(inputMetadata.size)) ||
        Number(inputMetadata.size) < 1 || Number(inputMetadata.size) > 500 * 1024 * 1024) throw new HumanPublicationBlocked('Original human upload identity required');
    // A generation's server creation time is stable under metadata-only edits.
    // Uploader custom dates and GCS updated are not committed origin receipts.
    const publicationTime = inputMetadata.timeCreated;
    if (typeof publicationTime !== 'string' || !Number.isFinite(Date.parse(publicationTime))) throw new HumanPublicationBlocked('Original recording timestamp required');
    const first = await catalog(), original = target(first.raw, slug, source), claim = nonce();
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(claim)) throw new HumanPublicationBlocked('Invalid human claim token');
    const input = {path: incomingPath, generation: String(inputMetadata.generation), metageneration: String(inputMetadata.metageneration),
      size: Number(inputMetadata.size), metadataSHA256: digest(inputMetadata)};
    const originalIdentity = {version: 1, claim, jobId, source, input, editorialMetadataSHA256: digest(metadata), originalTargetSHA256: original ? digest(original) : null};
    let identity;
    const ref = db.collection('narration_queue').doc(slug);
    await db.runTransaction(async tx => {
      const current = await tx.get(ref), old = current.data();
      const sameCanonical = old?.slug === slug && old.articleId === source.articleId;
      const knownNoEffect = sameCanonical && ['no_article', 'empty', 'deferred_quota'].includes(old.status) && old.result === old.status;
      const completedNormal = sameCanonical && old.status === 'done' && !old.humanPublication;
      const completedHuman = old?.status === 'human_done' && old.humanPublication?.state === 'committed' &&
        sameCanonical && old.narrationClaim === old.humanPublication.claim &&
        old.humanPublication.output?.rowSHA256 === (original && digest(original)) &&
        old.humanPublication.input?.generation !== input.generation;
      if (current.exists && (old.offlineMaintenanceReservation || !(completedNormal || knownNoEffect || completedHuman))) {
        throw new HumanPublicationBlocked('Existing canonical audio ownership requires readback');
      }
      // This bounded ownership snapshot never nests prior human histories.
      // Rotate the EXISTING narrationClaim permanently: a normal worker that
      // already finished cannot pass assertFinished after the handover.
      const priorCanonicalOwnership = current.exists ? Object.fromEntries(['slug', 'articleId', 'name', 'createdAt', 'narrationClaim', 'status', 'result']
        .filter(key => Object.hasOwn(old, key)).map(key => [key, clone(old[key])])) : null;
      identity = {...originalIdentity, priorCanonicalOwnership, priorCanonicalOwnershipSHA256: priorCanonicalOwnership ? digest(priorCanonicalOwnership) : null};
      const value = {slug, articleId: source.articleId, status: 'human_processing', narrationClaim: claim, humanPublication: {...identity, state: 'processing'}};
      if (current.exists) tx.set(ref, value, {merge: true});else tx.create(ref, value);
    });
    const owns = value => value?.status === 'human_processing' && value.narrationClaim === claim && value.humanPublication?.state === 'processing' &&
      canonical({...value.humanPublication, state: undefined}) === canonical({...identity, state: undefined});
    async function assertCurrent() {
      const current = await ref.get();
      if (!current.exists || !owns(current.data())) throw new HumanPublicationBlocked('Original human claim changed');
      await publicationAccess();
      const latestSource = await readSource(slug);
      if (canonical(sourceIdentity(latestSource, slug)) !== canonical(source) || digest(latestSource.editorialMetadata) !== identity.editorialMetadataSHA256) throw new HumanPublicationBlocked('Current live human source or editorial metadata changed');
      const [latest] = await bucket.file(incomingPath).getMetadata({projection: 'full'});
      if (canonical(latest) !== canonical(inputMetadata)) throw new HumanPublicationBlocked('Original human input changed');
    }
    try {
      await assertCurrent();await onStep('encode');
      const raw = await exactBytes(incomingPath, inputMetadata, 500 * 1024 * 1024);
      const bytes = await encode(raw);await assertCurrent();
      if (!Buffer.isBuffer(bytes) || bytes.length < 12 || bytes.length > 256 * 1024 * 1024 || bytes.subarray(4, 8).toString('ascii') !== 'ftyp') throw new HumanPublicationBlocked('Encoder did not return bounded M4A bytes');
      const measured = probe ? await probe(bytes) : null;await assertCurrent();
      const audioSHA256 = digest(bytes), path = `podcasts/articles/${slug}/render-${audioSHA256}-${claim}.m4a`, downloadToken = nonce();
      if (!/^[a-f\d-]{36}$/i.test(downloadToken)) throw new HumanPublicationBlocked('Invalid download token');
      const proof = {podcastSchema: '2', sourceArticleId: source.articleId, sourceContentRevision: source.sourceContentRevision,
        humanSourcePublishedAt: new Date(publicationTime).toISOString(), audioSHA256, firebaseStorageDownloadTokens: downloadToken};
      await bucket.file(path).save(bytes, {resumable: false, preconditionOpts: {ifGenerationMatch: 0}, metadata: {contentType: 'audio/mp4', metadata: proof}});
      const [media] = await bucket.file(path).getMetadata({projection: 'full'});
      if (canonical(media.metadata) !== canonical(proof) || Number(media.size) !== bytes.length || digest(await exactBytes(path, media, 256 * 1024 * 1024)) !== audioSHA256) throw new HumanPublicationBlocked('Immutable human upload not verified');
      await assertCurrent();await onStep('manifest');
      const latest = await catalog(), selected = target(latest.raw, slug, source);
      if ((selected ? digest(selected) : null) !== identity.originalTargetSHA256) throw new HumanPublicationBlocked('Original human catalog target changed');
      const episode = {...(selected || {}), id: selected?.id || slugID(slug), guid: selected?.guid || selected?.id || slugID(slug),
        articleSlug: slug, kind: 'human', title: metadata.title.trim(), subtitle: 'Lyt til artiklen', hosts: metadata.hosts || ['Apropos Magazine'],
        articleId: source.articleId, sourceContentRevision: source.sourceContentRevision, publishedAt: new Date(publicationTime).toISOString(),
        audioURL: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${downloadToken}`,
        audioBytes: bytes.length, audioObjectGeneration: String(media.generation), audioSHA256};
      // A measurement belongs to these new media bytes, not the retained row.
      delete episode.durationSeconds;
      delete episode.description;
      delete episode.imageURL;
      if (typeof measured === 'number' && Number.isFinite(measured) && measured > 0) episode.durationSeconds = Math.round(measured);
      if (typeof metadata.description === 'string' && metadata.description.trim()) episode.description = metadata.description.trim().slice(0, 4000);
      if (typeof metadata.imageURL === 'string' && metadata.imageURL.trim()) {
        const url = new URL(metadata.imageURL);if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new HumanPublicationBlocked('Invalid cover URL');episode.imageURL = url.toString();
      }
      const manifest = {...latest.raw, updatedAt: new Date().toISOString(), episodes: selected ? latest.raw.episodes.map(row => row === selected ? episode : row) : [...latest.raw.episodes, episode]};
      const writable = {};
      for (const key of ['cacheControl', 'contentDisposition', 'contentEncoding', 'contentLanguage', 'contentType', 'customTime', 'temporaryHold', 'eventBasedHold', 'storageClass']) if (latest.metadata[key] !== undefined) writable[key] = latest.metadata[key];
      writable.metadata = clone(latest.metadata.metadata || {});
      // New-generation insert metadata copies every prior grant. The only
      // permitted addition is the authenticated, already authorized creator.
      writable.acl = clone(latest.expectedACL);
      await assertCurrent();const [mediaBeforeCommit] = await bucket.file(path).getMetadata({projection: 'full'});
      if (canonical(mediaBeforeCommit) !== canonical(media)) throw new HumanPublicationBlocked('Immutable human output changed before commit');
      const intendedCatalogBytes = Buffer.from(JSON.stringify(manifest));
      await bucket.file(MANIFEST).save(intendedCatalogBytes, {resumable: false,
        preconditionOpts: {ifGenerationMatch: String(latest.metadata.generation), ifMetagenerationMatch: String(latest.metadata.metageneration)}, metadata: writable});
      const actual = await catalog(), rows = actual.raw.episodes.filter(row => row.id === episode.id);
      if (!actual.rawBytes.equals(intendedCatalogBytes)) throw new HumanPublicationBlocked('Human catalog bytes publication outcome uncertain');
      if (canonical(actual.aclProfile) !== canonical(latest.expectedACL)) throw new HumanPublicationBlocked('Human catalog ACL publication outcome uncertain');
      for (const key of Object.keys(writable).filter(key => key !== 'acl')) {
        if (canonical(actual.metadata[key]) !== canonical(writable[key])) throw new HumanPublicationBlocked('Human catalog metadata publication outcome uncertain');
      }
      if (rows.length !== 1 || canonical(rows[0]) !== canonical(episode) || canonical(actual.raw) !== canonical(manifest)) throw new HumanPublicationBlocked('Human catalog publication outcome uncertain');
      const [committedMedia] = await bucket.file(path).getMetadata({projection: 'full'});
      if (canonical(committedMedia) !== canonical(media)) throw new HumanPublicationBlocked('Human output publication outcome uncertain');
      await assertCurrent();
      const output = {path, generation: String(media.generation), audioSHA256, rowSHA256: digest(episode)};
      await db.runTransaction(async tx => {const current = await tx.get(ref);if (!current.exists || !owns(current.data())) throw new HumanPublicationBlocked('Original human finish claim changed');
        tx.set(ref, {status: 'human_done', humanPublication: {...identity, state: 'committed', output}}, {merge: true});});
      // Retain the incoming original and all old published objects. No TTS,
      // notification, CMS edit, RSS write or delete capability exists here.
      return {published: true, episode, source, input, output};
    } catch (error) {
      await db.runTransaction(async tx => {const current = await tx.get(ref);if (current.exists && owns(current.data())) tx.set(ref,
        {status: 'human_error', humanPublication: {...identity, state: 'needs_readback'}}, {merge: true});}).catch(() => {});
      throw error;
    }
  }};
}
module.exports = {HumanPublicationBlocked, canonical, digest, contentRevision, qualifyLiveSource, catalogACLProfile, catalogCreatorUnion, createHumanPublisher};
