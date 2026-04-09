import { env } from '@/lib/config/env';
import { getNewsletterLogoDataUri } from '@/lib/newsletter/newsletter-logo-data-uri';

/** Lyse neutrale farver — matcher Instagram-kort / design-editor (hvid kort, sort/grå tekst). */
export const EMAIL_COLORS = {
  outerBg: '#ebebeb',
  cardBg: '#ffffff',
  textPrimary: '#2e2e2e',
  textMuted: '#737373',
  borderLight: '#d8d8d8',
  borderMedium: '#bbbbbb',
  thumbPlaceholder: '#eeeeee',
  btnPrimaryBg: '#0d0d0d',
  btnPrimaryText: '#ffffff',
  btnSecondaryBg: '#ffffff',
  btnSecondaryText: '#2e2e2e',
  btnSecondaryBorder: '#2e2e2e',
} as const;

/** Primær CTA — mindre afrunding end pill-form. */
export const EMAIL_PRIMARY_CTA_BORDER_RADIUS = '12px';

export const FONT_SANS = "Helvetica,Arial,sans-serif";
export const FONT_SERIF = "Georgia,'Times New Roman',serif";

/** Brødtekst til AI-intro i mailen. */
export const INTRO_PARAGRAPH_STYLE = `margin:0 0 14px;font-family:${FONT_SANS};font-size:15px;line-height:1.65;color:${EMAIL_COLORS.textPrimary};`;

const NEWSLETTER_LOGO_PATH = '/images/apropos-newsletter-logo.png';

/**
 * @param articleSiteUrl — magasin-URL (links i mailen); bruges kun som logo-fallback hvis hverken
 *   `NEWSLETTER_LOGO_URL`, `NEXT_PUBLIC_BASE_URL` eller `VERCEL_URL` kan pege på Next-app’en.
 * @param options.assetBaseUrl — ved draft/preview: request origin (Next `/public`-logo loader her)
 *
 * Preview: Hvis `NEWSLETTER_LOGO_URL` peger på et andet host end app’en (fx magasinet på Webflow),
 * bruges alligevel `assetBaseUrl` + `NEWSLETTER_LOGO_PATH`, ellers ender logo-src i et 404 i iframe (`srcDoc`).
 * Samme origin som preview → `NEWSLETTER_LOGO_URL` respekteres (fx eget CDN på samme deployment).
 *
 * Udgående mail: Logo-PNG ligger i Next `public/` — ikke på Webflow.
 * Brug `NEXT_PUBLIC_BASE_URL`, `VERCEL_PROJECT_PRODUCTION_URL` eller `VERCEL_URL` til https-URL;
 * ellers indlejres PNG som data-URI (virker uden ekstern hosting).
 */
function outgoingAppAssetBase(): string | null {
  const publicBase = env.NEXT_PUBLIC_BASE_URL?.trim().replace(/\/$/, '');
  if (publicBase) return publicBase;
  const prod = env.VERCEL_PROJECT_PRODUCTION_URL?.trim().replace(/\/$/, '').replace(/^https?:\/\//, '');
  if (prod) return `https://${prod}`;
  const vercel = env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, '')}`;
  return null;
}

export function getNewsletterLogoUrl(
  articleSiteUrl: string,
  options?: { assetBaseUrl?: string }
): string {
  const previewBase = options?.assetBaseUrl?.trim().replace(/\/$/, '');
  const fromEnv = env.NEWSLETTER_LOGO_URL?.trim();

  if (previewBase) {
    if (fromEnv) {
      try {
        if (new URL(fromEnv).origin === new URL(previewBase).origin) {
          return fromEnv;
        }
      } catch {
        /* ugyldig URL — falder tilbage til bundlet logo */
      }
    }
    return `${previewBase}${NEWSLETTER_LOGO_PATH}`;
  }

  if (fromEnv) return fromEnv;

  const appBase = outgoingAppAssetBase();
  if (appBase) {
    const mag = env.NEWSLETTER_ARTICLE_BASE_URL?.trim();
    if (mag) {
      try {
        const appOrigin = new URL(appBase).origin;
        const magOrigin = new URL(mag).origin;
        if (appOrigin === magOrigin) {
          const inline = getNewsletterLogoDataUri();
          if (inline) return inline;
        }
      } catch {
        /* ignorér sammenligning */
      }
    }
    return `${appBase}${NEWSLETTER_LOGO_PATH}`;
  }

  const inline = getNewsletterLogoDataUri();
  if (inline) return inline;

  return `${articleSiteUrl.replace(/\/$/, '')}${NEWSLETTER_LOGO_PATH}`;
}

function newsletterStaticAssetOrigin(magBase: string): string {
  const app = outgoingAppAssetBase();
  if (app) {
    try {
      return new URL(app.startsWith('http') ? app : `https://${app}`).origin;
    } catch {
      /* falder tilbage */
    }
  }
  const m = magBase.startsWith('http') ? magBase : `https://${magBase.replace(/^https?:\/\//, '')}`;
  try {
    return new URL(m).origin;
  } catch {
    return 'https://www.aproposmagazine.com';
  }
}

