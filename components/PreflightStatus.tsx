'use client';

import { useState, useEffect } from 'react';

interface PreflightStatusProps {
  isRunning: boolean;
  currentStep: number;
  totalSteps: number;
  stepName: string;
  onComplete?: () => void;
}

export default function PreflightStatus({ 
  isRunning, 
  currentStep, 
  totalSteps, 
  stepName, 
  onComplete 
}: PreflightStatusProps) {
  const [progress, setProgress] = useState(0);
  const [dots, setDots] = useState('');

  // Animate progress
  useEffect(() => {
    if (isRunning) {
      const targetProgress = (currentStep / totalSteps) * 100;
      const interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= targetProgress) {
            clearInterval(interval);
            return targetProgress;
          }
          return prev + 2;
        });
      }, 50);
      
      return () => clearInterval(interval);
    } else {
      setProgress(100);
      if (onComplete) {
        setTimeout(onComplete, 1000);
      }
    }
  }, [isRunning, currentStep, totalSteps, onComplete]);

  // Animate dots
  useEffect(() => {
    if (isRunning) {
      const interval = setInterval(() => {
        setDots(prev => {
          if (prev === '...') return '';
          return prev + '.';
        });
      }, 500);
      
      return () => clearInterval(interval);
    }
  }, [isRunning]);

  if (!isRunning && progress === 0) return null;

  const getStepIcon = (step: number) => {
    if (step < currentStep) return '✅';
    if (step === currentStep) return '🔄';
    return '⏳';
  };

  const getStepStatus = (step: number) => {
    if (step < currentStep) return 'text-green-400';
    if (step === currentStep) return 'text-blue-400';
    return 'text-white/40';
  };

  const steps = [
    { name: 'Moderation Check', key: 'moderation' },
    { name: 'TOV Analysis', key: 'tov' },
    { name: 'Fact Check', key: 'fact' }
  ];

  return (
    <div className="mt-4 p-4 bg-gradient-to-r from-blue-900/30 to-purple-900/30 rounded-xl border border-blue-500/30 backdrop-blur-sm">
      <div className="flex items-center gap-3 mb-3">
        <div className="relative">
          <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-3 h-3 bg-blue-400 rounded-full animate-pulse"></div>
          </div>
        </div>
        <div className="flex-1">
          <h4 className="text-white font-semibold text-lg">
            🔍 Analyserer artikel{dots}
          </h4>
          <p className="text-white/70 text-sm">
            {stepName} ({currentStep}/{totalSteps})
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-blue-400">
            {Math.round(progress)}%
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-4 h-2 bg-white/10 rounded-full overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Steps */}
      <div className="space-y-2">
        {steps.map((step, index) => (
          <div 
            key={step.key}
            className={`flex items-center gap-3 p-2 rounded-lg transition-all duration-300 ${
              index < currentStep ? 'bg-green-900/20' :
              index === currentStep ? 'bg-blue-900/20' :
              'bg-white/5'
            }`}
          >
            <span className="text-lg">{getStepIcon(index + 1)}</span>
            <span className={`font-medium ${getStepStatus(index + 1)}`}>
              {step.name}
            </span>
            {index < currentStep && (
              <span className="ml-auto text-green-400 text-sm">✓ Færdig</span>
            )}
            {index === currentStep && (
              <span className="ml-auto text-blue-400 text-sm animate-pulse">Kører...</span>
            )}
          </div>
        ))}
      </div>

      {/* Status Message */}
      {isRunning && (
        <div className="mt-3 p-2 bg-white/5 rounded-lg">
          <p className="text-white/80 text-sm text-center">
            {currentStep === 1 && "Tjekker for plagiat og moderation..."}
            {currentStep === 2 && "Analyserer tone of voice og stil..."}
            {currentStep === 3 && "Verificerer fakta og påstande..."}
          </p>
        </div>
      )}

      {!isRunning && progress === 100 && (
        <div className="mt-3 p-3 bg-green-900/20 border border-green-500/30 rounded-lg">
          <div className="flex items-center gap-2">
            <span className="text-green-400 text-lg">✅</span>
            <span className="text-green-400 font-medium">Preflight analyse færdig!</span>
          </div>
          <p className="text-white/70 text-sm mt-1">
            Se resultaterne nedenfor for at forbedre din artikel.
          </p>
        </div>
      )}
    </div>
  );
}
