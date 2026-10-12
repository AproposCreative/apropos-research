'use client';

import type { useCardSubtitle } from './useCardSubtitle';

const buttonClass = 'min-h-11 rounded-lg border border-white/30 px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-40';

export default function SubtitleControls({ subtitle }: { subtitle: ReturnType<typeof useCardSubtitle> }) {
  const adapted = subtitle.status === 'excerpt' || subtitle.status === 'chatgpt';
  return (
    <details className="w-full max-w-xl rounded-xl border border-white/20 p-3 text-sm text-white">
      <summary className="cursor-pointer">Undertekst på billedet{subtitle.checking ? ' · Tilpasser automatisk' : !subtitle.ready ? ' · Kontrollér teksten' : adapted ? ' · Automatisk tilpasset' : ' · Klar'}</summary>
      <label className="mt-3 block">Redigér undertekst
        <textarea aria-label="Undertekst på billedet" value={subtitle.text} onChange={event => subtitle.edit(event.target.value)} rows={3} className="apropos-input-dark mt-1 w-full rounded-lg border p-2" />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={subtitle.reset} className={buttonClass}>Tilpas automatisk</button>
        <button type="button" onClick={subtitle.restore} className={buttonClass}>Gendan original</button>
      </div>
      <p className="mt-2 text-white/60">Teksten tilpasses automatisk til formatet. Artiklen bevares. Ingen betalte AI-kald fra Apropos.</p>
      {subtitle.status === 'chatgpt' && <p className="mt-2 text-white/70">Bruger den SoMe-tekst, ChatGPT gemte med denne artikelversion.</p>}
      {subtitle.status === 'excerpt' && <p className="mt-2 text-white/70">{subtitle.truncated ? 'Viser begyndelsen af originalen med …' : 'Viser et afsluttet uddrag fra begyndelsen af originalen.'} Dette er et uddrag, ikke en AI-omskrivning.</p>}
      {!subtitle.ready && !subtitle.checking && <p className="mt-2 text-amber-300">Denne tekst passer ikke i læsbar størrelse. Vælg Tilpas automatisk, eller redigér den.</p>}
    </details>
  );
}
