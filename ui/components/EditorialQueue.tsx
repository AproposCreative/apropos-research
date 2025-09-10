'use client';
import { RageItem } from '@/lib/readPrompts';
import { useState, useEffect } from 'react';

interface EditorialQueueProps {
  allArticles: RageItem[];
}

interface EditorialItem {
  id: string;
  title: string;
  url: string;
  summary?: string;
  bullets?: string[];
  source?: string;
  addedAt: string;
  status: string;
}

export default function EditorialQueue({ allArticles }: EditorialQueueProps) {
  const [editorialItems, setEditorialItems] = useState<EditorialItem[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  useEffect(() => {
    // Load items from localStorage
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('editorialQueue');
      if (stored) {
        try {
          setEditorialItems(JSON.parse(stored));
        } catch (error) {
          console.error('Error parsing editorial queue:', error);
        }
      }
    }
  }, []);

  const handleSendToAI = async () => {
    setIsSending(true);
    try {
      const response = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: editorialItems })
      });
      
      if (response.ok) {
        const result = await response.json();
        
        // Save AI-generated drafts to localStorage
        if (result.articles && result.articles.length > 0) {
          if (typeof window !== 'undefined') {
            const existingDrafts = JSON.parse(localStorage.getItem('aiDrafts') || '[]');
            const updatedDrafts = [...existingDrafts, ...result.articles];
            localStorage.setItem('aiDrafts', JSON.stringify(updatedDrafts));
          }
        }
        
        // Clear the queue after successful send
        setEditorialItems([]);
        if (typeof window !== 'undefined') {
          localStorage.removeItem('editorialQueue');
        }
        
        // Show success modal
        const message = `${result.message}\n\n${result.processed} artikler er nu tilgængelige i AI Drafts.`;
        setSuccessMessage(message);
        setShowSuccessModal(true);
      } else {
        const error = await response.json();
        alert(`Fejl ved afsendelse: ${error.error || 'Ukendt fejl'}`);
      }
    } catch (error) {
      console.error('Error sending to AI:', error);
      alert('Fejl ved afsendelse - tjek din internetforbindelse');
    } finally {
      setIsSending(false);
    }
  };

  const handleCopySelected = () => {
    const text = editorialItems.map(item => 
      `**${item.title}**\n${item.summary}\n\nKilde: ${item.source}\nURL: ${item.url}`
    ).join('\n\n---\n\n');
    
    navigator.clipboard.writeText(text);
    alert('Artikler kopieret til udklipsholder!');
  };

  const handleClearQueue = () => {
    setEditorialItems([]);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('editorialQueue');
    }
  };

  // Filter items based on search query
  const filteredItems = editorialItems.filter(item => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      item.title.toLowerCase().includes(query) ||
      (item.summary && item.summary.toLowerCase().includes(query)) ||
      (item.source && item.source.toLowerCase().includes(query)) ||
      (item.bullets && item.bullets.some(bullet => bullet.toLowerCase().includes(query)))
    );
  });

  if (editorialItems.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="bg-slate-100/50 dark:bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 border border-slate-200/50 dark:border-slate-700/50">
          <h3 className="text-xl font-semibold text-slate-700 dark:text-slate-300 mb-2">Ingen artikler i køen</h3>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            Vælg artikler fra hovedsiden for at tilføje dem til Editorial Queue
          </p>
          <a 
            href="/" 
            className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-slate-600 to-slate-700 text-white rounded-xl hover:from-slate-700 hover:to-slate-800 transition-all duration-300 shadow-lg"
          >
            Gå til artikler
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Queue Header */}
      <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl rounded-2xl p-6 border border-slate-200/50 dark:border-slate-700/50 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
              Editorial Queue
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              {searchQuery ? (
                <>
                  {filteredItems.length} af {editorialItems.length} artikel{editorialItems.length !== 1 ? 'er' : ''} klar til Apropos Editorial LLM
                </>
              ) : (
                <>
                  {editorialItems.length} artikel{editorialItems.length !== 1 ? 'er' : ''} klar til Apropos Editorial LLM
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleCopySelected}
              className="px-4 py-2 bg-slate-100/70 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200/70 dark:hover:bg-slate-700/70 transition-colors duration-300 border border-slate-300/50 dark:border-slate-600/50"
            >
              Kopiér valgte
            </button>
            <button
              onClick={handleSendToAI}
              disabled={isSending}
              className="px-6 py-2 bg-gradient-to-r from-slate-600 to-slate-700 text-white rounded-lg hover:from-slate-700 hover:to-slate-800 transition-all duration-300 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSending ? 'Sender...' : 'Send til Editorial AI'}
            </button>
            <button
              onClick={handleClearQueue}
              className="px-4 py-2 bg-red-100/70 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-200/70 dark:hover:bg-red-800/40 transition-colors duration-300 border border-red-300/50 dark:border-red-700/50"
            >
              Ryd kø
            </button>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      {editorialItems.length > 0 && (
        <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl rounded-2xl p-4 border border-slate-200/50 dark:border-slate-700/50 shadow-lg">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Søg i editorial queue..."
              className="w-full pl-10 pr-4 py-2 bg-white/70 dark:bg-slate-800/70 border border-slate-300/50 dark:border-slate-600/50 rounded-xl text-slate-700 dark:text-slate-300 placeholder-slate-500 dark:placeholder-slate-400 focus:ring-2 focus:ring-slate-500 dark:focus:ring-slate-400 focus:border-transparent transition-all duration-300"
            />
          </div>
        </div>
      )}

      {/* Ticket-style Articles */}
      <div className="grid gap-4">
        {filteredItems.map((item, index) => (
          <div 
            key={item.id}
            className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl rounded-2xl p-6 border border-slate-200/50 dark:border-slate-700/50 shadow-lg hover:shadow-xl transition-all duration-300"
          >
            {/* Ticket Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gradient-to-r from-slate-600 to-slate-700 text-white rounded-full flex items-center justify-center text-sm font-semibold">
                  {index + 1}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 line-clamp-2">
                    {item.title}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="px-2 py-1 bg-slate-100/70 dark:bg-slate-800/70 text-slate-600 dark:text-slate-400 text-xs rounded-full border border-slate-300/50 dark:border-slate-600/50">
                      {item.source?.toUpperCase() || 'MEDIE'}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-500">
                      {new Date(item.addedAt).toLocaleDateString('da-DK')}
                    </span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-slate-500 dark:text-slate-500">
                  Status: <span className="text-green-600 dark:text-green-400 font-medium">Klar</span>
                </div>
              </div>
            </div>

            {/* Ticket Content */}
            <div className="space-y-3">
              <p className="text-slate-700 dark:text-slate-300 line-clamp-3">
                {item.summary}
              </p>
              
              {item.bullets && item.bullets.length > 0 && (
                <div className="space-y-1">
                  <h4 className="text-sm font-medium text-slate-600 dark:text-slate-400">Nøglepunkter:</h4>
                  <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                    {item.bullets.slice(0, 3).map((bullet, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-slate-400 dark:text-slate-500 mt-1">•</span>
                        <span className="line-clamp-2">{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="pt-3 border-t border-slate-200/50 dark:border-slate-700/50">
                <a 
                  href={item.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-sm text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors duration-300"
                >
                  Læs original artikel →
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl rounded-3xl p-8 max-w-md w-full border border-white/20 dark:border-white/10 shadow-2xl transform transition-all duration-300 ease-out">
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-100 mb-3">
                Artikler sendt til AI! 🎉
              </h3>
              <p className="text-slate-600 dark:text-slate-400 mb-6 whitespace-pre-line">
                {successMessage}
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setShowSuccessModal(false)}
                  className="px-6 py-2 bg-slate-100/70 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200/70 dark:hover:bg-slate-700/70 transition-colors duration-300 border border-slate-300/50 dark:border-slate-600/50"
                >
                  Luk
                </button>
                <a
                  href="/ai-drafts"
                  className="px-6 py-2 bg-gradient-to-r from-slate-600 to-slate-700 text-white rounded-lg hover:from-slate-700 hover:to-slate-800 transition-all duration-300 shadow-lg"
                >
                  Se AI Drafts
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
