import { expect, it } from 'vitest';
import { mediaSelection, selectedSourceId, resolveSourceFilter, sourceArticleCount } from '@/lib/media-selection';
it('preserves explicit disabled choices rather than auto-enabling new IDs', () => {
  expect(mediaSelection([{id:'uid_soundvenue',name:'Soundvenue',baseUrl:'https://soundvenue.com',enabled:false}])[0].enabled).toBe(false);
});
const sources = [{id:'UID_soundvenue',name:'Soundvenue',baseUrl:'https://soundvenue.com',enabled:true}];
it('resolves old bookmarked slugs and canonical IDs to the same saved source', () => {
  expect(resolveSourceFilter(sources,'soundvenue')).toBe('UID_soundvenue');
  expect(resolveSourceFilter(sources,'uid_soundvenue')).toBe('UID_soundvenue');
  expect(resolveSourceFilter(sources,'gaffa')).toBeUndefined();
});
it('maps legacy counters while preserving an explicit canonical zero', () => {
  expect(sourceArticleCount(sources[0],{soundvenue:12})).toBe(12);
  expect(sourceArticleCount(sources[0],{soundvenue:12,UID_soundvenue:0})).toBe(0);
});
it('maps article URLs to account-specific source IDs', () => {
  expect(selectedSourceId(sources, 'Soundvenue', 'https://www.soundvenue.com/film')).toBe('UID_soundvenue');
});
it('does not accept a spoofed hostname or source label over an unrelated URL', () => {
  expect(selectedSourceId(sources, 'Soundvenue', 'https://soundvenue.com.example.org/film')).toBeUndefined();
});
it('uses exact labels only when the article has no URL', () => {
  expect(selectedSourceId(sources, 'Soundvenue')).toBe('UID_soundvenue');
  expect(selectedSourceId(sources, 'Not Soundvenue')).toBeUndefined();
});
it('leaves an empty saved list empty', () => { expect(mediaSelection([])).toEqual([]); });
it('does not treat missing enabled state as an enabled source', () => {
  expect(() => mediaSelection([{id:'source',name:'Source',baseUrl:'https://example.com'}])).toThrow();
});
it('rejects malformed API payloads rather than falling back to shared browser cache', () => {
  expect(() => mediaSelection(null)).toThrow();
  expect(() => mediaSelection({sources:[]})).toThrow();
});
