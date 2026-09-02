/**
 * Learn from the editor's corrections.
 *
 * When Frederik edits Liv's draft before "Godkend & send", we distil what
 * changed into short, reusable notes so Liv matches his tone/decisions better
 * next time:
 *  - a GLOBAL style/decision rule appended to LivInboxSettings.editorNotes,
 *  - a per-CONTACT note merged into the contact profile.
 *
 * Uses the fast model. Best-effort: any failure is swallowed and never blocks
 * the send.
 */
import { getOpenAIClient } from '@/lib/openai';
import { getAccreditationFastModel } from '@/lib/accreditation/models';
import { sanitizeLivOutput } from '@/lib/accreditation/sanitize';
import { getContactProfile, upsertContactProfile } from '@/lib/accreditation/memory-store';
import { getLivInboxSettings, updateLivInboxSettings } from '@/lib/liv-inbox/settings-store';

const EDITOR_NOTES_CAP = 1500;
const CONTACT_NOTES_CAP = 400;

function normalize(s: string): string {
  return (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** True when the edit is more than a trivial whitespace/identical change. */
export function isMeaningfulEdit(original: string, edited: string, signature?: string): boolean {
  const strip = (t: string) => {
    let out = t || '';
    if (signature) out = out.split(signature).join(' ');
    return normalize(out);
  };
  const a = strip(original);
  const b = strip(edited);
  if (!a || !b) return false;
  return a !== b;
}

/** Merge a distilled note into an existing block, de-duped and capped (keep newest). */
export function mergeNote(prev: string, addition: string, cap: number): string {
  const add = sanitizeLivOutput((addition || '').trim());
  if (!add) return prev || '';
  if (normalize(prev).includes(normalize(add))) return prev || '';
  const merged = [(prev || '').trim(), `- ${add}`].filter(Boolean).join('\n');
  return merged.length > cap ? merged.slice(merged.length - cap) : merged;
}

export interface LearnFromEditResult {
  learned: boolean;
  globalNote?: string;
  contactNote?: string;
}

export async function learnFromEdit(params: {
  original: string;
  edited: string;
  contactEmail: string;
  subject?: string;
  signature?: string;
}): Promise<LearnFromEditResult> {
  const { original, edited, contactEmail } = params;
  if (!isMeaningfulEdit(original, edited, params.signature)) return { learned: false };

  const openai = getOpenAIClient();
  if (!openai) return { learned: false };

  const model = getAccreditationFastModel();
  try {
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: [
            'Du er redaktionel stil-coach for skribenten Liv hos Apropos Magazine.',
            'En redaktør har rettet Livs mail-udkast før afsendelse. Udled KORT hvad Liv skal lære,',
            'så hun rammer stilen/beslutningen bedre næste gang.',
            'Returnér KUN JSON: {"global":"en kort generel stil-/beslutningsregel (tom hvis intet generelt)","contact":"en kort note specifik for denne kontakt (tom hvis intet)"}.',
            'Skriv regler - ikke mailtekst, ingen citater, ingen personoplysninger. Maks 160 tegn pr. felt. Dansk.',
          ].join(' '),
        },
        {
          role: 'user',
          content: [
            'Livs oprindelige udkast:',
            original.slice(0, 3000),
            '',
            'Redaktørens endelige version:',
            edited.slice(0, 3000),
          ].join('\n'),
        },
      ],
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw) as { global?: string; contact?: string };
    const globalNote = sanitizeLivOutput(String(parsed.global || '').trim()).slice(0, 200);
    const contactNote = sanitizeLivOutput(String(parsed.contact || '').trim()).slice(0, 200);

    let learned = false;

    if (globalNote) {
      const settings = await getLivInboxSettings();
      const merged = mergeNote(settings.editorNotes || '', globalNote, EDITOR_NOTES_CAP);
      if (merged !== (settings.editorNotes || '')) {
        await updateLivInboxSettings({ editorNotes: merged, updatedBy: 'liv-learn' });
        learned = true;
      }
    }

    if (contactNote && contactEmail) {
      const profile = await getContactProfile(contactEmail);
      const merged = mergeNote(profile?.notes || '', contactNote, CONTACT_NOTES_CAP);
      if (merged !== (profile?.notes || '')) {
        await upsertContactProfile({ email: contactEmail, notes: merged, preserveInteractionCount: true });
        learned = true;
      }
    }

    return { learned, globalNote: globalNote || undefined, contactNote: contactNote || undefined };
  } catch {
    return { learned: false };
  }
}
