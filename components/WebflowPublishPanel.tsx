'use client';

import { useState, useEffect } from 'react';
import { WebflowArticleFields } from '@/lib/webflow-service';

interface WebflowPublishPanelProps {
  articleData: any;
  onPublish: (articleData: WebflowArticleFields) => Promise<void>;
  onClose: () => void;
}

export default function WebflowPublishPanel({ articleData, onPublish, onClose }: WebflowPublishPanelProps) {
  const [fieldMeta, setFieldMeta] = useState<any[]>([]);
  const [guidance, setGuidance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [optInTraining, setOptInTraining] = useState(true);
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

  if (loading) {
    return (
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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-black border border-white/20 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center justify-between">
            <h2 className="text-white text-xl font-medium">Udgiv artikel til Webflow</h2>
            <button
              onClick={onClose}
              className="text-white/60 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Basic Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-white text-sm font-medium mb-2">Titel *</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                className="w-full px-3 py-2 bg-black border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-white/40"
                placeholder="Artikel titel"
              />
            </div>

            <div>
              <label className="block text-white text-sm font-medium mb-2">Slug</label>
              <input
                type="text"
                value={formData.slug}
                onChange={(e) => handleInputChange('slug', e.target.value)}
                className="w-full px-3 py-2 bg-black border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-white/40"
                placeholder="artikel-slug"
              />
            </div>

            <div>
              <label className="block text-white text-sm font-medium mb-2">Undertitel</label>
              <input
                type="text"
                value={formData.subtitle}
                onChange={(e) => handleInputChange('subtitle', e.target.value)}
                className="w-full px-3 py-2 bg-black border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-white/40"
                placeholder="Artikel undertitel"
              />
            </div>

            <div>
              <label className="block text-white text-sm font-medium mb-2">Kategori</label>
              <select
                value={formData.category}
                onChange={(e) => handleInputChange('category', e.target.value)}
                className="w-full px-3 py-2 bg-black border border-white/20 rounded-lg text-white focus:outline-none focus:border-white/40"
              >
                <option value="">Vælg kategori</option>
                <option value="Gaming">Gaming</option>
                <option value="Kultur">Kultur</option>
                <option value="Tech">Tech</option>
                <option value="Musik">Musik</option>
                <option value="Film">Film</option>
              </select>
            </div>
          </div>

          {/* Content */}
          <div>
            <label className="block text-white text-sm font-medium mb-2">Indhold *</label>
            <textarea
              value={formData.content}
              onChange={(e) => handleInputChange('content', e.target.value)}
              rows={8}
              className="w-full px-3 py-2 bg-black border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-white/40"
              placeholder="Artikel indhold..."
            />
          </div>

          {/* Excerpt */}
          <div>
            <label className="block text-white text-sm font-medium mb-2">Uddrag</label>
            <textarea
              value={formData.excerpt}
              onChange={(e) => handleInputChange('excerpt', e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-black border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-white/40"
              placeholder="Kort beskrivelse af artiklen..."
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-white text-sm font-medium mb-2">Tags (komma-separeret)</label>
            <input
              type="text"
              value={formData.tags.join(', ')}
              onChange={(e) => handleTagsChange(e.target.value)}
              className="w-full px-3 py-2 bg-black border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-white/40"
              placeholder="tag1, tag2, tag3"
            />
          </div>

          {/* SEO Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-white text-sm font-medium mb-2">SEO Titel</label>
              <input
                type="text"
                value={formData.seoTitle}
                onChange={(e) => handleInputChange('seoTitle', e.target.value)}
                className="w-full px-3 py-2 bg-black border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-white/40"
                placeholder="SEO optimeret titel"
              />
            </div>

            <div>
              <label className="block text-white text-sm font-medium mb-2">SEO Beskrivelse</label>
              <textarea
                value={formData.seoDescription}
                onChange={(e) => handleInputChange('seoDescription', e.target.value)}
                rows={2}
                className="w-full px-3 py-2 bg-black border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-white/40"
                placeholder="SEO beskrivelse (max 160 tegn)"
              />
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
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

          {/* Options */}
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.featured}
                onChange={(e) => handleInputChange('featured', e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-black border-white/20 rounded focus:ring-blue-500"
              />
              <span className="text-white">Featured artikel</span>
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.trending}
                onChange={(e) => handleInputChange('trending', e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-black border-white/20 rounded focus:ring-blue-500"
              />
              <span className="text-white">Trending</span>
            </label>

            <div>
              <label className="block text-white text-sm font-medium mb-1">Status</label>
              <select
                value={formData.status}
                onChange={(e) => handleInputChange('status', e.target.value)}
                className="px-3 py-1 bg-black border border-white/20 rounded text-white text-sm focus:outline-none focus:border-white/40"
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
        </div>

        {/* Guidance Panel */}
        {guidance.length>0 && (
          <div className="mt-4 p-3 bg-white/5 rounded-lg border border-white/10">
            <h4 className="text-white font-medium mb-2">Anbefalinger</h4>
            <ul className="space-y-1 list-disc list-inside text-white/80 text-sm">
              {guidance.slice(0,6).map((g:any)=> (
                <li key={g.slug}><span className="font-mono text-white/90">{g.slug}</span>: {g.tip}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Actions */}
        <div className="p-6 border-t border-white/10 flex justify-end gap-3">
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
      </div>
    </div>
  );
}
