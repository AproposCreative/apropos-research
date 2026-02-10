import type { SocialCardData, SocialCardSize } from './SocialCardCanvas';
import { DIMENSIONS } from './SocialCardCanvas';

const TOP_SECTION_RATIO = 0.55;
const CTA_HEIGHT = 56;

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

export async function exportCardToPng(
  data: SocialCardData,
  size: SocialCardSize
): Promise<string> {
  const { width, height } = DIMENSIONS[size];
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2d not available');

  const topH = Math.round(height * TOP_SECTION_RATIO);
  const ctaY = topH;
  const imageTop = ctaY + CTA_HEIGHT;
  const imageH = height - imageTop;
  const padding = size === 'og' ? 48 : 56;

  const titleSize = size === 'og' ? 38 : 44;
  const excerptSize = size === 'og' ? 18 : 20;
  const categorySize = size === 'og' ? 15 : 17;
  const logoMainSize = size === 'og' ? 22 : 26;
  const logoSubSize = size === 'og' ? 14 : 16;
  const maxTextWidth = width - padding * 2;

  // ---- Top section: white ----
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, imageTop);

  // Logo: APROPOS (sans) + Magazine (Amiri italic) – sort
  ctx.fillStyle = '#000000';
  ctx.font = `bold ${logoMainSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  const logoY = padding + logoMainSize + 4;
  ctx.fillText('APROPOS', width / 2, logoY);
  ctx.font = `italic ${logoSubSize}px Amiri, Georgia, serif`;
  ctx.fillText('Magazine', width / 2, logoY + logoSubSize + 4);

  let y = logoY + logoSubSize + 24;

  // Category and stars – Amiri, sort
  const categoryLabel = [data.category, data.categorySecondary].filter(Boolean).join(' | ') || 'Artikel';
  ctx.font = `${categorySize}px Amiri, Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#000000';
  const rating = data.rating ?? 0;
  const starW = 16;
  const gap = 8;
  const categoryWidth = ctx.measureText(categoryLabel).width;
  const starsWidth = rating > 0 ? 5 * starW + gap : 0;
  const totalMetaWidth = categoryWidth + (rating > 0 ? gap + starsWidth : 0);
  const metaStartX = (width - totalMetaWidth) / 2;
  ctx.textAlign = 'left';
  ctx.fillText(categoryLabel, metaStartX, y);
  if (rating > 0) {
    for (let i = 1; i <= 5; i++) {
      ctx.fillStyle = i <= rating ? '#000000' : 'rgba(0,0,0,0.3)';
      ctx.fillText('★', metaStartX + categoryWidth + gap + (i - 1) * starW, y);
    }
  }
  ctx.textAlign = 'center';
  y += 28;

  // Headline – Amiri, sort
  ctx.font = `600 ${titleSize}px Amiri, Georgia, serif`;
  ctx.fillStyle = '#000000';
  const titleLines = wrapText(ctx, data.title || 'Overskrift', maxTextWidth, 3);
  ctx.textAlign = 'center';
  for (const line of titleLines) {
    ctx.fillText(line, width / 2, y);
    y += titleSize * 1.25;
  }

  // Blurb (italic serif, sort)
  if (data.excerpt) {
    y += 8;
    ctx.font = `italic ${excerptSize}px Amiri, Georgia, serif`;
    ctx.fillStyle = '#000000';
    const excerptLines = wrapText(ctx, data.excerpt, maxTextWidth, 2);
    for (const line of excerptLines) {
      ctx.fillText(line, width / 2, y);
      y += excerptSize * 1.4;
    }
  }

  // ---- CTA button (sort, pill-form) ----
  const ctaW = Math.min(width * 0.7, 520);
  const ctaX = (width - ctaW) / 2;
  const ctaH = CTA_HEIGHT - 8;
  const radius = ctaH / 2; // pill = fuld radius
  ctx.fillStyle = '#000000';
  roundRect(ctx, ctaX, ctaY + 4, ctaW, ctaH, radius);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `${size === 'og' ? 15 : 17}px Amiri, Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.fillText('Læs nu på Apropos Magazine', width / 2, ctaY + CTA_HEIGHT / 2 + 6);

  // ---- Bottom: image ----
  if (data.imageUrl) {
    try {
      const img = await loadImage(data.imageUrl);
      ctx.drawImage(img, 0, imageTop, width, imageH);
    } catch {
      drawPlaceholder(ctx, 0, imageTop, width, imageH);
    }
  } else {
    drawPlaceholder(ctx, 0, imageTop, width, imageH);
  }

  return canvas.toDataURL('image/png');
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
