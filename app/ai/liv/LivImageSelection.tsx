'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { GeneratedArticle } from '@/lib/liv/generate-article';

export default function LivImageSelection({ article, busy, onPrepare }: {
  article: GeneratedArticle;
  busy: boolean;
  onPrepare: (input: { url: string; alt: string; credit: string }) => Promise<void>;
}) {
  const [url, setUrl] = useState(article.selectedImage?.sourceUrl || '');
  const [alt, setAlt] = useState(article.selectedImage?.alt || '');
  const [credit, setCredit] = useState(article.selectedImage?.credit || '');
  const selected = article.selectedImage;
  const candidates = (article.imageSuggestions || []).filter(image => /^https:\/\//i.test(image.url)).slice(0, 4);
  return <section className="border-t border-white/15 pt-3 space-y-3" aria-label="Billedvalg til Livs artikel">
    <h3>Billede til artiklen</h3>
    <p className="text-xs text-white/60">Vælg et researchforslag, tilføj alt-tekst og kredit. Billedet gemmes som WebP i 1920 × 1080 og følger med til Writer. Det oprindelige motiv beskæres til 16:9.</p>
    {selected && <figure className="space-y-2">
      <Image src={selected.url} alt={selected.alt} width={1920} height={1080} unoptimized className="w-full h-auto rounded-lg" />
      <figcaption className="text-xs text-white/60">Gemt: {Math.ceil(selected.bytes / 1024)} KiB · {selected.credit}</figcaption>
      <p className="text-xs text-amber-200">Filens indhold er kontrolleret. Brugsret og visuel godkendelse mangler stadig.</p>
    </figure>}
    {!candidates.length ? <p className="text-xs text-white/60">Ingen billedforslag fundet. Du kan fortsat finde, uploade eller generere et billede i Writer, hvis billedgenerering er aktiveret.</p> : <form className="space-y-3" onSubmit={event => { event.preventDefault(); if (!busy) void onPrepare({ url, alt, credit }); }}>
      <fieldset disabled={busy} className="space-y-2">
        <legend className="text-xs mb-2">Researchforslag, ikke rettighedsgodkendte billeder</legend>
        {candidates.map(candidate => <div key={candidate.url} className="text-sm space-x-2">
          <label><input type="radio" name="liv-image" value={candidate.url} checked={url === candidate.url} onChange={() => setUrl(candidate.url)} required /> {candidate.title || candidate.source || 'Billedforslag'}</label>
          <a href={candidate.url} target="_blank" rel="noreferrer" className="underline text-xs">Åbn billede</a>
          {candidate.sourcePageUrl && /^https:\/\//i.test(candidate.sourcePageUrl) && <a href={candidate.sourcePageUrl} target="_blank" rel="noreferrer" className="underline text-xs">Kildeside</a>}
        </div>)}
        <label className="block text-xs">Alt-tekst, beskriv det synlige motiv
          <input className="block w-full mt-1 rounded border border-white/20 bg-transparent p-2" value={alt} onChange={event => setAlt(event.target.value)} required minLength={10} maxLength={300} />
        </label>
        <label className="block text-xs">Fotograf eller rettighedshaver, som oplyst ved kilden
          <input className="block w-full mt-1 rounded border border-white/20 bg-transparent p-2" value={credit} onChange={event => setCredit(event.target.value)} required minLength={2} maxLength={200} />
        </label>
      </fieldset>
      <button type="submit" disabled={busy || !url || alt.trim().length < 10 || credit.trim().length < 2} className="rounded-lg border border-white/20 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-40">{busy ? 'Klargør billede…' : 'Gem billedvalg til kladden'}</button>
    </form>}
  </section>;
}
