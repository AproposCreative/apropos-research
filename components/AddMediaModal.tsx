'use client';
import React, { useState } from 'react';
import { useMedia } from '../lib/media-context';

interface AddMediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (source: any) => void;
}

export default function AddMediaModal({ isOpen, onClose, onSuccess }: AddMediaModalProps) {
  const { refreshArticleCounts } = useMedia();
  const [formData, setFormData] = useState({
    name: '',
    baseUrl: '',
    sitemapIndex: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [validationResults, setValidationResults] = useState<{
    sitemapAccessible: boolean;
    hasArticles: boolean;
    articleCount: number;
    isValidating: boolean;
    warning?: string;
    urlAnalysis?: {
      totalUrls: number;
      articleCount: number;
      tagCount: number;
      sampleUrls: string[];
    };
  } | null>(null);

  const validateMediaSource = async () => {
    if (!formData.baseUrl || !formData.sitemapIndex) {
      setValidationResults(null);
      return;
    }

    // Show loading state
    setValidationResults({
      sitemapAccessible: false,
      hasArticles: false,
      articleCount: 0,
      isValidating: true
    });

    try {
      // Use server-side validation to avoid CORS issues
      const response = await fetch('/api/validate-media-source', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          baseUrl: formData.baseUrl,
          sitemapIndex: formData.sitemapIndex
        }),
      });

      const data = await response.json();
      
      console.log('Validation result:', data); // Debug logging
      
      setValidationResults({
        sitemapAccessible: data.sitemapAccessible,
        hasArticles: data.hasArticles,
        articleCount: data.articleCount || 0,
        isValidating: false
      });
    } catch (error) {
      setValidationResults({
        sitemapAccessible: false,
        hasArticles: false,
        articleCount: 0,
        isValidating: false
      });
    }
  };

  // Validate when form data changes
  React.useEffect(() => {
    const timeoutId = setTimeout(() => {
      validateMediaSource();
    }, 1000); // Debounce validation

    return () => clearTimeout(timeoutId);
  }, [formData.baseUrl, formData.sitemapIndex]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/media-sources', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Fejl ved tilføjelse af mediekilde');
      }

      // Close modal immediately and show success
      onSuccess(result.source);
      setFormData({ name: '', baseUrl: '', sitemapIndex: '' });
      onClose();

      // Show notification that articles are being fetched
      if (typeof window !== 'undefined') {
        // Create a simple notification
        const notification = document.createElement('div');
        notification.innerHTML = `
          <div style="
            position: fixed;
            top: 20px;
            right: 20px;
            background: #10b981;
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 1000;
            font-family: system-ui, -apple-system, sans-serif;
            font-size: 14px;
            max-width: 300px;
          ">
            ✅ ${result.source.name} tilføjet!<br>
            <small style="opacity: 0.9;">Henter artikler i baggrunden...</small>
          </div>
        `;
        document.body.appendChild(notification);
        
        // Remove notification after 4 seconds
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
        }, 4000);
      }

      // Run ingest in background (don't await it)
      console.log('Starting background ingest for new media source...');
      fetch('/api/refresh', {
        method: 'POST',
      })
      .then(ingestResponse => {
        if (ingestResponse.ok) {
          console.log('Background ingest completed successfully');
          // Refresh article counts in sidebar
          refreshArticleCounts();
          
          // Show completion notification
          if (typeof window !== 'undefined') {
            const notification = document.createElement('div');
            notification.innerHTML = `
              <div style="
                position: fixed;
                top: 20px;
                right: 20px;
                background: #059669;
                color: white;
                padding: 12px 20px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                z-index: 1000;
                font-family: system-ui, -apple-system, sans-serif;
                font-size: 14px;
                max-width: 300px;
              ">
                🎉 Artikler hentet!<br>
                <small style="opacity: 0.9;">${result.source.name} er klar til brug</small>
              </div>
            `;
            document.body.appendChild(notification);
            
            setTimeout(() => {
              if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
              }
            }, 3000);
          }
        } else {
          console.warn('Background ingest failed');
        }
      })
      .catch(ingestError => {
        console.warn('Background ingest error:', ingestError);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'En fejl opstod');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError('');
  };

  const autoFillSitemap = async () => {
    if (!formData.baseUrl) return;
    
    setIsLoading(true);
    setValidationResults({
      sitemapAccessible: false,
      hasArticles: false,
      articleCount: 0,
      isValidating: true
    });

    try {
      // Comprehensive list of sitemap and feed paths to try
      const commonSitemaps = [
        // Standard sitemaps
        '/sitemap.xml',
        '/sitemaps/sitemap.xml',
        '/sitemap_index.xml',
        '/sitemaps/sitemap_index.xml',
        '/sitemap',
        '/sitemaps.xml',
        '/sitemap-index.xml',
        '/sitemaps/sitemap-index.xml',
        '/sitemap.txt',
        '/sitemaps/sitemap.txt',
        
        // RSS feeds
        '/feed.xml',
        '/rss.xml',
        '/feeds/all.rss',
        '/feeds/all.xml',
        '/feeds/artikler/',
        '/feeds/feed.xml',
        '/feeds/rss.xml',
        '/feeds/main.rss',
        '/feeds/main.xml',
        '/feeds/news.rss',
        '/feeds/news.xml',
        '/feeds/latest.rss',
        '/feeds/latest.xml',
        
        // WordPress specific
        '/wp-sitemap.xml',
        '/wp-sitemap-posts-post-1.xml',
        '/wp-sitemap-posts-page-1.xml',
        '/wp-sitemap-categories-1.xml',
        '/wp-sitemap-tags-1.xml',
        '/feed/',
        '/rss/',
        
        // Other common patterns
        '/sitemap_index.xml',
        '/sitemaps/sitemap_index.xml',
        '/sitemap-index.xml',
        '/sitemaps/sitemap-index.xml',
        '/sitemap_news.xml',
        '/sitemaps/sitemap_news.xml',
        '/news-sitemap.xml',
        '/sitemaps/news-sitemap.xml',
        
        // Atom feeds
        '/atom.xml',
        '/feeds/atom.xml',
        '/feeds/atom/',
        
        // Robots.txt (to extract sitemap URLs)
        '/robots.txt'
      ];

      let bestSitemap = null;
      let bestScore = 0;
      let foundAny = false;

      // Test each potential sitemap using server-side validation
      for (const sitemapPath of commonSitemaps) {
        try {
          // Use server-side validation to avoid CORS issues
          const response = await fetch('/api/validate-media-source', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              baseUrl: formData.baseUrl,
              sitemapIndex: sitemapPath
            }),
          });

          if (response.ok) {
            const data = await response.json();
            
            if (data.sitemapAccessible && data.hasArticles) {
              foundAny = true;
              let score = 0;
              
              // Base score for accessibility and articles
              score += 20; // Base accessibility bonus
              if (data.articleCount > 0) score += Math.min(data.articleCount, 50); // More articles = higher score (capped)
              
              // Content type bonuses
              if (data.contentType && data.contentType.includes('xml')) score += 10;
              if (data.contentType && data.contentType.includes('rss')) score += 8;
              if (data.contentType && data.contentType.includes('atom')) score += 8;
              
              // RSS feed support
              if (data.contentPreview && data.contentPreview.includes('<rss')) score += 15;
              if (data.contentPreview && data.contentPreview.includes('<channel')) score += 10;
              if (data.contentPreview && data.contentPreview.includes('<item')) score += 8;
              
              // Sitemap support
              if (data.contentPreview && data.contentPreview.includes('<urlset')) score += 10;
              if (data.contentPreview && data.contentPreview.includes('<sitemapindex')) score += 15; // Sitemap indexes are often better
              if (data.contentPreview && data.contentPreview.includes('<url>')) score += 5;
              
              // Atom feed support
              if (data.contentPreview && data.contentPreview.includes('<feed')) score += 12;
              if (data.contentPreview && data.contentPreview.includes('<entry')) score += 8;
              
              // Path-specific bonuses (prioritize better organized sources)
              if (sitemapPath === '/sitemaps/sitemap_index.xml') score += 10; // Best organized
              if (sitemapPath === '/sitemaps/sitemap.xml') score += 8; // Well organized
              if (sitemapPath === '/sitemap_index.xml') score += 6;
              if (sitemapPath === '/sitemap.xml') score += 5;
              if (sitemapPath === '/feed.xml') score += 7; // RSS feeds are often better
              if (sitemapPath === '/rss.xml') score += 6;
              if (sitemapPath === '/feeds/artikler/') score += 8; // Specific article feeds
              if (sitemapPath === '/feeds/all.rss') score += 7;
              if (sitemapPath === '/feeds/all.xml') score += 7;
              if (sitemapPath === '/atom.xml') score += 6;
              if (sitemapPath === '/wp-sitemap.xml') score += 4; // WordPress
              if (sitemapPath === '/feed/') score += 5;
              if (sitemapPath === '/rss/') score += 4;
              
              // Penalty for robots.txt (we want actual sitemaps, not just robots.txt)
              if (sitemapPath === '/robots.txt') score -= 10;
              
              // Bonus for high article count
              if (data.articleCount > 100) score += 10;
              if (data.articleCount > 500) score += 15;
              
              if (score > bestScore) {
                bestScore = score;
                bestSitemap = sitemapPath;
              }
            }
          }
        } catch (error) {
          // Continue to next sitemap
          continue;
        }
      }

      // Set the best sitemap found
      if (bestSitemap) {
        setFormData(prev => ({ ...prev, sitemapIndex: bestSitemap }));
        
        // Validate the chosen sitemap
        setTimeout(() => {
          validateMediaSource();
        }, 500);
      } else if (foundAny) {
        // Found sitemaps but none had articles
        setValidationResults({
          sitemapAccessible: true,
          hasArticles: false,
          articleCount: 0,
          isValidating: false,
          warning: 'Sitemap fundet, men ingen artikler blev fundet. Dette kan skyldes at sitemap\'en kun indeholder tag-sider eller metadata.'
        });
      } else {
        // No sitemaps found at all
        setValidationResults({
          sitemapAccessible: false,
          hasArticles: false,
          articleCount: 0,
          isValidating: false,
          warning: 'Ingen fungerende sitemap eller RSS feed fundet. Prøv at tjekke hjemmesidens robots.txt fil eller kontakt webmasteren.'
        });
      }
    } catch (error) {
      console.error('Auto-fill error:', error);
      setValidationResults({
        sitemapAccessible: false,
        hasArticles: false,
        articleCount: 0,
        isValidating: false,
        warning: 'Fejl ved automatisk søgning. Prøv manuelt at indtaste sitemap-stien.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
            Tilføj ny mediekilde
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Error Message */}
          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
              <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
            </div>
          )}

          {/* Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Medienavn
            </label>
            <input
              type="text"
              id="name"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              placeholder="f.eks. Politiken, Information"
              className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
              required
            />
          </div>

          {/* Base URL */}
          <div>
            <label htmlFor="baseUrl" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Hjemmeside URL
            </label>
            <input
              type="url"
              id="baseUrl"
              value={formData.baseUrl}
              onChange={(e) => handleInputChange('baseUrl', e.target.value)}
              placeholder="https://www.example.com"
              className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
              required
            />
          </div>

          {/* Sitemap Index */}
          <div>
            <label htmlFor="sitemapIndex" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Sitemap URL
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                id="sitemapIndex"
                value={formData.sitemapIndex}
                onChange={(e) => handleInputChange('sitemapIndex', e.target.value)}
                placeholder="/sitemap.xml eller /sitemap"
                className="flex-1 px-4 py-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                required
              />
              <button
                type="button"
                onClick={autoFillSitemap}
                className="px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors text-sm font-medium"
              >
                Auto
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              Relativ sti til sitemap fra hjemmeside URL
            </p>
          </div>

          {/* Info Box */}
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
            <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
              Sådan finder du sitemap URL'en:
            </h4>
            <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
              <li>• Prøv: /sitemap.xml</li>
              <li>• Prøv: /sitemap</li>
              <li>• Prøv: /sitemap_index.xml</li>
              <li>• Tjek robots.txt filen</li>
            </ul>
          </div>

          {/* Validation Results */}
          {validationResults && (
            <div className={`p-4 rounded-xl border ${
              validationResults.isValidating
                ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                : validationResults.hasArticles 
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' 
                  : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
            }`}>
              <h4 className={`font-medium mb-2 ${
                validationResults.isValidating
                  ? 'text-yellow-900 dark:text-yellow-100'
                  : validationResults.hasArticles 
                    ? 'text-green-900 dark:text-green-100' 
                    : 'text-red-900 dark:text-red-100'
              }`}>
                {validationResults.isValidating ? 'Validerer...' : 'Validering Resultat:'}
              </h4>
              {validationResults.isValidating ? (
                <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-300">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Tester sitemap tilgængelighed...
                </div>
              ) : (
                <ul className={`text-sm space-y-1 ${
                  validationResults.hasArticles 
                    ? 'text-green-700 dark:text-green-300' 
                    : 'text-red-700 dark:text-red-300'
                }`}>
                  <li className="flex items-center gap-2">
                    {validationResults.sitemapAccessible ? (
                      <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    )}
                    Sitemap tilgængelig: {validationResults.sitemapAccessible ? 'Ja' : 'Nej'}
                  </li>
                  <li className="flex items-center gap-2">
                    {validationResults.hasArticles ? (
                      <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    )}
                    Kan hente artikler: {validationResults.hasArticles ? 'Ja' : 'Nej'}
                  </li>
                  {validationResults.hasArticles && validationResults.articleCount > 0 && (
                    <li className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      {validationResults.articleCount} artikler fundet
                    </li>
                  )}
                </ul>
              )}
              {!validationResults.isValidating && !validationResults.hasArticles && !validationResults.warning && (
                <p className="text-sm text-red-600 dark:text-red-400 mt-2">
                  ⚠️ Denne mediekilde kan ikke bruges, da sitemap'en ikke er tilgængelig eller ikke indeholder gyldig XML.
                </p>
              )}
              {validationResults.warning && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4 mt-4">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium">
                        {validationResults.warning}
                      </p>
                      {validationResults.urlAnalysis && (
                        <div className="mt-2 text-xs text-yellow-700 dark:text-yellow-300">
                          <p>Analyseret: {validationResults.urlAnalysis.totalUrls} URLs</p>
                          <p>Artikler: {validationResults.urlAnalysis.articleCount}, Tag-sider: {validationResults.urlAnalysis.tagCount}</p>
                          {validationResults.urlAnalysis.sampleUrls.length > 0 && (
                            <div className="mt-1">
                              <p>Eksempler på fundne URLs:</p>
                              <ul className="list-disc list-inside ml-2">
                                {validationResults.urlAnalysis.sampleUrls.slice(0, 3).map((url, index) => (
                                  <li key={index} className="truncate">{url}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors font-medium"
            >
              Annuller
            </button>
            <button
              type="submit"
              disabled={isLoading || (validationResults && !validationResults.hasArticles)}
              className="flex-1 px-4 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-slate-400 disabled:cursor-not-allowed text-white rounded-xl transition-colors font-medium flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Tilføjer...
                </>
              ) : (
                'Tilføj mediekilde'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
