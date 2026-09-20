import sharp from 'sharp';
import { textFreeRegions } from './text-free-policy';

/** The model cannot redraw a face or scene outside the detected lettering masks.
 * Original is the base layer; only feathered text regions use AI reconstruction. */
export async function compositeTextRemoval(original: Buffer, edited: Buffer, regions: unknown) {
  const normalized = await sharp(original, { limitInputPixels: 30_000_000 }).rotate().png().toBuffer();
  const { width, height } = await sharp(normalized).metadata();
  if (!width || !height) throw new Error('image_text_dimensions');
  const boxes = textFreeRegions(regions).map(r => {
    const pad = Math.max(6, Math.round(width / 100));
    const x = Math.max(0, Math.floor(r.x * width / 1000) - pad), y = Math.max(0, Math.floor(r.y * height / 1000) - pad);
    const right = Math.min(width, Math.ceil((r.x + r.width) * width / 1000) + pad), bottom = Math.min(height, Math.ceil((r.y + r.height) * height / 1000) + pad);
    return { x, y, right, bottom };
  });
  // Merge touching masks so a neighbouring title cannot contaminate an edge sample.
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.x <= b.right && b.x <= a.right && a.y <= b.bottom && b.y <= a.bottom) {
      boxes[i] = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom) };
      boxes.splice(j, 1); i = -1; break;
    }
  }
  const source = await sharp(normalized).ensureAlpha().raw().toBuffer();
  const generated = await sharp(edited).resize(width, height, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
  const corrected = Buffer.from(generated);
  // A boundary-conditioned harmonic colour correction matches the AI's
  // reconstructed texture to the original gradient. No hard rectangular seams,
  // and no second image generation just to fix the model's global colour drift.
  for (const b of boxes) {
    const w = b.right - b.x, h = b.bottom - b.y;
    for (let c = 0; c < 3; c++) {
      const delta = (x: number, y: number) => source[(y * width + x) * 4 + c] - generated[(y * width + x) * 4 + c];
      const smoothEdge = (length: number, at: (n: number) => number) => Array.from({ length }, (_, n) => {
        let sum = 0, count = 0;
        for (let k = Math.max(0, n - 5); k <= Math.min(length - 1, n + 5); k++) { sum += at(k); count++; }
        return sum / count;
      });
      const top = smoothEdge(w, n => delta(b.x + n, b.y)), bottom = smoothEdge(w, n => delta(b.x + n, b.bottom - 1));
      const left = smoothEdge(h, n => delta(b.x, b.y + n)), right = smoothEdge(h, n => delta(b.right - 1, b.y + n));
      const tl = (top[0] + left[0]) / 2, tr = (top[w - 1] + right[0]) / 2;
      const bl = (bottom[0] + left[h - 1]) / 2, br = (bottom[w - 1] + right[h - 1]) / 2;
      const correction = new Float32Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const u = x / (w - 1), v = y / (h - 1);
        const bilinear = (1-u)*(1-v)*tl + u*(1-v)*tr + (1-u)*v*bl + u*v*br;
        const offset = (1-v)*top[x] + v*bottom[x] + (1-u)*left[y] + u*right[y] - bilinear;
        correction[y*w+x] = offset;
      }
      // Relax the boundary interpolation rather than projecting a clothing
      // edge as an artificial horizontal stripe through the entire background.
      for (let iteration = 0; iteration < 600; iteration++) {
        let change = 0;
        for (let y = 1; y < h-1; y++) for (let x = 1; x < w-1; x++) {
          const p = y*w+x;
          const difference = 1.9 * ((correction[p-1] + correction[p+1] + correction[p-w] + correction[p+w]) / 4 - correction[p]);
          correction[p] += difference; change = Math.max(change, Math.abs(difference));
        }
        if (change < 0.02) break;
      }
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const index = ((b.y+y)*width+b.x+x)*4+c;
        corrected[index] = Math.max(0, Math.min(255, Math.round(generated[index] + correction[y*w+x])));
      }
    }
  }
  const rects = boxes.map(b => `<rect x="${b.x+4}" y="${b.y+4}" width="${b.right-b.x-8}" height="${b.bottom-b.y-8}" fill="white"/>`).join('');
  const mask = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${rects}</svg>`)).blur(1.5).png().toBuffer();
  const patch = await sharp(corrected, { raw: { width, height, channels: 4 } }).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  return sharp(normalized).composite([{ input: patch, blend: 'over' }]).png().toBuffer();
}
