'use client';

import { useState, useMemo } from 'react';

interface PreflightRecommendationsProps {
  warnings: string[];
  moderation?: any;
  criticTips?: string;
  factResults?: any[];
  onApplyRecommendations: () => void;
  onApplyCriticalFixes?: () => void;
  onApplyImprovements?: () => void;
  onAutoFixPlagiarism?: () => void;
  onAutoFixFacts?: () => void;
  onAutoFixTOV?: () => void;
}

interface CategorizedRecommendation {
  text: string;
  severity: 'critical' | 'warning' | 'improvement';
  category: string;
}

export default function PreflightRecommendations({
  warnings,
  moderation,
  criticTips,
  factResults,
  onApplyRecommendations,
  onApplyCriticalFixes,
  onApplyImprovements,
  onAutoFixPlagiarism,
  onAutoFixFacts,
  onAutoFixTOV
}: PreflightRecommendationsProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'critical' | 'warning' | 'improvement'>('all');

  // Categorize recommendations by severity
  const categorizedRecommendations = useMemo(() => {
    const recommendations: CategorizedRecommendation[] = [];
    
    // Critical: Plagiarism, moderation issues
    if (moderation?.metrics?.plagiarismRisk === 'high') {
      recommendations.push({
        text: 'Høj lighed med eksisterende tekst. Omskriv før publicering.',
        severity: 'critical',
        category: 'Plagiat'
      });
    }
    
    // Warnings: Unverified facts, missing sources
    if (factResults && factResults.length > 0) {
      const unverified = factResults.filter((x: any) => x.status !== 'true');
      if (unverified.length > 0) {
        unverified.forEach((fact: any) => {
          recommendations.push({
            text: `Uverificeret påstand: "${fact.claim}"`,
            severity: 'warning',
            category: 'Fakta'
          });
        });
      }
    }
    
    // Add general warnings
    warnings.forEach(warning => {
      const severity = warning.toLowerCase().includes('høj lighed') ? 'critical' : 'warning';
      recommendations.push({
        text: warning,
        severity,
        category: 'Generelt'
      });
    });
    
    // Improvements: TOV tips
    if (criticTips) {
      recommendations.push({
        text: criticTips,
        severity: 'improvement',
        category: 'Tone of Voice'
      });
    }
    
    return recommendations;
  }, [warnings, moderation, criticTips, factResults]);

  // Calculate Preflight score
  const preflightScore = useMemo(() => {
    const critical = categorizedRecommendations.filter(r => r.severity === 'critical').length;
    const warnings = categorizedRecommendations.filter(r => r.severity === 'warning').length;
    const improvements = categorizedRecommendations.filter(r => r.severity === 'improvement').length;
    
    // Start at 100, deduct points for issues
    let score = 100;
    score -= critical * 30; // -30 for each critical
    score -= warnings * 15; // -15 for each warning
    score -= improvements * 5; // -5 for each improvement
    
    return Math.max(0, score);
  }, [categorizedRecommendations]);

  const getScoreColor = () => {
    if (preflightScore >= 90) return 'text-green-400';
    if (preflightScore >= 70) return 'text-yellow-400';
    if (preflightScore >= 50) return 'text-orange-400';
    return 'text-red-400';
  };

  const getScoreLabel = () => {
    if (preflightScore >= 90) return 'Fremragende!';
    if (preflightScore >= 70) return 'God';
    if (preflightScore >= 50) return 'Acceptabel';
    return 'Kræver forbedring';
  };

  const filteredRecommendations = useMemo(() => {
    if (activeTab === 'all') return categorizedRecommendations;
    return categorizedRecommendations.filter(r => r.severity === activeTab);
  }, [categorizedRecommendations, activeTab]);

  const criticalCount = categorizedRecommendations.filter(r => r.severity === 'critical').length;
  const warningCount = categorizedRecommendations.filter(r => r.severity === 'warning').length;
  const improvementCount = categorizedRecommendations.filter(r => r.severity === 'improvement').length;

  const hasRecommendations = categorizedRecommendations.length > 0;

  if (!hasRecommendations) {
    return (
      <div className="mt-4 p-4 bg-gradient-to-br from-slate-900/80 to-slate-800/80 rounded-xl border border-white/10 shadow-2xl backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-12 h-12 rounded-full border-4 border-green-500 flex items-center justify-center">
                <span className="text-lg font-bold text-green-400">100</span>
              </div>
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
            </div>
            <div>
              <h4 className="text-white font-semibold text-lg">Preflight Analyse</h4>
              <p className="text-white/60 text-sm">Alt ser godt ud! Klar til næste skridt.</p>
            </div>
          </div>
          <span className="px-2 py-1 bg-green-600/20 text-green-300 rounded-full text-xs font-medium">
            Godkendt
          </span>
        </div>
        <p className="mt-4 text-white/70 text-sm leading-relaxed">
          Preflight-checks fandt ingen kritiske problemer, faktuelle advarsler eller TOV-mangler.
          Brug gerne knappen &quot;Kør Preflight Checks&quot; igen hvis du foretager større ændringer.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 p-4 bg-gradient-to-br from-slate-900/90 to-slate-800/90 rounded-xl border border-white/10 shadow-2xl backdrop-blur-sm">
      {/* Header with Score */}
      <div 
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className={`w-12 h-12 rounded-full border-4 ${getScoreColor().replace('text', 'border')} flex items-center justify-center`}>
              <span className={`text-lg font-bold ${getScoreColor()}`}>{preflightScore}</span>
            </div>
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
          </div>
          <div>
            <h4 className="text-white font-semibold text-lg">Preflight Analyse</h4>
            <p className="text-white/60 text-sm">{getScoreLabel()}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {criticalCount > 0 && (
            <span className="px-2 py-1 bg-red-600/20 text-red-400 rounded-full text-xs font-medium">
              {criticalCount} kritiske
            </span>
          )}
          {warningCount > 0 && (
            <span className="px-2 py-1 bg-yellow-600/20 text-yellow-400 rounded-full text-xs font-medium">
              {warningCount} advarsler
            </span>
          )}
          {improvementCount > 0 && (
            <span className="px-2 py-1 bg-blue-600/20 text-blue-400 rounded-full text-xs font-medium">
              {improvementCount} forbedringer
            </span>
          )}
          <svg 
            className={`w-5 h-5 text-white/60 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mt-3 h-2 bg-white/10 rounded-full overflow-hidden">
        <div 
          className={`h-full transition-all duration-500 ${
            preflightScore >= 90 ? 'bg-green-500' :
            preflightScore >= 70 ? 'bg-yellow-500' :
            preflightScore >= 50 ? 'bg-orange-500' : 'bg-red-500'
          }`}
          style={{ width: `${preflightScore}%` }}
        />
      </div>
      
      {isExpanded && (
        <div className="mt-4 space-y-4">
          {/* Tabs */}
          <div className="flex gap-2 border-b border-white/10 pb-2">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'all' ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white'
              }`}
            >
              Alle ({categorizedRecommendations.length})
            </button>
            {criticalCount > 0 && (
              <button
                onClick={() => setActiveTab('critical')}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'critical' ? 'bg-red-600/20 text-red-400' : 'text-white/60 hover:text-white'
                }`}
              >
                Kritiske ({criticalCount})
              </button>
            )}
            {warningCount > 0 && (
              <button
                onClick={() => setActiveTab('warning')}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'warning' ? 'bg-yellow-600/20 text-yellow-400' : 'text-white/60 hover:text-white'
                }`}
              >
                Advarsler ({warningCount})
              </button>
            )}
            {improvementCount > 0 && (
              <button
                onClick={() => setActiveTab('improvement')}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'improvement' ? 'bg-blue-600/20 text-blue-400' : 'text-white/60 hover:text-white'
                }`}
              >
                Forbedringer ({improvementCount})
              </button>
            )}
          </div>

          {/* Recommendations List */}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {filteredRecommendations.map((rec, i) => (
              <div 
                key={i} 
                className={`p-3 rounded-lg border ${
                  rec.severity === 'critical' ? 'bg-red-900/20 border-red-500/30' :
                  rec.severity === 'warning' ? 'bg-yellow-900/20 border-yellow-500/30' :
                  'bg-blue-900/20 border-blue-500/30'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-1 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                    rec.severity === 'critical' ? 'bg-red-600' :
                    rec.severity === 'warning' ? 'bg-yellow-600' :
                    'bg-blue-600'
                  }`}>
                    {rec.severity === 'critical' ? (
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    ) : rec.severity === 'warning' ? (
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-medium ${
                        rec.severity === 'critical' ? 'text-red-400' :
                        rec.severity === 'warning' ? 'text-yellow-400' :
                        'text-blue-400'
                      }`}>
                        {rec.category}
                      </span>
                      {/* One-click fix button */}
                      {rec.severity === 'critical' && rec.category === 'Plagiat' && onAutoFixPlagiarism && (
                        <button
                          onClick={onAutoFixPlagiarism}
                          className="px-2 py-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-xs rounded-md transition-colors"
                        >
                          🔧 Auto-fix
                        </button>
                      )}
                      {rec.severity === 'warning' && rec.category === 'Fakta' && onAutoFixFacts && (
                        <button
                          onClick={onAutoFixFacts}
                          className="px-2 py-1 bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-400 text-xs rounded-md transition-colors"
                        >
                          🔧 Auto-fix
                        </button>
                      )}
                      {rec.severity === 'improvement' && rec.category === 'Tone of Voice' && onAutoFixTOV && (
                        <button
                          onClick={onAutoFixTOV}
                          className="px-2 py-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-xs rounded-md transition-colors"
                        >
                          🔧 Auto-fix
                        </button>
                      )}
                    </div>
                    <p className="text-white/90 text-sm">{rec.text}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
            {criticalCount > 0 && (
              <button
                onClick={onApplyCriticalFixes || onApplyRecommendations}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm font-medium shadow-lg hover:shadow-red-500/50"
              >
                🚨 Fix kritiske problemer ({criticalCount})
              </button>
            )}
            {improvementCount > 0 && (
              <button
                onClick={onApplyImprovements || onApplyRecommendations}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium shadow-lg hover:shadow-blue-500/50"
              >
                💡 Anvend forbedringer ({improvementCount})
              </button>
            )}
            <button
              onClick={onApplyRecommendations}
              className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-lg transition-colors text-sm font-medium shadow-lg"
            >
              ✨ Anvend alle anbefalinger
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
