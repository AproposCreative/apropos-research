import toolStyles from '@/components/tool-surface.module.css';
import { readPrompts } from '../../lib/readPrompts';
import EditorialQueue from '../../components/EditorialQueue';
import CompactHeader from '../../components/embedded-app/ToolPageHeader';

export default async function EditorialQueuePage() {
  const allArticles = await readPrompts();
  
  return (
    <div className={`${toolStyles.legacy} p-2 sm:p-3 space-y-3`}>
      <CompactHeader 
        title="Editorial Queue"
        subtitle="Administrer artikler til AI processing"
      />
      <EditorialQueue allArticles={allArticles} />
    </div>
  );
}
