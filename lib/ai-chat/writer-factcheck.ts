import { readJsonResponse } from '@/lib/api/read-json-response';

/** Client-safe adapter to the same grounded factcheck endpoint used by Liv. */
export function writerFactcheckInput(article: {
  title?: string; intro?: string; content?: string;
  researchSelected?: { url?: string };
  researchSources?: Array<{ url?: string | null }>;
  editorialResearch?: { dossier?: { sources?: Array<{ url?: string }> } } | null;
}) {
  const sourceUrls = [...new Set([
    article.researchSelected?.url,
    ...(article.researchSources || []).map(s => s.url),
    ...(article.editorialResearch?.dossier?.sources || []).map(s => s.url),
  ].filter((url): url is string => typeof url === 'string' && /^https:\/\//i.test(url)))].slice(0, 8);
  return { articleText: [article.title, article.intro, article.content].filter(Boolean).join('\n\n'), sourceUrls };
}

export async function runWriterFactcheck(article: Parameters<typeof writerFactcheckInput>[0], request: typeof fetch = fetch) {
  const input = writerFactcheckInput(article);
  if (!input.sourceUrls.length) return { complete: false, results: [], warnings: ['Faktatjek mangler kilde-URL’er. Tilføj kilder før publicering.'] };
  try {
    const report = await readJsonResponse(await request('/api/factcheck', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    }));
    const complete = report.complete === true && report.verificationMethod === 'retrieved-sources'
      && Array.isArray(report.results) && report.results.length > 0
      && report.results.every((r: { status?: string }) => r.status === 'verified');
    return { complete, results: Array.isArray(report.results) ? report.results : [],
      warnings: complete ? [] : ['Faktatjek er ikke fuldt godkendt. Tilføj belæg eller ret udokumenterede påstande.'] };
  } catch {
    return { complete: false, results: [], warnings: ['Faktatjek kunne ikke gennemføres. Ingen faktagodkendelse.'] };
  }
}
