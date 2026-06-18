import { describe, expect, it } from 'vitest';
import {
  buildContentImageRole,
  buildSeoImageFileName,
  resolveArticleSeoImageBaseName,
} from '../lib/images/seo-image-name';

describe('seo-image-name', () => {
  it('prefers article slug for filename base', () => {
    expect(
      resolveArticleSeoImageBaseName({
        slug: '28-years-later-biograf',
        seoTitle: '28 Years Later anmeldelse | Apropos',
        title: '28 Years Later',
      })
    ).toBe('28-years-later-biograf');
  });

  it('builds descriptive webp filename', () => {
    const name = buildSeoImageFileName({
      baseName: 'cape-fear-anmeldelse',
      role: 'thumb',
      maxLongEdge: 2400,
      imageUrl: 'https://cdn.example.com/a.png',
    });
    expect(name).toMatch(/^cape-fear-anmeldelse-thumb-2400w-[a-z0-9]+\.webp$/);
  });

  it('numbers inline content images', () => {
    expect(buildContentImageRole(0)).toBe('inline-01');
    expect(buildContentImageRole(2)).toBe('inline-03');
  });
});
