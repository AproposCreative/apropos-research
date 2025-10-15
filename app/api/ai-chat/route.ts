import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}) : null;

function loadExternalSystemPrompt(): string | null {
  try {
    const fs = require('fs');
    const path = require('path');
    const p = path.join(process.cwd(), 'prompts', 'apropos_writer.prompt');
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, 'utf8');
    }
    return null;
  } catch {
    return null;
  }
}

const APROPOS_SYSTEM_PROMPT = (loadExternalSystemPrompt() || `Du er en AI-medskribent for Apropos Magazine. Din rolle er at hjælpe journalister med at skrive artikler i Apropos' karakteristiske stil.

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

Svar altid på dansk og hold en venlig, professionel tone. Vær konkret i dine forslag og forklar dine anbefalinger.`);

async function loadSystemPromptFromApi(req: NextRequest): Promise<string | null> {
  try {
    const proto = req.headers.get('x-forwarded-proto') || 'http';
    const host = req.headers.get('host');
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || (host ? `${proto}://${host}` : 'http://localhost:3001');
    
    // Load central prompt
    const centralRes = await fetch(`${baseUrl}/api/prompts/apropos`, { cache: 'no-store' });
    if (!centralRes.ok) return null;
    
    let centralPrompt = await centralRes.text();
    if (!centralPrompt || centralPrompt.length < 50) return null;
    
    // Load structure file
    const fs = require('fs');
    const path = require('path');
    const structurePath = path.join(process.cwd(), 'prompts', 'structure.apropos.md');
    
    if (fs.existsSync(structurePath)) {
      const structureContent = fs.readFileSync(structurePath, 'utf8');
      // Replace the placeholder with actual structure content
      centralPrompt = centralPrompt.replace(
        'STRUCTURE LAYER (v3)\n[This section will be dynamically loaded from prompts/structure.apropos.md]',
        `STRUCTURE LAYER (v3)\n${structureContent}`
      );
    }
    
    // Load field mapping rules for enhanced field accuracy
    const rulesPath = path.join(process.cwd(), 'data', 'field-mapping-rules.json');
    if (fs.existsSync(rulesPath)) {
      const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
      
      // Add field mapping guidance to the prompt
      const fieldMappingGuidance = `

FIELD MAPPING GUIDANCE (Learned from 100 real articles):
- ALWAYS include core fields: ${rules.required.join(', ')}
- Include intro for most articles (99% have it)
- Include subtitle for most articles (67% have it)
- Include rating (stjerne) only for reviews
- Include streaming links only for streaming content
- Include event fields only for events/festivals
- Use exact Webflow field names: ${Object.entries(rules.mapping).map(([k,v]) => `${k} → ${v}`).join(', ')}
`;
      
      centralPrompt += fieldMappingGuidance;
    }
    
    return centralPrompt;
  } catch (error) {
    console.error('Error loading system prompt:', error);
    return null;
  }
}

// Try to extract a structured payload from a raw model string
function parseModelPayload(raw: string): { response?: string; suggestion?: any; articleUpdate?: any } {
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

  // 4) No parse
  return {};
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
    const dynamicPrompt = await loadSystemPromptFromApi(request);
    const basePrompt = dynamicPrompt || APROPOS_SYSTEM_PROMPT;
    const systemContent = `${basePrompt}

${trainedTOV ? `FORFATTER TOV (overstyrer generelle regler):\n${trainedTOV}\n` : ''}**VIGTIG: Skriv i ${authorInfo}'s tone of voice!**`;
    
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

STANDARD-OPFØRSEL (når noter/kontekst foreligger):
- Skriv hele artiklen i én sammenhængende tekst i korrekt TOV for ${authorInfo}.
- Brug sektion og rating hvis sat. Vælg selv vinkel, intro og afslut med refleksion.
- Stil KUN spørgsmål, hvis en nødvendig detalje er uklar. Ellers fortsæt.
- Hvis titel er tvivlsom: foreslå 2–3 titler som klikbare valg.

TRIGGER FOR FULD ARTIKEL (uden spørgsmål):
- Hvis \"Noter og prompts\" er længere end 120 tegn, ELLER hvis der er både forfatter + kategori + mindst én af (title, tags, content), så skriv hele artiklen uden at spørge først.

Opdater automatisk CMS-felter:
- title: Artikel titel
- subtitle: Undertitel/tagline
- content: Færdig artikeltekst
- reflection: Afsluttende refleksion
- category: Kategori (Gaming, Kultur, Tech, etc.)
- tags: Relevante tags
- author: ${authorInfo}
- seo_title: ≤60 tegn
- meta_description: ≤155 tegn
- streaming_service/platform: hvis relevant
- stars: 1–6 ved anmeldelser
- slug: kort URL‑slug (kebab‑case, dansk tegnsætning håndteres)

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

Hvis titelvalg er uklart, kan du i stedet bruge:
{
  "response": "...",
  "suggestion": {
    "type": "title_choice",
    "title": "Hvilken titel foretrækker du?",
    "options": ["Titel A", "Titel B", "Titel C"]
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
    "reflection": "...",
    "category": "...",
    "tags": [...],
    "author": "${authorInfo}",
    "seo_title": "...",
    "meta_description": "...",
    "streaming_service": "...",
    "stars": 1-6,
    "slug": "..."
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

    // Parse/sanitize model output and enforce JSON contract
    const parsed = parseModelPayload(response);
    let outResponse = parsed.response;
    let outSuggestion = parsed.suggestion ?? null;
    let outArticleUpdate = parsed.articleUpdate;

    // Fallback: if model didn't return JSON, wrap raw text into contract
    if (!outResponse && !outArticleUpdate && !outSuggestion) {
      outResponse = response.trim();
      outArticleUpdate = {};
      outSuggestion = null;
    }

    return NextResponse.json({
      response: outResponse || '',
      suggestion: outSuggestion,
      articleUpdate: outArticleUpdate,
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
