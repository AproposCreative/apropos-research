import { load as loadHtml } from "cheerio";
import { z } from "zod";

export type ParsedArticle = {
  url: string;
  title?: string;
  author?: string;
  date?: string;
  category?: string;
  body_text: string;
  excerpt?: string;
  image?: string;
};

const ParsedSchema = z.object({
  url: z.string().url(),
  title: z.string().optional(),
  author: z.string().optional(),
  date: z.string().optional(),
  category: z.string().optional(),
  body_text: z.string().min(1),
  excerpt: z.string().optional(),
  image: z.string().optional(),
});

function getJsonLdDate($: any): string | undefined {
  try {
    const scripts = $("script[type='application/ld+json']");
    for (const el of scripts.toArray()) {
      const txt = $(el).contents().text();
      const data = JSON.parse(txt);
      const maybeArray = Array.isArray(data) ? data : [data];
      for (const obj of maybeArray) {
        if (obj && (obj.datePublished || obj["datePublished"])) {
          return String(obj.datePublished || obj["datePublished"]);
        }
      }
    }
  } catch {}
  return undefined;
}

const PAYWALL_PATTERNS = [
  /VIL DU LÆ?SE VIDERE\??.*/i,
  /Fortsæt med at læse.*/i,
  /Opret en? (gratis )?konto.*/i,
  /Log ind for at læse.*/i,
  /Bliv abonnent.*/i,
  /Få adgang til.*/i,
  /Prøv \d+ dage gratis.*/i,
  /Allerede abonnent\?.*/i,
  /Du skal være logget ind.*/i,
  /Subscribe to continue.*/i,
  /Sign up to read.*/i,
];

function stripPaywallBoilerplate(text: string): string {
  let cleaned = text;
  for (const pattern of PAYWALL_PATTERNS) {
    const idx = cleaned.search(pattern);
    if (idx > 0 && idx > cleaned.length * 0.4) {
      cleaned = cleaned.slice(0, idx).trim();
    }
  }
  return cleaned;
}

export function parseArticleHtml(url: string, html: string): ParsedArticle | null {
  const $ = loadHtml(html);

  // Title fallbacks: og:title -> h1 -> title
  const title =
    $("meta[property='og:title']").attr("content")?.trim() ||
    $("h1").first().text().trim() ||
    $("title").first().text().trim() ||
    undefined;

  // Author fallbacks: meta, rel=author, byline patterns
  const author =
    $("meta[name='author']").attr("content")?.trim() ||
    $("[rel='author']").first().text().trim() ||
    $(".author, .byline, .post-author").first().text().trim() ||
    undefined;

  // Date fallbacks: meta article:published_time -> time[datetime] -> JSON-LD -> URL pattern
  let date =
    $("meta[property='article:published_time']").attr("content")?.trim() ||
    $("time[datetime]").first().attr("datetime")?.trim() ||
    getJsonLdDate($) ||
    undefined;
  
  // Fallback: Extract date from URL if not found in HTML
  // GAFFA format: /2026/februar/ or /2026/02/
  // Soundvenue format: /2026/02/
  if (!date && url) {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      
      // Look for year/month pattern in URL
      for (let i = 0; i < pathParts.length - 1; i++) {
        const year = parseInt(pathParts[i]);
        if (year >= 2020 && year <= 2030) {
          const monthStr = pathParts[i + 1]?.toLowerCase();
          if (monthStr) {
            // Map Danish month names to numbers
            const monthMap: Record<string, number> = {
              'januar': 1, 'februar': 2, 'marts': 3, 'april': 4,
              'maj': 5, 'juni': 6, 'juli': 7, 'august': 8,
              'september': 9, 'oktober': 10, 'november': 11, 'december': 12
            };
            
            let month = parseInt(monthStr);
            if (isNaN(month)) {
              month = monthMap[monthStr] || 0;
            }
            
            if (month >= 1 && month <= 12) {
              // Use first day of month as fallback (better than no date)
              date = `${year}-${String(month).padStart(2, '0')}-01T00:00:00Z`;
              break;
            }
          }
        }
      }
    } catch {}
  }

  const category =
    $(".category a").first().text().trim() ||
    $("a[rel='category tag']").first().text().trim() ||
    $(".breadcrumbs a").eq(1).text().trim() ||
    undefined;

  // Image fallbacks: og:image -> first img in content -> first img on page
  const image =
    $("meta[property='og:image']").attr("content")?.trim() ||
    $("meta[name='twitter:image']").attr("content")?.trim() ||
    $("article img, main img, .content img, .post img").first().attr("src")?.trim() ||
    $("img").first().attr("src")?.trim() ||
    undefined;

  // Content root candidates in priority order
  const roots = [
    "article",
    "main",
    "[class*='content']",
    "[class*='post']",
    ".entry-content",
  ];
  let contentRoot = $("body");
  for (const sel of roots) {
    const cand = $(sel).first();
    if (cand.length) {
      contentRoot = cand;
      break;
    }
  }

  // Cleanup rules
  contentRoot
    .find(
      [
        "[class*='share']",
        "[class*='related']",
        "nav",
        "aside",
        "script",
        "style",
        "iframe",
        "figure",
        "figcaption",
        "[role='complementary']",
      ].join(", "),
    )
    .remove();

  const cleanedHtml = contentRoot.clone().html() || "";
  const cleaned_html_length = cleanedHtml.replace(/\s+/g, " ").trim().length;

  let body_text = contentRoot.text().replace(/\s+/g, " ").trim();
  if (!body_text) return null;

  body_text = stripPaywallBoilerplate(body_text);

  // Excerpt: first 25–40 words
  const words = body_text.split(/\s+/);
  const excerptWords = words.slice(0, Math.min(40, Math.max(25, Math.floor(words.length * 0.1))))
    .join(" ")
    .replace(/["“”]+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const excerpt = excerptWords;

  const candidate = { url, title, author, date, category, body_text, excerpt, image };
  const parsed = ParsedSchema.safeParse(candidate);
  if (!parsed.success) return null;

  // Debug-only log
  if (cleaned_html_length) {
     
    console.debug(JSON.stringify({ url, cleaned_html_length }, null, 0));
  }

  return parsed.data;
}


