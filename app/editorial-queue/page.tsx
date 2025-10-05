import { readPrompts } from '../../lib/readPrompts';
import EditorialQueue from '../../components/EditorialQueue';
import CompactHeader from '../../components/CompactHeader';

export default async function EditorialQueuePage() {
  const allArticles = await readPrompts();
  
  return (
    <div className="space-y-6">
      <CompactHeader 
        title="Editorial Queue"
        subtitle="Administrer artikler til AI processing"
      />
      <EditorialQueue allArticles={allArticles} />
    </div>
  );
}
