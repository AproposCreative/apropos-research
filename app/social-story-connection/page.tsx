'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import RemoteMetaScreen, { type RemoteInput } from './RemoteMetaScreen';
type Frame = { connected: boolean; configured?: boolean; setupId?: string; screenshot?: string; cancelled?: boolean; verified?: boolean; checkedAt?: string };
const button = { minHeight: 44, padding: '8px 14px', borderRadius: 12, border: '1px solid #38383a', background: '#1c1c1e', color: '#0a84ff', font: 'inherit' };
export default function StoryConnectionPage() {
  const { user, capabilities, loading } = useAuth();
  const [frame, setFrame] = useState<Frame | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const generation = useRef(0), active = useRef<AbortController | null>(null), pending = useRef(0);
  const tail = useRef<Promise<void>>(Promise.resolve());
  const request = useCallback((body?: Record<string, unknown>) => {
    if (!user) return Promise.resolve();
    if (body?.action === 'cancel') {
      generation.current++; active.current?.abort(); tail.current = Promise.resolve(); pending.current = 0;
    }
    const epoch = generation.current; pending.current++; setBusy(true);
    const run = async () => {
      if (epoch !== generation.current) return;
      const controller = new AbortController(); active.current = controller;
      const deadline = setTimeout(() => controller.abort(), 115_000);
      try {
        const response = await fetch('/api/instagram/story-connection', { method: body ? 'POST' : 'GET',
          headers: { Authorization: `Bearer ${await user.getIdToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
          ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store', signal: controller.signal });
        const data = await response.json(); if (!response.ok) throw Error();
        if (epoch === generation.current) { setFrame(data); setError(''); }
      } catch {
        if (epoch === generation.current) {
          // An unknown input outcome is never replayed. Drop unsent keystrokes
          // and pause polling until the owner explicitly refreshes or stops.
          generation.current++; pending.current = 0; setBusy(false);
          setError('Forbindelsen blev afbrudt. Opdatér visningen før du skriver videre, eller stop login.');
        }
      } finally {
        clearTimeout(deadline);
        if (active.current === controller) active.current = null;
        if (epoch === generation.current) { pending.current--; setBusy(pending.current > 0); }
      }
    };
    tail.current = tail.current.then(run); return tail.current;
  }, [user]);
  useEffect(() => () => { generation.current++; active.current?.abort(); }, []);
  useEffect(() => { if (user && capabilities.owner) void request(); }, [user, capabilities.owner, request]);
  useEffect(() => {
    if (!frame?.setupId || !frame.screenshot || error) return;
    const timer = setInterval(() => {
      if (!pending.current && !active.current && document.visibilityState === 'visible')
        void request({ action: 'poll', setupId: frame.setupId });
    }, 2000);
    return () => clearInterval(timer);
  }, [frame?.setupId, !!frame?.screenshot, error, request]);
  const act = (action: string, values: Record<string, unknown> = {}) => request({ action, setupId: frame?.setupId, ...values });
  const input = (events: RemoteInput[]) => { void act('input', { events }); };
  if (loading) return <p>Indlæser…</p>;
  if (!user || !capabilities.owner) return <p>Log ind som ejer for at tilslutte Story-forbindelsen.</p>;
  return <main style={{ maxWidth: 1280, minHeight: '100dvh', margin: 'auto', padding: 16, color: '#f5f5f5', background: '#000', fontFamily: 'system-ui, sans-serif' }}>
    <a href="/design-editor" style={{ color: '#0a84ff' }}>Tilbage til SoMe</a>
    <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '12px 0' }}>
      <h1 style={{ fontSize: 22, fontWeight: 600 }}>Story-forbindelse</h1>
      {(frame?.screenshot || busy) && <button type="button" style={button} onClick={() => { void request({ action: 'cancel' }); }}>Stop login</button>}
    </header>
    {frame?.cancelled && <p role="status">Login er stoppet. Der forsøges ikke igen automatisk.</p>}
    {!frame?.screenshot && <>
      <p>{frame?.connected ? frame.verified === true ? 'Forbindelsen er kontrolleret i en ny serverbrowser.' : 'Et Meta-login er gemt. Kontrollér forbindelsen før brug.' : 'Tilslut Meta én gang. Stories udgives derefter fra serveren, også når din computer er slukket.'}</p>
      {frame?.verified === false && <p role="status">{frame.connected ? 'Det gemte login kunne ikke bekræftes hos Meta.' : 'Der er endnu ingen gemt Meta-forbindelse.'}</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" style={button} disabled={busy || frame?.configured === false} onClick={() => { void request({ action: 'begin' }); }}>{frame?.connected ? 'Forny login' : 'Tilslut Meta'}</button>
        <button type="button" style={button} disabled={busy || frame?.configured === false} onClick={() => { void request({ action: 'verify' }); }}>Kontrollér forbindelse</button>
      </div>
      {frame?.configured === false && <p>Serverforbindelsen er ikke konfigureret.</p>}
    </>}
    {frame?.screenshot && <>
      <p style={{ color: '#aaa', margin: '6px 0' }}>Klik i et felt og skriv direkte. Du kan også indsætte tekst og rulle i loginvinduet.</p>
      <RemoteMetaScreen screenshot={frame.screenshot} disabled={!!error} onEvents={input} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        <button type="button" style={button} disabled={busy} onClick={() => { void act('refresh'); }}>Opdatér visning</button>
        <button type="button" style={button} disabled={busy || !!error} onClick={() => { void act('instagram'); }}>Åbn Instagram</button>
        <button type="button" style={button} disabled={busy || !!error} onClick={() => { void act('finish'); }}>Gem og kontrollér</button>
      </div>
      <details style={{ marginTop: 16, color: '#aaa' }}><summary>Hjælp til login</summary>
        <p>Dette er serverens egen browser. En passkey på din telefon eller computer bliver ikke automatisk tilgængelig her. Brug en loginmetode, Meta tilbyder i vinduet. Ved gentagne sikkerhedskontroller: vælg Stop login.</p>
        <p>Indtast oplysninger direkte her, aldrig i chatten. Meta kan senere kræve, at du bekræfter login igen.</p>
      </details>
    </>}
    {busy && <p role="status" style={{ color: '#aaa' }}>Opdaterer…</p>}{error && <p role="alert">{error}</p>}
  </main>;
}
