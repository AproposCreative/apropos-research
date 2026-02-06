'use client';

import { PageData } from '@/lib/crawler/types';
import { Copy, ExternalLink } from 'lucide-react';
import { useState } from 'react';

interface PreviewPanelProps {
  pageData: PageData | null;
  selectedUrl: string | null;
}

export function PreviewPanel({ pageData, selectedUrl }: PreviewPanelProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!pageData?.text) return;

    try {
      await navigator.clipboard.writeText(pageData.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  if (!selectedUrl) {
    return (
      <div className="text-sm text-gray-500 py-8 text-center">
        Select a URL to preview extracted text
      </div>
    );
  }

  if (!pageData) {
    return (
      <div className="text-sm text-gray-500 py-8 text-center">
        Loading...
      </div>
    );
  }

  if (pageData.status === 'failed') {
    return (
      <div className="space-y-4">
        <div className="text-sm text-red-400">
          Failed to crawl: {pageData.error || 'Unknown error'}
        </div>
        <div className="text-xs text-gray-500">
          URL: <span className="text-gray-400">{pageData.url}</span>
        </div>
      </div>
    );
  }

  if (pageData.status === 'crawling') {
    return (
      <div className="text-sm text-gray-500 py-8 text-center">
        Crawling...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="border-b border-gray-800/50 pb-4">
        <div className="flex items-start justify-between gap-4 mb-2">
          <h3 className="text-lg font-medium text-white line-clamp-2">
            {pageData.title || 'Untitled'}
          </h3>
          <button
            onClick={handleCopy}
            className="flex-shrink-0 p-2 hover:bg-gray-900/50 rounded transition-colors"
            title="Copy text"
          >
            <Copy className={`w-4 h-4 ${copied ? 'text-green-400' : 'text-gray-400'}`} />
          </button>
        </div>

        {pageData.metaDescription && (
          <p className="text-sm text-gray-400 mb-3">{pageData.metaDescription}</p>
        )}

        <a
          href={pageData.finalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
        >
          <span className="truncate">{pageData.finalUrl}</span>
          <ExternalLink className="w-3 h-3 flex-shrink-0" />
        </a>
      </div>

      {/* Text content */}
      <div className="whitespace-pre-wrap text-sm text-gray-300 leading-relaxed max-h-[600px] overflow-y-auto">
        {pageData.text || 'No content extracted.'}
      </div>

      {copied && (
        <div className="fixed bottom-4 right-4 bg-green-900/90 text-white px-4 py-2 rounded text-sm shadow-lg">
          Copied to clipboard
        </div>
      )}
    </div>
  );
}
