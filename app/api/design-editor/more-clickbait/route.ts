import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { promises as fs } from 'fs';
import path from 'path';
import { config } from '@/lib/config/env';

const PROMPT_FILE = path.join(process.cwd(), 'prompts', 'design_editor_more_clickbait.md');

function clip(value: unknown, max: number): string {
  const text = String(value ?? '').trim();
  return text.length > max ? text.slice(0, max).trim() : text;
}

function extractJsonBlock(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;
  const match = trimmed.match(/\{[\s\S]*\}/);
  return match ? match[0] : '{}';
}

function createFallbackClickbait(title: string, excerpt: string): { title: string; excerpt: string } {
  const t = title.trim();
  const e = excerpt.trim();

  const tweakTitle = (() => {
    if (!t) return t;
    if (/^anmeldelse:/i.test(t)) {
      return clip(t.replace(/^anmeldelse:\s*/i, 'Anmeldelse: Derfor taler alle om '), 70);
    }
    if (!/[!?]/.test(t)) {
      return clip(`${t} – her er hvorfor`, 70);
    }
    return clip(t, 70);
  })();

  const tweakExcerpt = (() => {
    if (!e) return e;
    if (e.toLowerCase().includes('men')) return clip(e, 95);
    return clip(`${e} – men én detalje skiller sig ud`, 95);
  })();

  return {
    title: tweakTitle || clip(t, 70),
    excerpt: tweakExcerpt || clip(e, 95),
  };
}

async function loadPrompt(): Promise<string> {
  try {
    const content = await fs.readFile(PROMPT_FILE, 'utf8');
    return content.trim();
  } catch {
    return 'Rewrite title and excerpt in Danish to be more clickbait but factual. Return strict JSON: {"title":"...","excerpt":"..."}';
  }
}

export async function POST(req: NextRequest) {
  try {
    const { title, excerpt } = await req.json();
    const currentTitle = clip(title, 140);
    const currentExcerpt = clip(excerpt, 220);

    if (!currentTitle) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    if (!config.openai.apiKey) {
      const fallback = createFallbackClickbait(currentTitle, currentExcerpt);
      return NextResponse.json(fallback);
    }

    const prompt = await loadPrompt();
    const client = new OpenAI({ apiKey: config.openai.apiKey });

    const completion = await client.chat.completions.create({
      model: 'gpt-5',
      temperature: 1,
      max_completion_tokens: 400,
      messages: [
        { role: 'system', content: prompt },
        {
          role: 'user',
          content: JSON.stringify({
            title: currentTitle,
            excerpt: currentExcerpt,
          }),
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(extractJsonBlock(raw));
    let nextTitle = clip(parsed.title || currentTitle, 70);
    let nextExcerpt = clip(parsed.excerpt || currentExcerpt, 95);

    // Avoid no-op UX: if model returns unchanged copy, apply deterministic clickbait tweak.
    if (nextTitle === currentTitle && nextExcerpt === currentExcerpt) {
      const fallback = createFallbackClickbait(currentTitle, currentExcerpt);
      nextTitle = fallback.title;
      nextExcerpt = fallback.excerpt;
    }

    return NextResponse.json({
      title: nextTitle || currentTitle,
      excerpt: nextExcerpt || currentExcerpt,
    });
  } catch (error) {
    console.error('more-clickbait route failed', error);
    return NextResponse.json({ error: 'Failed to generate clickbait copy' }, { status: 500 });
  }
}
