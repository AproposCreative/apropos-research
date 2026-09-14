'use client';
import { useState } from 'react';
import type { User } from 'firebase/auth';
import type { ImageGenStyleConfig } from '@/lib/image-gen/style-config';

export default function StyleSettings({ user, onSaved }: { user: User; onSaved: () => void }) {
  const [config, setConfig] = useState<ImageGenStyleConfig | null>(null), [style, setStyle] = useState<'expressive' | 'minimal'>('expressive');
  const [instruction, setInstruction] = useState(''), [file, setFile] = useState<File | null>(null), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  async function load() {
    if (busy) return; setBusy(true);
    try {
      const response = await fetch('/api/image-gen/styles', { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: 'no-store' });
      if (!response.ok) throw new Error();
      const data = await response.json(); setConfig(data); setInstruction(data[style].instruction);
    } catch { setMessage('Kunne ikke hente stilreglerne.'); } finally { setBusy(false); }
  }
  async function save() {
    if (!config || busy) return; setBusy(true); setMessage('');
    try {
      const form = new FormData(); form.set('version', config.version); form.set('style', style); form.set('instruction', instruction);
      if (file) form.set('reference', file);
      const response = await fetch('/api/image-gen/styles', { method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}` }, body: form });
      if (!response.ok) throw new Error();
      setConfig(await response.json()); setFile(null); setMessage('Ny stilversion gemt. Eksisterende billeder er bevaret.'); onSaved();
    } catch { setMessage('Kunne ikke gemme. Genindlæs stilreglerne før et nyt forsøg.'); } finally { setBusy(false); }
  }
  return <details><summary onClick={() => { if (!config) void load(); }}>Stilindstillinger · kun Frederik</summary>
    <p>Faste grundregler: ét hovedmotiv, enkel komposition, ingen kollager og ingen dokumentariske AI-fotos. Hver ændring gemmes som en ny version.</p>
    {config && <><label>Stil<select value={style} onChange={e => { const value = e.target.value as typeof style; setStyle(value); setInstruction(config[value].instruction); setFile(null); }}><option value="expressive">Expressive</option><option value="minimal">Minimal</option></select></label>
      <label>Supplerende stilregler<textarea maxLength={2000} value={instruction} onChange={e => setInstruction(e.target.value)}/></label>
      <label>Ny Apropos-reference (valgfri, højst 2 MB)<input key={style} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setFile(e.target.files?.[0] ?? null)}/></label>
      <small>Aktuel version: {config.version.slice(0, 24)}</small><button disabled={busy} onClick={() => void save()}>Gem ny stilversion</button></>}
    <button disabled={busy} onClick={() => void load()}>Genindlæs stilregler</button>
    <button disabled={busy} onClick={() => void (async () => {
      setBusy(true); try {
        const r = await fetch('/api/image-gen/settings', { method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'initialize-budget', monthlyLimitDkk: 150 }) });
        if (!r.ok) throw new Error(); setMessage('Separat billedbudget aktiveret. Tidligere forbrug er bevaret.'); onSaved();
      } catch { setMessage('Budgettet kunne ikke aktiveres.'); } finally { setBusy(false); }
    })()}>Aktivér separat budget · 150 kr./måned</button><p role="status">{message}</p>
  </details>;
}
