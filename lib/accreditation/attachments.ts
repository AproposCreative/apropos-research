import { createHash, randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { readJsonFile, writeJsonFile } from '@/lib/funding/json-store';
import type { AccessPackage, AccessPackageAsset } from '@/lib/accreditation/types';
import { resolveAccreditationPersistenceKind } from '@/lib/accreditation/persistence/env';
import {
  COLLECTIONS,
  STORAGE_PREFIX,
  getSignedDownloadUrl,
  requireFirestore,
  requireStorageBucket,
  stripUndefined,
} from '@/lib/accreditation/persistence/firestore-kit';
import { registerAccreditationStoreReset } from '@/lib/accreditation/persistence/reset-registry';

const INDEX_FILE = 'accreditation_access_packages.json';
const ATTACH_DIR = path.join(process.cwd(), 'data', 'accreditation-attachments');

/** Hard caps — reject before write. */
export const ATTACHMENT_MAX_BYTES = 12 * 1024 * 1024; // 12 MB
export const ATTACHMENT_MAX_PER_PACKAGE = 20;

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'text/plain',
  'text/calendar',
  'application/ics',
  'application/octet-stream', // only if extension allowlisted
]);

const ALLOWED_EXT = new Set([
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.txt',
  '.ics',
  '.csv',
]);

const BLOCKED_EXT = new Set([
  '.exe',
  '.bat',
  '.cmd',
  '.com',
  '.msi',
  '.scr',
  '.js',
  '.mjs',
  '.cjs',
  '.vbs',
  '.ps1',
  '.sh',
  '.dmg',
  '.pkg',
  '.app',
  '.zip',
  '.rar',
  '.7z',
  '.html',
  '.htm',
  '.svg',
]);

const memoryPackages = new Map<string, AccessPackage>();
/** In-memory binary blobs keyed by relative storagePath (memory kind only). */
const memoryBlobs = new Map<string, Buffer>();

function ensureAttachDir() {
  if (!fs.existsSync(ATTACH_DIR)) fs.mkdirSync(ATTACH_DIR, { recursive: true });
}

async function loadAll(): Promise<AccessPackage[]> {
  const kind = resolveAccreditationPersistenceKind();
  if (kind === 'memory') return [...memoryPackages.values()];
  if (kind === 'json') return readJsonFile<AccessPackage[]>(INDEX_FILE, []);
  const db = requireFirestore();
  const snap = await db.collection(COLLECTIONS.accessPackages).get();
  return snap.docs.map((d) => d.data() as AccessPackage);
}

async function saveOne(pkg: AccessPackage): Promise<void> {
  const kind = resolveAccreditationPersistenceKind();
  if (kind === 'memory') {
    memoryPackages.set(pkg.requestId, pkg);
    return;
  }
  if (kind === 'json') {
    const all = readJsonFile<AccessPackage[]>(INDEX_FILE, []);
    const idx = all.findIndex((p) => p.requestId === pkg.requestId);
    if (idx >= 0) all[idx] = pkg;
    else all.push(pkg);
    writeJsonFile(INDEX_FILE, all);
    return;
  }
  const db = requireFirestore();
  await db
    .collection(COLLECTIONS.accessPackages)
    .doc(pkg.requestId)
    .set(stripUndefined({ ...pkg } as Record<string, unknown>), { merge: true });
}

export async function readAccessPackages(): Promise<AccessPackage[]> {
  return loadAll();
}

export async function writeAccessPackages(packages: AccessPackage[]): Promise<void> {
  const kind = resolveAccreditationPersistenceKind();
  if (kind === 'memory') {
    memoryPackages.clear();
    for (const p of packages) memoryPackages.set(p.requestId, p);
    return;
  }
  if (kind === 'json') {
    writeJsonFile(INDEX_FILE, packages);
    return;
  }
  const db = requireFirestore();
  const batch = db.batch();
  for (const p of packages) {
    batch.set(
      db.collection(COLLECTIONS.accessPackages).doc(p.requestId),
      stripUndefined({ ...p } as Record<string, unknown>),
      { merge: true }
    );
  }
  await batch.commit();
}

export async function getAccessPackage(requestId: string): Promise<AccessPackage | undefined> {
  const kind = resolveAccreditationPersistenceKind();
  if (kind === 'memory') return memoryPackages.get(requestId);
  if (kind === 'json') {
    return readJsonFile<AccessPackage[]>(INDEX_FILE, []).find((p) => p.requestId === requestId);
  }
  const db = requireFirestore();
  const snap = await db.collection(COLLECTIONS.accessPackages).doc(requestId).get();
  if (!snap.exists) return undefined;
  return snap.data() as AccessPackage;
}

