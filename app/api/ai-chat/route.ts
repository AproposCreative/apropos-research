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

function buildSystemPrompt(authorTOV: string, authorName: string, articleContext: Record<string, unknown>): string {
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
  const title = (articleContext?.title || articleContext?.previewTitle) as string | undefined;
  const category = (articleContext?.category || articleContext?.section) as string | undefined;
  const rating = typeof articleContext?.rating === 'number' && articleContext.rating >= 1 && articleContext.rating <= 6 ? articleContext.rating : undefined;
  if (title?.trim()) parts.push(`\n**Arbejdstitel/emne:** ${title.trim()}`);
  if (category?.trim()) parts.push(`**Section/kategori:** ${category.trim()}`);
  if (rating != null) {
    parts.push(`\n**Brugeren har valgt stjernebedømmelse: ${rating} ud af 6.** Du SKAL bruge præcis dette antal stjerner i anmeldelsen. Skriv fx "Stjerner: ${'⭐'.repeat(rating)}" eller "X ud af 6 stjerner" med dette tal – ikke et andet antal.`);
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
  if (draftPrompt && draftPrompt.length > 20 && !research?.title) {
    parts.push(`\n**Instruktioner fra artikelopsætning:**\n${draftPrompt.trim()}`);
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

/** Extract title text from first line "Arbejdstitel: X" or "**Arbejdstitel: X**". Returns [titleText, contentWithoutThatLine]. */
function extractTitleAndStripLine(text: string): { title: string | null; content: string } {
  const t = text.trim();
  const boldMatch = t.match(/^\*\*Arbejdstitel\s*:\s*([^\n]*?)\*\*\s*\n?/i);
  if (boldMatch) {
    return { title: boldMatch[1].trim() || null, content: t.slice(boldMatch[0].length).trim() };
  }
  const plainMatch = t.match(/^Arbejdstitel\s*:\s*([^\n]+)\n?/im);
  if (plainMatch) {
    return { title: plainMatch[1].trim() || null, content: t.slice(plainMatch[0].length).trim() };
  }
  return { title: null, content: t };
}

/** Strip "Undertitel: X" from start of text and return [subtitleText, rest]. */
function extractSubtitleAndStripLine(text: string): { subtitle: string | null; content: string } {
  const t = text.trim();
  const match = t.match(/^Undertitel\s*:\s*([^\n]+)\n?/im);
  if (match) {
    return { subtitle: match[1].trim() || null, content: t.slice(match[0].length).trim() };
  }
  return { subtitle: null, content: t };
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

/** Remove duplicate intro and title/undertitel lines from body so they only appear once (in Intro box / metadata). */
function cleanDuplicateIntroAndMetaFromBody(content: string, extractedTitle: string | null): string {
  const introPrefix = content.match(/^intro\s*:\s*/i);
  if (!introPrefix) return content;
  const afterIntro = content.slice(introPrefix[0].length);
  const doubleNl = afterIntro.indexOf('\n\n');
  const introText = (doubleNl >= 0 ? afterIntro.slice(0, doubleNl) : afterIntro).trim();
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

function extractArticleUpdate(responseText: string, userRating?: number): Record<string, string> | null {
  const t = responseText.trim();
  if (!t) return null;
  const { title: extractedTitle, content: contentWithoutTitleLine } = extractTitleAndStripLine(t);
  const { subtitle: extractedSubtitle, content: contentWithoutSubtitle } = extractSubtitleAndStripLine(contentWithoutTitleLine);
  const introMatch = contentWithoutSubtitle.match(/^intro\s*:\s*/i);
  const looksLikeArticle = introMatch || /intro\s*:/i.test(contentWithoutSubtitle) || contentWithoutSubtitle.length > 200 || /\n\n/.test(contentWithoutSubtitle);
  if (!looksLikeArticle) return null;
  let finalContent = contentWithoutSubtitle;
  if (typeof userRating === 'number' && userRating >= 1 && userRating <= 6) {
    finalContent = applyRatingToContent(finalContent, userRating);
  }
  finalContent = stripWordCountLine(finalContent);
  finalContent = cleanDuplicateIntroAndMetaFromBody(finalContent, extractedTitle || null);
  const update: Record<string, string> = { content: finalContent };
  if (extractedTitle) update.title = extractedTitle;
  if (extractedSubtitle) update.subtitle = extractedSubtitle;
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

    const systemPrompt = buildSystemPrompt(authorTOV, authorName, articleData);
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
    const articleUpdate = extractArticleUpdate(responseText, userRating) ?? undefined;

    return NextResponse.json({
      response: responseText,
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
