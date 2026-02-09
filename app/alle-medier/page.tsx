import { readPrompts } from '../../lib/readPrompts';
import AlleMedierClient from '../../components/AlleMedierClient';
import { redirect } from 'next/navigation';

// Disable static generation for this page
export const dynamic = 'force-dynamic';

export default async function AlleMedierPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const awaitedParams = await searchParams;
  
  // If no time filter is set, redirect to 'today' filter
  if (!awaitedParams.time) {
    const params = new URLSearchParams();
    Object.entries(awaitedParams).forEach(([key, value]) => {
      if (value && key !== 'time') {
        params.set(key, Array.isArray(value) ? value[0] : value);
      }
    });
    params.set('time', 'today');
    redirect(`/alle-medier?${params.toString()}`);
  }
  
  const all = await readPrompts();

  return <AlleMedierClient initialData={all} searchParams={awaitedParams} />;
}