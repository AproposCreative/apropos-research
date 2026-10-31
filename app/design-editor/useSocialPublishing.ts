'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { auth, storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import type { SocialPublishInput, SocialPublishReceipt } from '@/lib/social/publish-types';
import { sortSocialReceipts } from '@/lib/social/receipt-feedback';
export type SocialPostSpec = Omit<SocialPublishInput, 'requestId' | 'imageUrl' | 'imageSha256'>;
export function useSocialPublishing(articleId: string) {
  const { user } = useAuth();
  const scope = user?.uid+':'+articleId;
  const currentScope = useRef(scope); currentScope.current = scope;
  const locked = useRef(false);
  const [posting, setPosting] = useState(false), [step, setStep] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<SocialPublishReceipt[]>([]);
  const [unconfirmedRequestId, setUnconfirmedRequestId] = useState<string | null>(null);
  const pendingKey = 'apropos-social-publish-pending:v1:'+scope;
  async function request(url: string, options: RequestInit = {}) {
    await auth?.authStateReady();
    if (!user || auth?.currentUser?.uid !== user.uid) throw Error('Log ind som redaktør.');
    const token = await auth.currentUser.getIdToken();
    return fetch(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` }, cache: 'no-store' });
  }
  useEffect(() => {
    let cancelled = false; setReceipts([]); setError(null);
    try { setUnconfirmedRequestId(localStorage.getItem(pendingKey)); } catch { setUnconfirmedRequestId(null); }
    if (!user || !articleId) return;
    void request('/api/instagram/publish?'+new URLSearchParams({ articleId })).then(async response => {
      if (!response.ok) throw Error('Historikken kunne ikke hentes.');
      const data = await response.json();
      if (!cancelled) setReceipts(sortSocialReceipts(data.receipts ?? []));
    }).catch(() => { if (!cancelled) setError('Udgivelseshistorikken kunne ikke hentes.'); });
    return () => { cancelled = true; };
  }, [scope]);
  const remember = (receipt: SocialPublishReceipt, ownerScope: string) => {
    if (ownerScope === currentScope.current) setReceipts(rows => sortSocialReceipts([receipt, ...rows.filter(row => row.id !== receipt.id)]));
  };
  async function check(requestId: string) {
    const ownerScope = scope; setError(null);
    try {
      const response = await request('/api/instagram/publish?'+new URLSearchParams({ requestId }));
      const data = await response.json();
      if (!response.ok) throw Error(data.error || 'Status kunne ikke hentes.');
      remember(data.receipt, ownerScope);
      if (ownerScope === currentScope.current) { setUnconfirmedRequestId(null); localStorage.removeItem(pendingKey); }
    } catch { if (ownerScope === currentScope.current) setError('Status kunne ikke hentes. Der er ikke sendt igen.'); }
  }
  async function publish(spec: SocialPostSpec, exportImage: () => Promise<Blob>) {
    if (locked.current) return;
    locked.current = true; setPosting(true); setError(null); setStep('Danner billede…');
    const ownerScope = scope; let started = false; let requestId: string | undefined;
    try {
      if (!spec.isStory && spec.caption.length > 2200) throw Error('Opslagsteksten må højst være 2.200 tegn inklusive afslutningen.');
      if (!user || !storage) throw Error('Log ind for at gemme og udgive billedet.');
      const blob = await exportImage();
      const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
      const imageSha256 = [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, '0')).join('');
      const journalKey = 'apropos-social-publish:v1:'+JSON.stringify([user.uid, spec.articleId, spec.card, spec.isStory, spec.caption, spec.articleUrl]);
      let prior: { requestId?: string } | null = null;
      try { prior = JSON.parse(localStorage.getItem(journalKey) || 'null'); } catch { /* new attempt */ }
      requestId = prior?.requestId || crypto.randomUUID();
      // Persist request identity before uploading or sending; a lost response can
      // be read back with this exact ID without another POST.
      localStorage.setItem(journalKey, JSON.stringify({ requestId }));
      setStep('Gemmer billede…');
      const path = `instagram-publish/${user.uid}-${imageSha256}.jpg`;
      const target = ref(storage, path);
      await uploadBytes(target, blob, { contentType: 'image/jpeg' });
      const imageUrl = await getDownloadURL(target);
      setStep('Udgiver…'); started = true;
      localStorage.setItem(pendingKey, requestId);
      if (ownerScope === currentScope.current) setUnconfirmedRequestId(requestId);
      const response = await request('/api/instagram/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...spec, requestId, imageUrl, imageSha256 } satisfies SocialPublishInput) });
      const data = await response.json();
      if (data.receipt) { remember(data.receipt, ownerScope); localStorage.removeItem(pendingKey);
        if (ownerScope === currentScope.current) setUnconfirmedRequestId(null); }
      else throw Error(data.error || 'Kvitteringen mangler.');
    } catch (cause) {
      if (ownerScope === currentScope.current) setError(started
        ? 'Kvitteringen mangler. Der sendes ikke automatisk igen. Hent status for samme forsøg.'
        : cause instanceof Error ? cause.message : 'Billedet kunne ikke klargøres. Intet er sendt.');
      if (started && requestId) await check(requestId);
    } finally { locked.current = false; setPosting(false); setStep(''); }
  }
  return { posting, step, error, receipts, unconfirmedRequestId, publish, check };
}
