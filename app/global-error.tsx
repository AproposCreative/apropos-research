'use client';

/**
 * Next.js global error boundary – fanger fejl i root layout.
 * Skal have egen <html> og <body> da den erstatter hele layoutet.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="da">
      <body className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200">
        <div className="text-center p-8 max-w-md">
          <h2 className="text-xl font-bold mb-4">Noget gik galt</h2>
          <p className="text-slate-600 dark:text-slate-400 mb-6 text-sm">
            Der opstod en fejl. Prøv at genindlæse siden.
          </p>
          <button
            onClick={() => reset()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
          >
            Prøv igen
          </button>
        </div>
      </body>
    </html>
  );
}
