import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

/** One server-side voice for daily articles, Writer, briefs and the critic. */
export function loadLivVoice() {
  const text = fs.readFileSync(path.join(process.cwd(), 'data/author-prompts/liv-brandt.txt'), 'utf8').trim();
  if (!text.startsWith('LIV BRANDT - PROMPT (v4)')) throw new Error('liv_voice_unavailable');
  return { text, version: 'liv-v4', hash: createHash('sha256').update(text).digest('hex') };
}

export function isLivAuthor(name: string): boolean {
  return /^(liv|liv brandt|liv-brandt)$/i.test(name.trim());
}
