import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

/** One server-side voice for daily articles, Writer, briefs and the critic. */
export function loadLivVoice(version = 'liv-v5') {
  // Saved paid writer responses keep their original prompt; new work uses v5.
  const file = version === 'liv-v5' ? 'liv-brandt.txt' : version === 'liv-v4' ? 'versions/liv-brandt-v4.txt' : null;
  if (!file) throw new Error('liv_voice_unavailable');
  const text = fs.readFileSync(path.join(process.cwd(), 'data/author-prompts', file), 'utf8').trim();
  if (!text.startsWith(`LIV BRANDT - PROMPT (${version.replace('liv-', '')})`)) throw new Error('liv_voice_unavailable');
  return { text, version, hash: createHash('sha256').update(text).digest('hex') };
}

export function isLivAuthor(name: string): boolean {
  return /^(liv|liv brandt|liv-brandt)$/i.test(name.trim());
}
