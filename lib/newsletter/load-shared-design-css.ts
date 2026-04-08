import fs from 'fs';
import path from 'path';

/**
 * Fælles nyhedsbrevs-CSS: indlejres i HTML fra `renderNewsletterEmailHtml` (og dermed app-preview).
 * Læses ved hvert kald så ændringer slår igennem uden server-genstart.
 */
export function getNewsletterSharedDesignCss(): string {
  const file = path.join(process.cwd(), 'public/newsletter/newsletter-shared.css');
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}
