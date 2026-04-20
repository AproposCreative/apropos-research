import { describe, expect, it } from 'vitest';
import {
  generateSeoMetaSmart,
  truncateAtWord,
} from '../lib/seo/generate-seo-meta';
import {
  SEO_DESCRIPTION_MAX,
  SEO_TITLE_MAX,
} from '../lib/seo/constants';

describe('truncateAtWord', () => {
  it('returns the input unchanged when within the limit', () => {
    expect(truncateAtWord('Kort tekst', 60)).toBe('Kort tekst');
  });

  it('never produces a mid-word cut', () => {
    const long = 'Den lange overskrift som beskriver hele indholdet i artiklen meget detaljeret';
    const out = truncateAtWord(long, 40);
    expect(out.length).toBeLessThanOrEqual(40);
    // Trailing token must be a full word from the source.
    const lastWord = out.split(/\s+/).pop()!;
    expect(long.includes(lastWord)).toBe(true);
  });

  it('does not append "..."', () => {
    const out = truncateAtWord('En sætning der bør klippes pænt af før grænsen', 25);
    expect(out.endsWith('...')).toBe(false);
    expect(out.endsWith('…')).toBe(false);
  });

  it('drops trailing punctuation that would look orphaned', () => {
    const out = truncateAtWord('En sætning, med komma; og semikolon her', 18);
    expect(out.endsWith(',')).toBe(false);
    expect(out.endsWith(';')).toBe(false);
  });
});

describe('generateSeoMetaSmart', () => {
  it('returns title within SEO_TITLE_MAX', () => {
    const out = generateSeoMetaSmart({
      title: 'En meget lang titel om kulturarven i København som overstiger den anbefalede længde',
      subtitle: 'med en pointerende undertitel',
    });
    expect(out.seoTitle).toBeTruthy();
    expect(out.seoTitle!.length).toBeLessThanOrEqual(SEO_TITLE_MAX);
  });

  it('combines title and subtitle when both fit', () => {
    const out = generateSeoMetaSmart({ title: 'Kort titel', subtitle: 'fin undertitel' });
    expect(out.seoTitle).toContain('Kort titel');
    expect(out.seoTitle).toContain('fin undertitel');
  });

  it('returns description within SEO_DESCRIPTION_MAX without ellipsis', () => {
    const intro =
      'Dette er en længere intro til artiklen som strækker sig over flere sætninger. Den anden sætning gør beskrivelsen mere fyldig. Den tredje sætning runder hele konteksten af på en god måde.';
    const out = generateSeoMetaSmart({ title: 'Titel', intro });
    expect(out.seoDescription).toBeTruthy();
    expect(out.seoDescription!.length).toBeLessThanOrEqual(SEO_DESCRIPTION_MAX);
    expect(out.seoDescription!.endsWith('...')).toBe(false);
    expect(out.seoDescription!.endsWith('…')).toBe(false);
  });

  it('falls back to content when no intro/subtitle provided', () => {
    const out = generateSeoMetaSmart({
      title: 'Titel',
      content:
        'Brødteksten starter her med en pæn første sætning. Anden sætning holder også vand. Tredje sætning runder af.',
    });
    expect(out.seoDescription).toBeTruthy();
    expect(out.seoDescription!.length).toBeGreaterThan(20);
  });

  it('handles empty input gracefully', () => {
    const out = generateSeoMetaSmart({});
    expect(out.seoTitle).toBeUndefined();
    expect(out.seoDescription).toBeUndefined();
    expect(out.source).toBe('smart');
  });

  it('strips HTML and markdown when generating SEO copy', () => {
    const out = generateSeoMetaSmart({
      title: '<h1>Titel **fed** med markup</h1>',
      intro: '*Intro* med `kode` og <em>tegn</em>.',
    });
    expect(out.seoTitle).not.toMatch(/[<>*`#]/);
    expect(out.seoDescription).not.toMatch(/[<>*`#]/);
  });
});
