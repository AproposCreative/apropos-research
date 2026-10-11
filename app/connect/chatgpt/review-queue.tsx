'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import type { reviewQueue, reviewSavedArticle } from '@/lib/editorial/review-queue';
import ArticleReading from './article-reading';
type Queue = Awaited<ReturnType<typeof reviewQueue>>;
type Reading = Awaited<ReturnType<typeof reviewSavedArticle>>;
const labels: Record<string, string> = { cover: 'cover', cover_credit: 'fotokredit', two_distinct_body_images: 'to brødtekstbilleder', author: 'byline', category: 'kategori', intro: 'intro', subtitle: 'underrubrik', seoTitle: 'SEO-titel', seoDescription: 'metabeskrivelse', body_image_alt: 'billedbeskrivelser', slug: 'URL-navn', title: 'titel', content: 'tekst' };
const kinds: Record<string, string> = { 'private-submission': 'ChatGPT-kladde', 'cms': 'CMS-kladde', 'liv-checkpoint': 'Gemt Liv-tekst', 'private-workspace': 'Writer-version' };
const date = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toLocaleDateString('da-DK', { timeZone: 'Europe/Copenhagen' }) : 'Dato ukendt';
export default function ReviewQueue({ source, id }: { source: string; id: string }) {
  const { user } = useAuth();
  const [queue, setQueue] = useState<Queue | null>(null), [reading, setReading] = useState<Reading | null>(null);
  const [error, setError] = useState(''), [reload, setReload] = useState(0);
  useEffect(() => {
    if (!user) return;
    let active = true; setQueue(null); setReading(null); setError('');
    (async () => {
      const suffix = source ? `?source=${encodeURIComponent(source)}&id=${encodeURIComponent(id)}` : '';
      const res = await fetch(`/api/editorial/review${suffix}`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: 'no-store' });
      if (!res.ok) throw Error(res.status === 403 ? 'Den samlede Liv-oversigt kræver ejeradgang.' : 'Oversigten kunne ikke hentes. Dit gemte arbejde er uændret.');
      const data = await res.json(); if (active) { if (source) setReading(data); else setQueue(data); }
    })().catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [user, source, id, reload]);
  if (error) return <section><p role="alert">{error}</p><button className="mt-5 min-h-12 underline" onClick={() => setReload(x => x + 1)}>Prøv at hente igen</button></section>;
  if (reading) return <section className="space-y-6">
    <Link className="inline-block py-2 text-sm underline underline-offset-4" href="/connect/chatgpt?review=1">Alle kladder</Link>
    <p className="text-sm leading-relaxed text-white/60">{reading.notice}</p>
    <ArticleReading article={reading.reading} />
    <div className="mx-auto max-w-[42rem] border-t border-white/20 py-7"><h3 className="text-xl">Fortsæt med denne version</h3>
      <p className="mt-3 leading-relaxed text-white/70">Denne ældre tekst er til gennemgang. Bed ChatGPT færdiggøre den valgte kladde gennem Apropos med samme identitet. Den bliver ikke godkendt eller udgivet ved at åbne previewet.</p>
      <details className="mt-4 text-sm"><summary>Artikelreference til chatten</summary><p className="mt-3 break-all">{reading.source}: {reading.id}</p><p className="mt-2 break-all">Version: {reading.version}</p></details>
    </div>
  </section>;
  if (!queue) return <p role="status">Henter gemte kladder og forløb …</p>;
  return <section className="space-y-9" aria-label="Alle kladder">
    <header className="max-w-2xl space-y-4"><h2 className="text-3xl font-medium sm:text-4xl">Læs før du godkender</h2>
      <p className="leading-relaxed text-white/70">{queue.items.length} gemte kladder og versioner i det læste arkiv. Åbn en artikel for at se hele teksten og billederne. Ingen ny tekst bliver genereret.</p>
      <p className="text-sm text-white/55">Feltoptællingen er ikke faktatjek eller godkendelse. Ældre tekster kan kræve ny kilde- og datokontrol.</p>
    </header>
    {queue.coverage.unavailable.length > 0 && <p role="alert">Oversigten er ufuldstændig: {queue.coverage.unavailable.join(', ')} kunne ikke læses.</p>}
    {queue.historyUnavailable && <p role="alert">Historikken for fejlede forløb kunne ikke læses. De fundne kladder vises stadig nedenfor.</p>}
    <ul className="divide-y divide-white/15 border-y border-white/15">{queue.items.map(item => <li key={item.id} className="py-6">
      <p className="mb-2 text-sm text-white/55">{kinds[item.kind] || item.kind} · {date(item.updatedAt)}{item.scheduledDay ? ` · Planlagt ${date(item.scheduledDay)}` : ''}</p>
      <Link href={item.href} className="block text-xl font-medium leading-snug underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">{item.title}</Link>
      <p className="mt-3 text-sm leading-relaxed text-white/65">{item.blockers.length ? 'Forløbet stoppede. Se den bevarede tekst og blokering før fortsættelse.' : item.missing.length ? `Mangler: ${item.missing.map(m => labels[m] || m).join(', ')}.` : 'Tekst og billedfelter er udfyldt. Afventer gennemgang og aktuelle kontroller.'}</p>
      {item.relatedVersionCount > 0 && <p className="mt-2 text-sm text-white/55">{item.relatedVersionCount} andre versioner er samlet under samme CMS-artikel.</p>}
      <Link href={item.href} className="mt-3 inline-flex min-h-11 items-center text-sm underline underline-offset-4">Læs artikel</Link>
    </li>)}</ul>
    {queue.items.length === 0 && <p>Ingen gemte kladder fundet i det læste vindue.</p>}
    <details className="border-b border-white/15 pb-6"><summary className="cursor-pointer py-2 text-lg">Forløb uden færdig artikeltekst</summary>
      <p className="my-4 text-sm leading-relaxed text-white/60">Disse planlagte forsøg er ikke artikler, du kan godkende. En fejlet dato betyder ikke, at der ligger en færdig tekst bagved.</p>
      <ul className="space-y-4">{queue.unfinishedRuns.map(row => <li key={String(row.id)}><p>{String(row.title)}</p><p className="text-sm text-white/55">{date(row.scheduledDay)} · Ingen artikeltekst i checkpoint</p></li>)}</ul>
    </details>
    <details className="border-b border-white/15 pb-6"><summary className="cursor-pointer py-2 text-lg">Ældre skriveforsøg og versioner</summary>
      <p className="my-4 text-sm leading-relaxed text-white/60">Ikke ekstra artikler i godkendelseskøen. Her findes også omskrivninger og forstadier til allerede udgivne artikler.</p>
      <ul className="space-y-4">{queue.writingAttempts.map(row => <li key={String(row.id)}><Link className="underline underline-offset-4" href={row.href}>{String(row.title)}</Link><p className="mt-1 text-sm text-white/55">{date(row.updatedAt)} · Ikke godkendt skriveforsøg</p></li>)}</ul>
    </details>
    <p className="text-xs leading-relaxed text-white/50">Kontrolleret {new Date(queue.checkedAt).toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen' })}. Læst {queue.coverage.cmsRows} CMS-rækker, {queue.coverage.runRows} Liv-forløb og {queue.coverage.submissionRows} private indsendelser. {(!queue.coverage.cmsComplete || queue.coverage.savedWindowTruncated || queue.coverage.submissionWindowTruncated || queue.items.length < queue.matchingDraftsInWindow) ? 'Arkivvinduet er afgrænset; ældre kladder kan mangle.' : 'Alle fundne kladder i dette vindue vises.'} Historiksektionerne viser de seneste {queue.workRowsShown} af {queue.workMatchingInWindow} daterede forløb/forsøg i vinduet.</p>
  </section>;
}
