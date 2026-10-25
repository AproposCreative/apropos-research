'use client';

import type { useCardSubtitle } from './useCardSubtitle';

const buttonClass = 'min-h-11 rounded-lg border border-white/30 px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-40';

export default function SubtitleControls({ subtitle }: { subtitle: ReturnType<typeof useCardSubtitle> }) {
  const adapted = subtitle.status === 'excerpt' || subtitle.status === 'chatgpt' || subtitle.status === 'ai';
  return (
    <details className="w-full max-w-xl rounded-xl border border-white/15 px-4 py-3 text-sm text-white">
      <summary className="cursor-pointer py-1 leading-relaxed">Undertekst på billedet{subtitle.checking ? ' · AI forkorter automatisk' : subtitle.error ? ' · Kontrollér teksten' : !subtitle.ready ? ' · Kontrollér teksten' : adapted ? ' · Automatisk tilpasset' : ' · Klar'}</summary>
      <label className="mt-3 block">Redigér undertekst
        <textarea aria-label="Undertekst på billedet" value={subtitle.text} onChange={event => subtitle.edit(event.target.value)} rows={3} className="apropos-input-dark mt-1 w-full rounded-lg border p-2" />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={subtitle.reset} className={buttonClass}>Tilpas automatisk</button>
        <button type="button" onClick={subtitle.restore} className={buttonClass}>Gendan original</button>
      </div>
      <p className="mt-3 text-white/70 leading-relaxed">Kun underteksten på billedet ændres. Den oprindelige artikel bevares.</p>
      {subtitle.status === 'ai' && <p className="mt-2 text-white/70">Forkortet automatisk med AI til dette billedformat. Kontrollér teksten før udgivelse.</p>}
      {subtitle.status === 'chatgpt' && <p className="mt-2 text-white/70">Bruger den SoMe-tekst, ChatGPT gemte med denne artikelversion.</p>}
      {subtitle.status === 'excerpt' && <p className="mt-2 text-white/70">{subtitle.truncated ? 'Viser begyndelsen af originalen med …' : 'Viser et afsluttet, ordret uddrag fra originalen.'} Dette er et uddrag, ikke en AI-omskrivning.</p>}
      {subtitle.error && <p className="mt-2 text-amber-300" role="alert">{subtitle.error}</p>}
      {!subtitle.ready && !subtitle.checking && <p className="mt-2 text-amber-300">Denne tekst passer ikke i læsbar størrelse. Vælg Tilpas automatisk, eller redigér den.</p>}
    </details>
  );
}
