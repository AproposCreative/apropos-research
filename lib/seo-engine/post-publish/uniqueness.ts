import { getCmsSeoSlugs } from '@/lib/seo-engine/webflow-adapter';
import { listPublishedArticlePage } from './cms';
import { findMetadataDuplicates, type MetadataRow } from './duplicates';

/** Complete live traversal, never a partial or stale success after a failed page. */
export async function readLiveMetadataInventory(locale: MetadataRow['locale']) {
  const rows: MetadataRow[] = [];
  const startedAt = Date.now();
  const seen = new Set<string>();
  const slugs = getCmsSeoSlugs();
  let offset = 0;
  let expectedTotal: number | undefined;
  for (let pageNumber = 0; pageNumber < 100; pageNumber++) {
    const page = await listPublishedArticlePage(locale, offset, 100);
    if (!Number.isInteger(page.total) || page.total < 0 || (expectedTotal !== undefined && expectedTotal !== page.total)) {
      throw new Error('seo_uniqueness_inventory_changed');
    }
    expectedTotal = page.total;
    for (const item of page.items) {
      if (seen.has(item.id)) throw new Error('seo_uniqueness_inventory_changed');
      seen.add(item.id);
      if (item.isArchived || item.isDraft || !item.lastPublished) continue;
      rows.push({ itemId: item.id, locale, metadata: {
        seoTitle: String(item.fieldData[slugs.seoTitle] ?? ''),
        metaDescription: String(item.fieldData[slugs.metaDescription] ?? ''),
      } });
    }
    offset += page.items.length;
    if (offset > page.total) throw new Error('seo_uniqueness_inventory_changed');
    if (offset === page.total) return { locale, rows, startedAt, completedAt: Date.now() };
    if (!page.items.length) throw new Error('seo_uniqueness_incomplete_page');
  }
  throw new Error('seo_uniqueness_scan_limit');
}

/** Write safety boundary: ALWAYS fetch again, including after a review/previous write. */
export async function checkLiveMetadataDuplicates(target: MetadataRow) {
  return findMetadataDuplicates(target, (await readLiveMetadataInventory(target.locale)).rows);
}

export const REVIEW_INVENTORY_MAX_AGE_MS = 60_000;
/** Request-local review optimization only. Construct inside ONE bounded claim call.
 * No cross-request/process state, persistence, credentials or invalidation service.
 * A fresh call or an inventory older than one minute starts a new traversal.
 * Never use this advisory reader in the write path. */
export function createMetadataReviewInventory() {
  const reads = new Map<MetadataRow['locale'], { startedAt: number; result: ReturnType<typeof readLiveMetadataInventory> }>();
  return async (target: MetadataRow) => {
    let entry = reads.get(target.locale);
    if (!entry || Date.now() - entry.startedAt >= REVIEW_INVENTORY_MAX_AGE_MS) {
      entry = { startedAt: Date.now(), result: readLiveMetadataInventory(target.locale) };
      reads.set(target.locale, entry);
    }
    try {
      return findMetadataDuplicates(target, (await entry.result).rows);
    } catch (error) {
      if (reads.get(target.locale) === entry) reads.delete(target.locale);
      throw error; // no hidden retry and no stale fallback
    }
  };
}
