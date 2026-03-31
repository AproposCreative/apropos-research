'use client';
import React, { useEffect, useState } from 'react';
import { useMedia } from '../lib/media-context';
import { useAuth } from '@/lib/auth-context';

interface AddMediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (source: any) => void;
}

export default function AddMediaModal({ isOpen, onClose, onSuccess }: AddMediaModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onEsc);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onEsc);
    };
  }, [isOpen, onClose]);

  const { user } = useAuth();
  const { refreshArticleCounts } = useMedia();
  const [formData, setFormData] = useState({
    name: '',
    baseUrl: '',
    sitemapIndex: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isAutoFilling, setIsAutoFilling] = useState(false); // Track if auto-fill is running
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

      const result = await response.json();
      
      console.log('Validation result:', result); // Debug logging
      
      // Handle nested response structure
      const data = result.data || result;
      
      setValidationResults({
        sitemapAccessible: data.sitemapAccessible || false,
        hasArticles: data.hasArticles || false,
        articleCount: data.articleCount || 0,
        isValidating: false,
        warning: data.warning
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

  // Validate when form data changes (but not while auto-fill is running)
  React.useEffect(() => {
    // Don't auto-validate while auto-fill is running
    if (isAutoFilling) return;
    
    const timeoutId = setTimeout(() => {
      validateMediaSource();
    }, 1000); // Debounce validation

    return () => clearTimeout(timeoutId);
  }, [formData.baseUrl, formData.sitemapIndex, isAutoFilling]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/media-sources', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(user ? { 'x-user-id': user.uid } : {}),
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Fejl ved tilføjelse af mediekilde');
      }

      // Close modal immediately and show success
      // API returns: { success: true, data: { source: {...}, message: "..." } }
      // Pass the entire result object to onSuccess
      onSuccess(result);
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
            ✅ ${result.data?.source?.name || result.source?.name || 'Mediekilde'} tilføjet!<br>
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

      // Run ingest in background (don't await it) - only for the new source
      const newSourceId = result.data?.source?.id || result.source?.id;
      console.log('Starting background ingest for new media source...', { sourceId: newSourceId });
      fetch('/api/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source: newSourceId,
          sinceHours: 168, // 1 week of articles for new sources
          limit: 500 // Higher limit for new sources to get more articles
        }),
      })
      .then(async (ingestResponse) => {
        if (ingestResponse.ok || ingestResponse.status === 202) {
          console.log('Background ingest started successfully');
          
          // Wait a bit for ingest to complete (give it 30 seconds)
          await new Promise(resolve => setTimeout(resolve, 30000));
          
          // Refresh article counts in sidebar
          refreshArticleCounts();
          
          // Invalidate cache and reload page to show new articles
          try {
            await fetch('/api/invalidate-cache', { method: 'POST' });
            // Reload page to show new articles
            window.location.reload();
          } catch (reloadError) {
            console.warn('Failed to reload page:', reloadError);
            // Show completion notification as fallback
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
                  <small style="opacity: 0.9;">Genindlæs siden for at se artiklerne</small>
                </div>
              `;
              document.body.appendChild(notification);
              
              setTimeout(() => {
                if (notification.parentNode) {
                  notification.parentNode.removeChild(notification);
                }
              }, 5000);
            }
          }
        } else {
          console.warn('Background ingest failed');
          const errorText = await ingestResponse.text().catch(() => 'Unknown error');
          console.error('Ingest error:', errorText);
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
    
    // Prevent multiple simultaneous auto-fill operations
    if (isAutoFilling) return;
    
    setIsLoading(true);
    setIsAutoFilling(true); // Set flag to prevent useEffect from interfering
    setValidationResults({
      sitemapAccessible: false,
      hasArticles: false,
      articleCount: 0,
      isValidating: true
    });

    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second total timeout

    try {
      // Prioritized list of sitemap and feed paths to try (most common first)
      const commonSitemaps = [
        // Most common sitemaps first
        '/sitemap.xml',
        '/sitemap_index.xml',
        '/sitemap',
        '/sitemaps/sitemap.xml',
        '/sitemaps/sitemap_index.xml',
        
        // RSS feeds
        '/feed.xml',
        '/rss.xml',
        '/feeds/all.rss',
        '/feeds/all.xml',
        
        // WordPress specific
        '/wp-sitemap.xml',
        '/feed/',
        '/rss/',
        
        // Other common patterns
        '/sitemap-index.xml',
        '/sitemaps/sitemap-index.xml',
        '/atom.xml',
        
        // Less common - only test if nothing found above
        '/sitemaps.xml',
        '/sitemap.txt',
        '/feeds/artikler/',
        '/feeds/feed.xml',
        '/feeds/rss.xml',
        '/feeds/main.rss',
        '/feeds/main.xml',
        '/feeds/news.rss',
        '/feeds/news.xml',
        '/feeds/latest.rss',
        '/feeds/latest.xml',
        '/wp-sitemap-posts-post-1.xml',
        '/wp-sitemap-posts-page-1.xml',
        '/wp-sitemap-categories-1.xml',
        '/wp-sitemap-tags-1.xml',
        '/sitemap_news.xml',
        '/sitemaps/sitemap_news.xml',
        '/news-sitemap.xml',
        '/sitemaps/news-sitemap.xml',
        '/feeds/atom.xml',
        '/feeds/atom/',
      ];

      let bestSitemap = null;
      let bestScore = 0;
      let foundAny = false;
      let testedCount = 0;
      const maxTests = 20; // Limit to first 20 to avoid long waits

      // Test each potential sitemap using server-side validation with timeout
      for (const sitemapPath of commonSitemaps.slice(0, maxTests)) {
        // Stop if we found a good sitemap with high score
        if (bestSitemap && bestScore > 50) {
          break;
        }

        testedCount++;
        
        try {
          // Use server-side validation with timeout
          const response = await fetch('/api/validate-media-source', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              baseUrl: formData.baseUrl,
              sitemapIndex: sitemapPath
            }),
            signal: AbortSignal.timeout(8000), // 8 second timeout per request
          });

          if (response.ok) {
            const data = await response.json();
            
            // Handle nested response structure
            const result = data.data || data;
            
            if (result.sitemapAccessible && result.hasArticles) {
              foundAny = true;
              let score = 0;
              
              // Base score for accessibility and articles
              score += 20; // Base accessibility bonus
              if (result.articleCount > 0) score += Math.min(result.articleCount / 10, 50); // More articles = higher score (capped)
              
              // Content type bonuses
              if (result.contentType && result.contentType.includes('xml')) score += 10;
              if (result.contentType && result.contentType.includes('rss')) score += 8;
              if (result.contentType && result.contentType.includes('atom')) score += 8;
              
              // RSS feed support
              if (result.contentPreview && result.contentPreview.includes('<rss')) score += 15;
              if (result.contentPreview && result.contentPreview.includes('<channel')) score += 10;
              if (result.contentPreview && result.contentPreview.includes('<item')) score += 8;
              
              // Sitemap support
              if (result.contentPreview && result.contentPreview.includes('<urlset')) score += 10;
              if (result.contentPreview && result.contentPreview.includes('<sitemapindex')) score += 15; // Sitemap indexes are often better
              if (result.contentPreview && result.contentPreview.includes('<url>')) score += 5;
              
              // Atom feed support
              if (result.contentPreview && result.contentPreview.includes('<feed')) score += 12;
              if (result.contentPreview && result.contentPreview.includes('<entry')) score += 8;
              
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
              
              // Bonus for high article count
              if (result.articleCount > 100) score += 10;
              if (result.articleCount > 500) score += 15;
              
              if (score > bestScore) {
                bestScore = score;
                bestSitemap = sitemapPath;
              }
            }
          }
        } catch (error) {
          // Continue to next sitemap if timeout or error
          if (error instanceof Error && error.name === 'AbortError') {
            // Timeout - continue to next
            continue;
          }
          // Other errors - continue to next
          continue;
        }
      }

      clearTimeout(timeoutId);

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
          warning: `Ingen fungerende sitemap eller RSS feed fundet efter ${testedCount} forsøg. Prøv at tjekke hjemmesidens robots.txt fil eller kontakt webmasteren.`
        });
      }
    } catch (error) {
      clearTimeout(timeoutId);
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
      setIsAutoFilling(false); // Clear flag to allow normal validation again
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-[#0e0e0e] rounded-t-2xl md:rounded-2xl shadow-2xl border border-white/10 max-w-md w-full mx-0 md:mx-4 h-[92dvh] md:h-auto md:max-h-[90dvh] flex flex-col app-safe-bottom">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-white font-medium text-base">Tilføj ny mediekilde</h2>
          <button onClick={onClose} className="p-1.5 text-white/40 hover:text-white rounded-lg transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5 overflow-y-auto flex-1 no-scrollbar">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <div>
            <label htmlFor="name" className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wider">Medienavn</label>
            <input type="text" id="name" value={formData.name} onChange={(e) => handleInputChange('name', e.target.value)} placeholder="f.eks. Politiken, Information" className="w-full px-3.5 py-2.5 bg-white/[0.06] border border-white/10 rounded-xl text-white text-sm placeholder-white/25 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 transition-all" required />
          </div>

          <div>
            <label htmlFor="baseUrl" className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wider">Hjemmeside URL</label>
            <input type="url" id="baseUrl" value={formData.baseUrl} onChange={(e) => handleInputChange('baseUrl', e.target.value)} placeholder="https://www.example.com" className="w-full px-3.5 py-2.5 bg-white/[0.06] border border-white/10 rounded-xl text-white text-sm placeholder-white/25 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 transition-all" required />
          </div>

          <div>
            <label htmlFor="sitemapIndex" className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wider">Sitemap URL</label>
            <div className="flex gap-2">
              <input type="text" id="sitemapIndex" value={formData.sitemapIndex} onChange={(e) => handleInputChange('sitemapIndex', e.target.value)} placeholder="/sitemap.xml eller /sitemap" className="flex-1 px-3.5 py-2.5 bg-white/[0.06] border border-white/10 rounded-xl text-white text-sm placeholder-white/25 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 transition-all" required />
              <button type="button" onClick={autoFillSitemap} disabled={isAutoFilling || isLoading} className="px-3.5 py-2.5 bg-white/10 text-white/70 rounded-xl hover:bg-white/15 hover:text-white transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">
                {isAutoFilling ? 'Søger...' : 'Auto'}
              </button>
            </div>
            <p className="text-[11px] text-white/30 mt-1.5">Relativ sti til sitemap fra hjemmeside URL</p>
          </div>

          <div className="p-3 bg-white/[0.03] border border-white/[0.06] rounded-xl">
            <h4 className="font-medium text-white/60 text-xs mb-1.5">Sådan finder du sitemap URL&apos;en:</h4>
            <ul className="text-[11px] text-white/40 space-y-0.5">
              <li>&#x2022; Prøv: /sitemap.xml</li>
              <li>&#x2022; Prøv: /sitemap</li>
              <li>&#x2022; Prøv: /sitemap_index.xml</li>
              <li>&#x2022; Tjek robots.txt filen</li>
            </ul>
          </div>

          {validationResults && (
            <div className={`p-3 rounded-xl border ${
              validationResults.isValidating
                ? 'bg-amber-500/10 border-amber-500/20'
                : validationResults.hasArticles
                  ? 'bg-emerald-500/10 border-emerald-500/20'
                  : 'bg-red-500/10 border-red-500/20'
            }`}>
              <h4 className={`font-medium text-sm mb-1.5 ${
                validationResults.isValidating ? 'text-amber-400' : validationResults.hasArticles ? 'text-emerald-400' : 'text-red-400'
              }`}>
                {validationResults.isValidating ? 'Validerer...' : 'Validering:'}
              </h4>
              {validationResults.isValidating ? (
                <div className="flex items-center gap-2 text-amber-400/80 text-sm">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
                  Tester sitemap...
                </div>
              ) : (
                <ul className={`text-sm space-y-1 ${validationResults.hasArticles ? 'text-emerald-400/80' : 'text-red-400/80'}`}>
                  <li className="flex items-center gap-2">
                    {validationResults.sitemapAccessible ? (
                      <svg className="w-3.5 h-3.5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    ) : (
                      <svg className="w-3.5 h-3.5 text-red-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                    )}
                    Sitemap: {validationResults.sitemapAccessible ? 'Tilgængelig' : 'Ikke tilgængelig'}
                  </li>
                  <li className="flex items-center gap-2">
                    {validationResults.hasArticles ? (
                      <svg className="w-3.5 h-3.5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    ) : (
                      <svg className="w-3.5 h-3.5 text-red-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                    )}
                    Artikler: {validationResults.hasArticles ? `${validationResults.articleCount} fundet` : 'Ingen fundet'}
                  </li>
                </ul>
              )}
              {!validationResults.isValidating && !validationResults.hasArticles && !validationResults.warning && (
                <p className="text-xs text-red-400/70 mt-1.5">Sitemap&apos;en er ikke tilgængelig eller indeholder ikke gyldig XML.</p>
              )}
              {validationResults.warning && (
                <p className="text-xs text-amber-400/70 mt-1.5">{validationResults.warning}</p>
              )}
            </div>
          )}

          <div className="sticky bottom-0 bg-[#0e0e0e] pt-3 pb-1 flex gap-2.5">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 bg-white/[0.06] text-white/60 rounded-xl hover:bg-white/10 hover:text-white/80 transition-colors text-sm font-medium">
              Annuller
            </button>
            <button type="submit" disabled={isLoading || (validationResults !== null && !validationResults.hasArticles)} className="flex-1 px-4 py-2.5 bg-white text-black rounded-xl hover:bg-white/90 disabled:bg-white/10 disabled:text-white/30 disabled:cursor-not-allowed transition-colors text-sm font-medium flex items-center justify-center gap-2">
              {isLoading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
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
