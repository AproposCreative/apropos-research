import { describe, expect, it } from 'vitest';
import { findMetadataDuplicates, type MetadataRow } from '../../../lib/seo-engine/post-publish/duplicates';
const target: MetadataRow = { itemId: 'one', locale: 'da', metadata: { seoTitle: 'Mayday: Anmeldelse', metaDescription: 'En vurdering af filmen.' } };
describe('metadata duplicates', () => {
  it('matches other articles despite casing and whitespace differences', () => {
    expect(findMetadataDuplicates(target, [{ ...target, itemId: 'two', metadata: {
      seoTitle: '  MAYDAY:  Anmeldelse ', metaDescription: 'En vurdering af filmen.',
    } }])).toEqual({ seoTitle: ['two'], metaDescription: ['two'] });
  });
  it('excludes the article itself and other language versions', () => {
    expect(findMetadataDuplicates(target, [target, { ...target, itemId: 'two', locale: 'en' }])).toEqual({ seoTitle: [], metaDescription: [] });
  });
  it('does not classify all empty metadata as duplicates', () => {
    const empty = { ...target, metadata: { seoTitle: '', metaDescription: '' } };
    expect(findMetadataDuplicates(empty, [{ ...empty, itemId: 'two' }])).toEqual({ seoTitle: [], metaDescription: [] });
  });
  it('does not remove meaningful punctuation or confuse related works', () => {
    expect(findMetadataDuplicates(target, [{ ...target, itemId: 'two', metadata: {
      seoTitle: 'Mayday 2: Anmeldelse', metaDescription: 'En vurdering af en anden film.',
    } }])).toEqual({ seoTitle: [], metaDescription: [] });
  });
});
