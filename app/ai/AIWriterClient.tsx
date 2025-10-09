'use client';

import { useState, useEffect } from 'react';
import { type UploadedFile } from '@/lib/file-upload-service';
import MainChatPanel from './MainChatPanel';
import SetupWizard from '@/components/SetupWizard';
import ReviewPanel from '@/components/ReviewPanel';
import DraftsShelf from '@/components/DraftsShelf';
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
  authorTOV?: string;
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
  const [isThinking, setIsThinking] = useState(false);
  const [showWizard, setShowWizard] = useState(true);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [shelfOpen, setShelfOpen] = useState(false);
  const [articleData, setArticleData] = useState<ArticleData>({
    title: '',
    subtitle: '',
    category: '',
    author: '',
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
      setIsThinking(true);
      // Fetch live Webflow schema, mapping and a few sample items to guide the assistant
      const [schemaRes, mappingRes, samplesRes] = await Promise.all([
        fetch('/api/webflow/article-fields'),
        fetch('/api/webflow/mapping'),
        fetch('/api/webflow/sample-articles')
      ]);
      const schemaJson = schemaRes.ok ? await schemaRes.json() : { fields: [] };
      const mappingJson = mappingRes.ok ? await mappingRes.json() : { entries: [] };
      const samplesJson = samplesRes.ok ? await samplesRes.json() : { items: [] };
      const fieldMeta: any[] = Array.isArray(schemaJson.fields) ? schemaJson.fields : [];
      const requiredSlugs: string[] = fieldMeta.filter((f:any)=>f.required).map((f:any)=>f.slug);
      const mappingEntries: Array<{ webflowSlug: string; internal: string }> = Array.isArray(mappingJson.entries) ? mappingJson.entries : [];
      const mapSlugToInternal: Record<string,string> = mappingEntries.reduce((acc:any, e:any)=>{ acc[e.webflowSlug]=e.internal; return acc; }, {});

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
          authorName: articleData.author || '' ,
          webflowSchema: fieldMeta,
          webflowMapping: mappingEntries,
          webflowSamples: (samplesJson.items || []).slice(0,5)
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

        // After AI response, proactively check for missing required fields and ask
        const nextData = { ...articleData, ...(data.articleUpdate || {}) } as any;
        // Keep lightweight chat context for training opt-in later
        const compactMessages = [...chatMessages, { id: Date.now().toString(), role: 'assistant', content: data.response, timestamp: new Date() }];
        setArticleData(prev => ({ ...prev, _chatMessages: compactMessages, notes }));
        const labelFor = (slug: string) => {
          const s = slug.toLowerCase();
          if (s==='name' || s==='title') return 'Titel';
          if (s==='post-body') return 'Indhold';
          if (s==='slug') return 'Slug';
          if (s==='seo-title') return 'SEO titel';
          if (s==='seo-description') return 'SEO beskrivelse';
          if (s==='publish-date') return 'Publiceringsdato';
          if (s==='author') return 'Forfatter';
          if (s==='category') return 'Kategori';
          return slug;
        };
        const missing: string[] = [];
        for (const slug of requiredSlugs) {
          const internal = mapSlugToInternal[slug] || slug;
          const val = nextData[internal];
          const isEmpty = val===undefined || val===null || val===''
            || (Array.isArray(val) && val.length===0);
          if (isEmpty) missing.push(slug);
        }
        if (missing.length>0) {
          const lines = missing.map(sl=>`- ${labelFor(sl)} (${sl})`);
          addChatMessage('assistant', `For at kunne udgive i Webflow mangler vi følgende felter:\n${lines.join('\n')}\n\nSkriv værdierne, så udfylder jeg dem ét for ét.`);
        }
      } else {
        addChatMessage('assistant', 'Beklager, jeg kunne ikke behandle din forespørgsel lige nu. Prøv igen senere.');
      }
    } catch (error) {
      console.error('Error sending message to AI:', error);
      addChatMessage('assistant', 'Der opstod en fejl. Prøv igen senere.');
    } finally {
      setIsThinking(false);
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
      author: '',
      content: '',
      rating: 0,
      tags: [],
      platform: ''
    });
    setNotes('');
    setShowWizard(true);
    
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
      <div className="h-screen bg-[#171717] p-[1%] flex gap-4 relative overflow-hidden">
        {/* Background Spline (non-interactive) */}
        <div className="absolute inset-0 z-0">
          <iframe 
            src="https://my.spline.design/nexbotrobotcharacterconcept-jOiWdJXA0mBgb50nmYl1x0EC/" 
            frameBorder="0" 
            width="100%" 
            height="100%"
            className="w-full h-full"
            title="AI Background"
          />
        </div>
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
            
            {/* Left Shelf (in-flow, animates width) */}
            <div className="h-full overflow-hidden flex-shrink-0" style={{ width: shelfOpen ? 'min(300px, 50vw)' : '0px', transition: 'width 320ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease', opacity: shelfOpen ? 1 : 0 }}>
              <div className={`h-full flex flex-col rounded-xl border border-white/20 overflow-hidden transform`} style={{ transition: 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)', transform: shelfOpen ? 'translateX(0px)' : 'translateX(-8px)' }}>
                <DraftsShelf isOpen={shelfOpen} onSelect={(draft)=>{ setShelfOpen(false); setShowDraftsPanel(false); setChatMessages(draft.messages); setArticleData(draft.articleData); }} onClose={()=> setShelfOpen(false)} />
              </div>
            </div>

            {/* Main Chat with AI */}
            <div
              className="w-[500px] h-full flex-shrink-0 relative z-10"
            >
              {/* Always keep chat visible underneath */}
              <MainChatPanel 
                messages={chatMessages}
                onSendMessage={handleSendMessage}
                articleData={articleData}
                isThinking={isThinking}
                wizardNode={(
                  <div>
                    <div className="flex items-center justify-between p-3">
                      <h2 className="text-white text-base font-medium">Artikel opsætning</h2>
                      <div className="flex items-center gap-2 text-xs">
                        <button onClick={()=>setShowWizard(false)} className="text-white/60 hover:text-white">Skjul</button>
                      </div>
                    </div>
                    {showWizard && chatMessages.length===0 && (
                      <SetupWizard
                      initialData={articleData}
                      onChange={(d:any)=> setArticleData(d)}
                      onComplete={(setup:any)=>{
                        const merged = { ...articleData, ...setup };
                        setArticleData(merged);
                        setShowWizard(false);
                        const summary = `Forfatter: ${setup.author}\nSection: ${setup.category}\nTopic: ${setup.tags?.join(', ')}${setup.rating?`\nRating: ${setup.rating}⭐`:''}${setup.press?`\nPresse: Ja`:''}`;
                        addChatMessage('assistant', `Super. Jeg har sat artiklen op:\n${summary}\n\nSkal vi starte med en arbejdstitel og en indledning?`);
                      }}
                      />
                    )}
                  </div>
                )}
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
            <div className="border border-white/20 rounded-2xl p-1 flex items-center relative z-20" style={{ backgroundColor: 'rgb(0, 0, 0)', height: '50px' }}>
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
                  onClick={() => setReviewOpen(prev=>!prev)}
                  className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-xl transition-colors"
                  title="Review"
                >
                  {/* Eye icon */}
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white">
                    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                </button>
                <button
                  onClick={() => setShelfOpen(prev=>!prev)}
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

            {/* Right flexible spacer (no overlay) */}
            <div className="flex-1 h-full" />
            
            {/* Floating mini menu removed (we use the original left menu) */}

            {/* Right slide-in review drawer (relative to container padding) */}
            <div className={`absolute top-0 bottom-[70px] right-0 z-50 w-[min(520px,90vw)] transition-all duration-300 ${reviewOpen ? 'translate-x-0 opacity-100 pointer-events-auto' : 'translate-x-[110%] opacity-0 pointer-events-none'}`}>
              <div className="h-full flex flex-col bg-[#171717] rounded-xl border border-white/20">
                <div className="overflow-y-auto flex-1 p-[10px]">
                  <ReviewPanel articleData={articleData} frameless />
                </div>
              </div>
            </div>

          </>
        )}
      </div>
    </>
  );
}
