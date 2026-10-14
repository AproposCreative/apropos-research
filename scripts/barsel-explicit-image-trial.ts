/** Narrow operator entrypoint for the directly approved 14 Oct selfie retry.
 * No generation, upload, personal selection or CMS write in this script.
 * Default is read-only. Existing service credentials are supplied in memory. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { getAdminAuth, getAdminDb } from '../lib/firebase-admin';
import { cmsFieldHash } from '../lib/liv/cms-field-hash';

const mode = process.env.APROPOS_BARSEL_IMAGE_TRIAL;
assert(['read-only', 'authorize-one-owner-approved-attempt', 'claim-one-dispatch'].includes(mode || ''));
// Initialize the central submission module first, including its existing cycles.
await import('../lib/editorial/submissions');
const { authorizeImageAttemptResume, claimImageAttemptResume } = await import('../lib/editorial/image-attempt-resume');
const { preflightSubmissionImage } = await import('../lib/editorial/image-preflight');
const owner = await getAdminAuth()!.getUserByEmail('frederik@aproposmagazine.com');
assert(owner.emailVerified && !owner.disabled);
const submissionId = '546794452af45693e3495ae29d4fe5d8912c33844aaa62db10b2ad8a94e36171';
const db = getAdminDb()!, ref = db.collection('editorialSubmissions').doc(submissionId), row = (await ref.get()).data()!;
assert.equal(row.uid, owner.uid); assert.equal(row.revision, 2); assert.equal(row.status, 'draft');
assert.equal(row.contentHash, 'a26827edd659ebe4b6c85c99115fa0a567346b6374b89d4bf4da49069cc1f846');
const failureRef = ref.collection('imageFailures').doc('075da4aa1a7d310cb369557a145ec5de55c1b9cf3c912e96a44f8de82576d199');
const failure = (await failureRef.get()).data()!;
assert(failure.originalPreserved); assert.equal(failure.originalHash, '70f4dc5968ad74f169e8a44cf2ac2d7cfca568ea242ec4688f6025cc951d9a07');
const input = { submissionId, expectedRevision: 2, role: 'cover',
  sectionId: '914f1bb5458ceebecd73f3b65c4327ba836ae964a0ba4b513cae45062f175910',
  briefId: 'd5ccaf998d6676ccf0b6b53b39d1488d5dcbc5f87bd519b04ddfcab6004dfe58',
  requestId: 'barsel-2026-10-14-selfie-cover-explicit-v2', inputMode: 'explicit_arguments',
  decision: 'Owner replied “ja” to one controlled new selfie-cover trial in this Codex chat, with explicit canonical prompt and both actual reference files. No body images or publication.',
  resolution: 'This native image_gen tool exposes prompt and referenced_image_paths. Exact canonical text and style/selfie bytes will be supplied directly, not reconstructed from Work context. Hidden engine processing remains unverified.' };
const brief = (await ref.collection('chatBriefs').doc(input.briefId).get()).data()!;
assert.equal(brief.canonicalPromptHash, '866aa99a398b0c25a5ea42f42010a30bd3067fe1e95e2a233b491a8506da3e52');
let operation = null;
if (mode === 'authorize-one-owner-approved-attempt') operation = await authorizeImageAttemptResume(owner.uid, input);
if (mode === 'claim-one-dispatch') operation = await claimImageAttemptResume(owner.uid, input);
const { requestId: _request, inputMode: _mode, decision: _decision, resolution: _resolution, ...placement } = input;
const preflight = await preflightSubmissionImage(owner.uid, { ...placement, subjectReferencesRequired: true,
  subjectReferenceIds: ['c13fe1fe30ddbc062db6a053e93927c25947e429818f0425a3160e6e09a6cb81'] });
assert.equal(cmsFieldHash((await ref.get()).data()), cmsFieldHash(row));
assert.equal(cmsFieldHash((await failureRef.get()).data()), cmsFieldHash(failure));
const output = { checkedAt: new Date().toISOString(), mode, operation, preflight, articleAndPriorFailureUnchanged: true };
await mkdir('output/image-explicit-v32-trial', { recursive: true });
await writeFile(`output/image-explicit-v32-trial/${mode}.json`, JSON.stringify(output, null, 2) + '\n', { mode: 0o600 });
await writeFile('output/image-explicit-v32-trial/canonical-prompt.txt', brief.prompt, { mode: 0o600 });
console.log(JSON.stringify(output));