/** Ved Resend-send: sørg for at bundlet filnavn peger på produktion/NEWSLETTER_LOGO_URL (ikke localhost). */
export function rewriteNewsletterLogoSrcForOutgoingEmail(html: string): string {
  const magBase = (env.NEWSLETTER_ARTICLE_BASE_URL || 'https://www.aproposmagazine.com').replace(/\/$/, '');
  const prodLogo = getNewsletterLogoUrl(magBase);
  const safe = prodLogo.replace(/&/g, '&amp;');
  let out = html.replace(/\ssrc="[^"]*apropos-newsletter-logo\.png[^"]*"/gi, ` src="${safe}"`);
  /* Efter draft fra preview: src kan allerede være app-host — omskriv til prodLogo (data-URI eller korrekt https) */
  out = out.replace(/\ssrc="[^"]*\/images\/apropos-newsletter-logo\.png[^"]*"/gi, ` src="${safe}"`);

  let assetOrigin: string;
  try {
    assetOrigin = new URL(prodLogo).origin;
    if (!assetOrigin || assetOrigin === 'null') assetOrigin = newsletterStaticAssetOrigin(magBase);
  } catch {
    assetOrigin = newsletterStaticAssetOrigin(magBase);
  }
  const socialSrc = (file: string) => `${assetOrigin}/images/${file}`.replace(/&/g, '&amp;');
  /* PNG (e-mail-klienter blokerer ofte SVG i <img>) */
  out = out.replace(/\ssrc="[^"]*nl-social-instagram\.(svg|png)[^"]*"/gi, ` src="${socialSrc('nl-social-instagram.png')}"`);
  out = out.replace(/\ssrc="[^"]*nl-social-facebook\.(svg|png)[^"]*"/gi, ` src="${socialSrc('nl-social-facebook.png')}"`);
  out = out.replace(/\ssrc="[^"]*nl-social-linkedin\.(svg|png)[^"]*"/gi, ` src="${socialSrc('nl-social-linkedin.png')}"`);
  const FW = 97;
  const FH = 39;
  out = out.replace(/<img[^>]*class="[^"]*nl-footer-logo-img[^"]*"[^>]*>/gi, (tag) => {
    let t = tag.replace(/\swidth="\d+"/i, '').replace(/\sheight="\d+"/i, '');
    if (/style="/i.test(t)) {
      t = t.replace(/style="([^"]*)"/i, (_m, styleRaw: string) => {
        const cleaned = styleRaw
          .replace(/(?:^|;)\s*width\s*:\s*[^;"]*/gi, '')
          .replace(/(?:^|;)\s*height\s*:\s*[^;"]*/gi, '')
          .replace(/(?:^|;)\s*max-width\s*:\s*[^;"]*/gi, '')
          .replace(/(?:^|;)\s*object-fit\s*:\s*[^;"]*/gi, '')
          .replace(/;;+/g, ';')
          .replace(/^;|;$/g, '')
          .trim();
        const prefix = `width:${FW}px;max-width:${FW}px;height:${FH}px;object-fit:contain;`;
        return `style="${prefix}${cleaned ? cleaned : ''}"`;
      });
    } else {
      t = t.replace(/>$/, ` style="width:${FW}px;max-width:${FW}px;height:${FH}px;object-fit:contain;">`);
    }
    return t.replace('<img', `<img width="${FW}" height="${FH}"`);
  });
  /* Ældre kladder: ens footer-ramme til Outlook. */
  const td97 =
    '<td width="97" style="width:97px;max-width:97px;padding:0;line-height:0;font-size:0;">';
  const tbl97 = 'style="width:97px;max-width:97px;mso-table-lspace:0;mso-table-rspace:0;"';
  out = out.replace(
    /<td width="140" style="width:140px;max-width:140px;padding:0;line-height:0;font-size:0;">/gi,
    td97
  );
  out = out.replace(
    /<td width="120" style="width:120px;max-width:120px;padding:0;line-height:0;font-size:0;">/gi,
    td97
  );
  out = out.replace(
    /<td width="108" style="width:108px;max-width:108px;padding:0;line-height:0;font-size:0;">/gi,
    td97
  );
  out = out.replace(
    /style="width:140px;max-width:140px;mso-table-lspace:0;mso-table-rspace:0;"/gi,
    tbl97
  );
  out = out.replace(
    /style="width:120px;max-width:120px;mso-table-lspace:0;mso-table-rspace:0;"/gi,
    tbl97
  );
  out = out.replace(
    /style="width:108px;max-width:108px;mso-table-lspace:0;mso-table-rspace:0;"/gi,
    tbl97
  );
  return out;
}
