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
module.exports = {catalogACLProfile, catalogCreatorUnion};

// SDK-free: the actual existing bucket/client is injected. No credential objects
// escape this function; only the qualified principal string is retained in memory.
const COMPUTE = '817066738308-compute@developer.gserviceaccount.com';
const canonical = value => JSON.stringify(value && typeof value === 'object' ?
  Array.isArray(value) ? value.map(v => JSON.parse(canonical(v))) : Object.fromEntries(Object.keys(value).sort().map(k => [k, JSON.parse(canonical(value[k]))])) : value);
const generation = value => /^[1-9]\d*$/.test(String(value || ''));
const WRITABLE = ['cacheControl', 'contentDisposition', 'contentEncoding', 'contentLanguage', 'contentType', 'customTime', 'storageClass', 'temporaryHold', 'eventBasedHold'];
function metadataIdentity(metadata) {
  if (!metadata || !generation(metadata.generation) || !generation(metadata.metageneration) ||
      !Number.isSafeInteger(Number(metadata.size)) || Number(metadata.size) < 1) throw Error('Catalog generation authority missing');
  return canonical({...metadata, acl: catalogACLProfile(metadata.acl)});
}
function writableCatalogMetadata(metadata) {
  const out = {};
  for (const key of WRITABLE) if (metadata[key] !== undefined) out[key] = metadata[key];
  out.metadata = {...(metadata.metadata || {})};return out;
}
function createCatalogACLGuard({bucket}) {
  if (!bucket || typeof bucket.getMetadata !== 'function' || !bucket.storage?.authClient ||
      typeof bucket.storage.authClient.getCredentials !== 'function') throw Error('Actual catalog actor and bucket capabilities required');
  async function actor() {
    const clientEmail = (await bucket.storage.authClient.getCredentials())?.client_email;
    if (clientEmail !== COMPUTE) throw Error('Actual catalog uploader is not qualified compute principal');
    const [metadata] = await bucket.getMetadata({projection: 'full'}), policy = metadata?.iamConfiguration;
    if (metadata?.name !== bucket.name || policy?.uniformBucketLevelAccess?.enabled !== false ||
        (policy.bucketPolicyOnly !== undefined && policy.bucketPolicyOnly.enabled !== false)) throw Error('Catalog object ACL requires verified media bucket fine-grained access');
    return clientEmail;
  }
  async function capture(path = 'podcasts/manifest.json') {
    if (!['podcasts/manifest.json', 'podcasts/feed.xml'].includes(path)) throw Error('Only existing catalog/feed object supported');
    const actorEmail = await actor(), [metadata] = await bucket.file(path).getMetadata({projection: 'full'});
    const identity = metadataIdentity(metadata), expectedACL = catalogCreatorUnion(metadata.acl, actorEmail);
    if (['contexts', 'customerEncryption', 'kmsKeyName', 'retention', 'retentionExpirationTime'].some(key => Object.hasOwn(metadata, key)) ||
        metadata.temporaryHold === true || metadata.eventBasedHold === true ||
        (metadata.storageClass !== undefined && (typeof metadata.storageClass !== 'string' || !/^[A-Z][A-Z0-9_]{0,63}$/.test(metadata.storageClass))) ||
        (metadata.contentEncoding !== undefined && metadata.contentEncoding !== 'identity')) throw Error('Unsupported catalog storage policy');
    return Object.freeze({path, actorEmail, metadata: structuredClone(metadata), identity, expectedACL});
  }
  async function assertCurrent(snapshot) {
    const latest = await capture(snapshot.path);
    if (latest.actorEmail !== snapshot.actorEmail || latest.identity !== snapshot.identity ||
        canonical(latest.expectedACL) !== canonical(snapshot.expectedACL)) throw Error('Catalog generation/metadata/ACL authority changed');
    return latest;
  }
  async function commit({snapshot, bytes, metadata = writableCatalogMetadata(snapshot.metadata), beforeCommit = async () => {}}) {
    if (!Buffer.isBuffer(bytes) && typeof bytes !== 'string') throw Error('Exact catalog payload bytes required');
    const payload = Buffer.from(bytes);
    if (payload.length < 1 || payload.length > 8 * 1024 * 1024) throw Error('Catalog payload byte bound exceeded');
    await assertCurrent(snapshot);await beforeCommit();
    // Full prior ACL, including all automatic/custom OWNER grants, travels in the
    // generation replacement. Never patch/delete an ACL or create a public grant.
    const writable = {...writableCatalogMetadata(snapshot.metadata), ...metadata,
      metadata: {...(snapshot.metadata.metadata || {}), ...(metadata.metadata || {})}, acl: snapshot.expectedACL};
    await bucket.file(snapshot.path).save(payload, {resumable: false,
      preconditionOpts: {ifGenerationMatch: String(snapshot.metadata.generation), ifMetagenerationMatch: String(snapshot.metadata.metageneration)}, metadata: writable});
    const [actual] = await bucket.file(snapshot.path).getMetadata({projection: 'full'});
    if (!generation(actual.generation) || !generation(actual.metageneration) || String(actual.generation) === String(snapshot.metadata.generation) ||
        canonical(catalogACLProfile(actual.acl)) !== canonical(snapshot.expectedACL) || Number(actual.size) !== payload.length) throw Error('Catalog full ACL generation readback not acknowledged');
    for (const key of [...WRITABLE, 'metadata']) if (writable[key] !== undefined && canonical(actual[key]) !== canonical(writable[key])) throw Error('Catalog writable metadata readback changed');
    // An ACK, new generation and matching size are not a payload receipt. Read
    // that exact generation, then prove it is still the live full ACL/metadata.
    const [committedBytes] = await bucket.file(snapshot.path, {generation: String(actual.generation)}).download();
    if (!Buffer.isBuffer(committedBytes) || !committedBytes.equals(payload)) throw Error('Catalog committed payload bytes not acknowledged');
    const [stable] = await bucket.file(snapshot.path).getMetadata({projection: 'full'});
    if (metadataIdentity(stable) !== metadataIdentity(actual)) throw Error('Catalog readback changed during committed byte read');
    await beforeCommit();return {published: true, generation: String(actual.generation), metageneration: String(actual.metageneration), acl: catalogACLProfile(actual.acl)};
  }
  return {capture, assertCurrent, commit};
}
module.exports = {catalogACLProfile, catalogCreatorUnion, metadataIdentity, writableCatalogMetadata, createCatalogACLGuard};
