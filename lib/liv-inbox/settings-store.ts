import { readJsonFile, writeJsonFile } from '@/lib/funding/json-store';
import { resolveAccreditationPersistenceKind } from '@/lib/accreditation/persistence/env';
import { requireFirestore, stripUndefined } from '@/lib/accreditation/persistence/firestore-kit';
import { registerAccreditationStoreReset } from '@/lib/accreditation/persistence/reset-registry';
import type { LivInboxSettings } from '@/lib/liv-inbox/types';

const FILENAME = 'liv_inbox_settings.json';
const COLLECTION = 'livInboxSettings';
const DOC_ID = 'default';

/** Default house rules — editable in the UI, injected into Liv's prompt. */
export const DEFAULT_GUIDELINES = [
  'Sådan behandler vi normalt henvendelser i Apropos-indbakken:',
  '',
  '- Svar altid varmt, kort og professionelt. Fremstå proaktiv og imødekommende.',
  '- Presse/PR og promotorer: bekræft modtagelse, spørg konkret ind til hvad de tilbyder (dato, sted, adgang), og fortæl at vi vender tilbage.',
  '- Læserhenvendelser og ros: tak dem oprigtigt og kort.',
  '- Pitches/samarbejdsforslag: vær positiv men uforpligtende; vi vurderer redaktionelt og vender tilbage.',
  '- Praktiske spørgsmål om magasinet: svar hjælpsomt ud fra almindelig viden om Apropos.',
  '',
  'Eskalér ALTID til Frederik (svar ikke selv) ved:',
  '- Penge, fakturaer, kontrakter, juridisk eller NDA.',
  '- Følsomme personoplysninger.',
  '- Login/credentials/captcha eller noget der kræver en menneskelig handling.',
  '- Alt du er i tvivl om, eller som virker vigtigt/uvant.',
].join('\n');

export const DEFAULT_SETTINGS: LivInboxSettings = {
  autoRespond: false,
  guidelines: DEFAULT_GUIDELINES,
  signature: 'Bedste hilsner\nLiv Brandt\nApropos Magazine',
  confidenceThreshold: 70,
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
  patch: Partial<Pick<LivInboxSettings, 'autoRespond' | 'guidelines' | 'signature' | 'confidenceThreshold' | 'updatedBy'>>
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