export async function upsertAccessPackage(pkg: AccessPackage): Promise<AccessPackage> {
  await saveOne(pkg);
  return pkg;
}

export function sniffContentType(buf: Buffer, filename?: string): string {
  if (buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
    return 'application/pdf';
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return 'image/png';
  }
  if (buf.length >= 6 && buf.slice(0, 6).toString('ascii') === 'GIF87a') return 'image/gif';
  if (buf.length >= 6 && buf.slice(0, 6).toString('ascii') === 'GIF89a') return 'image/gif';
  const ext = path.extname(filename || '').toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.txt') return 'text/plain';
  if (ext === '.ics') return 'text/calendar';
  return 'application/octet-stream';
}

export function validateAttachmentSafety(params: {
  filename: string;
  contentType?: string;
  sizeBytes: number;
  buffer?: Buffer;
}): { safe: boolean; reason?: string; contentType: string } {
  const name = params.filename || 'unnamed';
  const ext = path.extname(name).toLowerCase();
  if (params.sizeBytes <= 0) return { safe: false, reason: 'empty', contentType: 'application/octet-stream' };
  if (params.sizeBytes > ATTACHMENT_MAX_BYTES) {
    return { safe: false, reason: `exceeds ${ATTACHMENT_MAX_BYTES} bytes`, contentType: 'application/octet-stream' };
  }
  if (BLOCKED_EXT.has(ext)) {
    return { safe: false, reason: `blocked extension ${ext}`, contentType: 'application/octet-stream' };
  }
  if (ext && !ALLOWED_EXT.has(ext)) {
    return { safe: false, reason: `disallowed extension ${ext}`, contentType: 'application/octet-stream' };
  }
  const sniffed = params.buffer
    ? sniffContentType(params.buffer, name)
    : params.contentType || 'application/octet-stream';
  if (!ALLOWED_MIME.has(sniffed) && sniffed !== 'application/octet-stream') {
    return { safe: false, reason: `disallowed mime ${sniffed}`, contentType: sniffed };
  }
  if (sniffed === 'application/octet-stream' && !ALLOWED_EXT.has(ext)) {
    return { safe: false, reason: 'unknown binary type', contentType: sniffed };
  }
  // Reject PE/ELF magic even if renamed
  if (params.buffer && params.buffer.length >= 2) {
    if (params.buffer[0] === 0x4d && params.buffer[1] === 0x5a) {
      return { safe: false, reason: 'PE executable magic', contentType: sniffed };
    }
    if (
      params.buffer.length >= 4 &&
      params.buffer[0] === 0x7f &&
      params.buffer[1] === 0x45 &&
      params.buffer[2] === 0x4c &&
      params.buffer[3] === 0x46
    ) {
      return { safe: false, reason: 'ELF executable magic', contentType: sniffed };
    }
  }
  return { safe: true, contentType: sniffed };
}

export async function storeAttachmentBuffer(params: {
  requestId: string;
  filename: string;
  buffer: Buffer;
  contentType?: string;
  kind?: AccessPackageAsset['kind'];
}): Promise<AccessPackageAsset> {
  const check = validateAttachmentSafety({
    filename: params.filename,
    contentType: params.contentType,
    sizeBytes: params.buffer.length,
    buffer: params.buffer,
  });
  const id = randomUUID();
  const sha256 = createHash('sha256').update(params.buffer).digest('hex');
  const safeName = path.basename(params.filename).replace(/[^\w.\-æøåÆØÅ]+/gi, '_').slice(0, 120);
  const filePart = `${id}-${safeName || 'file'}`;
  const kind = resolveAccreditationPersistenceKind();

  let storagePath: string | undefined;

  if (check.safe) {
    if (kind === 'firestore') {
      const objectPath = `${STORAGE_PREFIX}/${params.requestId}/${filePart}`;
      const bucket = requireStorageBucket();
      const file = bucket.file(objectPath);
      // PRIVATE: no makePublic, no firebaseStorageDownloadTokens
      await file.save(params.buffer, {
        resumable: false,
        metadata: {
          contentType: check.contentType,
          metadata: {
            requestId: params.requestId,
            sha256,
          },
        },
      });
      storagePath = objectPath;
    } else if (kind === 'memory') {
      const relative = `${params.requestId}/${filePart}`.replace(/\\/g, '/');
      memoryBlobs.set(relative, Buffer.from(params.buffer));
      storagePath = relative;
    } else {
      const relative = path.join(params.requestId, filePart);
      const absolute = path.join(ATTACH_DIR, relative);
      ensureAttachDir();
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, params.buffer);
      storagePath = relative.replace(/\\/g, '/');
    }
  }

  return {
    id,
    kind: params.kind || 'attachment',
    filename: safeName || 'file',
    contentType: check.contentType,
    sizeBytes: params.buffer.length,
    storagePath,
    sha256,
    safe: check.safe,
    quarantineReason: check.reason,
    createdAt: new Date().toISOString(),
  };
}

