'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800">
      <div className="text-center p-8">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200 mb-4">
          Noget gik galt!
        </h2>
        <p className="text-slate-600 dark:text-slate-400 mb-6">
          Der opstod en fejl i applikationen. Prøv igen eller kontakt support.
        </p>
        <button
          onClick={reset}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Prøv igen
        </button>
      </div>
    </div>
  );
}
