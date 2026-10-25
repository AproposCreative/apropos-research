'use client';

import type { useCardTitle } from './useCardTitle';

const buttonClass = 'min-h-11 rounded-lg border border-white/30 px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-40';

export default function TitleControls({ title }: { title: ReturnType<typeof useCardTitle> }) {
  return <details className="w-full max-w-xl rounded-xl border border-white/15 px-4 py-3 text-sm text-white">
    <summary className="cursor-pointer py-1 leading-relaxed">Overskrift på billedet{title.loading ? ' · Henter AI-forslag' : ''}</summary>
    <label className="mt-3 block">Redigér overskrift
      <textarea aria-label="Overskrift på billedet" value={title.text} onChange={event => title.edit(event.target.value)} rows={2}
        className="apropos-input-dark mt-1 w-full rounded-lg border p-2" />
    </label>
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" onClick={title.requestMore} disabled={!title.canGetMore} className={buttonClass}>
        {title.loading ? 'Henter forslag…' : title.options.length ? 'Nye overskrifter med AI' : 'Forkort med AI'}
      </button>
      <button type="button" onClick={title.restore} className={buttonClass}>Gendan original</button>
    </div>
    {title.options.length > 0 && <div className="mt-3" aria-label="Forslag til overskrift">
      <p className="mb-2 text-white/70">Vælg den overskrift, der passer bedst:</p>
      <div className="flex flex-col gap-2">
        {title.options.map((option, index) => <button key={`${index}-${option}`} type="button" onClick={() => title.choose(option)}
          aria-pressed={title.text === option} className={`${buttonClass} text-left leading-relaxed ${title.text === option ? 'border-white bg-white/15' : ''}`}>
          {option}
        </button>)}
      </div>
    </div>}
    {title.maxVariantsReached && <p className="mt-2 text-white/70">Alle forslag til denne artikelversion er hentet. Du kan stadig vælge eller redigere dem.</p>}
    {title.error && <p role="alert" className="mt-2 text-amber-300">{title.error}</p>}
    <p className="mt-3 text-white/70 leading-relaxed">Ændringen gælder kun billedets overskrift. Artiklen og opslagsteksten bevares. Nye AI-forslag bruger det eksisterende engangsloft på 10 kr.</p>
  </details>;
}
