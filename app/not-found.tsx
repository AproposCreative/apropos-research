import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-black text-slate-800 dark:text-slate-200">
      <div className="text-center p-8">
        <h1 className="text-2xl font-bold mb-2">404</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-6">Siden blev ikke fundet.</p>
        <Link
          href="/"
          className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Til forsiden
        </Link>
      </div>
    </div>
  );
}
