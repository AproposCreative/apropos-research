import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { getAdminAuth } from '../lib/firebase-admin';
import { GET, PUT } from '../app/api/liv/media-sources/route';

/** Explicit release setup, using the same authenticated application handlers.
 * Caller supplies production credentials securely. No CLI side effects on import.
 * Only initializes a genuinely empty shared list; never migrates personal sources.
 */
export async function initializeSharedMediaSource() {
  const admin = getAdminAuth(); if (!admin) throw new Error('admin_unavailable');
  const owner = await admin.getUserByEmail('frederik@aproposmagazine.com');
  if (!owner.emailVerified || owner.disabled) throw new Error('verified_owner_required');
  const app = initializeApp({ apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY }, `source-setup-${randomUUID()}`);
  const auth = getAuth(app);
  try {
    const signed = await signInWithCustomToken(auth, await admin.createCustomToken(owner.uid));
    const token = await signed.user.getIdToken();
    const url = 'https://ai.aproposmagazine.com/api/liv/media-sources';
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const before = await GET(new Request(url, { headers }));
    if (!before.ok) throw new Error(`source_read_${before.status}`);
    const initial = await before.json();
    if (initial.sources.length) {
      console.log(JSON.stringify({ initialized: false, reason: 'shared_list_already_configured', count: initial.sources.length }));
      return;
    }
    const saved = await PUT(new Request(url, { method: 'PUT', headers, body: JSON.stringify({
      name: 'Soundvenue', baseUrl: 'https://soundvenue.com', sitemapIndex: 'https://soundvenue.com/feed', enabled: true, revision: 0,
    }) }));
    if (!saved.ok) throw new Error(`source_write_${saved.status}`);
    const written = await saved.json();
    const after = await GET(new Request(url, { headers }));
    if (!after.ok) throw new Error(`source_readback_${after.status}`);
    const readback = (await after.json()).sources.find((source: { id: string }) => source.id === written.source.id);
    if (!readback?.enabled || readback.revision !== written.source.revision || !readback.check?.checkedAt) throw new Error('source_readback_mismatch');
    console.log(JSON.stringify({ initialized: true, id: readback.id, name: readback.name,
      enabled: readback.enabled, revision: readback.revision, check: readback.check,
      handlerExecution: 'local-release-process', storage: 'production', deployed: false }));
  } finally { await signOut(auth); await deleteApp(app); }
}
