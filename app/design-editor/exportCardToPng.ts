import type { SocialCardData, SocialCardSize } from './SocialCardCanvas';
import { DIMENSIONS } from './SocialCardCanvas';

const TOP_SECTION_RATIO = 0.55;
const CTA_HEIGHT = 56;

const SQUARE_LOGO_TOP = 60;
const SQUARE_LOGO_W = 150;
const SQUARE_LOGO_H = 60;
const SQUARE_GAP_EYEBROW_H1 = 32;
const SQUARE_H1_FONT_SIZE = 80;
const SQUARE_H1_LINE_HEIGHT = 1.2;
const SQUARE_H1_PADDING_H = 65;
const LOGO_SRC = '/images/AproposMagazineLogoInstagram.svg';
const STAR_FILLED_SRC = '/images/star-filled.svg';
const STAR_OUTLINE_SRC = '/images/star-outline.svg';
const STAR_SIZE = 23;
const STAR_GAP = 9.33;

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

  const topH = Math.round(height * TOP_SECTION_RATIO);
  const ctaY = topH;
  const imageTop = ctaY;
  const imageH = height - ctaY;

  const isSquare = size === 'square';
  const padding = isSquare ? SQUARE_H1_PADDING_H : size === 'og' ? 48 : 56;
  const titleSize = isSquare ? SQUARE_H1_FONT_SIZE : size === 'og' ? 38 : 44;
  const titleLineHeight = isSquare ? SQUARE_H1_LINE_HEIGHT : 1.2;
  const excerptSize = isSquare ? 57 : size === 'og' ? 36 : 40;
  const categorySize = isSquare ? 35 : size === 'og' ? 28 : 28;
  const logoMainSize = size === 'og' ? 22 : 26;
  const logoSubSize = size === 'og' ? 14 : 16;
  const maxTextWidth = width - padding * 2;

  // ---- Top section: hvid kun op til CTA (Figma: CTA overlapper billedet) ----
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, ctaY);

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
    y = SQUARE_LOGO_TOP + SQUARE_LOGO_H + SQUARE_GAP_EYEBROW_H1;
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
  const categoryLabel =
    (data.eyebrowLabels && data.eyebrowLabels.length > 0)
      ? data.eyebrowLabels.join(' | ')
      : [data.category, data.categorySecondary].filter(Boolean).join(' | ') || '';
  const rating = data.rating ?? 0;
  ctx.font = `400 ${categorySize}px Amiri, Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#000000';
  const gap = 8;
  const categoryWidth = ctx.measureText(categoryLabel).width;
  const starsWidth = rating > 0 ? 6 * STAR_SIZE + 5 * STAR_GAP : 0;
  const totalMetaWidth = categoryWidth + (rating > 0 ? gap + starsWidth : 0);
  const metaStartX = (width - totalMetaWidth) / 2;
  ctx.textAlign = 'left';
  if (categoryLabel) ctx.fillText(categoryLabel, metaStartX, y);
  if (rating > 0) {
    const { filled, outline } = await loadStarImages();
    const starY = y - STAR_SIZE; // baseline-aligned: bottom of star at y
    let starX = metaStartX + categoryWidth + gap;
    for (let i = 1; i <= 6; i++) {
      const img = i <= rating ? filled : outline;
      ctx.drawImage(img, starX, starY, STAR_SIZE, STAR_SIZE);
      starX += STAR_SIZE + STAR_GAP;
    }
  }
  ctx.textAlign = 'center';
  const eyebrowLineHeight = categorySize * 1.4;
  y += Math.round(eyebrowLineHeight);
  if (isSquare) {
    y += SQUARE_GAP_EYEBROW_H1; // 32px gap between eyebrow bottom and H1 top
    y += Math.round(titleSize * 0.75); // baseline offset so H1 top sits 32px under eyebrow
  }

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
    y += 8;
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

  // ---- Billede først (så CTA kan ligge ovenpå som i Figma) ----
  if (data.imageUrl) {
    try {
      const img = await loadImage(data.imageUrl);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, imageTop, width, imageH);
    } catch {
      drawPlaceholder(ctx, 0, imageTop, width, imageH);
    }
  } else {
    drawPlaceholder(ctx, 0, imageTop, width, imageH);
  }

  // ---- CTA button oven på billedet (sort, pill-form) ----
  const ctaW = Math.min(width * 0.7, 520);
  const ctaX = (width - ctaW) / 2;
  const ctaH = CTA_HEIGHT - 8;
  const radius = ctaH / 2;
  ctx.fillStyle = '#000000';
  roundRect(ctx, ctaX, ctaY + 4, ctaW, ctaH, radius);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `${size === 'og' ? 15 : 17}px Amiri, Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.fillText('Læs nu på Apropos Magazine', width / 2, ctaY + CTA_HEIGHT / 2 + 6);

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
