import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}) : null;

export async function POST(request: NextRequest) {
  try {
    const { content, articleType, author } = await request.json();

    if (!content || !openai) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    // Multi-dimensional quality analysis
    const qualityChecks = await Promise.all([
      analyzeFactualAccuracy(content),
      checkBiasAndStereotypes(content),
      assessReadability(content),
      evaluateStructure(content, articleType),
      verifyTOVConsistency(content, author)
    ]);

    const overallScore = calculateOverallScore(qualityChecks);
    const recommendations = generateRecommendations(qualityChecks);

    return NextResponse.json({
      success: true,
      overallScore,
      breakdown: {
        factualAccuracy: qualityChecks[0],
        biasCheck: qualityChecks[1],
        readability: qualityChecks[2],
        structure: qualityChecks[3],
        tovConsistency: qualityChecks[4]
      },
      recommendations,
      wordCount: content.split(/\s+/).length,
      readingTime: Math.ceil(content.split(/\s+/).length / 160)
    });

  } catch (error) {
    console.error('Quality check error:', error);
    return NextResponse.json(
      { error: 'Failed to perform quality check' },
      { status: 500 }
    );
  }
}

async function analyzeFactualAccuracy(content: string) {
  const completion = await openai.chat.completions.create({
    model: "gpt-5", // Updated to GPT-5 (ChatGPT-5)
    messages: [
      {
        role: "system",
        content: `Du er en faktatjekker for Apropos Magazine. Analyser teksten for:
1. Fakta der skal verificeres
2. Påstande uden kilder
3. Potentielle fejl eller misforståelser
4. Manglende kontekst

Returnér JSON med score (0-100) og specifikke problemer.`
      },
      {
        role: "user",
        content: content
      }
    ],
    temperature: 1, // GPT-5 only supports default temperature (1)
    max_completion_tokens: 500
  });

  try {
    return JSON.parse(completion.choices[0]?.message?.content || '{"score": 50, "issues": []}');
  } catch {
    return {"score": 50, "issues": []};
  }
}

async function checkBiasAndStereotypes(content: string) {
  const completion = await openai.chat.completions.create({
    model: "gpt-5", // Updated to GPT-5 (ChatGPT-5)
    messages: [
      {
        role: "system",
        content: `Du er en bias-detektor for Apropos Magazine. Tjek for:
1. Politisk bias
2. Kulturelle stereotyper
3. Kønsbias
4. Alderisme eller andre diskriminationer
5. Overgeneraliseringer

Returnér JSON med score (0-100) og specifikke problemer.`
      },
      {
        role: "user",
        content: content
      }
    ],
    temperature: 1, // GPT-5 only supports default temperature (1)
    max_completion_tokens: 500
  });

  try {
    return JSON.parse(completion.choices[0]?.message?.content || '{"score": 50, "issues": []}');
  } catch {
    return {"score": 50, "issues": []};
  }
}

async function assessReadability(content: string) {
  const completion = await openai.chat.completions.create({
    model: "gpt-5", // Updated to GPT-5 (ChatGPT-5)
    messages: [
      {
        role: "system",
        content: `Du er en læsbarhedsekspert for Apropos Magazine. Analyser:
1. Sætningslængde og variation
2. Ordvalg og kompleksitet
3. Paragrafstruktur
4. Rytme og flow
5. Danske sprogregler

Returnér JSON med score (0-100) og forbedringsforslag.`
      },
      {
        role: "user",
        content: content
      }
    ],
    temperature: 1, // GPT-5 only supports default temperature (1)
    max_completion_tokens: 500
  });

  try {
    return JSON.parse(completion.choices[0]?.message?.content || '{"score": 50, "suggestions": []}');
  } catch {
    return {"score": 50, "suggestions": []};
  }
}

async function evaluateStructure(content: string, articleType: string) {
  const completion = await openai.chat.completions.create({
    model: "gpt-5", // Updated to GPT-5 (ChatGPT-5)
    messages: [
      {
        role: "system",
        content: `Du er en strukturanalytiker for Apropos Magazine. Evaluer:
1. Intro kvalitet og hook
2. Brødtekst struktur og flow
3. Afslutning og refleksion
4. Overholdelse af artikeltype (${articleType})
5. Apropos strukturregler

Returnér JSON med score (0-100) og strukturelle problemer.`
      },
      {
        role: "user",
        content: content
      }
    ],
    temperature: 1, // GPT-5 only supports default temperature (1)
    max_completion_tokens: 500
  });

  try {
    return JSON.parse(completion.choices[0]?.message?.content || '{"score": 50, "issues": []}');
  } catch {
    return {"score": 50, "issues": []};
  }
}

async function verifyTOVConsistency(content: string, author: string) {
  const completion = await openai.chat.completions.create({
    model: "gpt-5", // Updated to GPT-5 (ChatGPT-5)
    messages: [
      {
        role: "system",
        content: `Du er en TOV-konsistenschecker for Apropos Magazine. Tjek:
1. Konsistent tone gennem artiklen
2. Forfatterens karakteristiske stil (${author})
3. Apropos Magazine's redaktionelle retningslinjer
4. Personlighed og autenticitet
5. Humor og refleksion balance

Returnér JSON med score (0-100) og stilproblemer.`
      },
      {
        role: "user",
        content: content
      }
    ],
    temperature: 1, // GPT-5 only supports default temperature (1)
    max_completion_tokens: 500
  });

  try {
    return JSON.parse(completion.choices[0]?.message?.content || '{"score": 50, "issues": []}');
  } catch {
    return {"score": 50, "issues": []};
  }
}

function calculateOverallScore(checks: any[]): number {
  const scores = checks.map(check => check.score || 50);
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

function generateRecommendations(checks: any[]): string[] {
  const recommendations = [];
  
  checks.forEach((check, index) => {
    const checkNames = ['Faktualitet', 'Bias', 'Læsbarhed', 'Struktur', 'TOV'];
    if (check.score < 70) {
      recommendations.push(`${checkNames[index]}: ${check.issues?.[0] || check.suggestions?.[0] || 'Forbedring nødvendig'}`);
    }
  });

  return recommendations.slice(0, 5); // Max 5 recommendations
}
