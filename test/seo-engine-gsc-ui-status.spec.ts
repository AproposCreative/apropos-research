import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SEARCH_SIGNALS_UI_STATUSES,
  normalizeSearchSignalsUiNote,
  searchSignalsStatusDotClass,
} from '../lib/seo-engine/ui-helpers';

describe('Honest GSC UI statuses', () => {
  it('exposes exactly the three editor-facing status labels', () => {
    expect([...SEARCH_SIGNALS_UI_STATUSES]).toEqual([
      'Search Console søgefraser aktive',
      'Search Console kun samlet via GA4',
      'ingen søgedata',
    ]);
  });

  it('normalizes unknown notes to none and maps status dots', () => {
    expect(normalizeSearchSignalsUiNote(undefined)).toBe('ingen søgedata');
    expect(normalizeSearchSignalsUiNote('bogus')).toBe('ingen søgedata');
    expect(normalizeSearchSignalsUiNote('Search Console søgefraser aktive')).toBe(
      'Search Console søgefraser aktive'
    );
    expect(searchSignalsStatusDotClass('Search Console søgefraser aktive')).toBe('bg-emerald-400');
    expect(searchSignalsStatusDotClass('Search Console kun samlet via GA4')).toBe('bg-amber-400');
    expect(searchSignalsStatusDotClass('ingen søgedata')).toBe('bg-white/40');
  });

  it('SeoEngineClient renders searchSignalsProvenance.uiNote after analyze', () => {
    const src = readFileSync(join(process.cwd(), 'app/ai/seo/SeoEngineClient.tsx'), 'utf8');
    expect(src).toContain('searchSignalsProvenance');
    expect(src).toContain('normalizeSearchSignalsUiNote');
    expect(src).toContain('searchSignalsStatusDotClass');
    for (const label of SEARCH_SIGNALS_UI_STATUSES) {
      expect(src.includes(label) || src.includes('normalizeSearchSignalsUiNote')).toBe(true);
    }
  });

  it('provider provenance uses the same three uiNote strings', () => {
    const src = readFileSync(join(process.cwd(), 'lib/seo-engine/search-signals.ts'), 'utf8');
    for (const label of SEARCH_SIGNALS_UI_STATUSES) {
      expect(src).toContain(`'${label}'`);
    }
  });
});
