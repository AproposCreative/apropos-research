'use client';

interface SuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: string;
  count?: number;
}

export default function SuccessModal({ isOpen, onClose, message, count }: SuccessModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[99999] animate-fade-in">
      <div className="bg-white dark:bg-pure-black backdrop-blur-2xl border border-white/20 dark:border-black-800/50 rounded-2xl shadow-2xl ring-1 ring-white/10 dark:ring-black-800/20 p-8 max-w-md w-[90%] text-center animate-scale-in">
        {/* Success Icon */}
        <div className="w-16 h-16 bg-gradient-to-br from-success-500 to-success-600 rounded-2xl flex items-center justify-center text-white text-2xl font-bold mx-auto mb-6 shadow-lg animate-bounce-in">
          ✓
        </div>
        
        {/* Message */}
        <h3 className="text-xl font-semibold text-slate-800 dark:text-black-100 mb-4">{message}</h3>
        
        {count && (
          <p className="text-slate-600 dark:text-black-400 mb-8">
            {count} artikel{count !== 1 ? 'er' : ''} sendt til Editorial Queue
          </p>
        )}
        
        {/* Action Button */}
        <button
          onClick={onClose}
          className="group px-8 py-3 bg-primary-600 dark:bg-primary-500 text-white rounded-xl font-medium hover:bg-primary-700 dark:hover:bg-primary-400 hover:shadow-lg hover:scale-105 transition-all duration-200 ease-out shadow-md"
        >
          <span className="group-hover:scale-110 transition-transform duration-200">🎉</span>
          <span className="ml-2">OK</span>
        </button>
      </div>
    </div>
  );
}
