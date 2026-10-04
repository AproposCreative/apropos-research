import { z } from 'zod';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { assertArticleMarkupSafe, articleAssetSignature, articleImages } from '@/lib/mcp/markup';

export const copyeditFields = ['title', 'subtitle', 'intro', 'content', 'excerpt', 'seoTitle', 'seoDescription'] as const;
export const copyeditPatches = z.array(z.object({
  field: z.enum(copyeditFields), before: z.string().min(1).max(12000), after: z.string().max(12000),
}).strict()).min(1).max(20);
export type CopyeditPatch = z.infer<typeof copyeditPatches>[number];

/** Exact, unique replacements. Never serialize the article or infer a match.
 * The same deterministic implementation is used by the first-party API and MCP. */
export function previewCopyedit(article: Record<string, unknown>, patches: CopyeditPatch[]) {
  const parsed = copyeditPatches.parse(patches);
  const revised = { ...article };
  for (const patch of parsed) {
    const value = revised[patch.field];
    if (typeof value !== 'string' || patch.before === patch.after || value.split(patch.before).length !== 2) {
      throw Error('mcp_copyedit_ambiguous_patch');
    }
    revised[patch.field] = value.replace(patch.before, () => patch.after);
  }
  for (const field of ['content', 'intro', 'subtitle', 'excerpt']) {
    if (typeof revised[field] === 'string') assertArticleMarkupSafe(revised[field] as string);
  }
  if (cmsFieldHash({ assets: articleAssetSignature(String(article.content || '')) }) !==
      cmsFieldHash({ assets: articleAssetSignature(String(revised.content || '')) }) ||
      cmsFieldHash({ images: articleImages(String(article.content || '')) }) !==
      cmsFieldHash({ images: articleImages(String(revised.content || '')) })) {
    throw Error('mcp_copyedit_media_changed');
  }
  return { article: revised, changes: parsed, changedFields: [...new Set(parsed.map(p => p.field))],
    beforeHash: cmsFieldHash(article), afterHash: cmsFieldHash(revised),
    mediaPreserved: true, publicationApproval: false, requiresFreshChecks: true };
}
