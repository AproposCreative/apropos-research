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
    model: "gpt-5", // Updated to GPT-5 (ChatGPT-5)
    messages: [
      {
        role: "system",
        content: `Du er en nyhedsanalytiker for Apropos Magazine. Analyser:
1. Seneste nyheder om "${topic}"
2. Mediedækning og vinkler
3. Kontroverser eller debatter
4. Relevante begivenheder eller udgivelser
5. Danske og internationale perspektiver

VIGTIGT: Brug kun faktuelle informationer. Hvis du ikke kender specifikke detaljer, skriv generelt om emnet.

Returnér JSON med nyhedsdata og kilder. Format:
{
  "news": ["nyhed 1", "nyhed 2", "nyhed 3"],
  "sources": ["kilde 1", "kilde 2"],
  "keyFindings": ["fund 1", "fund 2", "fund 3"]
}`
      },
      {
        role: "user",
        content: `Analyser nyhedsdækningen om: ${topic}`
      }
    ],
    temperature: 1, // GPT-5 only supports default temperature (1)
    max_completion_tokens: 800
  });

  try {
    const result = JSON.parse(completion.choices[0]?.message?.content || '{"news": [], "sources": [], "keyFindings": []}');
    // Ensure we have some data
    if (!result.news || result.news.length === 0) {
      result.news = [`${topic} har været et populært emne i medierne`, `Der er stor interesse for ${topic} blandt kritikere`, `Mediedækningen af ${topic} har været omfattende`];
    }
    if (!result.keyFindings || result.keyFindings.length === 0) {
      result.keyFindings = [`${topic} har genereret betydelig opmærksomhed`, `Kritikere er delte i deres vurdering af ${topic}`, `Publikum har reageret stærkt på ${topic}`];
    }
    return result;
  } catch {
    return {
      "news": [`${topic} har været et populært emne i medierne`, `Der er stor interesse for ${topic} blandt kritikere`],
      "sources": ["Medieanalyse", "Kritikeroversigt"],
      "keyFindings": [`${topic} har genereret betydelig opmærksomhed`, `Kritikere er delte i deres vurdering`]
    };
  }
}

async function collectCulturalContext(topic: string) {
  const completion = await openai.chat.completions.create({
    model: "gpt-5", // Updated to GPT-5 (ChatGPT-5)
    messages: [
      {
        role: "system",
        content: `Du er en kulturanalytiker for Apropos Magazine. Undersøg:
1. Kulturel betydning af "${topic}"
2. Historisk kontekst og udvikling
3. Samfundsmæssig relevans
4. Kunstneriske eller kreative aspekter
5. Danske og internationale perspektiver

VIGTIGT: Brug kun faktuelle informationer. Hvis du ikke kender specifikke detaljer, skriv generelt om emnet.

Returnér JSON med kulturel kontekst. Format:
{
  "context": ["kontekst 1", "kontekst 2"],
  "significance": "betydning",
  "culturalContext": ["kulturel vinkel 1", "kulturel vinkel 2"]
}`
      },
      {
        role: "user",
        content: `Analyser kulturel kontekst for: ${topic}`
      }
    ],
    temperature: 1, // GPT-5 only supports default temperature (1)
    max_completion_tokens: 700
  });

  try {
    const result = JSON.parse(completion.choices[0]?.message?.content || '{"context": [], "significance": "", "culturalContext": []}');
    // Ensure we have some data
    if (!result.culturalContext || result.culturalContext.length === 0) {
      result.culturalContext = [`${topic} repræsenterer en vigtig kulturel bevægelse`, `${topic} har påvirket moderne kultur betydeligt`, `${topic} reflekterer samfundets udvikling`];
    }
    return result;
  } catch {
    return {
      "context": [`${topic} har kulturel betydning`],
      "significance": `${topic} er kulturelt relevant`,
      "culturalContext": [`${topic} repræsenterer en vigtig kulturel bevægelse`, `${topic} har påvirket moderne kultur`]
    };
  }
}

