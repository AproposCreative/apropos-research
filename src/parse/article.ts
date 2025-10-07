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

  // Date fallbacks: meta article:published_time -> time[datetime] -> JSON-LD
  const date =
    $("meta[property='article:published_time']").attr("content")?.trim() ||
    $("time[datetime]").first().attr("datetime")?.trim() ||
    getJsonLdDate($) ||
    undefined;

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

  const body_text = contentRoot.text().replace(/\s+/g, " ").trim();
  if (!body_text) return null;

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
    // eslint-disable-next-line no-console
    console.debug(JSON.stringify({ url, cleaned_html_length }, null, 0));
  }

  return parsed.data;
}


