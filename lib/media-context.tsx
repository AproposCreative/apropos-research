'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface MediaState {
  [mediaId: string]: boolean;
}

interface MediaContextType {
  mediaStates: MediaState;
  mediaSources: any[];
  articleCounts: Record<string, number>;
  toggleMedia: (mediaId: string, enabled: boolean) => void;
  isMediaEnabled: (mediaId: string) => boolean;
  getEnabledMedias: () => string[];
  getDisabledMedias: () => string[];
  refreshMediaSources: () => void;
  refreshArticleCounts: () => void;
}

const MediaContext = createContext<MediaContextType | undefined>(undefined);

// Default media states - all enabled by default
const defaultMediaStates: MediaState = {
  'soundvenue': true,
  'gaffa': true,
  'berlingske': true,
  'bt': true,
};

export function MediaProvider({ children }: { children: ReactNode }) {
  const [mediaStates, setMediaStates] = useState<MediaState>(defaultMediaStates);
  const [mediaSources, setMediaSources] = useState<any[]>([]);
  const [articleCounts, setArticleCounts] = useState<Record<string, number>>({});

      // Load from localStorage on mount
      useEffect(() => {
        if (typeof window !== 'undefined') {
          const savedStates = localStorage.getItem('mediaStates');
          if (savedStates) {
            try {
              const parsedStates = JSON.parse(savedStates);
              // Only keep states for media that actually exist
              const validStates: MediaState = {};
              Object.keys(defaultMediaStates).forEach(key => {
                if (parsedStates[key] !== undefined) {
                  validStates[key] = parsedStates[key];
                }
              });
              setMediaStates({ ...defaultMediaStates, ...validStates });
            } catch (error) {
              console.error('Error parsing media states from localStorage:', error);
            }
          }
        }
      }, []);

  // Save to localStorage whenever mediaStates changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('mediaStates', JSON.stringify(mediaStates));
    }
  }, [mediaStates]);

  // Load media sources from API
  const loadMediaSources = async () => {
    try {
      const response = await fetch('/api/media-sources');
      const data = await response.json();
      if (response.ok) {
        setMediaSources(data.sources);
        
        // Auto-enable new media sources
        const newStates: MediaState = {};
        data.sources.forEach((source: any) => {
          newStates[source.id] = mediaStates[source.id] ?? true;
        });
        setMediaStates(prev => ({ ...prev, ...newStates }));
      }
    } catch (error) {
      console.error('Error loading media sources:', error);
    }
  };

  // Load media sources on mount
  useEffect(() => {
    loadMediaSources();
  }, []);

  const refreshMediaSources = () => {
    loadMediaSources();
  };

  const refreshArticleCounts = () => {
    loadArticleCounts();
  };

  // Load article counts from API
  const loadArticleCounts = async () => {
    try {
      const response = await fetch('/api/article-counts');
      const data = await response.json();
      if (response.ok) {
        setArticleCounts(data.counts);
      }
    } catch (error) {
      console.error('Error loading article counts:', error);
    }
  };

  // Load article counts on mount
  useEffect(() => {
    loadArticleCounts();
  }, []);

  const toggleMedia = (mediaId: string, enabled: boolean) => {
    setMediaStates(prev => ({
      ...prev,
      [mediaId]: enabled
    }));
  };

  const isMediaEnabled = (mediaId: string) => {
    return mediaStates[mediaId] ?? true; // Default to enabled if not found
  };

  const getEnabledMedias = () => {
    return Object.entries(mediaStates)
      .filter(([_, enabled]) => enabled)
      .map(([mediaId, _]) => mediaId);
  };

  const getDisabledMedias = () => {
    return Object.entries(mediaStates)
      .filter(([_, enabled]) => !enabled)
      .map(([mediaId, _]) => mediaId);
  };

  return (
    <MediaContext.Provider value={{
      mediaStates,
      mediaSources,
      articleCounts,
      toggleMedia,
      isMediaEnabled,
      getEnabledMedias,
      getDisabledMedias,
      refreshMediaSources,
      refreshArticleCounts,
    }}>
      {children}
    </MediaContext.Provider>
  );
}

export function useMedia() {
  const context = useContext(MediaContext);
  if (context === undefined) {
    throw new Error('useMedia must be used within a MediaProvider');
  }
  return context;
}
