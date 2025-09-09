'use client';
import { useSearchParams, usePathname } from 'next/navigation';
import { Suspense } from 'react';

function MediaNavInner() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const currentSource = searchParams.get('source');

  const getLinkClasses = (href: string, isActive: boolean) => {
    return `flex items-center px-4 py-3 rounded-xl transition-all duration-300 backdrop-blur-sm ${
      isActive 
        ? 'bg-slate-200/50 dark:bg-slate-700/50 text-slate-800 dark:text-slate-100 border border-slate-300/50 dark:border-slate-600/50 shadow-lg ring-1 ring-white/20 dark:ring-slate-700/50'
        : 'hover:bg-slate-100/50 dark:hover:bg-slate-700/50 text-slate-600 dark:text-slate-300 border border-transparent hover:border-slate-300/50 dark:hover:border-slate-600/50'
    }`;
  };

  return (
    <nav className="space-y-2">
      <a href="/alle-medier" className={getLinkClasses('/alle-medier', pathname === '/alle-medier' && !currentSource)}>
        <span className="font-medium">Alle medier</span>
      </a>
      <a href="/alle-medier?source=soundvenue" className={getLinkClasses('/alle-medier?source=soundvenue', pathname === '/alle-medier' && currentSource === 'soundvenue')}>
        <span className="font-medium">Soundvenue</span>
      </a>
      <a href="/alle-medier?source=gaffa" className={getLinkClasses('/alle-medier?source=gaffa', pathname === '/alle-medier' && currentSource === 'gaffa')}>
        <span className="font-medium">GAFFA</span>
      </a>
      <a href="/alle-medier?source=berlingske" className={getLinkClasses('/alle-medier?source=berlingske', pathname === '/alle-medier' && currentSource === 'berlingske')}>
        <span className="font-medium">BERLINGSKE</span>
      </a>
      <a href="/alle-medier?source=bt" className={getLinkClasses('/alle-medier?source=bt', pathname === '/alle-medier' && currentSource === 'bt')}>
        <span className="font-medium">BT</span>
      </a>
      <button className="flex items-center px-4 py-3 rounded-xl hover:bg-slate-100/50 dark:hover:bg-slate-700/50 text-slate-600 dark:text-slate-300 border border-dashed border-slate-300/50 dark:border-slate-600/50 hover:border-slate-400/50 dark:hover:border-slate-500/50 transition-all duration-300 w-full backdrop-blur-sm">
        <span className="font-medium">+ Tilføj medie</span>
      </button>
    </nav>
  );
}

export default function MediaNav() {
  return (
    <Suspense fallback={
      <nav className="space-y-2">
        <div className="flex items-center px-4 py-3 rounded-xl bg-slate-100/50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300">
          <span className="font-medium">Alle medier</span>
        </div>
        <div className="flex items-center px-4 py-3 rounded-xl bg-slate-100/50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300">
          <span className="font-medium">Soundvenue</span>
        </div>
        <div className="flex items-center px-4 py-3 rounded-xl bg-slate-100/50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300">
          <span className="font-medium">GAFFA</span>
        </div>
        <div className="flex items-center px-4 py-3 rounded-xl bg-slate-100/50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300">
          <span className="font-medium">BERLINGSKE</span>
        </div>
        <div className="flex items-center px-4 py-3 rounded-xl bg-slate-100/50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300">
          <span className="font-medium">BT</span>
        </div>
      </nav>
    }>
      <MediaNavInner />
    </Suspense>
  );
}
