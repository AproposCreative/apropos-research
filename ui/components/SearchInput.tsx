'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function SearchInputInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState('');

  // Initialize query from URL params
  useEffect(() => {
    const q = searchParams.get('q') || '';
    setQuery(q);
  }, [searchParams]);

  // Keyboard shortcut: Ctrl/Cmd + K to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const input = document.querySelector('input[type="text"]') as HTMLInputElement;
        if (input) {
          input.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    
    if (query.trim()) {
      params.set('q', query.trim());
    } else {
      params.delete('q');
    }
    
    // Reset to page 1 when searching
    params.delete('page');
    
    router.push(`/alle-medier?${params.toString()}`);
  };

  const clearSearch = () => {
    setQuery('');
    const params = new URLSearchParams(searchParams.toString());
    params.delete('q');
    params.delete('page');
    router.push(`/alle-medier?${params.toString()}`);
  };

  return (
    <form onSubmit={handleSearch} className="relative">
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <svg 
            className="h-5 w-5 text-slate-400 dark:text-slate-500" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" 
            />
          </svg>
        </div>
        
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Søg i artikler..."
          className="w-full pl-12 pr-20 py-3 bg-white/80 dark:bg-slate-800/80 backdrop-blur-2xl border border-slate-200/50 dark:border-slate-700/50 rounded-2xl text-slate-800 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-400 focus:ring-2 focus:ring-slate-500 dark:focus:ring-slate-400 focus:border-transparent transition-all duration-300 shadow-lg"
        />
        
        {/* Keyboard shortcut indicator */}
        <div className="absolute inset-y-0 right-0 pr-4 flex items-center">
          <div className="hidden sm:flex items-center gap-1 px-2 py-1 bg-slate-100/70 dark:bg-slate-700/70 rounded-lg text-xs text-slate-500 dark:text-slate-400">
            <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-600 rounded text-xs font-mono">⌘</kbd>
            <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-600 rounded text-xs font-mono">K</kbd>
          </div>
        </div>
        
        {query && (
          <button
            type="button"
            onClick={clearSearch}
            className="absolute inset-y-0 right-16 pr-4 flex items-center text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      
      <button
        type="submit"
        className="sr-only"
        aria-label="Søg"
      >
        Søg
      </button>
    </form>
  );
}

export default function SearchInput() {
  return (
    <Suspense fallback={
      <div className="w-full pl-12 pr-20 py-3 bg-white/80 dark:bg-slate-800/80 backdrop-blur-2xl border border-slate-200/50 dark:border-slate-700/50 rounded-2xl text-slate-800 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-400 shadow-lg animate-pulse">
        <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded"></div>
      </div>
    }>
      <SearchInputInner />
    </Suspense>
  );
}
