'use client';

import { appendColleagueNotes } from '@/lib/editorial/colleague-notes';

/** Uses the existing private workspace notes, not a second collaboration store. */
export default function ColleagueNotes({ notes, onChange }: { notes: string; onChange: (value: string) => void }) {
  return <details className="rounded-xl border border-white/15 p-3 text-sm text-white/70">
    <summary className="min-h-11 cursor-pointer content-center">Noter fra redaktionen</summary>
    <p className="my-2">Tilføj kollegaens konkrete observationer, reaktion og navn. Tilstedeværelse alene bekræfter ikke alle detaljer. Noterne gemmes med dit arbejdsrum.</p>
    <button type="button" className="min-h-11 underline underline-offset-4" onClick={() => onChange(appendColleagueNotes(notes))}>Indsæt skabelon til kolleganoter</button>
    <label htmlFor="writer-colleague-notes" className="block py-2">Skrivegrundlag og bekræftede oplevelser</label>
    <textarea id="writer-colleague-notes" value={notes} onChange={event => onChange(event.target.value)} rows={8}
      className="w-full rounded-lg border border-white/15 bg-black/30 p-3 text-base text-white" />
    <p className="mt-2">At gemme noter bestiller ikke AI og udgiver ikke noget. Tomme felter er ikke bekræftelser.</p>
  </details>;
}
