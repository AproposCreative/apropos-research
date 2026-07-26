/**
 * Server-side HTML serialization for JSON-LD.
 * Output is raw HTML `<script type="application/ld+json">` — no client JS required.
 */

import { buildJsonLd } from '@/lib/seo-engine/jsonld';
import {
  buildReviewSchemaNode,
  evaluateReviewSchemaEligibility,
} from '@/lib/seo-engine/review-schema';
import type { EditorialAnalysisV1, JsonLdGraph, SeoEngineInputContract } from '@/lib/seo-engine/schema';

const SCRIPT_CLOSE = '</script>';

/** Escape `</script>` inside JSON so HTML parsers cannot break out. */
export function serializeJsonLdForHtml(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export function wrapJsonLdScript(
  data: unknown,
  attrs?: { dataAttr?: string }
): string {
  const attr =
    attrs?.dataAttr != null && attrs.dataAttr !== ''
      ? ` data-${attrs.dataAttr}=""`
      : '';
  return `<script type="application/ld+json"${attr}>\n${serializeJsonLdForHtml(data)}\n${SCRIPT_CLOSE}`;
}

/**
 * Full server-rendered JSON-LD HTML for an article page.
 * Emits a single @graph script (WebPage + Article [+ Review when eligible]).
 * No duplicate Review/Event nodes.
 */
export function renderServerJsonLdHtml(args: {
  input: SeoEngineInputContract;
  analysis: EditorialAnalysisV1;
  seoTitle: string;
  metaDescription: string;
}): string {
  const graph = buildJsonLd(args);
  return wrapJsonLdScript(graph, { dataAttr: 'apropos-server-jsonld' });
}

/**
 * Optional: emit Article @graph + separate Review script (mirrors live-site shape)
 * while keeping both server-rendered. Prefer `renderServerJsonLdHtml` to avoid
 * duplicate Article nodes when Webflow already emits Article in head.
 */
export function renderServerReviewJsonLdHtml(args: {
  input: SeoEngineInputContract;
  analysis: EditorialAnalysisV1;
  metaDescription: string;
}): string | null {
  const eligibility = evaluateReviewSchemaEligibility({
    input: args.input,
    analysis: args.analysis,
  });
  const review = buildReviewSchemaNode({
    input: args.input,
    analysis: args.analysis,
    metaDescription: args.metaDescription,
    eligibility,
    includeContext: true,
  });
  if (!review) return null;
  return wrapJsonLdScript(review, { dataAttr: 'apropos-review-schema' });
}

/** Parse all JSON-LD objects from raw HTML (for tests / verification). */
export function extractJsonLdFromHtml(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = (m[1] || '').trim();
    if (!raw) continue;
    try {
      out.push(JSON.parse(raw));
    } catch {
      /* skip invalid */
    }
  }
  return out;
}

export function flattenJsonLdNodes(docs: unknown[]): Array<Record<string, unknown>> {
  const nodes: Array<Record<string, unknown>> = [];
  for (const doc of docs) {
    if (!doc || typeof doc !== 'object') continue;
    const root = doc as Record<string, unknown>;
    if (Array.isArray(root['@graph'])) {
      for (const n of root['@graph']) {
        if (n && typeof n === 'object') nodes.push(n as Record<string, unknown>);
      }
    } else if (root['@type']) {
      nodes.push(root);
    }
  }
  return nodes;
}

export function findHtmlSchemaNodesByType(
  html: string,
  type: string
): Array<Record<string, unknown>> {
  return flattenJsonLdNodes(extractJsonLdFromHtml(html)).filter((n) => n['@type'] === type);
}

export type { JsonLdGraph };
