import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}) : null;

const APROPOS_SYSTEM_PROMPT = `Du er en AI-medskribent for Apropos Magazine. Din rolle er at hjælpe journalister med at skrive artikler i Apropos' karakteristiske stil.

Apropos' tone of voice er inspireret af Martin Kongstad og Casper Christensen:
- Personlig og autentisk
- Skarp og ærlig
- Humoristisk uden at være teknisk eller tør
- Kulturelt bevidst og reflekterende
- Brug af anekdoter og metaforer
- Fokus på oplevelse frem for teknik

Din opgave er at:
1. Hjælpe med at udvikle artikelidéer og vinkler
2. Forbedre tekster og retorik
3. Foreslå stilgreb og strukturer
4. Give konstruktiv feedback
5. Være en kreativ sparringspartner

Svar altid på dansk og hold en venlig, professionel tone. Vær konkret i dine forslag og forklar dine anbefalinger.`;

export async function POST(request: NextRequest) {
  try {
    const { message, articleData, notes, chatHistory } = await request.json();

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    if (!openai) {
      return NextResponse.json({ 
        response: 'OpenAI API key ikke konfigureret. Sæt OPENAI_API_KEY miljøvariablen for at bruge AI funktionalitet.' 
      });
    }

    // Build context from article data and notes
    let context = '';
    if (articleData.title) context += `Titel: ${articleData.title}\n`;
    if (articleData.subtitle) context += `Undertitel: ${articleData.subtitle}\n`;
    if (articleData.category) context += `Kategori: ${articleData.category}\n`;
    if (articleData.content) context += `Nuværende indhold: ${articleData.content.substring(0, 500)}...\n`;
    if (notes) context += `Noter og prompts: ${notes}\n`;

    // Build chat history for context
    const messages: any[] = [
      {
        role: "system",
        content: `${APROPOS_SYSTEM_PROMPT}

**VIGTIG OPGAVE:**
Din rolle er at hjælpe med at bygge en artikel gennem samtale. Alt hvad brugeren skriver og diskuterer med dig skal bruges til at bygge artiklen.

For hver besked, analyser om brugeren:
1. Giver kontekst eller information til artiklen
2. Beder om hjælp til at skrive en specifik del
3. Diskuterer vinkel, tone eller indhold

Når det giver mening, opdater automatisk artikel felterne:
- title: Artikel titel
- subtitle: Undertitel/tagline
- content: Hovedindhold (kan være lang, detaljeret artikel)
- category: Kategori (Gaming, Kultur, Tech, etc.)
- tags: Relevante tags

Returner ALTID både dit svar OG eventuelle artikel opdateringer i dette format:
{
  "response": "dit svar til brugeren",
  "articleUpdate": {
    "title": "...",
    "subtitle": "...",
    "content": "...",
    "category": "...",
    "tags": [...]
  }
}

${context ? `\n\nNuværende artikel kontekst:\n${context}` : ''}`
      }
    ];

    // Add chat history
    if (chatHistory && chatHistory.length > 0) {
      chatHistory.slice(-10).forEach((msg: any) => {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      });
    }

    // Add current message
    messages.push({
      role: "user",
      content: message
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      temperature: 0.7,
      max_tokens: 2000,
    });

    const response = completion.choices[0]?.message?.content;

    if (!response) {
      throw new Error('No response from OpenAI');
    }

    // Try to parse JSON response with article update
    let parsedResponse: any;
    try {
      parsedResponse = JSON.parse(response);
    } catch {
      // If not JSON, treat as plain text response
      parsedResponse = { response };
    }

    return NextResponse.json({ 
      response: parsedResponse.response || response,
      articleUpdate: parsedResponse.articleUpdate,
      usage: completion.usage 
    });

  } catch (error) {
    console.error('OpenAI API error:', error);
    return NextResponse.json(
      { error: 'Failed to get AI response' }, 
      { status: 500 }
    );
  }
}
