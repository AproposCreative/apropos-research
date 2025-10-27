'use client';
import { useMemo, memo } from 'react';
import Image from 'next/image';
import { useSelect } from './SelectCtx';

function formatDateDa(iso?: string) {
  if (!iso) return 'ukendt dato';
  
  try {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return 'ukendt dato';
    
    const now = new Date();
    const diffTime = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    // If same year, don't show year
    if (date.getFullYear() === now.getFullYear()) {
      if (diffDays === 0) {
        return 'i dag';
      } else if (diffDays === 1) {
        return 'i går';
      } else if (diffDays < 7) {
        return `${diffDays} dage siden`;
      } else {
        return date.toLocaleDateString('da-DK', { day: 'numeric', month: 'short' });
      }
    } else {
      // Different year, show year
      return date.toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: '2-digit' });
    }
  } catch {
    return 'ukendt dato';
  }
}

type Props = {
  item: {
    id: string; // url
    title: string;
    url: string;
    date?: string;
    published_at?: string;
    fetched_at?: string;
    category?: string;
    summary?: string;
    bullets?: string[];
    image?: string; // optional (if not present, show placeholder)
    source?: string;
  };
};

const CardItem = memo(function CardItem({ item }: Props) {
  const { selected, toggle } = useSelect();
  const isSel = Boolean(selected[item.id]);


  const bg = useMemo(() => {
    const src = item.image || '';
    if (!src) return 'bg-gradient-to-br from-gray-100 to-gray-200';
    return '';
  }, [item.image]);

  return (
    <article 
      className={`card-base h-full cursor-pointer transition-all duration-300 hover:shadow-lg hover:shadow-slate-200/20 dark:hover:shadow-slate-800/20 ${
        isSel 
          ? 'bg-white/30 dark:bg-pure-black/50 backdrop-blur-2xl border-blue-200/60 dark:border-blue-400/40 shadow-2xl shadow-blue-500/10 dark:shadow-blue-400/10 ring-1 ring-blue-200/30 dark:ring-blue-400/20' 
          : 'bg-white/10 dark:bg-black/20 backdrop-blur-xl border-white/10 dark:border-white/5 shadow-lg'
      }`}
      onClick={() => {
        if (!isSel) {
          window.postMessage({ type:'open-drawer', item }, '*');
        }
      }}
    >
      {/* image */}
      <div className={`relative aspect-[16/9] flex-shrink-0 ${bg}`}>
        {item.image ? (
          <Image
            src={`/api/image-proxy?url=${encodeURIComponent(item.image)}`}
            alt=""
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            placeholder="blur"
            blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k="
            onError={(e) => {
              // Replace with fallback pattern on error
              e.currentTarget.src = '/fallback-pattern.svg';
              e.currentTarget.className = 'object-cover opacity-60';
            }}
          />
        ) : (
          <Image
            src="/fallback-pattern.svg"
            alt=""
            fill
            className="object-cover opacity-60"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggle({
              id: item.id,
              title: item.title,
              url: item.url,
              summary: item.summary,
              bullets: item.bullets,
              source: item.source,
            });
          }}
          className={`absolute top-3 left-3 z-10 rounded-full border transition-all duration-300 px-3 py-1 text-xs backdrop-blur-xl font-medium ${
            isSel 
              ? 'bg-blue-500/90 dark:bg-blue-400/90 border-blue-400/50 dark:border-blue-300/50 text-white shadow-lg shadow-blue-500/25 dark:shadow-blue-400/25' 
              : 'bg-white/80 dark:bg-black/60 border-white/40 dark:border-white/20 text-slate-800 dark:text-slate-100 hover:bg-white/90 dark:hover:bg-black/70 shadow-lg'
          }`}
          title={isSel ? 'Fravælg' : 'Vælg'}
        >
          {isSel ? 'Valgt' : 'Vælg'}
        </button>
      </div>

      {/* text */}
      <div className="p-5 text-slate-800 dark:text-slate-200 flex-1 flex flex-col">
        <div className="flex items-center gap-3 text-xs text-gray-600">
          {item.category ? (
            <span className="rounded-full bg-gray-100 text-gray-700 px-3 py-1 text-[11px] tracking-wider uppercase">
              {item.category}
            </span>
          ) : null}
          <span>{formatDateDa(item.published_at || item.date || item.fetched_at)}</span>
        </div>

        <h2 className="mt-3 text-2xl font-semibold tracking-tight line-clamp-2">
          {item.title || 'Uden titel'}
        </h2>

        {item.summary ? (
          <p className="mt-3 text-gray-700 leading-relaxed line-clamp-3 flex-1">{item.summary}</p>
        ) : null}

        <div className="mt-4 flex items-center gap-2 flex-shrink-0">
          {item.url ? (
            <a
              className="rounded-full border border-slate-300/50 dark:border-slate-600/50 bg-white/70 dark:bg-black/70 backdrop-blur-sm px-3 py-1 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-slate-700/70 transition-all duration-300"
              href={item.url}
              target="_blank"
              rel="noreferrer"
            >
              Åbn kilde
            </a>
          ) : null}
        </div>

        <div className="mt-3 text-[12px] text-gray-500 font-mono truncate flex-shrink-0">
          {(item.url || '').replace(/^https?:\/\//, '')}
        </div>
      </div>
    </article>
  );
});

export default CardItem;
