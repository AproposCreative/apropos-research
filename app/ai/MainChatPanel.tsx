'use client';

import { useState, useRef, useEffect } from 'react';
import FileDropZone from '@/components/FileDropZone';
import AISuggestions from '@/components/AISuggestions';
import ArticleTemplates from '@/components/ArticleTemplates';
import { type UploadedFile } from '@/lib/file-upload-service';

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
  articleData: any;
  notes: string;
  setNotes: (notes: string) => void;
  onNewGamingArticle: () => void;
  onNewCultureArticle: () => void;
  updateArticleData: (data: any) => void;
}

export default function MainChatPanel({
  messages,
  onSendMessage,
  articleData,
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
  const [showAISuggestions, setShowAISuggestions] = useState(false);
  const [selectedText, setSelectedText] = useState('');
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
    try {
      const response = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: `Generer et kreativt og beskrivende navn for denne artikel-tråd baseret på følgende besked. Navnet skal være kort (2-4 ord), kreativt og fange essensen af artiklen. Svar kun med navnet, intet andet.

Besked: "${message}"`
          }]
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.message) {
          setChatTitle(data.message.trim());
        }
      } else {
        // Fallback to simple title generation
        setChatTitle(generateFallbackTitle(message));
      }
    } catch (error) {
      // Fallback to simple title generation
      setChatTitle(generateFallbackTitle(message));
    }
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
      setShowAISuggestions(true);
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
    setShowAISuggestions(false);
    setSelectedText('');
  };

  const handleTemplateSelect = (template: any) => {
    // Update article data with template info
    updateArticleData({
      title: '',
      subtitle: '',
      category: template.category,
      content: '',
      tags: template.tags,
      platform: ''
    });

    // Send template selection message first
    const selectionMessage = `${template.name} template valgt!`;
    onSendMessage(selectionMessage);
    
    // Then send the full template content
    setTimeout(() => {
      const templateMessage = `${template.content}\n\nEr du klar til at skrive? Skriv "go" når du er klar!`;
      onSendMessage(templateMessage);
    }, 500);
  };

  return (
    <>
      <div className="w-full h-full rounded-xl outline outline-[1.50px] outline-offset-[-1.50px] outline-zinc-800 flex flex-col justify-between font-poppins" style={{ backgroundColor: 'rgb(0, 0, 0)' }}>
        {/* Top Bar */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <h1 className="text-white text-lg font-medium">{chatTitle}</h1>
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
        <div className="flex-1 overflow-y-auto space-y-4">
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
                    <p className="text-sm whitespace-pre-wrap text-left">{message.content}</p>
                    
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
                  
                  {/* Copy button for AI messages */}
                  {message.role === 'assistant' && (
                    <button
                      onClick={() => copyToClipboard(message.content)}
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 w-6 h-6 bg-black/80 hover:bg-black text-white rounded flex items-center justify-center text-xs"
                      title="Kopier tekst"
                    >
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                        <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                      </svg>
                    </button>
                  )}
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

        {/* Article Templates */}
        {messages.length === 0 && (
          <div className="px-4 pb-2">
            <ArticleTemplates onSelectTemplate={handleTemplateSelect} />
          </div>
        )}

        {/* Input Area */}
        <div className="p-4 rounded-xl flex flex-col gap-3 bg-[#171717] mx-[10px] mb-[10px]">
          <div className="relative">
            <textarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder=""
              className="w-full bg-transparent text-white text-sm resize-none outline-none relative z-10"
              rows={2}
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
      
      {showAISuggestions && (
        <AISuggestions
          text={selectedText}
          context={articleData.category || 'Generel artikel'}
          onSuggestionSelect={handleSuggestionSelect}
          onClose={() => {
            setShowAISuggestions(false);
            setSelectedText('');
          }}
        />
      )}
    </>
  );
}
