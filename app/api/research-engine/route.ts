import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}) : null;

export async function POST(request: NextRequest) {
  try {
    const { topic, articleType, author, targetLength } = await request.json();

    if (!topic || !openai) {
      return NextResponse.json({ error: 'Topic is required' }, { status: 400 });
    }

    // Multi-source research pipeline
    const researchData = await Promise.all([
      gatherNewsData(topic),
      collectCulturalContext(topic),
      findExpertOpinions(topic),
      analyzeTrends(topic),
      gatherFactualData(topic)
    ]);

    const comprehensiveResearch = compileResearch(researchData);
    const researchSummary = generateResearchSummary(comprehensiveResearch);

    return NextResponse.json({
      success: true,
      topic,
      researchSummary,
      sources: comprehensiveResearch.sources,
      keyFindings: comprehensiveResearch.keyFindings,
      culturalContext: comprehensiveResearch.culturalContext,
      expertInsights: comprehensiveResearch.expertInsights,
      factualData: comprehensiveResearch.factualData,
      trends: comprehensiveResearch.trends,
      suggestedAngles: generateSuggestedAngles(comprehensiveResearch, articleType, author)
    });

  } catch (error) {
    console.error('Research error:', error);
    return NextResponse.json(
      { error: 'Failed to conduct research' },
      { status: 500 }
    );
  }
}

async function gatherNewsData(topic: string) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `Du er en nyhedsanalytiker for Apropos Magazine. Analyser:
1. Seneste nyheder om "${topic}"
2. Mediedækning og vinkler
3. Kontroverser eller debatter
4. Relevante begivenheder eller udgivelser
5. Danske og internationale perspektiver

Returnér JSON med nyhedsdata og kilder.`
      },
      {
        role: "user",
        content: `Analyser nyhedsdækningen om: ${topic}`
      }
    ],
    temperature: 0.2,
    max_tokens: 800
  });

  try {
    return JSON.parse(completion.choices[0]?.message?.content || '{"news": [], "sources": []}');
  } catch {
    return {"news": [], "sources": []};
  }
}

async function collectCulturalContext(topic: string) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `Du er en kulturanalytiker for Apropos Magazine. Undersøg:
1. Kulturel betydning af "${topic}"
2. Historisk kontekst og udvikling
3. Samfundsmæssig relevans
4. Kunstneriske eller kreative aspekter
5. Danske og internationale perspektiver

Returnér JSON med kulturel kontekst.`
      },
      {
        role: "user",
        content: `Analyser kulturel kontekst for: ${topic}`
      }
    ],
    temperature: 0.3,
    max_tokens: 700
  });

  try {
    return JSON.parse(completion.choices[0]?.message?.content || '{"context": [], "significance": ""}');
  } catch {
    return {"context": [], "significance": ""};
  }
}

async function findExpertOpinions(topic: string) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `Du er en ekspertanalytiker for Apropos Magazine. Identificer:
1. Eksperter og autoriteter om "${topic}"
2. Deres perspektiver og holdninger
3. Kontroversielle eller interessante synspunkter
4. Akademiske eller professionelle indsigter
5. Relevante citater eller udtalelser

Returnér JSON med ekspertperspektiver.`
      },
      {
        role: "user",
        content: `Find ekspertperspektiver på: ${topic}`
      }
    ],
    temperature: 0.2,
    max_tokens: 600
  });

  try {
    return JSON.parse(completion.choices[0]?.message?.content || '{"experts": [], "opinions": []}');
  } catch {
    return {"experts": [], "opinions": []};
  }
}

async function analyzeTrends(topic: string) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `Du er en trendanalytiker for Apropos Magazine. Analyser:
1. Aktuelle trends omkring "${topic}"
2. Sociale medier og online diskussioner
3. Fremtidige udviklinger og forudsigelser
4. Generationsperspektiver og adfærd
5. Teknologiske eller kulturelle skift

Returnér JSON med trendanalyse.`
      },
      {
        role: "user",
        content: `Analyser trends for: ${topic}`
      }
    ],
    temperature: 0.3,
    max_tokens: 600
  });

  try {
    return JSON.parse(completion.choices[0]?.message?.content || '{"trends": [], "predictions": []}');
  } catch {
    return {"trends": [], "predictions": []};
  }
}

async function gatherFactualData(topic: string) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `Du er en dataspecialist for Apropos Magazine. Saml:
1. Konkrete fakta om "${topic}"
2. Statistikker og tal
3. Historiske data og milepæle
4. Tekniske eller videnskabelige detaljer
5. Verificerbare informationer

Returnér JSON med faktuelle data.`
      },
      {
        role: "user",
        content: `Saml faktuelle data om: ${topic}`
      }
    ],
    temperature: 0.1,
    max_tokens: 600
  });

  try {
    return JSON.parse(completion.choices[0]?.message?.content || '{"facts": [], "statistics": []}');
  } catch {
    return {"facts": [], "statistics": []};
  }
}

function compileResearch(researchData: any[]) {
  return {
    sources: researchData.flatMap(data => data.sources || []),
    keyFindings: researchData.flatMap(data => data.keyFindings || data.news || []),
    culturalContext: researchData.find(data => data.context)?.context || [],
    expertInsights: researchData.find(data => data.experts)?.experts || [],
    factualData: researchData.find(data => data.facts)?.facts || [],
    trends: researchData.find(data => data.trends)?.trends || []
  };
}

function generateResearchSummary(research: any): string {
  const findings = research.keyFindings.slice(0, 3);
  const context = research.culturalContext.slice(0, 2);
  const trends = research.trends.slice(0, 2);
  
  return `Research viser ${findings.length} hovedfund, ${context.length} kulturelle aspekter, og ${trends.length} aktuelle trends.`;
}

function generateSuggestedAngles(research: any, articleType: string, author: string): string[] {
  const angles = [];
  
  if (research.expertInsights.length > 0) {
    angles.push(`Ekspertperspektiv: ${research.expertInsights[0]}`);
  }
  
  if (research.trends.length > 0) {
    angles.push(`Trendanalyse: ${research.trends[0]}`);
  }
  
  if (research.culturalContext.length > 0) {
    angles.push(`Kulturel vinkel: ${research.culturalContext[0]}`);
  }
  
  return angles.slice(0, 3);
}
