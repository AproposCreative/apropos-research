/**
 * Design-tokens for layout-test-blokken i nyhedsbrevet (magasin-rækker).
 * Justér værdierne her for at ændre udseendet i alle udsendelser.
 */
export type LayoutLabDesignTokens = {
  thumbPx: number;
  titleFontPx: number;
  subtitleFontPx: number;
  starGlyphPx: number;
  /** Ensartet lodret afstand mellem titel → undertitel → stjerner → (luft) → CTA */
  stackGapPx: number;
  ctaFontPx: number;
  ctaPadVertPx: number;
  ctaPadHorzPx: number;
  thumbBorderRadiusPx: number;
};

export const LAYOUT_LAB_DEFAULTS: LayoutLabDesignTokens = {
  thumbPx: 140,
  titleFontPx: 17,
  subtitleFontPx: 14,
  starGlyphPx: 14,
  stackGapPx: 12,
  ctaFontPx: 13,
  ctaPadVertPx: 9,
  ctaPadHorzPx: 20,
  thumbBorderRadiusPx: 8,
};
