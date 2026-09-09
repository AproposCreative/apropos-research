import fs from 'node:fs/promises';
import path from 'node:path';
import { getOpenAIClient } from '@/lib/openai';
import { logger } from '@/lib/logger';
import { loadLivVoice } from '@/lib/liv/voice';
import { livModels } from '@/lib/liv/model-config';

let styleCardCache: string | null = null;
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

export async function expandDirective(input: {
  topicHint?: string;
  directiveHint?: string;
}): Promise<{ expandedDirective: string; cached: boolean }> {
  const topicHint = input.topicHint?.trim() || '';
  const directiveHint = input.directiveHint?.trim() || '';
  const voice = loadLivVoice();
  const model = livModels().utility;
  const key = `${voice.hash}::${model}::${topicHint}::${directiveHint}`;
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

  const styleCard = await readStyleCard();

  try {
    const res = await client.chat.completions.create({
      model,
      max_completion_tokens: 2000,
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
            voice.text,
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
