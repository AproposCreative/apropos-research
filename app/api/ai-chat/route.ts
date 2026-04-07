import { NextRequest, NextResponse } from 'next/server';
import type OpenAI from 'openai';
import { APIError } from 'openai';
import { getOpenAIClient, models } from '@/lib/openai';
import { initProgress, updateProgressStep, completeProgress } from '@/lib/ai-chat-progress-store';
import { createErrorResponse, ErrorCode } from '@/lib/api/types';
import { getResearch } from '@/lib/research/service';
import {
  buildPromptSegments,
  composeSystemPrompt,
  buildWebSearchSegment,
  hasResearchContext,
} from '@/lib/ai-chat/build-system-prompt';

const openai = getOpenAIClient();

/** User-visible message; maps OpenAI HTTP statuses to actionable Danish text. */
function formatAiChatError(err: unknown): string {
  if (err instanceof APIError) {
    const nested =
      err.error &&
      typeof err.error === 'object' &&
      err.error !== null &&
      'message' in err.error &&
      typeof (err.error as { message?: unknown }).message === 'string'
        ? (err.error as { message: string }).message
        : '';
    const partA = String(err.message || '').trim();
    const partB = String(nested || '').trim();
    const unique = partA && partB && partA === partB ? [partA] : [partA, partB].filter(Boolean);
    const msg = unique.join(' — ') || 'OpenAI API fejl';
    if (err.status === 429) {
      return `OpenAI rate limit eller manglende kvote (429). ${msg} Tjek billing på platform.openai.com.`;
    }
    if (err.status === 401) {
      return `OpenAI autentificering fejlede (401). Tjek OPENAI_API_KEY. ${msg}`;
    }
    if (err.status === 400) {
      return `OpenAI afviste forespørgslen (400): ${msg}`;
    }
    return msg;
  }
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  return String(err);
}

function buildProgressSteps(hasResearch: boolean) {
  const steps = [
    { id: 'prepare', label: 'Analyserer prompt og setup' },
  ];
  if (hasResearch) {
    steps.push({ id: 'web-search', label: 'Søger efter fakta og kilder' });
  }
  steps.push({ id: 'generation', label: 'Genererer artikeludkast' });
  steps.push({ id: 'quality', label: 'Kører kvalitetskontrol' });
  steps.push({ id: 'format', label: 'Formatterer svar til UI' });
  return steps;
}


