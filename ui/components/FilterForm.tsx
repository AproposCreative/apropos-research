'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function FilterFormInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleChange = (name: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set(name, value);
    } else {
      params.delete(name);
    }
    router.push(`/?${params.toString()}`);
  };

  return (
    <form className="sticky top-16 z-40 border-b border-line bg-white/80 backdrop-blur-xl shadow-sm py-4 -mx-4 md:-mx-6 px-4 md:px-6 transition-all duration-300" method="get" autoComplete="off">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <div className="col-span-2">
          <label className="sr-only" htmlFor="q">Søg</label>
          <input 
            id="q" 
            name="q" 
            defaultValue={searchParams.get('q') || ''} 
            placeholder="Søg…" 
            className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-300" 
          />
        </div>
        <div>
          <label className="sr-only" htmlFor="cat">Kategori</label>
          <select 
            id="cat" 
            name="cat" 
            defaultValue={searchParams.get('cat') || ''} 
            onChange={(e) => handleChange('cat', e.target.value)}
            className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-300"
          >
            <option value="">Alle kategorier</option>
            {children}
          </select>
        </div>
        <div>
          <label className="sr-only" htmlFor="since">Tidsrum</label>
          <select 
            id="since" 
            name="since" 
            defaultValue={searchParams.get('since') || ''} 
            onChange={(e) => handleChange('since', e.target.value)}
            className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-300"
          >
            <option value="">Alle tider</option>
            <option value="24">24 timer</option>
            <option value="48">48 timer</option>
            <option value="72">72 timer</option>
          </select>
        </div>
        <div>
          <label className="sr-only" htmlFor="sort">Sortering</label>
          <select 
            id="sort" 
            name="sort" 
            defaultValue={searchParams.get('sort') || ''} 
            onChange={(e) => handleChange('sort', e.target.value)}
            className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-300"
          >
            <option value="">Standard</option>
            <option value="date">Nyeste først</option>
            <option value="title">Titel A-Å</option>
            <option value="category">Kategori</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <a href="/" className="rounded-full border border-slate-300/50 dark:border-slate-600/50 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm px-3 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-slate-700/70 transition-all duration-300 whitespace-nowrap" title="Nulstil filtrene">Nulstil</a>
        </div>
      </div>
      <button className="sr-only" type="submit">Filtrér</button>
    </form>
  );
}

export default function FilterForm({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={
      <div className="sticky top-16 z-40 border-b border-line bg-white/80 backdrop-blur-xl shadow-sm py-4 -mx-4 md:-mx-6 px-4 md:px-6 transition-all duration-300">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="col-span-2 h-10 bg-slate-200 dark:bg-slate-700 rounded-xl animate-pulse"></div>
          <div className="h-10 bg-slate-200 dark:bg-slate-700 rounded-xl animate-pulse"></div>
          <div className="h-10 bg-slate-200 dark:bg-slate-700 rounded-xl animate-pulse"></div>
          <div className="h-10 bg-slate-200 dark:bg-slate-700 rounded-xl animate-pulse"></div>
        </div>
      </div>
    }>
      <FilterFormInner>{children}</FilterFormInner>
    </Suspense>
  );
}
