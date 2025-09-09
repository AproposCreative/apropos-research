'use client';
import { useEffect, useState } from 'react';

export default function Drawer({ }: {}) {
  const [open, setOpen] = useState(false);
  const [item, setItem] = useState<any | null>(null);

  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.data?.type === 'open-drawer') { setItem(e.data.item); setOpen(true); }
      if (e.data?.type === 'close-drawer') setOpen(false);
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  if (!open || !item) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60" onClick={() => setOpen(false)}>
      <aside
        className="absolute right-0 top-0 h-full w-full sm:w-[480px] bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl border-l border-slate-200/50 dark:border-slate-700/50 shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-slate-200/50 dark:border-slate-700/50 flex items-center justify-between">
          <div className="font-semibold text-slate-800 dark:text-slate-100">Detaljer</div>
          <button className="text-sm text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100 transition-colors" onClick={() => setOpen(false)}>Luk</button>
        </div>
        <div className="p-5 space-y-3">
          {item.image ? <img src={item.image} alt="" className="w-full rounded-xl shadow-lg" /> : null}
          <div className="text-xs text-slate-500 dark:text-slate-400">{item.date}</div>
          <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-100">{item.title}</h3>
          <p className="text-slate-700 dark:text-slate-300 leading-relaxed">{item.summary}</p>
          {Array.isArray(item.bullets) && item.bullets.length > 0 ? (
            <ul className="list-disc ml-5 text-sm space-y-1 text-slate-600 dark:text-slate-400">{item.bullets.map((b: string, i: number) => <li key={i}>{b}</li>)}</ul>
          ) : null}
          <a href={item.url} target="_blank" rel="noreferrer" className="underline text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors">Åbn kilde</a>
        </div>
      </aside>
    </div>
  );
}
