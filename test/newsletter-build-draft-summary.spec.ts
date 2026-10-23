import { describe, expect, it, vi } from 'vitest';
import type { NewsletterArticle } from '@/lib/newsletter/webflow-sources';

const generateNewsletterIntro = vi.hoisted(() => vi.fn());
vi.mock('@/lib/newsletter/intro-ai', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/newsletter/intro-ai')>(),
  generateNewsletterIntro,
}));

import { composeWeeklyNewsletterDraft } from '@/lib/newsletter/build-draft';

const week = {
  start: new Date('2026-10-12T00:00:00.000Z'),
  end: new Date('2026-10-19T00:00:00.000Z'),
  isoWeek: 42,
  labelDa: '12.–18. oktober',
};

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

describe('scheduled newsletter intro composition', () => {
  it('uses real article excerpts without calling paid AI', async () => {
    const draft = await composeWeeklyNewsletterDraft({
      week,
      articles: [
        article('Barsel', 'Det er efterårsferie, og jeg er på barsel.'),
        article('Jazz', 'Koncerten på Gamle Scene samlede publikum til en stille aften.'),
      ],
      skipAiIntro: true,
    });

    expect(generateNewsletterIntro).not.toHaveBeenCalled();
    expect(draft.introSource).toBe('article_excerpts');
    expect(draft.html).toContain('Det er efterårsferie');
    expect(draft.intro).not.toContain('Vi har samlet udvalgte artikler');
  });

  it('marks insufficient source material as unsendable', async () => {
    const draft = await composeWeeklyNewsletterDraft({
      week,
      articles: [article('Barsel', ''), article('Jazz', '')],
      skipAiIntro: true,
    });

    expect(generateNewsletterIntro).not.toHaveBeenCalled();
    expect(draft.introSource).toBe('none');
    expect(draft.intro).toBe('');
    expect(draft.warnings).toContain('Ingen kildebaseret opsummering kunne dannes; mailen må ikke sendes automatisk.');
  });
});
