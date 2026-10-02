import { z } from 'zod';
import { load } from 'cheerio';
import { articleUnits, assessmentSchema } from '@/lib/factcheck/grounded';
import { editorialVerdictSchema, type LivEditorialFields } from './editorial-assessment-contract';

export const EDITORIAL_ECONOMY_POLICY = 'compact-caption-delta-v1';
const claimSchema = assessmentSchema.shape.units.element.shape.claims.element;
const compactSchema = assessmentSchema.extend({
  units: z.array(assessmentSchema.shape.units.element.extend({
    claims: z.array(claimSchema.extend({ explanation: z.string().max(240) })).max(30),
  })).min(1).max(50),
  editorial: editorialVerdictSchema.extend({ summary: z.string().min(1).max(400) }),
});
const { $schema: _schema, ...schema } = z.toJSONSchema(compactSchema);
export const compactEditorialResponseFormat = { type: 'json_schema' as const,
  json_schema: { name: 'liv_editorial_compact_v1', strict: true, schema } };
export const compactEditorialPrompt = `SVARØKONOMI: Bevar alle kontroller, fakta, units og konkrete kildebelæg. For verified claims er explanation en tom streng; citaterne er dokumentationen. For disputed/unverifiable giv kun den konkrete mangel, højst 240 tegn. editorial.summary højst 400 tegn. Ingen gentagelse af artiklen eller generelle kvalitetsrapporter. Dette er et kompakt svarformat, aldrig en lempelse af evidenskrav.`;

/** Empty success prose carries no evidence: unchanged validators still check every quote. */
export function expandCompactEditorial(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as any).units)) return raw;
  return { ...raw, units: (raw as any).units.map((unit: any) => !Array.isArray(unit?.claims) ? unit : ({ ...unit,
    claims: unit.claims.map((claim: any) => claim?.status === 'verified' && claim.explanation === ''
      ? { ...claim, explanation: 'Belæg kontrolleres mod de angivne kilder.' } : claim),
  })) };
}

type Unit = z.infer<typeof assessmentSchema>['units'][number];
export type EditorialBaseline = { assessmentId: string; contextHash: string; fields: LivEditorialFields;
  units: Array<{ id: string; text: string }>; raw: unknown; sourceHashes: Record<string, string> };

function withoutDescriptions(html: string): string | null {
  const $ = load(html);
  const captions = $('figure figcaption');
  if (!captions.length || captions.toArray().some(node => $(node).children().length)) return null;
  captions.text('__caption__');
  $('figure img[alt]').attr('alt', '__alt__');
  return $.html();
}

/** Only caption/alt edits qualify. Prose, fields, sources, model, policy, day and
 * image identities must stay fixed. Global editorial judgment always runs anew. */
export function reusableCaptionUnits(previous: EditorialBaseline | undefined, fields: LivEditorialFields | undefined,
  contextHash: string, text: string, sourceHashes: Record<string, string>): Unit[] {
  if (!previous || !fields || previous.contextHash !== contextHash) return [];
  const old = previous.fields;
  if (JSON.stringify({ ...old, content: '' }) !== JSON.stringify({ ...fields, content: '' }) || old.content === fields.content) return [];
  const stripped = withoutDescriptions(old.content);
  if (!stripped || stripped !== withoutDescriptions(fields.content)) return [];
  const parsed = assessmentSchema.safeParse(previous.raw);
  if (!parsed.success) return [];
  const current = articleUnits(text), savedUnits = previous.units;
  return current.flatMap(unit => {
    const matches = savedUnits.filter(saved => saved.text === unit.text);
    if (matches.length !== 1 || current.filter(u => u.text === unit.text).length !== 1) return [];
    const rows = parsed.data.units.filter(row => row.id === matches[0].id);
    if (rows.length !== 1) return [];
    const row = rows[0];
    if (row.claims.some(claim => claim.status !== 'verified' || claim.citations.some(c =>
      !sourceHashes[c.sourceId] || sourceHashes[c.sourceId] !== previous.sourceHashes[c.sourceId]))) return [];
    return [{ ...row, id: unit.id }];
  });
}

/** Fail closed on provider overlap, missing units or corrupt lineage. */
export function mergeEditorialUnits(raw: unknown, reused: Unit[], text: string): unknown {
  if (!reused.length) return raw;
  const parsed = assessmentSchema.safeParse(raw);
  if (!parsed.success) return raw;
  const expected = articleUnits(text).map(u => u.id);
  const units = [...parsed.data.units, ...reused];
  if (units.length !== expected.length || new Set(units.map(u => u.id)).size !== expected.length ||
      units.some(u => !expected.includes(u.id))) throw new Error('liv_editorial_delta_invalid');
  return { ...raw as object, units: units.sort((a, b) => expected.indexOf(a.id) - expected.indexOf(b.id)) };
}
