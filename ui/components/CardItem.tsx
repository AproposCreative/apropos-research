'use client';
import { useMemo } from 'react';
import { useSelect } from './SelectCtx';

function formatDateDa(iso?: string) {
  if (!iso) return 'ukendt dato';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'ukendt dato';
  return new Intl.DateTimeFormat('da-DK', { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

type Props = {
  item: {
    id: string; // url
    title: string;
    url: string;
    date?: string;
    fetched_at?: string;
    category?: string;
    summary?: string;
    bullets?: string[];
    image?: string; // optional (if not present, show placeholder)
  };
};

export default function CardItem({ item }: Props) {
  const { selected, toggle } = useSelect();
  const isSel = Boolean(selected[item.id]);

  const bg = useMemo(() => {
    const src = item.image || '';
    if (!src) return 'bg-gradient-to-br from-gray-100 to-gray-200';
    return '';
  }, [item.image]);

  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-white shadow-card hover:shadow-card-hover transition">
      {/* image */}
      <div className={`relative aspect-[16/9] ${bg}`}>
        {item.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full flex items-center justify-center">
            <div className="text-gray-400 text-4xl">📄</div>
          </div>
        )}
        <button
          onClick={() => toggle({
            id: item.id,
            title: item.title,
            url: item.url,
            summary: item.summary,
            bullets: item.bullets,
          })}
          className={`absolute top-3 left-3 rounded-full border border-line px-3 py-1 text-xs bg-white/90 backdrop-blur ${isSel ? 'ring-2 ring-black' : ''}`}
          title={isSel ? 'Fravælg' : 'Vælg'}
        >
          {isSel ? 'Valgt' : 'Vælg'}
        </button>
      </div>

      {/* text */}
      <div className="p-5">
        <div className="flex items-center gap-3 text-xs text-gray-600">
          {item.category ? (
            <span className="rounded-full bg-gray-100 text-gray-700 px-3 py-1 text-[11px] tracking-wider uppercase">
              {item.category}
            </span>
          ) : null}
          <span>{formatDateDa(item.date || item.fetched_at)}</span>
        </div>

        <h2 className="mt-3 text-2xl font-semibold tracking-tight">
          {item.title || 'Uden titel'}
        </h2>

        {item.summary ? (
          <p className="mt-3 text-gray-700 leading-relaxed line-clamp-3">{item.summary}</p>
        ) : null}

        <div className="mt-4 flex items-center gap-2">
          {item.url ? (
            <a
              className="rounded-full border border-line bg-white px-3 py-1 text-xs text-gray-800 hover:bg-gray-50 transition"
              href={item.url}
              target="_blank"
              rel="noreferrer"
            >
              Åbn kilde
            </a>
          ) : null}
        </div>

        <div className="mt-3 text-[12px] text-gray-500 font-mono truncate">
          {(item.url || '').replace(/^https?:\/\//, '')}
        </div>
      </div>
    </article>
  );
}
