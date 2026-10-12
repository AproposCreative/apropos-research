import { z } from 'zod';

const copy = (max: number) => z.string().trim().min(1).max(max).refine(value => !/[<>\r\n]/.test(value), 'Plain text only');
/** Card-only copy supplied by ChatGPT, never a request for backend generation. */
export const socialSubtitlesSchema = z.object({ square: copy(90), story: copy(130) }).strict();
export type SocialSubtitles = z.infer<typeof socialSubtitlesSchema>;
export const SOCIAL_SUBTITLE_INSTRUCTION = 'Som del af nye artiklers metadata: skriv article.socialSubtitles.square (højst 90 tegn) og story (højst 130 tegn) i ChatGPT. Begge skal være naturlige, afsluttede danske sætninger, som bevarer undertitlens centrale pointe og vurdering uden nye fakta, clickbait, hashtags eller gentagelse af overskriften. Brug kun titel og undertitel som faktagrundlag. Gem dem i samme prepare_submission/update_submission, ikke via et ekstra AI-kald. Ved ændret titel/undertitel opdatér begge varianter. Det er tekst til SoMe-billedet, ikke ændring af artiklens undertitel eller tilladelse til at poste. SoMe-editoren bruger automatisk gemt tekst til den præcise publicerede CMS-version og måler den i det valgte format. Ældre artikler uden gemt SoMe-tekst får et lokalt, tydeligt markeret uddrag, ikke en AI-omskrivning.';

/** Never reuse a paraphrase after its source changes. Media/SEO-only edits preserve it. */
export function mergeSocialSubtitles<T extends { title: string; subtitle?: string; socialSubtitles?: SocialSubtitles }>(base: T, update: Partial<T>): T {
  const next = { ...base, ...update };
  if (!update.socialSubtitles && (next.title !== base.title || next.subtitle !== base.subtitle)) delete next.socialSubtitles;
  return next;
}
