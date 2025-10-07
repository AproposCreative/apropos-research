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
          className="w-full pl-12 pr-20 py-3 bg-white/20 dark:bg-black/30 backdrop-blur-3xl border border-white/20 dark:border-white/10 rounded-3xl text-slate-800 dark:text-black-100 placeholder-slate-500 dark:placeholder-black-400 focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 focus:border-transparent focus:shadow-glow transition-all duration-300 shadow-2xl hover:shadow-xl hover:scale-[1.01]"
        />
        
        {/* Keyboard shortcut indicator */}
        <div className="absolute inset-y-0 right-0 pr-4 flex items-center">
          <div className="hidden sm:flex items-center gap-1 px-2 py-1 bg-white/50 dark:bg-pure-black/50 backdrop-blur-sm rounded-lg text-xs text-slate-500 dark:text-black-400 border border-white/30 dark:border-black-700/30 shadow-sm">
            <kbd className="px-1.5 py-0.5 bg-white dark:bg-pure-black rounded text-xs font-mono shadow-sm">⌘</kbd>
            <kbd className="px-1.5 py-0.5 bg-white dark:bg-pure-black rounded text-xs font-mono shadow-sm">K</kbd>
          </div>
        </div>
        
        {query && (
          <button
            type="button"
            onClick={clearSearch}
            className="absolute inset-y-0 right-16 pr-4 flex items-center text-slate-400 dark:text-black-500 hover:text-error-500 dark:hover:text-error-400 hover:scale-110 transition-all duration-200 ease-out"
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
               <div className="w-full pl-12 pr-20 py-3 bg-white/20 dark:bg-black/30 backdrop-blur-3xl border border-white/20 dark:border-white/10 rounded-3xl shadow-2xl animate-pulse">
                 <div className="h-5 bg-slate-200 dark:bg-pure-black rounded"></div>
               </div>
             }>
      <SearchInputInner />
    </Suspense>
  );
}
