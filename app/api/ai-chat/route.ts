import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { config } from '@/lib/config/env';
import { initProgress, updateProgressStep, completeProgress } from '@/lib/ai-chat-progress-store';
import { createErrorResponse, ErrorCode } from '@/lib/api/types';

const openai = config.openai.apiKey
  ? new OpenAI({ apiKey: config.openai.apiKey })
  : null;

const PROGRESS_STEPS = [
  { id: 'prepare', label: 'Analyserer prompt og setup' },
  { id: 'web-search', label: 'Søger efter fakta og kilder' },
  { id: 'advanced-research', label: 'Indsamler redaktionel research' },
  { id: 'generation', label: 'Genererer artikeludkast' },
  { id: 'quality', label: 'Kører kvalitetskontrol' },
  { id: 'format', label: 'Formatterer svar til UI' },
];

function buildSystemPrompt(authorTOV: string, authorName: string, articleContext: Record<string, unknown>, notes?: string): string {
  const parts = [
    `Du er Apropos Magazines AI-assistent. Du hjælper med at skrive og udvikle artikler.`,
    `Svar på dansk. Vær konkret og følg brugerens ønsker.`,
  ];
  if (authorTOV?.trim()) {
    parts.push(`\n**Valgt tone (TOV) for denne artikel:**\n${authorTOV.trim()}`);
  }
  if (authorName?.trim()) {
    parts.push(`\n**Forfatter:** ${authorName.trim()}`);
  }
  const template = (articleContext?.template as string | undefined)?.trim();
  if (template) {
    parts.push(`\n**Valgt template:** ${template}`);
  }
  const title = (articleContext?.title || articleContext?.previewTitle) as string | undefined;
  const category = (articleContext?.category || articleContext?.section) as string | undefined;
  const rating = typeof articleContext?.rating === 'number' && articleContext.rating >= 1 && articleContext.rating <= 6 ? articleContext.rating : undefined;
  if (title?.trim()) parts.push(`\n**Arbejdstitel/emne:** ${title.trim()}`);
  if (category?.trim()) parts.push(`**Section/kategori:** ${category.trim()}`);
  if (rating != null) {
    parts.push(`\n**Brugeren har valgt stjernebedømmelse: ${rating} ud af 6.** Bevar denne vurdering i tone og konklusion, men skriv IKKE en "Stjerner:"-linje i selve artikelteksten. Rating håndteres i CMS-metadata.`);
  }
  const research = articleContext?.researchSelected as { title?: string; source?: string; keyPoints?: string[]; content?: string } | undefined;
  if (research?.title) {
    parts.push(`\n**RESEARCH KILDE (brug KUN som inspiration – parafrasér altid, kopiér ALDRIG):**`);
    parts.push(`Titel: "${research.title}"${research.source ? ` | Kilde: ${research.source}` : ''}`);
    const keyPoints = Array.isArray(research.keyPoints) ? research.keyPoints.slice(0, 6) : [];
    if (keyPoints.length > 0) {
      parts.push(`Nøglepunkter fra research:\n${keyPoints.map((kp, i) => `${i + 1}. ${kp}`).join('\n')}`);
    }
    if (research.content && research.content.length > 50) {
      const preview = research.content.substring(0, 350).replace(/\s+/g, ' ').trim() + (research.content.length > 350 ? '...' : '');
      parts.push(`Indholdseksempel (kun som kontekst): ${preview}`);
    }
    parts.push(`Skriv en helt original artikel – egen struktur, egne formuleringer, tilføj nye vinkler og kilder.`);
  }
  const suggestions = (articleContext?.aiDraft as { suggestions?: string[] } | undefined)?.suggestions;
  if (Array.isArray(suggestions) && suggestions.length > 0) {
    parts.push(`\n**AI FORSLAG (inkluder disse vinkler i artiklen):**\n${suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')}`);
  }
  const draftPrompt = (articleContext?.aiDraft as { prompt?: string } | undefined)?.prompt;
  if (draftPrompt && draftPrompt.length > 20) {
    parts.push(`\n**Instruktioner fra artikelopsætning:**\n${draftPrompt.trim()}`);
  }
  if (notes && notes.trim().length > 0) {
    parts.push(`\n**Redaktionelle noter fra bruger (skal prioriteres):**\n${notes.trim()}`);
  }
  parts.push(
    `\n**Artikelformat (Apropos struktur – structure.apropos.md). Følg PRÆCIS:**
- Linje 1: Arbejdstitel: [kun titeltekst]
- Linje 2: Undertitel: [8–14 ord]
- Linje 3: Intro: [én indledende paragraf, 2–4 linjer, ca. 60–80 ord]
- Tom linje
- Brødtekst: Start brødteksten med NYT indhold. Gentag ALDRIG titel, Undertitel eller intro-paragraffen i brødteksten. Brødteksten er løbende fortælling uden underoverskrifter, flow: forventning → oplevelse → indsigt → eftertanke. Afslut med 2–4 reflekterende sætninger (fx Eftertanke, Refleksion).
- Skriv ALDRIG titel/undertitel/intro igen i brødteksten. Skriv ALDRIG "Længde: X ord". Ordantal: film/serie 900–1100, koncert 700–900, kultur 1200–1500.`
  );
  return parts.join('\n');
}

