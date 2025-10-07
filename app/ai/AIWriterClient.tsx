'use client';

import { useState, useEffect } from 'react';
import MainChatPanel from './MainChatPanel';
import PreviewPanel from './PreviewPanel';
import AuthModal from '@/components/AuthModal';
import DraftsPanel from '@/components/DraftsPanel';
import ChatSearchModal from '@/components/ChatSearchModal';
import { useAuth } from '@/lib/auth-context';
import { saveDraft, getDraft, type ArticleDraft } from '@/lib/firebase-service';

interface ArticleData {
  title: string;
  subtitle: string;
  category: string;
  author: string;
  content: string;
  rating?: number;
  tags: string[];
  platform?: string;
}

export default function AIWriterClient() {
  const { user } = useAuth();
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [showDraftsPanel, setShowDraftsPanel] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [articleData, setArticleData] = useState<ArticleData>({
    title: '',
    subtitle: '',
    category: '',
    author: 'Frederik Kragh',
    content: '',
    rating: 0,
    tags: [],
    platform: ''
  });

  const [notes, setNotes] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    files?: UploadedFile[];
  }>>([]);

  const updateArticleData = (updates: Partial<ArticleData>) => {
    setArticleData(prev => ({ ...prev, ...updates }));
  };

  const addChatMessage = (role: 'user' | 'assistant', content: string, files?: UploadedFile[]) => {
    const newMessage = {
      id: Date.now().toString(),
      role,
      content,
      timestamp: new Date(),
      files
    };
    setChatMessages(prev => [...prev, newMessage]);
  };

  const handleSendMessage = async (message: string, files?: UploadedFile[]) => {
    addChatMessage('user', message, files);
    
    try {
      const response = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          articleData,
          notes,
          chatHistory: chatMessages,
          authorTOV: articleData.authorTOV || '',
          authorName: articleData.author || 'Frederik Kragh' // Pass author name for TOV loading
        }),
      });

      if (response.ok) {
        const data = await response.json();
        addChatMessage('assistant', data.response);
        
        // Auto-update article data based on AI response
        if (data.articleUpdate) {
          setArticleData(prev => ({
            ...prev,
            ...data.articleUpdate
          }));
        }
        
        // Handle AI suggestions (like rating)
        if (data.suggestion) {
          // Store suggestion for UI to display
          setArticleData(prev => ({
            ...prev,
            aiSuggestion: data.suggestion
          }));
        }
      } else {
        addChatMessage('assistant', 'Beklager, jeg kunne ikke behandle din forespørgsel lige nu. Prøv igen senere.');
      }
    } catch (error) {
      console.error('Error sending message to AI:', error);
      addChatMessage('assistant', 'Der opstod en fejl. Prøv igen senere.');
    }
  };

  // Auto-save to Firebase when data changes
  useEffect(() => {
    if (!user || chatMessages.length === 0) return;

    const autoSaveTimeout = setTimeout(async () => {
      try {
        // Clean up data before saving to Firebase
        const cleanChatMessages = chatMessages.map(msg => ({
          ...msg,
          files: msg.files || [] // Ensure files is always an array
        }));

        const draftData = {
          id: currentDraftId || undefined,
          title: articleData.title || 'Untitled',
          chatTitle: chatMessages[0]?.content.substring(0, 50) || 'Ny artikel',
          messages: cleanChatMessages,
          articleData: {
            ...articleData,
            // Ensure all fields have values
            title: articleData.title || '',
            subtitle: articleData.subtitle || '',
            category: articleData.category || '',
            author: articleData.author || 'Frederik Kragh',
            authorTOV: articleData.authorTOV || '',
            content: articleData.content || '',
            rating: articleData.rating || 0,
            tags: articleData.tags || [],
            platform: articleData.platform || ''
          },
          notes: notes || '',
          userId: user.uid,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastModified: new Date()
        };

        const draftId = await saveDraft(user.uid, draftData);
        
        if (!currentDraftId) {
          setCurrentDraftId(draftId);
        }
      } catch (error) {
        console.error('Error auto-saving to Firebase:', error);
      }
    }, 2000); // Auto-save after 2 seconds of inactivity

    return () => clearTimeout(autoSaveTimeout);
  }, [chatMessages, articleData, notes, user, currentDraftId]);

  const handleLoadDraft = (draft: ArticleDraft) => {
    setCurrentDraftId(draft.id);
    setChatMessages(draft.messages);
    setArticleData(draft.articleData);
    setNotes(draft.notes || '');
  };

  const handleSelectMessage = (draft: ArticleDraft, messageIndex: number) => {
    // Load the draft and scroll to the specific message
    handleLoadDraft(draft);
    
    // Scroll to the message after a short delay to allow for rendering
    setTimeout(() => {
      const messageElement = document.getElementById(`message-${messageIndex}`);
      if (messageElement) {
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        messageElement.classList.add('bg-blue-500/20');
        setTimeout(() => {
          messageElement.classList.remove('bg-blue-500/20');
        }, 3000);
      }
    }, 100);
  };


  const handleNewArticle = () => {
    // Reset everything for a new article
    setCurrentDraftId(null);
    setChatMessages([]);
    setArticleData({
      title: '',
      subtitle: '',
      category: '',
      author: 'Frederik Kragh',
      content: '',
      rating: 0,
      tags: [],
      platform: ''
    });
    setNotes('');
    
    // Close drafts panel if open
    setShowDraftsPanel(false);
    
    // Show success feedback
    const tempElement = document.createElement('div');
    tempElement.textContent = 'Ny artikel oprettet!';
    tempElement.className = 'fixed top-4 right-4 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm z-50';
    document.body.appendChild(tempElement);
    setTimeout(() => {
      document.body.removeChild(tempElement);
    }, 2000);
  };

  return (
    <>
      {!user && <AuthModal />}
      {user && <AuthModal />}
      {showDraftsPanel && (
        <DraftsPanel 
          onLoadDraft={handleLoadDraft}
          onClose={() => setShowDraftsPanel(false)}
        />
      )}
      {showSearchModal && (
        <ChatSearchModal
          isOpen={showSearchModal}
          onClose={() => setShowSearchModal(false)}
          onSelectMessage={handleSelectMessage}
        />
      )}
      <div className="h-screen bg-[#171717] p-[1%] flex gap-4 relative">
        {user && (
          <>
            {/* Apropos Research Logo */}
            <div className="absolute bottom-4 right-4 z-10">
              <img 
                src="/images/Apropos Research White.png" 
                alt="Apropos Research" 
                className="h-6 opacity-40 hover:opacity-60 transition-opacity"
              />
            </div>
            
            {/* Left Panel - Main Chat with AI */}
            <div className="w-[500px] h-full">
                <MainChatPanel 
                  messages={chatMessages}
                  onSendMessage={handleSendMessage}
                  articleData={articleData}
                  notes={notes}
                  setNotes={setNotes}
                  onNewGamingArticle={() => {
                    updateArticleData({
                      title: '',
                      subtitle: '',
                      category: 'Gaming',
                      content: '',
                      tags: ['Gaming', 'Anmeldelse']
                    });
                  }}
                  onNewCultureArticle={() => {
                    updateArticleData({
                      title: '',
                      subtitle: '',
                      category: 'Kultur',
                      content: '',
                      tags: ['Kultur', 'Anmeldelse']
                    });
                  }}
                  updateArticleData={updateArticleData}
                />
            </div>
            
            {/* Right Sidebar with action buttons */}
            <div className="border border-white/20 rounded-2xl p-1 flex items-center" style={{ backgroundColor: 'rgb(0, 0, 0)', height: '50px' }}>
              <div className="flex gap-1">
                <button
                  onClick={() => setShowSearchModal(true)}
                  className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-xl transition-colors"
                  title="Søg i beskeder"
                >
                  {/* Modern search icon */}
                  <div className="relative w-3 h-3">
                    <div className="absolute top-0 left-0 w-2.5 h-2.5 border-2 border-white rounded-full"></div>
                    <div className="absolute bottom-0 right-0 w-1.5 h-1 bg-white transform rotate-45"></div>
                  </div>
                </button>
                <button
                  onClick={() => setShowDraftsPanel(true)}
                  className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-xl transition-colors"
                  title="Mine artikler"
                >
                  {/* Grid icon for articles */}
                  <div className="grid grid-cols-3 gap-0.5 w-3 h-3">
                    <div className="w-0.5 h-0.5 bg-white rounded-full"></div>
                    <div className="w-0.5 h-0.5 bg-white rounded-full"></div>
                    <div className="w-0.5 h-0.5 bg-white rounded-full"></div>
                    <div className="w-0.5 h-0.5 bg-white rounded-full"></div>
                    <div className="w-0.5 h-0.5 bg-white rounded-full"></div>
                    <div className="w-0.5 h-0.5 bg-white rounded-full"></div>
                    <div className="w-0.5 h-0.5 bg-white rounded-full"></div>
                    <div className="w-0.5 h-0.5 bg-white rounded-full"></div>
                    <div className="w-0.5 h-0.5 bg-white rounded-full"></div>
                  </div>
                </button>
                <button
                  onClick={handleNewArticle}
                  className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-xl transition-colors"
                  title="Ny artikel"
                >
                  {/* Modern plus icon */}
                  <div className="relative w-3 h-3">
                    <div className="absolute top-1/2 left-1/2 w-2.5 h-0.5 bg-white transform -translate-x-1/2 -translate-y-1/2"></div>
                    <div className="absolute top-1/2 left-1/2 w-0.5 h-2.5 bg-white transform -translate-x-1/2 -translate-y-1/2"></div>
                  </div>
                </button>
              </div>
            </div>
            
          </>
        )}
      </div>
    </>
  );
}
