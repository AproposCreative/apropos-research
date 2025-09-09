'use client';
import { useState, useEffect } from 'react';

interface Draft {
  id: string;
  title: string;
  originalTitle: string;
  source: string;
  status: 'completed' | 'in-progress' | 'pending';
  createdAt: string;
  summary: string;
  suggestions: string[];
  prompt?: string;
  notes?: string;
  isEditing?: boolean;
  aiGenerated?: boolean;
  contentAnalysis?: {
    focusAreas: string[];
  };
  trendData?: {
    trend: string;
    angle: string;
    audience: string;
  };
}

export default function AIDrafts() {
  const [drafts, setDrafts] = useState<Draft[]>([
    {
      id: '1',
      title: 'AI Draft: Musikens fremtid i streaming-æraen',
      originalTitle: 'Bon Iver hiver knebent sejren i hus',
      source: 'GAFFA',
      status: 'completed',
      createdAt: '2025-01-15T10:30:00Z',
      summary: 'AI-genereret artikel baseret på original GAFFA artikel om Bon Iver...',
      suggestions: [
        'Tilføj mere kontekst om streaming-platformenes rolle',
        'Inkluder statistikker om musikindustrien',
        'Uddyb Bon Ivers unikke tilgang til musikproduktion'
      ],
      prompt: 'Skriv en dybdegående artikel om musikens fremtid i streaming-æraen, baseret på Bon Ivers seneste album. Fokuser på hvordan streaming har ændret musikindustrien og kunstnernes tilgang til at skabe musik.',
      notes: 'Vigtigt at inkludere statistikker fra IFPI og Spotify. Overvej at interview musikproducenter.'
    },
    {
      id: '2', 
      title: 'AI Draft: Klovn-seriens evolution gennem 10 sæsoner',
      originalTitle: "'Klovn' er ved at æde sin egen hale",
      source: 'SOUNDVENUE',
      status: 'in-progress',
      createdAt: '2025-01-15T09:15:00Z',
      summary: 'AI-genereret artikel der analyserer Klovn-seriens udvikling...',
      suggestions: [
        'Fokuser mere på karakterudvikling',
        'Tilføj sammenligning med andre danske komedieserier',
        'Inkluder citater fra skuespillerne'
      ],
      prompt: 'Analyser Klovn-seriens evolution gennem 10 sæsoner. Fokuser på karakterudvikling, humorstil og hvordan serien har påvirket dansk komedie.',
      notes: 'Kontakt Frank Hvam og Casper Christensen for kommentarer. Se også andre danske komedieserier som reference.'
    }
  ]);

  // Load drafts from localStorage on mount
  useEffect(() => {
    const savedDrafts = localStorage.getItem('aiDrafts');
    if (savedDrafts) {
      try {
        setDrafts(JSON.parse(savedDrafts));
      } catch (error) {
        console.error('Error loading drafts:', error);
      }
    }
  }, []);

  // Save drafts to localStorage whenever drafts change
  useEffect(() => {
    localStorage.setItem('aiDrafts', JSON.stringify(drafts));
  }, [drafts]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-600 dark:text-green-400 bg-green-100/70 dark:bg-green-900/30';
      case 'in-progress': return 'text-yellow-600 dark:text-yellow-400 bg-yellow-100/70 dark:bg-yellow-900/30';
      case 'pending': return 'text-blue-600 dark:text-blue-400 bg-blue-100/70 dark:bg-blue-900/30';
      default: return 'text-slate-600 dark:text-slate-400 bg-slate-100/70 dark:bg-slate-800/70';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed': return 'Færdig';
      case 'in-progress': return 'I behandling';
      case 'pending': return 'Afventer';
      default: return 'Ukendt';
    }
  };

  const toggleEdit = (draftId: string) => {
    setDrafts(prev => prev.map(draft => 
      draft.id === draftId 
        ? { ...draft, isEditing: !draft.isEditing }
        : draft
    ));
  };

  const updateDraft = (draftId: string, field: keyof Draft, value: string) => {
    setDrafts(prev => prev.map(draft => 
      draft.id === draftId 
        ? { ...draft, [field]: value }
        : draft
    ));
  };

  const saveDraft = (draftId: string) => {
    setDrafts(prev => prev.map(draft => 
      draft.id === draftId 
        ? { ...draft, isEditing: false }
        : draft
    ));
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // You could add a toast notification here
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const deleteDraft = (draftId: string) => {
    if (confirm('Er du sikker på at du vil slette denne AI draft?')) {
      setDrafts(prev => prev.filter(draft => draft.id !== draftId));
    }
  };

  const deleteAllDrafts = () => {
    if (drafts.length === 0) return;
    
    if (confirm(`Er du sikker på at du vil slette alle ${drafts.length} AI drafts? Denne handling kan ikke fortrydes.`)) {
      setDrafts([]);
    }
  };

  return (
    <div className="space-y-6">
      {/* AI Drafts Header */}
      <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl rounded-2xl p-6 border border-slate-200/50 dark:border-slate-700/50 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
              AI Drafts
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              {drafts.length} artikel{drafts.length !== 1 ? 'er' : ''} i AI-processen
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button className="px-4 py-2 bg-slate-100/70 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200/70 dark:hover:bg-slate-700/70 transition-colors duration-300 border border-slate-300/50 dark:border-slate-600/50">
              Eksporter alle
            </button>
            {drafts.length > 0 && (
              <button 
                onClick={deleteAllDrafts}
                className="px-4 py-2 bg-red-100/70 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-200/70 dark:hover:bg-red-800/40 transition-colors duration-300 border border-red-300/50 dark:border-red-600/50"
              >
                Slet alle
              </button>
            )}
            <button className="px-6 py-2 bg-gradient-to-r from-slate-600 to-slate-700 text-white rounded-lg hover:from-slate-700 hover:to-slate-800 transition-all duration-300 shadow-lg">
              Ny AI Draft
            </button>
          </div>
        </div>
      </div>

      {/* Draft Cards */}
      <div className="grid gap-4">
        {drafts.map((draft) => (
          <div 
            key={draft.id}
            className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl rounded-2xl p-6 border border-slate-200/50 dark:border-slate-700/50 shadow-lg hover:shadow-xl transition-all duration-300"
          >
            {/* Draft Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">
                  {draft.title}
                </h3>
                <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
                  <span>Baseret på: {draft.originalTitle}</span>
                  <span>•</span>
                  <span className="px-2 py-1 bg-slate-100/70 dark:bg-slate-800/70 text-slate-600 dark:text-slate-400 rounded-full border border-slate-300/50 dark:border-slate-600/50">
                    {draft.source}
                  </span>
                  <span>•</span>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(draft.status)}`}>
                    {getStatusText(draft.status)}
                  </span>
                  {draft.aiGenerated && (
                    <>
                      <span>•</span>
                      <span className="px-2 py-1 bg-gradient-to-r from-purple-100/70 to-pink-100/70 dark:from-purple-900/30 dark:to-pink-900/30 text-purple-700 dark:text-purple-300 rounded-full border border-purple-300/50 dark:border-purple-600/50 text-xs font-medium">
                        🤖 AI Genereret
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="text-right text-sm text-slate-500 dark:text-slate-500">
                {new Date(draft.createdAt).toLocaleDateString('da-DK')}
              </div>
            </div>

            {/* Draft Content */}
            <div className="space-y-4">
              <p className="text-slate-700 dark:text-slate-300 line-clamp-3">
                {draft.summary}
              </p>
              
              {/* Editable Prompt Section */}
              <div className="bg-slate-50/70 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200/50 dark:border-slate-700/50">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-slate-600 dark:text-slate-400">AI Prompt:</h4>
                  {!draft.isEditing && (
                    <button 
                      onClick={() => toggleEdit(draft.id)}
                      className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                    >
                      Rediger
                    </button>
                  )}
                </div>
                
                {draft.isEditing ? (
                  <div className="space-y-3">
                    <textarea
                      value={draft.prompt || ''}
                      onChange={(e) => updateDraft(draft.id, 'prompt', e.target.value)}
                      placeholder="Skriv din AI prompt her..."
                      className="w-full h-24 px-3 py-2 bg-white/70 dark:bg-slate-900/70 border border-slate-300/50 dark:border-slate-600/50 rounded-lg text-sm text-slate-700 dark:text-slate-300 placeholder-slate-500 dark:placeholder-slate-400 focus:ring-2 focus:ring-slate-500 dark:focus:ring-slate-400 focus:border-transparent resize-none"
                    />
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => saveDraft(draft.id)}
                        className="px-3 py-1 bg-green-500/90 text-white text-xs rounded-lg hover:bg-green-600/90 transition-colors"
                      >
                        Gem
                      </button>
                      <button 
                        onClick={() => toggleEdit(draft.id)}
                        className="px-3 py-1 bg-slate-500/90 text-white text-xs rounded-lg hover:bg-slate-600/90 transition-colors"
                      >
                        Annuller
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    {draft.prompt || 'Ingen prompt defineret endnu...'}
                  </p>
                )}
              </div>

              {/* Editable Notes Section */}
              <div className="bg-slate-50/70 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200/50 dark:border-slate-700/50">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-slate-600 dark:text-slate-400">Mine Noter:</h4>
                  {!draft.isEditing && (
                    <button 
                      onClick={() => toggleEdit(draft.id)}
                      className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                    >
                      Rediger
                    </button>
                  )}
                </div>
                
                {draft.isEditing ? (
                  <div className="space-y-3">
                    <textarea
                      value={draft.notes || ''}
                      onChange={(e) => updateDraft(draft.id, 'notes', e.target.value)}
                      placeholder="Tilføj dine noter og forbedringer her..."
                      className="w-full h-20 px-3 py-2 bg-white/70 dark:bg-slate-900/70 border border-slate-300/50 dark:border-slate-600/50 rounded-lg text-sm text-slate-700 dark:text-slate-300 placeholder-slate-500 dark:placeholder-slate-400 focus:ring-2 focus:ring-slate-500 dark:focus:ring-slate-400 focus:border-transparent resize-none"
                    />
                  </div>
                ) : (
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    {draft.notes || 'Ingen noter tilføjet endnu...'}
                  </p>
                )}
              </div>
              
              {/* AI Analysis */}
              {draft.aiGenerated && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Content Analysis */}
                  {draft.contentAnalysis && (
                    <div className="bg-gradient-to-br from-blue-50/70 to-indigo-50/70 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-xl p-4 border border-blue-200/50 dark:border-blue-700/50">
                      <h4 className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-3 flex items-center gap-2">
                        <span>🧠</span>
                        AI Indholdsanalyse
                      </h4>
                      <div className="space-y-2">
                        <div>
                          <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">Fokusområder:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {draft.contentAnalysis.focusAreas.map((area, i) => (
                              <span key={i} className="px-2 py-1 bg-blue-100/70 dark:bg-blue-800/50 text-blue-700 dark:text-blue-300 text-xs rounded-full border border-blue-300/50 dark:border-blue-600/50">
                                {area}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Trend Analysis */}
                  {draft.trendData && (
                    <div className="bg-gradient-to-br from-green-50/70 to-emerald-50/70 dark:from-green-900/30 dark:to-emerald-900/30 rounded-xl p-4 border border-green-200/50 dark:border-green-700/50">
                      <h4 className="text-sm font-medium text-green-700 dark:text-green-300 mb-3 flex items-center gap-2">
                        <span>📈</span>
                        Trend Analyse
                      </h4>
                      <div className="space-y-2">
                        <div>
                          <span className="text-xs text-green-600 dark:text-green-400 font-medium">Trend:</span>
                          <span className="ml-2 px-2 py-1 bg-green-100/70 dark:bg-green-800/50 text-green-700 dark:text-green-300 text-xs rounded-full border border-green-300/50 dark:border-green-600/50">
                            {draft.trendData.trend}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs text-green-600 dark:text-green-400 font-medium">Vinkel:</span>
                          <span className="ml-2 text-xs text-green-700 dark:text-green-300">{draft.trendData.angle}</span>
                        </div>
                        <div>
                          <span className="text-xs text-green-600 dark:text-green-400 font-medium">Målgruppe:</span>
                          <span className="ml-2 text-xs text-green-700 dark:text-green-300">{draft.trendData.audience}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* AI Suggestions */}
              <div className="bg-slate-50/70 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200/50 dark:border-slate-700/50">
                <h4 className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-3 flex items-center gap-2">
                  <span>💡</span>
                  AI Forslag
                </h4>
                <ul className="space-y-2">
                  {draft.suggestions.map((suggestion, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                      <span className="text-slate-400 dark:text-slate-500 mt-1">•</span>
                      <span>{suggestion}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-3 border-t border-slate-200/50 dark:border-slate-700/50">
                <button 
                  onClick={() => toggleEdit(draft.id)}
                  className="px-4 py-2 bg-slate-100/70 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200/70 dark:hover:bg-slate-700/70 transition-colors duration-300 border border-slate-300/50 dark:border-slate-600/50"
                >
                  {draft.isEditing ? 'Luk redigering' : 'Rediger'}
                </button>
                <button 
                  onClick={() => copyToClipboard(draft.prompt || '')}
                  className="px-4 py-2 bg-slate-100/70 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200/70 dark:hover:bg-slate-700/70 transition-colors duration-300 border border-slate-300/50 dark:border-slate-600/50"
                >
                  Kopiér prompt
                </button>
                <button className="px-4 py-2 bg-gradient-to-r from-slate-600 to-slate-700 text-white rounded-lg hover:from-slate-700 hover:to-slate-800 transition-all duration-300 shadow-lg">
                  Publicer
                </button>
                <button 
                  onClick={() => deleteDraft(draft.id)}
                  className="px-4 py-2 bg-red-100/70 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-200/70 dark:hover:bg-red-800/40 transition-colors duration-300 border border-red-300/50 dark:border-red-600/50"
                >
                  Slet
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {drafts.length === 0 && (
        <div className="text-center py-12">
          <div className="bg-slate-100/50 dark:bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 border border-slate-200/50 dark:border-slate-700/50">
            <h3 className="text-xl font-semibold text-slate-700 dark:text-slate-300 mb-2">Ingen AI Drafts endnu</h3>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              Send artikler til Apropos Editorial LLM for at se AI-genererede drafts her
            </p>
            <a 
              href="/editorial-queue" 
              className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-slate-600 to-slate-700 text-white rounded-xl hover:from-slate-700 hover:to-slate-800 transition-all duration-300 shadow-lg"
            >
              Gå til Editorial Queue
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
