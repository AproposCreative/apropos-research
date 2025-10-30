'use client';

import { useEffect, useState } from 'react';
import WebflowPublishPanel from './WebflowPublishPanel';
import type { WebflowArticleFields } from '@/lib/webflow-service';

interface ReviewPanelProps {
  articleData: any;
  onClose?: () => void;
  frameless?: boolean; // when true, caller provides outer container/style
  onPreflightComplete?: (warnings: string[], criticTips: string, factResults: any[], moderation: any) => void;
  onRecommendationsApplied?: () => void;
  onUpdateArticle?: (updates: any) => void;
}

export default function ReviewPanel({ articleData, onClose, frameless, onPreflightComplete, onRecommendationsApplied, onUpdateArticle }: ReviewPanelProps) {
  const [wfSlugs, setWfSlugs] = useState<string[] | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [imageProgress, setImageProgress] = useState(0);
  
  
  const title = articleData?.title || articleData?.previewTitle || 'Arbejdstitel (ikke sat)';
  const subtitle = articleData?.subtitle || '';
  const author = articleData?.author || '—';
  const category = articleData?.category || articleData?.section || '—';
  const topic = (articleData?.tags || [])[1] || articleData?.topic || '';
  const rating = articleData?.rating || 0;
  const starBox = rating > 0 ? `${'★'.repeat(Math.min(6, rating))}${'☆'.repeat(Math.max(0, 6 - Math.min(6, rating)))} (${rating}/6)` : '';
  // Fallbacks: use content, post-body, or last assistant reply from _chatMessages
  let content: string = articleData?.content || articleData?.['post-body'] || '';
  if (!content && Array.isArray(articleData?._chatMessages)) {
    const assistants = (articleData._chatMessages as any[]).filter(m => m.role === 'assistant');
    const last = assistants[assistants.length - 1]?.content as string | undefined;
    if (last) content = last;
  }
  if (!content) content = 'Her vil artikelindholdet blive vist, når du begynder at skrive i chatten.';

  const seoTitle = articleData?.seo_title || articleData?.seoTitle || '';
  const seoDescription = articleData?.meta_description || articleData?.seoDescription || '';
  const slug = articleData?.slug || '';
  const platform = articleData?.platform || articleData?.streaming_service || '';
  const reflection = articleData?.reflection || '';
  const aiDraft = articleData?.aiDraft;

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/webflow/article-fields');
        if (res.ok) {
          const j = await res.json();
          const slugs = Array.isArray(j?.fields) ? j.fields.map((f: any) => f.slug).filter(Boolean) : [];
          setWfSlugs(slugs);
        }
      } catch {}
    })();
  }, []);

  const paragraphs = content
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean);
  

  // Calculate word count and reading time from content (only if it's real content, not placeholder)
  const isPlaceholder = content === 'Her vil artikelindholdet blive vist, når du begynder at skrive i chatten.';
  const wordCount = (content && !isPlaceholder) ? content.trim().split(/\s+/).filter(Boolean).length : 0;
  const readTime = wordCount ? Math.ceil(wordCount / 200) : 0;
  
  // Debug logging
  console.log('🔍 ReviewPanel word count debug:', {
    contentLength: content.length,
    wordCount,
    isPlaceholder,
    contentPreview: content.substring(0, 100) + '...'
  });

  const has = (...aliases: string[]) => {
    if (!wfSlugs || wfSlugs.length === 0) return true; // optimistic until loaded
    const set = new Set(wfSlugs.map((s) => String(s).toLowerCase()));
    return aliases.some((a) => set.has(a.toLowerCase()));
  };

  const Body = (
    <div className="text-white space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-sm text-white/50">Article preview</div>
        {onClose && (
          <button onClick={onClose} className="text-white/60 hover:text-white text-xs">Luk</button>
        )}
      </div>

      <header className="space-y-3">
        <h1 className="text-2xl font-semibold leading-tight">{title}</h1>
        <p className="text-white/70 text-base leading-relaxed">{subtitle || 'Undertitel'}</p>
      </header>

      <section className="space-y-3 text-sm leading-6 text-white/85">
        {paragraphs.length
          ? paragraphs.map((p, i) => (<p key={i}>{p}</p>))
          : <p className="text-white/50">Din artikeltekst vises her, så snart indholdet er genereret.</p>
        }
      </section>

      <section className="grid grid-cols-2 gap-3 text-xs">
        <Field k="Name (Titel)" v={title || '—'} />
        {has('subtitle','sub-title') && <Field k="Undertitel" v={subtitle || '—'} />}
        {has('author') && <Field k="Author" v={author} />}
        {has('section','category') && <Field k="Section" v={category} />}
        {has('topic','topics') && <Field k="Topic" v={topic} />}
        <Field k="Platform/Service" v={platform || '—'} />
        <Field k="Stjerner" v={starBox || '—'} />
        {has('slug') && <Field k="Slug" v={slug || '—'} />}
        <Field k="Antal ord" v={wordCount > 0 ? wordCount.toString() : '—'} />
        <Field k="Min læsetid" v={readTime > 0 ? readTime.toString() : '—'} />
        <Field k="SEO Titel" v={seoTitle || '—'} />
        <Field k="Meta Beskrivelse" v={seoDescription || '—'} />
        {reflection && (
          <div className="col-span-2">
            <div className="text-white/60 mb-1">Refleksion</div>
            <div className="text-white/80 text-sm whitespace-pre-wrap">{reflection}</div>
          </div>
        )}
        {aiDraft?.prompt && (
          <div className="col-span-2">
            <div className="text-white/60 mb-1">AI Prompt</div>
            <div className="text-white/80 text-sm whitespace-pre-wrap">{aiDraft.prompt}</div>
          </div>
        )}
      </section>

      {/* Image Preview Section */}
      <section className="space-y-4">
        <div className="text-white/60 text-sm font-medium">Artikel Billede</div>
        <div className="bg-white/5 rounded-xl border border-white/10 p-4">
          {articleData?.featuredImage ? (
            <div className="space-y-4">
              <div className="relative group">
                <img 
                  src={articleData.featuredImage} 
                  alt={title || 'Artikel billede'}
                  className="w-full h-48 object-cover rounded-lg border border-white/10"
                />
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-lg flex items-center justify-center">
              <button
                onClick={async () => {
                  if (isGeneratingImage) return;
                  setIsGeneratingImage(true);
                  setImageProgress(0);
                  
                  try {
                    console.log('🎨 Generating new image for article:', title);
                    
                    // Simulate progress steps
                    const progressSteps = [
                      { step: 'Forbereder prompt...', progress: 20 },
                      { step: 'Genererer billede...', progress: 60 },
                      { step: 'Behandler billede...', progress: 90 },
                      { step: 'Færdig!', progress: 100 }
                    ];
                    
                    let currentStep = 0;
                    const progressInterval = setInterval(() => {
                      if (currentStep < progressSteps.length) {
                        setImageProgress(progressSteps[currentStep].progress);
                        currentStep++;
                      }
                    }, 800);
                    
                       // Extract topic from tags or use category
                       const extractedTopic = (articleData?.tags && articleData.tags.length > 0) 
                         ? articleData.tags[0] 
                         : category || 'Generel';
                    
                    const requestData = {
                      title: title || 'Artikel',
                         topic: extractedTopic,
                      author: author || 'Redaktionen',
                      category: category || 'Kultur',
                      content: content || ''
                    };
                    
                    console.log('🎨 Request data:', requestData);
                    
                    const response = await fetch('/api/generate-image', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(requestData)
                    });
                    
                    clearInterval(progressInterval);
                    setImageProgress(100);
                    
                    console.log('🎨 Response status:', response.status);
                    
                    if (response.ok) {
                      const data = await response.json();
                      console.log('🎨 Response data:', data);
                      
                      if (data.success && data.imageUrl) {
                        console.log('✅ New image generated successfully, updating article data');
                        if (onUpdateArticle) {
                          onUpdateArticle({ featuredImage: data.imageUrl });
                        }
                      } else {
                        console.error('❌ Image generation failed:', data.error);
                        alert('Billedgenerering fejlede: ' + (data.error || 'Ukendt fejl'));
                      }
                    } else {
                      const errorData = await response.json().catch(() => ({}));
                      console.error('❌ API error:', response.status, errorData);
                      alert('Billedgenerering fejlede: ' + (errorData.error || 'Server fejl'));
                    }
                  } catch (error) {
                    console.error('❌ Error generating new image:', error);
                    alert('Billedgenerering fejlede: ' + error.message);
                  } finally {
                    setIsGeneratingImage(false);
                    setTimeout(() => setImageProgress(0), 1000);
                  }
                }}
                disabled={isGeneratingImage}
                className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 relative overflow-hidden ${
                  isGeneratingImage 
                    ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/50 animate-pulse' 
                    : 'bg-white/90 text-black hover:bg-white'
                }`}
              >
                {isGeneratingImage && (
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-600/20 animate-pulse"></div>
                )}
                <span className="relative z-10">{isGeneratingImage ? '⏳' : '🎨'}</span>
                <span className="relative z-10">
                  {isGeneratingImage ? `Genererer... ${imageProgress}%` : 'Generer nyt billede'}
                </span>
                {isGeneratingImage && (
                  <div className="absolute bottom-0 left-0 h-1 bg-white/30 w-full">
                    <div 
                      className="h-full bg-gradient-to-r from-blue-400 to-purple-500 transition-all duration-300 ease-out"
                      style={{ width: `${imageProgress}%` }}
                    ></div>
                  </div>
                )}
              </button>
                </div>
              </div>
              <div className="text-white/40 text-xs">
                Apropos Magazine stil • 16:9 format • Genereret med AI
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-white/40 text-4xl mb-4">🖼️</div>
              <div className="text-white/60 text-sm mb-4">Ingen billede genereret endnu</div>
              <button
                onClick={async () => {
                  if (isGeneratingImage) return;
                  setIsGeneratingImage(true);
                  setImageProgress(0);
                  
                  try {
                    console.log('🎨 Generating image for article:', title);
                    
                    // Simulate progress steps
                    const progressSteps = [
                      { step: 'Forbereder prompt...', progress: 20 },
                      { step: 'Genererer billede...', progress: 60 },
                      { step: 'Behandler billede...', progress: 90 },
                      { step: 'Færdig!', progress: 100 }
                    ];
                    
                    let currentStep = 0;
                    const progressInterval = setInterval(() => {
                      if (currentStep < progressSteps.length) {
                        setImageProgress(progressSteps[currentStep].progress);
                        currentStep++;
                      }
                    }, 800);
                    
                       // Extract topic from tags or use category
                       const extractedTopic = (articleData?.tags && articleData.tags.length > 0) 
                         ? articleData.tags[0] 
                         : category || 'Generel';
                    
                    const requestData = {
                      title: title || 'Artikel',
                         topic: extractedTopic,
                      author: author || 'Redaktionen',
                      category: category || 'Kultur',
                      content: content || ''
                    };
                    
                    console.log('🎨 Request data:', requestData);
                    
                    const response = await fetch('/api/generate-image', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(requestData)
                    });
                    
                    clearInterval(progressInterval);
                    setImageProgress(100);
                    
                    console.log('🎨 Response status:', response.status);
                    
                    if (response.ok) {
                      const data = await response.json();
                      console.log('🎨 Response data:', data);
                      
                      if (data.success && data.imageUrl) {
                        console.log('✅ Image generated successfully, updating article data');
                        if (onUpdateArticle) {
                          onUpdateArticle({ featuredImage: data.imageUrl });
                        }
                      } else {
                        console.error('❌ Image generation failed:', data.error);
                        alert('Billedgenerering fejlede: ' + (data.error || 'Ukendt fejl'));
                      }
                    } else {
                      const errorData = await response.json().catch(() => ({}));
                      console.error('❌ API error:', response.status, errorData);
                      alert('Billedgenerering fejlede: ' + (errorData.error || 'Server fejl'));
                    }
                  } catch (error) {
                    console.error('❌ Error generating image:', error);
                    alert('Billedgenerering fejlede: ' + error.message);
                  } finally {
                    setIsGeneratingImage(false);
                    setTimeout(() => setImageProgress(0), 1000);
                  }
                }}
                disabled={isGeneratingImage}
                className={`px-6 py-3 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 mx-auto relative overflow-hidden ${
                  isGeneratingImage 
                    ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/50 animate-pulse' 
                    : 'bg-primary-600 text-white hover:bg-primary-700'
                }`}
              >
                {isGeneratingImage && (
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-600/20 animate-pulse"></div>
                )}
                <span className="relative z-10">{isGeneratingImage ? '⏳' : '🎨'}</span>
                <span className="relative z-10">
                  {isGeneratingImage ? `Genererer... ${imageProgress}%` : 'Generer artikel billede'}
                </span>
                {isGeneratingImage && (
                  <div className="absolute bottom-0 left-0 h-1 bg-white/30 w-full">
                    <div 
                      className="h-full bg-gradient-to-r from-blue-400 to-purple-500 transition-all duration-300 ease-out"
                      style={{ width: `${imageProgress}%` }}
                    ></div>
                  </div>
                )}
              </button>
            </div>
          )}
        </div>
      </section>

      <section>
        <WebflowPublishPanel
          articleData={articleData}
          onPublish={async (formData: WebflowArticleFields) => {
            try {
              const res = await fetch('/api/webflow/publish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
              });
              const j = await res.json().catch(()=>null);
              if (!res.ok) {
                const msg = j?.details || j?.error || 'Udgivelse fejlede';
                
                // Show error message in a styled modal instead of alert
                const modal = document.createElement('div');
                modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[99999] animate-fade-in';
                modal.innerHTML = `
                  <div class="bg-white dark:bg-pure-black backdrop-blur-2xl border border-white/20 dark:border-black-800/50 rounded-2xl shadow-2xl ring-1 ring-white/10 dark:ring-black-800/20 p-8 max-w-md w-[90%] text-center animate-scale-in">
                    <div class="w-16 h-16 bg-gradient-to-br from-red-500 to-red-600 rounded-2xl flex items-center justify-center text-white text-2xl font-bold mx-auto mb-6 shadow-lg animate-bounce-in">
                      ✗
                    </div>
                    <h3 class="text-xl font-semibold text-slate-800 dark:text-black-100 mb-4">Fejl ved udgivelse</h3>
                    <p class="text-slate-600 dark:text-black-400 mb-6">${msg}</p>
                    <button
                      onclick="this.closest('.fixed').remove()"
                      class="group px-8 py-3 bg-red-600 dark:bg-red-500 text-white rounded-xl font-medium hover:bg-red-700 dark:hover:bg-red-400 hover:shadow-lg hover:scale-105 transition-all duration-200 ease-out shadow-md"
                    >
                      <span class="group-hover:scale-110 transition-transform duration-200">❌</span>
                      <span class="ml-2">OK</span>
                    </button>
                  </div>
                `;
                document.body.appendChild(modal);
                
                // Auto-remove after 8 seconds
                setTimeout(() => {
                  if (modal.parentNode) {
                    modal.remove();
                  }
                }, 8000);
                return;
              }
              const isUpdate = formData.webflowId && formData.webflowId !== '';
              const articleTitle = formData.title || 'Artiklen';
              const webflowId = j?.articleId || 'ukendt';
              
              // Create a temporary success modal
              const modal = document.createElement('div');
              modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[99999] animate-fade-in';
              modal.innerHTML = `
                <div class="bg-white dark:bg-pure-black backdrop-blur-2xl border border-white/20 dark:border-black-800/50 rounded-2xl shadow-2xl ring-1 ring-white/10 dark:ring-black-800/20 p-8 max-w-md w-[90%] text-center animate-scale-in">
                  <div class="w-16 h-16 bg-gradient-to-br from-success-500 to-success-600 rounded-2xl flex items-center justify-center text-white text-2xl font-bold mx-auto mb-6 shadow-lg animate-bounce-in">
                    ✓
                  </div>
                  <h3 class="text-xl font-semibold text-slate-800 dark:text-black-100 mb-2">${isUpdate ? 'Opdateret' : 'Sendt til Webflow'}</h3>
                  <p class="text-slate-600 dark:text-black-400 mb-4 text-sm">"${articleTitle}"</p>
                  <p class="text-slate-500 dark:text-black-500 mb-6 text-xs">Status: Draft • ID: ${webflowId}</p>
                  <button
                    onclick="this.closest('.fixed').remove()"
                    class="group px-8 py-3 bg-primary-600 dark:bg-primary-500 text-white rounded-xl font-medium hover:bg-primary-700 dark:hover:bg-primary-400 hover:shadow-lg hover:scale-105 transition-all duration-200 ease-out shadow-md"
                  >
                    <span class="group-hover:scale-110 transition-transform duration-200">🎉</span>
                    <span class="ml-2">OK</span>
                  </button>
                </div>
              `;
              document.body.appendChild(modal);
              
              // Auto-remove after 5 seconds
              setTimeout(() => {
                if (modal.parentNode) {
                  modal.remove();
                }
              }, 5000);
            } catch (e: any) {
              const errorMsg = String(e?.message || e || 'Uventet fejl');
              
              // Show error message in a styled modal instead of alert
              const modal = document.createElement('div');
              modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[99999] animate-fade-in';
              modal.innerHTML = `
                <div class="bg-white dark:bg-pure-black backdrop-blur-2xl border border-white/20 dark:border-black-800/50 rounded-2xl shadow-2xl ring-1 ring-white/10 dark:ring-black-800/20 p-8 max-w-md w-[90%] text-center animate-scale-in">
                  <div class="w-16 h-16 bg-gradient-to-br from-red-500 to-red-600 rounded-2xl flex items-center justify-center text-white text-2xl font-bold mx-auto mb-6 shadow-lg animate-bounce-in">
                    ✗
                  </div>
                  <h3 class="text-xl font-semibold text-slate-800 dark:text-black-100 mb-4">Uventet fejl</h3>
                  <p class="text-slate-600 dark:text-black-400 mb-6">${errorMsg}</p>
                  <button
                    onclick="this.closest('.fixed').remove()"
                    class="group px-8 py-3 bg-red-600 dark:bg-red-500 text-white rounded-xl font-medium hover:bg-red-700 dark:hover:bg-red-400 hover:shadow-lg hover:scale-105 transition-all duration-200 ease-out shadow-md"
                  >
                    <span class="group-hover:scale-110 transition-transform duration-200">❌</span>
                    <span class="ml-2">OK</span>
                  </button>
                </div>
              `;
              document.body.appendChild(modal);
              
              // Auto-remove after 8 seconds
              setTimeout(() => {
                if (modal.parentNode) {
                  modal.remove();
                }
              }, 8000);
            }
          }}
          onClose={() => {}}
          onPreflightComplete={onPreflightComplete}
          onRecommendationsApplied={onRecommendationsApplied}
          embed
        />
      </section>
    </div>
  );

  if (frameless) return Body;

  return (
    <div className="rounded-xl bg-[#171717] text-white p-4 max-h-[420px] overflow-y-auto">
      {Body}
    </div>
  );
}

function Field({ k, v }: { k: string; v?: string }) {
  if (!v) return null;
  return (
    <div className="bg-white/5 border border-white/10 rounded-lg p-2">
      <div className="text-white/50">{k}</div>
      <div className="text-white/80 truncate" title={v}>{v}</div>
    </div>
  );
}

function formattedTags(data: any): string[] {
  const base = Array.isArray(data?.tags) ? data.tags : [];
  const extras = [data?.category, data?.topic].filter(Boolean);
  const unique = Array.from(new Set([...base, ...extras].map((tag:any)=> String(tag).trim()).filter(Boolean)));
  return unique;
}
