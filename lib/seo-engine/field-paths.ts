import { z } from 'zod';
import {
  AllowlistedFieldPathSchema,
  InternalLinkSuggestionSchema,
  JsonLdGraphSchema,
  type AllowlistedFieldPath,
} from '@/lib/seo-engine/schema';

const ExternalLinkSchema = z.object({ url: z.string(), label: z.string() });

/** Per-path value schemas for save-fields / regenerate validation. */
export const FIELD_VALUE_SCHEMAS: Record<AllowlistedFieldPath, z.ZodTypeAny> = {
  seoTitle: z.string(),
  metaDescription: z.string(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Ugyldigt slug-format'),
  canonical: z.string(),
  ogTitle: z.string(),
  ogDescription: z.string(),
  primaryPhrase: z.string(),
  supportingTopics: z.array(z.string()),
  tags: z.array(z.string()),
  section: z.string(),
  imageAlt: z.string(),
  imageCaption: z.string().nullable(),
  internalLinks: z.array(InternalLinkSuggestionSchema),
  externalLinks: z.array(ExternalLinkSchema),
  jsonLd: JsonLdGraphSchema,
};

export function parseFieldValue(
  fieldPath: string,
  value: unknown
): { ok: true; fieldPath: AllowlistedFieldPath; value: unknown } | { ok: false; error: string } {
  const pathParse = AllowlistedFieldPathSchema.safeParse(fieldPath);
  if (!pathParse.success) {
    return { ok: false, error: `fieldPath ikke allowlistet: ${fieldPath}` };
  }
  const schema = FIELD_VALUE_SCHEMAS[pathParse.data];
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Ugyldig value for ${pathParse.data}: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
    };
  }
  return { ok: true, fieldPath: pathParse.data, value: parsed.data };
}
