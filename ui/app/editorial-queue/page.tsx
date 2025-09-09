import { readPrompts } from '@/lib/readPrompts';
import EditorialQueue from '@/components/EditorialQueue';

export default async function EditorialQueuePage() {
  const allArticles = await readPrompts();
  
  return <EditorialQueue allArticles={allArticles} />;
}
