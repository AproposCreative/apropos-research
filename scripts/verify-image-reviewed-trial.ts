/** Read-only production evidence for the owner-authorized one-cover trial.
 * Writes local evidence/original copies only. Never selects, imports or generates. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { getAdminDb, getAdminStorageBucket } from '../lib/firebase-admin';
import { imageProtectedContentHash } from '../lib/editorial/image-content-invariant';
import { cmsFieldHash } from '../lib/liv/cms-field-hash';
import type { SubmissionRecord } from '../lib/editorial/submission-contract';

assert.equal(process.env.APROPOS_IMAGE_TRIAL_VERIFY, 'read-only-no-generation');
const explicitTrial = process.env.APROPOS_IMAGE_TRIAL_VERSION === '32';
const db = getAdminDb()!;
const bucketName = process.env.FIREBASE_ADMIN_STORAGE_BUCKET;
assert(bucketName, 'verification_storage_bucket_missing');
const storage = getAdminStorageBucket(bucketName)!;
async function readOriginal(reference: { storagePath: string; sha256: string; byteCount: number; mimeType: string }) {
  const [bytes] = await storage.file(reference.storagePath).download({ validation: 'crc32c' });
  assert(bytes.length > 0 && bytes.length <= 20 * 1024 * 1024);
  assert.equal(bytes.length, reference.byteCount);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), reference.sha256);
  const decoder = sharp(bytes, { limitInputPixels: 80_000_000, failOn: 'warning' });
  const metadata = await decoder.metadata(); await decoder.stats();
  assert.equal(`image/${metadata.format}`, reference.mimeType);
  return bytes;
}
const id = '546794452af45693e3495ae29d4fe5d8912c33844aaa62db10b2ad8a94e36171';
const ref = db.collection('editorialSubmissions').doc(id), row = (await ref.get()).data() as SubmissionRecord;
assert.equal(row.revision, 2);
assert.equal(row.contentHash, 'a26827edd659ebe4b6c85c99115fa0a567346b6374b89d4bf4da49069cc1f846');
assert.equal(imageProtectedContentHash(row.article), 'add89a2f74943a7de40a4c00199b84d2cd7746f1d84c67b581615ad627239883');
assert.equal(row.status, 'draft');
const assets = (await ref.collection('chatAssets').get()).docs.map(d => ({ ...d.data(), assetId: d.id }));
assert(assets.length <= 1, 'unexpected_extra_candidate');
const directory = explicitTrial ? 'output/image-explicit-v32-trial' : 'output/image-reviewed-v31-trial';
await mkdir(directory, { recursive: true });
const candidates = [];
for (const asset of assets as Array<Record<string, any>>) {
  assert.equal(asset.status, 'awaiting_personal_selection');
  assert.equal(asset.requestId, explicitTrial ? 'barsel-2026-10-14-selfie-cover-explicit-v2' : 'barsel-2026-10-14-selfie-cover-trial-v1');
  assert.equal(asset.role, 'cover');
  assert(!asset.personalSelection && !asset.cmsAsset && !asset.url);
  const bytes = await readOriginal({ storagePath: asset.storagePath, sha256: asset.originalHash,
    mimeType: asset.mimeType, byteCount: asset.byteCount });
  const metadata = await sharp(bytes).metadata();
  assert.equal(bytes.length, asset.byteCount);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.originalHash);
  assert.equal(metadata.width, asset.width); assert.equal(metadata.height, asset.height);
  const extension = metadata.format === 'jpeg' ? 'jpg' : metadata.format;
  assert(['png', 'jpg', 'webp'].includes(extension!));
  const filename = `${directory}/cover-original.${extension}`;
  await writeFile(filename, bytes, { mode: 0o600 });
  candidates.push({ assetId: asset.assetId, status: asset.status, briefId: asset.briefId, requestId: asset.requestId,
    originalHash: asset.originalHash, byteCount: bytes.length, width: metadata.width, height: metadata.height,
    mimeType: asset.mimeType, generationEvidence: asset.generationEvidence, filename,
    personalSelection: false, cmsAsset: false });
}
const subject = (await ref.collection('imageReferences').doc('c13fe1fe30ddbc062db6a053e93927c25947e429818f0425a3160e6e09a6cb81').get()).data()!;
const selfie = await readOriginal(subject.reference);
await writeFile(`${directory}/selfie-original.jpg`, selfie, { mode: 0o600 });
const failures = [];
for (const doc of (await ref.collection('imageFailures').get()).docs) {
  const failure = doc.data();
  let filename: string | null = null;
  if (failure.originalPreserved && failure.decoded) {
    const bytes = await readOriginal({ storagePath: failure.storagePath, sha256: failure.originalHash,
      mimeType: failure.mimeType, byteCount: failure.byteCount });
    const metadata = await sharp(bytes).metadata();
    assert.equal(bytes.length, failure.byteCount);
    const extension = metadata.format === 'jpeg' ? 'jpg' : metadata.format;
    assert(['png', 'jpg', 'webp'].includes(extension!));
    filename = `${directory}/rejected-${doc.id}.${extension}`;
    await writeFile(filename, bytes, { mode: 0o600 });
  }
  failures.push({ failureId: doc.id, status: failure.status, code: failure.code, briefId: failure.briefId,
    originalPreserved: failure.originalPreserved, originalHash: failure.originalHash, byteCount: failure.byteCount,
    width: failure.width, height: failure.height, filename, referenceHashes: failure.referenceHashes,
    reportedInputMode: failure.generationReport?.inputMode ?? 'not_reported',
    outputCheck: failure.generationReport?.outputCheck ?? null });
}
const audit = (await db.collection('mcpAudit').where('startedAt', '>=', '2026-10-14T16:32:00.000Z').limit(200).get())
  .docs.map(d => d.data()).filter(r => r.uid === row.uid)
  .map(r => ({ tool: r.tool, startedAt: r.startedAt, status: r.status, version: r.version, paidAiAllowed: r.paidAiAllowed }));
const financialHash = cmsFieldHash({ shared: (await db.collection('livCostLedger').doc('month-2026-10').get()).data() ?? null,
  images: (await db.collection('imageGenCostLedger').doc('month-2026-10').get()).data() ?? null,
  holds: (await db.collection('aiProviderHolds').limit(10).get()).docs.map(d => d.data()),
  policy: (await db.collection('aiExecutionPolicies').doc('paid').get()).data() ?? null });
assert.equal(cmsFieldHash((await ref.get()).data()), cmsFieldHash(row), 'article_changed_during_readback');
const result = { checkedAt: new Date().toISOString(), revision: row.revision, contentHash: row.contentHash,
  protectedContentHash: imageProtectedContentHash(row.article), candidates, audit, financialHash,
  financialUnchanged: financialHash === 'e3b2d498e807ab1cba45f4ca156ce81e5eb15d5b71ea496457fc31da07b69101',
  failures,
  attemptResumes: (await ref.collection('imageAttemptResumes').get()).docs.map(d => d.data()),
  actualNativeArgumentsIndependentlyObserved: false, verificationCmsWrites: 0, verificationApprovals: 0 };
await writeFile(`${directory}/readback.json`, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
console.log(JSON.stringify(result));
