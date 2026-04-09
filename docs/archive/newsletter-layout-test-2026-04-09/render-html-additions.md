# Tilføjelser til `lib/newsletter/render-html.ts`

## 1. Import (efter `newsletter-utm`)

```ts
import {
  LAYOUT_LAB_DEFAULTS,
  type LayoutLabDesignTokens,
} from '@/lib/newsletter/layout-lab-styles';
```

## 2. Efter `function esc` — konstanter + hjælpefunktioner

```ts
const NL_LAB_STARS_MAX = 6;
const NL_LAYOUT_LAB_MAX_ARTICLES = 3;

function newsletterStarRowHtml(filled: number, glyphPx: number): string {
  const f = Math.min(NL_LAB_STARS_MAX, Math.max(0, Math.round(filled)));
  const onC = EMAIL_COLORS.textPrimary;
  const offC = EMAIL_COLORS.borderMedium;
  let inner = '';
  for (let i = 0; i < NL_LAB_STARS_MAX; i++) {
    const on = i < f;
    inner += `<span style="color:${on ? onC : offC};font-size:${glyphPx}px;">${on ? '★' : '☆'}</span>`;
  }
  return `<span style="white-space:nowrap;letter-spacing:2px;line-height:1;" role="img" aria-label="${f} ud af ${NL_LAB_STARS_MAX} stjerner">${inner}</span>`;
}

function buildNewsletterLayoutLabArticleRowInner(
  article: NewsletterArticle,
  track: (href: string) => string,
  lab: LayoutLabDesignTokens
): string {
  const url = track(article.url);
  const title = esc(article.title);
  const tp = lab.thumbPx;
  const br = lab.thumbBorderRadiusPx;
  const g = lab.stackGapPx;
  const thumbBlock =
    article.thumbUrl != null
      ? `<a href="${url}" target="_blank" style="outline:none;display:inline-block;line-height:0;"><img src="${esc(article.thumbUrl)}" alt="" width="${tp}" height="${tp}" class="nl-exp-thumb-img" style="display:block;width:${tp}px;max-width:100%;height:${tp}px;border-radius:${br}px;object-fit:cover;border:0;" /></a>`
      : `<div class="nl-exp-thumb-fallback" style="width:${tp}px;height:${tp}px;border-radius:${br}px;background:${EMAIL_COLORS.thumbPlaceholder};"></div>`;
  const sub =
    article.subtitle && article.subtitle.trim()
      ? `<p style="margin:0 0 ${g}px;font-family:${FONT_SANS};font-size:${lab.subtitleFontPx}px;line-height:1.45;color:${EMAIL_COLORS.textPrimary};">${esc(article.subtitle.trim())}</p>`
      : '';
  const stars =
    article.ratingStars != null && article.ratingStars >= 1
      ? `<p style="margin:0 0 ${g}px;font-family:${FONT_SANS};font-size:12px;line-height:1;color:${EMAIL_COLORS.textMuted};">${newsletterStarRowHtml(article.ratingStars, lab.starGlyphPx)}</p>`
      : '';

  return `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="mso-table-lspace:0;mso-table-rspace:0;">
                <tr>
                  <td class="nl-exp-thumb-cell" width="172" valign="top" style="width:172px;padding:8px 0 8px 0;vertical-align:top;line-height:0;font-size:0;">
                    ${thumbBlock}
                  </td>
                  <td class="nl-exp-body-cell" valign="top" style="padding:8px 0 8px 12px;vertical-align:top;font-size:16px;line-height:normal;">
                    <table class="nl-exp-stack" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" height="${tp}" style="height:${tp}px;mso-table-lspace:0;mso-table-rspace:0;border-collapse:collapse;">
                      <tr>
                        <td valign="top" style="padding:0;vertical-align:top;height:0;line-height:normal;">
                          <h2 style="margin:0 0 ${g}px;font-family:${FONT_SANS};font-size:${lab.titleFontPx}px;line-height:1.3;font-weight:700;">
                            <a href="${url}" target="_blank" style="color:${EMAIL_COLORS.textPrimary};text-decoration:none;">${title}</a>
                          </h2>
                          ${sub}
                          ${stars}
                        </td>
                      </tr>
                      <tr>
                        <td class="nl-exp-spacer-cell" height="100%" style="height:100%;padding:0;font-size:0;line-height:0;mso-line-height-rule:exactly;">&#8203;</td>
                      </tr>
                      <tr>
                        <td class="nl-exp-cta-cell" valign="bottom" style="padding:0;vertical-align:bottom;line-height:1;">
                          <a href="${url}" target="_blank" style="display:inline-block;font-family:${FONT_SANS};background-color:${EMAIL_COLORS.btnPrimaryBg};color:${EMAIL_COLORS.btnPrimaryText};text-decoration:none;font-weight:600;padding:${lab.ctaPadVertPx}px ${lab.ctaPadHorzPx}px;border-radius:999px;font-size:${lab.ctaFontPx}px;mso-padding-alt:${lab.ctaPadVertPx}px ${lab.ctaPadHorzPx}px;">Læs nu</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>`;
}

function buildNewsletterLayoutLabSection(
  articles: NewsletterArticle[],
  track: (href: string) => string,
  lab: LayoutLabDesignTokens
): string {
  const slice = articles.slice(0, NL_LAYOUT_LAB_MAX_ARTICLES);
  if (slice.length === 0) return '';

  const articleBlocks = slice
    .map((article, index) => {
      const isLast = index === slice.length - 1;
      const borderBottom = isLast ? 'none' : `1px solid ${EMAIL_COLORS.borderLight}`;
      const padBottom = isLast ? '32px' : '22px';
      return `
          <tr class="nl-exp-art-row">
            <td class="nl-pad nl-exp-art-outer" style="padding:${index === 0 ? '8px' : '22px'} 30px ${padBottom};border-bottom:${borderBottom};">
              ${buildNewsletterLayoutLabArticleRowInner(article, track, lab)}
            </td>
          </tr>`;
    })
    .join('');

  return `
          <tr>
            <td class="nl-pad" style="padding:28px 30px 6px;">
              <p class="nl-section-label" style="margin:0;font-family:${FONT_SANS};font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:${EMAIL_COLORS.textMuted};">Layout-test</p>
              <p style="margin:6px 0 0;font-family:${FONT_SANS};font-size:12px;line-height:1.45;color:${EMAIL_COLORS.textMuted};">Eksperimentel blok med magasin-layout (op til tre artikler, stjerner, pille-CTA, streger imellem). Listen ovenfor er uændret.</p>
            </td>
          </tr>
          ${articleBlocks}`;
}
```

