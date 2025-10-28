import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}) : null;

export async function POST(request: NextRequest) {
  try {
    const { content, articleType, targetLength, author } = await request.json();

    if (!content || !openai) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    // Advanced enhancement pipeline (sequential so each stage builds on the previous)
    let workingContent = content;
    const stageResults: Array<{
      stage: string;
      summary?: string;
      applied: boolean;
      details: Record<string, any>;
    }> = [];

    const runStage = async (
      stage: string,
      fn: (text: string) => Promise<{ summary?: string; improvedContent?: string }>
    ) => {
      const before = workingContent;
      const result = await fn(before);
      const { improvedContent, ...details } = result || {};
      const improved =
        typeof improvedContent === 'string' && improvedContent.trim().length > 0
          ? improvedContent
          : before;
      workingContent = improved;
      stageResults.push({
        stage,
        summary: result?.summary,
        applied: improved !== before,
        details
      });
    };

    await runStage('research', (text) => enhanceResearch(text, articleType, targetLength));
    await runStage('structure', (text) => improveStructure(text, articleType, targetLength));
    await runStage('tone', (text) => strengthenTOV(text, author, targetLength));
    await runStage('context', (text) => addCulturalContext(text, articleType, targetLength));
    await runStage('readability', (text) => optimizeReadability(text, targetLength));

    const enhancedContent = workingContent;

    return NextResponse.json({
      success: true,
      originalLength: content.split(/\s+/).length,
      enhancedLength: enhancedContent.split(/\s+/).length,
      enhancements: stageResults.map(stage => stage.summary),
      enhancedContent,
      improvements: generateImprovementSummary(stageResults),
      stages: stageResults
    });

  } catch (error) {
    console.error('Content enhancement error:', error);
    return NextResponse.json(
      { error: 'Failed to enhance content' },
      { status: 500 }
    );
  }
}

async function enhanceResearch(content: string, articleType: string, targetLength?: number) {
  const lengthInstruction = targetLength
    ? `Sigter mod ca. ${targetLength} ord og sørg for, at artiklen ikke bliver kortere end ${Math.max(
        Math.floor(targetLength * 0.85),
        targetLength - 200
      )} ord.`
    : '';
  const completion = await openai.chat.completions.create({
    model: "gpt-5", // Updated to GPT-5 (ChatGPT-5)
    messages: [
      {
        role: "system",
        content: `Du er en research-specialist for Apropos Magazine. Forbedre artiklen ved at:
1. Identificere manglende fakta og kontekst
2. Foreslå konkrete data og statistikker
3. Tilføje kulturelle referencer og sammenligninger
4. Inkludere ekspertperspektiver
5. Styrke argumentationen med beviser

Fokusér på ${articleType || 'Apropos'} artikler. Integrér forbedringerne direkte i teksten – behold den eksisterende struktur (Intro:, brødtekst, afslutning) og skriv på dansk med Apropos' tone.
${lengthInstruction}

Returnér et JSON-objekt med felterne:
{
  "summary": string,
  "improvedContent": string
}
Hvor "improvedContent" er hele artiklen efter dine rettelser.`
      },
      {
        role: "user",
        content: content
      }
    ],
    temperature: 1, // GPT-5 only supports default temperature (1)
    max_completion_tokens: 800
  });

  try {
    const parsed = JSON.parse(
      completion.choices[0]?.message?.content ||
        '{"summary": "Ingen forbedringer", "improvedContent": ""}'
    );
    if (!parsed.improvedContent) {
      parsed.improvedContent = content;
    }
    return parsed;
  } catch {
    return { summary: "Ingen forbedringer", improvedContent: content };
  }
}

async function improveStructure(content: string, articleType: string, targetLength?: number) {
  const lengthInstruction = targetLength
    ? `Artiklen skal lande omkring ${targetLength} ord efter dine ændringer (ikke kortere end ${Math.max(
        Math.floor(targetLength * 0.85),
        targetLength - 200
      )} ord).`
    : '';
  const completion = await openai.chat.completions.create({
    model: "gpt-5", // Updated to GPT-5 (ChatGPT-5)
    messages: [
      {
        role: "system",
        content: `Du er en struktur-ekspert for Apropos Magazine. Analyser og forbedre:
1. Intro hook og engagement
2. Brødtekst flow og overgange
3. Afslutning og refleksion
4. Paragrafstruktur og rytme
5. Overholdelse af ${articleType} struktur

Behold den nuværende formatmarkering (Intro:, afslutningslabel) og sørg for at udbygge snarere end at forkorte.
${lengthInstruction}

Returnér et JSON-objekt med nøglerne "summary" og "improvedContent", hvor improvedContent er den fulde, reviderede artikel.`
      },
      {
        role: "user",
        content: content
      }
    ],
    temperature: 0.2,
    max_completion_tokens: 600
  });

  try {
    const parsed = JSON.parse(
      completion.choices[0]?.message?.content ||
        '{"summary": "Ingen strukturelle ændringer", "improvedContent": ""}'
    );
    if (!parsed.improvedContent) {
      parsed.improvedContent = content;
    }
    return parsed;
  } catch {
    return { summary: "Ingen strukturelle ændringer", improvedContent: content };
  }
}

