'use client';
import { useState } from 'react';

interface ContentScoringExplainerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ContentScoringExplainer({ isOpen, onClose }: ContentScoringExplainerProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    {
      title: "📊 Hvad er Content Scoring?",
      content: "Content Scoring er vores AI-powered system der automatisk vurderer og scorer artikler baseret på deres relevans, kvalitet og værdi for dig.",
      example: null
    },
    {
      title: "🎯 Hvordan scorer vi artikler?",
      content: "Vi analyserer artikler på 4 dimensioner:",
      example: {
        type: "breakdown",
        data: [
          { label: "Relevans", percentage: 40, color: "bg-blue-500", description: "Hvor relevant er artiklen for dine interesser?" },
          { label: "Kvalitet", percentage: 30, color: "bg-green-500", description: "Er artiklen velstruktureret og dybdegående?" },
          { label: "Engagement", percentage: 20, color: "bg-purple-500", description: "Hvor fangende og interessant er indholdet?" },
          { label: "Timeliness", percentage: 10, color: "bg-orange-500", description: "Er informationen aktuel og frisk?" }
        ]
      }
    },
    {
      title: "🎨 Score Farver",
      content: "Scores vises med farve-kodning for hurtig identifikation:",
      example: {
        type: "scores",
        data: [
          { score: 95, label: "Excellent", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", description: "Høj kvalitet, høj relevans" },
          { score: 87, label: "Good", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400", description: "God kvalitet, god relevans" },
          { score: 78, label: "Fair", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400", description: "Acceptabel kvalitet" },
          { score: 65, label: "Poor", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", description: "Lav kvalitet" }
        ]
      }
    },
    {
      title: "📱 Hvor ser du scores?",
      content: "Content Scores vises på flere steder i platformen:",
      example: {
        type: "locations",
        data: [
          { location: "Recent Activity Feed", description: "Hver artikel har en colored score badge" },
          { location: "Smart Suggestions", description: "AI foreslår artikler med confidence scores" },
          { location: "Quality Metrics", description: "Dashboard viser gennemsnitlige scores" }
        ]
      }
    },
    {
      title: "✨ Fordele for dig",
      content: "Content Scoring hjælper dig med at:",
      example: {
        type: "benefits",
        data: [
          { icon: "⚡", text: "Identificere høj-kvalitet indhold hurtigt" },
          { icon: "🎯", text: "Få personlige anbefalinger baseret på din historik" },
          { icon: "⏰", text: "Spare tid ved at fokusere på bedste artikler" },
          { icon: "📈", text: "Få en forbedret læseoplevelse med kvalitetsgaranti" }
        ]
      }
    }
  ];

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const renderExample = (example: any) => {
    if (!example) return null;

    switch (example.type) {
      case 'breakdown':
        return (
          <div className="space-y-3 mt-4">
            {example.data.map((item: any, index: number) => (
              <div key={index} className="flex items-center gap-3 p-3 bg-white/50 dark:bg-pure-black/50 rounded-xl">
                <div className={`w-4 h-4 rounded-full ${item.color}`}></div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-900 dark:text-white">{item.label}</span>
                    <span className="text-sm text-slate-600 dark:text-slate-400">{item.percentage}%</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        );

      case 'scores':
        return (
          <div className="space-y-3 mt-4">
            {example.data.map((item: any, index: number) => (
              <div key={index} className="flex items-center gap-3 p-3 bg-white/50 dark:bg-pure-black/50 rounded-xl">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${item.color}`}>
                  {item.score}%
                </span>
                <div className="flex-1">
                  <span className="text-sm font-medium text-slate-900 dark:text-white">{item.label}</span>
                  <p className="text-xs text-slate-600 dark:text-slate-400">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        );

      case 'locations':
        return (
          <div className="space-y-3 mt-4">
            {example.data.map((item: any, index: number) => (
              <div key={index} className="p-3 bg-white/50 dark:bg-pure-black/50 rounded-xl">
                <h4 className="text-sm font-medium text-slate-900 dark:text-white">{item.location}</h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{item.description}</p>
              </div>
            ))}
          </div>
        );

      case 'benefits':
        return (
          <div className="space-y-3 mt-4">
            {example.data.map((item: any, index: number) => (
              <div key={index} className="flex items-center gap-3 p-3 bg-white/50 dark:bg-pure-black/50 rounded-xl">
                <span className="text-lg">{item.icon}</span>
                <span className="text-sm text-slate-900 dark:text-white">{item.text}</span>
              </div>
            ))}
          </div>
        );

      default:
        return null;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gradient-to-br from-white/95 to-slate-50/95 dark:from-pure-black dark:to-pure-black backdrop-blur-xl rounded-2xl border border-white/40 dark:border-white/20 shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/40 dark:border-white/20">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-lg">📊</span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Content Scoring Guide</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">Lær hvordan vores AI scorer artikler</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/50 dark:hover:bg-pure-black/50 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-slate-600 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto">
          <div className="space-y-6">
            {/* Step Title */}
            <div className="text-center">
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                {steps[currentStep].title}
              </h3>
              <p className="text-slate-600 dark:text-slate-400">
                {steps[currentStep].content}
              </p>
            </div>

            {/* Example Content */}
            {renderExample(steps[currentStep].example)}

            {/* Progress Indicator */}
            <div className="flex justify-center space-x-2">
              {steps.map((_, index) => (
                <div
                  key={index}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    index === currentStep
                      ? 'bg-primary-500'
                      : 'bg-slate-300 dark:bg-slate-600'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-white/40 dark:border-white/20">
          <button
            onClick={prevStep}
            disabled={currentStep === 0}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              currentStep === 0
                ? 'text-slate-400 dark:text-slate-600 cursor-not-allowed'
                : 'text-slate-600 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-pure-black/50'
            }`}
          >
            Forrige
          </button>

          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600 dark:text-slate-400">
              {currentStep + 1} af {steps.length}
            </span>
          </div>

          {currentStep === steps.length - 1 ? (
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-lg font-medium hover:from-primary-600 hover:to-primary-700 transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              Afslut Guide
            </button>
          ) : (
            <button
              onClick={nextStep}
              className="px-4 py-2 bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-lg font-medium hover:from-primary-600 hover:to-primary-700 transition-all duration-200"
            >
              Næste
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
