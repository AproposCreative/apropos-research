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
  const { toggleMedia, isMediaEnabled, getEnabledMedias, getDisabledMedias, mediaSources, articleCounts } = useMedia();

  const getLinkClasses = (href: string, isActive: boolean) => {
    return `flex items-center px-4 py-3 rounded-xl transition-all duration-300 backdrop-blur-sm ${
      isActive 
        ? 'bg-slate-200/50 dark:bg-pure-black/50 text-slate-800 dark:text-black-100 border border-slate-300/50 dark:border-black-700/50 shadow-lg ring-1 ring-white/20 dark:ring-black-800/50'
        : 'hover:bg-slate-100/50 dark:hover:bg-black-800/50 text-slate-600 dark:text-black-300 border border-transparent hover:border-slate-300/50 dark:hover:border-black-700/50'
    }`;
  };

  // Use dynamic media sources from API
  const mediaData = mediaSources.map(source => ({
    id: source.id,
    name: source.name,
    count: articleCounts[source.id] || 0
  }));

  const enabledMedias = getEnabledMedias();
  const disabledMedias = getDisabledMedias();

  return (
    <nav className="space-y-3">
      {/* Alle medier link */}
      <Link href="/alle-medier" className={getLinkClasses('/alle-medier', pathname === '/alle-medier' && !currentSource)}>
        <span className="font-medium">Alle medier</span>
      </Link>

      {/* Enabled Media Toggles */}
      {enabledMedias.map(mediaId => {
        const media = mediaData.find(m => m.id === mediaId);
        if (!media) return null;
        
        const isActive = pathname === '/alle-medier' && currentSource === mediaId;
        
        return (
          <div key={mediaId} className={`relative overflow-hidden rounded-xl transition-all duration-300 backdrop-blur-sm ${
            isActive 
              ? 'bg-slate-200/50 dark:bg-pure-black/50 border border-slate-300/50 dark:border-black-700/50 shadow-lg ring-1 ring-white/20 dark:ring-black-800/50'
              : 'hover:bg-slate-100/50 dark:hover:bg-black-800/50 border border-transparent hover:border-slate-300/50 dark:hover:border-black-700/50'
          }`}>
            <Link href={`/alle-medier?source=${mediaId}`} className="block">
              <div className="flex items-center justify-between px-4 py-3">
                {/* Media Info */}
                <div className="flex items-center gap-3">
                  <div>
                    <div className="font-medium text-slate-800 dark:text-black-100">{media.name}</div>
                    <div className="text-xs text-slate-500 dark:text-black-400">
                      {media.count} artikel{media.count !== 1 ? 'er' : ''}
                    </div>
                  </div>
                </div>

                {/* Toggle Switch */}
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    toggleMedia(mediaId, !isMediaEnabled(mediaId));
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-300 ease-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-black-900 ${
                    isMediaEnabled(mediaId)
                      ? 'bg-primary-600 dark:bg-primary-500' 
                      : 'bg-slate-300 dark:bg-pure-black'
                  }`}
                  role="switch"
                  aria-checked={isMediaEnabled(mediaId)}
                  aria-label={`${isMediaEnabled(mediaId) ? 'Deaktiver' : 'Aktiver'} ${media.name}`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform duration-300 ease-out ${
                      isMediaEnabled(mediaId) ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </Link>
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
          <div className="mt-2 ml-4 space-y-2">
            {disabledMedias.map(mediaId => {
              const media = mediaData.find(m => m.id === mediaId);
              if (!media) return null;
              
              return (
                <div key={mediaId} className="relative overflow-hidden rounded-xl bg-slate-50/50 dark:bg-black-900/50 border border-dashed border-slate-300/50 dark:border-black-700/50 opacity-60">
                  <div className="flex items-center justify-between px-4 py-3">
                    {/* Media Info */}
                    <div className="flex items-center gap-3">
                      <div>
                        <div className="font-medium text-sm text-slate-500 dark:text-black-400">{media.name}</div>
                        <div className="text-xs text-slate-400 dark:text-black-500">
                          {media.count} artikel{media.count !== 1 ? 'er' : ''}
                        </div>
                      </div>
                    </div>

                    {/* Toggle Switch */}
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        toggleMedia(mediaId, !isMediaEnabled(mediaId));
                      }}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-300 ease-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-black-900 ${
                        isMediaEnabled(mediaId)
                          ? 'bg-primary-600 dark:bg-primary-500' 
                          : 'bg-slate-300 dark:bg-pure-black'
                      }`}
                      role="switch"
                      aria-checked={isMediaEnabled(mediaId)}
                      aria-label={`${isMediaEnabled(mediaId) ? 'Deaktiver' : 'Aktiver'} ${media.name}`}
                    >
                      <span
                        className={`inline-block h-3 w-3 transform rounded-full bg-white shadow-lg transition-transform duration-300 ease-out ${
                          isMediaEnabled(mediaId) ? 'translate-x-5' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      )}

      {/* Add Media Button */}
      <Link 
        href="/media-admin"
        className="flex items-center px-4 py-3 rounded-xl hover:bg-slate-100/50 dark:hover:bg-black-800/50 text-slate-600 dark:text-black-300 border border-dashed border-slate-300/50 dark:border-black-700/50 hover:border-slate-400/50 dark:hover:border-black-600/50 transition-all duration-300 w-full backdrop-blur-sm"
      >
        <span className="font-medium">+ Tilføj medie</span>
      </Link>
    </nav>
  );
}

export default function MediaNav() {
  return (
    <Suspense fallback={
      <nav className="space-y-3">
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
