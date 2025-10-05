'use client';
import SkeletonGrid from './SkeletonGrid';
import CardItem from './CardItem';
import { useRefreshing } from './RefreshCtx';

export default function ListView({ list }: { list: any[] }) {
  const { refreshing } = useRefreshing();
  if (refreshing) return <SkeletonGrid />;
  return (
    <div className="grid gap-8 xl:grid-cols-2">
      {list.map((p: any, i: number) => (
        <div key={(p.url || '') + i} onClick={()=>window.postMessage({ type:'open-drawer', item: p }, '*')}>
          <CardItem item={{
            id: p.url || String(i),
            title: p.title || 'Uden titel',
            url: p.url,
            date: p.date,
            fetched_at: p.fetched_at,
            category: p.category,
            summary: p.summary,
            bullets: Array.isArray(p.bullets) ? p.bullets.slice(0, 3) : [],
            image: p.image,
          }} />
        </div>
      ))}
    </div>
  );
}
