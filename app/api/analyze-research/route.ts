import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { config } from '@/lib/config/env';
import { logger, createRequestLogger } from '@/lib/logger';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';

const openai = config.openai.apiKey ? new OpenAI({
  apiKey: config.openai.apiKey,
}) : null;

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const requestLogger = createRequestLogger(requestId);
  
  try {
    const { title, content, keyPoints, source } = await request.json();

    if (!title && !content) {
      requestLogger.warn('Missing title and content in request');
      return NextResponse.json(
        createErrorResponse('Title or content is required', {
          statusCode: 400,
          errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
          requestId,
        }),
        { status: 400 }
      );
    }

    if (!openai) {
      requestLogger.error('OpenAI client not initialized', undefined, {
        hasApiKey: !!config.openai.apiKey,
      });
      return NextResponse.json(
        createErrorResponse('OpenAI API key not configured', {
          statusCode: 500,
          errorCode: ErrorCode.MISSING_API_KEY,
          requestId,
        }),
        { status: 500 }
      );
    }

    // Analyze the research article to generate dynamic insights
    const analysisPrompt = `Du er en redaktør og trendanalytiker for Apropos Magazine. Analyser denne research-artikel og generer dynamiske indsigter:

**Artikel:**
Titel: ${title || 'Ikke angivet'}
Kilde: ${source || 'Ukendt'}
${keyPoints && Array.isArray(keyPoints) && keyPoints.length > 0 ? `Nøglepunkter:\n${keyPoints.slice(0, 5).map((kp: string, i: number) => `${i + 1}. ${kp}`).join('\n')}` : ''}
${content ? `Indhold (første 500 tegn): ${content.substring(0, 500)}...` : ''}

**Opgave:**
1. Analyser trenden: Er emnet "Voksende", "Stigende", "Stabil", "Faldende" eller "Ny trend"?
2. Bestem vinklen: Hvilken journalistisk vinkel passer bedst? (fx "Kritisk analyse", "Succeshistorie", "Kulturel kontekst", "Teknisk dybdegående", "Personlig fortælling", etc.)
3. Identificer målgruppe: Hvem er den primære målgruppe? (fx "Kulturinteresserede", "Early adopters", "Generel læser", "Fagfolk", etc.)
4. Generer 5-7 konkrete forslag til hvordan man kan skrive en original artikel baseret på dette emne UDEN at plagiere. Fokuser på:
   - Specifikke eksperter eller kilder der kunne tilføjes
   - Konkrete statistikker eller data der kunne søges
   - Alternative vinkler eller perspektiver
   - Nye eksempler eller cases der kunne bruges
   - Kulturelle sammenligninger eller historisk kontekst
   - Strukturelle forskelle fra originalen

Returnér KUN et JSON-objekt med denne struktur:
{
  "trend": "Voksende|Stigende|Stabil|Faldende|Ny trend",
  "angle": "konkret journalistisk vinkel",
  "audience": "konkret målgruppe",
  "suggestions": [
    "konkret forslag 1",
    "konkret forslag 2",
    "konkret forslag 3",
    "konkret forslag 4",
    "konkret forslag 5"
  ]
}`;

    const completion = await openai.chat.completions.create({
      model: config.openai.model || 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'Du er en ekspert redaktør og trendanalytiker. Returnér ALTID gyldig JSON uden yderligere tekst eller forklaringer.'
        },
        {
          role: 'user',
          content: analysisPrompt
        }
      ],
      temperature: 0.7,
      max_tokens: 800,
      response_format: { type: 'json_object' }
    });

    const responseText = completion.choices[0]?.message?.content || '{}';
    let analysis;
    
    try {
      analysis = JSON.parse(responseText);
    } catch (parseError) {
      // Fallback if JSON parsing fails
      const parseErrorObj = parseError instanceof Error ? parseError : new Error(String(parseError));
      requestLogger.warn('Failed to parse AI response as JSON', undefined, parseErrorObj);
      analysis = {
        trend: 'Stabil',
        angle: 'Balanceret analyse',
        audience: 'Generel læser',
        suggestions: [
          'Tilføj ekspertcitater fra nye kilder',
          'Inkluder statistikker og data fra alternative kilder',
          'Uddyb baggrundshistorien med nye fakta',
          'Find lignende cases fra andre kontekster',
          'Tilføj kulturelle referencer der ikke er i originalen'
        ]
      };
    }

    // Ensure all fields are present
    if (!analysis.trend) analysis.trend = 'Stabil';
    if (!analysis.angle) analysis.angle = 'Balanceret analyse';
    if (!analysis.audience) analysis.audience = 'Generel læser';
    if (!Array.isArray(analysis.suggestions) || analysis.suggestions.length === 0) {
      analysis.suggestions = [
        'Tilføj ekspertcitater fra nye kilder - ikke samme eksperter som originalen',
        'Inkluder statistikker og data fra alternative kilder for at understøtte argumenter',
        'Uddyb baggrundshistorien med nye fakta og perspektiver',
        'Find lignende cases eller eksempler fra andre kontekster',
        'Tilføj kulturelle referencer og sammenligninger der ikke er i originalen'
      ];
    }

    requestLogger.info('Research article analyzed', {
      hasTitle: !!title,
      hasContent: !!content,
      keyPointsCount: Array.isArray(keyPoints) ? keyPoints.length : 0,
      trend: analysis.trend,
      suggestionsCount: analysis.suggestions.length,
    });

    return NextResponse.json(
      createSuccessResponse(analysis, { requestId }),
      { status: 200 }
    );
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    requestLogger.error('Error analyzing research article', errorObj);
    return NextResponse.json(
      createErrorResponse('Failed to analyze research article', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500 }
    );
  }
}
