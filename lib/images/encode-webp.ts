import sharp from 'sharp';

export type WebpPolicy = {
  maxSizeKB: number;
  maxLongEdge: number;
  qualityStart: number;
  qualityMin: number;
  effort?: number;
  preserveDimensions?: boolean;
  targetDimensions?: { width: number; height: number };
};

/** Hard byte budget. Never upload an oversize result or degrade below the quality floor. */
export async function encodeWebp(input: Buffer, policy: WebpPolicy) {
  for (const value of [policy.maxSizeKB, policy.maxLongEdge, policy.qualityStart, policy.qualityMin]) {
    if (!Number.isFinite(value) || value <= 0) throw new Error('Invalid image policy');
  }
  const metadata = await sharp(input, { limitInputPixels: 80_000_000 }).metadata();
  if ((metadata.pages ?? 1) > 1) throw new Error('Animated images require editorial review');
  if (!metadata.width || !metadata.height) throw new Error('Image dimensions unavailable');
  const budget = Math.floor(policy.maxSizeKB * 1024);
  const maxEdge = Math.min(4096, Math.round(policy.maxLongEdge));
  const qualityMin = Math.max(30, Math.min(95, Math.round(policy.qualityMin)));
  const qualityStart = Math.max(qualityMin, Math.min(95, Math.round(policy.qualityStart)));
  const fixed = policy.targetDimensions || policy.preserveDimensions;
  if (policy.targetDimensions && !Object.values(policy.targetDimensions).every(n => Number.isInteger(n) && n >= 200 && n <= 4096)) {
    throw new Error('Invalid target image dimensions');
  }
  // Keep enough detail for the intended role. Unachievable budgets fail visibly.
  const minimumEdge = Math.min(maxEdge, maxEdge > 1200 ? 1200 : 600);
  let edge = maxEdge;
  while (true) {
    let pipeline = sharp(input, { limitInputPixels: 80_000_000 }).rotate();
    if (policy.targetDimensions) pipeline = pipeline.resize(policy.targetDimensions.width, policy.targetDimensions.height, { fit: 'cover' });
    else if (!policy.preserveDimensions) pipeline = pipeline.resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true });
    const canvas = await pipeline.toBuffer();
    let quality = qualityStart;
    while (true) {
      const { data, info } = await sharp(canvas).webp({ quality, effort: policy.effort ?? 4 }).toBuffer({ resolveWithObject: true });
      if (data.byteLength <= budget) return { data, width: info.width, height: info.height, quality, bytes: data.byteLength };
      if (quality === qualityMin) break;
      quality = Math.max(qualityMin, quality - 5);
    }
    if (fixed || edge === minimumEdge) throw new Error(`Image exceeds ${policy.maxSizeKB} KB at the minimum permitted quality and dimensions`);
    edge = Math.max(minimumEdge, Math.floor(edge * 0.85));
  }
}
