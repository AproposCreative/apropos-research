import type { PromptSegment } from '@/lib/ai-chat/prompt-segment-types';

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
  const systemParts = segments.filter((s) => s.kind === 'system' && segmentEnabled(s, toggles)).map((s) => s.content);
  let out = systemParts.join('\n');
  if (webSegment && webSegment.included && segmentEnabled(webSegment, toggles)) {
    out += webSegment.content;
  }
  return out;
}
