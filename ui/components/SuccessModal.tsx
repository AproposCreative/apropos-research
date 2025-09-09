'use client';
import { useEffect, useState } from 'react';

interface SuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: string;
  count?: number;
}

export default function SuccessModal({ isOpen, onClose, message, count }: SuccessModalProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      // Auto close after 3 seconds
      const timer = setTimeout(() => {
        handleClose();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(() => {
      onClose();
    }, 300);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center min-h-screen" style={{ top: 0, left: 0, right: 0, bottom: 0 }}>
      {/* Backdrop */}
      <div 
        className={`absolute inset-0 bg-black/50 backdrop-blur-md transition-opacity duration-300 ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div 
        className={`relative w-full max-w-sm mx-4 transform transition-all duration-500 ease-out ${
          isVisible 
            ? 'scale-100 opacity-100 translate-y-0' 
            : 'scale-90 opacity-0 translate-y-8'
        }`}
        style={{ margin: 'auto' }}
      >
        {/* Glass Container */}
        <div className="bg-white/10 dark:bg-black/20 backdrop-blur-2xl rounded-3xl border border-white/20 dark:border-white/10 shadow-2xl overflow-hidden">
          {/* Header with gradient */}
          <div className="bg-gradient-to-r from-green-500/20 via-emerald-500/20 to-teal-500/20 dark:from-green-400/10 dark:via-emerald-400/10 dark:to-teal-400/10 p-8 border-b border-white/10 dark:border-white/5">
            <div className="flex items-center justify-center">
              {/* Success Icon */}
              <div className="w-20 h-20 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full flex items-center justify-center shadow-xl shadow-green-500/30 animate-pulse">
                <svg 
                  className="w-10 h-10 text-white" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={3} 
                    d="M5 13l4 4L19 7" 
                  />
                </svg>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-8 text-center">
            <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-4">
              {message}
            </h3>
            
            {count && (
              <div className="mb-6">
                <div className="inline-flex items-center px-6 py-3 bg-green-500/15 dark:bg-green-400/15 rounded-2xl border border-green-500/30 dark:border-green-400/30 shadow-lg">
                  <span className="text-3xl font-bold text-green-600 dark:text-green-400 mr-3">
                    {count}
                  </span>
                  <span className="text-lg font-semibold text-green-700 dark:text-green-300">
                    artikel{count !== 1 ? 'er' : ''}
                  </span>
                </div>
              </div>
            )}

            <p className="text-slate-600 dark:text-slate-300 text-base mb-8 leading-relaxed">
              {count 
                ? `Artiklerne er nu tilgængelige i Editorial Queue og klar til AI-behandling.`
                : 'Handlingen er gennemført succesfuldt.'
              }
            </p>

            {/* Action Buttons */}
            <div className="flex gap-3 justify-center">
              <button
                onClick={handleClose}
                className="px-6 py-3 bg-white/20 dark:bg-black/30 hover:bg-white/30 dark:hover:bg-black/40 text-slate-700 dark:text-slate-200 rounded-xl font-medium transition-all duration-300 backdrop-blur-sm border border-white/20 dark:border-white/10 hover:scale-105"
              >
                Luk
              </button>
              
              {count && (
                <button
                  onClick={() => {
                    handleClose();
                    window.location.href = '/editorial-queue';
                  }}
                  className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-xl font-medium transition-all duration-300 shadow-lg shadow-blue-500/25 hover:scale-105"
                >
                  Se Queue
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Floating particles effect */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-3xl">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-green-400/30 rounded-full animate-pulse"
              style={{
                left: `${20 + i * 15}%`,
                top: `${30 + (i % 2) * 40}%`,
                animationDelay: `${i * 0.5}s`,
                animationDuration: '2s'
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
