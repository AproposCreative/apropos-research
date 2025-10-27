'use client';

import { useState } from 'react';

interface Article {
  title: string;
  source: string;
  date: string;
  content: string;
  url?: string;
}

interface ArticlePickerProps {
  articles: Article[];
  onSelectArticle: (article: Article) => void;
  onClose: () => void;
  templateName: string;
}

export default function ArticlePicker({ articles, onSelectArticle, onClose, templateName }: ArticlePickerProps) {
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Ukendt dato';
      
      const now = new Date();
      const diffTime = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      // If same year, don't show year
      if (date.getFullYear() === now.getFullYear()) {
        if (diffDays === 0) {
          return 'i dag';
        } else if (diffDays === 1) {
          return 'i går';
        } else if (diffDays < 7) {
          return `${diffDays} dage siden`;
        } else {
          return date.toLocaleDateString('da-DK', { day: 'numeric', month: 'short' });
        }
      } else {
        // Different year, show year
        return date.toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: '2-digit' });
      }
    } catch {
      return 'Ukendt dato';
    }
  };

  const truncateText = (text: string, maxLength: number = 150) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  return (
    <div className="space-y-4 p-4">
      {/* Subtitle */}
      <div>
        <p className="text-white/60 text-sm">
          {articles.length} artikler fundet - vælg den der inspirerer dig mest
        </p>
      </div>

      {/* Articles List */}
      <div className="space-y-3">
        <div className="grid gap-3">
          {articles.map((article, index) => (
            <div
              key={index}
              className={`p-3 rounded-lg border cursor-pointer transition-all duration-200 ${
                selectedArticle === article
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-white/20 hover:border-blue-400 hover:bg-blue-500/5'
              }`}
              onClick={() => {
                setSelectedArticle(article);
                // Automatically select the article when clicked
                onSelectArticle(article);
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-white text-sm font-medium mb-2 line-clamp-2">
                    {article.title}
                  </h3>
                  <p className="text-white/70 text-xs mb-2 line-clamp-3">
                    {truncateText(article.content)}
                  </p>
                  <div className="flex items-center gap-4 text-xs text-white/50">
                    <span>{article.source}</span>
                    <span>•</span>
                    <span>{formatDate(article.date)}</span>
                  </div>
                </div>
                {selectedArticle === article && (
                  <div className="flex-shrink-0">
                    <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
