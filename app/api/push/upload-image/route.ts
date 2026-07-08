import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { getNewsletterUserIdFromRequest } from '@/lib/newsletter/auth-request';
import { getAdminStorageBucket } from '@/lib/firebase-admin';
import { resolvePodcastBucketName } from '@/lib/podcast/bucket';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const uid = await getNewsletterUserIdFromRequest(req);
  if (!uid) {
    return NextResponse.json({ error: 'Ikke autoriseret' }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Manglende fil' }, { status: 400 });
  }

  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Kun billeder understøttes' }, { status: 400 });
  }

  if (file.size > 8 * 1024 * 1024) {
    return NextResponse.json({ error: 'Billede må max være 8 MB' }, { status: 400 });
  }

  const bucketName = resolvePodcastBucketName();
  const bucket = getAdminStorageBucket(bucketName);
  if (!bucket) {
    return NextResponse.json({ error: 'Storage er ikke konfigureret' }, { status: 503 });
  }

  const raw = Buffer.from(await file.arrayBuffer());
  const processed = await sharp(raw)
    .rotate()
    .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();

  const token = randomUUID();
  const path = `push-notifications/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.jpg`;

  await bucket.file(path).save(processed, {
    resumable: false,
    metadata: {
      contentType: 'image/jpeg',
      cacheControl: 'public, max-age=31536000, immutable',
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });

  const url = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;

  return NextResponse.json({ ok: true, url, sizeKB: Math.round(processed.byteLength / 1024) });
}
