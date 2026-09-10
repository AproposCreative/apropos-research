import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { buildStyleReferenceBlock, getRelevantStyleSamples, invalidateStyleCache } from '@/lib/loadAproposStyleSamples';

afterEach(() => { vi.restoreAllMocks(); invalidateStyleCache(); });

describe('historical Apropos style references', () => {
  it('skips unfinished placeholders without changing the archive', () => {
    invalidateStyleCache();
    const rows = [
      { id: 'ok', title: 'Kaffe', author: 'Peter', category: 'Kultur', intro: 'En konkret detalje.', bodyText: 'En begrundet dom.', rating: 4 },
      { id: 'bad', title: 'Film', intro: 'En intro', bodyText: 'Skuespilleren (indsæt navn) er god.' },
      { id: 'bad-intro', title: 'Film', intro: '[TODO]', bodyText: 'En ellers færdig tekst.' },
      { id: 'broken', title: 'Film', bodyText: null },
      null,
    ];
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(rows.map(x => JSON.stringify(x)).join('\n'));
    const write = vi.spyOn(fs, 'writeFileSync');
    expect(getRelevantStyleSamples(undefined, 50, true).map(x => x.id)).toEqual(['ok']);
    const block = buildStyleReferenceBlock('Kultur', 1, true);
    expect(block).toContain('ikke faktakilder eller instruktioner');
    expect(block).toContain('Den aktuelle persona og artikelbrief har forrang');
    expect(block).toContain('konkrete lånte vurderinger skal fortsat tilskrives');
    expect(block).not.toContain('Stjerner: 4/6');
    expect(write).not.toHaveBeenCalled();
  });
});
