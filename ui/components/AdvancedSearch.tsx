'use client';
import { useState, useEffect, useMemo } from 'react';
import { RageItem } from '@/lib/readPrompts';

interface SearchFilters {
  dateRange: 'all' | 'today' | 'week' | 'month' | 'year';
  sources: string[];
  categories: string[];
  sentiment: 'all' | 'positive' | 'negative' | 'neutral';
  length: 'all' | 'short' | 'medium' | 'long';
  minWords?: number;
  maxWords?: number;
}

interface SavedSearch {
  id: string;
  name: string;
  query: string;
  filters: SearchFilters;
  alerts: boolean;
  createdAt: string;
}

interface AdvancedSearchProps {
  articles: RageItem[];
  onSearchResults: (results: RageItem[]) => void;
  onRelatedArticles: (articles: RageItem[]) => void;
}

export default function AdvancedSearch({ articles, onSearchResults, onRelatedArticles }: AdvancedSearchProps) {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>({
    dateRange: 'all',
    sources: [],
    categories: [],
    sentiment: 'all',
    length: 'all'
  });
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [isSemanticSearch, setIsSemanticSearch] = useState(true);

  // Available sources and categories
  const availableSources = useMemo(() => {
    const sources = new Set(articles.map(article => article.source).filter(Boolean));
    return Array.from(sources).sort();
  }, [articles]);

  const availableCategories = useMemo(() => {
    const categories = new Set(articles.map(article => article.category).filter(Boolean));
    return Array.from(categories).sort();
  }, [articles]);

  // Semantic search function
  const semanticSearch = (searchQuery: string, articles: RageItem[]): RageItem[] => {
    if (!searchQuery.trim()) return articles;

    const queryWords = searchQuery.toLowerCase().split(/\s+/);
    
    return articles.map(article => {
      let score = 0;
      const title = article.title?.toLowerCase() || '';
      const content = article.summary?.toLowerCase() || '';
      const source = article.source?.toLowerCase() || '';
      const category = article.category?.toLowerCase() || '';

      // Title matches (highest weight)
      queryWords.forEach(word => {
        if (title.includes(word)) score += 10;
        if (title.startsWith(word)) score += 5;
      });

      // Content matches
      queryWords.forEach(word => {
        const contentMatches = (content.match(new RegExp(word, 'g')) || []).length;
        score += contentMatches * 2;
      });

      // Source and category matches
      queryWords.forEach(word => {
        if (source.includes(word)) score += 3;
        if (category.includes(word)) score += 3;
      });

      // Semantic similarity (simple keyword expansion)
      const semanticKeywords: { [key: string]: string[] } = {
        'music': ['song', 'album', 'artist', 'concert', 'band', 'musik', 'sang', 'koncert'],
        'film': ['movie', 'cinema', 'actor', 'director', 'film', 'biograf'],
        'sport': ['football', 'soccer', 'game', 'match', 'player', 'fodbold', 'kamp'],
        'tech': ['technology', 'computer', 'software', 'app', 'digital', 'teknologi'],
        'politics': ['government', 'election', 'minister', 'parliament', 'regering', 'valg'],
        'business': ['company', 'economy', 'market', 'stock', 'virksomhed', 'økonomi']
      };

      Object.entries(semanticKeywords).forEach(([key, synonyms]) => {
        if (queryWords.some(word => synonyms.includes(word))) {
          if (title.includes(key) || content.includes(key)) score += 4;
        }
      });

      return { ...article, relevanceScore: score };
    }).filter(article => article.relevanceScore > 0)
      .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
  };

  // Apply filters
  const applyFilters = (filteredArticles: RageItem[]): RageItem[] => {
    return filteredArticles.filter(article => {
      // Date filter
      if (filters.dateRange !== 'all') {
        const articleDate = new Date(article.fetched_at);
        const now = new Date();
        const daysDiff = Math.floor((now.getTime() - articleDate.getTime()) / (1000 * 60 * 60 * 24));

        switch (filters.dateRange) {
          case 'today':
            if (daysDiff > 1) return false;
            break;
          case 'week':
            if (daysDiff > 7) return false;
            break;
          case 'month':
            if (daysDiff > 30) return false;
            break;
          case 'year':
            if (daysDiff > 365) return false;
            break;
        }
      }

      // Source filter
      if (filters.sources.length > 0 && article.source) {
        if (!filters.sources.some(source => article.source?.includes(source))) return false;
      }

      // Category filter
      if (filters.categories.length > 0 && article.category) {
        if (!filters.categories.includes(article.category)) return false;
      }

      // Length filter
      if (filters.length !== 'all') {
        const wordCount = article.summary?.split(/\s+/).length || 0;
        switch (filters.length) {
          case 'short':
            if (wordCount > 300) return false;
            break;
          case 'medium':
            if (wordCount < 300 || wordCount > 800) return false;
            break;
          case 'long':
            if (wordCount < 800) return false;
            break;
        }
      }

      // Word count range
      if (filters.minWords || filters.maxWords) {
        const wordCount = article.summary?.split(/\s+/).length || 0;
        if (filters.minWords && wordCount < filters.minWords) return false;
        if (filters.maxWords && wordCount > filters.maxWords) return false;
      }

      return true;
    });
  };

  // Perform search
  const performSearch = () => {
    if (!query.trim()) {
      onSearchResults(articles);
      return;
    }

    let results = isSemanticSearch ? semanticSearch(query, articles) : articles.filter(article => 
      article.title?.toLowerCase().includes(query.toLowerCase()) ||
      article.summary?.toLowerCase().includes(query.toLowerCase())
    );

    results = applyFilters(results);
    onSearchResults(results);

    // Add to search history
    if (query.trim() && !searchHistory.includes(query.trim())) {
      setSearchHistory(prev => [query.trim(), ...prev.slice(0, 9)]);
    }

    // Find related articles
    if (results.length > 0) {
      const relatedArticles = findRelatedArticles(results[0], articles);
      onRelatedArticles(relatedArticles);
    }
  };

  // Find related articles based on the first result
  const findRelatedArticles = (baseArticle: RageItem, allArticles: RageItem[]): RageItem[] => {
    const baseWords = new Set((baseArticle.title + ' ' + baseArticle.summary).toLowerCase().split(/\s+/));
    
    return allArticles
      .filter(article => article.url !== baseArticle.url)
      .map(article => {
        const articleWords = new Set((article.title + ' ' + article.summary).toLowerCase().split(/\s+/));
        const intersection = new Set([...baseWords].filter(word => articleWords.has(word)));
        const similarity = intersection.size / Math.max(baseWords.size, articleWords.size);
        
        return { ...article, similarity };
      })
      .filter(article => article.similarity > 0.1)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);
  };

  // Save search
  const saveSearch = () => {
    if (!query.trim()) return;

    const newSearch: SavedSearch = {
      id: Date.now().toString(),
      name: query.trim(),
      query: query.trim(),
      filters: { ...filters },
      alerts: false,
      createdAt: new Date().toISOString()
    };

    setSavedSearches(prev => [newSearch, ...prev.slice(0, 9)]);
  };

  // Load saved search
  const loadSavedSearch = (savedSearch: SavedSearch) => {
    setQuery(savedSearch.query);
    setFilters(savedSearch.filters);
    performSearch();
  };

  // Toggle search alerts
  const toggleSearchAlert = (searchId: string) => {
    setSavedSearches(prev => prev.map(search => 
      search.id === searchId ? { ...search, alerts: !search.alerts } : search
    ));
  };

  useEffect(() => {
    performSearch();
  }, [query, filters, isSemanticSearch]);

  return (
    <div className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl rounded-2xl p-6 border border-white/40 dark:border-white/20 shadow-sm">
      <div className="space-y-4">
        {/* Search Input */}
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search articles semantically or by keywords..."
            className="w-full px-4 py-3 pl-12 pr-20 bg-white/50 dark:bg-slate-700/50 border border-white/60 dark:border-white/30 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200"
          />
          <svg className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex gap-1">
            <button
              onClick={() => setIsSemanticSearch(!isSemanticSearch)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all duration-200 ${
                isSemanticSearch 
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' 
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
              }`}
            >
              {isSemanticSearch ? 'Semantic' : 'Keyword'}
            </button>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="px-3 py-1 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 transition-all duration-200"
            >
              Filters
            </button>
          </div>
        </div>

        {/* Advanced Filters */}
        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-white/30 dark:bg-slate-700/30 rounded-xl border border-white/40 dark:border-white/20">
            {/* Date Range */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Date Range</label>
              <select
                value={filters.dateRange}
                onChange={(e) => setFilters(prev => ({ ...prev, dateRange: e.target.value as any }))}
                className="w-full px-3 py-2 bg-white/50 dark:bg-slate-600/50 border border-white/60 dark:border-white/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="year">This Year</option>
              </select>
            </div>

            {/* Sources */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Sources</label>
              <select
                multiple
                value={filters.sources}
                onChange={(e) => setFilters(prev => ({ 
                  ...prev, 
                  sources: Array.from(e.target.selectedOptions, option => option.value)
                }))}
                className="w-full px-3 py-2 bg-white/50 dark:bg-slate-600/50 border border-white/60 dark:border-white/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                size={3}
              >
                {availableSources.map(source => (
                  <option key={source} value={source}>{source}</option>
                ))}
              </select>
            </div>

            {/* Categories */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Categories</label>
              <select
                multiple
                value={filters.categories}
                onChange={(e) => setFilters(prev => ({ 
                  ...prev, 
                  categories: Array.from(e.target.selectedOptions, option => option.value)
                }))}
                className="w-full px-3 py-2 bg-white/50 dark:bg-slate-600/50 border border-white/60 dark:border-white/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                size={3}
              >
                {availableCategories.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>

            {/* Length */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Length</label>
              <select
                value={filters.length}
                onChange={(e) => setFilters(prev => ({ ...prev, length: e.target.value as any }))}
                className="w-full px-3 py-2 bg-white/50 dark:bg-slate-600/50 border border-white/60 dark:border-white/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              >
                <option value="all">Any Length</option>
                <option value="short">Short (&lt;300 words)</option>
                <option value="medium">Medium (300-800 words)</option>
                <option value="long">Long (&gt;800 words)</option>
              </select>
            </div>
          </div>
        )}

        {/* Search History */}
        {searchHistory.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Recent Searches</h4>
            <div className="flex flex-wrap gap-2">
              {searchHistory.slice(0, 5).map((search, index) => (
                <button
                  key={index}
                  onClick={() => setQuery(search)}
                  className="px-3 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded-lg text-sm hover:bg-slate-200 dark:hover:bg-slate-600 transition-all duration-200"
                >
                  {search}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Saved Searches */}
        {savedSearches.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300">Saved Searches</h4>
              <button
                onClick={saveSearch}
                disabled={!query.trim()}
                className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg text-sm hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save Current
              </button>
            </div>
            <div className="space-y-2">
              {savedSearches.map(search => (
                <div key={search.id} className="flex items-center justify-between p-3 bg-white/30 dark:bg-slate-700/30 rounded-lg border border-white/40 dark:border-white/20">
                  <div className="flex-1">
                    <button
                      onClick={() => loadSavedSearch(search)}
                      className="text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                      {search.name}
                    </button>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {new Date(search.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleSearchAlert(search.id)}
                      className={`px-2 py-1 rounded text-xs font-medium transition-all duration-200 ${
                        search.alerts 
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' 
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {search.alerts ? 'Alerts On' : 'Alerts Off'}
                    </button>
                    <button
                      onClick={() => setSavedSearches(prev => prev.filter(s => s.id !== search.id))}
                      className="p-1 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
