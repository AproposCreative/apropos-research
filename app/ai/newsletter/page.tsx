import { redirect } from 'next/navigation';

/** Åbner nyhedsbrev-panelet i AI Writer (samme layout som øvrige højre-paneler). */
export default function NewsletterRedirectPage() {
  redirect('/ai?view=newsletter');
}
