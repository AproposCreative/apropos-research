'use client';

import { useState } from 'react';
import type { useCardSubtitle } from './useCardSubtitle';
import { subtitleChatPrompt } from './subtitleCopy';
import type { SocialCardSize } from './SocialCardCanvas';

const buttonClass = 'min-h-11 rounded-lg border border-white/30 px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-40';

export default function SubtitleControls({ subtitle, title, size }: {
  subtitle: ReturnType<typeof useCardSubtitle>; title: string; size: SocialCardSize;
}) {
  const [handoff, setHandoff] = useState<{ prompt: string; copied: boolean } | null>(null);
  const prompt = subtitleChatPrompt(title, subtitle.text, size);
  const currentHandoff = handoff?.prompt === prompt ? handoff : null;
  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setHandoff({ prompt, copied: true });
    } catch {
      // Clipboard permission is optional, including in embedded/mobile hosts.
      setHandoff({ prompt, copied: false });
    }
  }
  return (
    <details className="w-full max-w-xl rounded-xl border border-white/20 p-3 text-sm text-white">
      <summary className="cursor-pointer">Undertekst på billedet{subtitle.checking ? ' · Kontrollerer plads' : !subtitle.ready ? ' · Skal forkortes' : ' · Klar'}</summary>
      <label className="mt-3 block">Redigér undertekst
        <textarea aria-label="Undertekst på billedet" value={subtitle.text} onChange={event => subtitle.edit(event.target.value)} rows={3} className="apropos-input-dark mt-1 w-full rounded-lg border p-2" />
      </label>
      {subtitle.suggestion && (
        <div className="mt-3 border-l-2 border-white/30 pl-3">
          <p className="text-white/70">Første sætning passer uden omskrivning:</p>
          <p className="mt-1">{subtitle.suggestion}</p>
          <button type="button" className={`${buttonClass} mt-2`} onClick={() => subtitle.suggestion && subtitle.edit(subtitle.suggestion, 'excerpt')}>Brug første sætning</button>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={!subtitle.text.trim()} onClick={() => void copyPrompt()} className={buttonClass}>Kopiér til ChatGPT</button>
        <button type="button" onClick={subtitle.restore} className={buttonClass}>Gendan original</button>
      </div>
      <p className="mt-2 text-white/60">Kun teksten på SoMe-billedet ændres. Artiklen bevares. Ingen betalte AI-kald fra Apropos.</p>
      {subtitle.status === 'excerpt' && <p className="mt-2 text-white/70">Kun første sætning er valgt. Kontrollér, at den dækker din pointe.</p>}
      {currentHandoff && (
        <div className="mt-3">
          <p role="status">{currentHandoff.copied ? 'Kopieret. Indsæt i din redaktionstråd i ChatGPT, og indsæt svaret i undertekstfeltet her.' : 'Automatisk kopiering er ikke tilladt her. Markér og kopiér instruktionen nedenfor til din redaktionstråd i ChatGPT. Indsæt svaret i undertekstfeltet her.'}</p>
          <label className="mt-2 block">Instruktion til ChatGPT
            <textarea aria-label="Instruktion til ChatGPT" readOnly value={prompt} onFocus={event => event.target.select()} rows={4} className="apropos-input-dark mt-1 w-full rounded-lg border p-2" />
          </label>
        </div>
      )}
      {!subtitle.ready && !subtitle.checking && <p className="mt-2 text-amber-300">Forkort underteksten, så den kan læses på det færdige billede. Du kan også omskrive den i ChatGPT.</p>}
    </details>
  );
}
