import type { SeoEngineInputContract } from '@/lib/seo-engine/schema';
import { SEO_ENGINE_SNAPSHOT_HARD_MAX_BYTES } from '@/lib/seo-engine/versions';

/**
 * Estimate Firestore snapshot payload size (UTF-8).
 * Includes full contract (may contain body) + normalizedText — reject before write.
 */
export function estimateSnapshotByteSize(args: {
  contract: SeoEngineInputContract;
  normalizedText: string;
}): number {
  const contractJson = JSON.stringify(args.contract);
  return Buffer.byteLength(contractJson, 'utf8') + Buffer.byteLength(args.normalizedText, 'utf8');
}

export function assertSnapshotWithinBudget(args: {
  contract: SeoEngineInputContract;
  normalizedText: string;
}): number {
  const bytes = estimateSnapshotByteSize(args);
  if (bytes > SEO_ENGINE_SNAPSHOT_HARD_MAX_BYTES) {
    throw Object.assign(
      new Error(
        `Input for stort til snapshot (${bytes} bytes > ${SEO_ENGINE_SNAPSHOT_HARD_MAX_BYTES})`
      ),
      { code: 'input_too_large', details: { bytes, max: SEO_ENGINE_SNAPSHOT_HARD_MAX_BYTES } }
    );
  }
  return bytes;
}
