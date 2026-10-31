'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
type Frame = { connected: boolean; configured?: boolean; setupId?: string; screenshot?: string; width?: number; height?: number; cancelled?: boolean };
export default function StoryConnectionPage() {
  const { user, capabilities, loading } = useAuth();
  const [frame, setFrame] = useState<Frame | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [text, setText] = useState('');
  const sequence = useRef(0), activeRequest = useRef<AbortController | null>(null);
  const request = useCallback(async (body?: Record<string, unknown>) => {
    if (!user) return;
    const current = ++sequence.current;
    activeRequest.current?.abort();
    const controller = new AbortController(); activeRequest.current = controller;
    const deadline = setTimeout(() => controller.abort(), 115_000);
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/instagram/story-connection', { method: body ? 'POST' : 'GET',
        headers: { Authorization: `Bearer ${await user.getIdToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store', signal: controller.signal });
      const data = await response.json(); if (!response.ok) throw Error(data.error);
      if (current === sequence.current) { setFrame(data); if (data.cancelled) setText(''); }
    } catch (e) {
      if (current === sequence.current) setError(controller.signal.aborted
        ? 'Forbindelsen tog for lang tid. Stop login eller opdatér billedet før næste handling.'
        : e instanceof Error ? e.message : 'Forbindelsen kunne ikke hentes.');
    } finally {
      clearTimeout(deadline);
      if (current === sequence.current) { setBusy(false); activeRequest.current = null; }
    }
  }, [user]);
  useEffect(() => () => { sequence.current++; activeRequest.current?.abort(); }, []);
  useEffect(() => { if (user && capabilities.owner) void request(); }, [user, capabilities.owner, request]);
  const act = (action: string, values: Record<string, unknown> = {}) => request({ action, setupId: frame?.setupId, ...values });
  if (loading) return <p>Indlæser…</p>;
  if (!user || !capabilities.owner) return <p>Log ind som ejer for at tilslutte Story-forbindelsen.</p>;
  return <main style={{ maxWidth: 1100, minHeight: '100dvh', margin: 'auto', padding: 16, color: '#f5f5f5', background: '#000' }}>
    <a href="/design-editor">Tilbage til SoMe</a>
    <h1 style={{ fontSize: 24, fontWeight: 600, margin: '16px 0' }}>Story-forbindelse</h1>
    {frame?.cancelled && <p role="status">Login er stoppet. Der forsøges ikke igen automatisk.</p>}
    {(!frame?.connected || frame?.screenshot) && <button type="button" onClick={() => { void request({ action: 'cancel' }); }}>Stop login</button>}
    {frame?.connected && <p role="status">Meta-login gemt.</p>}
    {!frame?.screenshot && <>
      {!frame?.connected && <p>Forbind Apropos til Facebook og Instagram på serveren. Login gemmes krypteret til de Stories, du vælger at udgive. Din computer behøver derefter ikke være tændt.</p>}
      <button type="button" disabled={busy || frame?.configured === false} onClick={() => { void request({ action: 'begin' }); }}>{frame?.connected ? 'Forny Meta-login' : 'Forbind serverbrowser'}</button>
      {frame?.configured === false && <p>Serverbrowseren er endnu ikke installeret og tilsluttet.</p>}
    </>}
    {frame?.screenshot && <>
      <p>Klik i billedet for at bruge login-siden. Ved gentagne sikkerhedskontroller: vælg Stop login.</p>
      {/* The remote provider UI is an image, never HTML from another origin. */}
      <button type="button" disabled={busy} aria-label="Klik på login-siden. Brug Tab og Indsæt nedenfor til tastaturbetjening."
        style={{ display: 'block', width: '100%', padding: 0, border: 0, cursor: busy ? 'wait' : 'pointer' }}
        onClick={event => { if (busy) return; const r = event.currentTarget.getBoundingClientRect();
          if (event.detail) void act('click', { x: (event.clientX-r.left)/r.width*1650, y: (event.clientY-r.top)/r.height*1045 }); }}>
        <img src={'data:image/jpeg;base64,'+frame.screenshot} alt="Login hos Meta i serverbrowseren" draggable={false} style={{ display: 'block', width: '100%' }} />
      </button>
      <form onSubmit={event => { event.preventDefault(); const value = text; setText(''); void act('text', { text: value }); }} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
        <input aria-label="Tekst til det valgte loginfelt" placeholder="Skriv til det valgte felt, og tryk Indsæt" type="password" autoComplete="off" value={text} onChange={event => setText(event.target.value)} maxLength={2000} disabled={busy}
          style={{ minHeight: 44, padding: '8px 12px', background: '#1c1c1e', border: '1px solid #555', borderRadius: 10, flex: '1 1 220px' }} />
        <button disabled={busy || !text} type="submit">Indsæt</button>
        {['Tab', 'Backspace', 'Enter'].map(key => <button key={key} type="button" disabled={busy} onClick={() => { void act('key', { key }); }}>{key}</button>)}
        <button type="button" disabled={busy} onClick={() => { void act('refresh'); }}>Opdatér billede</button>
        <button type="button" disabled={busy} onClick={() => { void act('instagram'); }}>Åbn Instagram</button>
        <button type="button" disabled={busy} onClick={() => { void act('finish'); }}>Gem forbindelse</button>
      </form>
    </>}
    {busy && <p role="status">Arbejder…</p>}{error && <p role="alert">{error}</p>}
  </main>;
}
