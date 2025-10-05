'use client';
import { RageItem } from '@/lib/readPrompts';
import CardItem from './CardItem';

interface RelatedArticlesProps {
  articles: RageItem[];
  currentArticle?: RageItem;
  onArticleSelect: (article: RageItem) => void;
}

export default function RelatedArticles({ articles, currentArticle, onArticleSelect }: RelatedArticlesProps) {
  if (articles.length === 0) return null;

  return (
    <div className="bg-white/70 dark:bg-pure-black/70 backdrop-blur-xl rounded-2xl p-6 border border-white/40 dark:border-white/20 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Related Articles
        </h3>
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-blue-500 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          <span className="text-sm text-slate-600 dark:text-slate-400">
            Based on {currentArticle ? 'current article' : 'your search'}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {articles.map((article, index) => (
          <div
            key={`${article.url}-${index}`}
            onClick={() => onArticleSelect(article)}
            className="cursor-pointer group"
          >
            <div className="flex gap-4 p-4 bg-white/50 dark:bg-slate-700/50 rounded-xl border border-white/60 dark:border-white/30 hover:bg-white/60 dark:hover:bg-slate-700/60 transition-all duration-200 group-hover:shadow-md">
              {/* Article Image */}
              <div className="flex-shrink-0 w-20 h-20 relative overflow-hidden rounded-lg">
                {article.image ? (
                  <img
                    src={article.image}
                    alt={article.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = '/api/image-proxy?url=https://via.placeholder.com/80x80/64748b/ffffff?text=No+Image';
                    }}
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-600 dark:to-slate-700 flex items-center justify-center">
                    <svg className="w-8 h-8 text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Article Content */}
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100 line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors mb-2">
                  {article.title}
                </h4>
                
                <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mb-2">
                  {article.source && (
                    <span className="px-2 py-1 bg-slate-100 dark:bg-slate-600 rounded-full">
                      {article.source}
                    </span>
                  )}
                  {article.category && (
                    <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full">
                      {article.category}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {new Date(article.fetched_at).toLocaleDateString('da-DK')}
                  </span>
                  
                  {/* Similarity Score */}
                  {'similarity' in article && (
                    <div className="flex items-center gap-1">
                      <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                        {Math.round((Number(article.similarity) || 0) * 100)}% match
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Arrow Icon */}
              <div className="flex-shrink-0 flex items-center">
                <svg className="w-5 h-5 text-slate-400 dark:text-slate-500 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* View All Related */}
      <div className="mt-4 pt-4 border-t border-white/40 dark:border-white/20">
        <button className="w-full py-2 px-4 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg text-sm font-medium hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-all duration-200">
          View All Related Articles
        </button>
      </div>
    </div>
  );
}
