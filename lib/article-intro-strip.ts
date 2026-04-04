/**
 * Remove leading intro duplicate from article body when intro is stored separately
 * (e.g. CMS `intro` + `content` still contains the same opening paragraph).
 */

function normalizeCompare(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

function wordSet(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.replace(/[^\p{L}\p{N}]+/gu, ''))
      .filter((w) => w.length > 2),
  );
}

function wordOverlapRatio(a: string, b: string): number {
  const wa = wordSet(a);
  const wb = wordSet(b);
  if (wa.size === 0 || wb.size === 0) return 0;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter += 1;
  return inter / Math.min(wa.size, wb.size);
}

/** Strip Apropos-style title lines so the first block matches the intro field. */
function peelTitleHeader(text: string): string {
  let t = text.trim();
  t = t.replace(
    /^(?:\s*(?:\*\*|__)?\s*(?:arbejdstitel|titel)\s*(?:\*\*|__)?\s*[:\-–—][^\n]*\n)+/i,
    '',
  );
  t = t.replace(
    /^(?:\s*(?:\*\*|__)?\s*(?:undertitel|subtitle)\s*(?:\*\*|__)?\s*[:\-–—][^\n]*\n)+/i,
    '',
  );
  return t.trim();
}

/**
 * @param introField — value from `articleData.intro` (may include optional `Intro:` prefix)
 * @param rawContent — full `content` / post-body
 */
export function stripIntroDuplicateFromBody(introField: string, rawContent: string): string {
  const intro = introField.replace(/^intro\s*:\s*/i, '').trim();
  const text = (rawContent || '').trim();
  if (!intro || !text) return text;

  const ni = normalizeCompare(intro);
  if (ni.length < 12) return text;

  const peeled = peelTitleHeader(text);

  // Labeled intro / indledning block at start (after optional headers)
  const labeled = peeled.match(
    /^\s*(?:\*\*|__)?\s*(?:intro|indledning)\s*(?:\*\*|__)?\s*[:\-–—]\s*([\s\S]+?)(?=\n{2,}|$)/i,
  );
  if (labeled) {
    const inner = labeled[1].trim();
    if (normalizeCompare(inner) === ni || wordOverlapRatio(intro, inner) >= 0.92) {
      return peeled.slice(labeled[0].length).replace(/^\s*\n+/, '').trim();
    }
  }

  const paras = peeled.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (paras.length === 0) return text;

  const first = paras[0]
    .replace(/^\s*(?:\*\*|__)?\s*(?:intro|indledning)\s*(?:\*\*|__)?\s*[:\-–—]\s*/i, '')
    .trim();

  if (normalizeCompare(first) === ni) {
    return paras.slice(1).join('\n\n').trim();
  }

  if (wordOverlapRatio(intro, first) >= 0.88 && Math.min(intro.length, first.length) >= 40) {
    return paras.slice(1).join('\n\n').trim();
  }

  if (normalizeCompare(first).startsWith(ni) && ni.length >= 40) {
    return paras.slice(1).join('\n\n').trim();
  }

  return text;
}
