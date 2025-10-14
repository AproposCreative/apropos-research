'use client';

import { useState, useRef, useEffect, useLayoutEffect, ReactNode } from 'react';
import WizardAutoHeight from '@/components/ui/WizardAutoHeight';
import FileDropZone from '@/components/FileDropZone';
import ArticleTemplates from '@/components/ArticleTemplates';
import AuthorSelection from '@/components/AuthorSelection';
import ArticleSuggestions from '@/components/ArticleSuggestions';
import ArticlePicker from '@/components/ArticlePicker';
import CategorySelection from '@/components/CategorySelection';
import { WebflowAuthor } from '@/lib/webflow-service';
import WebflowPublishPanel from '@/components/WebflowPublishPanel';
import { WebflowArticleFields } from '@/lib/webflow-service';
import { type UploadedFile } from '@/lib/file-upload-service';
import type { ArticleData } from '@/types/article';
type LocalArticleData = ArticleData & { aiSuggestion?: { type: 'rating'; title: string; description: string } | null };

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  files?: UploadedFile[];
}

interface MainChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (message: string, files?: UploadedFile[]) => void;
  articleData: LocalArticleData;
  isThinking?: boolean;
  wizardNode?: ReactNode; // optional docket wizard rendered above input
  notes: string;
  setNotes: (notes: string) => void;
  onNewGamingArticle: () => void;
  onNewCultureArticle: () => void;
  updateArticleData: (data: Partial<LocalArticleData>) => void;
}

