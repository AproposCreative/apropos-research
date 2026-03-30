import { NextRequest, NextResponse } from 'next/server';
import { getOpenAIClient, models } from '@/lib/openai';

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
  try {
    const { claims, articleText } = await request.json();

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
        max_tokens: 1024,
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
      max_tokens: 2048,
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

    return NextResponse.json({ ok: true, results, extractedClaims: !claims?.length });
  } catch (e: any) {
    console.error('[factcheck]', e);
    return NextResponse.json({ error: e?.message || 'factcheck failed' }, { status: 500 });
  }
}
