import { NextRequest, NextResponse } from 'next/server';
import { getOpenAIClient, models } from '@/lib/openai';
import { isApiRequestAuthorized } from '@/lib/api/middleware-auth';
import { withSharedCostContext } from '@/lib/liv/cost-context';
import { getLivCostPretransportError } from '@/lib/liv/cost-errors';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const maxDuration = 60;
const headers = { 'Cache-Control': 'no-store' };
export async function POST(req: NextRequest) {
  if (!await isApiRequestAuthorized(req)) return NextResponse.json({ error: 'Log ind for at redigere overskriften.' }, { status: 401, headers });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Ugyldig JSON.' }, { status: 400, headers }); }
  const limits = { title: 1000, excerpt: 2000, intro: 4000, content: 40000, section: 120, topic: 120 };
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.title !== 'string' || !body.title.trim() ||
    Object.entries(limits).some(([key, max]) => body[key] !== undefined && (typeof body[key] !== 'string' || body[key].length > max))) {
    return NextResponse.json({ error: 'Ugyldig artikeltekst.' }, { status: 400, headers });
  }
  const client = getOpenAIClient();
  if (!client) return NextResponse.json({ error: 'AI er ikke tilgængelig. Din tekst er bevaret.' }, { status: 503, headers });
  try {
    const prompt = await readFile(path.join(process.cwd(), 'prompts/design_editor_more_clickbait.md'), 'utf8');
    const payload = Object.fromEntries(Object.keys(limits).map(key => [key, body[key] || '']));
    const result = await withSharedCostContext({ scope: 'writer', stage: 'design-headline' }, () => client.chat.completions.create({
      model: models.default, max_completion_tokens: 600, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: prompt }, { role: 'user', content: JSON.stringify(payload) }],
    }, { maxRetries: 0, timeout: 45000, signal: req.signal }));
    if (result.choices[0]?.finish_reason !== 'stop') throw new Error('incomplete');
    const pair = JSON.parse(result.choices[0]?.message.content || '{}');
    if (typeof pair.title !== 'string' || !pair.title.trim() || pair.title.trim().length > 70 ||
      typeof pair.excerpt !== 'string' || !pair.excerpt.trim() || pair.excerpt.trim().length > 95) throw new Error('invalid_pair');
    return NextResponse.json({ title: pair.title.trim(), excerpt: pair.excerpt.trim() }, { headers });
  } catch (error) {
    const blocked = !!getLivCostPretransportError(error);
    return NextResponse.json({ error: blocked ? 'AI-budgettet tillader ikke dette kald.' : 'Kunne ikke omskrive teksten. Din eksisterende tekst er bevaret.' }, { status: blocked ? 503 : 502, headers });
  }
}
