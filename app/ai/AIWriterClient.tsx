'use client';

import { useState, useEffect } from 'react';
import { type UploadedFile } from '@/lib/file-upload-service';
import MainChatPanel from './MainChatPanel';
import SetupWizard from '@/components/SetupWizard';
import ReviewPanel from '@/components/ReviewPanel';
import DraftsShelf from '@/components/DraftsShelf';
import MiniMenu from '@/components/MiniMenu';
import PreviewPanel from './PreviewPanel';
import AuthModal from '@/components/AuthModal';
import DraftsPanel from '@/components/DraftsPanel';
import ChatSearchModal from '@/components/ChatSearchModal';
import { useAuth } from '@/lib/auth-context';
import { saveDraft, getDraft, type ArticleDraft } from '@/lib/firebase-service';
import type { ArticleData } from '@/types/article';

// using shared ArticleData type

export default function AIWriterClient() {
  const { user, logout } = useAuth();
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [showDraftsPanel, setShowDraftsPanel] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [showWizard, setShowWizard] = useState(true);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [shelfOpen, setShelfOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [articleData, setArticleData] = useState<ArticleData>({
    title: '',
    subtitle: '',
    category: '',
    author: '',
    content: '',
    rating: 0,
    tags: [],
    platform: '',
    aiDraft: null,
    previewTitle: '',
    aiSuggestion: null
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
        // Live preview sync: try to extract a working title from the response
        try {
          const m = String(data.response || '').match(/^(?:arbejdstitel|titel)[:\-]\s*(.+)$/im) || String(data.response||'').match(/^#\s+(.+)$/m);
          if (m && m[1]) setArticleData(prev=>({ ...prev, previewTitle: m[1].trim() }));
        } catch {}
        
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
        
        // Update with chat messages and notes, but preserve articleUpdate data
        setArticleData(prev => ({ 
          ...prev, 
          ...(data.articleUpdate || {}), // Ensure articleUpdate is preserved
          _chatMessages: compactMessages, 
          notes 
        }));
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
      platform: '',
      aiDraft: null,
      previewTitle: ''
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

  const userInitials = (() => {
    const name = (user?.displayName || user?.email || '').trim();
    if (!name) return 'U';
    const [first, last] = name.replace(/@.+$/, '').split(/[\s._-]+/);
    const f = (first || '').charAt(0);
    const l = (last || '').charAt(0);
    return (f + (l || '')).toUpperCase();
  })();

  const avatarBg = (() => {
    const seed = (user?.uid || userInitials).split('').reduce((a,c)=>a+c.charCodeAt(0),0);
    const hues = [210, 260, 190, 330, 20, 150];
    const h = hues[seed % hues.length];
    return `hsl(${h} 70% 30%)`;
  })();
  const userName = (user?.displayName || user?.email?.split('@')[0] || 'Bruger');

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
      <div className="h-screen bg-[#171717] p-[1%] flex md:flex-row flex-col gap-4 relative overflow-hidden">
        {/* Background Spline (non-interactive) */}
        <div className="absolute inset-0 z-0 hidden md:block">
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
            
            {/* Shelf - desktop: absolute with outer padding to align with chat area */}
            <div className={`hidden md:block absolute top-[1%] bottom-[1%] left-[1%] z-40`} style={{ width: shelfOpen ? 'min(300px, 50vw)' : '0px', transition: 'width 320ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease', opacity: shelfOpen ? 1 : 0, pointerEvents: shelfOpen ? 'auto' : 'none' }}>
              <div className={`h-full flex flex-col rounded-xl border border-white/20 overflow-hidden transform bg-[#171717]`} style={{ transition: 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)', transform: shelfOpen ? 'translateX(0px)' : 'translateX(-8px)' }}>
                <DraftsShelf isOpen={shelfOpen} onSelect={(draft)=>{ setShelfOpen(false); setShowDraftsPanel(false); setChatMessages(draft.messages); setArticleData(draft.articleData); }} onClose={()=> setShelfOpen(false)} />
              </div>
            </div>
            {/* Mobile shelf */}
            <div className={`md:hidden ${shelfOpen ? 'absolute inset-0 z-40 translate-x-0' : 'hidden'} transition-transform duration-300`}>
              <div className="h-full flex flex-col rounded-none border-t border-white/10 bg-[#171717]">
                <DraftsShelf isOpen={shelfOpen} onSelect={(draft)=>{ setShelfOpen(false); setChatMessages(draft.messages); setArticleData(draft.articleData); }} onClose={()=> setShelfOpen(false)} />
              </div>
            </div>

            {/* Main Chat with AI */}
            <div
              className="md:w-[500px] w-full flex-shrink-0 absolute top-[1%] bottom-[1%] left-[1%] z-10"
              style={{ transition: 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)', transform: shelfOpen ? 'translateX(calc(12px + min(300px, 50vw)))' : 'translateX(0)' }}
            >
              {/* Always keep chat visible underneath */}
              <MainChatPanel 
                messages={chatMessages}
                onSendMessage={handleSendMessage}
                articleData={articleData}
                isThinking={isThinking}
                wizardNode={(
                  <div>
                    {/* Persistent progress */}
                    <button type="button" onClick={()=>setShowWizard(true)} className="w-full px-3 py-2 md:py-3 flex gap-1 items-center cursor-pointer">
                        {(() => {
                          const templateDone = Boolean((articleData as any).template);
                          const sectionLower = String((articleData as any).category || (articleData as any).section || '').toLowerCase();
                          const rawTopic = (articleData as any).topic;
                          const topicsSelected = Array.isArray((articleData as any).topicsSelected)
                            ? (articleData as any).topicsSelected
                            : [];
                          const topicList = Array.isArray(rawTopic)
                            ? rawTopic
                            : typeof rawTopic === 'string'
                              ? rawTopic.split(',').map((t)=>t.trim()).filter(Boolean)
                              : [];
                          const tagList = Array.isArray(articleData.tags) ? articleData.tags : [];
                          const combinedTopics = [...topicList, ...tagList, ...topicsSelected].map((t)=>String(t).trim()).filter(Boolean);
                          const combinedTopicsLower = combinedTopics.map((t)=>t.toLowerCase());
                          const requiresPlatform = sectionLower.includes('serie') || sectionLower.includes('film') || combinedTopicsLower.some((t)=>t.includes('serie') || t.includes('film'));
                          const hasPlatform = Boolean((articleData as any).platform || (articleData as any).streaming_service);
                          const authorDone = Boolean(articleData.author || (articleData as any).authorId);
                          const sectionDone = Boolean((articleData as any).section || articleData.category);
                          const topicDone = topicsSelected.length >=2;
                          const ratingDone = Boolean((articleData as any).rating && Number((articleData as any).rating)>0) || Boolean((articleData as any).ratingSkipped);
                          const pressDone = typeof (articleData as any).press === 'boolean';
                          const segs: boolean[] = [
                            templateDone,
                            authorDone,
                            sectionDone,
                            topicDone
                          ];
                          if (requiresPlatform) {
                            segs.push(hasPlatform);
                          }
                          segs.push(ratingDone);
                          segs.push(pressDone);
                          return segs.map((ok, i)=> (
                            <div key={i} className={`h-1.5 flex-1 rounded ${ok ? 'bg-white shadow-[0_0_10px_#fff]' : 'bg-white/10'}`}></div>
                          ));
                        })()}
                    </button>
                    {/* Animated wizard container */}
                    <div className={`transition-all duration-300 ease-out overflow-x-hidden ${showWizard ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 max-h-0 overflow-hidden pointer-events-none'}`}>
                      <div className="flex items-center justify-between px-3 py-2 md:p-3" style={{display: showWizard ? 'flex' : 'none'}}>
                        <h2 className="text-white text-base font-medium">Artikel opsætning</h2>
                        <div className="flex items-center gap-2 text-xs">
                          <button onClick={()=>setShowWizard(false)} className="text-white/60 hover:text-white">Skjul</button>
                        </div>
                      </div>
                      <SetupWizard
                        initialData={articleData}
                        onChange={(d:any)=> setArticleData(d)}
                        onComplete={async (setup:any)=>{
                          const merged = { ...articleData, ...setup };
                          setArticleData(merged);
                          setShowWizard(false);
                          const summary = `Forfatter: ${setup.author}\nSection: ${setup.category}\nTopic: ${setup.tags?.join(', ')}${setup.rating?`\nRating: ${setup.rating}⭐`:''}${setup.press?`\nPresse: Ja`:''}`;
                          
                          // Auto-generate article if template is 'notes' and we have notes
                          if (setup.template === 'notes' && notes && notes.length > 120) {
                            addChatMessage('assistant', `Super. Jeg har sat artiklen op:\n${summary}\n\nJeg genererer nu artiklen baseret på dine noter...`);
                            // Auto-trigger article generation
                            await handleSendMessage('Generer artikel baseret på mine noter');
                          } else {
                            addChatMessage('assistant', `Super. Jeg har sat artiklen op:\n${summary}\n\nSkal vi starte med en arbejdstitel og en indledning?`);
                          }
                        }}
                      />
                    </div>
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

            {/* Layout placeholder for chat width so the mini‑menu keeps its placement */}
            <div className="hidden md:block md:w-[500px] flex-shrink-0" style={{ height: '1px' }} />
            
            {/* Right Sidebar with action buttons (desktop) */}
            <MiniMenu
              translateX={shelfOpen ? 'translateX(calc(12px + min(300px, 50vw) + 500px + 12px))' : 'translateX(calc(500px + 12px))'}
              onSearch={() => setShowSearchModal(true)}
              onToggleReview={() => setReviewOpen(prev=>!prev)}
              onToggleShelf={() => setShelfOpen(prev=>!prev)}
              onNewArticle={handleNewArticle}
            />

            {/* Right flexible spacer (no overlay) */}
            <div className="flex-1 h-full hidden md:block" />
            
            {/* Floating mini menu removed (we use the original left menu) */}

            {/* Slide-in review drawer (right shelf) with same outer padding as left shelf */}
            <div className={`absolute md:top-[1%] md:bottom-[1%] md:right-[1%] top-0 right-0 bottom-0 ${reviewOpen ? '' : ''} z-50 md:w-[min(520px,90vw)] w-full transition-all duration-300 ${reviewOpen ? 'translate-x-0 opacity-100 pointer-events-auto' : 'translate-x-[110%] opacity-0 pointer-events-none'}`}>
              <div className="h-full flex flex-col bg-[#171717] md:rounded-xl border-l md:border border-white/20">
                {/* Mobile header with close button */}
                <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-white/10">
                  <h2 className="text-white font-medium">Artikel preview</h2>
                  <button onClick={() => setReviewOpen(false)} className="text-white/60 hover:text-white">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                  </button>
                </div>
                <div className="overflow-y-auto flex-1 p-3 md:p-[10px] no-scrollbar">
                  <ReviewPanel articleData={articleData} frameless />
                </div>
              </div>
            </div>

            {/* Mobile bottom bar */}
            <div className="md:hidden fixed bottom-3 left-1/2 -translate-x-1/2 z-50 rounded-2xl border border-white/20 p-1.5 flex items-center gap-1.5 bg-black/90 backdrop-blur-md shadow-lg">
              <button onClick={() => setShelfOpen(prev=>!prev)} className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl hover:bg-white/10 active:bg-white/15 transition-colors min-w-[64px]" aria-label="Mine artikler">
                <div className="grid grid-cols-3 gap-0.5 w-4 h-4">
                  <div className="w-1 h-1 bg-white rounded"></div><div className="w-1 h-1 bg-white rounded"></div><div className="w-1 h-1 bg-white rounded"></div>
                  <div className="w-1 h-1 bg-white rounded"></div><div className="w-1 h-1 bg-white rounded"></div><div className="w-1 h-1 bg-white rounded"></div>
                  <div className="w-1 h-1 bg-white rounded"></div><div className="w-1 h-1 bg-white rounded"></div><div className="w-1 h-1 bg-white rounded"></div>
                </div>
                <span className="text-[10px] text-white/70">Drafts</span>
              </button>
              <button onClick={() => setReviewOpen(prev=>!prev)} className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl hover:bg-white/10 active:bg-white/15 transition-colors min-w-[64px]" aria-label="Review">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white">
                  <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                <span className="text-[10px] text-white/70">Preview</span>
              </button>
              <button onClick={handleNewArticle} className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl hover:bg-white/10 active:bg-white/15 transition-colors min-w-[64px]" aria-label="Ny artikel">
                <div className="relative w-4 h-4">
                  <div className="absolute top-1/2 left-1/2 w-3 h-0.5 bg-white transform -translate-x-1/2 -translate-y-1/2"></div>
                  <div className="absolute top-1/2 left-1/2 w-0.5 h-3 bg-white transform -translate-x-1/2 -translate-y-1/2"></div>
                </div>
                <span className="text-[10px] text-white/70">Ny</span>
              </button>
            </div>

          </>
        )}
      </div>
    </>
  );
}
