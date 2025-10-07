'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { getUserDrafts, type ArticleDraft } from '@/lib/firebase-service';

interface ChatSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMessage: (draft: ArticleDraft, messageIndex: number) => void;
}

interface SearchResult {
  draft: ArticleDraft;
  messageIndex: number;
  message: {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  };
  matchedText: string;
  context: string;
}

export default function ChatSearchModal({ isOpen, onClose, onSelectMessage }: ChatSearchModalProps) {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [allDrafts, setAllDrafts] = useState<ArticleDraft[]>([]);

  useEffect(() => {
    if (isOpen && user) {
      loadDrafts();
    }
  }, [isOpen, user]);

  const loadDrafts = async () => {
    if (!user) return;
    
    try {
      const drafts = await getUserDrafts(user.uid);
      setAllDrafts(drafts);
    } catch (error) {
      console.error('Error loading drafts for search:', error);
    }
  };

  const searchMessages = (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    const results: SearchResult[] = [];
    const searchTerm = query.toLowerCase();

    allDrafts.forEach(draft => {
      draft.messages.forEach((message, messageIndex) => {
        const content = message.content.toLowerCase();
        const matchIndex = content.indexOf(searchTerm);
        
        if (matchIndex !== -1) {
          // Get context around the match
          const start = Math.max(0, matchIndex - 50);
          const end = Math.min(content.length, matchIndex + searchTerm.length + 50);
          const context = message.content.substring(start, end);
          
          // Highlight the matched text
          const matchedText = message.content.substring(
            Math.max(0, matchIndex - 20),
            Math.min(message.content.length, matchIndex + searchTerm.length + 20)
          );

          results.push({
            draft,
            messageIndex,
            message,
            matchedText,
            context: context.length < message.content.length ? `...${context}...` : context
          });
        }
      });
    });

    // Sort by relevance (exact matches first, then by date)
    results.sort((a, b) => {
      const aExact = a.message.content.toLowerCase().includes(searchTerm);
      const bExact = b.message.content.toLowerCase().includes(searchTerm);
      
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      
      return b.message.timestamp.getTime() - a.message.timestamp.getTime();
    });

    setSearchResults(results);
    setIsSearching(false);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    
    // Debounce search
    const timeoutId = setTimeout(() => {
      searchMessages(query);
    }, 300);

    return () => clearTimeout(timeoutId);
  };

  const handleResultClick = (result: SearchResult) => {
    onSelectMessage(result.draft, result.messageIndex);
    onClose();
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('da-DK', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const highlightMatch = (text: string, query: string) => {
    if (!query.trim()) return text;
    
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, index) => 
      regex.test(part) ? (
        <mark key={index} className="bg-yellow-400 text-black px-1 rounded">
          {part}
        </mark>
      ) : part
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-black border border-white/10 rounded-2xl w-full max-w-4xl max-h-[80vh] mx-4 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <h2 className="text-2xl font-bold text-white font-poppins">Søg i beskeder</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Search Input */}
        <div className="p-6 border-b border-white/10">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="Søg i dine beskeder..."
              className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-blue-400 transition-colors"
            />
            <svg className="absolute right-3 top-3.5 w-5 h-5 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-6">
          {isSearching ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin mr-3"></div>
              <span className="text-white/60">Søger...</span>
            </div>
          ) : searchQuery.trim() && searchResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <svg className="w-16 h-16 text-white/20 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <p className="text-white/60">Ingen resultater fundet</p>
              <p className="text-white/40 text-sm mt-1">Prøv at søge med andre ord</p>
            </div>
          ) : searchQuery.trim() ? (
            <div className="space-y-3">
              {searchResults.map((result, index) => (
                <div
                  key={`${result.draft.id}-${result.messageIndex}`}
                  onClick={() => handleResultClick(result)}
                  className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg p-4 cursor-pointer transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs text-blue-400 bg-blue-400/10 px-2 py-1 rounded">
                          {result.message.role === 'user' ? 'Du' : 'AI'}
                        </span>
                        <span className="text-xs text-white/40">
                          {result.draft.chatTitle || result.draft.title || 'Untitled'}
                        </span>
                        <span className="text-xs text-white/40">
                          {formatDate(result.message.timestamp)}
                        </span>
                      </div>
                      <p className="text-white text-sm">
                        {highlightMatch(result.matchedText, searchQuery)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <svg className="w-16 h-16 text-white/20 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <p className="text-white/60">Søg i dine beskeder</p>
              <p className="text-white/40 text-sm mt-1">Skriv et ord eller sætning for at finde tidligere samtaler</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
