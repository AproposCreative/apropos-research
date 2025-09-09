'use client';
import CardItem from './CardItem';

export default function YouTubeGrid({ slice }: { slice: any[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {slice.map((p: any, i: number) => {
        const itemId = p.url || String(i);
        
        return (
          <div key={itemId} className="h-full">
            <CardItem 
              item={{
                id: itemId,
                title: p.title || 'Uden titel',
                url: p.url,
                date: p.date,
                fetched_at: p.fetched_at,
                category: p.category,
                summary: p.summary,
                bullets: p.bullets,
                image: p.image
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
