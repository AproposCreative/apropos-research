import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { readSubmissionCms } from './submission-published-target';

/** Only additive, externally supplied watch/trailer fields can be preserved.
 * Reconstruct the COMPLETE old hash, rather than ignoring these fields in a
 * comparison. Edited/replaced existing values and any other change still stop. */
export function preservedDraftAdditions(fields: Record<string, unknown>, priorHash: string) {
  if (cmsFieldHash(fields) === priorHash) return {};
  const keys = ['unique-watch-now-title', 'watch-now-link', 'video-trailer'];
  // Optional fields may have been null or absent in the pinned CMS snapshot.
  for (let mask = 1; mask < 27; mask++) {
    const baseline = { ...fields }, preserved: Record<string, unknown> = {};
    let n = mask;
    for (const key of keys) {
      const mode = n % 3; n = Math.floor(n / 3);
      if (!mode) continue;
      if (fields[key] === undefined || fields[key] === null || fields[key] === '') continue;
      preserved[key] = fields[key];
      if (mode === 1) baseline[key] = null; else delete baseline[key];
    }
    if (cmsFieldHash(baseline) === priorHash) return preserved;
  }
  throw Error('mcp_submission_cms_conflict');
}

export async function inspectPreparedDraftBoundary(prepared: { itemId: string; proof: { fieldDataHash: string } }) {
  const current = await readSubmissionCms(prepared.itemId);
  if (current.isDraft !== true || current.lastPublished) throw Error('mcp_submission_cms_conflict');
  const fields = current.fieldData as Record<string, unknown>;
  const preserved = preservedDraftAdditions(fields, prepared.proof.fieldDataHash);
  return { itemId: prepared.itemId, cmsHash: cmsFieldHash(fields), preserved, checkedAt: new Date().toISOString() };
}

/** Also used after a lost write response: a receipt may not hide lost extras. */
export async function verifyPreservedDraftFields(itemId: string, boundary?: { preserved: Record<string, unknown> }) {
  if (!boundary) return;
  const fresh = await readSubmissionCms(itemId), fields = fresh.fieldData as Record<string, unknown>;
  if (Object.entries(boundary.preserved).some(([key, value]) => cmsFieldHash({ value: fields[key] }) !== cmsFieldHash({ value }))) {
    throw Error('mcp_submission_cms_conflict');
  }
}
