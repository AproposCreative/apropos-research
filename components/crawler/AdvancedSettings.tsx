'use client';

import { CrawlOptions } from '@/lib/crawler/types';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

interface AdvancedSettingsProps {
  options: Partial<CrawlOptions>;
  onChange: (options: Partial<CrawlOptions>) => void;
  show: boolean;
  onToggle: () => void;
}

export function AdvancedSettings({ options, onChange, show, onToggle }: AdvancedSettingsProps) {
  const [ignorePathsText, setIgnorePathsText] = useState(
    options.ignorePaths?.join('\n') || ''
  );

  const updateOptions = (updates: Partial<CrawlOptions>) => {
    onChange({ ...options, ...updates });
  };

  const handleIgnorePathsChange = (text: string) => {
    setIgnorePathsText(text);
    const paths = text
      .split('\n')
      .map(p => p.trim())
      .filter(p => p.length > 0);
    updateOptions({ ignorePaths: paths });
  };

  return (
    <div className="border border-gray-800/50 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-900/30 transition-colors text-sm text-gray-300"
      >
        <span>Advanced Settings</span>
        <ChevronDown
          className={`w-4 h-4 transition-transform ${show ? 'rotate-180' : ''}`}
        />
      </button>

      {show && (
        <div className="px-4 py-4 space-y-4 border-t border-gray-800/50 bg-gray-950/30">
          {/* Respect robots.txt */}
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm text-gray-300">Respect robots.txt</span>
            <input
              type="checkbox"
              checked={options.respectRobotsTxt ?? true}
              onChange={(e) => updateOptions({ respectRobotsTxt: e.target.checked })}
              className="w-4 h-4 rounded border-gray-700 bg-gray-900 text-white focus:ring-gray-600"
            />
          </label>

          {/* Include subdomains */}
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm text-gray-300">Include subdomains</span>
            <input
              type="checkbox"
              checked={options.includeSubdomains ?? false}
              onChange={(e) => updateOptions({ includeSubdomains: e.target.checked })}
              className="w-4 h-4 rounded border-gray-700 bg-gray-900 text-white focus:ring-gray-600"
            />
          </label>

          {/* Include PDFs */}
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm text-gray-300">Include PDFs</span>
            <input
              type="checkbox"
              checked={options.includePdfs ?? false}
              onChange={(e) => updateOptions({ includePdfs: e.target.checked })}
              className="w-4 h-4 rounded border-gray-700 bg-gray-900 text-white focus:ring-gray-600"
            />
          </label>

          {/* Strip tracking params */}
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm text-gray-300">Strip tracking parameters</span>
            <input
              type="checkbox"
              checked={options.stripTrackingParams ?? true}
              onChange={(e) => updateOptions({ stripTrackingParams: e.target.checked })}
              className="w-4 h-4 rounded border-gray-700 bg-gray-900 text-white focus:ring-gray-600"
            />
          </label>

          {/* Max pages */}
          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-300">Max pages</label>
            <input
              type="number"
              min="1"
              max="1000"
              value={options.maxPages ?? 250}
              onChange={(e) => updateOptions({ maxPages: parseInt(e.target.value) || 250 })}
              className="w-20 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-gray-600"
            />
          </div>

          {/* Concurrency */}
          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-300">Concurrency</label>
            <input
              type="number"
              min="1"
              max="10"
              value={options.concurrency ?? 3}
              onChange={(e) => updateOptions({ concurrency: parseInt(e.target.value) || 3 })}
              className="w-20 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-gray-600"
            />
          </div>

          {/* Delay */}
          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-300">Delay (ms)</label>
            <input
              type="number"
              min="0"
              max="5000"
              step="100"
              value={options.delayMs ?? 300}
              onChange={(e) => updateOptions({ delayMs: parseInt(e.target.value) || 300 })}
              className="w-20 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-gray-600"
            />
          </div>

          {/* Max depth */}
          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-300">Max depth</label>
            <input
              type="number"
              min="1"
              max="20"
              value={options.maxDepth ?? 6}
              onChange={(e) => updateOptions({ maxDepth: parseInt(e.target.value) || 6 })}
              className="w-20 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-gray-600"
            />
          </div>

          {/* Ignore paths */}
          <div>
            <label className="text-sm text-gray-300 block mb-2">Ignore paths (one per line)</label>
            <textarea
              value={ignorePathsText}
              onChange={(e) => handleIgnorePathsChange(e.target.value)}
              placeholder="/admin&#10;/login&#10;/api"
              rows={4}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-gray-600 font-mono"
            />
          </div>
        </div>
      )}
    </div>
  );
}
