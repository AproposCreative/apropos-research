/**
 * Maps SEO Engine domain fields → Webflow mapping internals → CMS slugs.
 * Domain uses metaDescription only; mapping.json uses seoDescription.
 */

import mapping from '@/data/webflow-mapping.json';
import type { CmsPublishability } from '@/lib/seo-engine/schema';

type MappingEntry = { internal: string; webflowSlug: string };

const entries = (mapping as { entries: MappingEntry[] }).entries;

function slugForInternal(internal: string): string | undefined {
  return entries.find((e) => e.internal === internal)?.webflowSlug;
}

/** Domain field → mapping-internal key used in webflow-mapping.json */
export function domainToMappingInternal(
  field: 'seoTitle' | 'metaDescription'
): 'seoTitle' | 'seoDescription' {
  return field === 'metaDescription' ? 'seoDescription' : 'seoTitle';
}

export function getCmsSeoSlugs(): { seoTitle: string; metaDescription: string } {
  const seoTitle = slugForInternal('seoTitle');
  const metaDescription = slugForInternal('seoDescription');
  if (!seoTitle || !metaDescription) {
    throw new Error(
      'webflow-mapping.json mangler seoTitle→seo-title eller seoDescription→meta-description'
    );
  }
  return { seoTitle, metaDescription };
}

/**
 * Build CMS fieldData patch from domain SEO fields.
 * Only includes known mapping slugs — never invents og-* keys.
 */
export function toWebflowSeoPatch(fields: {
  seoTitle?: string;
  metaDescription?: string;
}): Record<string, string> {
  const slugs = getCmsSeoSlugs();
  const out: Record<string, string> = {};
  if (typeof fields.seoTitle === 'string' && fields.seoTitle.trim()) {
    out[slugs.seoTitle] = fields.seoTitle.trim();
  }
  if (typeof fields.metaDescription === 'string' && fields.metaDescription.trim()) {
    out[slugs.metaDescription] = fields.metaDescription.trim();
  }
  return out;
}

export function getCmsPublishability(): CmsPublishability {
  return {
    seoTitle: 'cms_writable',
    metaDescription: 'cms_writable',
    ogTitle: 'generated_not_published',
    ogDescription: 'generated_not_published',
    jsonLd: 'generated_not_published',
  };
}

export function isCmsSeoFieldEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  return false;
}
