import { readPrompts } from '@/lib/readPrompts';
import { filterPrompts } from '@/lib/search';
import CardItem from '@/components/CardItem';
import BulkBar from '@/components/BulkBar';

type PageProps = { searchParams?: { q?: string; cat?: string; since?: string } };

export default async function Page({ searchParams }: PageProps) {
  const params = await searchParams;
  const q = (params?.q ?? '').toString();
  const cat = (params?.cat ?? '').toString();
  const sinceStr = (params?.since ?? '').toString();
  const sinceHours = ['24', '48', '72'].includes(sinceStr) ? Number(sinceStr) : undefined;

  const all = await readPrompts();
  const categories = Array.from(new Set(all.map(p => (p.category ?? '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'da'));
  const list = filterPrompts(all, { q, sinceHours, category: cat });

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">Research &amp; Prompts</h1>
        <p className="text-gray-600 mt-2">Seneste resumeer, bullets og kilder – klar til brug.</p>
        <div className="text-xs text-gray-500 mt-1">
          Viser <span className="font-medium">{list.length}</span> ud af {all.length} poster
        </div>
      </section>

      <form className="sticky top-14 z-20 border-b border-line bg-white/70 backdrop-blur-lg shadow-sm py-4 -mx-4 md:-mx-6 px-4 md:px-6" method="get">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="col-span-2">
            <label className="sr-only" htmlFor="q">Søg</label>
            <input id="q" name="q" defaultValue={q} placeholder="Søg…" className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-300" />
          </div>
          <div>
            <label className="sr-only" htmlFor="cat">Kategori</label>
            <select id="cat" name="cat" defaultValue={cat} className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-300">
              <option value="">Alle kategorier</option>
              {categories.map((c) => (<option key={c} value={c}>{c}</option>))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="since">Tidsrum</label>
            <select id="since" name="since" defaultValue={sinceHours ? String(sinceHours) : ''} className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-300">
              <option value="">Alle tider</option>
              <option value="24">24 timer</option>
              <option value="48">48 timer</option>
              <option value="72">72 timer</option>
            </select>
            <a href="/" className="rounded-full border border-line bg-white px-3 py-2 text-xs text-gray-800 hover:bg-gray-50 transition whitespace-nowrap" title="Nulstil filtrene">Nulstil</a>
          </div>
        </div>
        <button className="sr-only" type="submit">Filtrér</button>
      </form>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-line bg-white p-8 shadow-card">
          <div className="text-lg font-medium">Ingen prompts fundet</div>
          <p className="text-gray-600 mt-1 text-sm">
            Kør ingest i roden: <code className="font-mono">npm run ingest:rage -- --since=48 --limit=60</code>
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-8 xl:grid-cols-2">
            {list.map((p: any, i: number) => (
              <CardItem
                key={(p.url || '') + i}
                item={{
                  id: p.url || String(i),
                  title: p.title || 'Uden titel',
                  url: p.url,
                  date: p.date,
                  fetched_at: p.fetched_at,
                  category: p.category,
                  summary: p.summary,
                  bullets: Array.isArray(p.bullets) ? p.bullets.slice(0, 3) : [],
                  image: p.image, // shown if scraper adds it; else gradient placeholder
                }}
              />
            ))}
          </div>
          <BulkBar />
        </>
      )}
    </div>
  );
}


