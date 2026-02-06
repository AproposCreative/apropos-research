'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { URLInput } from './URLInput';
import { AdvancedSettings } from './AdvancedSettings';
import { ProgressBar } from './ProgressBar';
import { URLList } from './URLList';
import { PreviewPanel } from './PreviewPanel';
import { CrawlOptions, CrawlStatus, PageData } from '@/lib/crawler/types';

export function CrawlerUI() {
  const [url, setUrl] = useState('');
  const [crawlId, setCrawlId] = useState<string | null>(null);
  const [status, setStatus] = useState<CrawlStatus | null>(null);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [pageData, setPageData] = useState<PageData | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const isStartingRef = useRef(false);
  const [options, setOptions] = useState<Partial<CrawlOptions>>({
    respectRobotsTxt: true,
    includeSubdomains: false,
    includePdfs: false,
    maxPages: 250,
    concurrency: 3,
    delayMs: 300,
    maxDepth: 6,
    ignorePaths: [],
    stripTrackingParams: true,
  });

  // Poll for status updates
  useEffect(() => {
    if (!crawlId) {
      console.log('[Status Poll] No crawlId, skipping poll');
      return;
    }

    console.log('[Status Poll] Starting status polling for crawlId:', crawlId);
    
    // Add a small delay before first poll to ensure session is created
    const initialDelay = setTimeout(() => {
      const interval = setInterval(async () => {
        try {
          console.log('[Status Poll] Fetching status for crawlId:', crawlId);
          const response = await fetch(`/api/crawl/status?crawlId=${crawlId}`);
          
          if (response.ok) {
            const data = await response.json();
            console.log('[Status Poll] Status received:', data.status, 'pagesFound:', data.pagesFound, 'pagesCrawled:', data.pagesCrawled);
            setStatus(data);

            // If completed or stopped, clear interval
            if (data.status === 'completed' || data.status === 'stopped' || data.status === 'error') {
              console.log('[Status Poll] Crawl finished with status:', data.status);
              clearInterval(interval);
            }
          } else {
            const errorData = await response.json().catch(() => ({}));
            console.warn('[Status Poll] Status fetch failed:', response.status, errorData);
          }
        } catch (error) {
          console.error('[Status Poll] Error fetching status:', error);
        }
      }, 1000); // Poll every second

      return () => clearInterval(interval);
    }, 500); // Wait 500ms before first poll

    return () => {
      clearTimeout(initialDelay);
    };
  }, [crawlId]);

  // Fetch page data when selected
  useEffect(() => {
    if (!crawlId || !selectedUrl) {
      setPageData(null);
      return;
    }

    const fetchPageData = async () => {
      try {
        const response = await fetch(
          `/api/crawl/page?crawlId=${crawlId}&url=${encodeURIComponent(selectedUrl)}`
        );
        if (response.ok) {
          const data = await response.json();
          setPageData(data);
        }
      } catch (error) {
        console.error('Error fetching page data:', error);
      }
    };

    fetchPageData();
  }, [crawlId, selectedUrl]);

  const handleStart = useCallback(async () => {
    // Prevent double-click/double-submit using ref
    if (isStartingRef.current) {
      console.log('[UI] Already starting, ignoring duplicate call');
      return;
    }
    
    console.log('[UI] handleStart called, url:', url);
    
    if (!url.trim()) {
      console.warn('[UI] Empty URL, showing alert');
      alert('Please enter a website URL');
      return;
    }

    isStartingRef.current = true;
    
    try {
      console.log('[UI] Starting crawl for:', url);
      console.log('[UI] Options:', options);
      
      const response = await fetch('/api/crawl/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, options }),
      });

      console.log('[UI] Response status:', response.status);
      console.log('[UI] Response ok:', response.ok);

      if (response.ok) {
        const data = await response.json();
        console.log('[UI] Response data:', data);
        
            if (data.crawlId) {
              console.log('[UI] Crawl started with ID:', data.crawlId);
              console.log('[UI] Setting crawlId state...');
              setCrawlId(data.crawlId);
              console.log('[UI] crawlId state set, useEffect should trigger now');
              setSelectedUrl(null);
              setPageData(null);
              // Set initial status to show loading
              setStatus({
                crawlId: data.crawlId,
                status: 'idle',
                startTime: Date.now(),
                discoveredUrls: [],
                completedUrls: [],
                failedUrls: [],
                queueLength: 0,
                pagesFound: 0,
                pagesCrawled: 0,
              });
            } else {
          console.error('[UI] No crawlId in response:', data);
          alert('Failed to get crawl ID from server. Response: ' + JSON.stringify(data));
        }
      } else {
        // Try to get error message from response
        let errorMessage = 'Failed to start crawl';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
          console.error('[UI] Server error:', errorData);
        } catch (parseError) {
          console.error('[UI] Failed to parse error response:', parseError);
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        alert(`Failed to start crawl: ${errorMessage}`);
      }
    } catch (error) {
      console.error('[UI] Error starting crawl:', error);
      const errorMessage = error instanceof Error ? error.message : 'Network error';
      alert(`Failed to start crawl: ${errorMessage}`);
    } finally {
      isStartingRef.current = false;
    }
  }, [url, options]);

  const handleStop = async () => {
    if (!crawlId) return;

    try {
      await fetch('/api/crawl/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crawlId }),
      });
    } catch (error) {
      console.error('Error stopping crawl:', error);
    }
  };

  const handleReset = () => {
    setCrawlId(null);
    setStatus(null);
    setSelectedUrl(null);
    setPageData(null);
    setUrl('');
  };

  const handleDownload = () => {
    if (!crawlId) return;
    window.location.href = `/api/crawl/download?crawlId=${crawlId}`;
  };

  const isCrawling = status?.status === 'crawling';
  const canDownload = status?.status === 'completed' && (status.pagesCrawled || 0) > 0;

  return (
    <div className="min-h-screen bg-black text-gray-100">
      <div className="max-w-[1920px] mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-light mb-2">Website Text Crawler</h1>
          <p className="text-gray-400 text-sm">Extract readable text from any website</p>
        </div>

        {/* Input Section */}
        <div className="mb-8 space-y-4">
          <URLInput
            value={url}
            onChange={setUrl}
            onStart={handleStart}
            disabled={isCrawling || isStartingRef.current}
          />

          <AdvancedSettings
            options={options}
            onChange={setOptions}
            show={showAdvanced}
            onToggle={() => setShowAdvanced(!showAdvanced)}
          />
        </div>

        {/* Progress */}
        {status && (
          <div className="mb-6">
            <ProgressBar status={status} />
            <div className="flex gap-4 mt-4">
              {isCrawling && (
                <button
                  onClick={handleStop}
                  className="px-4 py-2 bg-red-900/30 hover:bg-red-900/50 border border-red-800/50 rounded text-sm transition-colors"
                >
                  Stop
                </button>
              )}
              {canDownload && (
                <button
                  onClick={handleDownload}
                  className="px-4 py-2 bg-green-900/30 hover:bg-green-900/50 border border-green-800/50 rounded text-sm transition-colors"
                >
                  Download .txt
                </button>
              )}
              <button
                onClick={handleReset}
                className="px-4 py-2 bg-gray-900/30 hover:bg-gray-900/50 border border-gray-800/50 rounded text-sm transition-colors"
              >
                Reset
              </button>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        {status && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* URL List */}
            <div className="bg-gray-950/50 border border-gray-800/50 rounded-lg p-4">
              <h2 className="text-sm font-medium mb-4 text-gray-300">
                Discovered URLs ({status.discoveredUrls.length})
              </h2>
              <URLList
                urls={status.discoveredUrls}
                completedUrls={status.completedUrls}
                failedUrls={status.failedUrls}
                currentUrl={status.currentUrl}
                onSelect={setSelectedUrl}
                selectedUrl={selectedUrl}
              />
            </div>

            {/* Preview Panel */}
            <div className="bg-gray-950/50 border border-gray-800/50 rounded-lg p-4">
              <h2 className="text-sm font-medium mb-4 text-gray-300">Preview</h2>
              <PreviewPanel pageData={pageData} selectedUrl={selectedUrl} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
