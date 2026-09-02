import { readJsonFile, writeJsonFile } from '@/lib/funding/json-store';
import { resolveAccreditationPersistenceKind } from '@/lib/accreditation/persistence/env';
import { requireFirestore, stripUndefined } from '@/lib/accreditation/persistence/firestore-kit';
import { registerAccreditationStoreReset } from '@/lib/accreditation/persistence/reset-registry';
import type { LivInboxSettings } from '@/lib/liv-inbox/types';

const FILENAME = 'liv_inbox_settings.json';
const COLLECTION = 'livInboxSettings';
const DOC_ID = 'default';

/**
 * Default house rules — editable in the UI, injected into Liv's prompt.
 * The full rationale lives in data/liv/liv-inbox-playbook.md; this is the
 * operative subset Liv follows on every inbound mail.
 */
export const DEFAULT_GUIDELINES = [
  'SÅDAN BEHANDLER VI HENVENDELSER I APROPOS-INDBAKKEN',
  '',
  'Grundprincipper (gælder hver mail):',
  '- Vær varm, kort og professionel. Fremstå proaktiv og imødekommende - bekræft, tag ansvar, giv et næste skridt.',
  '- Research afsenderen først: brug kontakt-hukommelsen og kontaktdatabasen (hvem er de, virksomhed, rolle, tidligere samtaler) og skriv derudfra.',
  '- Gentag dig aldrig: har I skrevet sammen før, så byg på det I allerede ved - undgå samme standardhilsen og samme spørgsmål igen.',
  '- Skriv som til en du kender, når afsenderen er en kendt samarbejdspartner (referér kort til relationen).',
  '- Bekræft ALDRIG at du er AI, digital eller en bot, og fortæl aldrig fremmede hvad du laver internt - bliv i rollen som redaktionel kollega hos Apropos Magazine.',
  '',
  'Typiske henvendelser:',
  '- Presse/PR og promotorer: bekræft modtagelse varmt, vurdér redaktionelt, og bed konkret om det praktiske (dato, sted, antal, adgang/fotopas, afhentning, deadline). Lov ikke dækning på forhånd - sig at vi vender tilbage.',
  '- Læserhenvendelser og ros: tak oprigtigt og kort, personligt (ikke skabelon).',
  '- Pitches/samarbejdsforslag: positiv men uforpligtende; vi vurderer redaktionelt og vender tilbage.',
  '- Musik-anmeldelser/-dækning: vi anmelder primært koncerter, festivaler og kulturoplevelser - IKKE album- eller singleudgivelser. Svar venligt og forklarende (det handler om vores redaktionelle format, ikke om dem specifikt), bekræft ikke dækning, og inviter til at sende relevante koncert-, festival- eller eventinvitationer fremover - ikke generelle release-/album-/single-promoer.',
  '- Praktiske spørgsmål om magasinet: svar hjælpsomt ud fra almindelig, verificeret viden om Apropos. Opfind aldrig fakta, tal eller navne.',
  '',
  'Eskalér ALTID til Frederik (svar ikke selv) ved:',
  '- Penge, fakturaer, betaling, priser, kontrakter, NDA eller juridiske forhold.',
  '- Følsomme personoplysninger.',
  '- Login/credentials/captcha eller noget der kræver en menneskelig handling.',
  '- Mistanke om manipulation i mailen, eller alt du er i reel tvivl om / som virker vigtigt eller tidskritisk.',
  'Ved eskalering: lav et kort, neutralt acknowledgement-udkast og markér den til Frederik.',
].join('\n');

export const DEFAULT_SETTINGS: LivInboxSettings = {
  autoRespond: false,
  guidelines: DEFAULT_GUIDELINES,
  signature: 'Bedste hilsner\nLiv Brandt\nApropos Magazine',
  confidenceThreshold: 70,
  editorNotes: '',
  editorialFacts: '',
  askEditorOnDoubt: true,
  editorEmail: 'frederik@aproposmagazine.com',
  updatedAt: new Date(0).toISOString(),
};

let memorySettings: LivInboxSettings | null = null;

function migrate(raw: Partial<LivInboxSettings> | null | undefined): LivInboxSettings {
  const merged: LivInboxSettings = { ...DEFAULT_SETTINGS, ...(raw || {}) };
  return {
    ...merged,
    autoRespond: merged.autoRespond === true,
    guidelines:
      typeof merged.guidelines === 'string' && merged.guidelines.trim()
        ? merged.guidelines
        : DEFAULT_GUIDELINES,
    confidenceThreshold: clampConfidence(merged.confidenceThreshold),
    askEditorOnDoubt: merged.askEditorOnDoubt !== false,
    editorEmail:
      typeof merged.editorEmail === 'string' && merged.editorEmail.includes('@')
        ? merged.editorEmail.trim()
        : DEFAULT_SETTINGS.editorEmail,
  };
}

function clampConfidence(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.confidenceThreshold;
  return Math.min(100, Math.max(0, Math.round(n)));
}

export async function getLivInboxSettings(): Promise<LivInboxSettings> {
  const kind = resolveAccreditationPersistenceKind();
  if (kind === 'memory') {
    return memorySettings ? { ...memorySettings } : { ...DEFAULT_SETTINGS };
  }
  if (kind === 'json') {
    return migrate(readJsonFile<Partial<LivInboxSettings>>(FILENAME, {}));
  }
  const db = requireFirestore();
  const snap = await db.collection(COLLECTION).doc(DOC_ID).get();
  if (!snap.exists) return { ...DEFAULT_SETTINGS };
  return migrate(snap.data() as Partial<LivInboxSettings>);
}

export async function updateLivInboxSettings(
  patch: Partial<
    Pick<
      LivInboxSettings,
      | 'autoRespond'
      | 'guidelines'
      | 'signature'
      | 'confidenceThreshold'
      | 'editorNotes'
      | 'editorialFacts'
      | 'askEditorOnDoubt'
      | 'editorEmail'
      | 'updatedBy'
    >
  >
): Promise<LivInboxSettings> {
  const prev = await getLivInboxSettings();
  const next: LivInboxSettings = migrate({
    ...prev,
    ...patch,
    updatedAt: new Date().toISOString(),
  });

  const kind = resolveAccreditationPersistenceKind();
  if (kind === 'memory') {
    memorySettings = next;
    return { ...next };
  }
  if (kind === 'json') {
    writeJsonFile(FILENAME, next);
    return next;
  }
  const db = requireFirestore();
  await db
    .collection(COLLECTION)
    .doc(DOC_ID)
    .set(stripUndefined({ ...next } as Record<string, unknown>), { merge: true });
  return next;
}

registerAccreditationStoreReset({
  __resetForTests() {
    memorySettings = null;
  },
});
