import type { PromptSegment, PromptSegmentKind } from '@/lib/ai-chat/prompt-segment-types';

export type PromptFlowNode = {
  id: string;
  type: 'promptModule';
  position: { x: number; y: number };
  data: {
    labelDa: string;
    included: boolean;
    locked?: boolean;
    kind: PromptSegmentKind;
    charCount: number;
    excerpt: string;
  };
};

export type PromptFlowEdge = {
  id: string;
  source: string;
  target: string;
};

/**
 * Linear chain matching compose order: all system segments in build order, then web-append.
 */
export function buildPromptFlowGraph(
  segments: PromptSegment[],
  webSegment: PromptSegment | null,
  opts?: { excerptLen?: number; rowGap?: number }
): { nodes: PromptFlowNode[]; edges: PromptFlowEdge[] } {
  const excerptLen = opts?.excerptLen ?? 420;
  const rowGap = opts?.rowGap ?? 108;
  const chain: PromptSegment[] = [...segments];
  if (webSegment) chain.push(webSegment);

  const nodes: PromptFlowNode[] = chain.map((s, i) => ({
    id: s.id,
    type: 'promptModule',
    position: { x: 32, y: i * rowGap },
    data: {
      labelDa: s.labelDa,
      included: s.included,
      locked: s.locked,
      kind: s.kind,
      charCount: s.content.length,
      excerpt:
        s.content.length > excerptLen ? `${s.content.slice(0, excerptLen)}…` : s.content,
    },
  }));

  const edges: PromptFlowEdge[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push({
      id: `e_${nodes[i].id}_to_${nodes[i + 1].id}`,
      source: nodes[i].id,
      target: nodes[i + 1].id,
    });
  }
  return { nodes, edges };
}
