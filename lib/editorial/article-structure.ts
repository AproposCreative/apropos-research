import fs from 'node:fs';
import path from 'node:path';

/** Shared editorial form, independent of the selected author's voice. */
export function loadAproposArticleStructure(): string {
  return fs.readFileSync(path.join(process.cwd(), 'prompts/structure.apropos.md'), 'utf8').trim();
}