/** Parse title/subtitle labels from the top of response with tolerant markdown and separators. */
function extractTopLabeledLine(
  text: string,
  kind: 'title' | 'subtitle'
): { value: string | null; content: string } {
  const t = text.trim();
  if (!t) return { value: null, content: t };

  const lines = t.split('\n');
  const maxScan = Math.min(lines.length, 20);
  const labelPattern = kind === 'title'
    ? '(?:arbejdstitel|titel)'
    : '(?:undertitel|subtitle)';

  for (let i = 0; i < maxScan; i += 1) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Accept common wrappers from model formatting: markdown list, blockquote and emphasis.
    const normalized = trimmed
      .replace(/^[-*]\s+/, '')
      .replace(/^>\s*/, '')
      .replace(/^\s*#+\s*/, '') // markdown headings
      .replace(/\*\*/g, '')
      .replace(/__/g, '')
      .replace(/`/g, '')
      .trim();

    // Accept separators ":" "-" "–" "—"
    const m = normalized.match(new RegExp(`^${labelPattern}\\s*[:\\-–—]\\s*(.+)$`, 'i'));
    if (!m) continue;

    const value = (m[1] || '').trim();
    if (!value) return { value: null, content: t };

    const remainingLines = [...lines.slice(0, i), ...lines.slice(i + 1)];
    const content = remainingLines.join('\n').trim();
    return { value, content };
  }

  return { value: null, content: t };
}

/** Force user-chosen rating (1-6) into content: replace any "Stjerner: ⭐..." line with the correct one. */
function applyRatingToContent(content: string, rating: number): string {
  if (rating < 1 || rating > 6) return content;
  const correctLine = `Stjerner: ${'⭐'.repeat(rating)}`;
  return content.replace(/\n?Stjerner\s*:\s*⭐*\s*(\([^)]*\))?\s*\n?/gi, `\n${correctLine}\n`);
}

/** Remove "Længde: X ord" line from content – ordantal vises kun i metadata. */
function stripWordCountLine(text: string): string {
  return text
    .replace(/\n?\s*Længde\s*:\s*\d+\s*ord\.?\s*\n?/gi, '\n')
    .replace(/\n?\s*Antal ord\s*:\s*\d+\s*\n?/gi, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Remove markdown/editorial labels that should not be in final body text. */
function stripEditorialMarkers(text: string): string {
  return (text || '')
    // Remove standalone section labels like "**Intro:**", "Brødtekst:", etc.
    .replace(/^\s*(?:\*\*|__)?\s*(?:intro|indledning|brødtekst|body)\s*(?:\*\*|__)?\s*[:\-–—]?\s*$/gim, '')
    // Remove inline label lines e.g. "**Brødtekst:** ..."
    .replace(/^\s*(?:\*\*|__)?\s*(?:intro|indledning|brødtekst|body)\s*(?:\*\*|__)?\s*[:\-–—]\s*/gim, '')
    // Remove explicit star lines from article text
    .replace(/^\s*(?:\*\*|__)?\s*stjerner?\s*(?:\*\*|__)?\s*[:\-–—].*$/gim, '')
    // Remove lines that are only markdown marker residue, e.g. "**"
    .replace(/^\s*(?:\*{1,}|_{1,})\s*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Remove duplicate intro and title/undertitel lines from body so they only appear once (in Intro box / metadata). */
function cleanDuplicateIntroAndMetaFromBody(content: string, extractedTitle: string | null): string {
  const introPrefix = content.match(/^\s*(?:\*\*|__)?\s*(?:intro|indledning)\s*(?:\*\*|__)?\s*(?:[:\-–—]\s*|\s+)/i);
  if (!introPrefix) return content;
  const afterIntro = content.slice(introPrefix[0].length);
  const doubleNl = afterIntro.indexOf('\n\n');
  const introText = (doubleNl >= 0 ? afterIntro.slice(0, doubleNl) : afterIntro)
    .replace(/^\s*(?:\*\*|__)?\s*/, '')
    .trim();
  let body = doubleNl >= 0 ? afterIntro.slice(doubleNl + 2).trim() : '';
  if (!body) return content;
  const lines = body.split('\n');
  const kept: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (/^\*\*Undertitel\*\*:?\s*.+$/i.test(t) || /^Undertitel\s*:\s*.+$/i.test(t)) continue;
    if (extractedTitle && t === extractedTitle.trim()) continue;
    kept.push(line);
  }
  body = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (introText.length > 30 && body.slice(0, introText.length + 50).replace(/\s+/g, ' ').includes(introText.slice(0, 80).replace(/\s+/g, ' '))) {
    const bodyFirstParagraphEnd = body.indexOf('\n\n');
    const firstParagraph = bodyFirstParagraphEnd >= 0 ? body.slice(0, bodyFirstParagraphEnd) : body;
    const introNorm = introText.slice(0, 120).replace(/\s+/g, ' ').trim();
    const firstNorm = firstParagraph.slice(0, 120).replace(/\s+/g, ' ').trim();
    if (introNorm.length > 40 && (firstNorm.includes(introNorm.slice(0, 60)) || introNorm.includes(firstNorm.slice(0, 60)))) {
      body = (bodyFirstParagraphEnd >= 0 ? body.slice(bodyFirstParagraphEnd + 2) : '').trim();
    }
  }
  return `${introPrefix[0]}${introText}\n\n${body}`.trim();
}

function deriveFallbackTitleSubtitle(text: string): { title: string | null; subtitle: string | null } {
  const lines = (text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^(?:\*\*|__)?\s*(intro|indledning|undertitel|subtitle|arbejdstitel|titel|stjerner)\s*(?:\*\*|__)?(?:\s*[:\-–—]|\s+)/i.test(l));

  if (lines.length === 0) return { title: null, subtitle: null };

  // Prefer markdown heading if present.
  const heading = lines.find((l) => /^#\s+/.test(l));
  const headingText = heading ? heading.replace(/^#\s+/, '').trim() : null;

  const pickTitle = (headingText || lines[0] || '').replace(/^["'“”]|["'“”]$/g, '').trim();
  const title = pickTitle.length >= 6 && pickTitle.length <= 120 ? pickTitle : null;

  const subtitleCandidate = lines.find((l, idx) => idx > 0 && l !== pickTitle && l.length >= 12 && l.length <= 180);
  const subtitle = subtitleCandidate ? subtitleCandidate.replace(/^["'“”]|["'“”]$/g, '').trim() : null;

  return { title, subtitle };
}

function extractIntroFromContent(text: string): string | null {
  const t = (text || '').trim();
  if (!t) return null;
  const m = t.match(/^\s*(?:\*\*|__)?\s*(?:intro|indledning)\s*(?:\*\*|__)?\s*(?:[:\-–—]\s*|\s+)([\s\S]+?)(?:\n{2,}|$)/i);
  if (!m) return null;
  const introRaw = (m[1] || '')
    .replace(/^(?:\*\*|__)?\s*(?:intro|indledning)\s*(?:\*\*|__)?\s*/i, '')
    .replace(/^\*+\s*/, '')
    .trim();
  const intro = stripEditorialMarkers(introRaw).replace(/\s+/g, ' ').trim();
  return intro || null;
}

function countWords(text: string): number {
  return (text || '').trim().split(/\s+/).filter(Boolean).length;
}

function deriveSlug(input: string): string {
  return (input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}+/gu, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function cleanForSeo(text: string): string {
  return (text || '')
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/`/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSeoFields(args: { title?: string | null; subtitle?: string | null; intro?: string | null; content?: string }): { seoTitle?: string; seoDescription?: string } {
  const title = cleanForSeo(args.title || '');
  const subtitle = cleanForSeo(args.subtitle || '');
  const intro = cleanForSeo(args.intro || '');
  const content = cleanForSeo(args.content || '');

  let seoTitle = title;
  if (subtitle && seoTitle.length < 52) seoTitle = `${seoTitle} – ${subtitle}`;
  if (seoTitle.length > 60) seoTitle = seoTitle.slice(0, 57).trimEnd() + '...';

  const base = intro || subtitle || content;
  const seoDescription = base ? base.slice(0, 157).trimEnd() + (base.length > 157 ? '...' : '') : '';
  return {
    seoTitle: seoTitle || undefined,
    seoDescription: seoDescription || undefined,
  };
}

function deriveIntroFromFirstParagraph(text: string): string | null {
  const raw = (text || '').trim();
  if (!raw) return null;
  const firstParagraph = raw.split(/\n{2,}/).map((x) => x.trim()).find(Boolean) || '';
  const cleaned = cleanForSeo(firstParagraph);
  if (!cleaned) return null;
  // Conservative bounds to avoid grabbing tiny fragments or giant blocks.
  if (cleaned.length < 45 || cleaned.length > 450) return null;
  return cleaned;
}

function normalizeContentWithIntro(content: string, intro: string | null): string {
  if (!content) return content;
  if (!intro) return content;
  const hasIntroLabel = /^\s*(?:\*\*|__)?\s*(?:intro|indledning)\s*(?:\*\*|__)?\s*(?:[:\-–—]\s*|\s+)/i.test(content);
  if (hasIntroLabel) return content;

  const parts = content.split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
  if (parts.length === 0) return `Intro: ${intro}`;

  const first = cleanForSeo(parts[0] || '');
  const introNorm = cleanForSeo(intro);
  const remainder = first === introNorm ? parts.slice(1).join('\n\n').trim() : parts.join('\n\n').trim();

  return remainder ? `Intro: ${intro}\n\n${remainder}` : `Intro: ${intro}`;
}

function getTargetMinWords(articleContext: Record<string, unknown>): number {
  const section = String(articleContext?.section || articleContext?.category || '').toLowerCase();
  const topics = Array.isArray(articleContext?.topicsSelected) ? articleContext.topicsSelected.map((x) => String(x).toLowerCase()) : [];
  const tags = Array.isArray(articleContext?.tags) ? articleContext.tags.map((x) => String(x).toLowerCase()) : [];
  const hay = [section, ...topics, ...tags].join(' ');
  if (/film|serie/.test(hay)) return 900;
  if (/koncert|musik/.test(hay)) return 700;
  return 900;
}

function extractArticleUpdate(responseText: string, userRating?: number): Record<string, any> | null {
  const t = responseText.trim();
  if (!t) return null;
  const { value: extractedTitle, content: contentWithoutTitleLine } = extractTopLabeledLine(t, 'title');
  const { value: extractedSubtitle, content: contentWithoutSubtitle } = extractTopLabeledLine(contentWithoutTitleLine, 'subtitle');
  const introMatch = contentWithoutSubtitle.match(/^(?:intro|indledning)\s*[:\-–—]\s*/i);
  const looksLikeArticle =
    !!introMatch ||
    /(?:intro|indledning)\s*[:\-–—]/i.test(contentWithoutSubtitle) ||
    !!extractedTitle ||
    !!extractedSubtitle ||
    contentWithoutSubtitle.length > 200 ||
    /\n\n/.test(contentWithoutSubtitle);
  if (!looksLikeArticle) return null;
  let finalContent = contentWithoutSubtitle;
  if (typeof userRating === 'number' && userRating >= 1 && userRating <= 6) {
    finalContent = applyRatingToContent(finalContent, userRating);
  }
  finalContent = stripWordCountLine(finalContent);
  finalContent = stripEditorialMarkers(finalContent);
  const fallback = deriveFallbackTitleSubtitle(finalContent);
  const resolvedTitle = extractedTitle || fallback.title;
  const resolvedSubtitle = extractedSubtitle || fallback.subtitle;
  const resolvedIntro = extractIntroFromContent(finalContent) || deriveIntroFromFirstParagraph(finalContent);
  finalContent = normalizeContentWithIntro(finalContent, resolvedIntro);
  finalContent = cleanDuplicateIntroAndMetaFromBody(finalContent, resolvedTitle || null);
  finalContent = stripEditorialMarkers(finalContent);
  const wc = countWords(finalContent);
  const rt = wc ? Math.ceil(wc / 200) : 0;
  const excerpt = cleanForSeo((resolvedIntro || finalContent.split(/\n{2,}/).map((x) => x.trim()).find(Boolean) || '').slice(0, 220).trim());
  const seo = buildSeoFields({
    title: resolvedTitle,
    subtitle: resolvedSubtitle,
    intro: resolvedIntro,
    content: finalContent,
  });
  const update: Record<string, any> = {
    content: finalContent,
    wordCount: wc,
    readTime: rt,
  };
  if (resolvedTitle) update.title = resolvedTitle;
  if (resolvedSubtitle) update.subtitle = resolvedSubtitle;
  if (resolvedIntro) update.intro = resolvedIntro;
  if (resolvedTitle) {
    update.slug = deriveSlug(resolvedTitle);
    update.seoTitle = seo.seoTitle || cleanForSeo(resolvedTitle).slice(0, 60);
  }
  if (excerpt) update.excerpt = excerpt;
  if (seo.seoDescription) update.seoDescription = seo.seoDescription;
  return update;
}

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      message,
      articleData = {},
      chatHistory = [],
      notes = '',
      authorTOV = '',
      authorName = '',
      clientRequestId,
    } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        createErrorResponse('message er påkrævet', {
          statusCode: 400,
          errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
        }),
        { status: 400 }
      );
    }

    if (!openai) {
      return NextResponse.json(
        createErrorResponse('OpenAI API key ikke konfigureret. Sæt OPENAI_API_KEY.', {
          statusCode: 500,
          errorCode: ErrorCode.MISSING_API_KEY,
        }),
        { status: 500 }
      );
    }

    if (clientRequestId && typeof clientRequestId === 'string') {
      initProgress(clientRequestId, PROGRESS_STEPS);
      updateProgressStep(clientRequestId, 'prepare', 'active');
    }

    const systemPrompt = buildSystemPrompt(authorTOV, authorName, articleData, notes);
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
    ];
    for (const m of chatHistory) {
      const role = m.role === 'user' ? 'user' : 'assistant';
      const content = typeof m.content === 'string' ? m.content : String(m.content ?? '');
      if (content) messages.push({ role, content });
    }
    messages.push({ role: 'user', content: message.trim() });

    if (clientRequestId) {
      updateProgressStep(clientRequestId, 'prepare', 'completed');
      updateProgressStep(clientRequestId, 'web-search', 'skipped');
      updateProgressStep(clientRequestId, 'advanced-research', 'skipped');
      updateProgressStep(clientRequestId, 'generation', 'active');
    }

    const completion = await openai.chat.completions.create({
      model: config.openai.model || 'gpt-4o-mini',
      messages,
      temperature: 0.7,
      max_tokens: 4096,
    });

    const responseText = completion.choices[0]?.message?.content?.trim() ?? '';
    if (!responseText) {
      if (clientRequestId) completeProgress(clientRequestId);
      return NextResponse.json(
        createErrorResponse('Ingen tekst returneret fra modellen', {
          statusCode: 500,
          errorCode: ErrorCode.OPENAI_ERROR,
        }),
        { status: 500 }
      );
    }

    if (clientRequestId) {
      updateProgressStep(clientRequestId, 'generation', 'completed');
      updateProgressStep(clientRequestId, 'quality', 'skipped');
      updateProgressStep(clientRequestId, 'format', 'completed');
      completeProgress(clientRequestId);
    }

    const userRating = typeof articleData?.rating === 'number' ? articleData.rating : undefined;
    let finalResponseText = responseText;
    let articleUpdate = extractArticleUpdate(finalResponseText, userRating) ?? undefined;

    // One expansion pass to enforce practical minimum article length.
    if (articleUpdate?.content) {
      const minWords = getTargetMinWords(articleData || {});
      const wc = countWords(articleUpdate.content);
      if (wc > 0 && wc < minWords) {
        try {
          const expansion = await openai.chat.completions.create({
            model: config.openai.model || 'gpt-4o-mini',
            temperature: 0.5,
            max_tokens: 4096,
            messages: [
              {
                role: 'system',
                content:
                  `${systemPrompt}\n\nDu er redaktør. Udvid artiklen til korrekt længde uden at ændre hovedvinkel, TOV eller redaktionel retning. Returnér i formatet: Arbejdstitel, Undertitel, Intro, tom linje, brødtekst.`,
              },
              {
                role: 'user',
                content:
                  `Udvid følgende artikel til mindst ${minWords} ord.\n` +
                  'Behold titel, undertitel og intro konsistent, men gør brødteksten dybere og mere detaljeret.\n\n' +
                  finalResponseText,
              },
            ],
          });
          const expanded = expansion.choices[0]?.message?.content?.trim();
          if (expanded) {
            finalResponseText = expanded;
            articleUpdate = extractArticleUpdate(finalResponseText, userRating) ?? articleUpdate;
          }
        } catch (expErr) {
          console.warn('[ai-chat] expansion pass failed:', expErr);
        }
      }
    }

    return NextResponse.json({
      response: finalResponseText,
      ...(articleUpdate && Object.keys(articleUpdate).length > 0 ? { articleUpdate } : {}),
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error('[ai-chat]', error);
    return NextResponse.json(
      createErrorResponse(error.message, {
        statusCode: 500,
        errorCode: ErrorCode.OPENAI_ERROR,
        details: 'Ukendt fejl',
      }),
      { status: 500 }
    );
  }
}
