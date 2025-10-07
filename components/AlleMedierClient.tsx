'use client';
import { useMedia } from '../lib/media-context';
import { useState, useEffect } from 'react';
import dynamicImport from 'next/dynamic';
import { sortList } from '../lib/search';
import SorterPager from './SorterPager';
import SearchInput from './SearchInput';
import { ShimmerGrid } from './Shimmer';
import CompactHeader from './CompactHeader';

const YouTubeGrid = dynamicImport(() => import('./YouTubeGrid'), {
  loading: () => <ShimmerGrid />
});

interface AlleMedierClientProps {
  initialData: any[];
  searchParams: Record<string, string | string[] | undefined>;
}

export default function AlleMedierClient({ initialData, searchParams }: AlleMedierClientProps) {
  const { getEnabledMedias, mediaSources } = useMedia();
  const [filteredData, setFilteredData] = useState(initialData);

  // Filter data based on enabled media sources
  useEffect(() => {
    const enabledMedias = getEnabledMedias();
    
    const filtered = initialData.filter(article => {
      if (!article.source) return true;
      
      // Check if the article's source matches any enabled media
      const articleSource = article.source.toLowerCase();
      
      return enabledMedias.some(mediaId => {
        // Direct match by media ID first (for articles with source = media ID)
        if (articleSource === mediaId) {
          return true;
        }
        
        // Find the media source configuration
        const mediaSource = mediaSources.find(source => source.id === mediaId);
        if (!mediaSource) return false;
        
        // Extract domain from baseUrl for domain-based matching
        try {
          const mediaUrl = new URL(mediaSource.baseUrl);
          const mediaDomain = mediaUrl.hostname;
          return articleSource.includes(mediaDomain);
        } catch {
          return false;
        }
      });
    });
    
    setFilteredData(filtered);
  }, [initialData, getEnabledMedias, mediaSources]);

  // Auto-refresh articles every 10 minutes
  useEffect(() => {
    const refreshArticles = async () => {
      try {
        await fetch('/api/refresh', { method: 'POST' });
        // Refresh the page to get new articles
        window.location.reload();
      } catch (error) {
        console.error('Auto-refresh failed:', error);
      }
    };

    const interval = setInterval(refreshArticles, 10 * 60 * 1000); // 10 minutes
    
    return () => clearInterval(interval);
  }, []);

  const q = String(searchParams.q || '').trim();
  const cat = String(searchParams.cat || '').trim();
  const sinceStr = String(searchParams.since || '');
  const freshOnly = !!searchParams.fresh;
  const sort = String(searchParams.sort || 'newest');
  const page = Math.max(1, Number(searchParams.page) || 1);
  const source = String(searchParams.source || '').trim();
  const timeFilter = String(searchParams.time || 'today').trim();

  const sinceHours = ['24','48','72'].includes(sinceStr) ? Number(sinceStr) : undefined;

  // Determine the header title based on source parameter
  const getHeaderTitle = () => {
    if (!source) return "Alle Medier";
    
    // Find media source by ID
    const mediaSource = mediaSources.find(s => s.id.toLowerCase() === source.toLowerCase());
    return mediaSource ? mediaSource.name : source.toUpperCase();
  };

  const headerTitle = getHeaderTitle();

  // Apply all filters to the filtered data
  let list = filteredData.filter(p => {
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

    const okTimeFilter = timeFilter === 'today' ? (() => {
      const ts = Date.parse(p.date ?? p.fetched_at ?? '');
      if (isNaN(ts)) return false;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return ts >= today.getTime();
    })() : true;

    return okQ && okCat && okSource && okSince && okFresh && okTimeFilter;
  });

  // Remove duplicates based on URL (most reliable identifier)
  const deduplicatedList = list.reduce((acc: any[], article: any) => {
    const existingArticle = acc.find(existing => existing.url === article.url);
    if (!existingArticle) {
      acc.push(article);
    } else {
      // If we find a duplicate, keep the one with more recent date/fetched_at
      const existingDate = new Date(existingArticle.date || existingArticle.fetched_at || 0);
      const currentDate = new Date(article.date || article.fetched_at || 0);
      
      if (currentDate > existingDate) {
        // Replace with the more recent version
        const index = acc.indexOf(existingArticle);
        acc[index] = article;
      }
    }
    return acc;
  }, []);

  // sortér + paginér
  const PER = 24;
  list = sortList(deduplicatedList, sort);
  const total = list.length;
  const slice = list.slice((page-1)*PER, (page)*PER);

  const params = new URLSearchParams(Object.entries({
    q, cat, since: sinceHours? String(sinceHours):'', fresh: freshOnly? '1':'', sort, page: String(page), source: source || undefined
  }).filter(([,v])=>!!v) as any);

  return (
    <div className="relative z-10 max-w-7xl mx-auto px-6 pb-12">
        <CompactHeader 
          title={headerTitle}
          subtitle={`Viser ${list.length} unikke artikler (${filteredData.length} før deduplication)`}
        />

        <div className="sticky top-4 z-40 mb-8">
          <div className="flex flex-col xl:flex-row gap-4 items-start xl:items-center">
            <div className="flex-1 xl:max-w-md">
              <SearchInput />
            </div>
            <div className="flex-1 xl:flex-2">
              <div className="flex items-center gap-2 bg-white/20 dark:bg-black/30 backdrop-blur-3xl rounded-3xl py-2 px-2 border border-white/20 dark:border-white/10 shadow-2xl overflow-x-auto">
                <a href={`/alle-medier?${params.toString().replace(/cat=[^&]*&?/g, '')}`} className={`px-4 py-2 rounded-2xl text-sm font-medium transition-all duration-300 whitespace-nowrap ${!cat ? 'bg-white/40 dark:bg-black/60 text-slate-800 dark:text-white shadow-lg' : 'text-slate-600 dark:text-slate-300 hover:bg-white/20 dark:hover:bg-black/40'}`}>
                  Alle
                </a>
                <a href={`/alle-medier?${new URLSearchParams({...Object.fromEntries(params), cat: 'musik'}).toString()}`} className={`px-4 py-2 rounded-2xl text-sm font-medium transition-all duration-300 whitespace-nowrap ${cat === 'musik' ? 'bg-white/40 dark:bg-black/60 text-slate-800 dark:text-white shadow-lg' : 'text-slate-600 dark:text-slate-300 hover:bg-white/20 dark:hover:bg-black/40'}`}>
                  Musik
                </a>
                <a href={`/alle-medier?${new URLSearchParams({...Object.fromEntries(params), cat: 'film'}).toString()}`} className={`px-4 py-2 rounded-2xl text-sm font-medium transition-all duration-300 whitespace-nowrap ${cat === 'film' ? 'bg-white/40 dark:bg-black/60 text-slate-800 dark:text-white shadow-lg' : 'text-slate-600 dark:text-slate-300 hover:bg-white/20 dark:hover:bg-black/40'}`}>
                  Film
                </a>
                <a href={`/alle-medier?${new URLSearchParams({...Object.fromEntries(params), cat: 'anmeldelser'}).toString()}`} className={`px-4 py-2 rounded-2xl text-sm font-medium transition-all duration-300 whitespace-nowrap ${cat === 'anmeldelser' ? 'bg-white/40 dark:bg-black/60 text-slate-800 dark:text-white shadow-lg' : 'text-slate-600 dark:text-slate-300 hover:bg-white/20 dark:hover:bg-black/40'}`}>
                  Anmeldelser
                </a>
                <a href={`/alle-medier?${new URLSearchParams({...Object.fromEntries(params), cat: 'gaming'}).toString()}`} className={`px-4 py-2 rounded-2xl text-sm font-medium transition-all duration-300 whitespace-nowrap ${cat === 'gaming' ? 'bg-white/40 dark:bg-black/60 text-slate-800 dark:text-white shadow-lg' : 'text-slate-600 dark:text-slate-300 hover:bg-white/20 dark:hover:bg-black/40'}`}>
                  Gaming
                </a>
                <a href={`/alle-medier?${new URLSearchParams({...Object.fromEntries(params), cat: 'nyheder'}).toString()}`} className={`px-4 py-2 rounded-2xl text-sm font-medium transition-all duration-300 whitespace-nowrap ${cat === 'nyheder' ? 'bg-white/40 dark:bg-black/60 text-slate-800 dark:text-white shadow-lg' : 'text-slate-600 dark:text-slate-300 hover:bg-white/20 dark:hover:bg-black/40'}`}>
                  Nyheder
                </a>
              </div>
            </div>
            <div className="flex-shrink-0">
              <div className="flex items-center gap-2 bg-white/20 dark:bg-black/30 backdrop-blur-3xl rounded-3xl py-2 px-2 border border-white/20 dark:border-white/10 shadow-2xl">
                <a href={`/alle-medier?${new URLSearchParams({...Object.fromEntries(params), time: 'today'}).toString()}`} className={`px-4 py-2 rounded-2xl text-sm font-medium transition-all duration-300 whitespace-nowrap ${timeFilter === 'today' ? 'bg-white/40 dark:bg-black/60 text-slate-800 dark:text-white shadow-lg' : 'text-slate-600 dark:text-slate-300 hover:bg-white/20 dark:hover:bg-black/40'}`}>
                  Idag
                </a>
                <a href={`/alle-medier?${new URLSearchParams({...Object.fromEntries(params), time: 'all'}).toString()}`} className={`px-4 py-2 rounded-2xl text-sm font-medium transition-all duration-300 whitespace-nowrap ${timeFilter === 'all' ? 'bg-white/40 dark:bg-black/60 text-slate-800 dark:text-white shadow-lg' : 'text-slate-600 dark:text-slate-300 hover:bg-white/20 dark:hover:bg-black/40'}`}>
                  Alle
                </a>
              </div>
            </div>
          </div>
        </div>

        <YouTubeGrid slice={slice} />

        {total > PER && (
          <div className="mt-8">
            <SorterPager 
              total={total} 
              perPage={PER} 
              page={page} 
              sort={sort}
              params={params}
            />
          </div>
        )}
    </div>
  );
}