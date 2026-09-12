import type { Metadata } from './policy';

export type MetadataRow = { itemId: string; locale: 'da' | 'en'; metadata: Metadata };
export type MetadataDuplicates = Record<keyof Metadata, string[]>;
export function normalizedMetadata(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('da');
}

/** Compare with actual other articles in the same language, excluding blank values. */
export function findMetadataDuplicates(target: MetadataRow, rows: MetadataRow[]): MetadataDuplicates {
  const result: MetadataDuplicates = { seoTitle: [], metaDescription: [] };
  for (const field of ['seoTitle', 'metaDescription'] as const) {
    const value = normalizedMetadata(target.metadata[field]);
    if (!value) continue;
    result[field] = [...new Set(rows.filter(row => row.locale === target.locale && row.itemId !== target.itemId &&
      normalizedMetadata(row.metadata[field]) === value).map(row => row.itemId))];
  }
  return result;
}
