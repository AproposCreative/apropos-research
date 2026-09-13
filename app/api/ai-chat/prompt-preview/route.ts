import { NextRequest, NextResponse } from 'next/server';
import {
  OPENING_STRATEGIES,
  buildPromptSegments,
  composeSystemPrompt,
  buildWebSearchSegment,
  hasResearchContext,
} from '@/lib/ai-chat/build-system-prompt';
import { buildPromptFlowGraph } from '@/lib/ai-chat/prompt-flow-graph';
import { createErrorResponse, ErrorCode } from '@/lib/api/types';

/**
 * Preview prompt pipeline for Prompt Architect UI (no chat message required).
 * Uses first opening strategy for stable preview. Never starts paid research.
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
    // Existing article research is included by buildPromptSegments. Fresh web
    // evidence belongs to the actual Writer run, not opening this inspector.
    const webSegment = null as ReturnType<typeof buildWebSearchSegment>;

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
      researchStatus: hasResearch ? 'deferred_to_writer' : 'not_requested',
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
