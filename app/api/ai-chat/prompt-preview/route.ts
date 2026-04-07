import { NextRequest, NextResponse } from 'next/server';
import {
  OPENING_STRATEGIES,
  buildPromptSegments,
  composeSystemPrompt,
  buildWebSearchSegment,
  hasResearchContext,
} from '@/lib/ai-chat/build-system-prompt';
import { buildPromptFlowGraph } from '@/lib/ai-chat/prompt-flow-graph';
import { getResearch } from '@/lib/research/service';
import { createErrorResponse, ErrorCode } from '@/lib/api/types';

/**
 * Preview prompt pipeline for Prompt Architect UI (no chat message required).
 * Uses first opening strategy for stable preview; live web search when hasResearchContext.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      articleData = {},
      notes = '',
      authorTOV = '',
      authorName = '',
      message = '',
      promptModuleToggles,
    } = body;

    const toggles =
      promptModuleToggles && typeof promptModuleToggles === 'object' && !Array.isArray(promptModuleToggles)
        ? (promptModuleToggles as Record<string, boolean>)
        : undefined;

    const article = articleData as Record<string, unknown>;

    const segments = buildPromptSegments(authorTOV, authorName, article, notes, {
      openingStrategyOverride: OPENING_STRATEGIES[0],
    });

    const hasResearch = hasResearchContext(article);
    let webSegment = null as ReturnType<typeof buildWebSearchSegment>;

    if (hasResearch) {
      const baseQuery =
        (article?.researchSelected as { title?: string } | undefined)?.title ||
        article?.title ||
        message ||
        'preview';
      const queryParts = [String(baseQuery)];
      const searchPlatform = article?.platform || article?.streaming_service;
      const searchCategory = article?.category || article?.section;
      if (searchPlatform) queryParts.push(String(searchPlatform));
      if (searchCategory && typeof searchCategory === 'string' && !/generel/i.test(searchCategory)) {
        queryParts.push(searchCategory);
      }
      const searchQuery = queryParts.join(' ');
      try {
        const researchResult = await getResearch(searchQuery, { maxResults: 3 });
        webSegment = buildWebSearchSegment(researchResult.contextText);
      } catch (e) {
        console.warn('[prompt-preview] getResearch failed', e);
        webSegment = buildWebSearchSegment(undefined);
      }
    }

    const { nodes, edges } = buildPromptFlowGraph(segments, webSegment);
    const composedFull = composeSystemPrompt(segments, undefined, webSegment);
    const composedWithToggles = composeSystemPrompt(segments, toggles, webSegment);

    return NextResponse.json({
      nodes,
      edges,
      segments: segments.map((s) => ({
        id: s.id,
        labelDa: s.labelDa,
        kind: s.kind,
        included: s.included,
        locked: s.locked,
        charCount: s.content.length,
      })),
      segmentContents: Object.fromEntries(segments.map((s) => [s.id, s.content])),
      webContent: webSegment?.content ?? null,
      web: webSegment
        ? {
            id: webSegment.id,
            labelDa: webSegment.labelDa,
            included: webSegment.included,
            charCount: webSegment.content.length,
          }
        : null,
      hasResearchContext: hasResearch,
      totalCharCount: composedFull.length,
      effectiveCharCount: composedWithToggles.length,
    });
  } catch (err) {
    console.error('[prompt-preview]', err);
    return NextResponse.json(
      createErrorResponse('Kunne ikke bygge prompt-preview', {
        statusCode: 500,
        errorCode: ErrorCode.OPENAI_ERROR,
      }),
      { status: 500 }
    );
  }
}
