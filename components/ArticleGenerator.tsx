'use client';

import { useState } from 'react';
import { generateArticleWithTOV, generateWebflowFields, WebflowArticle } from '@/lib/apropos-ai';

interface ArticleGeneratorProps {
  template: string;
  context: string;
  category: string;
  tags: string[];
  onArticleGenerated: (article: string) => void;
  onWebflowFieldsGenerated: (fields: WebflowArticle) => void;
}

export default function ArticleGenerator({
  template,
  context,
  category,
  tags,
  onArticleGenerated,
  onWebflowFieldsGenerated
}: ArticleGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingWebflow, setIsGeneratingWebflow] = useState(false);
  const [generatedArticle, setGeneratedArticle] = useState<string>('');
  const [webflowFields, setWebflowFields] = useState<WebflowArticle | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState<string>('');

  const handleGenerateArticle = async () => {
    setIsGenerating(true);
    try {
      const article = await generateArticleWithTOV(template, context, category, tags);
      setGeneratedArticle(article);
      onArticleGenerated(article);
    } catch (error) {
      console.error('Error generating article:', error);
      setPublishStatus('Fejl ved generering af artikel');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateWebflowFields = async () => {
    if (!generatedArticle) return;
    
    setIsGeneratingWebflow(true);
    try {
      const fields = await generateWebflowFields(generatedArticle, template);
      setWebflowFields(fields);
      onWebflowFieldsGenerated(fields);
    } catch (error) {
      console.error('Error generating Webflow fields:', error);
      setPublishStatus('Fejl ved generering af Webflow felter');
    } finally {
      setIsGeneratingWebflow(false);
    }
  };

  const handlePublishToWebflow = async () => {
    if (!webflowFields) return;
    
    setIsPublishing(true);
    setPublishStatus('Publiserer til Webflow...');
    
    try {
      const response = await fetch('/api/publish-to-webflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webflowFields)
      });
      
      const result = await response.json();
      
      if (result.success) {
        setPublishStatus('✅ Artikel publiseret til Webflow CMS!');
      } else {
        setPublishStatus(`❌ Fejl: ${result.error}`);
      }
    } catch (error) {
      console.error('Error publishing to Webflow:', error);
      setPublishStatus('❌ Fejl ved publicering');
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="space-y-4 p-4 bg-black border border-white/20 rounded-lg">
      <h3 className="text-white text-lg font-medium">Artikel Generator</h3>
      
      <div className="space-y-3">
        <button
          onClick={handleGenerateArticle}
          disabled={isGenerating}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white py-2 px-4 rounded-lg transition-colors"
        >
          {isGenerating ? 'Genererer artikel...' : 'Generer Artikel med TOV'}
        </button>

        {generatedArticle && (
          <button
            onClick={handleGenerateWebflowFields}
            disabled={isGeneratingWebflow}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white py-2 px-4 rounded-lg transition-colors"
          >
            {isGeneratingWebflow ? 'Genererer Webflow felter...' : 'Generer Webflow CMS Felter'}
          </button>
        )}

        {webflowFields && (
          <button
            onClick={handlePublishToWebflow}
            disabled={isPublishing}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white py-2 px-4 rounded-lg transition-colors"
          >
            {isPublishing ? 'Publiserer...' : 'Publicer til Webflow CMS'}
          </button>
        )}
      </div>

      {publishStatus && (
        <div className="text-sm text-white/80 p-2 bg-white/5 rounded">
          {publishStatus}
        </div>
      )}

      {generatedArticle && (
        <div className="space-y-2">
          <h4 className="text-white font-medium">Genereret Artikel:</h4>
          <div className="text-white/80 text-sm max-h-40 overflow-y-auto bg-white/5 p-3 rounded">
            {generatedArticle.substring(0, 500)}...
          </div>
        </div>
      )}

      {webflowFields && (
        <div className="space-y-2">
          <h4 className="text-white font-medium">Webflow Felter:</h4>
          <div className="text-white/80 text-xs space-y-1">
            <div><strong>Titel:</strong> {webflowFields.title}</div>
            <div><strong>Kategori:</strong> {webflowFields.category}</div>
            <div><strong>Tags:</strong> {webflowFields.tags.join(', ')}</div>
            <div><strong>SEO Title:</strong> {webflowFields.seoTitle}</div>
            <div><strong>Læsetid:</strong> {webflowFields.readingTime} min</div>
            <div><strong>Ord:</strong> {webflowFields.wordCount}</div>
          </div>
        </div>
      )}
    </div>
  );
}
