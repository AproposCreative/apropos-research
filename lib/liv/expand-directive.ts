import fs from 'node:fs/promises';
import path from 'node:path';
import { getOpenAIClient } from '@/lib/openai';
import { logger } from '@/lib/logger';

let styleCardCache: string | null = null;
let livPromptCache: string | null = null;
const briefCache = new Map<string, { value: string; ts: number }>();

async function readStyleCard(): Promise<string> {
  if (styleCardCache) return styleCardCache;
  const file = path.join(process.cwd(), 'data', 'author-prompts', 'apropos-style-card.md');
  try {
    styleCardCache = await fs.readFile(file, 'utf8');
  } catch {
    styleCardCache = 'Apropos-stilkort mangler. Brug varm, kritisk, sanselig kulturjournalistik.';
  }
  return styleCardCache;
}

async function readLivPrompt(): Promise<string> {
  if (livPromptCache) return livPromptCache;
  const file = path.join(process.cwd(), 'data', 'author-prompts', 'liv-brandt.txt');
  try {
    livPromptCache = await fs.readFile(file, 'utf8');
  } catch {
    livPromptCache = 'Liv Brandt: sanselig, feministisk, personlig kulturkritik.';
  }
  return livPromptCache;
}

export async function expandDirective(input: {
  topicHint?: string;
  directiveHint?: string;
}): Promise<{ expandedDirective: string; cached: boolean }> {
  const topicHint = input.topicHint?.trim() || '';
  const directiveHint = input.directiveHint?.trim() || '';
  const key = `${topicHint}::${directiveHint}`.toLowerCase();
  const now = Date.now();
  const found = briefCache.get(key);
  if (found && now - found.ts < 10 * 60 * 1000) {
    return { expandedDirective: found.value, cached: true };
  }

  if (!topicHint && !directiveHint) {
    return { expandedDirective: '', cached: false };
  }

  const client = getOpenAIClient();
  if (!client) {
    // Graceful fallback: return raw directive.
    return { expandedDirective: directiveHint || topicHint, cached: false };
  }

  const [styleCard, livPrompt] = await Promise.all([readStyleCard(), readLivPrompt()]);

  try {
    const res = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.35,
      max_completion_tokens: 500,
      messages: [
        {
          role: 'system',
          content: [
            'Du er redaktionel udvikler for Apropos Magazine.',
            'Omskriv redaktionens korte input til en skarp briefing for Liv Brandt.',
            'Hold dig til maks 200 ord.',
            'Output SKAL have disse fire sektioner og intet andet:',
            'Vinkel:',
            'Aabningsbevaegelse:',
            'Spor:',
            'Undgaa:',
            '',
            'Apropos style-card:',
            styleCard,
            '',
            'Liv stemmeprofil:',
            livPrompt.slice(0, 2500),
          ].join('\n'),
        },
        {
          role: 'user',
          content: [
            `Emnehint: ${topicHint || '(ikke angivet)'}`,
            `Retningshint: ${directiveHint || '(ikke angivet)'}`,
            'Lav en konkret briefing der kan indsættes direkte i en LLM-prompt.',
          ].join('\n'),
        },
      ],
    });
    const expanded = res.choices[0]?.message?.content?.trim() || '';
    const finalText = expanded || directiveHint || topicHint;
    briefCache.set(key, { value: finalText, ts: now });
    return { expandedDirective: finalText, cached: false };
  } catch (e) {
    logger.warn('[liv/expand-directive] failed, fallback to raw hint', {
      err: e instanceof Error ? e.message : String(e),
    });
    return { expandedDirective: directiveHint || topicHint, cached: false };
  }
}
