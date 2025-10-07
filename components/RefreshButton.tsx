'use client';
import { useRefreshing } from './RefreshCtx';
import { useRef } from 'react';

export default function RefreshButton() {
  const { refreshing, setRefreshing } = useRefreshing();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  return (
    <button
      type="button"
      onClick={async () => {
        if (refreshing) return;
        
        // Clear any existing timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        
        setRefreshing(true);
        const res = await fetch('/api/refresh', { 
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sinceMinutes: 10, limit: 100 })
        });
        
        if (res.ok || res.status === 202) {
          // Wait 30 seconds for ingest to complete, then reload once
          timeoutRef.current = setTimeout(() => {
            timeoutRef.current = null;
            location.reload();
          }, 30000); // 30 seconds
        } else {
          setRefreshing(false);
          alert('Kunne ikke opdatere – tjek terminalen for ingest-output.');
        }
      }}
      className="rounded-xl border border-slate-300/50 dark:border-slate-600/50 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 bg-white/70 dark:bg-black/70 hover:bg-slate-100/70 dark:hover:bg-slate-700/70 transition-all duration-300 backdrop-blur-sm shadow-lg ring-1 ring-white/20 dark:ring-slate-700/50 disabled:opacity-60"
      disabled={refreshing}
      title="Hent nye artikler"
    >
      {refreshing ? 'Henter…' : 'Opdatér'}
    </button>
  );
}
