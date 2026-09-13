import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { getAdminAuth } from '../lib/firebase-admin';
import { EDITORIAL_EMAILS } from '../lib/auth-policy';

/** Explicit release check. No AI/CMS writes, no real-user verification changes.
 * Production credentials must be supplied by the caller; never prints tokens.
 */
export async function verifyEditorialRosterProduction() {
  const admin = getAdminAuth();
  if (!admin) throw new Error('firebase_admin_missing');
  const owner = await admin.getUserByEmail('frederik@aproposmagazine.com');
  const users = [owner];
  for (const uid of (process.env.SEO_ENGINE_ADMIN_UIDS || '').split(',').map(x => x.trim()).filter(Boolean)) {
    const user = await admin.getUser(uid);
    if (!EDITORIAL_EMAILS.some(email => email === user.email?.toLowerCase())) users.push(user);
  }
  for (const user of users) {
    const app = initializeApp({ apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY }, `roster-check-${randomUUID()}`);
    const auth = getAuth(app);
    try {
      const signed = await signInWithCustomToken(auth, await admin.createCustomToken(user.uid));
      const token = await signed.user.getIdToken();
      const headers = { Authorization: `Bearer ${token}` };
      const response = await fetch('https://ai.aproposmagazine.com/api/auth/access', { headers, redirect: 'error' });
      const data = await response.json();
      const isOwner = user.uid === owner.uid;
      if (isOwner ? response.status !== 200 || data.role !== 'admin' : ![401, 403].includes(response.status)) {
        throw new Error('production_roster_policy_mismatch');
      }
      console.log(JSON.stringify({ case: isOwner ? 'verified-owner-admin' : 'former-admin-denied', status: response.status }));
      if (isOwner) {
        const operations = await fetch('https://ai.aproposmagazine.com/api/editorial/operations', { headers, redirect: 'error' });
        if (!operations.ok) throw new Error('operations_read_failed');
        console.log(JSON.stringify({ operations: await operations.json() }));
        const feed = await fetch('https://ai.aproposmagazine.com/api/liv/delivery/feed', { headers, redirect: 'error' });
        if (!feed.ok) throw new Error('preview_read_failed');
        const saved = await feed.json();
        console.log(JSON.stringify({ preview: { total: saved.total, queueEnabled: saved.queueEnabled,
          preparationEnabled: saved.preparationEnabled, stories: saved.stories?.map((story: {
            title: string; scheduledDay: string; state: string; publicationBlockers: string[];
          }) => ({ title: story.title, day: story.scheduledDay, state: story.state, blockers: story.publicationBlockers })) } }));
      }
    } finally {
      await signOut(auth);
      await deleteApp(app);
    }
  }
}
