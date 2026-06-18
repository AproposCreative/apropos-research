import { redirect } from 'next/navigation';

/** Åbner dashboard-panelet i AI Writer (samme layout som øvrige højre-paneler). */
export default function DashboardRedirectPage() {
  redirect('/ai?view=dashboard');
}
