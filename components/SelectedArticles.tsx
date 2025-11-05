'use client';
import { useSelect } from './SelectCtx';
import { useState, useMemo } from 'react';
import Link from 'next/link';

export default function SelectedArticles({ allArticles }: { allArticles: any[] }) {
  const { selected, clear } = useSelect();
  const [busy, setBusy] = useState(false);
  
  const selectedList = Object.values(selected);
  const count = selectedList.length;

  const copyText = useMemo(() => {
    return selectedList.map((p, i) => {
      const bullets = (p.bullets ?? []).slice(0, 3);
      const b = bullets.length ? '\n• ' + bullets.join('\n• ') : '';
      return `${i + 1}. ${p.title}\n${p.summary ?? ''}${b}\n${p.url}`;
    }).join('\n\n');
  }, [selectedList]);

  if (count === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-6xl mb-4">📝</div>
        <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-100 mb-2">Ingen artikler valgt</h2>
        <p className="text-slate-500 dark:text-slate-400 mb-6">Gå tilbage til forsiden og vælg nogle artikler ved at klikke på checkboxen i øverste venstre hjørne af hver artikel.</p>
        <Link 
          href="/" 
          className="inline-flex items-center px-6 py-3 bg-slate-100/70 dark:bg-black/70 backdrop-blur-sm text-slate-700 dark:text-slate-300 rounded-xl text-sm font-medium hover:bg-slate-200/70 dark:hover:bg-slate-700/70 transition-all duration-300 border border-slate-300/50 dark:border-slate-600/50 shadow-lg ring-1 ring-white/20 dark:ring-slate-700/50"
        >
          Gå til forsiden
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header med actions */}
      <div className="bg-white/70 dark:bg-black/70 backdrop-blur-2xl border border-slate-200/50 dark:border-slate-700/50 rounded-2xl p-6 shadow-lg ring-1 ring-white/20 dark:ring-slate-700/50">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
              {count} {count === 1 ? 'artikel' : 'artikler'} valgt
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm">Klar til at sende videre</p>
          </div>
          <button
            className="px-4 py-2 bg-slate-100/70 dark:bg-black/70 backdrop-blur-sm text-slate-700 dark:text-slate-300 rounded-xl text-sm font-medium hover:bg-slate-200/70 dark:hover:bg-slate-700/70 transition-all duration-300 border border-slate-300/50 dark:border-slate-600/50 shadow-lg ring-1 ring-white/20 dark:ring-slate-700/50"
            onClick={clear}
          >
            Ryd alle
          </button>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            className="px-4 py-2 bg-slate-100/70 dark:bg-black/70 backdrop-blur-sm text-slate-700 dark:text-slate-300 rounded-xl text-sm font-medium hover:bg-slate-200/70 dark:hover:bg-slate-700/70 transition-all duration-300 border border-slate-300/50 dark:border-slate-600/50 shadow-lg ring-1 ring-white/20 dark:ring-slate-700/50"
            onClick={async () => {
              await navigator.clipboard.writeText(copyText);
            }}
            title="Kopiér valgte som prompt-tekst"
          >
            Kopiér valgte
          </button>
          <button
            className="px-4 py-2 bg-gradient-to-r from-slate-600 to-slate-700 dark:from-slate-500 dark:to-slate-600 text-white rounded-xl text-sm font-medium hover:from-slate-700 hover:to-slate-800 dark:hover:from-slate-400 dark:hover:to-slate-500 transition-all duration-300 shadow-lg disabled:opacity-60"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const res = await fetch('/api/send', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ items: selectedList }),
              });
              setBusy(false);
              if (res.ok) { 
                clear(); 
                alert('Sendt (placeholder).'); 
              } else { 
                alert('Kunne ikke sende.'); 
              }
            }}
            title="Send til AI (placeholder)"
          >
            {busy ? 'Sender…' : 'Send til AI'}
          </button>
        </div>
      </div>

      {/* Liste af valgte artikler */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {selectedList.map((article, index) => (
          <div key={article.id} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white mb-2 line-clamp-2">
                  {article.title}
                </h3>
                <div className="flex items-center gap-2 text-sm text-gray-400 mb-3">
                  <span className="capitalize">{article.source || 'Unknown'}</span>
                  <span>•</span>
                  <span>#{index + 1}</span>
                </div>
              </div>
            </div>
            
            <p className="text-gray-300 text-sm mb-4 line-clamp-3">
              {article.summary}
            </p>
            
            {article.bullets && article.bullets.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-medium text-white mb-2">Hovedpunkter:</h4>
                <ul className="text-sm text-gray-300 space-y-1">
                  {article.bullets.slice(0, 3).map((bullet: string, i: number) => (
                    <li key={i} className="flex items-start">
                      <span className="text-slate-400 dark:text-slate-500 mr-2">•</span>
                      <span className="line-clamp-2">{bullet}</span>
                    </li>
                  ))}
                  {article.bullets.length > 3 && (
                    <li className="text-gray-400 text-xs">
                      +{article.bullets.length - 3} flere punkter
                    </li>
                  )}
                </ul>
              </div>
            )}
            
            <div className="flex items-center justify-between">
              <a 
                href={article.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-slate-400 dark:text-slate-500 hover:text-slate-300 dark:hover:text-slate-400 text-sm underline transition-colors"
              >
                Læs original artikel
              </a>
              <span className="text-xs text-gray-500">
                {new Date().toLocaleDateString('da-DK')}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
