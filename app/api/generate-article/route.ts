import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { APROPOS_TOV, APROPOS_PROMPTS } from '@/lib/apropos-ai';

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
          content: APROPOS_PROMPTS.articleGeneration
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 1, // GPT-5 only supports default temperature (1)
      max_completion_tokens: 2000,
    });

    const article = completion.choices[0]?.message?.content;

    if (!article) {
      throw new Error('No article generated from OpenAI');
    }

    return NextResponse.json({ 
      article,
      usage: completion.usage 
    });

  } catch (error) {
    console.error('Article generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate article' }, 
      { status: 500 }
    );
  }
}
