'use client';

import { useState, useEffect } from 'react';

interface Category {
  id: string;
  name: string;
  description: string;
  trending?: boolean;
  articleCount?: number;
  icon: string;
}

interface CategorySelectionProps {
  onSelectCategory: (category: Category) => void;
  onSelectTrendingCategory?: (category: Category, articles: any[]) => void;
}

// Apropos Magazine categories with trending data
const categories: Category[] = [
  {
    id: 'gaming',
    name: 'Gaming',
    description: 'Spil, konsoller og gaming kultur',
    icon: '🎮',
    trending: true,
    articleCount: 15
  },
  {
    id: 'tech',
    name: 'Tech & Kultur',
    description: 'Teknologi der påvirker kultur og samfund',
    icon: '💻',
    trending: true,
    articleCount: 21
  },
  {
    id: 'entertainment',
    name: 'Entertainment',
    description: 'Film, serier og streaming',
    icon: '🎬',
    trending: true,
    articleCount: 10
  },
  {
    id: 'music',
    name: 'Musik',
    description: 'Musik, koncerter og festivals',
    icon: '🎵',
    trending: true,
    articleCount: 1
  },
  {
    id: 'culture',
    name: 'Kultur',
    description: 'Kultur, kunst og samfund',
    icon: '🎨'
  },
  {
    id: 'lifestyle',
    name: 'Lifestyle',
    description: 'Livsstil og trends',
    icon: '✨'
  },
  {
    id: 'news',
    name: 'Nyheder',
    description: 'Aktuelle nyheder og debat',
    icon: '📰',
    trending: true,
    articleCount: 2
  }
];

export default function CategorySelection({ onSelectCategory, onSelectTrendingCategory }: CategorySelectionProps) {
  const [trendingCategories, setTrendingCategories] = useState<Category[]>([]);
  const [trendingTemplates, setTrendingTemplates] = useState<any[]>([]);
  const [isLoadingTrending, setIsLoadingTrending] = useState(true);

  useEffect(() => {
    const fetchTrendingCategories = async () => {
      try {
        const response = await fetch('/api/trending');
        if (response.ok) {
          const data = await response.json();
          if (data.trends?.topTopics && data.trendingTemplates) {
            // Update categories with trending data
            const updatedCategories = categories.map(cat => {
              const trendingData = data.trends.topTopics.find((topic: any) => 
                topic.topic.toLowerCase() === cat.name.toLowerCase() ||
                (cat.name === 'Tech & Kultur' && topic.topic === 'Tech') ||
                (cat.name === 'Entertainment' && topic.topic === 'Entertainment')
              );
              
              if (trendingData) {
                return {
                  ...cat,
                  trending: true,
                  articleCount: trendingData.count
                };
              }
              return cat;
            });

            setTrendingCategories(updatedCategories.filter(cat => cat.trending));
            setTrendingTemplates(data.trendingTemplates);
            setIsLoadingTrending(false);
          }
        }
      } catch (error) {
        console.error('Error fetching trending categories:', error);
        setIsLoadingTrending(false);
      }
    };

    fetchTrendingCategories();
  }, []);

  const handleTrendingCategoryClick = (category: Category) => {
    // Find the corresponding trending template
    const trendingTemplate = trendingTemplates.find(template => 
      template.category.toLowerCase() === category.name.toLowerCase() ||
      (category.name === 'Tech & Kultur' && template.category === 'Tech')
    );

    if (trendingTemplate && trendingTemplate.articles && onSelectTrendingCategory) {
      // Go directly to article selection
      onSelectTrendingCategory(category, trendingTemplate.articles);
    } else {
      // Fallback to regular category selection
      onSelectCategory(category);
    }
  };

  if (isLoadingTrending) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <div className="px-3 py-1.5 text-white/50 text-xs font-medium rounded-lg border border-orange-500/50 bg-orange-900/20 animate-pulse">
            🔥 Loading trending...
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="px-3 py-1.5 text-white/50 text-xs font-medium rounded-lg border border-white/20 bg-black animate-pulse">
            Loading categories...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Trending Categories */}
      {trendingCategories.length > 0 && (
        <div>
          <h4 className="text-white text-sm font-medium mb-2 flex items-center gap-2">
            🔥 Trending Nu
            <span className="text-xs text-white/60">
              (baseret på {trendingCategories.reduce((sum, cat) => sum + (cat.articleCount || 0), 0)} artikler)
            </span>
          </h4>
          <div className="flex flex-wrap gap-2">
            {trendingCategories.map((category) => (
              <button
                key={category.id}
                onClick={() => handleTrendingCategoryClick(category)}
                className="px-3 py-1.5 text-white text-xs font-medium rounded-lg transition-colors duration-200 border border-orange-500/50"
                style={{ backgroundColor: 'rgb(30, 20, 0)' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgb(40, 30, 0)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgb(30, 20, 0)'}
                title={`${category.description} - Baseret på ${category.articleCount} artikler`}
              >
                {category.icon} {category.name}
                <span className="ml-1 text-orange-400 text-xs">({category.articleCount})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* All Categories */}
      <div>
        <h4 className="text-white text-sm font-medium mb-2">📝 Alle Kategorier</h4>
        <div className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => onSelectCategory(category)}
              className="px-3 py-1.5 text-white text-xs font-medium rounded-lg transition-colors duration-200 border border-white/20"
              style={{ backgroundColor: 'rgb(0, 0, 0)' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgb(20, 20, 20)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgb(0, 0, 0)'}
              title={category.description}
            >
              {category.icon} {category.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
