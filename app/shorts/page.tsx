import toolStyles from '@/components/tool-surface.module.css';
import { readPrompts } from '../../lib/readPrompts';
import SelectedArticles from '../../components/SelectedArticles';

export default async function ShortsPage() {
  const allArticles = await readPrompts();
  
  return (
    <div className={`${toolStyles.legacy} p-2 sm:p-3 space-y-3`}>
      <div className="text-center">
        <h1 className="text-xl font-bold text-white mb-4">Valgte Artikler</h1>
        <p className="text-gray-400">Her kan du se alle de artikler du har valgt til at sende videre</p>
      </div>
      
      <SelectedArticles allArticles={allArticles} />
    </div>
  );
}
