'use client';
import { useState } from 'react';
import { RageItem } from '@/lib/readPrompts';
import AdvancedSearch from './AdvancedSearch';
import RelatedArticles from './RelatedArticles';
import SearchCardItem from './SearchCardItem';

interface SearchResultsProps {
  articles: RageItem[];
}

export default function SearchResults({ articles }: SearchResultsProps) {
  const [searchResults, setSearchResults] = useState<RageItem[]>(articles);
  const [relatedArticles, setRelatedArticles] = useState<RageItem[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<RageItem | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'relevance' | 'date' | 'title' | 'source'>('relevance');

  // Sort results
  const sortedResults = [...searchResults].sort((a, b) => {
    switch (sortBy) {
      case 'relevance':
        return (b.relevanceScore || 0) - (a.relevanceScore || 0);
      case 'date':
        return new Date(b.fetched_at).getTime() - new Date(a.fetched_at).getTime();
      case 'title':
        return (a.title || '').localeCompare(b.title || '');
      case 'source':
        return (a.source || '').localeCompare(b.source || '');
      default:
        return 0;
    }
  });

  const handleArticleSelect = (article: RageItem) => {
    setSelectedArticle(article);
    // You could add more logic here, like tracking user behavior
  };

  return (
    <div className="space-y-6">
      {/* Advanced Search */}
      <AdvancedSearch
        articles={articles}
        onSearchResults={setSearchResults}
        onRelatedArticles={setRelatedArticles}
      />

      {/* Results Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            Search Results
          </h2>
          <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-sm font-medium">
            {searchResults.length} articles found
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Sort Options */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-2 bg-white/50 dark:bg-slate-700/50 border border-white/60 dark:border-white/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          >
            <option value="relevance">Sort by Relevance</option>
            <option value="date">Sort by Date</option>
            <option value="title">Sort by Title</option>
            <option value="source">Sort by Source</option>
          </select>

          {/* View Mode Toggle */}
          <div className="flex bg-white/50 dark:bg-slate-700/50 rounded-lg border border-white/60 dark:border-white/30">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-2 rounded-l-lg text-sm transition-all duration-200 ${
                viewMode === 'grid'
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-2 rounded-r-lg text-sm transition-all duration-200 ${
                viewMode === 'list'
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Search Results */}
        <div className="lg:col-span-2">
          {sortedResults.length === 0 ? (
            <div className="text-center py-12">
              <svg className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2">No articles found</h3>
              <p className="text-slate-600 dark:text-slate-400">Try adjusting your search terms or filters</p>
            </div>
          ) : (
            <div className={`grid gap-4 ${
              viewMode === 'grid' 
                ? 'grid-cols-1 md:grid-cols-2' 
                : 'grid-cols-1'
            }`}>
              {sortedResults.map((article, index) => (
                <SearchCardItem
                  key={`${article.url}-${index}`}
                  article={article} 
                  showRelevanceScore={sortBy === 'relevance'}
                  compact={viewMode === 'list'}
                  onClick={handleArticleSelect}
                />
              ))}
            </div>
          )}
        </div>

        {/* Related Articles Sidebar */}
        <div className="lg:col-span-1">
          <RelatedArticles
            articles={relatedArticles}
            currentArticle={selectedArticle}
            onArticleSelect={handleArticleSelect}
          />
        </div>
      </div>

      {/* Load More Button */}
      {sortedResults.length > 0 && (
        <div className="text-center pt-6">
          <button className="px-6 py-3 bg-blue-600 dark:bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-700 dark:hover:bg-blue-600 transition-all duration-200 shadow-lg hover:shadow-xl">
            Load More Results
          </button>
        </div>
      )}
    </div>
  );
}
