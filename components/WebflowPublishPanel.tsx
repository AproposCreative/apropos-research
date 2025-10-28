'use client';

import { useState, useEffect } from 'react';
import { WebflowArticleFields } from '@/lib/webflow-service';

interface WebflowPublishPanelProps {
  articleData: any;
  onPublish: (articleData: WebflowArticleFields) => Promise<void>;
  onClose: () => void;
  embed?: boolean; // when true, render inline (no overlay/modal shell)
  onPreflightComplete?: (warnings: string[], criticTips: string, factResults: any[], moderation: any) => void;
  onRecommendationsApplied?: () => void;
}

export default function WebflowPublishPanel({ articleData, onPublish, onClose, embed, onPreflightComplete, onRecommendationsApplied }: WebflowPublishPanelProps) {
  const [fieldMeta, setFieldMeta] = useState<any[]>([]);
  const [guidance, setGuidance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [optInTraining, setOptInTraining] = useState(true); // Always enabled
  const [preflightRunning, setPreflightRunning] = useState(false);
  const [preflightWarnings, setPreflightWarnings] = useState<string[]>([]);
  const [moderation, setModeration] = useState<any | null>(null);
  const [criticTips, setCriticTips] = useState<string>('');
  const [factResults, setFactResults] = useState<any[] | null>(null);
  const [recommendationsApplied, setRecommendationsApplied] = useState(false);
  const [formData, setFormData] = useState<WebflowArticleFields>({
    id: '',
    webflowId: articleData.webflowId || '',
    title: articleData.title || '',
    slug: articleData.slug || '',
    subtitle: articleData.subtitle || '',
    content: articleData.content || '',
    excerpt: articleData.excerpt || '',
    category: articleData.category || '',
    tags: articleData.tags || [],
    author: articleData.author || '',
    rating: articleData.rating || 0,
    featuredImage: articleData.featuredImage || '',
    gallery: articleData.gallery || [],
    publishDate: new Date().toISOString(),
    status: 'draft',
    seoTitle: articleData.seoTitle || '',
    seoDescription: articleData.seoDescription || '',
    readTime: articleData.readTime || 0,
    wordCount: articleData.wordCount || 0,
    featured: articleData.featured || false,
    trending: articleData.trending || false,
    // Include SetupWizard data
    topicsSelected: articleData.topicsSelected || [],
    streaming_service: articleData.streaming_service || articleData.platform || '',
    platform: articleData.platform || articleData.streaming_service || '',
  });

  // Update formData when articleData changes
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      webflowId: articleData.webflowId || prev.webflowId,
      title: articleData.title || prev.title,
      slug: articleData.slug || prev.slug,
      subtitle: articleData.subtitle || prev.subtitle,
      content: articleData.content || prev.content,
      excerpt: articleData.excerpt || prev.excerpt,
      category: articleData.category || prev.category,
      tags: articleData.tags || prev.tags,
      author: articleData.author || prev.author,
      rating: articleData.rating || prev.rating,
      featuredImage: articleData.featuredImage || prev.featuredImage,
      gallery: articleData.gallery || prev.gallery,
      seoTitle: articleData.seoTitle || prev.seoTitle,
      seoDescription: articleData.seoDescription || prev.seoDescription,
      readTime: articleData.readTime || prev.readTime,
      wordCount: articleData.wordCount || prev.wordCount,
      // Include SetupWizard data
      topicsSelected: articleData.topicsSelected || prev.topicsSelected,
      streaming_service: articleData.streaming_service || articleData.platform || prev.streaming_service,
      platform: articleData.platform || articleData.streaming_service || prev.platform,
      featured: articleData.featured !== undefined ? articleData.featured : prev.featured,
      trending: articleData.trending !== undefined ? articleData.trending : prev.trending,
    }));
  }, [articleData]);

  // Listen for recommendations being applied
  useEffect(() => {
    const checkRecommendationsApplied = () => {
      try {
        const savedData = localStorage.getItem('ai-writer-autosave');
        if (savedData) {
          const parsed = JSON.parse(savedData);
          // Check if there's a recent message about applying recommendations
          if (parsed.messages && Array.isArray(parsed.messages)) {
            const lastMessage = parsed.messages[parsed.messages.length - 1];
            if (lastMessage && lastMessage.content && 
                (lastMessage.content.includes('Anvend disse Preflight anbefalinger') ||
                 lastMessage.content.includes('KRITISK: Fix disse problemer') ||
                 lastMessage.content.includes('Anvend disse forbedringer'))) {
              setRecommendationsApplied(true);
              console.log('✅ Recommendations marked as applied');
            }
          }
        }
      } catch (error) {
        console.error('Error checking recommendations applied:', error);
      }
    };

    // Check immediately
    checkRecommendationsApplied();
    
    // Poll for changes
    const intervalId = setInterval(checkRecommendationsApplied, 2000);
    
    return () => clearInterval(intervalId);
  }, []);

  // Keep formData in sync when articleData prop changes (so fields don't show "—")
  useEffect(() => {
    try {
      const deriveContent = () => {
        let c = articleData?.content || articleData?.['post-body'] || '';
        if (!c && Array.isArray(articleData?._chatMessages)) {
          const assistants = (articleData._chatMessages as any[]).filter(m => m.role === 'assistant');
          const last = assistants[assistants.length - 1]?.content as string | undefined;
          if (last) c = last;
        }
        return c || '';
      };
      const content = deriveContent();
      const wc = content ? content.trim().split(/\s+/).filter(Boolean).length : 0;
      const rt = wc ? Math.ceil(wc / 200) : 0;
      setFormData(prev => ({
        ...prev,
        title: articleData.title || prev.title || '',
        subtitle: articleData.subtitle || prev.subtitle || '',
        content,
        category: articleData.category || articleData.section || prev.category || '',
        tags: Array.isArray(articleData.tags) ? articleData.tags : (Array.isArray(prev.tags) ? prev.tags : []),
        author: articleData.author || prev.author || '',
        rating: typeof articleData.rating === 'number' ? articleData.rating : (prev.rating||0),
        seoTitle: articleData.seoTitle || prev.seoTitle || articleData.title || prev.title || '',
        seoDescription: articleData.seoDescription || prev.seoDescription || (content ? content.substring(0, 160) : ''),
        wordCount: wc,
        readTime: rt,
      }));
    } catch {}
  }, [articleData]);

  useEffect(() => {
    fetchFields();
    generateSlug();
    calculateStats();
  }, [formData.title, formData.content]);

  const fetchFields = async () => {
    try {
      const response = await fetch('/api/webflow/article-fields');
      const data = await response.json();
      if (data.fields) setFieldMeta(data.fields);
      const g = await fetch('/api/webflow/analysis');
      if (g.ok) {
        const gj = await g.json();
        setGuidance(gj.guidance || []);
      }
    } catch (error) {
      console.error('Error fetching Webflow fields:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateSlug = () => {
    if (formData.title && !formData.slug) {
      const slug = formData.title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .trim();
      setFormData(prev => ({ ...prev, slug }));
    }
  };

  const calculateStats = () => {
    const wordCount = formData.content ? formData.content.split(' ').length : 0;
    const readTime = Math.ceil(wordCount / 200);
    setFormData(prev => ({ 
      ...prev, 
      wordCount, 
      readTime,
      seoTitle: prev.seoTitle || prev.title,
      seoDescription: prev.seoDescription || prev.excerpt || prev.content.substring(0, 160)
    }));
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleTagsChange = (value: string) => {
    const tags = value.split(',').map(tag => tag.trim()).filter(tag => tag);
    setFormData(prev => ({ ...prev, tags }));
  };

  const handlePublish = async () => {
    setPublishing(true);
    try {
      // Minimal required-field validation based on Webflow metadata
      const required = fieldMeta.filter((f:any)=>f.required).map((f:any)=>f.slug);
      const missing: string[] = [];
      const data: any = formData;
      required.forEach((slug:string)=>{
        // Map our form keys to webflow slugs when they differ
        const map: Record<string,string> = {
          'name': 'title',
          'post-body': 'content',
        };
        const key = map[slug] || slug;
        if (data[key] === undefined || data[key] === '' || (Array.isArray(data[key]) && data[key].length===0)) {
          missing.push(slug);
        }
      });
      if (missing.length>0) {
        alert('Manglende felter: ' + missing.join(', '));
        setPublishing(false);
        return;
      }
      // Preflight checks (plagiat/fakta/TOV)
      setPreflightRunning(true);
      const warnings: string[] = [];
      try {
        const modRes = await fetch('/api/moderation/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: formData.title, content: formData.content })
        }).then(r=>r.ok?r.json():null);
        if (modRes) {
          setModeration(modRes);
          if (modRes.metrics?.plagiarismRisk === 'high') warnings.push('Høj lighed med eksisterende tekst. Omskriv før publicering.');
          if (modRes.metrics?.plagiarismRisk === 'medium') warnings.push('Middel lighed — anbefalet omskrivning/variation.');
          if ((modRes.metrics?.wordCount||0) < 600) warnings.push('Artiklen er meget kort. Øg længde eller tilpas format.');
        }
      } catch {}
      try {
        const tipsRes = await fetch('/api/critic/tov', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: formData.content, author: articleData.author })
        }).then(r=>r.ok?r.json():null);
        if (tipsRes?.tips) setCriticTips(tipsRes.tips);
      } catch {}
      try {
        const claims = extractClaims(formData.content).slice(0, 12);
        if (claims.length) {
          const fcRes = await fetch('/api/factcheck', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ claims })
          }).then(r=>r.ok?r.json():null);
          if (fcRes?.results) {
            setFactResults(fcRes.results);
            const unknown = fcRes.results.filter((x:any)=>x.status!=='true');
            if (unknown.length>0) warnings.push('Nogle påstande er ikke verificeret. Overvej at tilføje kilder eller omformulere.');
          }
        }
      } catch {}
      setPreflightWarnings(warnings);
      setPreflightRunning(false);
      
      // Send Preflight results to chat
      if (onPreflightComplete) {
        onPreflightComplete(warnings, criticTips, factResults || [], moderation);
      }
      
      // Preflight recommendations are now auto-applied in chat, so we don't block publishing

      await onPublish(formData);
      // After successful publish, optionally send training sample
      if (optInTraining) {
        try {
          const me = (await fetch('/api/auth/me').then(r=>r.ok?r.json():null)) || {};
          const userId = me?.user?.uid || me?.uid || 'anonymous';
          await fetch('/api/training/optin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId,
              authorName: articleData.author,
              authorTOV: articleData.authorTOV,
              articleData: formData,
              messages: (articleData._chatMessages || []).map((m:any)=>({ role: m.role, content: m.content, timestamp: m.timestamp })),
              notes: articleData.notes,
              published: true
            })
          });
        } catch (e) {
          console.warn('Training opt-in save failed', e);
        }
      }
    } catch (error) {
      console.error('Publish error:', error);
      alert('Fejl ved udgivelse af artikel');
    } finally {
      setPublishing(false);
    }
  };

  function extractClaims(text: string): string[] {
    const sentences = (text||'').split(/(?<=[.!?])\s+/).map(s=>s.trim()).filter(Boolean);
    const claims: string[] = [];
    for (const s of sentences) {
      const hasNum = /\d{2,}/.test(s);
      const hasNameLike = /[A-ZÆØÅ][a-zæøå]+\s+[A-ZÆØÅ][a-zæøå]+/.test(s);
      const hasQuote = /".+"|\'.+\'|“.+”/.test(s);
      if (hasNum || hasNameLike || hasQuote) claims.push(s);
      if (claims.length>=24) break;
    }
    return claims;
  }

  if (loading) {
    return embed ? (
      <div className="p-3">
        <div className="flex items-center gap-3 text-white/80 text-sm">
          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
          <span>Indlæser Webflow felter...</span>
        </div>
      </div>
    ) : (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-black border border-white/20 rounded-lg p-6">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            <span className="text-white">Indlæser Webflow felter...</span>
          </div>
        </div>
      </div>
    );
  }

  const PanelInner = () => (
    <>
      {!embed && (
        <div className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-white text-xl font-medium">Udgiv artikel til Webflow</h2>
            <button onClick={onClose} className="text-white/60 hover:text-white transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}


        {/* Guidance Panel removed per UX: chat handles missing field prompts */}

        {/* Simple Sticky Publish Button */}
        <div className="fixed bottom-0 left-0 right-0 z-50">
          <div className="max-w-7xl mx-auto px-6 py-6">
            <div className="flex justify-end">
              <button
                onClick={handlePublish}
                disabled={publishing || !formData.title || !formData.content}
                className="px-6 py-2 bg-gradient-to-r from-slate-600 to-slate-700 text-white rounded-lg hover:from-slate-700 hover:to-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-300 shadow-lg flex items-center gap-3 font-medium text-sm"
              >
                {publishing && (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                )}
                {publishing ? 'Udgiver...' : 'Publish to Webflow'}
              </button>
            </div>
          </div>
        </div>

      
    </>
  );

  if (embed) {
    return <PanelInner />;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-black border border-white/20 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <PanelInner />
      </div>
    </div>
  );
}
