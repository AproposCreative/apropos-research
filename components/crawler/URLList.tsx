'use client';

interface URLListProps {
  urls: string[];
  completedUrls: string[];
  failedUrls: string[];
  currentUrl?: string;
  onSelect: (url: string) => void;
  selectedUrl: string | null;
}

export function URLList({
  urls,
  completedUrls,
  failedUrls,
  currentUrl,
  onSelect,
  selectedUrl,
}: URLListProps) {
  const getStatus = (url: string): 'queued' | 'crawling' | 'completed' | 'failed' => {
    if (failedUrls.includes(url)) return 'failed';
    if (completedUrls.includes(url)) return 'completed';
    if (currentUrl === url) return 'crawling';
    return 'queued';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-400';
      case 'failed':
        return 'text-red-400';
      case 'crawling':
        return 'text-blue-400';
      default:
        return 'text-gray-500';
    }
  };

  return (
    <div className="space-y-1 max-h-[600px] overflow-y-auto">
      {urls.length === 0 ? (
        <div className="text-sm text-gray-500 py-8 text-center">No URLs discovered yet</div>
      ) : (
        urls.map((url, index) => {
          const status = getStatus(url);
          const isSelected = selectedUrl === url;

          return (
            <button
              key={url}
              onClick={() => onSelect(url)}
              className={`w-full text-left px-3 py-2 rounded text-xs hover:bg-gray-900/50 transition-colors border ${
                isSelected
                  ? 'bg-gray-900/70 border-gray-700'
                  : 'border-transparent'
              }`}
            >
              <div className="flex items-start gap-2">
                <span className={`font-mono flex-shrink-0 ${getStatusColor(status)}`}>
                  {String(index + 1).padStart(3, '0')}.
                </span>
                <span className="flex-1 truncate text-gray-300">{url}</span>
                <span className={`text-xs flex-shrink-0 ${getStatusColor(status)}`}>
                  {status === 'crawling' && '●'}
                  {status === 'completed' && '✓'}
                  {status === 'failed' && '✗'}
                </span>
              </div>
            </button>
          );
        })
      )}
    </div>
  );
}
