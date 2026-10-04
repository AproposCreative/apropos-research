import { load } from 'cheerio';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { articleImages } from '@/lib/mcp/markup';

const visible = (value: unknown) => load(typeof value === 'string' ? value : '').root().text().replace(/\s+/gu, ' ').trim();
type Finding = { code: string; field: string; excerpt: string; action: string; paragraphId?: string };
/** Deterministic observations, not an AI fact check, subjective score or grant. */
export function draftDiagnostics(article: Record<string, unknown>) {
  const version = cmsFieldHash(article), $ = load(String(article.content || ''));
  const paragraphs = $('p').toArray().map((p, index) => {
    const text = $(p).text().replace(/\s+/gu, ' ').trim();
    return { id: cmsFieldHash({ version, index, text }), text };
  }).filter(p => p.text);
  const intro = visible(article.intro), title = visible(article.title);
  const findings: Finding[] = [];
  const add = (code: string, field: string, excerpt: string, action: string, paragraphId?: string) => findings.push({ code, field, excerpt: excerpt.slice(0, 400), action, ...(paragraphId ? { paragraphId } : {}) });
  if (!intro) add('missing_intro', 'intro', '', 'Forklar hændelsen, hvem den handler om og hvorfor den er aktuel, før analysen.');
  if (!title) add('missing_title', 'title', '', 'Skriv en konkret titel, der kan forstås uden forhåndsviden.');
  const seen = new Set<string>();
  for (const p of paragraphs) {
    const normalized = p.text.toLocaleLowerCase('da');
    if (seen.has(normalized) || intro && p.text === intro) add('repeated_passage', 'content', p.text, 'Fjern den dobbelte introduktion eller gentagelse; bevar resten.', p.id);
    seen.add(normalized);
    const stock = p.text.match(/(?:Det interessante er|Det er værd at bemærke|I en tid hvor|Dette rejser spørgsmålet)/i);
    if (stock) add('stock_phrase', 'content', p.text, 'Overvej at skrive pointen direkte. Markeringen er et redaktionelt forslag, ikke en afvisning.', p.id);
  }
  const images = articleImages(String(article.content || ''));
  if (new Set(images.map(i => i.url)).size < 2) add('body_images_missing', 'content', '', 'Der kræves to forskellige brødtekstbilleder ud over coveret. Genbrug eksisterende godkendte assets.');
  if (!article.featuredImage) add('cover_missing', 'featuredImage', '', 'Vælg et eksisterende relevant cover; dette tjek bestiller ikke et billede.');
  if (!article.seoTitle || !article.seoDescription) add('seo_fields_missing', 'seo', '', 'Udfyld manglende SEO-felter uden at omskrive brødteksten.');
  const body = paragraphs.map(p => p.text).join('\n');
  if (article.rating !== undefined && !/Læs Apropos Magazines anmeldelse her \([1-6]\/6 stjerner\)\.?\s*$/u.test(body)) {
    add('review_rating_line_missing', 'content', paragraphs.at(-1)?.text || '', 'Kontrollér artikeltypen og tilføj den korrekte stjernelinje til sidst i anmeldelsen.');
  }
  return { articleHash: version, kind: 'deterministic-editorial-diagnostics', findings: findings.slice(0, 40),
    findingCount: findings.length, paragraphs, bodyWords: visible(article.content).split(/\s+/u).filter(Boolean).length,
    reviewQuestions: ['Hvad handler artiklen konkret om?', 'Er typen anmeldelse, nyhed, feature eller kommentar tydelig?',
      'Hvad får læseren ud af teksten, og er tesen dokumenteret?', 'Kan første 100 ord forstås uden researchen?',
      'Er egne observationer, holdninger og kildebelagte fakta adskilt?'],
    factCheck: 'not_performed', semanticEditorialReview: 'requires_editor', publicationApproval: false,
    paragraphIds: 'snapshot_only_invalid_after_edit', paidAiCalls: 0 };
}
