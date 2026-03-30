import type { SocialCardData, SocialCardSize } from './SocialCardCanvas';
import { DIMENSIONS } from './SocialCardCanvas';

const CTA_OFFSET = 10;
const CTA_FONT_SIZE_SQUARE = 32.547;
const CTA_LINE_HEIGHT_MULTIPLIER = 1.4;
const CTA_PADDING_Y_SQUARE = 24;
const CTA_PADDING_X_SQUARE = 78;
const CTA_WIDTH_STORY = 910;
const CTA_PADDING_Y_STORY = 19.2;
const CTA_PADDING_X_STORY = 50.4;
const CTA_FONT_SIZE_STORY = 52.8;
const STORY_META_TO_CTA_GAP = 40;

const SQUARE_LOGO_TOP = 60;
const SQUARE_LOGO_W = 150;
const SQUARE_LOGO_H = 60;
const SQUARE_LOGO_TO_EYEBROW_GAP = 14.922;
const SQUARE_H1_FONT_SIZE = 80;
const SQUARE_H1_LINE_HEIGHT = 1.2;
const SQUARE_H1_PADDING_H = 100;
const STORY_LOGO_TOP = 170;
const STORY_LOGO_W = 259.67;
const STORY_LOGO_H = 103.999;
const STORY_H1_FONT_SIZE = 100;
const STORY_H1_PADDING_H = 40;
const STORY_EYEBROW_FONT_SIZE = 42;
const STORY_TITLE_MAX_WIDTH = 992;
const STORY_BYLINE_MAX_WIDTH = 1000;
const LOGO_SRC = '/images/AproposMagazineLogoInstagram.svg';
const STAR_FILLED_SRC = '/images/star-filled.svg';
const STAR_OUTLINE_SRC = '/images/star-outline.svg';
const STAR_SIZE = 23;
const STAR_GAP = 9.33;
const STORY_STAR_SIZE = 42;
const STORY_STAR_GAP = 19.562;
const EYEBROW_BADGE_GAP = 20;
const STORY_BOTTOM_META_FONT_SIZE = 30;
const STORY_BOTTOM_META_ROW_GAP = 23.367;
const STORY_BOTTOM_META_BADGE_PAD_Y = 5.842;
const BYLINE_FONT_SIZE_SQUARE = 48;
const BYLINE_FONT_SIZE_STORY = 60;
const BYLINE_LINE_HEIGHT = 1.2;
const BYLINE_COLOR = '#353535';
const STORY_BYLINE_LINE_HEIGHT = 1.3;
const STORY_BYLINE_COLOR = '#000000';
const DEFAULT_AMIRI_FONT_FAMILY = '"Amiri", Georgia, serif';

/**
 * Instagram native max is 1080px wide – no benefit to sending larger.
 * Scale 1 keeps file size ~3-4x smaller → much faster Firebase upload.
 */
const EXPORT_SCALE = 1;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = url;
  });
}

function isWebflowReferenceId(value: string): boolean {
  return /^[a-f0-9]{24}$/i.test(value.trim());
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

function trimDanglingHeadlineEnding(text: string): string {
  const trailing = new Set(['med', 'et', 'en', 'at', 'på', 'for', 'og', 'i', 'til', 'som', 'der', 'når', 'hvor']);
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  while (words.length > 2) {
    const last = words[words.length - 1].replace(/[.,;:!?…]+$/g, '').toLowerCase();
    if (!trailing.has(last)) break;
    words.pop();
  }
  return words.join(' ').trim();
}

function loadLogoImage(): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Logo only available in browser'));
      return;
    }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = async () => {
      try {
        // Fallback path: fetch file and render as blob URL.
        const response = await fetch(window.location.origin + LOGO_SRC, { cache: 'no-store' });
        if (!response.ok) throw new Error('Logo fetch failed');
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const fallbackImg = new Image();
        fallbackImg.onload = () => {
          URL.revokeObjectURL(blobUrl);
          resolve(fallbackImg);
        };
        fallbackImg.onerror = () => {
          URL.revokeObjectURL(blobUrl);
          reject(new Error('Logo load failed'));
        };
        fallbackImg.src = blobUrl;
      } catch {
        reject(new Error('Logo load failed'));
      }
    };
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

