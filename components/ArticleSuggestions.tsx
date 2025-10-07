'use client';

import { useState, useEffect } from 'react';

interface ArticleSuggestion {
  title: string;
  source: string;
  category: string;
  url: string;
  publishedAt: string;
  tags: string[];
  excerpt: string;
  trend?: string;
}

interface Trend {
  keyword: string;
  count: number;
  category: string;
}

interface ArticleSuggestionsProps {
  category: string;
  tags: string[];
  onSelectSuggestion?: (suggestion: ArticleSuggestion) => void;
}

export default function ArticleSuggestions({ 
  category, 
  tags,
  onSelectSuggestion 
}: ArticleSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<ArticleSuggestion[]>([]);
  const [trends, setTrends] = useState<Trend[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const loadSuggestions = async () => {
      setLoading(true);
      
      try {
        const response = await fetch('/api/suggest-articles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category, tags, limit: 20 })
        });
        
        if (response.ok) {
          const data = await response.json();
          setSuggestions(data.suggestions || []);
          setTrends(data.trends || []);
        }
      } catch (error) {
        console.error('Failed to load article suggestions:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSuggestions();
  }, [category, tags]);

  if (loading) {
    return (
      <div className="bg-black border border-white/20 rounded-lg p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-white/10 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            <div className="h-3 bg-white/10 rounded w-full"></div>
            <div className="h-3 bg-white/10 rounded w-5/6"></div>
            <div className="h-3 bg-white/10 rounded w-4/6"></div>
          </div>
        </div>
      </div>
    );
  }

  if (suggestions.length === 0) {
    return null;
  }

  const displayedSuggestions = showAll ? suggestions : suggestions.slice(0, 5);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-white text-lg font-medium mb-1">
          💡 Trending lige nu
        </h3>
        <p className="text-white/60 text-sm">
          Andre medier skriver om dette indenfor {category}
        </p>
      </div>

      {/* Trends */}
      {trends.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {trends.map((trend, index) => (
            <div
              key={index}
              className="px-3 py-1 bg-blue-500/20 border border-blue-400/30 rounded-full text-blue-300 text-xs font-medium"
            >
              🔥 {trend.keyword} ({trend.count})
            </div>
          ))}
        </div>
      )}

      {/* Suggestions */}
      <div className="space-y-3">
        {displayedSuggestions.map((suggestion, index) => (
          <div
            key={index}
            className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-lg transition-all cursor-pointer group"
            onClick={() => onSelectSuggestion?.(suggestion)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h4 className="text-white text-sm font-medium mb-1 line-clamp-2 group-hover:text-blue-300 transition-colors">
                  {suggestion.title}
                </h4>
                <div className="flex items-center gap-2 text-xs text-white/50 mb-2">
                  <span className="font-medium">{suggestion.source}</span>
                  <span>•</span>
                  <span>{new Date(suggestion.publishedAt).toLocaleDateString('da-DK')}</span>
                  {suggestion.trend && (
                    <>
                      <span>•</span>
                      <span className="text-blue-400">🔥 {suggestion.trend}</span>
                    </>
                  )}
                </div>
                <p className="text-white/40 text-xs line-clamp-2">
                  {suggestion.excerpt}
                </p>
              </div>
              
              <div className="flex-shrink-0">
                <svg 
                  className="w-4 h-4 text-white/30 group-hover:text-blue-400 transition-colors" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M9 5l7 7-7 7" 
                  />
                </svg>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Show More Button */}
      {suggestions.length > 5 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full py-2 text-white/60 hover:text-white text-sm font-medium transition-colors"
        >
          {showAll ? '↑ Vis færre' : `↓ Vis alle ${suggestions.length} forslag`}
        </button>
      )}

      {/* Stats */}
      <div className="pt-3 border-t border-white/10">
        <p className="text-white/40 text-xs text-center">
          {suggestions.length} artikler fra de sidste 7 dage • {trends.length} aktive trends
        </p>
      </div>
    </div>
  );
}

