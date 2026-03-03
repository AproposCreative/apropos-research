import type { SocialCardData, SocialCardSize } from './SocialCardCanvas';
import { DIMENSIONS } from './SocialCardCanvas';

const CTA_OFFSET = 10;
const CTA_FONT_SIZE_SQUARE = 32.547;
const CTA_LINE_HEIGHT_MULTIPLIER = 1.4;
const CTA_PADDING_Y_SQUARE = 22;
const CTA_PADDING_X_SQUARE = 66.143;

const SQUARE_LOGO_TOP = 60;
const SQUARE_LOGO_W = 150;
const SQUARE_LOGO_H = 60;
const SQUARE_LOGO_TO_EYEBROW_GAP = 14.922;
const SQUARE_H1_FONT_SIZE = 80;
const SQUARE_H1_LINE_HEIGHT = 1.2;
const SQUARE_H1_PADDING_H = 65;
const LOGO_SRC = '/images/AproposMagazineLogoInstagram.svg';
const STAR_FILLED_SRC = '/images/star-filled.svg';
const STAR_OUTLINE_SRC = '/images/star-outline.svg';
const STAR_SIZE = 23;
const STAR_GAP = 9.33;
const EYEBROW_BADGE_GAP = 20;

/** 2x export for skarp billedkvalitet (mindre pixelering) */
const EXPORT_SCALE = 2;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = url;
  });
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = 3
): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    const metrics = ctx.measureText(next);
    if (metrics.width > maxWidth && current) {
      lines.push(current);
      if (lines.length >= maxLines) return lines;
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function loadLogoImage(): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Logo only available in browser'));
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Logo load failed'));
    img.src = window.location.origin + LOGO_SRC;
  });
}

function loadStarImages(): Promise<{ filled: HTMLImageElement; outline: HTMLImageElement }> {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  return Promise.all([
    loadImage(base + STAR_FILLED_SRC),
    loadImage(base + STAR_OUTLINE_SRC),
  ]).then(([filled, outline]) => ({ filled, outline }));
}

async function ensureDesignFontsLoaded() {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  await Promise.allSettled([
    document.fonts.load('400 80px Amiri'),
    document.fonts.load('italic 400 48px Amiri'),
    document.fonts.load('500 32px Inter'),
  ]);
}

