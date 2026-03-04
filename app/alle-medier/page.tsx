import { readPrompts } from '../../lib/readPrompts';
import AlleMedierClient from '../../components/AlleMedierClient';
import { redirect } from 'next/navigation';

// Allow ISR caching to reduce server/render pressure.
export const revalidate = 300;

type ListItem = {
  title: string;
  url: string;
  date?: string;
  fetched_at?: string;
  category?: string;
  source?: string;
  image?: string;
  bullets: string[];
  summary: string;
};

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

  // Keep client payload lean: omit heavy fields like "chunks".
  const slimData: ListItem[] = all.map((item) => ({
    title: item.title,
    url: item.url,
    date: item.date,
    fetched_at: item.fetched_at,
    category: item.category,
    source: item.source,
    image: item.image,
    bullets: item.bullets,
    summary: item.summary,
  }));

  return <AlleMedierClient initialData={slimData} searchParams={awaitedParams} />;
}