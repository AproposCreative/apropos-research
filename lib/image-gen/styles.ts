export const APROPOS_IMAGE_STYLE_VERSION = 'apropos-2026-09-14-v1';
export type AproposImageStyle = 'expressive' | 'minimal';
export function aproposIllustrationStyle(style: AproposImageStyle): string {
  if (!['expressive', 'minimal'].includes(style)) throw new Error('image_gen_style_invalid');
  const common = 'Original editorial illustration, one coherent scene, one clear focal subject, very few objects, ample negative space. No collage, montage, split panels, lettering, logos, photographic fragments, photorealism or 3D. Wide composition with central safe crop. A conceptual illustration, never documentary evidence or a fabricated photograph of an event.';
  return common + (style === 'minimal'
    ? ' Minimal classic ink drawing: economical irregular black lines, warm cream paper, at most one restrained accent colour. Cool, simple, understated.'
    : ' Expressive Apropos colour style: bold slightly irregular black ink outlines, flat saturated cobalt blue, hot pink and yellow shapes, warm cream paper, fine matte screenprint grain. Confident and cheeky, not childish. No gradients or realistic shine. Keep composition simple despite strong colour.');
}
