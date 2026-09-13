'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from './auth-context';
import type { WorkspacePayload } from './writer-workspace';
import { WriterWorkspaceSync, type WorkspaceSyncState } from './writer-workspace-sync';

const labels = { loading: 'Henter arbejdsrum…', ready: 'Klar', resume: 'Gemt arbejdsrum fundet',
  saving: 'Gemmer…', saved: 'Gemt', offline: 'Ikke synkroniseret',
  conflict: 'Konflikt: Begge versioner er bevaret', invalid: 'Arbejdsrummet kunne ikke gemmes. Kontrollér størrelse og indhold.' };
export function useWriterWorkspace(data: WorkspacePayload) {
  const { user } = useAuth();
  const [state, setState] = useState<WorkspaceSyncState>({ phase: 'loading', resume: null });
  const sync = useRef<WriterWorkspaceSync | null>(null);
  const currentData = useRef(data); currentData.current = data;
  const serialized = JSON.stringify(data);
  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    const headers = async () => ({ Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' });
    const session = new WriterWorkspaceSync({
      read: async () => fetch('/api/writer/workspace', { headers: await headers(), cache: 'no-store', signal: controller.signal }),
      write: async body => fetch('/api/writer/workspace', { method: 'PUT', headers: await headers(), body, signal: controller.signal }),
    }, setState);
    sync.current = session;
    session.setData(currentData.current);
    void session.start();
    const reconnect = () => { void session.retry(); };
    window.addEventListener('online', reconnect);
    return () => { session.dispose(); controller.abort(); window.removeEventListener('online', reconnect); sync.current = null; };
  }, [user]);
  useEffect(() => { sync.current?.setData(JSON.parse(serialized)); }, [serialized]);
  return { status: labels[state.phase], resume: state.resume, canRetry: state.phase === 'offline',
    retry: () => { void sync.current?.retry(); }, acceptResume: () => sync.current?.acceptResume() };
}
