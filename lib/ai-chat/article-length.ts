import { getEditorialArticleTypeOption } from '@/lib/editorial/signal-store';

/** Template is authoritative; stale category/label/target fields cannot override it. */
export function writerLengthPolicy(context: Record<string, unknown>) {
  const option = getEditorialArticleTypeOption(typeof context.articleType === 'string' ? context.articleType : undefined);
  const [min, max] = option.targetLengthLabel.match(/\d+/g)!.map(Number);
  return { min, max, target: option.targetWordCount, label: option.targetLengthLabel, articleType: option.id };
}

export function writerLengthCheck(content: string, context: Record<string, unknown>) {
  const policy = writerLengthPolicy(context);
  const actual = content.replace(/<[^>]*>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  return { ...policy, actual, pass: actual >= policy.min && actual <= policy.max };
}

export function writerResearchLengthInstruction(context: Record<string, unknown>): string {
  return `Brødtekst: ${writerLengthPolicy(context).label}, eksklusive titel, undertitel og intro. Følg den valgte artikeltype. Opfind ikke stof for at nå længden.`;
}
