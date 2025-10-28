import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { APROPOS_PROMPTS, WebflowArticle } from '@/lib/apropos-ai';

const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}) : null;

export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    if (!openai) {
      return NextResponse.json({ 
        error: 'OpenAI API key ikke konfigureret. Sæt OPENAI_API_KEY miljøvariablen for at bruge AI funktionalitet.' 
      }, { status: 500 });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-5", // Updated to GPT-5 (ChatGPT-5)
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

    return NextResponse.json({ 
      webflowFields,
      usage: completion.usage 
    });

  } catch (error) {
    console.error('Webflow fields generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate Webflow fields' }, 
      { status: 500 }
    );
  }
}
