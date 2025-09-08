'use client';
import { useState } from 'react';

export default function RefreshButton() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        if (busy) return;
        setBusy(true);
        const res = await fetch('/api/refresh', { method: 'POST' });
        setBusy(false);
        // simple reload to pick up new JSONL content
        if (res.ok) location.reload();
        else alert('Kunne ikke opdatere – tjek terminalen for ingest-output.');
      }}
      className="rounded-full border border-line px-3 py-1 text-xs text-gray-800 bg-white hover:bg-gray-50 transition disabled:opacity-60"
      disabled={busy}
      title="Hent nye artikler"
    >
      {busy ? 'Henter…' : 'Opdatér'}
    </button>
  );
}
