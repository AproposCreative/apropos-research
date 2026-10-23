import { describe, expect, it } from 'vitest';
import { buildSourceBasedNewsletterIntro } from '@/lib/newsletter/source-summary';
import type { NewsletterArticle } from '@/lib/newsletter/webflow-sources';

const article = (title: string, excerpt: string): NewsletterArticle => ({
  id: title,
  title,
  excerpt,
  slug: title,
  thumbUrl: null,
  selectionDate: '2026-10-23T00:00:00.000Z',
  lastPublished: '2026-10-23T00:00:00.000Z',
  url: 'https://www.aproposmagazine.com/',
});

describe('source-bound newsletter summary', () => {
  it('summarizes the selected articles without a generic welcome or invented facts', () => {
    const summary = buildSourceBasedNewsletterIntro([
      article('Jeg gik på barsel og endte i en religiøs uldsekt', 'Det er efterårsferie, og jeg er på barsel. Resten er ikke med i opsummeringen.'),
      article('Cæcilie Norby på Gamle Scene', 'Der er noget ved Gamle Scene, som får koncertgæster til at tie stille. Flere detaljer.'),
      article('Silo Season 3 (Apple TV+)', 'Vi vender tilbage til Silo.'),
    ]);

    expect(summary).toContain('Jeg gik på barsel og endte i en religiøs uldsekt');
    expect(summary).toContain('Det er efterårsferie, og jeg er på barsel.');
    expect(summary).toContain('Cæcilie Norby på Gamle Scene');
    expect(summary).toContain('Silo Season 3 (Apple TV+)');
    expect(summary).not.toContain('Vi har samlet udvalgte artikler');
    expect(summary).not.toContain('Resten er ikke med');
  });

  it('refuses to fabricate an intro when fewer than two complete source excerpts exist', () => {
    expect(buildSourceBasedNewsletterIntro([
      article('En historie', 'Kun et kort fragment'),
      article('En anden historie', 'Også uden en fuldstændig sætning'),
    ])).toBeNull();
  });

  it('does not describe a different article as the lead when the hero has no usable excerpt', () => {
    expect(buildSourceBasedNewsletterIntro([
      article('Hero uden uddrag', ''),
      article('Anden historie', 'Denne tekst har en reel, fuldstændig sætning fra artiklen.'),
      article('Tredje historie', 'Denne tekst har også en fuldstændig sætning fra artiklen.'),
    ])).toBeNull();
  });

  it('does not reorder the article digest around a missing second excerpt', () => {
    expect(buildSourceBasedNewsletterIntro([
      article('Hero', 'Dette er en komplet første sætning fra den nye artikel.'),
      article('Anden historie', ''),
      article('Tredje historie', 'Dette er en komplet sætning fra den tredje artikel.'),
    ])).toBeNull();
  });
});
