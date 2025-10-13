'use client';

import { useState, useEffect } from 'react';
import { WebflowArticleFields } from '@/lib/webflow-service';

interface WebflowPublishPanelProps {
  articleData: any;
  onPublish: (articleData: WebflowArticleFields) => Promise<void>;
  onClose: () => void;
  embed?: boolean; // when true, render inline (no overlay/modal shell)
}

export default function WebflowPublishPanel({ articleData, onPublish, onClose, embed }: WebflowPublishPanelProps) {
  const [fieldMeta, setFieldMeta] = useState<any[]>([]);
  const [guidance, setGuidance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [optInTraining, setOptInTraining] = useState(true);
  const [preflightRunning, setPreflightRunning] = useState(false);
  const [preflightWarnings, setPreflightWarnings] = useState<string[]>([]);
  const [moderation, setModeration] = useState<any | null>(null);
  const [criticTips, setCriticTips] = useState<string>('');
  const [factResults, setFactResults] = useState<any[] | null>(null);
  const [formData, setFormData] = useState<WebflowArticleFields>({
    id: '',
    title: articleData.title || '',
    slug: '',
    subtitle: articleData.subtitle || '',
    content: articleData.content || '',
    excerpt: '',
    category: articleData.category || '',
    tags: articleData.tags || [],
    author: articleData.author || '',
    rating: articleData.rating || 0,
    featuredImage: '',
    gallery: [],
    publishDate: new Date().toISOString(),
    status: 'draft',
    seoTitle: '',
    seoDescription: '',
    readTime: 0,
    wordCount: 0,
    featured: false,
    trending: false,
  });

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
      if (warnings.length>0) {
        alert('Preflight fandt forhold, der bør håndteres før udgivelse. Se “Preflight resultater” nederst.');
        setPublishing(false);
        return;
      }

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
        <div className="p-6 border-b border-white/10">
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

      <div className={`p-6 space-y-6 ${embed ? 'pt-0' : ''}`}>
          {/* Compact list-style fields (no boxes) */}
          <div className="space-y-2 text-white/80 text-sm">
            <div className="flex items-start gap-2"><span className="text-white/50 w-28">Titel</span><span className="flex-1">{formData.title || '—'}</span></div>
            <div className="flex items-start gap-2"><span className="text-white/50 w-28">Slug</span><span className="flex-1">{formData.slug || '—'}</span></div>
            <div className="flex items-start gap-2"><span className="text-white/50 w-28">Undertitel</span><span className="flex-1">{formData.subtitle || '—'}</span></div>
            <div className="flex items-start gap-2"><span className="text-white/50 w-28">Kategori</span><span className="flex-1">{formData.category || '—'}</span></div>
            <div className="flex items-start gap-2"><span className="text-white/50 w-28">Indhold</span><span className="flex-1 whitespace-pre-wrap">{formData.content || '—'}</span></div>
            <div className="flex items-start gap-2"><span className="text-white/50 w-28">Uddrag</span><span className="flex-1 whitespace-pre-wrap">{formData.excerpt || '—'}</span></div>
            <div className="flex items-start gap-2"><span className="text-white/50 w-28">Tags</span><span className="flex-1">{formData.tags.join(', ') || '—'}</span></div>
            <div className="flex items-start gap-2"><span className="text-white/50 w-28">SEO Titel</span><span className="flex-1">{formData.seoTitle || '—'}</span></div>
            <div className="flex items-start gap-2"><span className="text-white/50 w-28">SEO Beskrivelse</span><span className="flex-1 whitespace-pre-wrap">{formData.seoDescription || '—'}</span></div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <div className="text-white text-2xl font-bold">{formData.wordCount}</div>
              <div className="text-white/60 text-sm">Ord</div>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <div className="text-white text-2xl font-bold">{formData.readTime}</div>
              <div className="text-white/60 text-sm">Min læsetid</div>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <div className="text-white text-2xl font-bold">{formData.tags.length}</div>
              <div className="text-white/60 text-sm">Tags</div>
            </div>
          </div>
        </div>

        {/* Guidance Panel removed per UX: chat handles missing field prompts */}

        {/* Actions */}
        <div className={`p-6 border-t border-white/10 flex justify-end gap-3 ${embed ? 'pt-3 pb-0' : ''}`}>
          <label className="mr-auto flex items-center gap-2 text-white/70">
            <input
              type="checkbox"
              checked={optInTraining}
              onChange={(e)=>setOptInTraining(e.target.checked)}
              className="w-4 h-4 text-blue-600 bg-black border-white/20 rounded focus:ring-blue-500"
            />
            <span className="text-sm">Del til træning (forbedrer Apropos‑modellen)</span>
          </label>
          <button
            onClick={onClose}
            className="px-4 py-2 text-white/60 hover:text-white transition-colors"
          >
            Annuller
          </button>
          <button
            onClick={handlePublish}
            disabled={publishing || !formData.title || !formData.content}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {publishing && (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            )}
            {publishing ? 'Udgiver...' : 'Udgiv til Webflow'}
          </button>
        </div>

        {/* Preflight Results */}
        {(preflightRunning || preflightWarnings.length>0 || criticTips || (factResults&&factResults.length)) && (
          <div className={`px-6 pb-6 ${embed ? 'pt-0' : ''}`}>
            <div className="mt-4 p-3 bg-white/5 rounded-lg border border-white/10">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-white font-medium">Preflight resultater</h4>
                {preflightRunning && <span className="text-white/70 text-xs">Kører…</span>}
              </div>
              {preflightWarnings.length>0 && (
                <ul className="list-disc list-inside text-amber-300 text-sm mb-2">
                  {preflightWarnings.map((w,i)=>(<li key={i}>{w}</li>))}
                </ul>
              )}
              {moderation && (
                <div className="text-white/70 text-xs mb-2">Lighed: {(moderation.metrics?.maxSim||0).toFixed(3)} • Risiko: {moderation.metrics?.plagiarismRisk||'n/a'} • Ord: {moderation.metrics?.wordCount||0}</div>
              )}
              {criticTips && (
                <div className="text-white/80 text-sm whitespace-pre-wrap mb-2">{criticTips}</div>
              )}
              {factResults && factResults.length>0 && (
                <div className="text-white/70 text-xs">Fakta: {factResults.filter((x:any)=>x.status==='true').length} verificeret, {factResults.filter((x:any)=>x.status!=='true').length} ukendte</div>
              )}
            </div>
          </div>
        )}
      
    </>
  );

  if (embed) {
    return (
      <div className="bg-[#171717] border border-white/10 rounded-xl">
        <PanelInner />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-black border border-white/20 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <PanelInner />
      </div>
    </div>
  );
}