async function ensureDesignFontsLoaded(amiriFontFamily: string) {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  await Promise.allSettled([
    document.fonts.load(`400 80px ${amiriFontFamily}`),
    document.fonts.load(`400 100px ${amiriFontFamily}`),
    document.fonts.load(`italic 400 48px ${amiriFontFamily}`),
    document.fonts.load(`italic 400 60px ${amiriFontFamily}`),
    document.fonts.load('500 32px Inter'),
    document.fonts.ready,
  ]);
}

export async function exportCardToPng(
  data: SocialCardData,
  size: SocialCardSize,
  opts?: { amiriFontFamily?: string }
): Promise<string> {
  const { width, height } = DIMENSIONS[size];
  const amiriFontFamily = opts?.amiriFontFamily?.trim() || DEFAULT_AMIRI_FONT_FAMILY;
  const canvas = document.createElement('canvas');
  canvas.width = width * EXPORT_SCALE;
  canvas.height = height * EXPORT_SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2d not available');
  ctx.scale(EXPORT_SCALE, EXPORT_SCALE);
  await ensureDesignFontsLoaded(amiriFontFamily);
  await renderCardToContext(ctx, data, size, width, height, amiriFontFamily);
  return canvas.toDataURL('image/png');
}

async function renderCardToContext(
  ctx: CanvasRenderingContext2D,
  data: SocialCardData,
  size: SocialCardSize,
  width: number,
  height: number,
  amiriFontFamily: string,
): Promise<void> {
  const isSquare = size === 'square';
  const isStory = size === 'story';
  const padding = isSquare ? SQUARE_H1_PADDING_H : isStory ? STORY_H1_PADDING_H : 56;
  const titleSize = isSquare ? SQUARE_H1_FONT_SIZE : isStory ? STORY_H1_FONT_SIZE : 44;
  const titleLineHeight = isSquare ? SQUARE_H1_LINE_HEIGHT : 1.2;
  const excerptSize = isSquare ? BYLINE_FONT_SIZE_SQUARE : isStory ? BYLINE_FONT_SIZE_STORY : 40;
  const categorySize = isSquare ? 35 : isStory ? STORY_EYEBROW_FONT_SIZE : 28;
  const logoMainSize = isStory ? 22 : 26;
  const logoSubSize = isStory ? 14 : 16;
  const maxTextWidth = isStory ? STORY_TITLE_MAX_WIDTH : width - padding * 2;
  const maxBylineWidth = isStory ? STORY_BYLINE_MAX_WIDTH : width - padding * 2;
  const ctaScale = size === 'square' ? 1 : isStory ? 0.72 : 0.58;
  const ctaFontSize = isStory ? CTA_FONT_SIZE_STORY : CTA_FONT_SIZE_SQUARE * ctaScale;
  const ctaPaddingY = isStory ? CTA_PADDING_Y_STORY : CTA_PADDING_Y_SQUARE * ctaScale;
  const ctaPaddingX = isStory ? CTA_PADDING_X_STORY : CTA_PADDING_X_SQUARE * ctaScale;
  const ctaLineHeight = ctaFontSize * CTA_LINE_HEIGHT_MULTIPLIER;
  const ctaH = ctaLineHeight + ctaPaddingY * 2;
  const textBlockTopGap = isSquare ? 0 : isStory ? 6 : 4;
  const headerToTextGap = isSquare ? 26 : isStory ? 26 : 22;
  const textBottomGap = isSquare ? 20 : isStory ? STORY_META_TO_CTA_GAP + ctaH / 2 - CTA_OFFSET : 14;
  // Keep Story vertical spacing stable by allowing image area to shrink.
  const minImageH = isSquare ? 380 : isStory ? 0 : 220;

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
      ctx.font = `italic 16px ${amiriFontFamily}`;
      ctx.fillText('Magazine', width / 2, SQUARE_LOGO_TOP + 44);
    }
    // Eyebrow y is canvas baseline, not top. Baseline = top + fontSize.
    y = SQUARE_LOGO_TOP + SQUARE_LOGO_H + SQUARE_LOGO_TO_EYEBROW_GAP + categorySize;
  } else if (isStory) {
    try {
      const logoImg = await loadLogoImage();
      const logoX = (width - STORY_LOGO_W) / 2;
      ctx.drawImage(logoImg, logoX, STORY_LOGO_TOP, STORY_LOGO_W, STORY_LOGO_H);
    } catch {
      ctx.fillStyle = '#000000';
      ctx.font = `bold ${logoMainSize}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      const logoY = STORY_LOGO_TOP + logoMainSize;
      ctx.fillText('APROPOS', width / 2, logoY);
      ctx.font = `italic ${logoSubSize}px ${amiriFontFamily}`;
      ctx.fillText('Magazine', width / 2, logoY + logoSubSize + 4);
    }
    y = STORY_LOGO_TOP + STORY_LOGO_H + 34 + categorySize;
  } else {
    ctx.fillStyle = '#000000';
    ctx.font = `bold ${logoMainSize}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    const logoY = padding + logoMainSize + 4;
    ctx.fillText('APROPOS', width / 2, logoY);
    ctx.font = `italic ${logoSubSize}px ${amiriFontFamily}`;
    ctx.fillText('Magazine', width / 2, logoY + logoSubSize + 4);
    y = logoY + logoSubSize + 24;
  }

  // Øjenbryn: kun udfyldte felter + stjerner (ingen fallback-tekst)
  const eyebrowParts =
    (data.eyebrowLabels && data.eyebrowLabels.length > 0)
      ? data.eyebrowLabels.filter((label) => !!label && !isWebflowReferenceId(label))
      : [data.category, data.categorySecondary]
          .filter((label): label is string => !!label && !isWebflowReferenceId(label));
  const topEyebrowParts = isStory ? eyebrowParts.slice(0, 2) : eyebrowParts;
  const bottomMetaParts = isStory
    ? (data.storyBottomMetaLabels?.filter((label) => !!label && !isWebflowReferenceId(label)) ?? [])
    : [];
  const rating = data.rating ?? 0;
  ctx.font = `400 ${categorySize}px ${amiriFontFamily}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#000000';
  const separatorWidth = ctx.measureText('|').width;
  const partsWidth = topEyebrowParts.reduce((sum, part) => sum + ctx.measureText(part).width, 0);
  const separatorsBetweenParts = Math.max(topEyebrowParts.length - 1, 0);
  const partsSeparatorsWidth = separatorsBetweenParts * separatorWidth;
  const partsGapWidth = separatorsBetweenParts * EYEBROW_BADGE_GAP;
  const starsWidth = !isStory && rating > 0 ? 6 * STAR_SIZE + 5 * STAR_GAP : 0;
  const totalMetaWidth =
    partsWidth +
    partsSeparatorsWidth +
    partsGapWidth +
    (!isStory && rating > 0
      ? (topEyebrowParts.length > 0 ? separatorWidth + EYEBROW_BADGE_GAP : 0) + starsWidth
      : 0);
  const metaStartX = (width - totalMetaWidth) / 2;
  ctx.textAlign = 'left';
  let cursorX = metaStartX;
  for (let i = 0; i < topEyebrowParts.length; i++) {
    const part = topEyebrowParts[i];
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
  if (!isStory && rating > 0) {
    const { filled, outline } = await loadStarImages();
    const starY = y - STAR_SIZE; // baseline-aligned: bottom of star at y
    let starX = cursorX;
    if (topEyebrowParts.length > 0) {
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

  // Headline – Amiri Regular (400) for both post and story
  ctx.font = `400 ${titleSize}px ${amiriFontFamily}`;
  ctx.fillStyle = '#000000';
  const titleLines = wrapText(ctx, trimDanglingHeadlineEnding(data.title || 'Overskrift'), maxTextWidth, 2);
  const lineHeightPx = titleSize * (typeof titleLineHeight === 'number' ? titleLineHeight : 1.2);
  for (const line of titleLines) {
    ctx.fillText(line, width / 2, y);
    y += lineHeightPx;
  }

  // Byline (under H1): #353535, Amiri italic 57px, 400, line-height 120%
  if (data.excerpt) {
    y += isSquare ? -10 : -10;
    ctx.font = `italic 400 ${excerptSize}px ${amiriFontFamily}`;
    ctx.fillStyle = isStory ? STORY_BYLINE_COLOR : BYLINE_COLOR;
    ctx.textAlign = 'center';
    const excerptLines = wrapText(ctx, data.excerpt, maxBylineWidth, isStory ? 3 : 2);
    const bylineLineHeight = excerptSize * (isStory ? STORY_BYLINE_LINE_HEIGHT : BYLINE_LINE_HEIGHT);
    for (const line of excerptLines) {
      ctx.fillText(line, width / 2, y);
      y += bylineLineHeight;
    }
  }
  if (isStory && rating > 0) {
    const { filled, outline } = await loadStarImages();
    y += 18;
    const storyStarsWidth = 6 * STORY_STAR_SIZE + 5 * STORY_STAR_GAP;
    let storyStarX = (width - storyStarsWidth) / 2;
    const storyStarY = y - STORY_STAR_SIZE;
    for (let i = 1; i <= 6; i++) {
      const img = i <= rating ? filled : outline;
      ctx.drawImage(img, storyStarX, storyStarY, STORY_STAR_SIZE, STORY_STAR_SIZE);
      storyStarX += STORY_STAR_SIZE + STORY_STAR_GAP;
    }
    y += STORY_STAR_SIZE + 18;
  }
  if (isStory && bottomMetaParts.length > 0) {
    ctx.fillStyle = '#000000';
    ctx.font = `400 ${STORY_BOTTOM_META_FONT_SIZE}px Inter, Arial, sans-serif`;
    const bottomSeparatorWidth = ctx.measureText('|').width;
    const leftBadgeWidth = ctx.measureText(bottomMetaParts[0]).width;
    const rightBadgeWidth = bottomMetaParts[1] ? ctx.measureText(bottomMetaParts[1]).width : 0;
    const leftBadgeTotal = leftBadgeWidth;
    const rightBadgeTotal = rightBadgeWidth;
    const hasSecond = !!bottomMetaParts[1];
    const bottomTotalWidth = hasSecond
      ? leftBadgeTotal + STORY_BOTTOM_META_ROW_GAP + bottomSeparatorWidth + STORY_BOTTOM_META_ROW_GAP + rightBadgeTotal
      : leftBadgeTotal;
    let bottomX = (width - bottomTotalWidth) / 2;
    ctx.textAlign = 'left';
    // Badge 1
    ctx.fillStyle = '#000000';
    y += STORY_BOTTOM_META_BADGE_PAD_Y;
    ctx.fillText(bottomMetaParts[0], bottomX, y);
    y -= STORY_BOTTOM_META_BADGE_PAD_Y;
    bottomX += leftBadgeTotal;
    if (hasSecond) {
      bottomX += STORY_BOTTOM_META_ROW_GAP;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText('|', bottomX, y);
      bottomX += bottomSeparatorWidth + STORY_BOTTOM_META_ROW_GAP;
      ctx.fillStyle = '#000000';
      y += STORY_BOTTOM_META_BADGE_PAD_Y;
      ctx.fillText(bottomMetaParts[1], bottomX, y);
      y -= STORY_BOTTOM_META_BADGE_PAD_Y;
    }
    ctx.textAlign = 'center';
    y += STORY_BOTTOM_META_FONT_SIZE * 1.4;
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
  const ctaW = isStory ? CTA_WIDTH_STORY : Math.min(width - 64, ctaTextWidth + ctaPaddingX * 2);
  const ctaX = (width - ctaW) / 2;
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
}

/**
 * Export card as JPEG Blob – uses canvas.toBlob() for zero-copy output.
 * Skips the old PNG→dataURL→Image→JPEG pipeline entirely.
 */
export async function exportCardToJpegBlob(
  data: SocialCardData,
  size: SocialCardSize,
  quality = 0.92,
  opts?: { amiriFontFamily?: string }
): Promise<Blob> {
  const { width, height } = DIMENSIONS[size];
  const amiriFontFamily = opts?.amiriFontFamily?.trim() || DEFAULT_AMIRI_FONT_FAMILY;
  const canvas = document.createElement('canvas');
  canvas.width = width * EXPORT_SCALE;
  canvas.height = height * EXPORT_SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2d not available');
  ctx.scale(EXPORT_SCALE, EXPORT_SCALE);
  await ensureDesignFontsLoaded(amiriFontFamily);

  await renderCardToContext(ctx, data, size, width, height, amiriFontFamily);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
      'image/jpeg',
      quality,
    );
  });
}

/** Legacy wrapper kept for PNG export / download button. */
export async function exportCardToJpeg(
  data: SocialCardData,
  size: SocialCardSize,
  quality = 0.92,
  opts?: { amiriFontFamily?: string }
): Promise<string> {
  const blob = await exportCardToJpegBlob(data, size, quality, opts);
  return URL.createObjectURL(blob);
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
