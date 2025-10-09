import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}) : null;

const APROPOS_SYSTEM_PROMPT = `Du er en AI-medskribent for Apropos Magazine. Din rolle er at hjælpe journalister med at skrive artikler i Apropos' karakteristiske stil.

🧠 APROPOS MAGAZINE - REDAKTIONELT MANIFEST

🎯 MISSION:
Apropos Magazine er et reklamefrit, digitalt kulturtidsskrift skrevet med kærlighed til det personlige take. Vi skriver ikke for at tækkes — vi skriver for at forstå, bevæge og begejstre.

✍️ GRUNDPRINCIPPER FOR APROPOS-STIL:

1. ALT SKAL KUNNE MÆRKES
   - Sproget skal have tekstur, kant og rytme
   - Personligt, uventet, poetisk eller ironisk
   - Det vigtigste er, at det føles ægte

2. VI SKRIVER TIL HOVEDET GENNEM MAVEN
   - Det intellektuelle må gerne være højt, men det følelsesmæssige skal med
   - Beskriv stemninger, rum, mennesker og lyd – ikke bare pointer

3. ALDRIG CORPORATE, ALDRIG CLICKBAIT
   - Vi skriver ikke for at please søgemaskiner eller pressebureauer
   - Det er altid det subjektive blik, der bærer teksten

4. INGEN FASTE SKABELONER
   - Artikler må ligne essays, anmeldelser, breve, samtaler eller indre monologer
   - Struktur er sekundært — tonen og nærværet er det primære

5. AFSLUTNINGEN SKAL EFTERLADE EN TANKE
   - Tekster ender ikke — de reflekterer, klinger ud eller stiller et nyt spørgsmål
   - "Refleksion", "I virkeligheden…" eller "Lad os bare sige det sådan her…" er typiske afslutninger

💡 FÆLLES STILGREB:
- Metabevidsthed: Artikler må gerne kommentere på sig selv
- Rytme og pauser: Brug korte sætninger til effekt. Langsomme afsnit skaber ro
- Dialog og bevægelse: Sproget må danse mellem observation og refleksion
- Sanselighed: Lyd, lugt, bevægelse, rum. Læseren skal være der fysisk
- Humor: Ikke for at underholde, men for at skabe menneskelighed

Din opgave er at:
1. Hjælpe med at udvikle artikelidéer og vinkler
2. Forbedre tekster og retorik
3. Foreslå stilgreb og strukturer
4. Give konstruktiv feedback
5. Være en kreativ sparringspartner

Svar altid på dansk og hold en venlig, professionel tone. Vær konkret i dine forslag og forklar dine anbefalinger.`;

// Try to extract a structured payload from a raw model string
function parseModelPayload(raw: string): { response: string; suggestion?: any; articleUpdate?: any } {
  const stripFences = (s: string) => s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const tryParse = (s: string) => {
    try { return JSON.parse(s); } catch { return null; }
  };

  // 1) Try raw JSON
  let obj = tryParse(raw);
  if (obj && typeof obj === 'object' && (obj.response || obj.articleUpdate || obj.suggestion)) {
    return { response: String(obj.response || ''), suggestion: obj.suggestion, articleUpdate: obj.articleUpdate };
  }

  // 2) Try fenced code block
  const fenced = raw.match(/```[\s\S]*?```/);
  if (fenced) {
    const inner = stripFences(fenced[0]);
    obj = tryParse(inner);
    if (obj && typeof obj === 'object' && (obj.response || obj.articleUpdate || obj.suggestion)) {
      return { response: String(obj.response || ''), suggestion: obj.suggestion, articleUpdate: obj.articleUpdate };
    }
  }

  // 3) Try to regex grab response string from JSON-like text
  const m = raw.match(/"response"\s*:\s*"([\s\S]*?)"\s*(?:,|\})/);
  if (m) {
    // Unescape common sequences
    const unescaped = m[1]
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"');
    return { response: unescaped };
  }

  // 4) Fallback to plain text
  return { response: raw };
}

export async function POST(request: NextRequest) {
  try {
    const { message, articleData, notes, chatHistory, authorTOV, authorName } = await request.json();

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

            // Load trained TOV for author if available
            let trainedTOV = '';
            if (authorName) {
              try {
                // First try to get TOV from Webflow API
                const proto = request.headers.get('x-forwarded-proto') || 'http';
                const host = request.headers.get('host');
                const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || (host ? `${proto}://${host}` : 'http://localhost:3001');
                const webflowResponse = await fetch(`${baseUrl}/api/webflow/authors`);
                if (webflowResponse.ok) {
                  const webflowData = await webflowResponse.json();
                  const author = webflowData.authors?.find((a: any) => a.name === authorName);
                  if (author?.tov) {
                    trainedTOV = author.tov;
                    console.log(`✓ Loaded Webflow TOV for ${authorName}`);
                  }
                }
                
                // Fallback to file system
                if (!trainedTOV) {
                  const fs = require('fs');
                  const path = require('path');
                  const authorSlug = authorName.toLowerCase().replace(/\s+/g, '-');
                  const tovFile = path.join(process.cwd(), 'data', 'author-prompts', `${authorSlug}.txt`);
                  
                  if (fs.existsSync(tovFile)) {
                    trainedTOV = fs.readFileSync(tovFile, 'utf8');
                    console.log(`✓ Loaded file-based TOV for ${authorName}`);
                  }
                }
              } catch (error) {
                console.error('Could not load trained TOV:', error);
              }
            }
    
    // Build chat history for context
    const authorInfo = authorTOV || authorName || 'Frederik Kragh';
    const systemContent = trainedTOV || `${APROPOS_SYSTEM_PROMPT}

**VIGTIG: Skriv i ${authorInfo}'s tone of voice!**`;
    
    const messages: any[] = [
      {
        role: "system",
        content: systemContent + `

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
- author: ${authorInfo}

**RATING FORSLAG:**
Hvis brugeren beskriver noget der skal anmeldes (film, serie, musik, bog, etc.), foreslå en rating ved at inkludere "suggestion" i dit svar:

Eksempel:
{
  "response": "dit svar til brugeren",
  "suggestion": {
    "type": "rating",
    "title": "Vil du give en rating?",
    "description": "Hvor mange stjerner vil du give dette?",
    "options": [1, 2, 3, 4, 5, 6]
  },
  "articleUpdate": {...}
}

Returner ALTID både dit svar OG eventuelle artikel opdateringer i dette format:
{
  "response": "dit svar til brugeren",
  "suggestion": null (eller suggestion objekt hvis rating er relevant),
  "articleUpdate": {
    "title": "...",
    "subtitle": "...",
    "content": "...",
    "category": "...",
    "tags": [...],
    "author": "${authorInfo}"
  }
}

Hvis der ikke er nogen artikel opdatering eller forslag, returner:
{
  "response": "dit svar til brugeren",
  "suggestion": null,
  "articleUpdate": {}
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

    // Parse/sanitize model output to avoid exposing JSON/brackets in chat
    const parsed = parseModelPayload(response);

    return NextResponse.json({ 
      response: parsed.response,
      suggestion: parsed.suggestion || null,
      articleUpdate: parsed.articleUpdate,
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
