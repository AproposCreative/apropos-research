import { redirect } from 'next/navigation';

/** Åbner podcast-panelet i AI Writer (samme layout som øvrige højre-paneler). */
export default function PodcastRedirectPage() {
  redirect('/ai?view=podcast');
}