## 3. I `renderNewsletterEmailHtml`, efter `socialImgSrc` / før `return` skabelon

```ts
  const layoutLabSection =
    articles.length > 0 ? buildNewsletterLayoutLabSection(articles, track, LAYOUT_LAB_DEFAULTS) : '';
```

## 4. I `<style>` med `@media (max-width: 620px)` — tilføj før luk `}`

```css
      .nl-exp-thumb-cell { display: block !important; width: 100% !important; max-width: 100% !important; padding: 18px 18px 0 !important; text-align: center !important; }
      .nl-exp-body-cell { display: block !important; width: 100% !important; padding: 16px 18px 20px !important; box-sizing: border-box !important; }
      .nl-exp-stack { height: auto !important; }
      .nl-exp-stack tr:first-child td { height: auto !important; }
      .nl-exp-spacer-cell { display: none !important; height: 0 !important; line-height: 0 !important; font-size: 0 !important; }
      .nl-exp-cta-cell { padding-top: 14px !important; height: auto !important; vertical-align: top !important; }
      .nl-exp-thumb-img { margin: 0 auto !important; width: 120px !important; height: 120px !important; max-width: 120px !important; border-radius: 4px !important; }
      .nl-exp-thumb-fallback { width: 120px !important; height: 120px !important; margin: 0 auto !important; border-radius: 4px !important; }
```

## 5. I HTML-skabelonen: efter lukket `nl-articles-inner` tabel-række, før primær CTA

```html
          ${layoutLabSection}
```

(Indsæt mellem `</table></td></tr>` for artikellisten og næste `<tr>` med CTA.)
