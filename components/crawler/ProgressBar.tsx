'use client';

import { CrawlStatus } from '@/lib/crawler/types';

interface ProgressBarProps {
  status: CrawlStatus;
}

export function ProgressBar({ status }: ProgressBarProps) {
  const progress = status.pagesFound > 0
    ? (status.pagesCrawled / status.pagesFound) * 100
    : 0;

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const elapsed = status.endTime
    ? status.endTime - status.startTime
    : Date.now() - status.startTime;

  return (
    <div className="space-y-3">
      {/* Status */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-400 capitalize">{status.status}</span>
        <span className="text-gray-400">{formatTime(elapsed)}</span>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-gray-900 rounded-full overflow-hidden">
        <div
          className="h-full bg-white transition-all duration-300"
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 text-xs">
        <div>
          <div className="text-gray-500">Pages Found</div>
          <div className="text-white font-medium">{status.pagesFound}</div>
        </div>
        <div>
          <div className="text-gray-500">Pages Crawled</div>
          <div className="text-white font-medium">{status.pagesCrawled}</div>
        </div>
        <div>
          <div className="text-gray-500">Failed</div>
          <div className="text-red-400 font-medium">{status.failedUrls.length}</div>
        </div>
        <div>
          <div className="text-gray-500">Queue</div>
          <div className="text-white font-medium">{status.queueLength}</div>
        </div>
      </div>

      {/* Current URL */}
      {status.currentUrl && (
        <div className="text-xs text-gray-500 truncate">
          Current: <span className="text-gray-400">{status.currentUrl}</span>
        </div>
      )}

      {/* Error */}
      {status.error && (
        <div className="text-xs text-red-400">
          Error: {status.error}
        </div>
      )}
    </div>
  );
}
