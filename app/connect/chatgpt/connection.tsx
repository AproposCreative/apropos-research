'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import ConnectionSetup from './setup';
import ShorteningConfirmation from './shortening';

const button = 'min-h-12 rounded-xl border border-white/20 px-5 py-3 text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:opacity-40';
export default function ChatGPTConnection({ requestId, publicationId, shorteningId = '' }: { requestId: string; publicationId: string; shorteningId?: string }) {
  const { user, loading, capabilities, signIn, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState('frederik@aproposmagazine.com'), [password, setPassword] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [done, setDone] = useState('');
  const [context, setContext] = useState<Record<string, any> | null>(null);
  useEffect(() => {
    if (!user || !capabilities.owner || (!requestId && !publicationId)) return;
    let active = true;
    const path = publicationId ? `/oauth/publication?id=${encodeURIComponent(publicationId)}` : `/oauth/consent?request=${encodeURIComponent(requestId)}`;
    (async () => {
      const response = await fetch(path, { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: 'no-store' });
      if (!response.ok) throw Error();
      const body = await response.json(); if (active) setContext(body);
    })().catch(() => { if (active) setError('Linket er udløbet, eller adgangen mangler. Start forbindelsen eller preview igen i ChatGPT.'); });
    return () => { active = false; };
  }, [user, capabilities.owner, requestId, publicationId]);
  async function action(kind: 'allow' | 'deny' | 'publish' | 'revoke') {
    if (!user || busy) return;
    if (kind === 'revoke' && !window.confirm('Afbryd alle dine Apropos-forbindelser til ChatGPT?')) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(kind === 'publish' ? '/oauth/publication' : '/oauth/consent', {
        method: kind === 'revoke' ? 'DELETE' : 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
        ...(kind === 'revoke' ? {} : { body: JSON.stringify(kind === 'publish' ? { id: publicationId } : { request: requestId, allow: kind === 'allow' }) }),
      });
      const body = await response.json(); if (!response.ok) throw Error();
      if (body.redirect) {
        const redirect = new URL(body.redirect);
        if (redirect.origin !== 'https://chatgpt.com') throw Error();
        window.location.assign(redirect.href);
      } else setDone(kind === 'publish' ? 'Versionen er bekræftet. Gå tilbage til ChatGPT og bed den gennemføre publiceringen.' : 'Forbindelserne er afbrudt.');
    } catch { setError('Handlingen kunne ikke bekræftes. Hent et nyt link i ChatGPT, og prøv igen.'); }
    finally { setBusy(false); }
  }
  const current = context?.current;
  return <main className="min-h-dvh bg-[#000] px-4 py-5 text-white sm:p-8">
    <section className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-white/15 bg-[#080808]">
      <header className="flex items-center justify-between border-b border-white/15 px-5 py-4">
        <h1 className="text-xl font-medium">{publicationId ? 'Bekræft udgivelse' : shorteningId ? 'Godkend forkortelse' : 'Apropos i ChatGPT'}</h1>
        <Link href="/ai" className={`${button} !p-3`} aria-label="Tilbage til Apropos"><X size={22} /></Link>
      </header>
      <div className="space-y-6 p-5 sm:p-7">
        {loading ? <p>Henter din adgang …</p> : !user ? <>
          <p className="text-white/65">Log ind med din Apropos-konto. Piloten er kun til Frederik.</p>
          <form className="space-y-4" onSubmit={async e => { e.preventDefault(); setBusy(true); setError('');
            try { await signIn(email, password); } catch { setError('Login kunne ikke bekræftes. Kontrollér din Apropos-mail og adgangskode.'); } finally { setBusy(false); } }}>
            <label className="block">E-mail<input autoComplete="username" type="email" required value={email} onChange={e => setEmail(e.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-white/25 bg-transparent p-3" /></label>
            <label className="block">Adgangskode<input autoComplete="current-password" type="password" required value={password} onChange={e => setPassword(e.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-white/25 bg-transparent p-3" /></label>
            <button className={`${button} w-full bg-white/10`} disabled={busy}>Log ind</button>
          </form>
          <button className={`${button} w-full`} disabled={busy} onClick={async () => { setBusy(true); try { await signInWithGoogle(); } catch { setError('Google-login kunne ikke bekræftes.'); } finally { setBusy(false); } }}>Log ind med Google</button>
        </> : !capabilities.owner ? <p>Forbindelsen er indtil videre kun til Frederik. Dit arbejdsrum er uændret.</p> : done ? <p role="status">{done}</p> : publicationId ? <>
          {!context ? <p>Henter preview …</p> : <>
            <h2 className="text-2xl">{context.title}</h2>
            {current?.expected?.subtitle && <p className="text-white/80">{current.expected.subtitle}</p>}
            {current?.expected?.author && <p className="text-sm text-white/55">Af {current.expected.author}{current.expected.rating ? ` · ${current.expected.rating}/6 stjerner` : ''}</p>}
            <p className="text-white/65">Kun denne artikelversion. Ingen Instagram. Bekræftelsen udløber efter ti minutter.</p>
            {current?.expected?.featuredImage && <Image unoptimized src={current.expected.featuredImage} alt={current.expected.featuredImageAlt || 'Artiklens cover'} width={960} height={540} className="h-auto w-full rounded-xl" />}
            {current?.expected?.fotoCredit && <p className="text-sm text-white/55">{current.expected.fotoCredit}</p>}
            {current?.expected?.intro && <p className="leading-relaxed">{current.expected.intro.replace(/<[^>]*>/g, ' ')}</p>}
            <details className="rounded-xl border border-white/15 p-4"><summary>Læs den tekst, der udgives</summary><p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed">{current?.expected?.content?.replace(/<[^>]*>/g, ' ')}</p></details>
            {current?.bodyImages?.length > 0 && <details className="rounded-xl border border-white/15 p-4"><summary>Se artiklens billeder og krediteringer</summary>
              <div className="mt-4 space-y-4">{current.bodyImages.map((img: { url: string; alt: string; caption: string }, i: number) => <figure key={`${img.url}-${i}`}>
                <Image unoptimized src={img.url} alt={img.alt} width={960} height={540} className="h-auto w-full rounded-xl" />
                <figcaption className="mt-2 text-sm text-white/65">{img.caption || img.alt}</figcaption>
              </figure>)}</div>
            </details>}
            {!current?.ready && <p role="alert">{current?.blockers?.join(' ') || 'Artiklen er ikke klar.'}</p>}
            <button className={`${button} w-full bg-white/10`} disabled={busy || !current?.ready} onClick={() => action('publish')}>Bekræft denne version til publicering</button>
          </>}
        </> : requestId ? <>
          <p>ChatGPT får adgang på vegne af dig, Frederik. Dine kollegers private kladder deles ikke.</p>
          {context ? <>
            <ul className="list-disc space-y-2 pl-5 text-white/75">
              <li>Læs artikler, egne kladder, kilder, Liv-status og registreret forbrug.</li>
              {context.scopes?.includes('apropos:draft') && <li>Gem og redigér kladder. Bevar versioner og gem til Webflow.</li>}
              {context.scopes?.includes('apropos:publish') && <li>Forbered publicering. Hver udgivelse kræver din separate bekræftelse.</li>}
            </ul>
            <p className="text-sm text-white/55">Ingen skjulte AI-køb, ændrede budgetter eller adgang til hele databasen.</p>
            <button className={`${button} w-full bg-white/10`} disabled={busy} onClick={() => action('allow')}>Forbind ChatGPT</button>
            <button className={button} disabled={busy} onClick={() => action('deny')}>Afvis</button>
          </> : <p>Kontrollerer forbindelsen …</p>}
        </> : shorteningId ? <ShorteningConfirmation proposalId={shorteningId} /> : <>
          <ConnectionSetup key={user.uid} />
          <details className="border-t border-white/15 pt-4"><summary>Forbindelsesindstillinger</summary><button className={`${button} mt-4`} disabled={busy} onClick={() => action('revoke')}>Afbryd mine ChatGPT-forbindelser</button></details>
        </>}
        {error && <p role="alert" className="rounded-xl border border-red-400/40 p-4 text-red-200">{error}</p>}
      </div>
    </section>
  </main>;
}
