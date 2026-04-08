import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Frameld nyhedsbrev · Apropos',
  robots: { index: false, follow: false },
};

type SearchParams = { status?: string; reason?: string };

function messageFor(params: SearchParams): { title: string; body: string; ok: boolean } {
  const { status, reason } = params;
  if (status === 'ok') {
    return {
      ok: true,
      title: 'Du er frameldt',
      body: 'Du modtager ikke flere nyhedsbreve fra os. Du kan altid tilmelde dig igen på aproposmagazine.com.',
    };
  }
  if (reason === 'config') {
    return {
      ok: false,
      title: 'Frameldning utilgængelig',
      body: 'Nyhedsbrevs-frameldning er ikke konfigureret på serveren. Skriv til hej@aproposmagazine.com.',
    };
  }
  if (reason === 'missing_token') {
    return {
      ok: false,
      title: 'Ugyldigt link',
      body: 'Manglende eller ugyldig sikkerhedskode i linket.',
    };
  }
  if (reason === 'invalid') {
    return {
      ok: false,
      title: 'Linket er ugyldigt',
      body: 'Frameldingslinket er udløbet eller ugyldigt. Skriv til hej@aproposmagazine.com, hvis du vil frameldes.',
    };
  }
  if (reason === 'server') {
    return {
      ok: false,
      title: 'Kunne ikke registrere framelding',
      body: 'Der opstod en teknisk fejl. Skriv til hej@aproposmagazine.com med din e-mail, så fjerner vi dig manuelt.',
    };
  }
  return {
    ok: false,
    title: 'Frameld nyhedsbrev',
    body: 'Brug linket i din nyhedsmail for at framelde dig, eller skriv til hej@aproposmagazine.com.',
  };
}

export default async function NewsletterUnsubscribedPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const { title, body, ok } = messageFor(sp);
  const accent = ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400';
  const cardClass = ok
    ? 'border-emerald-200/80 bg-emerald-50/90 dark:border-emerald-800/50 dark:bg-emerald-950/40'
    : 'border-red-200/80 bg-red-50/90 dark:border-red-900/45 dark:bg-red-950/35';

  return (
    <div className="min-h-[100dvh] flex items-center justify-center px-5 py-16 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-[#0a0a0a] dark:to-black text-slate-900 dark:text-slate-100">
      <div
        className={`w-full max-w-md rounded-2xl border px-8 py-10 text-center shadow-lg dark:shadow-none ${cardClass}`}
      >
        <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-white/45 mb-3">
          Apropos Magazine
        </p>
        <h1 className={`text-2xl font-semibold mb-4 ${accent}`}>{title}</h1>
        <p className="text-[15px] leading-relaxed text-slate-600 dark:text-white/75">{body}</p>
        <p className="mt-8 text-sm">
          <Link
            href="https://www.aproposmagazine.com/"
            className="text-slate-500 dark:text-white/55 underline hover:text-slate-800 dark:hover:text-white/90 transition-colors"
          >
            aproposmagazine.com
          </Link>
        </p>
      </div>
    </div>
  );
}
