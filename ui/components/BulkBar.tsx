'use client';
import { useMemo, useState } from 'react';
import { useSelect } from './SelectCtx';

export default function BulkBar() {
  const { selected, clear } = useSelect();
  const [busy, setBusy] = useState(false);
  const list = Object.values(selected);
  const count = list.length;

  const copyText = useMemo(() => {
    return list.map((p, i) => {
      const bullets = (p.bullets ?? []).slice(0, 3);
      const b = bullets.length ? '\n• ' + bullets.join('\n• ') : '';
      return `${i + 1}. ${p.title}\n${p.summary ?? ''}${b}\n${p.url}`;
    }).join('\n\n');
  }, [list]);

  if (count === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 rounded-full border border-line bg-white shadow-card px-4 py-2 flex items-center gap-3">
      <div className="text-sm">
        <span className="font-medium">{count}</span> valgt
      </div>
      <button
        className="rounded-full border border-line bg-white px-3 py-1 text-xs hover:bg-gray-50 transition"
        onClick={async () => {
          await navigator.clipboard.writeText(copyText);
        }}
        title="Kopiér valgte som prompt-tekst"
      >
        Kopiér valgte
      </button>
      <button
        className="rounded-full border border-line bg-white px-3 py-1 text-xs hover:bg-gray-50 transition disabled:opacity-60"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const res = await fetch('/api/send', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ items: list }),
          });
          setBusy(false);
          if (res.ok) { clear(); alert('Sendt (placeholder).'); }
          else { alert('Kunne ikke sende.'); }
        }}
        title="Send til AI (placeholder)"
      >
        {busy ? 'Sender…' : 'Send til AI'}
      </button>
      <button
        className="rounded-full border border-line bg-white px-3 py-1 text-xs hover:bg-gray-50 transition"
        onClick={clear}
      >
        Ryd
      </button>
    </div>
  );
}
