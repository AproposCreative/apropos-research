'use client';
import { memo } from 'react';
import Image from 'next/image';
import { RageItem } from '@/lib/readPrompts';

interface SearchCardItemProps {
  article: RageItem;
  showRelevanceScore?: boolean;
  compact?: boolean;
  onClick?: (article: RageItem) => void;
}

function formatDateDa(iso?: string) {
  if (!iso) return 'ukendt dato';
  
  // Handle DD-MM-YYYY HH:mm:ss format (from old Gaffa articles)
  if (iso.match(/^\d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2}$/)) {
    const [datePart, timePart] = iso.split(' ');
    const [day, month, year] = datePart.split('-');
    const d = new Date(`${year}-${month}-${day}T${timePart}`);
    if (isNaN(d.getTime())) return 'ukendt dato';
    return new Intl.DateTimeFormat('da-DK', { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
  }
  
  // Handle standard ISO format
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'ukendt dato';
  return new Intl.DateTimeFormat('da-DK', { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

const SearchCardItem = memo(function SearchCardItem({ 
  article, 
  showRelevanceScore = false, 
  compact = false,
  onClick 
}: SearchCardItemProps) {
  const handleClick = () => {
    if (onClick) {
      onClick(article);
    } else {
      // Default behavior - open in new tab
      window.open(article.url, '_blank');
    }
  };

  if (compact) {
    return (
      <article 
        className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl rounded-xl border border-white/40 dark:border-white/20 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer"
        onClick={handleClick}
      >
        <div className="flex gap-4 p-4">
          {/* Image */}
          <div className="flex-shrink-0 w-20 h-20 relative overflow-hidden rounded-lg">
            {article.image ? (
              <Image
                src={`/api/image-proxy?url=${encodeURIComponent(article.image)}`}
                alt={article.title}
                fill
                className="object-cover"
                sizes="80px"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-600 dark:to-slate-700 flex items-center justify-center">
                <svg className="w-6 h-6 text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {article.category && (
                <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs">
                  {article.category}
                </span>
              )}
              {article.source && (
                <span className="px-2 py-1 bg-slate-100 dark:bg-slate-600 text-slate-600 dark:text-slate-400 rounded-full text-xs">
                  {article.source}
                </span>
              )}
              {showRelevanceScore && (article as any).relevanceScore && (
                <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-xs">
                  {Math.round((article as any).relevanceScore)}% match
                </span>
              )}
            </div>
            
            <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100 line-clamp-2 mb-1">
              {article.title}
            </h3>
            
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>{formatDateDa(article.fetched_at)}</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article 
      className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl rounded-2xl border border-white/40 dark:border-white/20 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer overflow-hidden"
      onClick={handleClick}
    >
      {/* Image */}
      <div className="relative aspect-[16/9] overflow-hidden">
        {article.image ? (
          <Image
            src={`/api/image-proxy?url=${encodeURIComponent(article.image)}`}
            alt={article.title}
            fill
            className="object-cover hover:scale-105 transition-transform duration-200"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-600 dark:to-slate-700 flex items-center justify-center">
            <svg className="w-12 h-12 text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
        
        {/* Relevance Score Badge */}
        {showRelevanceScore && (article as any).relevanceScore && (
          <div className="absolute top-3 right-3 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-xs font-medium backdrop-blur-sm">
            {Math.round((article as any).relevanceScore)}% match
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-5">
        <div className="flex items-center gap-2 mb-3">
          {article.category && (
            <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs">
              {article.category}
            </span>
          )}
          {article.source && (
            <span className="px-2 py-1 bg-slate-100 dark:bg-slate-600 text-slate-600 dark:text-slate-400 rounded-full text-xs">
              {article.source}
            </span>
          )}
        </div>

        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 line-clamp-2 mb-3">
          {article.title}
        </h3>

        {article.summary && (
          <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-3 mb-4">
            {article.summary}
          </p>
        )}

        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>{formatDateDa(article.fetched_at)}</span>
          <div className="flex items-center gap-1">
            <span>Read more</span>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>
    </article>
  );
});

export default SearchCardItem;
