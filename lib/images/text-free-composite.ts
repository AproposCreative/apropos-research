import sharp from 'sharp';
import { textFreeRegions } from './text-free-policy';

/** The model cannot redraw a face or scene outside the detected lettering masks.
 * Original is the base layer; only feathered text regions use AI reconstruction. */
export async function compositeTextRemoval(original: Buffer, edited: Buffer, regions: unknown) {
  const normalized = await sharp(original, { limitInputPixels: 30_000_000 }).rotate().png().toBuffer();
  const { width, height } = await sharp(normalized).metadata();
  if (!width || !height) throw new Error('image_text_dimensions');
  const rects = textFreeRegions(regions).map(r => {
    const pad = Math.max(3, Math.round(width / 200));
    const x = Math.max(0, Math.floor(r.x * width / 1000) - pad), y = Math.max(0, Math.floor(r.y * height / 1000) - pad);
    const right = Math.min(width, Math.ceil((r.x + r.width) * width / 1000) + pad), bottom = Math.min(height, Math.ceil((r.y + r.height) * height / 1000) + pad);
    return `<rect x="${x}" y="${y}" width="${right - x}" height="${bottom - y}" fill="white"/>`;
  }).join('');
  const mask = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${rects}</svg>`)).blur(1.5).png().toBuffer();
  const patch = await sharp(edited).resize(width, height, { fit: 'fill' }).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  return sharp(normalized).composite([{ input: patch, blend: 'over' }]).png().toBuffer();
}
