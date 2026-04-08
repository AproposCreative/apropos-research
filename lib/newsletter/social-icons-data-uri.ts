import fs from 'fs';
import path from 'path';

export type NewsletterSocialIconName = 'instagram' | 'facebook' | 'linkedin';

let cache: Record<NewsletterSocialIconName, string> | undefined;

/**
 * Små PNG-ikoner indlejret som data-URI — loader i mail uden afhængighed af
 * magasin-domænet (som ofte ikke har /images/ fra Next `public/`).
 */
export function getNewsletterSocialIconDataUri(name: NewsletterSocialIconName): string {
  if (!cache) {
    const next: Record<NewsletterSocialIconName, string> = {
      instagram: '',
      facebook: '',
      linkedin: '',
    };
    for (const n of ['instagram', 'facebook', 'linkedin'] as const) {
      const file = path.join(process.cwd(), `public/images/nl-social-${n}.png`);
      try {
        const buf = fs.readFileSync(file);
        next[n] = `data:image/png;base64,${buf.toString('base64')}`;
      } catch {
        next[n] = '';
      }
    }
    cache = next;
  }
  return cache[name];
}
