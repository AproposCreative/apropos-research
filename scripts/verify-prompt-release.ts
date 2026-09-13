import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { getAdminAuth } from '../lib/firebase-admin';

/** Preview only: no model, research, CMS or workspace writes. Never print prompt output. */
export async function verifyPromptRelease() {
  const admin = getAdminAuth(); if (!admin) throw new Error('admin_missing');
  const owner = await admin.getUserByEmail('frederik@aproposmagazine.com');
  if (!owner.emailVerified || owner.disabled) throw new Error('owner_unavailable');
  const app = initializeApp({ apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY }, `prompt-release-${randomUUID()}`);
  const auth = getAuth(app);
  const url = 'https://ai.aproposmagazine.com/api/ai-chat/prompt-preview';
  const body = JSON.stringify({ articleData: {}, notes: 'Isoleret releasekontrol uden private oplysninger.' });
  try {
    const anonymous = await fetch(url, {method:'POST',body,headers:{'Content-Type':'application/json'},redirect:'manual',signal:AbortSignal.timeout(30000)});
    if (![401,403].includes(anonymous.status)) throw new Error(`anonymous_unexpected:${anonymous.status}`);
    console.log(JSON.stringify({case:'anonymous-denied',status:anonymous.status}));
    const signed = await signInWithCustomToken(auth, await admin.createCustomToken(owner.uid));
    const token = await signed.user.getIdToken();
    const response = await fetch(url, {method:'POST',body,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(30000)});
    if (!response.ok) throw new Error(`preview_failed:${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.nodes) || data.webContent !== null || data.researchStatus !== 'not_requested') throw new Error('preview_contract_changed');
    if (response.headers.get('cache-control') !== 'private, no-store') throw new Error('preview_cache_unsafe');
    console.log(JSON.stringify({case:'owner-preview',status:response.status,cache:response.headers.get('cache-control'),researchStatus:data.researchStatus}));
  } finally { await signOut(auth); await deleteApp(app); }
}
