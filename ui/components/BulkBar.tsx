'use client';
import { useMemo, useState } from 'react';
import { useSelect } from './SelectCtx';
import SuccessModal from './SuccessModal';

export default function BulkBar() {
  const { selected, clear } = useSelect();
  const [busy, setBusy] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successCount, setSuccessCount] = useState(0);
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
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 fade-in duration-500">
      <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl border border-slate-200/50 dark:border-slate-700/50 rounded-2xl shadow-2xl px-8 py-4 flex items-center gap-6 ring-1 ring-white/20 dark:ring-slate-700/50">
        <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
          <span className="font-semibold">{count}</span> valgt
        </div>
        <div className="flex items-center gap-3">
          <button
            className="px-4 py-2 bg-slate-100/70 dark:bg-slate-800/70 backdrop-blur-sm text-slate-700 dark:text-slate-300 rounded-xl text-sm font-medium hover:bg-slate-200/70 dark:hover:bg-slate-700/70 transition-all duration-300 border border-slate-300/50 dark:border-slate-600/50 shadow-lg ring-1 ring-white/20 dark:ring-slate-700/50"
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
              // Store selected items in localStorage for Editorial Queue
              const editorialItems = JSON.parse(localStorage.getItem('editorialQueue') || '[]');
              const newItems = list.map(item => ({
                ...item,
                id: `${item.id}-${Date.now()}`, // Unique ID for editorial queue
                addedAt: new Date().toISOString(),
                status: 'pending'
              }));
              const updatedItems = [...editorialItems, ...newItems];
              localStorage.setItem('editorialQueue', JSON.stringify(updatedItems));
              
              setBusy(false);
              setSuccessCount(count);
              setShowSuccess(true);
              clear();
            }}
            title="Send til Editorial AI"
          >
            {busy ? 'Sender…' : 'Send til Editorial AI'}
          </button>
          <button
            className="px-4 py-2 bg-slate-100/70 dark:bg-slate-800/70 backdrop-blur-sm text-slate-700 dark:text-slate-300 rounded-xl text-sm font-medium hover:bg-slate-200/70 dark:hover:bg-slate-700/70 transition-all duration-300 border border-slate-300/50 dark:border-slate-600/50 shadow-lg ring-1 ring-white/20 dark:ring-slate-700/50"
            onClick={clear}
          >
            Ryd
          </button>
        </div>
      </div>

      {/* Success Modal */}
      <SuccessModal
        isOpen={showSuccess}
        onClose={() => setShowSuccess(false)}
        message="Artikler sendt til Editorial Queue!"
        count={successCount}
      />
    </div>
  );
}