export async function readStoredAttachment(storagePath: string): Promise<Buffer | null> {
  if (!storagePath) return null;
  const kind = resolveAccreditationPersistenceKind();

  if (kind === 'firestore') {
    const bucket = requireStorageBucket();
    const objectPath = storagePath.startsWith(`${STORAGE_PREFIX}/`)
      ? storagePath
      : `${STORAGE_PREFIX}/${storagePath}`;
    const file = bucket.file(objectPath);
    const [exists] = await file.exists();
    if (!exists) return null;
    const [buf] = await file.download();
    return buf;
  }

  if (kind === 'memory') {
    return memoryBlobs.get(storagePath) || null;
  }

  const absolute = path.join(ATTACH_DIR, storagePath);
  if (!absolute.startsWith(ATTACH_DIR)) return null;
  if (!fs.existsSync(absolute)) return null;
  return fs.readFileSync(absolute);
}

/**
 * Signed download URL for Firebase Storage objects.
 * Returns null for local/memory backends (use readStoredAttachment instead).
 */
export async function getAttachmentSignedUrl(
  storagePath: string,
  expiresMs = 15 * 60 * 1000
): Promise<string | null> {
  if (!storagePath) return null;
  const kind = resolveAccreditationPersistenceKind();
  if (kind !== 'firestore') return null;
  return getSignedDownloadUrl(storagePath, expiresMs);
}

export function extractAccessLinks(text: string): string[] {
  const urls = text.match(/https?:\/\/[^\s<>"')\]]+/gi) || [];
  const interesting = urls.filter((u) =>
    /ticket|billet|download|pass|qr|guest|akkredit|badge|wallet|eventbrite|ticketmaster|dice\.fm|pass\.|box\.com|drive\.google|dropbox/i.test(
      u
    )
  );
  return Array.from(new Set(interesting.map((u) => u.replace(/[.,;]+$/, '')).slice(0, 15)));
}

export function extractGuestListInstructions(text: string): string | undefined {
  if (!/guest.?list|gæsteliste|afhent|pickup|will.?call|ved indgangen|navneliste/i.test(text)) {
    return undefined;
  }
  return text.slice(0, 1200).trim();
}

export function looksLikeAccessPackage(text: string, hasSafeAttachments: boolean): boolean {
  if (hasSafeAttachments) return true;
  if (extractAccessLinks(text).length > 0) return true;
  if (extractGuestListInstructions(text)) return true;
  return /vedhæft|attached|qr.?kod|pdf|billett?erne|your tickets|her er (jeres )?billetter/i.test(
    text
  );
}

export async function ensurePackage(requestId: string): Promise<AccessPackage> {
  const existing = await getAccessPackage(requestId);
  if (existing) return existing;
  return upsertAccessPackage({
    requestId,
    assets: [],
    deliveryStatus: 'none',
    updatedAt: new Date().toISOString(),
  });
}

export async function addAssetToPackage(
  requestId: string,
  asset: AccessPackageAsset
): Promise<AccessPackage> {
  const pkg = await ensurePackage(requestId);
  if (pkg.assets.length >= ATTACHMENT_MAX_PER_PACKAGE) {
    return pkg;
  }
  const next: AccessPackage = {
    ...pkg,
    assets: [...pkg.assets, asset],
    updatedAt: new Date().toISOString(),
  };
  if (asset.safe || asset.kind === 'link' || asset.kind === 'instruction') {
    if (next.deliveryStatus === 'none' || next.deliveryStatus === 'approval_only') {
      next.deliveryStatus = 'package_ready';
    }
  }
  return upsertAccessPackage(next);
}

registerAccreditationStoreReset({
  __resetForTests() {
    memoryPackages.clear();
    memoryBlobs.clear();
  },
});