async function strengthenTOV(content: string, author: string, targetLength?: number) {
  const lengthInstruction = targetLength
    ? `Hold eller udbyg længden til omkring ${targetLength} ord (minimum ${Math.max(
        Math.floor(targetLength * 0.85),
        targetLength - 200
      )} ord).`
    : '';
  const completion = await openai.chat.completions.create({
    model: "gpt-5", // Updated to GPT-5 (ChatGPT-5)
    messages: [
      {
        role: "system",
        content: `Du er en TOV-specialist for Apropos Magazine. Styrk artiklens:
1. Personlighed og autenticitet
2. Forfatterens karakteristiske stil (${author})
3. Humor og ironi balance
4. Sanselige detaljer og observationer
5. Refleksion og dybde

Arbejd oven på teksten (bevar pointer, struktur og fakta) og skriv i ${author || 'Apropos Writer'}s stemme. ${lengthInstruction}

Returnér et JSON-objekt med "summary" og "improvedContent" (hele artiklen efter dine ændringer).`
      },
      {
        role: "user",
        content: content
      }
    ],
    temperature: 0.4,
    max_completion_tokens: 600
  });

  try {
    const parsed = JSON.parse(
      completion.choices[0]?.message?.content ||
        '{"summary": "Ingen TOV-ændringer", "improvedContent": ""}'
    );
    if (!parsed.improvedContent) {
      parsed.improvedContent = content;
    }
    return parsed;
  } catch {
    return { summary: "Ingen TOV-ændringer", improvedContent: content };
  }
}

async function addCulturalContext(content: string, articleType: string, targetLength?: number) {
  const lengthInstruction = targetLength
    ? `Hold teksten omkring ${targetLength} ord (ikke kortere end ${Math.max(
        Math.floor(targetLength * 0.85),
        targetLength - 200
      )} ord).`
    : '';
  const completion = await openai.chat.completions.create({
    model: "gpt-5", // Updated to GPT-5 (ChatGPT-5)
    messages: [
      {
        role: "system",
        content: `Du er en kulturanalytiker for Apropos Magazine. Tilføj:
1. Kulturel kontekst og relevans
2. Historiske referencer
3. Samfundsmæssige perspektiver
4. Trendanalyse og sammenhænge
5. Danske og internationale vinkler

Fokusér på ${articleType || 'Apropos'} artikler. Integrér perspektiverne direkte i teksten uden at ændre format. ${lengthInstruction}

Returnér JSON med "summary" og "improvedContent" (den opdaterede artikel).`
      },
      {
        role: "user",
        content: content
      }
    ],
    temperature: 1, // GPT-5 only supports default temperature (1)
    max_completion_tokens: 600
  });

  try {
    const parsed = JSON.parse(
      completion.choices[0]?.message?.content ||
        '{"summary": "Ingen kulturelle tilføjelser", "improvedContent": ""}'
    );
    if (!parsed.improvedContent) {
      parsed.improvedContent = content;
    }
    return parsed;
  } catch {
    return { summary: "Ingen kulturelle tilføjelser", improvedContent: content };
  }
}

async function optimizeReadability(content: string, targetLength?: number) {
  const lengthInstruction = targetLength
    ? `Bevar eller udbyg længden til cirka ${targetLength} ord (ikke under ${Math.max(
        Math.floor(targetLength * 0.9),
        targetLength - 150
      )} ord) mens flowet forbedres.`
    : '';
  const completion = await openai.chat.completions.create({
    model: "gpt-5", // Updated to GPT-5 (ChatGPT-5)
    messages: [
      {
        role: "system",
        content: `Du er en læsbarhedsoptimizer for Apropos Magazine. Forbedre:
1. Sætningsvariation og rytme
2. Ordvalg og klarhed
3. Paragrafstruktur
4. Overgange og flow
5. Danske sprogregler

Arbejdet skal resultere i en fuld, opdateret artikeltekst med den samme struktur (Intro:, afslutningslabel). ${lengthInstruction}

Returnér JSON med "summary" og "improvedContent".`
      },
      {
        role: "user",
        content: content
      }
    ],
    temperature: 0.2,
    max_completion_tokens: 600
  });

  try {
    const parsed = JSON.parse(
      completion.choices[0]?.message?.content ||
        '{"summary": "Ingen læsbarhedsændringer", "improvedContent": ""}'
    );
    if (!parsed.improvedContent) {
      parsed.improvedContent = content;
    }
    return parsed;
  } catch {
    return { summary: "Ingen læsbarhedsændringer", improvedContent: content };
  }
}

function generateImprovementSummary(stages: Array<{ summary?: string }>): string[] {
  return stages
    .map(stage => stage.summary)
    .filter(summary => summary && summary !== "Ingen forbedringer" && summary !== "Ingen strukturelle ændringer")
    .slice(0, 3);
}
