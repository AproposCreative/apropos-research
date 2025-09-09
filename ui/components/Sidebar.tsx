'use client';
import { useMemo } from 'react';

export default function Sidebar({ all, params }: { all: any[]; params: URLSearchParams; }) {
  const byCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of all) {
      const k = (p.category ?? '').trim() || 'ukendt';
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a,b) => b[1]-a[1]);
  }, [all]);

  function link(next: Record<string,string|undefined>) {
    const q = new URLSearchParams(params.toString());
    for (const [k,v] of Object.entries(next)) { if (!v) q.delete(k); else q.set(k, v); }
    return `?${q.toString()}`;
  }

  return (
    <aside className="hidden lg:block w-[260px] shrink-0">
      <div className="sticky top-20 space-y-6">
        <div>
          <div className="text-xs text-gray-500 mb-2">Kategorier</div>
          <div className="space-y-1">
            {byCat.map(([c,n]) => (
              <a key={c} href={link({ cat: c })} className="flex items-center justify-between rounded-lg border border-slate-300/50 dark:border-slate-600/50 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm px-3 py-2 text-sm hover:bg-slate-100/70 dark:hover:bg-slate-700/70 transition-all duration-300">
                <span className="truncate">{c}</span><span className="text-gray-500">{n}</span>
              </a>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-2">Hurtigt</div>
          <div className="grid grid-cols-2 gap-2">
            <a href={link({ fresh: params.get('fresh') === '1' ? '' : '1' })}
               className="rounded-lg border border-slate-300/50 dark:border-slate-600/50 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm px-3 py-2 text-xs text-center hover:bg-slate-100/70 dark:hover:bg-slate-700/70 transition-all duration-300">
              {params.get('fresh') === '1' ? 'Alle tider' : '<24t'}
            </a>
            <a href={link({})}
               className="rounded-lg border border-slate-300/50 dark:border-slate-600/50 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm px-3 py-2 text-xs text-center hover:bg-slate-100/70 dark:hover:bg-slate-700/70 transition-all duration-300">
              Nulstil
            </a>
          </div>
        </div>
      </div>
    </aside>
  );
}
