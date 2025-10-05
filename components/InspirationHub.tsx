'use client';
import { useState } from 'react';
import Link from 'next/link';

interface InspirationSource {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  color: string;
  url?: string;
  isExternal?: boolean;
  articleCount?: number;
  lastUpdated?: string;
}

export default function InspirationHub() {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const inspirationSources: InspirationSource[] = [
    // Danish Sources
    {
      id: 'dr-news',
      name: 'DR Seneste nyt',
      description: 'Danmarks Radio nyheder',
      category: 'danish',
      icon: '🇩🇰',
      color: 'bg-red-500',
      url: '/alle-medier?source=dr',
      articleCount: 45,
      lastUpdated: '2 min siden'
    },
    {
      id: 'dr-udland',
      name: 'DR Udland',
      description: 'Internationale nyheder',
      category: 'danish',
      icon: '🌍',
      color: 'bg-blue-500',
      url: '/alle-medier?source=dr&category=udland',
      articleCount: 23,
      lastUpdated: '5 min siden'
    },
    {
      id: 'dr-kultur',
      name: 'DR Kultur',
      description: 'Kultur og kunst',
      category: 'danish',
      icon: '🎭',
      color: 'bg-purple-500',
      url: '/alle-medier?source=dr&category=kultur',
      articleCount: 18,
      lastUpdated: '1 time siden'
    },
    {
      id: 'dr-musik',
      name: 'DR Musik',
      description: 'Musik og koncerter',
      category: 'danish',
      icon: '🎵',
      color: 'bg-pink-500',
      url: '/alle-medier?source=dr&category=musik',
      articleCount: 31,
      lastUpdated: '30 min siden'
    },
    {
      id: 'dr-sport',
      name: 'DR Sport',
      description: 'Sportsnyheder',
      category: 'danish',
      icon: '⚽',
      color: 'bg-green-500',
      url: '/alle-medier?source=dr&category=sport',
      articleCount: 27,
      lastUpdated: '15 min siden'
    },
    {
      id: 'dr-viden',
      name: 'DR Viden',
      description: 'Videnskab og teknologi',
      category: 'danish',
      icon: '🔬',
      color: 'bg-indigo-500',
      url: '/alle-medier?source=dr&category=viden',
      articleCount: 12,
      lastUpdated: '2 timer siden'
    },

    // International Sources
    {
      id: 'bbc-news',
      name: 'BBC News',
      description: 'British Broadcasting Corporation',
      category: 'international',
      icon: '🇬🇧',
      color: 'bg-red-600',
      url: '/alle-medier?source=bbc',
      articleCount: 67,
      lastUpdated: '1 min siden'
    },
    {
      id: 'cnn',
      name: 'CNN',
      description: 'Cable News Network',
      category: 'international',
      icon: '🇺🇸',
      color: 'bg-blue-600',
      url: 'https://rss.cnn.com/rss/edition.rss',
      isExternal: true,
      articleCount: 89,
      lastUpdated: '3 min siden'
    },
    {
      id: 'reuters',
      name: 'Reuters',
      description: 'Global news agency',
      category: 'international',
      icon: '📰',
      color: 'bg-gray-600',
      url: 'https://feeds.reuters.com/reuters/topNews',
      isExternal: true,
      articleCount: 156,
      lastUpdated: '5 min siden'
    },
    {
      id: 'oreilly',
      name: 'O\'Reilly Radar',
      description: 'Technology insights',
      category: 'international',
      icon: '🔧',
      color: 'bg-orange-500',
      url: 'https://feeds.feedburner.com/oreilly/radar',
      isExternal: true,
      articleCount: 8,
      lastUpdated: '1 dag siden'
    }
  ];

  const categories = [
    {
      id: 'danish',
      name: 'Danske Kilder',
      icon: '🇩🇰',
      sources: inspirationSources.filter(s => s.category === 'danish')
    },
    {
      id: 'international',
      name: 'Internationale Kilder',
      icon: '🌍',
      sources: inspirationSources.filter(s => s.category === 'international')
    }
  ];

  const toggleCategory = (categoryId: string) => {
    setExpandedCategory(expandedCategory === categoryId ? null : categoryId);
  };

  return (
    <div className="space-y-6">
      {/* Quick Access to All Media */}
      <Link 
        href="/alle-medier"
        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-100/50 dark:hover:bg-black-800/50 transition-colors text-left border border-slate-200/50 dark:border-black-700/50"
      >
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center">
          <span className="text-white text-sm">📰</span>
        </div>
        <div>
          <span className="text-sm font-medium text-slate-700 dark:text-black-200">Alle Medier</span>
          <p className="text-xs text-slate-500 dark:text-black-400">Se alle artikler</p>
        </div>
      </Link>

      {categories.map((category) => (
        <div key={category.id}>
          <button
            onClick={() => toggleCategory(category.id)}
            className="flex items-center justify-between w-full p-3 rounded-xl hover:bg-slate-100/50 dark:hover:bg-black-800/50 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <span className="text-lg">{category.icon}</span>
              <div className="text-left">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-black-200 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                  {category.name}
                </h3>
                <p className="text-xs text-slate-500 dark:text-black-400">
                  {category.sources.length} kilder
                </p>
              </div>
            </div>
            <svg 
              className={`w-4 h-4 text-slate-400 dark:text-black-500 transition-transform ${
                expandedCategory === category.id ? 'rotate-180' : ''
              }`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {expandedCategory === category.id && (
            <div className="mt-2 space-y-1 pl-6">
              {category.sources.map((source) => (
                <div key={source.id} className="group">
                  {source.isExternal ? (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-100/50 dark:hover:bg-black-800/50 transition-colors"
                    >
                      <div className={`w-6 h-6 rounded-full ${source.color} flex items-center justify-center text-white text-xs`}>
                        {source.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-700 dark:text-black-200 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                            {source.name}
                          </span>
                          <svg className="w-3 h-3 text-slate-400 dark:text-black-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-black-400 truncate">
                          {source.description}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-slate-400 dark:text-black-500">
                            {source.articleCount} artikler
                          </span>
                          <span className="text-xs text-slate-400 dark:text-black-500">•</span>
                          <span className="text-xs text-slate-400 dark:text-black-500">
                            {source.lastUpdated}
                          </span>
                        </div>
                      </div>
                    </a>
                  ) : (
                    <Link
                      href={source.url || '#'}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-100/50 dark:hover:bg-black-800/50 transition-colors"
                    >
                      <div className={`w-6 h-6 rounded-full ${source.color} flex items-center justify-center text-white text-xs`}>
                        {source.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-slate-700 dark:text-black-200 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                          {source.name}
                        </span>
                        <p className="text-xs text-slate-500 dark:text-black-400 truncate">
                          {source.description}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-slate-400 dark:text-black-500">
                            {source.articleCount} artikler
                          </span>
                          <span className="text-xs text-slate-400 dark:text-black-500">•</span>
                          <span className="text-xs text-slate-400 dark:text-black-500">
                            {source.lastUpdated}
                          </span>
                        </div>
                      </div>
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Quick Inspiration Actions */}
      <div className="mt-6 pt-4 border-t border-slate-200/50 dark:border-black-700/50">
        <div className="space-y-2">
          <Link 
            href="/alle-medier?sort=trending&fresh=1"
            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-100/50 dark:hover:bg-black-800/50 transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
              <span className="text-white text-sm">💡</span>
            </div>
            <div>
              <span className="text-sm font-medium text-slate-700 dark:text-black-200">Inspiration Mode</span>
              <p className="text-xs text-slate-500 dark:text-black-400">Blend alle kilder</p>
            </div>
          </Link>
          
          <Link 
            href="/alle-medier?sort=trending&fresh=1"
            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-100/50 dark:hover:bg-black-800/50 transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
              <span className="text-white text-sm">🎯</span>
            </div>
            <div>
              <span className="text-sm font-medium text-slate-700 dark:text-black-200">Trending Topics</span>
              <p className="text-xs text-slate-500 dark:text-black-400">Hvad er populært nu</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
