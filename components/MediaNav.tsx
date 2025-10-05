'use client';
import { useSearchParams, usePathname } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';
import { useMedia } from '../lib/media-context';
import MediaToggle from './MediaToggle';

function MediaNavInner() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const currentSource = searchParams.get('source');
  const { toggleMedia, isMediaEnabled, getEnabledMedias, getDisabledMedias } = useMedia();

  const getLinkClasses = (href: string, isActive: boolean) => {
    return `flex items-center px-4 py-3 rounded-xl transition-all duration-300 backdrop-blur-sm ${
      isActive 
        ? 'bg-slate-200/50 dark:bg-pure-black/50 text-slate-800 dark:text-black-100 border border-slate-300/50 dark:border-black-700/50 shadow-lg ring-1 ring-white/20 dark:ring-black-800/50'
        : 'hover:bg-slate-100/50 dark:hover:bg-black-800/50 text-slate-600 dark:text-black-300 border border-transparent hover:border-slate-300/50 dark:hover:border-black-700/50'
    }`;
  };

  // Mock article counts - in real app this would come from props or API
  const mediaData = [
    { id: 'soundvenue', name: 'Soundvenue', count: 456 },
    { id: 'gaffa', name: 'GAFFA', count: 234 },
    { id: 'berlingske', name: 'BERLINGSKE', count: 189 },
    { id: 'bt', name: 'BT', count: 156 },
  ];

  const enabledMedias = getEnabledMedias();
  const disabledMedias = getDisabledMedias();

  return (
    <nav className="space-y-2">
      {/* Alle medier link */}
      <Link href="/alle-medier" className={getLinkClasses('/alle-medier', pathname === '/alle-medier' && !currentSource)}>
        <span className="font-medium">Alle medier</span>
      </Link>

      {/* Enabled Media Toggles */}
      {enabledMedias.map(mediaId => {
        const media = mediaData.find(m => m.id === mediaId);
        if (!media) return null;
        
        return (
          <div key={mediaId} className="relative">
            <Link href={`/alle-medier?source=${mediaId}`} className={getLinkClasses(`/alle-medier?source=${mediaId}`, pathname === '/alle-medier' && currentSource === mediaId)}>
              <span className="font-medium">{media.name}</span>
            </Link>
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <MediaToggle
                mediaId={mediaId}
                mediaName={media.name}
                isEnabled={isMediaEnabled(mediaId)}
                onToggle={toggleMedia}
                articleCount={media.count}
              />
            </div>
          </div>
        );
      })}

      {/* Disabled Media Toggles (collapsed section) */}
      {disabledMedias.length > 0 && (
        <details className="group">
          <summary className="flex items-center px-4 py-3 rounded-xl hover:bg-slate-100/50 dark:hover:bg-black-800/50 text-slate-500 dark:text-black-400 border border-dashed border-slate-300/50 dark:border-black-700/50 hover:border-slate-400/50 dark:hover:border-black-600/50 transition-all duration-300 cursor-pointer backdrop-blur-sm">
            <span className="font-medium text-sm">Deaktiverede medier ({disabledMedias.length})</span>
            <svg className="w-4 h-4 ml-auto transition-transform duration-200 group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </summary>
          <div className="mt-2 ml-4 space-y-1">
            {disabledMedias.map(mediaId => {
              const media = mediaData.find(m => m.id === mediaId);
              if (!media) return null;
              
              return (
                <div key={mediaId} className="relative">
                  <div className="flex items-center px-4 py-2 rounded-lg text-slate-500 dark:text-black-400 opacity-60">
                    <span className="font-medium text-sm">{media.name}</span>
                  </div>
                  <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    <MediaToggle
                      mediaId={mediaId}
                      mediaName={media.name}
                      isEnabled={isMediaEnabled(mediaId)}
                      onToggle={toggleMedia}
                      articleCount={media.count}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      )}

      {/* Add Media Button */}
      <button className="flex items-center px-4 py-3 rounded-xl hover:bg-slate-100/50 dark:hover:bg-black-800/50 text-slate-600 dark:text-black-300 border border-dashed border-slate-300/50 dark:border-black-700/50 hover:border-slate-400/50 dark:hover:border-black-600/50 transition-all duration-300 w-full backdrop-blur-sm">
        <span className="font-medium">+ Tilføj medie</span>
      </button>
    </nav>
  );
}

export default function MediaNav() {
  return (
    <Suspense fallback={
      <nav className="space-y-2">
        <div className="flex items-center px-4 py-3 rounded-xl bg-slate-100/50 dark:bg-pure-black/50 text-slate-600 dark:text-black-300 animate-pulse">
          <span className="font-medium">Alle medier</span>
        </div>
        <div className="flex items-center px-4 py-3 rounded-xl bg-slate-100/50 dark:bg-pure-black/50 text-slate-600 dark:text-black-300 animate-pulse">
          <span className="font-medium">Soundvenue</span>
        </div>
        <div className="flex items-center px-4 py-3 rounded-xl bg-slate-100/50 dark:bg-pure-black/50 text-slate-600 dark:text-black-300 animate-pulse">
          <span className="font-medium">GAFFA</span>
        </div>
        <div className="flex items-center px-4 py-3 rounded-xl bg-slate-100/50 dark:bg-pure-black/50 text-slate-600 dark:text-black-300 animate-pulse">
          <span className="font-medium">BERLINGSKE</span>
        </div>
        <div className="flex items-center px-4 py-3 rounded-xl bg-slate-100/50 dark:bg-pure-black/50 text-slate-600 dark:text-black-300 animate-pulse">
          <span className="font-medium">BT</span>
        </div>
      </nav>
    }>
      <MediaNavInner />
    </Suspense>
  );
}
