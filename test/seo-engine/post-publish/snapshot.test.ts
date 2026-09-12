import { describe, expect, it } from 'vitest';
import { publishedSnapshot, snapshotHash, type CmsSnapshot } from '../../../lib/seo-engine/post-publish/snapshot';

const item: CmsSnapshot = { id: 'item', cmsLocaleId: 'da-id', lastPublished: '2026-09-12', fieldData: {
  name: 'Mayday', content: '<p>Body</p>', slug: 'mayday', 'seo-title': 'Mayday', 'meta-description': 'Review',
  thumb: { url: 'https://example.com/image.webp', alt: 'Still' }, stjerne: 3,
} };
const args = { itemId: 'item', cmsLocaleId: 'da-id', locale: 'da' as const, live: item, staged: item,
  slugs: { seoTitle: 'seo-title', metaDescription: 'meta-description' } };

describe('live/staged metadata snapshots', () => {
  it('hashes object keys deterministically, preserving array order', () => {
    expect(snapshotHash({ b: { z: 1, a: 2 }, a: 0 })).toBe(snapshotHash({ a: 0, b: { a: 2, z: 1 } }));
    expect(snapshotHash({ a: [1, 2] })).not.toBe(snapshotHash({ a: [2, 1] }));
  });
  it('detects pending editorial and SEO changes', () => {
    for (const field of ['content', 'name', 'slug', 'stjerne', 'seo-title']) {
      expect(publishedSnapshot({ ...args, staged: { ...item, fieldData: { ...item.fieldData, [field]: 'changed' } } }).hasUnpublishedChanges).toBe(true);
    }
  });
  it('keeps editorial fingerprint stable across metadata-only edits', () => {
    const updated = { ...item, fieldData: { ...item.fieldData, 'seo-title': 'Mayday: Anmeldelse' } };
    expect(publishedSnapshot({ ...args, live: updated, staged: updated }).contentVersion).toBe(publishedSnapshot(args).contentVersion);
  });
  it('refuses mismatched locale or item returned by API', () => {
    expect(() => publishedSnapshot({ ...args, live: { ...item, cmsLocaleId: 'en-id' } })).toThrow('identity_mismatch');
    expect(() => publishedSnapshot({ ...args, staged: { ...item, id: 'other' } })).toThrow('identity_mismatch');
  });
  it('never considers an archived or draft item publishable', () => {
    expect(publishedSnapshot({ ...args, staged: { ...item, isDraft: true } }).published).toBe(false);
    expect(publishedSnapshot({ ...args, live: { ...item, isArchived: true } }).published).toBe(false);
  });
});
