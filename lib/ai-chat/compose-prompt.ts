import type { PromptSegment } from '@/lib/ai-chat/prompt-segment-types';

// Keep reusable instructions before article-specific data. Preserve all toggles
// and relative order within each group; no instruction is silently removed.
const stableSegments = new Set(['base', 'author-tov', 'author-name', 'structure', 'anti-plagiarism', 'output-format']);

function segmentEnabled(seg: PromptSegment, toggles: Record<string, boolean> | undefined): boolean {
  if (!seg.included) return false;
  if (seg.locked) return true;
  if (toggles && Object.prototype.hasOwnProperty.call(toggles, seg.id)) {
    return toggles[seg.id] !== false;
  }
  return true;
}

export function composeSystemPrompt(
  segments: PromptSegment[],
  toggles: Record<string, boolean> | undefined,
  webSegment: PromptSegment | null
): string {
  const enabled = segments.filter((s) => s.kind === 'system' && segmentEnabled(s, toggles));
  const systemParts = [...enabled.filter(s => stableSegments.has(s.id)),
    ...enabled.filter(s => !stableSegments.has(s.id))].map(s => s.content);
  let out = systemParts.join('\n');
  if (webSegment && webSegment.included && segmentEnabled(webSegment, toggles)) {
    out += webSegment.content;
  }
  return out;
}
