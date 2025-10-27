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

    // Advanced enhancement pipeline
    const enhancements = await Promise.all([
      enhanceResearch(content, articleType),
      improveStructure(content, articleType),
      strengthenTOV(content, author),
      addCulturalContext(content, articleType),
      optimizeReadability(content)
    ]);

    const enhancedContent = mergeEnhancements(content, enhancements);

    return NextResponse.json({
      success: true,
      originalLength: content.split(/\s+/).length,
      enhancedLength: enhancedContent.split(/\s+/).length,
      enhancements: enhancements.map(e => e.summary),
      enhancedContent,
      improvements: generateImprovementSummary(enhancements)
    });

  } catch (error) {
    console.error('Content enhancement error:', error);
    return NextResponse.json(
      { error: 'Failed to enhance content' },
      { status: 500 }
    );
  }
}

async function enhanceResearch(content: string, articleType: string) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `Du er en research-specialist for Apropos Magazine. Forbedre artiklen ved at:
1. Identificere manglende fakta og kontekst
2. Foreslå konkrete data og statistikker
3. Tilføje kulturelle referencer og sammenligninger
4. Inkludere ekspertperspektiver
5. Styrke argumentationen med beviser

Fokusér på ${articleType} artikler. Returnér JSON med forbedringer og nye elementer.`
      },
      {
        role: "user",
        content: content
      }
    ],
    temperature: 0.3,
    max_tokens: 800
  });

  try {
    return JSON.parse(completion.choices[0]?.message?.content || '{"summary": "Ingen forbedringer", "additions": []}');
  } catch {
    return {"summary": "Ingen forbedringer", "additions": []};
  }
}

async function improveStructure(content: string, articleType: string) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `Du er en struktur-ekspert for Apropos Magazine. Analyser og forbedre:
1. Intro hook og engagement
2. Brødtekst flow og overgange
3. Afslutning og refleksion
4. Paragrafstruktur og rytme
5. Overholdelse af ${articleType} struktur

Returnér JSON med strukturelle forbedringer.`
      },
      {
        role: "user",
        content: content
      }
    ],
    temperature: 0.2,
    max_tokens: 600
  });

  try {
    return JSON.parse(completion.choices[0]?.message?.content || '{"summary": "Ingen strukturelle ændringer", "improvements": []}');
  } catch {
    return {"summary": "Ingen strukturelle ændringer", "improvements": []};
  }
}

async function strengthenTOV(content: string, author: string) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `Du er en TOV-specialist for Apropos Magazine. Styrk artiklens:
1. Personlighed og autenticitet
2. Forfatterens karakteristiske stil (${author})
3. Humor og ironi balance
4. Sanselige detaljer og observationer
5. Refleksion og dybde

Returnér JSON med TOV-forbedringer.`
      },
      {
        role: "user",
        content: content
      }
    ],
    temperature: 0.4,
    max_tokens: 600
  });

  try {
    return JSON.parse(completion.choices[0]?.message?.content || '{"summary": "Ingen TOV-ændringer", "enhancements": []}');
  } catch {
    return {"summary": "Ingen TOV-ændringer", "enhancements": []};
  }
}

async function addCulturalContext(content: string, articleType: string) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `Du er en kulturanalytiker for Apropos Magazine. Tilføj:
1. Kulturel kontekst og relevans
2. Historiske referencer
3. Samfundsmæssige perspektiver
4. Trendanalyse og sammenhænge
5. Danske og internationale vinkler

Fokusér på ${articleType} artikler. Returnér JSON med kulturelle tilføjelser.`
      },
      {
        role: "user",
        content: content
      }
    ],
    temperature: 0.3,
    max_tokens: 600
  });

  try {
    return JSON.parse(completion.choices[0]?.message?.content || '{"summary": "Ingen kulturelle tilføjelser", "context": []}');
  } catch {
    return {"summary": "Ingen kulturelle tilføjelser", "context": []};
  }
}

async function optimizeReadability(content: string) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `Du er en læsbarhedsoptimizer for Apropos Magazine. Forbedre:
1. Sætningsvariation og rytme
2. Ordvalg og klarhed
3. Paragrafstruktur
4. Overgange og flow
5. Danske sprogregler

Returnér JSON med læsbarhedsforbedringer.`
      },
      {
        role: "user",
        content: content
      }
    ],
    temperature: 0.2,
    max_tokens: 600
  });

  try {
    return JSON.parse(completion.choices[0]?.message?.content || '{"summary": "Ingen læsbarhedsændringer", "optimizations": []}');
  } catch {
    return {"summary": "Ingen læsbarhedsændringer", "optimizations": []};
  }
}

function mergeEnhancements(originalContent: string, enhancements: any[]): string {
  // Simple merge strategy - in production, this would be more sophisticated
  let enhanced = originalContent;
  
  enhancements.forEach(enhancement => {
    if (enhancement.improvedContent) {
      enhanced = enhancement.improvedContent;
    }
  });
  
  return enhanced;
}

function generateImprovementSummary(enhancements: any[]): string[] {
  return enhancements
    .map(e => e.summary)
    .filter(summary => summary && summary !== "Ingen forbedringer" && summary !== "Ingen strukturelle ændringer")
    .slice(0, 3);
}
