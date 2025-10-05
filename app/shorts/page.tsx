import { readPrompts } from '../../lib/readPrompts';
import SelectedArticles from '../../components/SelectedArticles';

export default async function ShortsPage() {
  const allArticles = await readPrompts();
  
  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-white mb-4">Valgte Artikler</h1>
        <p className="text-gray-400">Her kan du se alle de artikler du har valgt til at sende videre</p>
      </div>
      
      <SelectedArticles allArticles={allArticles} />
    </div>
  );
}
