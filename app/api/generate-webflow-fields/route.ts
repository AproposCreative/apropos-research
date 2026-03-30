import { NextRequest, NextResponse } from 'next/server';
import { getOpenAIClient, models } from '@/lib/openai';
import { APROPOS_PROMPTS, WebflowArticle } from '@/lib/apropos-ai';
import { logger, createRequestLogger } from '@/lib/logger';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';

const openai = getOpenAIClient();

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const requestLogger = createRequestLogger(requestId);
  
  try {
    const { prompt } = await request.json();

    if (!prompt) {
      requestLogger.warn('Missing prompt in request');
      return NextResponse.json(
        createErrorResponse('Prompt is required', {
          statusCode: 400,
          errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
          requestId,
        }),
        { status: 400 }
      );
    }

    if (!openai) {
      requestLogger.error('OpenAI client not initialized');
      return NextResponse.json(
        createErrorResponse('OpenAI API key ikke konfigureret. Sæt OPENAI_API_KEY miljøvariablen for at bruge AI funktionalitet.', {
          statusCode: 500,
          errorCode: ErrorCode.MISSING_API_KEY,
          requestId,
        }),
        { status: 500 }
      );
    }

    const completion = await openai.chat.completions.create({
      model: models.default,
      messages: [
        {
          role: "system",
          content: APROPOS_PROMPTS.webflowFields
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 1, // GPT-5 only supports default temperature (1)
      max_completion_tokens: 1500,
    });

    const response = completion.choices[0]?.message?.content;

    if (!response) {
      throw new Error('No Webflow fields generated from OpenAI');
    }

    // Parse the JSON response
    let webflowFields: WebflowArticle;
    try {
      webflowFields = JSON.parse(response);
    } catch (parseError) {
      // If JSON parsing fails, create a structured response
      webflowFields = {
        title: 'Generated Article',
        slug: 'generated-article',
        excerpt: 'Auto-generated excerpt',
        category: 'Generel',
        tags: ['AI Generated'],
        author: 'Frederik Kragh',
        publishedDate: new Date().toISOString(),
        content: response,
        metaDescription: 'Auto-generated meta description',
        socialTitle: 'Generated Article',
        socialDescription: 'Auto-generated social description',
        seoTitle: 'Generated Article',
        seoDescription: 'Auto-generated SEO description',
        readingTime: 5,
        wordCount: response.split(' ').length,
        status: 'draft'
      };
    }

    requestLogger.info('Webflow fields generated successfully', {
      hasWebflowFields: !!webflowFields,
      usage: completion.usage,
    });

    return NextResponse.json(
      createSuccessResponse({
        webflowFields,
        usage: completion.usage 
      }, { requestId })
    );

  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    requestLogger.error('Webflow fields generation error', errorObj);
    return NextResponse.json(
      createErrorResponse('Failed to generate Webflow fields', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500 }
    );
  }
}
