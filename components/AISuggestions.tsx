'use client';

import { useState, useEffect, useRef } from 'react';

interface AISuggestionsProps {
  text: string;
  context?: string;
  onSuggestionSelect: (suggestion: string) => void;
  onClose: () => void;
}

export default function AISuggestions({ text, context, onSuggestionSelect, onClose }: AISuggestionsProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedType, setSelectedType] = useState<'improve' | 'continue' | 'expand'>('improve');
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (text.trim().length > 10) {
      generateSuggestions();
    }
  }, [text, selectedType]);

  const generateSuggestions = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/ai-suggestions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text.trim(),
          context: context || 'Generel artikel',
          type: selectedType
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setSuggestions(data.suggestions || []);
      } else {
        setSuggestions([]);
      }
    } catch (error) {
      console.error('Error fetching AI suggestions:', error);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    onSuggestionSelect(suggestion);
    onClose();
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'improve': return 'Forbedre';
      case 'continue': return 'Fortsæt';
      case 'expand': return 'Udvide';
      default: return 'Forbedre';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'improve': return '✨';
      case 'continue': return '➡️';
      case 'expand': return '📈';
      default: return '✨';
    }
  };

  if (text.trim().length < 10) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 w-80 max-w-[calc(100vw-2rem)]">
      <div className="bg-black border border-white/20 rounded-lg shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white">AI Forslag</span>
            <div className="flex gap-1">
              {(['improve', 'continue', 'expand'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setSelectedType(type)}
                  className={`w-6 h-6 rounded text-xs transition-colors ${
                    selectedType === type
                      ? 'bg-white text-black'
                      : 'bg-white/10 text-white/60 hover:bg-white/20'
                  }`}
                  title={getTypeLabel(type)}
                >
                  {getTypeIcon(type)}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 rounded transition-colors"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-3">
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
              <span className="text-sm text-white/60">Genererer forslag...</span>
            </div>
          ) : suggestions.length > 0 ? (
            <div className="space-y-2">
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="w-full text-left p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors group"
                >
                  <p className="text-sm text-white group-hover:text-blue-300 transition-colors">
                    {suggestion}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-white/60">Ingen forslag tilgængelige</p>
              <p className="text-xs text-white/40 mt-1">Prøv at skrive mere tekst</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-white/10">
          <p className="text-xs text-white/40 text-center">
            {getTypeLabel(selectedType)} tekst med AI
          </p>
        </div>
      </div>
    </div>
  );
}
