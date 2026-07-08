import { getFirebaseAuth } from '@/lib/firebase';

const CHUNK_SIZE = 256 * 1024;

function storageBucket(): string {
  const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim();
  if (!bucket) {
    throw new Error('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET mangler');
  }
  return bucket;
}

/**
 * Browser-upload direkte til Firebase Storage via REST resumable API.
 * Bruger brugerens Firebase ID-token (samme som SDK, men mere forudsigeligt i Next.js).
 */
export async function uploadAudioToFirebaseStorage(
  storagePath: string,
  file: File,
  onProgress?: (pct: number) => void
): Promise<void> {
  const auth = getFirebaseAuth();
  const user = auth?.currentUser;
  if (!user) {
    throw new Error('Du skal være logget ind for at uploade til Storage');
  }

  const idToken = await user.getIdToken(true);
  const bucket = storageBucket();
  const contentType = file.type || 'audio/mp4';
  const name = encodeURIComponent(storagePath);

  const startRes = await fetch(
    `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?name=${name}&uploadType=resumable`,
    {
      method: 'POST',
      headers: {
        Authorization: `Firebase ${idToken}`,
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Type': contentType,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({ name: storagePath, contentType }),
    }
  );

  if (!startRes.ok) {
    const text = await startRes.text();
    if (startRes.status === 403 || /permission/i.test(text)) {
      throw new Error(
        'Ingen adgang til Storage — log ind igen eller kontakt admin (storage.rules)'
      );
    }
    throw new Error(`Upload start fejlede (${startRes.status})`);
  }

  const sessionUrl = startRes.headers.get('x-goog-upload-url');
  if (!sessionUrl) {
    throw new Error('Manglende upload-session fra Firebase Storage');
  }

  let offset = 0;
  while (offset < file.size) {
    const end = Math.min(offset + CHUNK_SIZE, file.size);
    const chunk = file.slice(offset, end);
    const isLast = end >= file.size;

    const uploadRes = await fetch(sessionUrl, {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Command': isLast ? 'upload, finalize' : 'upload',
        'X-Goog-Upload-Offset': String(offset),
        'Content-Type': contentType,
      },
      body: chunk,
    });

    if (!uploadRes.ok) {
      const text = await uploadRes.text();
      if (uploadRes.status === 403 || /permission/i.test(text)) {
        throw new Error(
          'Storage afviste upload (manglende rettigheder) — log ind igen eller kontakt admin'
        );
      }
      throw new Error(`Upload fejlede (${uploadRes.status})`);
    }

    offset = end;
    onProgress?.(file.size > 0 ? Math.round((offset / file.size) * 100) : 100);
  }

  onProgress?.(100);
}
