import fs from 'fs';
import path from 'path';

let cached: string | null | undefined;

/**
 * Indlejret PNG til nyhedsbrevslogo — virker i mail uden ekstern hosting.
 * (~7–8 KB fil → ~10 KB data-URI; under Gmail-clip-grænse.)
 */
export function getNewsletterLogoDataUri(): string {
  if (cached !== undefined) return cached;
  const file = path.join(process.cwd(), 'public/images/apropos-newsletter-logo.png');
  try {
    const buf = fs.readFileSync(file);
    cached = `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    cached = '';
  }
  return cached;
}
