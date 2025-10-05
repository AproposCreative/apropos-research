import { Suspense } from 'react';
import dynamicImport from 'next/dynamic';
import { readPrompts } from '../../lib/readPrompts';
import { sortList } from '../../lib/search';
import SorterPager from '../../components/SorterPager';
import SearchInput from '../../components/SearchInput';
import { ShimmerGrid } from '../../components/Shimmer';
import CompactHeader from '../../components/CompactHeader';

// Dynamic imports for better performance
const YouTubeGrid = dynamicImport(() => import('../../components/YouTubeGrid'), {
  loading: () => <ShimmerGrid />
});

// Disable static generation for this page
export const dynamic = 'force-dynamic';

const PER = 24;

export default async function AlleMedierPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const awaitedParams = await searchParams;
  const q = String(awaitedParams.q || '').trim();
  const cat = String(awaitedParams.cat || '').trim();
  const sinceStr = String(awaitedParams.since || '');
  const freshOnly = !!awaitedParams.fresh;
  const sort = String(awaitedParams.sort || 'newest');
  const page = Math.max(1, Number(awaitedParams.page) || 1);
  const source = String(awaitedParams.source || '').trim();

  const sinceHours = ['24','48','72'].includes(sinceStr) ? Number(sinceStr) : undefined;

  const all = await readPrompts();

  // filtrér
  let list = all.filter(p => {
    const okQ = q ? (
      (p.title||'').toLowerCase().includes(q.toLowerCase()) ||
      (p.summary||'').toLowerCase().includes(q.toLowerCase()) ||
      (p.bullets||[]).some((b:string)=> b.toLowerCase().includes(q.toLowerCase()))
    ) : true;

    const okCat = cat ? (() => {
      const articleCategory = String(p.category||'').trim().toLowerCase();
      const filterCategory = cat.trim().toLowerCase();
      
      // Exact match
      if (articleCategory === filterCategory) return true;
      
      // Special mappings for better filtering
      if (filterCategory === 'alle') return true;
      if (filterCategory === 'musik' && (articleCategory === 'musik' || articleCategory === 'anmeldelser')) return true;
      if (filterCategory === 'film' && (articleCategory === 'film' || articleCategory === 'serie')) return true;
      if (filterCategory === 'gaming' && articleCategory === 'gaming') return true;
      if (filterCategory === 'sport' && articleCategory === 'sport') return true;
      if (filterCategory === 'politik' && articleCategory === 'politik') return true;
      if (filterCategory === 'økonomi' && articleCategory === 'økonomi') return true;
      if (filterCategory === 'teknologi' && articleCategory === 'teknologi') return true;
      if (filterCategory === 'nyheder' && (articleCategory === 'nyheder' || articleCategory === 'news' || articleCategory === 'politik' || articleCategory === 'økonomi')) return true;
      
      return false;
    })() : true;

    const okSource = source ? (() => {
      const articleSource = (p.source || '').toLowerCase();
      const filterSource = source.toLowerCase();
      // Match if the article source contains the filter source (e.g., "berlingske" matches "berlingske.dk")
      return articleSource.includes(filterSource);
    })() : true;

    const okSince = sinceHours ? (() => {
      const ts = Date.parse(p.date ?? p.fetched_at ?? '');
      if (isNaN(ts)) return true;
      return ts >= Date.now() - sinceHours*3600*1000;
    })() : true;

    const okFresh = freshOnly ? (() => {
      const ts = Date.parse(p.date ?? p.fetched_at ?? '');
      return !isNaN(ts) && ts >= Date.now() - 24*3600*1000;
    })() : true;

    return okQ && okCat && okSource && okSince && okFresh;
  });

  // sortér + paginér
  list = sortList(list, sort);
  const total = list.length;
  const slice = list.slice((page-1)*PER, (page)*PER);

  const params = new URLSearchParams(Object.entries({
    q, cat, since: sinceHours? String(sinceHours):'', fresh: freshOnly? '1':'', sort, page: String(page), source: source || undefined
  }).filter(([,v])=>!!v) as any);

  return (
    <div className="relative z-10 max-w-7xl mx-auto px-6 pb-12">
        <CompactHeader 
          title="Alle Medier"
          subtitle={`Viser ${list.length} ud af ${all.length} artikler`}
        />

        {/* Search, Category Filters and Stats - All on One Line - Sticky */}
        <div className="sticky top-4 z-40 mb-8">
          <div className="flex flex-col xl:flex-row gap-4 items-start xl:items-center">
            {/* Search Bar */}
            <div className="flex-1 xl:max-w-md">
              <SearchInput />
            </div>
            
            {/* Category Filters and Stats */}
            <div className="flex-1 xl:flex-2">
              <div className="flex items-center gap-2 bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl rounded-2xl p-2 border border-white/20 dark:border-slate-700/50 shadow-2xl ring-1 ring-white/10 dark:ring-slate-700/20 overflow-x-auto h-10">
                <a 
                  href={`/alle-medier?${new URLSearchParams(Object.fromEntries(Object.entries({...Object.fromEntries(params), cat: ''}).filter(([,v])=>!!v))).toString()}`}
                  className={`group relative overflow-hidden px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all duration-300 ${
                    !cat 
                      ? 'bg-white/30 dark:bg-white/20 text-slate-800 dark:text-slate-100 shadow-lg backdrop-blur-sm' 
                      : 'text-slate-600 dark:text-slate-300 hover:bg-white/20 dark:hover:bg-white/10 hover:text-slate-800 dark:hover:text-slate-100 backdrop-blur-sm'
                  }`}
                >
                  <span className="relative z-10">Alle</span>
                  {!cat && (
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20" />
                  )}
                </a>
                <a 
                  href={`/alle-medier?${new URLSearchParams(Object.fromEntries(Object.entries({...Object.fromEntries(params), cat: 'musik'}).filter(([,v])=>!!v))).toString()}`}
                  className={`group relative overflow-hidden px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all duration-300 ${
                    cat === 'musik' 
                      ? 'bg-white/30 dark:bg-white/20 text-slate-800 dark:text-slate-100 shadow-lg backdrop-blur-sm' 
                      : 'text-slate-600 dark:text-slate-300 hover:bg-white/20 dark:hover:bg-white/10 hover:text-slate-800 dark:hover:text-slate-100 backdrop-blur-sm'
                  }`}
                >
                  <span className="relative z-10">Musik</span>
                  {cat === 'musik' && (
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20" />
                  )}
                </a>
                <a 
                  href={`/alle-medier?${new URLSearchParams(Object.fromEntries(Object.entries({...Object.fromEntries(params), cat: 'film'}).filter(([,v])=>!!v))).toString()}`}
                  className={`group relative overflow-hidden px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all duration-300 ${
                    cat === 'film' 
                      ? 'bg-white/30 dark:bg-white/20 text-slate-800 dark:text-slate-100 shadow-lg backdrop-blur-sm' 
                      : 'text-slate-600 dark:text-slate-300 hover:bg-white/20 dark:hover:bg-white/10 hover:text-slate-800 dark:hover:text-slate-100 backdrop-blur-sm'
                  }`}
                >
                  <span className="relative z-10">Film</span>
                  {cat === 'film' && (
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20" />
                  )}
                </a>
                <a 
                  href={`/alle-medier?${new URLSearchParams(Object.fromEntries(Object.entries({...Object.fromEntries(params), cat: 'anmeldelser'}).filter(([,v])=>!!v))).toString()}`}
                  className={`group relative overflow-hidden px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all duration-300 ${
                    cat === 'anmeldelser' 
                      ? 'bg-white/30 dark:bg-white/20 text-slate-800 dark:text-slate-100 shadow-lg backdrop-blur-sm' 
                      : 'text-slate-600 dark:text-slate-300 hover:bg-white/20 dark:hover:bg-white/10 hover:text-slate-800 dark:hover:text-slate-100 backdrop-blur-sm'
                  }`}
                >
                  <span className="relative z-10">Anmeldelser</span>
                  {cat === 'anmeldelser' && (
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20" />
                  )}
                </a>
                <a 
                  href={`/alle-medier?${new URLSearchParams(Object.fromEntries(Object.entries({...Object.fromEntries(params), cat: 'gaming'}).filter(([,v])=>!!v))).toString()}`}
                  className={`group relative overflow-hidden px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all duration-300 ${
                    cat === 'gaming' 
                      ? 'bg-white/30 dark:bg-white/20 text-slate-800 dark:text-slate-100 shadow-lg backdrop-blur-sm' 
                      : 'text-slate-600 dark:text-slate-300 hover:bg-white/20 dark:hover:bg-white/10 hover:text-slate-800 dark:hover:text-slate-100 backdrop-blur-sm'
                  }`}
                >
                  <span className="relative z-10">Gaming</span>
                  {cat === 'gaming' && (
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20" />
                  )}
                </a>
                <a 
                  href={`/alle-medier?${new URLSearchParams(Object.fromEntries(Object.entries({...Object.fromEntries(params), cat: 'nyheder'}).filter(([,v])=>!!v))).toString()}`}
                  className={`group relative overflow-hidden px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all duration-300 ${
                    cat === 'nyheder' 
                      ? 'bg-white/30 dark:bg-white/20 text-slate-800 dark:text-slate-100 shadow-lg backdrop-blur-sm' 
                      : 'text-slate-600 dark:text-slate-300 hover:bg-white/20 dark:hover:bg-white/10 hover:text-slate-800 dark:hover:text-slate-100 backdrop-blur-sm'
                  }`}
                >
                  <span className="relative z-10">Nyheder</span>
                  {cat === 'nyheder' && (
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20" />
                  )}
                </a>
              </div>
            </div>

            {/* Stats */}
            <div className="lg:w-80 flex-shrink-0">
              <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl rounded-2xl py-2 px-3 border border-white/20 dark:border-slate-700/50 shadow-2xl ring-1 ring-white/10 dark:ring-slate-700/20 h-10 flex items-center">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 animate-pulse" />
                    <div className="text-xs text-slate-600 dark:text-slate-300">
                      {source ? (
                        <>
                          <span className="font-bold text-slate-800 dark:text-slate-100">{slice.length}</span> af <span className="font-bold text-slate-800 dark:text-slate-100">{total}</span> fra <span className="font-bold text-slate-800 dark:text-slate-100 capitalize">{source}</span>
                        </>
                      ) : (
                        <>
                          <span className="font-bold text-slate-800 dark:text-slate-100">{slice.length}</span> af <span className="font-bold text-slate-800 dark:text-slate-100">{total}</span> artikler
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    Side {page} af {Math.max(1, Math.ceil(total / PER))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* YouTube-style Grid */}
        <div className="mb-12">
          <Suspense fallback={<ShimmerGrid count={8} />}>
            <YouTubeGrid slice={slice} />
          </Suspense>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-center">
          <SorterPager total={total} page={page} perPage={PER} sort={sort} params={params} />
        </div>

    </div>
  );
}
