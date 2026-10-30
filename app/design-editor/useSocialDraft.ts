'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { auth } from '@/lib/firebase';
import { DraftSync, type DraftSyncState } from './draftSync';
import type { SocialEditorDraft } from '@/lib/social/editor-draft';
export function useSocialDraft(identity: string, articleId: string) {
  const { user } = useAuth();
  const key = user && articleId ? JSON.stringify([user.uid, identity]) : '';
  const ref = useRef<DraftSync | null>(null);
  const [state, setState] = useState<DraftSyncState & { key: string }>({ key: '', ready: false, loadVersion: 0, draft: null, status: 'loading', error: null });
  useEffect(() => {
    if (!key || !user) return;
    let cancelled = false; let sync: DraftSync | null = null;
    async function start() {
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
      const sourceHash = [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, '0')).join('');
      const request = async (write?: { expectedRevision: number; draft: SocialEditorDraft; keepalive: boolean }) => {
        await auth?.authStateReady();
        if (auth?.currentUser?.uid !== user!.uid) throw Error('Account changed');
        const token = await auth.currentUser.getIdToken();
        const response = await fetch('/api/design-editor/draft'+(write ? '' : '?'+new URLSearchParams({ articleId, sourceHash })), {
          method: write ? 'PUT' : 'GET', headers: { Authorization: `Bearer ${token}`, ...(write ? { 'Content-Type': 'application/json' } : {}) },
          cache: 'no-store', ...(write ? { keepalive: write.keepalive, body: JSON.stringify({ articleId, sourceHash, expectedRevision: write.expectedRevision, draft: write.draft }) } : {}),
        });
        if (!response.ok && response.status !== 409) throw Error('Draft request failed');
        return { record: await response.json(), conflict: response.status === 409 };
      };
      if (cancelled) return;
      sync = new DraftSync({ getItem: name => localStorage.getItem(name), setItem: (name, value) => localStorage.setItem(name, value) }, 'apropos-social-draft:v1:'+key,
        { read: async () => (await request()).record,
          write: async (expectedRevision, draft, keepalive) => request({ expectedRevision, draft, keepalive }) },
        next => { if (!cancelled) setState({ ...next, key }); });
      ref.current = sync; await sync.load();
    }
    void start().catch(() => { if (!cancelled) setState({ key, ready: false, loadVersion: 0, draft: null, status: 'offline', error: 'Kladde kunne ikke hentes. Prøv igen.' }); });
    const flush = () => { if (document.visibilityState === 'hidden') void sync?.flush(true); };
    const hide = () => { void sync?.flush(true); };
    const online = () => { if (!sync?.state.ready) void sync?.load(); else void sync.flush(); };
    document.addEventListener('visibilitychange', flush); window.addEventListener('pagehide', hide); window.addEventListener('online', online);
    return () => { cancelled = true; sync?.close(); if (ref.current === sync) ref.current = null;
      document.removeEventListener('visibilitychange', flush); window.removeEventListener('pagehide', hide); window.removeEventListener('online', online); };
  }, [key, identity, articleId, user?.uid]);
  return { ...state, key, ready: state.key === key && state.ready, update: (draft: SocialEditorDraft) => ref.current?.edit(draft),
    keepLocal: () => ref.current?.keepLocal(), useServer: () => ref.current?.useServer(), retry: () => ref.current?.load() };
}