export async function exportCardToPng(
  data: SocialCardData,
  size: SocialCardSize
): Promise<string> {
  const { width, height } = DIMENSIONS[size];
  const canvas = document.createElement('canvas');
  canvas.width = width * EXPORT_SCALE;
  canvas.height = height * EXPORT_SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2d not available');
  ctx.scale(EXPORT_SCALE, EXPORT_SCALE);
  await ensureDesignFontsLoaded();

  const isSquare = size === 'square';
  const padding = isSquare ? SQUARE_H1_PADDING_H : size === 'story' ? 48 : 56;
  const titleSize = isSquare ? SQUARE_H1_FONT_SIZE : size === 'story' ? 38 : 44;
  const titleLineHeight = isSquare ? SQUARE_H1_LINE_HEIGHT : 1.2;
  const excerptSize = isSquare ? 48 : size === 'story' ? 36 : 40;
  const categorySize = isSquare ? 35 : size === 'story' ? 28 : 28;
  const logoMainSize = size === 'story' ? 22 : 26;
  const logoSubSize = size === 'story' ? 14 : 16;
  const maxTextWidth = width - padding * 2;
  const ctaScale = size === 'square' ? 1 : 0.58;
  const ctaFontSize = CTA_FONT_SIZE_SQUARE * ctaScale;
  const ctaPaddingY = CTA_PADDING_Y_SQUARE * ctaScale;
  const ctaPaddingX = CTA_PADDING_X_SQUARE * ctaScale;
  const textBlockTopGap = isSquare ? 0 : 4;
  const headerToTextGap = isSquare ? 26 : 22;
  const textBottomGap = isSquare ? 20 : 14;
  const minImageH = isSquare ? 380 : 220;

  // ---- Base: white background for box 1 + box 2 ----
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  let y: number;

  if (isSquare) {
    // Logo: 150×60, centreret, 60px fra top
    try {
      const logoImg = await loadLogoImage();
      const logoX = (width - SQUARE_LOGO_W) / 2;
      ctx.drawImage(logoImg, logoX, SQUARE_LOGO_TOP, SQUARE_LOGO_W, SQUARE_LOGO_H);
    } catch {
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 26px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('APROPOS', width / 2, SQUARE_LOGO_TOP + 20);
      ctx.font = 'italic 16px Amiri, Georgia, serif';
      ctx.fillText('Magazine', width / 2, SQUARE_LOGO_TOP + 44);
    }
    // Eyebrow y is canvas baseline, not top. Baseline = top + fontSize.
    y = SQUARE_LOGO_TOP + SQUARE_LOGO_H + SQUARE_LOGO_TO_EYEBROW_GAP + categorySize;
  } else {
    ctx.fillStyle = '#000000';
    ctx.font = `bold ${logoMainSize}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    const logoY = padding + logoMainSize + 4;
    ctx.fillText('APROPOS', width / 2, logoY);
    ctx.font = `italic ${logoSubSize}px Amiri, Georgia, serif`;
    ctx.fillText('Magazine', width / 2, logoY + logoSubSize + 4);
    y = logoY + logoSubSize + 24;
  }

  // Øjenbryn: kun udfyldte felter + stjerner (ingen fallback-tekst)
  const eyebrowParts =
    (data.eyebrowLabels && data.eyebrowLabels.length > 0)
      ? data.eyebrowLabels.filter(Boolean)
      : [data.category, data.categorySecondary].filter(Boolean) as string[];
  const rating = data.rating ?? 0;
  ctx.font = `400 ${categorySize}px Amiri, Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#000000';
  const separatorWidth = ctx.measureText('|').width;
  const partsWidth = eyebrowParts.reduce((sum, part) => sum + ctx.measureText(part).width, 0);
  const separatorsBetweenParts = Math.max(eyebrowParts.length - 1, 0);
  const partsSeparatorsWidth = separatorsBetweenParts * separatorWidth;
  const partsGapWidth = separatorsBetweenParts * EYEBROW_BADGE_GAP;
  const starsWidth = rating > 0 ? 6 * STAR_SIZE + 5 * STAR_GAP : 0;
  const totalMetaWidth =
    partsWidth +
    partsSeparatorsWidth +
    partsGapWidth +
    (rating > 0
      ? (eyebrowParts.length > 0 ? separatorWidth + EYEBROW_BADGE_GAP : 0) + starsWidth
      : 0);
  const metaStartX = (width - totalMetaWidth) / 2;
  ctx.textAlign = 'left';
  let cursorX = metaStartX;
  for (let i = 0; i < eyebrowParts.length; i++) {
    const part = eyebrowParts[i];
    ctx.fillStyle = '#000000';
    ctx.fillText(part, cursorX, y);
    cursorX += ctx.measureText(part).width;
    if (i < eyebrowParts.length - 1) {
      cursorX += EYEBROW_BADGE_GAP / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText('|', cursorX, y);
      cursorX += separatorWidth + EYEBROW_BADGE_GAP / 2;
    }
  }
  if (rating > 0) {
    const { filled, outline } = await loadStarImages();
    const starY = y - STAR_SIZE; // baseline-aligned: bottom of star at y
    let starX = cursorX;
    if (eyebrowParts.length > 0) {
      starX += EYEBROW_BADGE_GAP / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText('|', starX, y);
      starX += separatorWidth + EYEBROW_BADGE_GAP / 2;
      ctx.fillStyle = '#000000';
    }
    for (let i = 1; i <= 6; i++) {
      const img = i <= rating ? filled : outline;
      ctx.drawImage(img, starX, starY, STAR_SIZE, STAR_SIZE);
      starX += STAR_SIZE + STAR_GAP;
    }
  }
  ctx.textAlign = 'center';
  const eyebrowLineHeight = categorySize * 1.4;
  // Convert from current baseline to block bottom before adding next gaps.
  y += Math.round(eyebrowLineHeight - categorySize);
  y += headerToTextGap;
  y += textBlockTopGap;
  y += Math.round(titleSize * 0.75);

  // Headline – Amiri Regular (400), 80px, line-height 120% (square)
  ctx.font = `${isSquare ? '400' : '600'} ${titleSize}px Amiri, Georgia, serif`;
  ctx.fillStyle = '#000000';
  const titleLines = wrapText(ctx, data.title || 'Overskrift', maxTextWidth, 3);
  const lineHeightPx = titleSize * (typeof titleLineHeight === 'number' ? titleLineHeight : 1.2);
  for (const line of titleLines) {
    ctx.fillText(line, width / 2, y);
    y += lineHeightPx;
  }

  // Byline (under H1): #353535, Amiri italic 57px, 400, line-height 120%
  if (data.excerpt) {
    y += isSquare ? -10 : -10;
    ctx.font = `400 italic ${excerptSize}px Amiri, Georgia, serif`;
    ctx.fillStyle = '#353535';
    ctx.textAlign = 'center';
    const excerptLines = wrapText(ctx, data.excerpt, maxTextWidth, 2);
    const bylineLineHeight = excerptSize * 1.2;
    for (const line of excerptLines) {
      ctx.fillText(line, width / 2, y);
      y += bylineLineHeight;
    }
  }
  y += textBottomGap;

  // Box 3 starts after text and grows/shrinks naturally
  const imageTop = Math.min(Math.round(y), height - minImageH);
  const imageH = height - imageTop;

  // ---- Box 3: image ----
  if (data.imageUrl) {
    try {
      const img = await loadImage(data.imageUrl);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      drawImageCover(ctx, img, 0, imageTop, width, imageH);
    } catch {
      drawPlaceholder(ctx, 0, imageTop, width, imageH);
    }
  } else {
    drawPlaceholder(ctx, 0, imageTop, width, imageH);
  }

  // ---- CTA follows image and overlaps top edge ----
  const ctaText = 'Læs nu på Apropos Magazine';
  ctx.font = `500 ${ctaFontSize}px Inter, Arial, sans-serif`;
  const ctaTextWidth = ctx.measureText(ctaText).width;
  const ctaLineHeight = ctaFontSize * CTA_LINE_HEIGHT_MULTIPLIER;
  const ctaW = Math.min(width - 64, ctaTextWidth + ctaPaddingX * 2);
  const ctaX = (width - ctaW) / 2;
  const ctaH = ctaLineHeight + ctaPaddingY * 2;
  const ctaY = imageTop + CTA_OFFSET - ctaH / 2;
  const radius = ctaH / 2;
  ctx.fillStyle = '#000000';
  roundRect(ctx, ctaX, ctaY, ctaW, ctaH, radius);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `500 ${ctaFontSize}px Inter, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ctaText, width / 2, ctaY + ctaH / 2);
  ctx.textBaseline = 'alphabetic';

  return canvas.toDataURL('image/png');
}

/** Eksporter kort som JPEG (fx til Instagram, som kun accepterer JPEG). */
export async function exportCardToJpeg(
  data: SocialCardData,
  size: SocialCardSize,
  quality = 0.96
): Promise<string> {
  const pngDataUrl = await exportCardToPng(data, size);
  const canvas = document.createElement('canvas');
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas 2d not available'));
      ctx.drawImage(img, 0, 0);
      resolve();
    };
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = pngDataUrl;
  });
  return canvas.toDataURL('image/jpeg', quality);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawPlaceholder(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, '#d4d4d4');
  g.addColorStop(1, '#a3a3a3');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number
) {
  const imgAspect = img.width / img.height;
  const frameAspect = dw / dh;
  let sx = 0;
  let sy = 0;
  let sw = img.width;
  let sh = img.height;

  if (imgAspect > frameAspect) {
    sw = img.height * frameAspect;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / frameAspect;
    sy = (img.height - sh) / 2;
  }

  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}
