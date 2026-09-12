import { createHash } from 'node:crypto';
import type { Metadata, PublishedArticle } from './policy';

export type CmsSnapshot = {
  id: string;
  cmsLocaleId: string;
  isDraft?: boolean;
  isArchived?: boolean;
  lastPublished?: string | null;
  fieldData: Record<string, unknown>;
};

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)])
  );
  return value;
}

export function snapshotHash(fields: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(canonical(fields))).digest('hex');
}

export function publishedSnapshot(args: {
  itemId: string;
  cmsLocaleId: string;
  locale: 'da' | 'en';
  live: CmsSnapshot;
  staged: CmsSnapshot;
  slugs: Record<keyof Metadata, string>;
}): PublishedArticle {
  const { live, staged, slugs } = args;
  for (const item of [live, staged]) {
    if (item.id !== args.itemId || item.cmsLocaleId !== args.cmsLocaleId) throw new Error('seo_cms_identity_mismatch');
    if (!item.fieldData || typeof item.fieldData !== 'object' || Array.isArray(item.fieldData)) throw new Error('seo_cms_fields_missing');
  }
  const editorial = Object.fromEntries(Object.entries(live.fieldData).filter(([key]) => !Object.values(slugs).includes(key)));
  return {
    itemId: args.itemId, locale: args.locale,
    published: Boolean(live.lastPublished) && !live.isDraft && !live.isArchived && !staged.isDraft && !staged.isArchived,
    hasUnpublishedChanges: snapshotHash(live.fieldData) !== snapshotHash(staged.fieldData),
    contentVersion: snapshotHash(editorial),
    metadata: {
      seoTitle: String(live.fieldData[slugs.seoTitle] ?? '').trim(),
      metaDescription: String(live.fieldData[slugs.metaDescription] ?? '').trim(),
    },
  };
}
