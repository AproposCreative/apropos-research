import { readPrompts } from '@/lib/readPrompts';
import SearchResults from '@/components/SearchResults';

export default async function SearchPage() {
  const articles = await readPrompts();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800">
      <div className="container mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100 mb-4">
            Advanced Search & Discovery
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400">
            Find articles using semantic search, filters, and discover related content
          </p>
        </div>

        <SearchResults articles={articles} />
      </div>
    </div>
  );
}
