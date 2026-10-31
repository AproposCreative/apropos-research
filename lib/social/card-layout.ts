export const DEFAULT_TITLE_SUBTITLE_GAP = 24;
export const MAX_TITLE_SUBTITLE_GAP = 120;
export const TITLE_SUBTITLE_GAP_STEP = 8;

/** Canvas pixels, independent of font size and the preview's display width. */
export function titleSubtitleGap(value?: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(MAX_TITLE_SUBTITLE_GAP, Math.max(0, Math.round(value)))
    : DEFAULT_TITLE_SUBTITLE_GAP;
}
