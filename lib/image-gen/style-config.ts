import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { getAdminDb, getAdminStorageBucket } from '@/lib/firebase-admin';
import { encodeWebp } from '@/lib/images/encode-webp';
import { imageGenHash } from './article';
import { aproposIllustrationStyle, APROPOS_IMAGE_STYLE_VERSION, type AproposImageStyle } from './styles';

type StyleEntry = { instruction: string; reference: string; hash?: string };
export type ImageGenStyleConfig = { version: string; expressive: StyleEntry; minimal: StyleEntry };
const builtin: ImageGenStyleConfig = { version: APROPOS_IMAGE_STYLE_VERSION,
  expressive: { instruction: '', reference: 'expressive-v1.jpg' }, minimal: { instruction: '', reference: 'minimal-v1.webp' } };
function storage() {
  const name = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_ADMIN_STORAGE_BUCKET;
  const bucket = name && getAdminStorageBucket(name); if (!bucket) throw new Error('image_gen_storage_unavailable'); return bucket;
}
export async function readImageGenStyleConfig(): Promise<ImageGenStyleConfig> {
  const db = getAdminDb(); if (!db) throw new Error('image_gen_store_unavailable');
  const row = (await db.collection('imageGenConfiguration').doc('styles').get()).data();
  if (!row) return builtin;
  const config = row as ImageGenStyleConfig;
  if (!/^[a-f0-9]{64}$/.test(config.version)) throw new Error('image_gen_style_invalid');
  for (const style of ['expressive', 'minimal'] as const) {
    const entry = config[style];
    if (!entry || typeof entry.instruction !== 'string' || entry.instruction.length > 2000 ||
      ![builtin[style].reference, `image-gen-style/${entry.hash}.webp`].includes(entry.reference)) throw new Error('image_gen_style_invalid');
  }
  return config;
}
export async function imageGenStyleReference(config: ImageGenStyleConfig, style: AproposImageStyle) {
  const entry = config[style]; if (!entry) throw new Error('image_gen_style_invalid');
  let bytes: Buffer;
  if (entry.reference === builtin[style].reference) bytes = await readFile(path.join(process.cwd(), 'data/image-gen/references', entry.reference));
  else {
    if (!entry.hash || entry.reference !== `image-gen-style/${entry.hash}.webp`) throw new Error('image_gen_reference_invalid');
    [bytes] = await storage().file(entry.reference).download({ validation: 'crc32c' });
    if (imageGenHash(bytes.toString('base64')) !== entry.hash) throw new Error('image_gen_reference_invalid');
  }
  if (bytes.length > 2_000_000) throw new Error('image_gen_reference_invalid');
  return new File([new Uint8Array(bytes)], entry.reference.endsWith('.jpg') ? 'style-reference.jpg' : 'style-reference.webp',
    { type: entry.reference.endsWith('.jpg') ? 'image/jpeg' : 'image/webp' });
}
export function imageGenStylePrompt(config: ImageGenStyleConfig, style: AproposImageStyle) {
  return `${aproposIllustrationStyle(style)}\nOwner's additional style direction: ${config[style].instruction}`;
}
/** Caller must authorize Frederik before this function. Immutable versions keep provenance. */
export async function updateImageGenStyle(uid: string, expectedVersion: string, style: AproposImageStyle, instruction: string, file?: File) {
  if (!['expressive', 'minimal'].includes(style) || typeof instruction !== 'string' || instruction.length > 2000) throw new Error('image_gen_style_invalid');
  const previous = await readImageGenStyleConfig();
  if (previous.version !== expectedVersion) throw new Error('image_gen_style_conflict');
  const entry = { ...previous[style], instruction: instruction.trim() };
  if (file) {
    if (file.size > 2_000_000 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('image_gen_reference_invalid');
    const input = Buffer.from(await file.arrayBuffer());
    const meta = await sharp(input, { limitInputPixels: 20_000_000 }).metadata();
    if ((meta.pages ?? 1) !== 1 || !['jpeg', 'png', 'webp'].includes(meta.format || '')) throw new Error('image_gen_reference_invalid');
    const encoded = await encodeWebp(input, { maxSizeKB: 450, maxLongEdge: 1600, qualityStart: 85, qualityMin: 55, effort: 4 });
    entry.hash = imageGenHash(encoded.data.toString('base64')); entry.reference = `image-gen-style/${entry.hash}.webp`;
    const target = storage().file(entry.reference);
    // Content-addressed immutable upload. Reusing identical bytes isn't an overwrite.
    try { await target.save(encoded.data, { resumable: false, validation: 'crc32c', preconditionOpts: { ifGenerationMatch: 0 }, metadata: { contentType: 'image/webp' } }); }
    catch (error) { if ((error as { code?: number }).code !== 412) throw error; }
    const [check] = await target.download({ validation: 'crc32c' });
    if (!check.equals(encoded.data)) throw new Error('image_gen_reference_invalid');
  }
  const next = { ...previous, [style]: entry, version: imageGenHash(JSON.stringify([previous.version, style, entry])) };
  const db = getAdminDb()!;
  await db.runTransaction(async tx => {
    const current = db.collection('imageGenConfiguration').doc('styles');
    const row = (await tx.get(current)).data();
    if ((row?.version ?? APROPOS_IMAGE_STYLE_VERSION) !== expectedVersion) throw new Error('image_gen_style_conflict');
    const data = { ...next, changedBy: uid, changedAt: new Date().toISOString() };
    tx.create(db.collection('imageGenStyleVersions').doc(next.version), data); tx.set(current, data);
  });
  return next;
}
