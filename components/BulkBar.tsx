'use client';
import { useMemo, useState, useEffect, useRef } from 'react';
import { useSelect } from './SelectCtx';
import SuccessModal from './SuccessModal';

export default function BulkBar() {
  const { selected, clear } = useSelect();
  const [busy, setBusy] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successCount, setSuccessCount] = useState(0);
  const [successMessage, setSuccessMessage] = useState('');
  const [showActions, setShowActions] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const list = Object.values(selected);
  const count = list.length;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowActions(false);
      }
    };

    if (showActions) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showActions]);

  const copyText = useMemo(() => {
    return list.map((p, i) => {
      const bullets = (p.bullets ?? []).slice(0, 3);
      const b = bullets.length ? '\n• ' + bullets.join('\n• ') : '';
      return `${i + 1}. ${p.title}\n${p.summary ?? ''}${b}\n${p.url}`;
    }).join('\n\n');
  }, [list]);

  const copyTitles = useMemo(() => {
    return list.map((p, i) => `${i + 1}. ${p.title}`).join('\n');
  }, [list]);

  const copyUrls = useMemo(() => {
    return list.map(p => p.url).join('\n');
  }, [list]);

  const handleBulkAction = async (action: string) => {
    setBusy(true);
    
    try {
      switch (action) {
        case 'editorial':
          const editorialItems = JSON.parse(localStorage.getItem('editorialQueue') || '[]');
          const newItems = list.map(item => ({
            ...item,
            id: `${item.id}-${Date.now()}`,
            addedAt: new Date().toISOString(),
            status: 'pending'
          }));
          const updatedItems = [...editorialItems, ...newItems];
          localStorage.setItem('editorialQueue', JSON.stringify(updatedItems));
          setSuccessMessage(`${count} artikler sendt til Editorial Queue!`);
          break;
          
        case 'ai-drafts':
          const aiDrafts = JSON.parse(localStorage.getItem('aiDrafts') || '[]');
          const draftItems = list.map(item => ({
            ...item,
            id: `draft-${item.id}-${Date.now()}`,
            createdAt: new Date().toISOString(),
            status: 'draft',
            type: 'bulk-import'
          }));
          const updatedDrafts = [...aiDrafts, ...draftItems];
          localStorage.setItem('aiDrafts', JSON.stringify(updatedDrafts));
          setSuccessMessage(`${count} artikler tilføjet til AI Drafts!`);
          break;
          
        case 'export-csv':
          const csvData = list.map(item => ({
            title: item.title,
            summary: item.summary || '',
            url: item.url,
            source: item.source || ''
          }));
          const csvContent = [
            'Title,Summary,URL,Source',
            ...csvData.map(row => `"${row.title}","${row.summary}","${row.url}","${row.source}"`)
          ].join('\n');
          
          const blob = new Blob([csvContent], { type: 'text/csv' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `articles-export-${new Date().toISOString().split('T')[0]}.csv`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          setSuccessMessage(`${count} artikler eksporteret som CSV!`);
          break;
          
        case 'bookmark':
          const bookmarks = JSON.parse(localStorage.getItem('bookmarks') || '[]');
          const bookmarkItems = list.map(item => ({
            ...item,
            id: `bookmark-${item.id}-${Date.now()}`,
            bookmarkedAt: new Date().toISOString(),
            tags: []
          }));
          const updatedBookmarks = [...bookmarks, ...bookmarkItems];
          localStorage.setItem('bookmarks', JSON.stringify(updatedBookmarks));
          setSuccessMessage(`${count} artikler gemt som bookmarks!`);
          break;
      }
      
      setSuccessCount(count);
      setShowSuccess(true);
    } catch (error) {
      console.error('Bulk action error:', error);
      setSuccessMessage('Der opstod en fejl. Prøv igen.');
      setShowSuccess(true);
    } finally {
      setBusy(false);
    }
  };

  if (count === 0) return null;

  return (
    <>
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-fade-in-up">
        <div className="group bg-white/80 dark:bg-pure-black/80 backdrop-blur-2xl border border-white/20 dark:border-black-800/50 rounded-2xl shadow-lg ring-1 ring-white/10 dark:ring-black-800/20 px-4 py-2.5 flex items-center gap-3 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 ease-out">
          <div className="text-sm font-medium text-slate-700 dark:text-black-200">
            <span className="font-semibold">{count}</span> valgt
          </div>
          
          {/* Quick Actions */}
          <div className="flex items-center gap-1.5">
            <button
              className="group/btn px-2.5 py-1 bg-white/50 dark:bg-pure-black/50 backdrop-blur-sm text-slate-700 dark:text-black-300 rounded-lg text-xs font-medium hover:bg-white/70 dark:hover:bg-black-700/70 hover:text-primary-600 dark:hover:text-primary-400 hover:shadow-md hover:scale-105 transition-all duration-200 ease-out border border-white/30 dark:border-black-700/30 shadow-sm"
              onClick={async () => {
                await navigator.clipboard.writeText(copyText);
              }}
              title="Kopiér valgte som prompt-tekst"
            >
              <span className="group-hover/btn:scale-110 transition-transform duration-200">📋</span>
              <span className="ml-1">Kopiér</span>
            </button>
            
            <button
              className="group/btn px-2.5 py-1 bg-primary-600/90 dark:bg-primary-500/90 backdrop-blur-sm text-white rounded-lg text-xs font-medium hover:bg-primary-700/90 dark:hover:bg-primary-400/90 hover:shadow-md hover:scale-105 transition-all duration-200 ease-out disabled:opacity-60 disabled:hover:scale-100 shadow-sm"
              disabled={busy}
              onClick={() => handleBulkAction('editorial')}
              title="Send til Editorial Queue"
            >
              <span className="group-hover/btn:scale-110 transition-transform duration-200">
                {busy ? '⏳' : '🤖'}
              </span>
              <span className="ml-1">{busy ? 'Sender…' : 'Editorial'}</span>
            </button>
            
            {/* More Actions Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                className="group/btn px-2.5 py-1 bg-white/50 dark:bg-pure-black/50 backdrop-blur-sm text-slate-700 dark:text-black-300 rounded-lg text-xs font-medium hover:bg-white/70 dark:hover:bg-black-700/70 hover:text-slate-900 dark:hover:text-white hover:shadow-md hover:scale-105 transition-all duration-200 ease-out border border-white/30 dark:border-black-700/30 shadow-sm"
                onClick={() => setShowActions(!showActions)}
                title="Flere handlinger"
              >
                <span className="group-hover/btn:scale-110 transition-transform duration-200">⚙️</span>
                <span className="ml-1">Flere</span>
              </button>
              
              {showActions && (
                <div className="absolute bottom-full mb-2 left-0 bg-white/95 dark:bg-pure-black/95 backdrop-blur-xl rounded-xl border border-white/40 dark:border-white/20 shadow-xl py-2 min-w-[200px]">
                  <button
                    className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-white hover:bg-white/70 dark:hover:bg-pure-black/70 transition-colors flex items-center gap-2"
                    onClick={() => {
                      handleBulkAction('ai-drafts');
                      setShowActions(false);
                    }}
                  >
                    <span>📝</span>
                    <span>AI Drafts</span>
                  </button>
                  <button
                    className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-white hover:bg-white/70 dark:hover:bg-pure-black/70 transition-colors flex items-center gap-2"
                    onClick={() => {
                      handleBulkAction('bookmark');
                      setShowActions(false);
                    }}
                  >
                    <span>🔖</span>
                    <span>Bookmark</span>
                  </button>
                  <button
                    className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-white hover:bg-white/70 dark:hover:bg-pure-black/70 transition-colors flex items-center gap-2"
                    onClick={() => {
                      handleBulkAction('export-csv');
                      setShowActions(false);
                    }}
                  >
                    <span>📊</span>
                    <span>Eksporter CSV</span>
                  </button>
                  <div className="border-t border-white/20 dark:border-white/10 my-1"></div>
                  <button
                    className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-white hover:bg-white/70 dark:hover:bg-pure-black/70 transition-colors flex items-center gap-2"
                    onClick={async () => {
                      await navigator.clipboard.writeText(copyTitles);
                      setShowActions(false);
                    }}
                  >
                    <span>📝</span>
                    <span>Kopiér titler</span>
                  </button>
                  <button
                    className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-white hover:bg-white/70 dark:hover:bg-pure-black/70 transition-colors flex items-center gap-2"
                    onClick={async () => {
                      await navigator.clipboard.writeText(copyUrls);
                      setShowActions(false);
                    }}
                  >
                    <span>🔗</span>
                    <span>Kopiér URLs</span>
                  </button>
                </div>
              )}
            </div>
            
            <button
              className="group/btn px-2.5 py-1 bg-white/50 dark:bg-pure-black/50 backdrop-blur-sm text-slate-700 dark:text-black-300 rounded-lg text-xs font-medium hover:bg-white/70 dark:hover:bg-black-700/70 hover:text-error-600 dark:hover:text-error-400 hover:shadow-md hover:scale-105 transition-all duration-200 ease-out border border-white/30 dark:border-black-700/30 shadow-sm"
              onClick={clear}
            >
              <span className="group-hover/btn:scale-110 transition-transform duration-200">🗑️</span>
              <span className="ml-1">Ryd</span>
            </button>
          </div>
        </div>
      </div>

      {/* Success Modal - rendered outside BulkBar container */}
      <SuccessModal
        isOpen={showSuccess}
        onClose={() => {
          setShowSuccess(false);
          clear(); // Clear selected items when modal is closed
        }}
        message={successMessage || "Handling gennemført!"}
        count={successCount}
      />
    </>
  );
}
