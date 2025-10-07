import { readPrompts } from '../../lib/readPrompts';
import AlleMedierClient from '../../components/AlleMedierClient';

// Disable static generation for this page
export const dynamic = 'force-dynamic';

export default async function AlleMedierPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const awaitedParams = await searchParams;
  const all = await readPrompts();

  return <AlleMedierClient initialData={all} searchParams={awaitedParams} />;
}