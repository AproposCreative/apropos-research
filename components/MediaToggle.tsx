'use client';
import { useState, useEffect } from 'react';

interface MediaToggleProps {
  mediaId: string;
  mediaName: string;
  isEnabled: boolean;
  onToggle: (mediaId: string, enabled: boolean) => void;
  articleCount?: number;
}

export default function MediaToggle({ 
  mediaId, 
  mediaName, 
  isEnabled, 
  onToggle, 
  articleCount = 0 
}: MediaToggleProps) {
  const [enabled, setEnabled] = useState(isEnabled);

  useEffect(() => {
    setEnabled(isEnabled);
  }, [isEnabled]);

  const handleToggle = () => {
    const newState = !enabled;
    setEnabled(newState);
    onToggle(mediaId, newState);
  };

  return (
    <div className="group flex items-center justify-between px-4 py-3 rounded-xl hover:bg-slate-100/50 dark:hover:bg-black-800/50 transition-all duration-300 backdrop-blur-sm">
      {/* Media Info */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-accent-500 rounded-xl flex items-center justify-center text-white text-sm font-bold shadow-md group-hover:shadow-lg group-hover:scale-110 transition-all duration-300 ease-out">
          {mediaName.charAt(0).toUpperCase()}
        </div>
        <div>
          <div className="font-medium text-slate-800 dark:text-black-100">{mediaName}</div>
          <div className="text-xs text-slate-500 dark:text-black-400">
            {articleCount} artikel{articleCount !== 1 ? 'er' : ''}
          </div>
        </div>
      </div>

      {/* Toggle Switch */}
      <div className="flex items-center">
        <button
          onClick={handleToggle}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-300 ease-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-black-900 ${
            enabled 
              ? 'bg-primary-600 dark:bg-primary-500' 
              : 'bg-slate-300 dark:bg-pure-black'
          }`}
          role="switch"
          aria-checked={enabled}
          aria-label={`${enabled ? 'Deaktiver' : 'Aktiver'} ${mediaName}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform duration-300 ease-out ${
              enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    </div>
  );
}
