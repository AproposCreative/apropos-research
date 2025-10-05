'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface MediaState {
  [mediaId: string]: boolean;
}

interface MediaContextType {
  mediaStates: MediaState;
  toggleMedia: (mediaId: string, enabled: boolean) => void;
  isMediaEnabled: (mediaId: string) => boolean;
  getEnabledMedias: () => string[];
  getDisabledMedias: () => string[];
}

const MediaContext = createContext<MediaContextType | undefined>(undefined);

// Default media states - all enabled by default
const defaultMediaStates: MediaState = {
  'soundvenue': true,
  'gaffa': true,
  'berlingske': true,
  'bt': true,
  'dr': true,
  'bbc': true,
};

export function MediaProvider({ children }: { children: ReactNode }) {
  const [mediaStates, setMediaStates] = useState<MediaState>(defaultMediaStates);

  // Load from localStorage on mount
  useEffect(() => {
    const savedStates = localStorage.getItem('mediaStates');
    if (savedStates) {
      try {
        const parsedStates = JSON.parse(savedStates);
        setMediaStates({ ...defaultMediaStates, ...parsedStates });
      } catch (error) {
        console.error('Error parsing media states from localStorage:', error);
      }
    }
  }, []);

  // Save to localStorage whenever mediaStates changes
  useEffect(() => {
    localStorage.setItem('mediaStates', JSON.stringify(mediaStates));
  }, [mediaStates]);

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
      toggleMedia,
      isMediaEnabled,
      getEnabledMedias,
      getDisabledMedias,
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
