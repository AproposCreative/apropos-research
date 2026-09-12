import { getEditorialArticleTypeOption } from '@/lib/editorial/signal-store';
import { countLivBodyWords } from '@/lib/liv/article-length';

/** Template is authoritative; stale category/label/target fields cannot override it. */
export function writerLengthPolicy(context: Record<string, unknown>) {
  const option = getEditorialArticleTypeOption(typeof context.articleType === 'string' ? context.articleType : undefined);
  const [min, max] = option.targetLengthLabel.match(/\d+/g)!.map(Number);
  return { min, max, target: option.targetWordCount, label: option.targetLengthLabel, articleType: option.id };
}

export function writerLengthCheck(content: string, context: Record<string, unknown>) {
  const policy = writerLengthPolicy(context);
  const actual = countLivBodyWords(content);
  return { ...policy, actual, pass: actual >= policy.min && actual <= policy.max };
}

export function writerResearchLengthInstruction(context: Record<string, unknown>): string {
  return `Brødtekst: ${writerLengthPolicy(context).label}, eksklusive titel, undertitel, intro, mellemrubrikker, billedtekster, billedcredits, indlejrede medier og metadata. Følg den valgte artikeltype. Opfind ikke stof for at nå længden.`;
}
