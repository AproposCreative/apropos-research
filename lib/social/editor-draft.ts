import { z } from 'zod';

export const socialDraftSchema = z.object({
  title: z.string().max(4000), subtitle: z.string().max(12000).nullable(),
  subtitleStatus: z.enum(['manual', 'original', 'ai', 'chatgpt', 'excerpt']).default('manual'),
  caption: z.string().max(12000), theme: z.enum(['light', 'dark']), size: z.enum(['square', 'story']),
  titleSizePercent: z.number().int().min(70).max(150), subtitleSizePercent: z.number().int().min(70).max(150),
  eyebrowValues: z.array(z.string().max(200)).max(8), storyMetaShuffleSeed: z.number().int().min(0).max(100000),
  facebook: z.boolean(),
}).strict();
export type SocialEditorDraft = z.infer<typeof socialDraftSchema>;
export type SocialDraftRecord = { revision: number; draft: SocialEditorDraft | null; updatedAt: string | null };
export const draftIdentitySchema = z.object({
  articleId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/), sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export const draftSaveSchema = draftIdentitySchema.extend({
  expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1), draft: socialDraftSchema,
}).strict();
export function sameSocialDraft(a: SocialEditorDraft | null, b: SocialEditorDraft | null) {
  return a === null || b === null ? a === b : JSON.stringify(socialDraftSchema.parse(a)) === JSON.stringify(socialDraftSchema.parse(b));
}