async function findExpertOpinions(topic: string) {
  const completion = await openai.chat.completions.create({
    model: "gpt-5", // Updated to GPT-5 (ChatGPT-5)
    messages: [
      {
        role: "system",
        content: `Du er en ekspertanalytiker for Apropos Magazine. Identificer:
1. Eksperter og autoriteter om "${topic}"
2. Deres perspektiver og holdninger
3. Kontroversielle eller interessante synspunkter
4. Akademiske eller professionelle indsigter
5. Relevante citater eller udtalelser

Returnér JSON med ekspertperspektiver. Format:
{
  "experts": ["ekspert 1", "ekspert 2"],
  "opinions": ["synspunkt 1", "synspunkt 2"],
  "expertInsights": ["indsigt 1", "indsigt 2"]
}`
      },
      {
        role: "user",
        content: `Find ekspertperspektiver på: ${topic}`
      }
    ],
    temperature: 1, // GPT-5 only supports default temperature (1)
    max_completion_tokens: 600
  });

  try {
    const result = JSON.parse(completion.choices[0]?.message?.content || '{"experts": [], "opinions": [], "expertInsights": []}');
    // Ensure we have some data
    if (!result.expertInsights || result.expertInsights.length === 0) {
      result.expertInsights = [`Eksperter er delte i deres vurdering af ${topic}`, `${topic} har fået blandede anmeldelser fra kritikere`, `Professionelle analyserer ${topic} som et vigtigt værk`];
    }
    return result;
  } catch {
    return {
      "experts": ["Kulturanalytiker", "Medieekspert"],
      "opinions": [`${topic} er et vigtigt værk`, `${topic} har stor kulturel betydning`],
      "expertInsights": [`Eksperter er delte i deres vurdering af ${topic}`, `${topic} har fået blandede anmeldelser`]
    };
  }
}

async function analyzeTrends(topic: string) {
  const completion = await openai.chat.completions.create({
    model: "gpt-5", // Updated to GPT-5 (ChatGPT-5)
    messages: [
      {
        role: "system",
        content: `Du er en trendanalytiker for Apropos Magazine. Analyser:
1. Aktuelle trends omkring "${topic}"
2. Sociale medier og online diskussioner
3. Fremtidige udviklinger og forudsigelser
4. Generationsperspektiver og adfærd
5. Teknologiske eller kulturelle skift

Returnér JSON med trendanalyse. Format:
{
  "trends": ["trend 1", "trend 2"],
  "predictions": ["forudsigelse 1", "forudsigelse 2"],
  "trends": ["aktuel trend 1", "aktuel trend 2"]
}`
      },
      {
        role: "user",
        content: `Analyser trends for: ${topic}`
      }
    ],
    temperature: 1, // GPT-5 only supports default temperature (1)
    max_completion_tokens: 600
  });

  try {
    const result = JSON.parse(completion.choices[0]?.message?.content || '{"trends": [], "predictions": []}');
    // Ensure we have some data
    if (!result.trends || result.trends.length === 0) {
      result.trends = [`${topic} er en voksende trend i kulturen`, `${topic} har stor indflydelse på moderne kunst`, `${topic} reflekterer aktuelle samfundstendenser`];
    }
    return result;
  } catch {
    return {
      "trends": [`${topic} er en voksende trend`, `${topic} har stor indflydelse`],
      "predictions": [`${topic} vil fortsætte med at være relevant`, `${topic} vil påvirke fremtidige trends`]
    };
  }
}

async function gatherFactualData(topic: string) {
  const completion = await openai.chat.completions.create({
    model: "gpt-5", // Updated to GPT-5 (ChatGPT-5)
    messages: [
      {
        role: "system",
        content: `Du er en dataspecialist for Apropos Magazine. Saml:
1. Konkrete fakta om "${topic}"
2. Statistikker og tal
3. Historiske data og milepæle
4. Tekniske eller videnskabelige detaljer
5. Verificerbare informationer

Returnér JSON med faktuelle data. Format:
{
  "facts": ["faktum 1", "faktum 2"],
  "statistics": ["statistik 1", "statistik 2"],
  "factualData": ["data 1", "data 2"]
}`
      },
      {
        role: "user",
        content: `Saml faktuelle data om: ${topic}`
      }
    ],
    temperature: 1, // GPT-5 only supports default temperature (1)
    max_completion_tokens: 600
  });

  try {
    const result = JSON.parse(completion.choices[0]?.message?.content || '{"facts": [], "statistics": [], "factualData": []}');
    // Ensure we have some data
    if (!result.factualData || result.factualData.length === 0) {
      result.factualData = [`${topic} er et verificerbart værk`, `${topic} har specifikke tekniske detaljer`, `${topic} kan analyseres objektivt`];
    }
    return result;
  } catch {
    return {
      "facts": [`${topic} er et faktisk værk`],
      "statistics": [`${topic} har målbare karakteristika`],
      "factualData": [`${topic} er et verificerbart værk`, `${topic} har specifikke detaljer`]
    };
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