async function runQuickQualityCheck(openaiClient: ReturnType<typeof getOpenAIClient>, articleText: string): Promise<string[]> {
  if (!openaiClient || !articleText || articleText.length < 200) return [];
  try {
    const response = await openaiClient.chat.completions.create({
      model: models.default,
      temperature: 0.2,
      max_completion_tokens: 512,
      messages: [
        {
          role: 'system',
          content: 'Du er kvalitetskontrollør. Gennemgå artiklen for: 1) Faktuelle udsagn der bør tjekkes, 2) Gentagelser, 3) Tone-problemer. Returnér KUN en JSON-array af korte advarsler på dansk (maks 5). Returnér [] hvis artiklen er god.',
        },
        { role: 'user', content: articleText.slice(0, 3000) },
      ],
    });
    const raw = response.choices[0]?.message?.content?.trim() || '[]';
    const match = raw.match(/\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) : [];
  } catch {
    return [];
  }
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

/**
 * When the model follows OUTPUT-FORMAT with an explicit **Brødtekst:** (or Body:) line,
 * split so CMS `intro` = intro block and `content` = only the brødtekst (no duplicate intro).
 */
function splitByBroedtekstMarker(text: string): { beforeMarker: string; body: string } | null {
  const t = (text || '').trim();
  if (!t) return null;
  const re = /(?:^|[\r\n]+)\s*(?:\*\*|__)?\s*(?:brødtekst|body)\s*(?:\*\*|__)?\s*[:\-–—]\s*/im;
  const m = re.exec(t);
  if (!m) return null;
  const body = t.slice(m.index + m[0].length).trim();
  const beforeMarker = t.slice(0, m.index).trim();
  if (!body) return null;
  return { beforeMarker, body };
}

/** Strip leading Intro:/Indledning: from the block before Brødtekst (first label only). */
function peelIntroLabelFromBlock(block: string): string {
  return (block || '')
    .replace(/^\s*(?:\*\*|__)?\s*(?:intro|indledning)\s*(?:\*\*|__)?\s*[:\-–—]\s*/i, '')
    .trim();
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
  if (introText.length > 30) {
    const bodyFirstParagraphEnd = body.indexOf('\n\n');
    const firstParagraph = bodyFirstParagraphEnd >= 0 ? body.slice(0, bodyFirstParagraphEnd) : body;
    const introNorm = introText.replace(/\s+/g, ' ').trim();
    const firstNorm = firstParagraph.replace(/\s+/g, ' ').trim();
    const isSubstring = introNorm.length > 40 && (firstNorm.includes(introNorm.slice(0, 60)) || introNorm.includes(firstNorm.slice(0, 60)));
    const isFuzzyDuplicate = wordOverlapRatio(introNorm, firstNorm) > 0.55;
    if (isSubstring || isFuzzyDuplicate) {
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

function wordOverlapRatio(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let overlap = 0;
  for (const w of wordsA) if (wordsB.has(w)) overlap++;
  return overlap / Math.min(wordsA.size, wordsB.size);
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
  const isDuplicate = first === introNorm || wordOverlapRatio(first, introNorm) > 0.55;
  const remainder = isDuplicate ? parts.slice(1).join('\n\n').trim() : parts.join('\n\n').trim();

  return remainder ? `Intro: ${intro}\n\n${remainder}` : `Intro: ${intro}`;
}

function getTargetMinWords(articleContext: Record<string, unknown>): number {
  const section = String(articleContext?.section || articleContext?.category || '').toLowerCase();
  const template = String(articleContext?.template || '').toLowerCase();
  const topics = Array.isArray(articleContext?.topicsSelected) ? articleContext.topicsSelected.map((x) => String(x).toLowerCase()) : [];
  const tags = Array.isArray(articleContext?.tags) ? articleContext.tags.map((x) => String(x).toLowerCase()) : [];
  const hay = [section, template, ...topics, ...tags].join(' ');
  if (/nyhed|news|kort/.test(hay)) return 600;
  if (/koncert|musik|live/.test(hay)) return 700;
  if (/film|serie|tv|streaming/.test(hay)) return 900;
  if (/kultur|feature|essay|interview|portræt|portr.t/.test(hay)) return 1200;
  return 900;
}

function extractArticleUpdate(responseText: string, userRating?: number): Record<string, any> | null {
  const t = responseText.trim();
  if (!t) return null;
  const { value: extractedTitle, content: contentWithoutTitleLine } = extractTopLabeledLine(t, 'title');
  const { value: extractedSubtitle, content: contentWithoutSubtitle } = extractTopLabeledLine(contentWithoutTitleLine, 'subtitle');
  const brodSplit = splitByBroedtekstMarker(contentWithoutSubtitle);
  const introMatch = contentWithoutSubtitle.match(/^(?:intro|indledning)\s*[:\-–—]\s*/i);
  const looksLikeArticle =
    !!introMatch ||
    !!brodSplit ||
    /(?:intro|indledning)\s*[:\-–—]/i.test(contentWithoutSubtitle) ||
    !!extractedTitle ||
    !!extractedSubtitle ||
    contentWithoutSubtitle.length > 200 ||
    /\n\n/.test(contentWithoutSubtitle);
  if (!looksLikeArticle) return null;

  let finalContent: string;
  let resolvedIntro: string | null;

  if (brodSplit) {
    const peeled = peelIntroLabelFromBlock(brodSplit.beforeMarker);
    resolvedIntro =
      peeled ||
      extractIntroFromContent(brodSplit.beforeMarker) ||
      deriveIntroFromFirstParagraph(brodSplit.beforeMarker) ||
      null;
    finalContent = brodSplit.body;
    if (typeof userRating === 'number' && userRating >= 1 && userRating <= 6) {
      finalContent = applyRatingToContent(finalContent, userRating);
    }
    finalContent = stripWordCountLine(finalContent);
    finalContent = stripEditorialMarkers(finalContent);
  } else {
    finalContent = contentWithoutSubtitle;
    if (typeof userRating === 'number' && userRating >= 1 && userRating <= 6) {
      finalContent = applyRatingToContent(finalContent, userRating);
    }
    finalContent = stripWordCountLine(finalContent);
    finalContent = stripEditorialMarkers(finalContent);
    const fallbackPre = deriveFallbackTitleSubtitle(finalContent);
    const resolvedTitlePre = extractedTitle || fallbackPre.title;
    resolvedIntro = extractIntroFromContent(finalContent) || deriveIntroFromFirstParagraph(finalContent);
    finalContent = normalizeContentWithIntro(finalContent, resolvedIntro);
    finalContent = cleanDuplicateIntroAndMetaFromBody(finalContent, resolvedTitlePre || null);
    finalContent = stripEditorialMarkers(finalContent);
  }

  const fallback = deriveFallbackTitleSubtitle(finalContent);
  const resolvedTitle = extractedTitle || fallback.title;
  const resolvedSubtitle = extractedSubtitle || fallback.subtitle;
  if (brodSplit && !resolvedIntro) {
    resolvedIntro = deriveIntroFromFirstParagraph(brodSplit.beforeMarker);
  }

  const wc =
    countWords([resolvedIntro, finalContent].filter(Boolean).join('\n\n')) ||
    countWords(finalContent);
  const rt = wc ? Math.ceil(wc / 200) : 0;
  const excerpt = cleanForSeo(
    (resolvedIntro || finalContent.split(/\n{2,}/).map((x) => x.trim()).find(Boolean) || '').slice(0, 220).trim(),
  );
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
      promptModuleToggles,
    } = body;

    const toggles =
      promptModuleToggles && typeof promptModuleToggles === 'object' && !Array.isArray(promptModuleToggles)
        ? (promptModuleToggles as Record<string, boolean>)
        : undefined;

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

    const hasResearch = hasResearchContext(articleData as Record<string, unknown>);
    const progressSteps = buildProgressSteps(hasResearch);

    if (clientRequestId && typeof clientRequestId === 'string') {
      initProgress(clientRequestId, progressSteps);
      updateProgressStep(clientRequestId, 'prepare', 'active');
    }

    const promptSegments = buildPromptSegments(authorTOV, authorName, articleData as Record<string, unknown>, notes);

    // --- Step: Web Search (when research context is available) ---
    let researchResult: Awaited<ReturnType<typeof getResearch>> | undefined;
    let webSegment = null as ReturnType<typeof buildWebSearchSegment>;
    if (hasResearch) {
      if (clientRequestId) {
        updateProgressStep(clientRequestId, 'prepare', 'completed');
        updateProgressStep(clientRequestId, 'web-search', 'active');
      }
      const baseQuery = articleData?.researchSelected?.title || articleData?.title || message;
      const queryParts = [String(baseQuery)];
      const searchPlatform = articleData?.platform || articleData?.streaming_service;
      const searchCategory = articleData?.category || articleData?.section;
      if (searchPlatform) queryParts.push(String(searchPlatform));
      if (searchCategory && typeof searchCategory === 'string' && !/generel/i.test(searchCategory)) queryParts.push(searchCategory);
      const searchQuery = queryParts.join(' ');
      researchResult = await getResearch(searchQuery, { maxResults: 3 });
      webSegment = buildWebSearchSegment(researchResult.contextText);
      if (clientRequestId) {
        updateProgressStep(clientRequestId, 'web-search', 'completed');
      }
    } else if (clientRequestId) {
      updateProgressStep(clientRequestId, 'prepare', 'completed');
    }

    let systemPrompt = composeSystemPrompt(promptSegments, toggles, webSegment);

    // --- Step: Generation ---
    if (clientRequestId) {
      updateProgressStep(clientRequestId, 'generation', 'active');
    }

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
    ];
    for (const m of chatHistory) {
      const role = m.role === 'user' ? 'user' : 'assistant';
      const content = typeof m.content === 'string' ? m.content : String(m.content ?? '');
      if (content) messages.push({ role, content });
    }
    messages.push({ role: 'user', content: message.trim() });

    const completion = await openai.chat.completions.create({
      model: models.default,
      messages,
      temperature: 0.7,
      max_completion_tokens: 4096,
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
    }

    const userRating = typeof articleData?.rating === 'number' ? articleData.rating : undefined;
    let finalResponseText = responseText;
    let articleUpdate = extractArticleUpdate(finalResponseText, userRating) ?? undefined;

    // Expansion pass to enforce practical minimum article length.
    if (articleUpdate?.content) {
      const minWords = getTargetMinWords(articleData || {});
      const wc = countWords(articleUpdate.content);
      if (wc > 0 && wc < minWords) {
        try {
          const expansion = await openai.chat.completions.create({
            model: models.default,
            temperature: 0.5,
            max_completion_tokens: 4096,
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

    // --- Step: Quality Check ---
    let warnings: string[] = [];
    if (articleUpdate?.content && clientRequestId) {
      updateProgressStep(clientRequestId, 'quality', 'active');
      warnings = await runQuickQualityCheck(openai, articleUpdate.content);
      updateProgressStep(clientRequestId, 'quality', 'completed');
    } else if (clientRequestId) {
      updateProgressStep(clientRequestId, 'quality', 'completed');
    }

    if (clientRequestId) {
      updateProgressStep(clientRequestId, 'format', 'completed');
      completeProgress(clientRequestId);
    }

    return NextResponse.json({
      response: finalResponseText,
      ...(articleUpdate && Object.keys(articleUpdate).length > 0 ? { articleUpdate } : {}),
      ...(warnings.length > 0 ? { warnings } : {}),
      ...(researchResult?.sources?.length ? { researchSources: researchResult.sources } : {}),
      ...(researchResult?.debug ? { researchDebug: researchResult.debug } : {}),
    });
  } catch (err) {
    const message = formatAiChatError(err);
    console.error('[ai-chat]', err);
    const status =
      err instanceof APIError && typeof err.status === 'number' && err.status >= 400 && err.status < 600
        ? err.status
        : 500;
    return NextResponse.json(
      createErrorResponse(message || 'Ukendt serverfejl', {
        statusCode: status,
        errorCode: ErrorCode.OPENAI_ERROR,
        details: err instanceof APIError ? `OpenAI HTTP ${err.status ?? '?'}` : 'Ukendt fejl',
      }),
      { status }
    );
  }
}
