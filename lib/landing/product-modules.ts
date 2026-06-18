import type { SplineBackgroundId } from '@/lib/spline-backgrounds';

export type ProductModule = {
  id: string;
  step: string;
  title: string;
  body: string;
  screenshot: string;
  splineId?: SplineBackgroundId;
};

/** Real product surfaces — screenshots from the live studio UI. */
export const PRODUCT_MODULES: ProductModule[] = [
  {
    id: 'writer',
    step: '01',
    title: 'Write & research in the studio',
    body: 'Article setup with templates, author voice, sections, and research — the same dark panel shell you already run every day. Draft with context, not from a blank page.',
    screenshot: '/images/landing/product-article-writer.png',
    splineId: 'retrofuturism',
  },
  {
    id: 'newsletter',
    step: '02',
    title: 'Newsletter from live Webflow articles',
    body: 'Pull the week’s stories from CMS, preview desktop and mobile, schedule auto-send on Friday — intro copy included. Your magazine, in the inbox.',
    screenshot: '/images/landing/product-newsletter.png',
    splineId: 'gradient',
  },
  {
    id: 'some',
    step: '03',
    title: 'SoMe posting from editorial',
    body: 'Pick an article, preview the card, write the caption, publish to Instagram — without leaving the deck. Culture journalism, formatted for the feed.',
    screenshot: '/images/landing/product-some.png',
    splineId: 'retrofuturism',
  },
  {
    id: 'podcast',
    step: '04',
    title: 'Podcast upload & publish',
    body: 'Drop .m4a or .mp3, link to the article URL, publish to your audio pipeline. Episodes stay tied to the stories they extend.',
    screenshot: '/images/landing/product-podcast.png',
    splineId: 'dotwaves',
  },
  {
    id: 'push',
    step: '05',
    title: 'Push to subscribers',
    body: 'Headline, body, image — deeplink to article or podcast player. Sent to article subscribers in one motion.',
    screenshot: '/images/landing/product-push.png',
    splineId: 'black-particles',
  },
];

export const PIPELINE_STEPS = [
  'Research',
  'Article',
  'Webflow',
  'Newsletter',
  'Social',
  'Podcast',
  'Push',
] as const;
