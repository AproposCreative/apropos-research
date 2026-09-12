import { getCmsSeoSlugs } from '@/lib/seo-engine/webflow-adapter';
import { listPublishedArticlePage } from './cms';
import { findMetadataDuplicates, type MetadataRow } from './duplicates';

/** Full live locale traversal. Missing pages fail the check rather than imply uniqueness. */
export async function checkLiveMetadataDuplicates(target: MetadataRow) {
  const rows: MetadataRow[] = [];
  const slugs = getCmsSeoSlugs();
  let offset = 0;
  for (let pageNumber = 0; pageNumber < 100; pageNumber++) {
    const page = await listPublishedArticlePage(target.locale, offset, 100);
    for (const item of page.items) {
      if (item.isArchived || item.isDraft || !item.lastPublished) continue;
      rows.push({ itemId: item.id, locale: target.locale, metadata: {
        seoTitle: String(item.fieldData[slugs.seoTitle] ?? ''),
        metaDescription: String(item.fieldData[slugs.metaDescription] ?? ''),
      } });
    }
    offset += page.items.length;
    if (offset >= page.total) return findMetadataDuplicates(target, rows);
    if (!page.items.length) throw new Error('seo_uniqueness_incomplete_page');
  }
  throw new Error('seo_uniqueness_scan_limit');
}
