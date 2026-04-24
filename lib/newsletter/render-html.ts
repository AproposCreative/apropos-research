import { NEWSLETTER_EXCERPT_MAX_DEFAULT, type NewsletterArticle } from '@/lib/newsletter/webflow-sources';
import { NEWSLETTER_UNSUBSCRIBE_PLACEHOLDER } from '@/lib/newsletter/inject-unsubscribe';
import {
  EMAIL_COLORS,
  EMAIL_PRIMARY_CTA_BORDER_RADIUS,
  FONT_SANS,
  INTRO_PARAGRAPH_STYLE,
  getNewsletterLogoUrl,
} from '@/lib/newsletter/email-theme';
import { getNewsletterSharedDesignCss } from '@/lib/newsletter/load-shared-design-css';
import {
  getNewsletterSocialIconDataUri,
  type NewsletterSocialIconName,
} from '@/lib/newsletter/social-icons-data-uri';
import { appendNewsletterUtmToUrl } from '@/lib/newsletter/newsletter-utm';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderNewsletterEmailHtml(params: {
  headline: string;
  introHtml: string;
  articles: NewsletterArticle[];
  siteUrl: string;
  /** Bruges kun til logo-src (fx `req.nextUrl.origin` i draft-preview). Links bruger stadig `siteUrl`. */
  logoAssetBaseUrl?: string;
  preheader?: string;
  /** Sættes fx til `newsletterUtmCampaignFromWeek(week)` for GA4-kampagnesporing. */
  utmCampaign?: string;
  /** `custom_single`: én artikel i custom-brev — ingen artikel-liste; «Af …» efter intro; stor CTA linker til artiklen. */
  articleBlockVariant?: 'default' | 'custom_single';
}): string {
  const {
    headline,
    introHtml,
    articles,
    siteUrl,
    logoAssetBaseUrl,
    preheader,
    utmCampaign,
    articleBlockVariant = 'default',
  } = params;
  const site = siteUrl.replace(/\/$/, '');
  /**
   * Tilføj UTM på link til magasinets domæne. `content` bliver til
   * `utm_content` (typisk artikel-slug) så GA4 kan vise klik per artikel.
   */
  const track = (href: string, content?: string) =>
    esc(utmCampaign ? appendNewsletterUtmToUrl(href, site, utmCampaign, content) : href);
  const pre = preheader || 'Seneste fra Apropos Magazine';
  const logoUrl = getNewsletterLogoUrl(site, logoAssetBaseUrl ? { assetBaseUrl: logoAssetBaseUrl } : undefined);

  const isCustomSingle = articleBlockVariant === 'custom_single' && articles.length === 1;
  const leadArticle = articles[0];
  const heroRow = leadArticle?.thumbUrl
      ? `<tr>
            <td align="center" style="padding:0;line-height:0;font-size:0;">
              <a href="${track(leadArticle.url, leadArticle.slug)}" target="_blank" style="outline:none;display:block;line-height:0;">
                <img class="nl-hero-img" src="${esc(leadArticle.thumbUrl)}" alt="${esc(leadArticle.title)}" width="600" height="450" style="display:block;width:100%;max-width:600px;height:450px;border:0;object-fit:cover;" />
              </a>
            </td>
          </tr>`
      : '';

  const excerptEllipsis = (excerpt: string, maxBeforeEllipsis: number) =>
    excerpt.length >= maxBeforeEllipsis ? '…' : '';

  const customSingleAfterIntro =
    isCustomSingle && leadArticle?.authorName?.trim()
      ? `<p class="nl-art-author nl-intro-author" style="margin:18px 0 0;font-family:${FONT_SANS};font-size:13px;line-height:1.45;color:${EMAIL_COLORS.textMuted};">Af ${esc(leadArticle.authorName.trim())}</p>`
      : '';

  /* Under hero: artikelrækker (standard) eller intet ved custom_single — indholdet ligger i intro + forfatter + CTA. */
  const articleRows = isCustomSingle
    ? ''
    : articles
        .map((a) => {
          const thumb = a.thumbUrl
            ? `<img class="nl-thumb-img" src="${esc(a.thumbUrl)}" alt="" width="120" height="80" style="display:block;width:120px;height:80px;object-fit:cover;border-radius:4px;border:0;" />`
            : `<div style="width:120px;height:80px;background:${EMAIL_COLORS.thumbPlaceholder};border-radius:4px;"></div>`;
          return `
<tr class="nl-art">
  <td class="nl-art-outer" style="padding:20px 0;border-bottom:1px solid ${EMAIL_COLORS.borderLight};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td class="nl-thumb-cell" width="132" valign="top" style="padding-right:14px;">${thumb}</td>
        <td class="nl-art-body" valign="top">
          <h2 class="nl-art-title" style="margin:0;"><a href="${track(a.url, a.slug)}">${esc(a.title)}</a></h2>
          ${a.excerpt ? `<p class="nl-art-excerpt" style="margin:8px 0 0;">${esc(a.excerpt)}${excerptEllipsis(a.excerpt, NEWSLETTER_EXCERPT_MAX_DEFAULT)}</p>` : ''}
          <p class="nl-art-read" style="margin:12px 0 0;">
            <a class="nl-art-read-btn" href="${track(a.url, a.slug)}" style="display:inline-block;padding:8px 20px;font-family:${FONT_SANS};font-size:13px;font-weight:500;color:${EMAIL_COLORS.btnPrimaryText};background-color:${EMAIL_COLORS.btnPrimaryBg};border-radius:8px;text-decoration:none;line-height:1.3;">Læs historien</a>
          </p>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
        })
        .join('');

  const emptyState =
    articles.length === 0
      ? `<tr><td style="padding:24px 0;font-family:${FONT_SANS};font-size:14px;color:${EMAIL_COLORS.textMuted};">Ingen nye artikler i den valgte periode (filtreres primært på Webflow Created On).</td></tr>`
      : '';

  const siteCtaHref = track(site);
  const primaryCtaHref = isCustomSingle && leadArticle ? track(leadArticle.url, leadArticle.slug) : siteCtaHref;
  const primaryCtaLabel = isCustomSingle && leadArticle ? 'Læs artiklen nu' : 'Besøg Apropos Magazine';
  const h1Text = esc(headline.trim() || 'Seneste fra Apropos');
  const footerSectionMusikHref = track(`${site}/sections/musik`);
  const footerSectionKulturHref = track(`${site}/sections/kultur`);
  const footerSectionSerierHref = track(`${site}/sections/serierogfilm`);
  const footerAnmeldelserHref = track(`${site}/topics/anmeldelser`);
  const footerLegalHref = track(`${site}/other/legal`);
  const footerSocialIgHref = esc('https://www.instagram.com/aproposmagazineofficial/');
  const footerSocialFbHref = esc('https://www.facebook.com/aproposmagazineofficial/');
  const footerSocialLiHref = esc('https://www.linkedin.com/company/aproposmagazine');
  const assetRootFallback = (logoAssetBaseUrl || site).replace(/\/$/, '');
  const socialImgSrc = (name: NewsletterSocialIconName) => {
    const data = getNewsletterSocialIconDataUri(name);
    if (data) return esc(data);
    return esc(`${assetRootFallback}/images/nl-social-${name}.png`);
  };

  return `<!DOCTYPE html>
<html lang="da" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Apropos Magazine</title>
  <!--[if mso]>
  <xml>
    <o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch><o:AllowPNG/></o:OfficeDocumentSettings>
  </xml>
  <![endif]-->
  <style type="text/css">
    a { text-decoration: none; }
    @media (max-width: 620px) {
      .nl-card { width: 100% !important; max-width: 100% !important; }
      .nl-pad { padding-left: 22px !important; padding-right: 22px !important; }
      .nl-outer-cell { padding-left: 0 !important; padding-right: 0 !important; padding-top: 0 !important; padding-bottom: 4px !important; }
      table.nl-card td.nl-cell-logo.nl-pad { padding: 14px 28px 16px !important; }
      .nl-head-block { padding-top: 22px !important; padding-bottom: 20px !important; }
    }
  </style>
  <style type="text/css">
${getNewsletterSharedDesignCss()}
  </style>
</head>
<body style="margin:0;padding:0;background-color:${EMAIL_COLORS.outerBg};-webkit-text-size-adjust:100%;">
  <div style="display:none !important;visibility:hidden;mso-hide:all;font-size:1px;line-height:0;max-height:0;max-width:0;width:0;height:0;opacity:0;overflow:hidden;color:transparent;mso-line-height-rule:exactly;">${esc(pre)}&#8203;</div>
  <table role="presentation" class="nl-container" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${EMAIL_COLORS.outerBg};mso-table-lspace:0;mso-table-rspace:0;border-collapse:collapse;">
    <tr>
      <td class="nl-outer-cell" align="center" style="padding:6px 12px 12px;">
        <table role="presentation" class="nl-card" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:${EMAIL_COLORS.cardBg};mso-table-lspace:0;mso-table-rspace:0;border-collapse:collapse;">
          <tr>
            <td class="nl-pad nl-cell-logo" align="center" style="padding:18px 34px 16px;">
              <a href="${siteCtaHref}" target="_blank" style="outline:none;display:inline-block;line-height:0;vertical-align:bottom;">
                <img class="nl-logo-img" src="${esc(logoUrl)}" width="120" height="48" alt="Apropos Magazine" style="display:block;height:auto;max-width:120px;width:120px;margin:0 auto;border:0;" />
              </a>
            </td>
          </tr>
          ${heroRow}
          <tr>
            <td class="nl-pad nl-head-block" style="padding:26px 30px 22px;">
              <h1 class="nl-h1" style="margin:0;font-family:${FONT_SANS};font-size:42px;line-height:1.2;font-weight:700;color:${EMAIL_COLORS.textPrimary};text-align:left;">${h1Text}</h1>
            </td>
          </tr>
          <tr>
            <td class="nl-pad" style="padding:0 30px ${isCustomSingle ? '32px' : '28px'};">
              <div class="nl-intro" style="font-family:${FONT_SANS};">${introHtml}</div>
              ${customSingleAfterIntro}
            </td>
          </tr>
          ${
            isCustomSingle
              ? ''
              : `<tr>
            <td class="nl-pad" style="padding:0 30px 12px;">
              <p class="nl-section-label" style="margin:0;font-family:${FONT_SANS};font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:${EMAIL_COLORS.textMuted};">Udvalgte artikler</p>
            </td>
          </tr>
          <tr>
            <td class="nl-pad" style="padding:0 30px 32px;">
              <table role="presentation" class="nl-articles-inner" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${articleRows || emptyState}
              </table>
            </td>
          </tr>`
          }
          <tr>
            <td class="nl-pad" align="center" style="padding:0 30px 36px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="mso-table-lspace:0;mso-table-rspace:0;">
                <tr>
                  <td align="center">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${primaryCtaHref}" style="height:52px;v-text-anchor:middle;width:520px;" arcsize="23%" stroke="f" fillcolor="${EMAIL_COLORS.btnPrimaryBg}">
                      <w:anchorlock/>
                      <center style="color:${EMAIL_COLORS.btnPrimaryText};font-family:sans-serif;font-size:16px;font-weight:400;">${esc(primaryCtaLabel)}</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-->
                    <a class="nl-primary-cta" href="${primaryCtaHref}" target="_blank" style="background-color:${EMAIL_COLORS.btnPrimaryBg};border-radius:${EMAIL_PRIMARY_CTA_BORDER_RADIUS};color:${EMAIL_COLORS.btnPrimaryText};display:block;font-family:${FONT_SANS};font-size:16px;font-weight:400;line-height:52px;text-align:center;text-decoration:none;width:100%;max-width:520px;mso-hide:all;">
                      ${esc(primaryCtaLabel)}
                    </a>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0;">
              <table role="presentation" class="nl-footer-dark" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${EMAIL_COLORS.btnPrimaryBg};mso-table-lspace:0;mso-table-rspace:0;">
                <tr>
                  <td class="nl-pad nl-footer-dark-inner nl-footer-explore" align="left" style="padding:36px 30px 0;font-family:${FONT_SANS};">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:97px;max-width:97px;mso-table-lspace:0;mso-table-rspace:0;">
                      <tr>
                        <td width="97" style="width:97px;max-width:97px;padding:0;line-height:0;font-size:0;">
                          <a
                            class="nl-footer-logo-link"
                            href="${siteCtaHref}"
                            target="_blank"
                            style="outline:none;display:block;line-height:0;margin:0 0 16px;text-align:left;max-width:97px;"
                          >
                            <img
                              class="nl-footer-logo-img"
                              src="${esc(logoUrl)}"
                              alt="Apropos Magazine"
                              width="97"
                              height="39"
                              style="display:block;width:97px;max-width:97px;height:39px;border:0;-ms-interpolation-mode:bicubic;object-fit:contain;filter:brightness(0) invert(1);-webkit-filter:brightness(0) invert(1);"
                            />
                          </a>
                        </td>
                      </tr>
                    </table>
                    <p class="nl-footer-explore-tagline" style="margin:0;font-size:11px;font-weight:600;line-height:1.4;color:rgba(255,255,255,0.55);text-align:left;letter-spacing:0.12em;">
                      LÆS VIDERE. ALTID UDEN REKLAMER.
                    </p>
                    <a class="nl-footer-nav-link" href="${footerSectionMusikHref}" target="_blank" style="display:block;font-size:26px;font-weight:700;line-height:1.15;color:#ffffff;text-decoration:none;padding:24px 0 0;text-align:left;text-transform:uppercase;letter-spacing:0.02em;">Musik</a>
                    <a class="nl-footer-nav-link" href="${footerSectionKulturHref}" target="_blank" style="display:block;font-size:26px;font-weight:700;line-height:1.15;color:#ffffff;text-decoration:none;padding:14px 0 0;text-align:left;text-transform:uppercase;letter-spacing:0.02em;">Kultur</a>
                    <a class="nl-footer-nav-link" href="${footerSectionSerierHref}" target="_blank" style="display:block;font-size:26px;font-weight:700;line-height:1.15;color:#ffffff;text-decoration:none;padding:14px 0 24px;text-align:left;text-transform:uppercase;letter-spacing:0.02em;">Serier og film</a>
                  </td>
                </tr>
                <tr>
                  <td class="nl-pad nl-footer-dark-inner nl-footer-social" align="left" style="padding:0 30px 0;font-family:${FONT_SANS};">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="mso-table-lspace:0;mso-table-rspace:0;">
                      <tr>
                        <td style="padding:4px 0;font-size:0;line-height:0;">
                          <table role="presentation" class="nl-footer-social-icons" cellpadding="0" cellspacing="0" border="0" style="mso-table-lspace:0;mso-table-rspace:0;">
                            <tr>
                              <td style="padding:0 18px 0 0;vertical-align:middle;">
                                <a href="${footerSocialIgHref}" target="_blank" style="display:block;line-height:0;text-decoration:none;">
                                  <img class="nl-social-icon" src="${socialImgSrc('instagram')}" width="22" height="22" alt="Instagram" style="display:block;border:0;width:22px;height:22px;-ms-interpolation-mode:bicubic;" />
                                </a>
                              </td>
                              <td style="padding:0 18px 0 0;vertical-align:middle;">
                                <a href="${footerSocialFbHref}" target="_blank" style="display:block;line-height:0;text-decoration:none;">
                                  <img class="nl-social-icon" src="${socialImgSrc('facebook')}" width="22" height="22" alt="Facebook" style="display:block;border:0;width:22px;height:22px;-ms-interpolation-mode:bicubic;" />
                                </a>
                              </td>
                              <td style="padding:0;vertical-align:middle;">
                                <a href="${footerSocialLiHref}" target="_blank" style="display:block;line-height:0;text-decoration:none;">
                                  <img class="nl-social-icon" src="${socialImgSrc('linkedin')}" width="22" height="22" alt="LinkedIn" style="display:block;border:0;width:22px;height:22px;-ms-interpolation-mode:bicubic;" />
                                </a>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td class="nl-pad nl-footer-dark-inner" style="padding:0 30px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="font-size:1px;line-height:1px;padding:18px 0 0;border-bottom:1px solid rgba(255,255,255,0.18);">&nbsp;</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td class="nl-pad nl-footer-dark-inner" style="padding:0 30px;">
                    <a class="nl-footer-link-row" href="${footerAnmeldelserHref}" target="_blank" style="display:block;font-family:${FONT_SANS};font-size:17px;font-weight:600;line-height:1.35;color:#ffffff;text-decoration:none;padding:20px 0;border-bottom:1px solid rgba(255,255,255,0.14);">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td align="left" valign="middle" style="padding:0;">Læs alle anmeldelser</td>
                          <td align="right" valign="middle" width="28" style="padding:0;font-size:22px;font-weight:300;line-height:1;color:#ffffff;">&#8250;</td>
                        </tr>
                      </table>
                    </a>
                  </td>
                </tr>
                <tr>
                  <td class="nl-pad nl-footer-dark-inner" align="left" style="padding:20px 30px 14px;font-family:${FONT_SANS};font-size:12px;line-height:1.65;color:rgba(255,255,255,0.72);">
                    <p class="nl-footer-address" style="margin:0 0 16px;">
                      Apropos Magazine® is published by Apropos Creative ApS.<br />
                      Flæsketorvet 26-28,<br />
                      1711 København V
                    </p>
                    <p class="nl-footer-subscribe-note" style="margin:0 0 18px;font-size:12px;line-height:1.55;color:rgba(255,255,255,0.62);">
                      Du modtager denne mail, fordi du har tilmeldt dig nyhedsbrevet hos Apropos Magazine.
                    </p>
                    <p class="nl-footer-legal-links" style="margin:0;font-size:12px;line-height:1.6;color:rgba(255,255,255,0.85);">
                      <a href="${footerLegalHref}" target="_blank" style="color:#ffffff;text-decoration:underline;">Privatlivspolitik</a>
                      <span style="color:rgba(255,255,255,0.35);">&nbsp;|&nbsp;</span>
                      <a href="${footerLegalHref}" target="_blank" style="color:#ffffff;text-decoration:underline;">Vilkår</a>
                      <span style="color:rgba(255,255,255,0.35);">&nbsp;|&nbsp;</span>
                      <a href="${NEWSLETTER_UNSUBSCRIBE_PLACEHOLDER}" style="color:#ffffff;text-decoration:underline;">Afmeld</a>
                    </p>
                    <p class="nl-footer-help" style="margin:16px 0 0;font-size:11px;line-height:1.55;color:rgba(255,255,255,0.45);">
                      Spørgsmål? Skriv til <a href="mailto:hej@aproposmagazine.com" style="color:rgba(255,255,255,0.55);text-decoration:underline;">hej@aproposmagazine.com</a>.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="font-size:1px;line-height:1px;padding-bottom:16px;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Turn plain-text intro into safe paragraphs for email. */
export function introTextToHtml(intro: string): string {
  const parts = intro
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return `<p class="nl-intro-p" style="${INTRO_PARAGRAPH_STYLE}">&nbsp;</p>`;
  return parts
    .map(
      (p) =>
        `<p class="nl-intro-p" style="${INTRO_PARAGRAPH_STYLE}">${esc(p).replace(/\n/g, '<br/>')}</p>`
    )
    .join('');
}
