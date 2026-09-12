import { NextRequest, NextResponse } from 'next/server';
import { getOpenAIClient, models } from '@/lib/openai';
import { isApiRequestAuthorized } from '@/lib/api/middleware-auth';
import { groundedInput } from '@/lib/factcheck/grounded';
import { verifyArticleSources } from '@/lib/factcheck/verify-article';
import { logger } from '@/lib/logger';
import { assessLivEditorialArticle } from '@/lib/liv/editorial-assessment';
import { withLivCostRequest } from '@/lib/liv/cost-context';

export const maxDuration = 120;

const SYSTEM_PROMPT = `Du er en faktakontrollør for Apropos Magazine. Du modtager en liste af påstande (claims) fra en artikel.

For hver påstand:
1. Vurdér om den er "verified" (korrekt), "disputed" (tvivlsom/forkert), eller "unverifiable" (kan ikke verificeres med din viden).
2. Giv kort begrundelse (evidence) på dansk.
3. Angiv en confidence score (0.0 - 1.0).

Svar KUN med JSON-array. Eksempel:
[
  {
    "claim": "Film X udkom i 2024",
    "status": "verified",
    "confidence": 0.95,
    "evidence": "Filmen havde premiere den 15. marts 2024."
  }
]

Vær ærlig om usikkerhed. Brug "unverifiable" når du ikke har tilstrækkelig viden.`;

export async function POST(request: NextRequest) {
  try { return await withLivCostRequest(request, 'factcheck', () => handlePost(request)); }
  catch { return NextResponse.json({ error: 'Ugyldig intern budgetkontekst.', complete: false }, { status: 401 }); }
}

async function handlePost(request: NextRequest) {
  if (!(await isApiRequestAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let input: unknown;
  try { input = await request.json(); } catch {
    return NextResponse.json({ error: 'Ugyldig JSON.' }, { status: 400 });
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return NextResponse.json({ error: 'Et JSON-objekt er påkrævet.' }, { status: 400 });
  }
  if ('editorialReview' in input && !('sourceUrls' in input)) {
    return NextResponse.json({ error: 'Redaktionel vurdering kræver kilde-URL’er.' }, { status: 400 });
  }
  if ('sourceUrls' in input) {
    if ('editorialReview' in input && input.editorialReview !== 'liv-v1') {
      return NextResponse.json({ error: 'Ugyldig redaktionel vurdering.' }, { status: 400 });
    }
    const parsed = groundedInput.safeParse(input);
    if (!parsed.success) return NextResponse.json({ error: 'Faktatjek kræver artikeltekst (20-40000 tegn) og 1-8 kilde-URL’er.' }, { status: 400 });
    try {
      const verify = 'editorialReview' in input ? assessLivEditorialArticle : verifyArticleSources;
      return NextResponse.json(await verify(parsed.data.articleText, parsed.data.sourceUrls), { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      const failure = error as { name?: unknown; status?: unknown; code?: unknown } | null;
      // Log only bounded error classification, never provider bodies or credentials.
      logger.warn('[factcheck] grounded verification failed', {
        errorType: typeof failure?.name === 'string' ? failure.name.slice(0, 80) : 'unknown',
        status: typeof failure?.status === 'number' ? failure.status : null,
        code: typeof failure?.code === 'string' && /^[a-z0-9_-]{1,80}$/i.test(failure.code) ? failure.code : null,
      });
      return NextResponse.json({ error: 'Kildebaseret faktatjek kunne ikke gennemføres.', complete: false }, { status: 503 });
    }
  }
  try {
    const { claims, articleText } = input as { claims?: string[]; articleText?: string };

    if (!Array.isArray(claims) || claims.length === 0) {
      if (!articleText || typeof articleText !== 'string') {
        return NextResponse.json({ error: 'claims[] or articleText required' }, { status: 400 });
      }
    }

    const openai = getOpenAIClient();
    if (!openai) {
      const results = (claims || []).map((c: string) => ({
        claim: String(c || ''),
        status: 'unverifiable' as const,
        confidence: 0,
        evidence: 'OpenAI ikke konfigureret.',
      }));
      return NextResponse.json({ ok: true, results });
    }

    let claimsToCheck = claims;

    if (!claimsToCheck || claimsToCheck.length === 0) {
      const extractionResponse = await openai.chat.completions.create({
        model: models.default,
        temperature: 0.3,
        max_completion_tokens: 1024,
        messages: [
          {
            role: 'system',
            content: 'Udtræk de vigtigste faktuelt verificerbare påstande fra artikelteksten. Returnér en JSON-array af strenge. Maks 8 påstande. Fokusér på datoer, navne, steder, tal og specifikke hændelser.',
          },
          { role: 'user', content: articleText.slice(0, 4000) },
        ],
      });

      try {
        const raw = extractionResponse.choices[0]?.message?.content?.trim() || '[]';
        const jsonMatch = raw.match(/\[[\s\S]*\]/);
        claimsToCheck = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
      } catch {
        claimsToCheck = [];
      }
    }

    if (!claimsToCheck || claimsToCheck.length === 0) {
      return NextResponse.json({ ok: true, results: [], message: 'Ingen verificerbare påstande fundet.' });
    }

    const userMessage = claimsToCheck.map((c: string, i: number) => `${i + 1}. ${c}`).join('\n');

    const response = await openai.chat.completions.create({
      model: models.default,
      temperature: 0.2,
      max_completion_tokens: 2048,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
    });

    const responseText = response.choices[0]?.message?.content?.trim() || '[]';
    let results;
    try {
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      results = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch {
      results = claimsToCheck.map((c: string) => ({
        claim: String(c),
        status: 'unverifiable',
        confidence: 0,
        evidence: 'Kunne ikke parse verificeringsresultat.',
      }));
    }

    return NextResponse.json({ ok: true, results, extractedClaims: !claims?.length, verificationMethod: 'model-advisory', complete: false });
  } catch (e: any) {
    console.error('[factcheck]', e);
    return NextResponse.json({ error: e?.message || 'factcheck failed' }, { status: 500 });
  }
}