export default function MainChatPanel({
  messages,
  onSendMessage,
  articleData,
  isThinking,
  wizardNode,
  notes,
  setNotes,
  onNewGamingArticle,
  onNewCultureArticle,
  updateArticleData
}: MainChatPanelProps) {
  const [inputMessage, setInputMessage] = useState('');
  const [hoveredMessage, setHoveredMessage] = useState<string | null>(null);
  const [chatTitle, setChatTitle] = useState('Ny artikkel');
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [showFileDrop, setShowFileDrop] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  // const [showAISuggestions, setShowAISuggestions] = useState(false);
  const [showPublishPanel, setShowPublishPanel] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [selectionStep, setSelectionStep] = useState<'category' | 'template' | 'author' | 'chat'>('category');
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [selectedAuthor, setSelectedAuthor] = useState<WebflowAuthor | null>(null);
  const [showArticlePicker, setShowArticlePicker] = useState(false);
  const [trendingTemplate, setTrendingTemplate] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
    
    // Reset title if no messages
    if (messages.length === 0 && chatTitle !== 'Ny artikkel') {
      setChatTitle('Ny artikkel');
    }
    
    // Generate chat title from first user message using AI
    if (messages.length > 0 && chatTitle === 'Ny artikkel') {
      const firstUserMessage = messages.find(msg => msg.role === 'user');
      if (firstUserMessage) {
        generateSmartTitle(firstUserMessage.content);
      }
    }
  }, [messages, chatTitle]);

  // Reset selection step when messages are cleared (new article)
  useEffect(() => {
    if (messages.length === 0) {
      setSelectionStep('category');
      setSelectedCategory(null);
      setSelectedTemplate(null);
      setSelectedAuthor(null);
      setShowArticlePicker(false);
      setTrendingTemplate(null);
    }
  }, [messages.length]);

  // Auto-save functionality
  const saveToLocalStorage = () => {
    try {
      const chatData = {
        messages,
        chatTitle,
        notes,
        articleData,
        lastModified: new Date().toISOString()
      };
      localStorage.setItem('ai-writer-draft', JSON.stringify(chatData));
      setLastSaved(new Date());
    } catch (error) {
      console.error('Failed to save draft:', error);
    }
  };

  const loadFromLocalStorage = () => {
    try {
      const savedData = localStorage.getItem('ai-writer-draft');
      if (savedData) {
        const parsed = JSON.parse(savedData);
        if (parsed.messages && Array.isArray(parsed.messages)) {
          // Convert timestamp strings back to Date objects
          const messagesWithDates = parsed.messages.map((msg: any) => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          }));
          
          // Update parent component with loaded data
          if (parsed.messages.length > 0) {
            // Note: This would need to be passed up to parent component
            // For now, we'll just set the chat title
            if (parsed.chatTitle && parsed.chatTitle !== 'Ny artikkel') {
              setChatTitle(parsed.chatTitle);
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to load draft:', error);
    }
  };

  // Auto-save when messages change (with debounce)
  useEffect(() => {
    if (messages.length > 0) {
      // Clear existing timeout
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
      
      // Set new timeout for auto-save (2 seconds after last change)
      autoSaveTimeoutRef.current = setTimeout(() => {
        setIsAutoSaving(true);
        saveToLocalStorage();
        setTimeout(() => setIsAutoSaving(false), 1000); // Show saving indicator for 1 second
      }, 2000);
    }

    // Cleanup timeout on unmount
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [messages, chatTitle, notes, articleData]);

  // Load saved data on component mount
  useEffect(() => {
    loadFromLocalStorage();
  }, []);

  // Add text selection listener
  useEffect(() => {
    document.addEventListener('mouseup', handleTextSelection);
    return () => {
      document.removeEventListener('mouseup', handleTextSelection);
    };
  }, []);

  const generateSmartTitle = async (message: string) => {
    // Lightweight local generation to avoid hitting the chat API with an incompatible payload
    setChatTitle(generateFallbackTitle(message));
  };

  const generateFallbackTitle = (message: string) => {
    // Extract key words and create a short title
    const words = message.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3);
    
    // Take first 2-3 meaningful words
    const titleWords = words.slice(0, 3);
    
    if (titleWords.length === 0) return 'Ny artikel';
    
    return titleWords
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputMessage.trim()) {
      onSendMessage(inputMessage);
      setInputMessage('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (inputMessage.trim()) {
        onSendMessage(inputMessage);
        setInputMessage('');
      }
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // Show temporary success feedback
      const tempElement = document.createElement('div');
      tempElement.textContent = 'Kopieret!';
      tempElement.className = 'fixed top-4 right-4 bg-green-600 text-white px-3 py-2 rounded-lg text-sm z-50';
      document.body.appendChild(tempElement);
      setTimeout(() => {
        document.body.removeChild(tempElement);
      }, 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleFileUploaded = (file: UploadedFile, content?: string) => {
    setUploadedFiles(prev => [...prev, file]);
    
    // Auto-send message with file info
    const fileMessage = content 
      ? `Jeg har uploadet en fil: ${file.name}\n\nIndhold:\n${content}`
      : `Jeg har uploadet en fil: ${file.name}`;
    
    onSendMessage(fileMessage, [file]);
    setShowFileDrop(false);
  };

  const handleFileError = (error: string) => {
    // Show error notification
    const tempElement = document.createElement('div');
    tempElement.textContent = error;
    tempElement.className = 'fixed top-4 right-4 bg-red-600 text-white px-3 py-2 rounded-lg text-sm z-50';
    document.body.appendChild(tempElement);
    setTimeout(() => {
      document.body.removeChild(tempElement);
    }, 3000);
  };

  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 10) {
      setSelectedText(selection.toString().trim());
      // AI suggestions disabled
    }
  };

  const handleSuggestionSelect = (suggestion: string) => {
    // Replace the selected text with the suggestion
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(suggestion));
      selection.removeAllRanges();
    }
    // AI suggestions disabled
    setSelectedText('');
  };

  // Parse assistant message for numbered suggestions like "1. **Title**: description"
  const parseNumberedSuggestions = (text: string) => {
    const lines = text.split(/\r?\n/);
    const items: Array<{ title: string; description: string; full: string }>=[];
    const re = /^\s*\d+\.\s+\*\*(.+?)\*\*\s*:\s*(.*)$/;
    for (const line of lines) {
      const m = line.match(re);
      if (m) {
        const title = m[1].trim();
        const description = m[2].trim();
        items.push({ title, description, full: `${title}: ${description}` });
      }
    }
    return items;
  };

  // Detect enumererede spørgsmål (1), 2), 3)) og klassificér dem, så vi kan vise klikbare valg
  type ParsedQuestion = { kind: 'authorProfile' | 'platform' | 'rating'; label: string };
  const parseEnumeratedQuestions = (text: string): ParsedQuestion[] => {
    const lines = text.split(/\r?\n/).map(s => s.trim());
    const q: ParsedQuestion[] = [];
    for (const line of lines) {
      const m = line.match(/^\d+[\).]\s*(.+)$/);
      if (!m) continue;
      const body = m[1].toLowerCase();
      if (/forfatterprofil|tov|ironisk|sanselig|analytisk|profil/.test(body)) {
        q.push({ kind: 'authorProfile', label: m[1] });
        continue;
      }
      if (/platform|netflix|viaplay|disney|prime|apple|hbo|max|biograf/.test(body)) {
        q.push({ kind: 'platform', label: m[1] });
        continue;
      }
      if (/stjerner|rating|vurdering/.test(body)) {
        q.push({ kind: 'rating', label: m[1] });
        continue;
      }
    }
    return q;
  };

  // Fancy thinking indicator text rotation
  const thinkingTexts = [
    'Finder vinklen …',
    'Skruer sproget op til 11 …',
    'Kalibrerer tonen …',
    'Reflekterer over virkeligheden …',
    'Render Apropos-magien …'
  ];
  const [thinkingText, setThinkingText] = useState<string>(thinkingTexts[0]);
  const [fadeIn, setFadeIn] = useState<boolean>(true);

  useEffect(() => {
    if (!isThinking) return;
    let isMounted = true;
    // choose initial random
    const pick = () => thinkingTexts[Math.floor(Math.random() * thinkingTexts.length)];
    setThinkingText(pick());
    setFadeIn(true);

    const interval = setInterval(() => {
      if (!isMounted) return;
      setFadeIn(false);
      // after fade out, swap text and fade in
      const t = setTimeout(() => {
        if (!isMounted) return;
        setThinkingText(pick());
        setFadeIn(true);
      }, 300);
      return () => clearTimeout(t);
    }, 2200);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isThinking]);

  // Removed generic multiple-choice heuristics to avoid irrelevant prompts

  const handlePublishToWebflow = async (articleData: WebflowArticleFields) => {
    try {
      const response = await fetch('/api/webflow/publish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(articleData),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        const message = result?.error || result?.message || 'Failed to publish article';
        const details = result?.details ? `\n${result.details}` : '';
        throw new Error(`${message}${details}`);
      }
      
      // Show success message
      const tempElement = document.createElement('div');
      tempElement.textContent = `Artikel udgivet til Webflow! ID: ${result.articleId}`;
      tempElement.className = 'fixed top-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg text-sm z-50';
      document.body.appendChild(tempElement);
      setTimeout(() => {
        document.body.removeChild(tempElement);
      }, 5000);

      setShowPublishPanel(false);
    } catch (error) {
      console.error('Publish error:', error);
      const msg = error instanceof Error ? error.message : 'Fejl ved udgivelse af artikel';
      alert(msg);
    }
  };

  const handleCategorySelect = (category: any) => {
    setSelectedCategory(category);
    setSelectionStep('template');
    
    // Update article data with category info
    updateArticleData({
      title: '',
      subtitle: '',
      category: category.name,
      content: '',
      tags: [category.name],
      platform: ''
    });
  };

  const handleTrendingCategorySelect = (category: any, articles: any[]) => {
    setSelectedCategory(category);
    setShowArticlePicker(true);
    setTrendingTemplate({
      id: `trending-${category.name.toLowerCase()}`,
      name: `Trending ${category.name}`,
      category: category.name,
      articles: articles,
      content: `Skriv en ${category.name.toLowerCase()}-artikel baseret på de aktuelle trends.\n\nFokus på:\n- Hvad der trending inden for ${category.name.toLowerCase()}\n- Din unikke vinkel på emnet\n- Apropos' karakteristiske tone\n\nInspiration fra ${articles.length} artikler fra andre medier.`,
      tags: [category.name, 'Trending', 'Aktuel'],
      trending: true,
      articleCount: articles.length
    });
  };

  const handleTemplateSelect = (template: any) => {
    // Check if this is a trending template with articles
    if (template.trending && template.articles && template.articles.length > 0) {
      setTrendingTemplate(template);
      setShowArticlePicker(true);
    } else {
      // Regular template - proceed directly to author selection
      setSelectedTemplate(template);
      setSelectionStep('author');
      
      // Update article data with template info
      updateArticleData({
        title: '',
        subtitle: '',
        category: selectedCategory?.name || template.category,
        content: '',
        tags: template.tags,
        platform: ''
      });
    }
  };

  const handleArticleSelect = (article: any) => {
    if (trendingTemplate) {
      // Create template with selected article as inspiration
      const templateWithArticle = {
        ...trendingTemplate,
        content: `${trendingTemplate.content}\n\n**Inspiration fra valgt artikel:**\n"${article.title}" fra ${article.source}\n\n${article.content.substring(0, 300)}...`
      };
      
      setSelectedTemplate(templateWithArticle);
      setSelectionStep('author');
      
      // Update article data with template info
      updateArticleData({
        title: '',
        subtitle: '',
        category: trendingTemplate.category,
        content: '',
        tags: trendingTemplate.tags,
        platform: ''
      });
    }
    
    setShowArticlePicker(false);
    setTrendingTemplate(null);
  };

  const handleAuthorSelect = (author: WebflowAuthor) => {
    setSelectedAuthor(author);
    setSelectionStep('chat');
    
    // Update article data with author info and TOV
    updateArticleData({
      author: author.name,
      authorTOV: author.tov || ''
    });

    // Send initial message with selections
    const selectionMessage = `${selectedTemplate?.name} template valgt!\nForfatter: ${author.name}`;
    onSendMessage(selectionMessage);
    
    // Then send the full template content with TOV info
    setTimeout(() => {
      const tovInfo = author?.tov || 'Apropos stil';
      const templateMessage = `${selectedTemplate?.content}\n\n**Forfatter TOV:** ${tovInfo}\n\nLad os starte! Hvad vil du gerne skrive om?`;
      onSendMessage(templateMessage);
    }, 500);
  };


  return (
    <>
      <div className="w-full h-full rounded-xl outline outline-[1.50px] outline-offset-[-1.50px] outline-zinc-800 flex flex-col justify-between font-poppins" style={{ backgroundColor: 'rgb(0, 0, 0)' }}>
        {/* Top Bar */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <h1 className="text-white text-base font-medium">
              {chatTitle === 'Ny artikkel' ? (
                <span 
                  className="bg-gradient-to-r from-white/20 via-white/70 to-white/20 bg-clip-text text-transparent"
                  style={{ 
                    backgroundSize: '200% 100%', 
                    animation: 'gradient-shift 4s ease-in-out infinite' 
                  }}
                >
                  Ny Apropos Magazine artikkel
                </span>
              ) : (
                chatTitle
              )}
            </h1>
            {isAutoSaving && (
              <span className="text-xs text-green-400 animate-pulse">Gemmer...</span>
            )}
            {lastSaved && !isAutoSaving && (
              <span className="text-xs text-green-400">
                Gemt {lastSaved.toLocaleTimeString('da-DK', { 
                  hour: '2-digit', 
                  minute: '2-digit' 
                })}
              </span>
            )}
          </div>
        </div>
      
      <div className="flex flex-col justify-start gap-4 p-[10px] flex-1 overflow-hidden">
        {/* Dynamic Chat Messages */}
        <div className="flex-1 overflow-y-auto space-y-4 nice-scrollbar">
          {messages.map((message, index) => (
            <div
              key={message.id}
              id={`message-${index}`}
              className={`flex justify-start transition-all duration-500 ${
                index === messages.length - 1 ? 'animate-message-glow' : ''
              }`}
              style={{
                animation: index === messages.length - 1 ? 'message-glow 1.5s ease-out' : undefined
              }}
              onMouseEnter={() => setHoveredMessage(message.id)}
              onMouseLeave={() => setHoveredMessage(null)}
            >
              <div className="max-w-[80%]" style={{ paddingLeft: '8px', paddingRight: '8px' }}>
                <div className="relative group">
                  <div
                    className={`transition-all duration-300 ${
                      message.role === 'user'
                        ? `bg-black text-white py-2 px-2 rounded-lg border border-white/50 border-thin hover:shadow-lg hover:shadow-white/10 hover:border-white/70`
                        : message.content.includes('template valgt!')
                          ? `bg-black text-white p-4 rounded-lg border border-white/20 border-thin`
                          : `text-white py-3 rounded-lg hover:bg-white/5`
                    }`}
                  >
                    {message.role === 'assistant' && (parseNumberedSuggestions(message.content).length > 0 || parseEnumeratedQuestions(message.content).length > 0) ? (
                      <div className="space-y-2">
                        {/* Numbered suggestion cards */}
                        {parseNumberedSuggestions(message.content).map((item, idx) => (
                          <div
                            key={idx}
                            className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-lg transition-all cursor-pointer group"
                            onClick={() => onSendMessage(item.full)}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <h4 className="text-white text-sm font-medium mb-1 line-clamp-2 group-hover:text-blue-300 transition-colors">
                                  {item.title}
                                </h4>
                                <p className="text-white/40 text-xs line-clamp-2">
                                  {item.description}
                                </p>
                              </div>
                              <div className="flex-shrink-0">
                                <svg 
                                  className="w-4 h-4 text-white/30 group-hover:text-blue-400 transition-colors" 
                                  fill="none" 
                                  stroke="currentColor" 
                                  viewBox="0 0 24 24"
                                >
                                  <path 
                                    strokeLinecap="round" 
                                    strokeLinejoin="round" 
                                    strokeWidth={2} 
                                    d="M9 5l7 7-7 7" 
                                  />
                                </svg>
                              </div>
                            </div>
                          </div>
                        ))}
                        {/* Enumerated question helper chips */}
                        {parseEnumeratedQuestions(message.content).length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-1">
                            {parseEnumeratedQuestions(message.content).map((q, idx) => (
                              <div key={`q-${idx}`} className="flex flex-wrap gap-2">
                                {q.kind === 'authorProfile' && ['Frederik Emil (ironisk)','Liv Brandt (sanselig)','Eva Linde (analytisk)'].map((o,i)=> (
                                  <button key={`opt-a-${i}`} onClick={() => onSendMessage(o)} className="px-3 py-1.5 rounded-lg text-xs transition-all border bg-white/5 text-white border-white/10 hover:border-white/20 hover:bg-white/10">{o}</button>
                                ))}
                                {q.kind === 'platform' && ['Netflix','Viaplay','Disney+','Prime Video','Apple TV+','HBO Max','Biograf'].map((o,i)=> (
                                  <button key={`opt-p-${i}`} onClick={() => onSendMessage(o)} className="px-3 py-1.5 rounded-lg text-xs transition-all border bg-white/5 text-white border-white/10 hover:border-white/20 hover:bg-white/10">{o}</button>
                                ))}
                                {q.kind === 'rating' && [1,2,3,4,5,6].map((o,i)=> (
                                  <button key={`opt-r-${i}`} onClick={() => onSendMessage(`${o} stjerner`)} className="px-3 py-1.5 rounded-lg text-xs transition-all border bg-white/5 text-white border-white/10 hover:border-white/20 hover:bg-white/10">{o} ⭐</button>
                                ))}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap text-left">{message.content}</p>
                    )}
                    
                    {/* Show uploaded files */}
                    {message.files && message.files.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {message.files.map((file) => (
                          <div key={file.id} className="flex items-start gap-2">
                            {file.type.startsWith('image/') ? (
                              <img
                                src={file.url}
                                alt={file.name}
                                className="max-w-[200px] max-h-[150px] rounded-lg object-cover border border-white/20"
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex items-center gap-2 p-2 bg-white/5 rounded-lg border border-white/10">
                                <svg className="w-4 h-4 text-white/60" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                                </svg>
                                <span className="text-xs text-white/80">{file.name}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  {/* Copy button removed temporarily per request */}
                </div>
                
                <div className={`transition-all duration-300 ease-in-out ${
                  hoveredMessage === message.id ? 'opacity-70 translate-y-0' : 'opacity-0 -translate-y-1'
                }`}>
                  {hoveredMessage === message.id && (
                    <p className="text-xs mt-1 text-left text-white">
                      {message.timestamp.toLocaleTimeString('da-DK', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
          {isThinking && (
            <div className="flex justify-start">
              <div className="max-w-[80%]" style={{ paddingLeft: '8px', paddingRight: '8px' }}>
                <div className="text-white py-3 rounded-lg">
                  <span
                    className={`text-sm inline-block [text-shadow:0_0_8px_rgba(255,255,255,0.35)] transition-opacity duration-300 ${fadeIn ? 'opacity-100' : 'opacity-0'}`}
                  >
                    {thinkingText}
                  </span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

      </div>

        {/* File Drop Zone */}
        {showFileDrop && (
          <div className="mx-[10px] mb-2">
            <FileDropZone
              onFileUploaded={handleFileUploaded}
              onError={handleFileError}
              className="min-h-[120px]"
            />
          </div>
        )}

        {/* Article Picker - Directly under top bar */}
        {showArticlePicker && trendingTemplate && (
          <div className="flex flex-col max-h-[75vh] mx-[10px]">
            <div className="flex items-center gap-4 px-0 py-2">
              <button
                onClick={() => {
                  setSelectionStep('category');
                  setShowArticlePicker(false);
                  setTrendingTemplate(null);
                  setSelectedCategory(null);
                }}
                className="px-3 py-1.5 text-white text-xs font-medium rounded-lg transition-colors duration-200 border border-white/20 flex items-center justify-center"
                style={{ backgroundColor: 'rgb(0, 0, 0)' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgb(20, 20, 20)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgb(0, 0, 0)'}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h3 className="text-white text-lg font-medium">Vælg inspiration til {trendingTemplate?.name}</h3>
            </div>
            <div className="px-0 py-2 overflow-y-auto">
              <ArticlePicker
                articles={trendingTemplate.articles || []}
                onSelectArticle={handleArticleSelect}
                onClose={() => {
                  setShowArticlePicker(false);
                  setTrendingTemplate(null);
                }}
                templateName={trendingTemplate.name}
              />
            </div>
          </div>
        )}

        {/* Selection Flow */}
        {messages.length === 0 && !showArticlePicker && (
          <div className="pb-2 px-4">
            {selectionStep === 'category' && null}

            {selectionStep === 'template' && (
              <div>
                <div className="flex items-center gap-4 mb-4">
                  <button
                    onClick={() => {
                      setSelectionStep('category');
                      setSelectedCategory(null);
                    }}
                    className="px-3 py-1.5 text-white text-xs font-medium rounded-lg transition-colors duration-200 border border-white/20 flex items-center justify-center"
                    style={{ backgroundColor: 'rgb(0, 0, 0)' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgb(20, 20, 20)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgb(0, 0, 0)'}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <h3 className="text-white text-lg font-medium">Vælg template</h3>
                </div>
                <ArticleTemplates 
                  onSelectTemplate={handleTemplateSelect} 
                  selectedCategory={selectedCategory?.name}
                />
              </div>
            )}
            
            {selectionStep === 'author' && (
              <div className="space-y-4">
                <h3 className="text-white text-lg font-medium mb-4">Vælg forfatter</h3>
                <div className="flex gap-2 items-center">
                  {/* Back button on same line */}
                  <button
                    onClick={() => {
                      setSelectionStep('category');
                      setSelectedTemplate(null);
                      setSelectedCategory(null);
                      setShowArticlePicker(false);
                      setTrendingTemplate(null);
                    }}
                    className="px-3 py-1.5 text-white text-xs font-medium rounded-lg transition-colors duration-200 border border-white/20 flex items-center justify-center"
                    style={{ backgroundColor: 'rgb(0, 0, 0)' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgb(20, 20, 20)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgb(0, 0, 0)'}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  
                  {/* Author pills inline */}
                  <div className="flex flex-wrap gap-2">
                    <AuthorSelection onAuthorSelected={handleAuthorSelect} />
                  </div>
                </div>
                
                {/* Show article suggestions after template selection */}
                {selectedTemplate && (
                  <ArticleSuggestions 
                    category={selectedTemplate.category}
                    tags={selectedTemplate.tags}
                    onSelectSuggestion={(suggestion) => {
                      // Copy title to help user
                      const message = `Jeg vil gerne skrive en ${selectedTemplate.name.toLowerCase()} om "${suggestion.title}" (inspiration fra ${suggestion.source})`;
                      onSendMessage(message);
                    }}
                  />
                )}
              </div>
            )}
            
          </div>
        )}

        {/* Docket wizard (non-overlay) */}
        {wizardNode && (
          <WizardAutoHeight>
            {wizardNode}
          </WizardAutoHeight>
        )}

        {/* Input Area */}
        <div className="p-3 md:p-4 rounded-xl flex flex-col gap-2 md:gap-3 bg-[#171717] mx-[10px] mb-[10px]">
          {/* Publish Button */}
          {articleData.title && articleData.content && (
            <div className="flex justify-end">
              <button
                onClick={() => setShowPublishPanel(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
              >
                Udgiv til Webflow
              </button>
            </div>
          )}
          <div className="relative">
            <textarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder=""
              className="w-full bg-transparent text-white text-sm md:text-sm resize-none outline-none relative z-10"
              rows={3}
              style={{ minHeight: '60px' }}
            />
            {!inputMessage && (
              <div className="absolute inset-0 pointer-events-none flex items-start pt-1">
                <span 
                  className="text-sm bg-gradient-to-r from-white/20 via-white/70 to-white/20 bg-clip-text text-transparent"
                  style={{
                    backgroundSize: '200% 100%',
                    animation: 'gradient-shift 4s ease-in-out infinite'
                  }}
                >
                  Lad os starte med din artikel
                </span>
              </div>
            )}
          </div>
          
          <div className="flex justify-between items-center">
            <div className="flex gap-3">
              <button 
                onClick={() => setShowFileDrop(!showFileDrop)}
                className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
                  showFileDrop ? 'text-blue-400 bg-blue-400/10' : 'text-white hover:bg-gray-700'
                }`}
                title="Upload filer"
              >
                <span className="text-lg">+</span>
              </button>
              <button className="w-6 h-6 flex items-center justify-center text-white hover:bg-gray-700 rounded transition-colors">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" />
                </svg>
              </button>
              <button className="w-6 h-6 flex items-center justify-center text-white hover:bg-gray-700 rounded transition-colors">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            
            <button 
              onClick={handleSubmit}
              disabled={!inputMessage.trim()}
              className="w-8 h-8 bg-white rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4 text-gray-800" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
      
      {/* AI suggestions removed per UX request */}

      {/* Rating Suggestion (removed) */}

      {/* Webflow Publish Panel overlay removed — publishing lives in Review drawer */}
    </>
  );
}

// WizardAutoHeight moved to components/ui/WizardAutoHeight
