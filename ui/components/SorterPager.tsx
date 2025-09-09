'use client';
export default function SorterPager({ total, page, perPage, sort, params }:{
  total: number; page: number; perPage: number; sort: string; params: URLSearchParams;
}) {
  function link(next: Record<string,string|undefined>) {
    const q = new URLSearchParams(params.toString());
    for (const [k,v] of Object.entries(next)) { if (!v) q.delete(k); else q.set(k, v); }
    return `?${q.toString()}`;
  }
  const pages = Math.max(1, Math.ceil(total / perPage));
  const prev = Math.max(1, page-1);
  const nextPage = Math.min(pages, page+1);
  
  return (
    <div className="flex items-center justify-between gap-8 p-6 rounded-3xl bg-white/5 dark:bg-black/20 backdrop-blur-2xl border border-white/10 dark:border-white/5 shadow-2xl">
      {/* Sort Controls */}
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-slate-600 dark:text-slate-300 tracking-wide">Sortér</label>
        <select
          className="appearance-none rounded-2xl border-0 bg-white/10 dark:bg-white/5 backdrop-blur-xl text-slate-700 dark:text-slate-200 px-6 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:bg-white/20 dark:focus:bg-white/10 transition-all duration-300 shadow-lg cursor-pointer"
          defaultValue={sort}
          onChange={(e)=>{ location.href = link({ sort: e.target.value, page: '1' }); }}
        >
          <option value="new" className="bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200">Nyeste</option>
          <option value="old" className="bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200">Ældste</option>
          <option value="title" className="bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200">Titel (A–Å)</option>
          <option value="cat" className="bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200">Kategori (A–Å)</option>
        </select>
      </div>
      
      {/* Pagination Controls */}
      <div className="flex items-center gap-4">
        <a 
          className={`group relative overflow-hidden rounded-2xl px-6 py-3 text-sm font-medium transition-all duration-300 ${
            page <= 1 
              ? 'bg-white/5 dark:bg-white/5 text-slate-400 dark:text-slate-500 cursor-not-allowed' 
              : 'bg-white/10 dark:bg-white/5 text-slate-700 dark:text-slate-200 hover:bg-white/20 dark:hover:bg-white/10 hover:scale-105 shadow-lg hover:shadow-xl'
          }`}
          href={page <= 1 ? '#' : link({ page: String(prev) })}
        >
          <span className="relative z-10">Forrige</span>
          {page > 1 && (
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          )}
        </a>
        
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 dark:bg-white/5 backdrop-blur-sm">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Side</span>
          <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{page}</span>
          <span className="text-sm text-slate-500 dark:text-slate-400">af</span>
          <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{pages}</span>
        </div>
        
        <a 
          className={`group relative overflow-hidden rounded-2xl px-6 py-3 text-sm font-medium transition-all duration-300 ${
            page >= pages 
              ? 'bg-white/5 dark:bg-white/5 text-slate-400 dark:text-slate-500 cursor-not-allowed' 
              : 'bg-white/10 dark:bg-white/5 text-slate-700 dark:text-slate-200 hover:bg-white/20 dark:hover:bg-white/10 hover:scale-105 shadow-lg hover:shadow-xl'
          }`}
          href={page >= pages ? '#' : link({ page: String(nextPage) })}
        >
          <span className="relative z-10">Næste</span>
          {page < pages && (
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          )}
        </a>
      </div>
    </div>
  );
}
