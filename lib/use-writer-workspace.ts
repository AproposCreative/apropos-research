'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from './auth-context';
import type { WorkspacePayload, WorkspaceSnapshot } from './writer-workspace';

export function useWriterWorkspace(data: WorkspacePayload) {
  const { user } = useAuth();
  const [resume, setResume] = useState<WorkspaceSnapshot | null>(null);
  const [status, setStatus] = useState('Henter arbejdsrum…');
  const [ready, setReady] = useState(false);
  const [tick, setTick] = useState(0);
  const revision = useRef(0), lastSaved = useRef(''), busy = useRef(false), mounted = useRef(true);
  const serialized = JSON.stringify(data);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    if (user) void (async () => {
      try {
        const response = await fetch('/api/writer/workspace', { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: 'no-store' });
        if (!response.ok) throw new Error('unavailable');
        const body = await response.json();
        if (!active) return;
        revision.current = body.workspace?.revision || 0;
        setResume(body.workspace || null); setReady(true); setStatus(body.workspace ? 'Gemt arbejdsrum fundet' : 'Klar');
      } catch { if (active) setStatus('Ikke synkroniseret'); }
    })();
    return () => { active = false; mounted.current = false; };
  }, [user]);
  useEffect(() => {
    if (!user || !ready || resume || serialized === lastSaved.current) return;
    if (!data.messages.length && !data.notes && !data.articleData.title) return;
    const timer = setTimeout(async () => {
      if (busy.current) return;
      busy.current = true; setStatus('Gemmer…');
      try {
        const response = await fetch('/api/writer/workspace', { method: 'PUT',
          headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ revision: revision.current, data: JSON.parse(serialized) }) });
        const body = await response.json();
        if (!mounted.current) return;
        if (!response.ok) { setReady(false); setStatus(response.status === 409 ? 'Konflikt: Begge versioner er bevaret' : 'Ikke synkroniseret'); return; }
        revision.current = body.revision; lastSaved.current = serialized; setStatus('Gemt');
      } catch { if (mounted.current) { setReady(false); setStatus('Ikke synkroniseret'); } }
      finally { busy.current = false; if (mounted.current) setTick(value => value + 1); }
    }, 2000);
    return () => clearTimeout(timer);
  }, [serialized, ready, resume, user, tick]);
  return { status, resume, acceptResume: () => setResume(null) };
}
