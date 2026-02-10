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
  const [imageSkipIndex, setImageSkipIndex] = useState(0); // Track which image index to use
  const [tovExpanded, setTovExpanded] = useState(false);
  
  // Debug: Log when featuredImage changes
  useEffect(() => {
    if (articleData?.featuredImage) {
      console.log('📸 FeaturedImage updated:', {
        hasImage: !!articleData.featuredImage,
        imageType: articleData.featuredImage.startsWith('data:') ? 'base64' : 'url',
        imagePreview: articleData.featuredImage.substring(0, 100),
        fullImage: articleData.featuredImage
      });
    } else {
      console.log('📸 No featuredImage in articleData');
    }
  }, [articleData?.featuredImage]);
  
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
  
  // Extract intro and body from content
  // Intro is the part that starts with "Intro:" (case-insensitive) followed by text until first double newline or paragraph break
  const extractIntroAndBody = (text: string) => {
    if (!text) return { intro: '', body: '' };
    
    // Check if content starts with "Intro:" (case-insensitive)
    // Use a more robust approach: find where intro ends without relying on problematic lookahead
    const introStartMatch = text.match(/^intro\s*:\s*/i);
    
    if (introStartMatch) {
      // Find where intro ends: look for double newline OR single newline followed by capital letter
      const afterIntroPrefix = text.substring(introStartMatch[0].length);
      
      // Find end of intro: double newline is definitive boundary
      const doubleNewlineIndex = afterIntroPrefix.indexOf('\n\n');
      
      // Find alternative boundary: single newline followed by capital letter (but not if it's just continuation)
      let singleNewlineCapitalIndex = -1;
      const lines = afterIntroPrefix.split('\n');
      
      // Check subsequent lines (skip first line which is intro text)
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        // Check if line starts with capital letter and is substantial (not just continuation)
        if (line.trim() && /^[A-ZÆØÅ]/.test(line.trim()) && line.trim().length > 3) {
          // Found boundary - intro ends before this line
          // Calculate position: join all lines up to (but not including) this line
          const linesBefore = lines.slice(0, i);
          singleNewlineCapitalIndex = linesBefore.join('\n').length;
          // If we found a boundary, we need to account for the newline before the capital letter line
          // The boundary is at the end of the previous line, so we're already correct
          break;
        }
      }
      
      // Determine actual end position
      let introEndIndex = afterIntroPrefix.length; // Default: intro is the whole text
      
      // Prefer double newline boundary (more definitive)
      if (doubleNewlineIndex !== -1) {
        introEndIndex = doubleNewlineIndex;
      } else if (singleNewlineCapitalIndex !== -1) {
        introEndIndex = singleNewlineCapitalIndex;
      }
      
      // Extract intro text (everything after "Intro:" prefix until end marker)
      const introText = afterIntroPrefix.substring(0, introEndIndex).trim();
      
      // Extract body text (everything after intro section)
      const bodyStartIndex = introStartMatch[0].length + introEndIndex;
      const bodyText = text.substring(bodyStartIndex).trim();
      
      return { intro: introText, body: bodyText };
    }
    
    // If articleData.intro exists separately, use it
    if (articleData?.intro && typeof articleData.intro === 'string') {
      const introText = articleData.intro.replace(/^intro\s*:\s*/i, '').trim();
      
      // Check if intro appears in content - if so, remove it; otherwise use full content as body
      const introInContent = text.toLowerCase().includes(introText.toLowerCase());
      
      if (introInContent) {
        // Try to find and remove intro section from content
        const introStartMatch = text.match(/^intro\s*:\s*/i);
        if (introStartMatch) {
          // Use same logic as above to find where intro ends
          const afterIntroPrefix = text.substring(introStartMatch[0].length);
          const doubleNewlineIndex = afterIntroPrefix.indexOf('\n\n');
          let introEndIndex = afterIntroPrefix.length;
          
          if (doubleNewlineIndex !== -1) {
            introEndIndex = doubleNewlineIndex;
          } else {
            // Try to find capital letter boundary
            const lines = afterIntroPrefix.split('\n');
            
            for (let i = 1; i < lines.length; i++) {
              const line = lines[i];
              if (line.trim() && /^[A-ZÆØÅ]/.test(line.trim()) && line.trim().length > 3) {
                // Found boundary - intro ends before this line
                const linesBefore = lines.slice(0, i);
                introEndIndex = linesBefore.join('\n').length;
                break;
              }
            }
          }
          
          const bodyStartIndex = introStartMatch[0].length + introEndIndex;
          const bodyText = text.substring(bodyStartIndex).trim();
          return { intro: introText, body: bodyText };
        }
      }
      
      // Intro not found in content format, use original text as body
      return { intro: introText, body: text };
    }
    
    // No intro found, return content as body
    return { intro: '', body: text };
  };

  const { intro, body } = extractIntroAndBody(content);

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

  // Use combined content (intro + body) for paragraphs, but remove "Intro:" label
  const contentForDisplay = intro && body ? `${intro}\n\n${body}` : (intro || body || content);
  const paragraphs = contentForDisplay
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean);
  

  // Calculate word count and reading time from combined content (intro + body) (only if it's real content, not placeholder)
  const isPlaceholder = content === 'Her vil artikelindholdet blive vist, når du begynder at skrive i chatten.';
  const combinedContent = intro && body ? `${intro} ${body}` : (intro || body || content);
  const wordCount = (combinedContent && !isPlaceholder) ? combinedContent.trim().split(/\s+/).filter(Boolean).length : 0;
  const readTime = wordCount ? Math.ceil(wordCount / 200) : 0;
  
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
        {/* Vis ikke undertitel hvis den er identisk med intro – intro vises kun i Intro-kassen */}
        {(() => {
          const sub = (subtitle || '').trim();
          const isDuplicateIntro = intro && (sub.startsWith('Intro:') || sub.startsWith('Intro :') || sub === intro || sub === `Intro: ${intro}`.trim() || intro.startsWith(sub) || sub.startsWith(intro));
          return <p className="text-white/70 text-base leading-relaxed">{isDuplicateIntro ? 'Undertitel' : (subtitle || 'Undertitel')}</p>;
        })()}
      </header>

      {(intro || body) && (
        <section className="space-y-3">
          {intro && (
            <div className="bg-white/5 border border-white/10 rounded-lg p-2">
              <div className="text-white/50 mb-1 text-xs">Intro</div>
              <div className="text-white/80 text-sm whitespace-pre-wrap">{intro}</div>
            </div>
          )}
          {body && (
            <div className="bg-white/5 border border-white/10 rounded-lg p-2">
              <div className="text-white/50 mb-1 text-xs">Body</div>
              <div className="text-white/80 text-sm whitespace-pre-wrap">{body}</div>
            </div>
          )}
        </section>
      )}

      <section className="grid grid-cols-2 gap-3 text-xs">
        <Field k="Name (Titel)" v={title || '—'} />
        {has('subtitle','sub-title') && <Field k="Undertitel" v={subtitle || '—'} />}
        {has('author') && <Field k="Author" v={author} />}
        {has('section','category') && <Field k="Section" v={category} />}
        {has('topic','topics') && <Field k="Topic" v={topic} />}
        <Field k="Sources" v={articleData?.inspirationSource || '—'} />
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
            <div className="text-white/80 text-sm whitespace-pre-wrap">
              {(() => {
                const prompt = aiDraft.prompt;
                // Safety: remove duplicate TOV block for old drafts (SetupWizard now stores only short tone)
                const tovMarkers = ['LIV BRANDT — PROMPT', 'FREDERIK EMIL — PROMPT', 'EVA LINDE — PROMPT'];
                for (const marker of tovMarkers) {
                  const first = prompt.indexOf(marker);
                  const second = prompt.indexOf(marker, first + marker.length);
                  if (first > -1 && second > -1) return prompt.substring(0, second).trim();
                }
                return prompt;
              })()}
            </div>
          </div>
        )}
        {(articleData?.author || articleData?.authorTOV || aiDraft?.prompt) && (
          <div className="col-span-2">
            <button
              type="button"
              onClick={() => setTovExpanded((e) => !e)}
              className="w-full text-left bg-white/5 border border-white/10 rounded-lg p-2 hover:bg-white/10 transition-colors"
            >
              <div className="text-white/50">Tone of voice</div>
              <div className="text-white/80 truncate" title={articleData?.author || '—'}>
                {articleData?.author || '—'}
              </div>
              {tovExpanded && (articleData?.authorTOV || aiDraft?.prompt) && (
                <div className="mt-2 pt-2 border-t border-white/10 text-white/80 text-sm whitespace-pre-wrap">
                  {articleData?.authorTOV?.trim() || (typeof aiDraft?.prompt === 'string' ? aiDraft.prompt.trim() : '')}
                </div>
              )}
              <div className="text-white/40 text-xs mt-1">
                {tovExpanded ? 'Klik for at skjule fuld TOV' : 'Klik for at vise fuld TOV'}
              </div>
            </button>
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
                  onError={(e) => {
                    console.error('❌ Image failed to load:', articleData.featuredImage);
                    console.error('❌ Image error details:', e);
                    // Show error message to user
                    alert('Billedet kunne ikke indlæses. Prøv at generere et nyt billede.');
                  }}
                  onLoad={() => {
                    console.log('✅ Image loaded successfully:', articleData.featuredImage?.substring(0, 100));
                  }}
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
                    
                    // Increment skipIndex to get a different image
                    const nextSkipIndex = imageSkipIndex + 1;
                    setImageSkipIndex(nextSkipIndex);
                    
                    const requestData = {
                      title: title || 'Artikel',
                      topic: extractedTopic,
                      author: author || 'Redaktionen',
                      category: category || 'Kultur',
                      section: articleData?.section,
                      platform: articleData?.platform || articleData?.streaming_service,
                      streaming_service: articleData?.streaming_service,
                      content: content || '',
                      rating: articleData?.rating || 0,
                      skipIndex: nextSkipIndex // Pass skipIndex to get different images
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
                        console.log('✅ New image generated successfully, updating article data', { prompt: data.prompt?.substring(0, 100) });
                        if (onUpdateArticle) {
                          onUpdateArticle({ featuredImage: data.imageUrl, lastGeneratedImagePrompt: data.prompt });
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
                className={`px-3 py-3 rounded-lg backdrop-blur-md bg-white/10 border border-white/20 transition-all duration-200 flex items-center justify-center relative overflow-hidden hover:bg-white/20 hover:border-white/30 ${
                  isGeneratingImage 
                    ? 'animate-pulse' 
                    : ''
                }`}
                title="Hent et andet billede"
              >
                {isGeneratingImage && (
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-600/20 animate-pulse"></div>
                )}
                {isGeneratingImage ? (
                  <span className="relative z-10 animate-spin">⏳</span>
                ) : (
                  <svg className="w-5 h-5 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
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
              {articleData?.lastGeneratedImagePrompt && (
                <details className="mt-2 text-left">
                  <summary className="text-white/50 text-xs cursor-pointer hover:text-white/70">Vis brugt prompt</summary>
                  <pre className="mt-1 p-2 rounded bg-white/5 border border-white/10 text-white/60 text-[10px] whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                    {articleData.lastGeneratedImagePrompt}
                  </pre>
                </details>
              )}
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
                    
                    // Increment skipIndex to get a different image
                    const nextSkipIndex = imageSkipIndex + 1;
                    setImageSkipIndex(nextSkipIndex);
                    
                    const requestData = {
                      title: title || 'Artikel',
                      topic: extractedTopic,
                      author: author || 'Redaktionen',
                      category: category || 'Kultur',
                      section: articleData?.section,
                      platform: articleData?.platform || articleData?.streaming_service,
                      streaming_service: articleData?.streaming_service,
                      content: content || '',
                      rating: articleData?.rating || 0,
                      skipIndex: nextSkipIndex // Pass skipIndex to get different images
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
                        console.log('✅ Image generated successfully, updating article data', { prompt: data.prompt?.substring(0, 100) });
                        if (onUpdateArticle) {
                          onUpdateArticle({ featuredImage: data.imageUrl, lastGeneratedImagePrompt: data.prompt });
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
                {isGeneratingImage ? (
                  <span className="relative z-10 animate-spin">⏳</span>
                ) : (
                  <svg className="w-5 h-5 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
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
