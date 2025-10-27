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

const ARTICLE_FIELD_ALIASES: Record<string, string> = {
  name: 'title',
  title: 'title',
  'seo-title': 'seoTitle',
  'seo_title': 'seoTitle',
  seotitle: 'seoTitle',
  'meta-description': 'seoDescription',
  'meta_description': 'seoDescription',
  metadescription: 'seoDescription',
  'meta-desc': 'seoDescription',
  metadesc: 'seoDescription',
  'post-body': 'content',
  'post_body': 'content',
  postbody: 'content',
  'content-html': 'content',
  'content_html': 'content',
  contenthtml: 'content',
  contentHtml: 'content',
  body: 'content',
  section: 'category',
  category: 'category',
  categoryname: 'category',
  topic: 'topic',
  topics: 'tags',
  tags: 'tags',
  'streaming_service': 'platform',
  'streaming-service': 'platform',
  streamingservice: 'platform',
  platform: 'platform',
  stars: 'rating',
  rating: 'rating',
  'rating-value': 'rating',
  rating_value: 'rating',
  'rating-skipped': 'ratingSkipped',
  'rating_skipped': 'ratingSkipped',
  ratingskipped: 'ratingSkipped',
  press: 'press',
  'publish-date': 'publishDate',
  'publish_date': 'publishDate',
  publishdate: 'publishDate',
  'read-time': 'readTime',
  'read_time': 'readTime',
  readtime: 'readTime',
  wordcount: 'wordCount',
  'word-count': 'wordCount',
  word_count: 'wordCount',
  'author-name': 'author',
  authorname: 'author',
  writer: 'author',
  journalist: 'author',
  'author-tov': 'authorTOV',
  'author_tov': 'authorTOV',
  tov: 'authorTOV',
  'preview-title': 'previewTitle',
  'preview_title': 'previewTitle',
  previewtitle: 'previewTitle',
  'ai-draft': 'aiDraft',
  ai_draft: 'aiDraft',
  aidraft: 'aiDraft',
  'ai-suggestion': 'aiSuggestion',
  ai_suggestion: 'aiSuggestion',
  aisuggestion: 'aiSuggestion'
};

const ARTICLE_CONTAINER_KEYS = new Set([
  'fields',
  'data',
  'attributes',
  'values',
  'payload',
  'article',
  'articleUpdate',
  'article_update',
  'articleData',
  'article_data',
  'entry',
  'item',
  'record',
  'cms'
]);

const flattenArticlePayload = (raw: any): Record<string, any> => {
  const output: Record<string, any> = {};
  const queue: any[] = [raw];
  while (queue.length) {
    const node = queue.shift();
    if (!node || typeof node !== 'object') continue;

    if (Array.isArray(node)) {
      node.forEach(item => queue.push(item));
      continue;
    }

    Object.entries(node).forEach(([key, value]) => {
      if (value === undefined || value === null) return;

      if (Array.isArray(value) && key === 'fields') {
        value.forEach((field: any) => {
          if (!field || typeof field !== 'object') return;
          const slug = field.slug || field.id || field.name || field.key;
          if (!slug) return;
          const fieldValue = field.value ?? field.text ?? field.content ?? field.richText;
          if (fieldValue !== undefined && output[slug] === undefined) {
            output[slug] = fieldValue;
          }
        });
        return;
      }

      if (
        (ARTICLE_CONTAINER_KEYS.has(key) ||
          key.toLowerCase().endsWith('fields') ||
          key.toLowerCase().endsWith('data')) &&
        typeof value === 'object'
      ) {
        queue.push(value);
        return;
      }

      if (output[key] === undefined) {
        output[key] = value;
      }
    });
  }
  return output;
};

const slugify = (value: string) => value
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[^a-z0-9\s-]/g, '')
  .replace(/\s+/g, '-')
  .replace(/-+/g, '-')
  .trim();

const stripHtmlToText = (html: string) => html
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/p>/gi, '\n\n')
  .replace(/<[^>]+>/g, '')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const normalizeArticleUpdatePayload = (raw: any) => {
  if (!raw || typeof raw !== 'object') return raw;
  const flat = flattenArticlePayload(raw);
  const result: Record<string, any> = { ...raw };

  for (const [key, value] of Object.entries(flat)) {
    const alias = ARTICLE_FIELD_ALIASES[key.toLowerCase()] || null;
    if (alias) {
      result[alias] = value;
    }
  }

  if (result.slug && typeof result.slug === 'object') {
    const slugObj = result.slug as any;
    result.slug = [slugObj.current, slugObj.slug, slugObj.permalink, slugObj.value]
      .find((v: any) => typeof v === 'string' && v.trim()) || '';
  }
  if (typeof result.slug === 'string' && result.slug.trim()) {
    result.slug = slugify(result.slug);
  }

  const ratingCandidate = result.rating ?? result.stars ?? result.rating_value ?? result.ratingValue;
  if (typeof ratingCandidate === 'string') {
    const parsed = parseInt(ratingCandidate, 10);
    if (!Number.isNaN(parsed)) result.rating = parsed;
  } else if (typeof ratingCandidate === 'number') {
    result.rating = ratingCandidate;
  }

  if (Array.isArray(result.tags)) {
    result.tags = Array.from(new Set(result.tags
      .map((tag: any) => (typeof tag === 'string' ? tag.trim() : ''))
      .filter((tag: string) => tag.length > 0)));
  } else if (typeof result.tags === 'string') {
    result.tags = Array.from(new Set(result.tags
      .split(/[,;|\n]+/)
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0)));
  }

  if ((!Array.isArray(result.tags) || result.tags.length === 0) && typeof result.topic === 'string') {
    const topic = result.topic.trim();
    if (topic) result.tags = [topic];
  }

  if (result.category && typeof result.category === 'object') {
    const catObj = result.category as any;
    result.category = [catObj.name, catObj.title, catObj.label]
      .find((v: any) => typeof v === 'string' && v.trim()) || result.category;
  }
  if (typeof result.category === 'string') {
    result.category = result.category.trim();
  }

  if (result.author && typeof result.author === 'object') {
    const authorObj = result.author as any;
    result.author = [authorObj.name, authorObj.title, authorObj.fullName]
      .find((v: any) => typeof v === 'string' && v.trim()) || result.author;
    if (typeof authorObj.tov === 'string') {
      result.authorTOV = authorObj.tov.trim();
    }
  }
  if (typeof result.author === 'string') {
    result.author = result.author.trim();
  }
  if (typeof result.authorTOV === 'string') {
    result.authorTOV = result.authorTOV.trim();
  }

  if (typeof result.press === 'string') {
    const lower = result.press.trim().toLowerCase();
    if (lower === 'true') result.press = true;
    else if (lower === 'false') result.press = false;
  }

  if (typeof result.ratingSkipped === 'string') {
    const lower = result.ratingSkipped.trim().toLowerCase();
    if (lower === 'true') result.ratingSkipped = true;
    else if (lower === 'false') result.ratingSkipped = false;
  }

  if (result.aiDraft && typeof result.aiDraft !== 'object') {
    result.aiDraft = { content: result.aiDraft };
  }

  if (result.aiSuggestion && typeof result.aiSuggestion !== 'object') {
    result.aiSuggestion = null;
  }

  if (typeof result.platform === 'string' && !result.streaming_service) {
    result.streaming_service = result.platform.trim();
  }
  if (typeof result.streaming_service === 'string' && !result.platform) {
    result.platform = result.streaming_service.trim();
  }
  if (typeof result.platform === 'string') result.platform = result.platform.trim();
  if (typeof result.streaming_service === 'string') result.streaming_service = result.streaming_service.trim();

  if (typeof result.content !== 'string') {
    const candidates = [flat.content, (flat as any).content_html, (flat as any).contentHtml, (flat as any).body];
    const first = candidates.find((v: any) => typeof v === 'string' && v.trim());
    if (first) result.content = first;
  }
  if (typeof result.content === 'string' && /<[a-z][\s\S]*>/i.test(result.content)) {
    result.content = stripHtmlToText(result.content);
  }

  ['title', 'subtitle', 'seoTitle', 'seoDescription', 'previewTitle'].forEach((field) => {
    const val = (result as any)[field];
    if (typeof val === 'string') {
      (result as any)[field] = val.trim();
    }
  });

  if (!result.slug && typeof result.title === 'string' && result.title.trim()) {
    result.slug = slugify(result.title);
  }

  if (!Array.isArray(result.tags)) result.tags = result.tags ? [result.tags] : [];
  if (!Array.isArray(result.topicsSelected)) result.topicsSelected = [];

  if (typeof result.publishDate === 'string') {
    const trimmed = result.publishDate.trim();
    const parsed = trimmed ? new Date(trimmed) : null;
    if (parsed && !Number.isNaN(parsed.getTime())) {
      result.publishDate = parsed.toISOString();
    } else {
      result.publishDate = trimmed;
    }
  }

  return result;
};

// Try to extract a structured payload from a raw model string
// Helper functions for web search
function shouldPerformWebSearch(message: string, articleData: any): boolean {
  const lowerMessage = message.toLowerCase();
  const lowerContent = (articleData?.content || '').toLowerCase();
  
  // Check for factual claims that need verification
  const factualIndicators = [
    'ifølge', 'ifølge', 'statistik', 'undersøgelse', 'rapport', 'studie',
    'data viser', 'forskning', 'ekspert', 'professor', 'doktor',
    'millioner', 'milliarder', 'procent', '%', 'antal', 'antallet',
    'årstal', 'dato', 'år', 'årgang', 'udgivelse', 'premiere',
    'budget', 'indtægter', 'omsætning', 'pris', 'kostede',
    'anmeldelser', 'score', 'rating', 'bedømmelse', 'kritik',
    'box office', 'streaming', 'platform', 'udgivelse'
  ];
  
  // Check if message contains factual claims
  const hasFactualClaims = factualIndicators.some(indicator => 
    lowerMessage.includes(indicator) || lowerContent.includes(indicator)
  );
  
  // Check if it's about a specific work/person/event
  const hasSpecificSubject = /\b(film|serie|bog|album|kunstner|skuespiller|instruktør|forfatter|anmeld|anmeldelse)\b/i.test(message);
  
  // Check if it's a review request
  const isReviewRequest = /\b(anmeld|anmeldelse|review|bedøm|bedømmelse|kritik|kritiker)\b/i.test(message);
  
  // Check if content is too short (might need more research)
  const contentLength = (articleData?.content || '').split(/\s+/).length;
  const needsMoreContent = contentLength < 500;
  
  // More aggressive search triggers
  return hasFactualClaims || 
         hasSpecificSubject || 
         isReviewRequest || 
         needsMoreContent ||
         // Always search for specific titles/names in quotes or proper nouns
         /"[^"]+"/.test(message) ||
         /[A-Z][a-z]+ [A-Z][a-z]+/.test(message);
}

function extractSearchQuery(message: string, articleData: any): string {
  // Extract key terms from message and article data
  const terms = [];
  
  // First priority: Extract quoted titles or proper nouns
  const quotedTitle = message.match(/"[^"]+"/);
  if (quotedTitle) {
    terms.push(quotedTitle[0].replace(/"/g, ''));
  }
  
  // Extract proper nouns (capitalized words)
  const properNouns = message.match(/[A-Z][a-z]+(?: [A-Z][a-z]+)*/g);
  if (properNouns) {
    // Take the longest proper noun (likely the title)
    const longestProperNoun = properNouns.reduce((a, b) => a.length > b.length ? a : b);
    if (longestProperNoun.length > 5) { // Only if it's substantial
      terms.push(longestProperNoun);
    }
  }
  
  // Add category/topic if available
  if (articleData?.category) terms.push(articleData.category);
  if (articleData?.topic) terms.push(articleData.topic);
  if (articleData?.tags && Array.isArray(articleData.tags)) {
    terms.push(...articleData.tags.slice(0, 2));
  }
  
  // Extract key terms from message (fallback)
  if (terms.length === 0) {
    const messageWords = message.split(/\s+/)
      .filter(word => word.length > 3)
      .slice(0, 5);
    
    terms.push(...messageWords);
  }
  
  // Create search query
  return terms.join(' ');
}

function parseModelPayload(raw: string): { response?: string; suggestion?: any; articleUpdate?: any } {
  const pickField = (obj: any, candidates: string[]) => {
    for (const key of candidates) {
      if (obj && Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
    }
    return undefined;
  };
  const normalizeShape = (obj: any) => {
    if (!obj || typeof obj !== 'object') return obj;
    const aliased = { ...obj };
    const altArticleUpdate = pickField(obj, ['articleUpdate', 'article_update', 'article', 'articleData', 'article_data', 'fields']);
    if (altArticleUpdate && !aliased.articleUpdate) aliased.articleUpdate = altArticleUpdate;
    const altResponse = pickField(obj, ['response', 'reply', 'answer', 'message']);
    if (altResponse && !aliased.response) aliased.response = altResponse;
    const altSuggestion = pickField(obj, ['suggestion', 'suggestions', 'prompt']);
    if (altSuggestion && !aliased.suggestion) aliased.suggestion = altSuggestion;
    return aliased;
  };
  const stripFences = (s: string) => s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const tryParse = (s: string) => {
    try { return JSON.parse(s); } catch { return null; }
  };

  // 1) Try raw JSON
  let obj = normalizeShape(tryParse(raw));
  if (obj && typeof obj === 'object' && (obj.response || obj.articleUpdate || obj.suggestion)) {
    const normalizedUpdate = normalizeArticleUpdatePayload(obj.articleUpdate);
    return { response: String(obj.response || ''), suggestion: obj.suggestion, articleUpdate: normalizedUpdate };
  }

  // 2) Try fenced code block
  const fenced = raw.match(/```[\s\S]*?```/);
  if (fenced) {
    const inner = stripFences(fenced[0]);
    obj = normalizeShape(tryParse(inner));
    if (obj && typeof obj === 'object' && (obj.response || obj.articleUpdate || obj.suggestion)) {
      const normalizedUpdate = normalizeArticleUpdatePayload(obj.articleUpdate);
      return { response: String(obj.response || ''), suggestion: obj.suggestion, articleUpdate: normalizedUpdate };
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
    const { message, articleData, notes, chatHistory, authorTOV, authorName, analysisPrompt } = await request.json();

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
    if (Array.isArray(articleData.tags) && articleData.tags.length) {
      context += `Tags: ${articleData.tags.join(', ')}\n`;
    }
    if (articleData.rating) {
      context += `Bedømmelse (stjerner): ${articleData.rating}\n`;
      // Add rating-based tone guidance
      if (articleData.rating <= 2) {
        context += `TONE: Kritisk og negativ - artiklen skal være skarp, ærlig og ikke skåne kritikken\n`;
      } else if (articleData.rating <= 3) {
        context += `TONE: Blandet og balanceret - artiklen skal være ærlig om både styrker og svagheder\n`;
      } else if (articleData.rating <= 4) {
        context += `TONE: Positiv med forbehold - artiklen skal være generelt positiv men nævne mindre problemer\n`;
      } else if (articleData.rating >= 5) {
        context += `TONE: Meget positiv og entusiastisk - artiklen skal være begejstret og fremhæve alle styrker\n`;
      }
    }
    if ((articleData as any).platform || (articleData as any).streaming_service) {
      const platform = (articleData as any).platform || (articleData as any).streaming_service;
      context += `Platform/Service: ${platform}\n`;
    }
    const researchSelected = (articleData as any).researchSelected;
    if (researchSelected) {
      context += `Research kilde: ${researchSelected.source || 'Ukendt'}\n`;
      if (researchSelected.title) context += `Research artikel: ${researchSelected.title}\n`;
      if (researchSelected.content) context += `Research resume: ${researchSelected.content}\n`;
      if (Array.isArray(researchSelected.keyPoints) && researchSelected.keyPoints.length) {
        context += `Research nøglepunkter: ${researchSelected.keyPoints.join(' • ')}\n`;
      }
    }
    const aiDraft = (articleData as any).aiDraft;
    if (aiDraft?.prompt) {
      context += `AI Draft prompt: ${aiDraft.prompt}\n`;
    }
    if (Array.isArray(aiDraft?.suggestions) && aiDraft.suggestions.length) {
      context += `AI Draft forslag: ${aiDraft.suggestions.join(' | ')}\n`;
    }
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
                  }
                }
              } catch (error) {
                console.error('Could not load trained TOV:', error);
              }
            }
    
    // Build chat history for context
    // Always use the author NAME for the instruction line
    const authorInfo = authorName || 'Apropos Writer';
    const dynamicPrompt = await loadSystemPromptFromApi(request);
    const basePrompt = dynamicPrompt || APROPOS_SYSTEM_PROMPT;
    const combinedTOV = [trainedTOV, authorTOV].filter(Boolean).join('\n\n');
    // Lightweight diagnostics for prompt composition
    // Determine dynamic target lengths from section/topic
    const lower = (s: any) => String(s||'').toLowerCase();
    const sec = lower((articleData||{}).category || (articleData||{}).section);
    const topic = lower((articleData||{}).topic);
    const tagsArr: string[] = Array.isArray((articleData||{}).tags) ? (articleData as any).tags.map((t:any)=>lower(t)) : [];
    const isReview = sec.includes('anmeld') || topic.includes('anmeld') || tagsArr.some(t=>t.includes('anmeld'));
    const targetMin = isReview ? 700 : 1000;
    const targetMax = isReview ? 900 : 1400;
    const systemContent = `${basePrompt}

${combinedTOV ? `FORFATTER TOV (overstyrer generelle regler):\n${combinedTOV}\n` : ''}**VIGTIG: Skriv i ${authorInfo}'s tone of voice!**

**SETUPWIZARD DATA - BRUG DISSE VÆRDIER:**
- Kategori/Sektion: ${sec || 'Ikke valgt'} - skriv artiklen til denne kategori
- Topics/Tags: ${tagsArr.join(', ') || 'Ikke valgt'} - fokuser på disse emner
- Platform: ${(articleData as any).platform || (articleData as any).streaming_service || 'Ikke valgt'} - nævn platformen hvis relevant
- Rating: ${articleData.rating || 'Ikke valgt'} stjerner - tilpas tone til denne bedømmelse

Overhold længdemål i strukturfilen (anmeldelser 700–900 ord; features 1000–1400). Skriv aldrig under 600 ord, medmindre brugeren specifikt beder om kort svar.`;

    // Add hard guidance: transform notes, not copy
    const transformationRules = `\n\nTRANSFORMATION KRAV:\n- Brug noter som råmateriale — omskriv alt; ingen sætninger må være identiske med noterne.\n- Integrér noter i en sammenhængende artikelstruktur (Intro → Brødtekst → Afslutning).\n- Mål: ${targetMin}–${targetMax} ord for denne artikel.`;
    const workflowInstructions = `

**VIGTIG OPGAVE:**
Din rolle er at hjælpe med at bygge en artikel gennem samtale. Alt hvad brugeren skriver og diskuterer med dig skal bruges til at bygge artiklen.

For hver besked, analyser om brugeren:
1. Giver kontekst eller information til artiklen
2. Beder om hjælp til at skrive en specifik del
3. Diskuterer vinkel, tone eller indhold

STANDARD-OPFØRSEL (intelligent artikeludvikling):
- Hvis der er research data tilgængelig: SKRIV HELE ARTIKLEN med alle fakta og detaljer
- Hvis ingen research: byg artiklen gradvist gennem samtale med brugeren
- For hver besked: analyser hvad brugeren ønsker og tilføj/forbedre artiklen
- Brug sektion, rating og forfatter TOV til at guide tonen og strukturen
- Hvis titel er tvivlsom: foreslå 2–3 titler som klikbare valg

AUTOMATISK ARTIKELGENERERING (når research er tilgængelig):
- Skriv komplet artikel med intro, brødtekst og afslutning
- Integrér alle research data naturligt i teksten
- Brug konkrete fakta, statistikker og ekspertperspektiver
- Følg længdekrav: Anmeldelser 700-900 ord, Features 1000-1400 ord
- Undgå at spørge om flere detaljer - skriv artiklen direkte

ARTIKELSTRUKTUR (følg Apropos struktur):
- Intro: 2-4 linjer, første person, sætter tone og nysgerrighed
- Brødtekst: ${targetMin}-${targetMax} ord, sammenhængende fortælling
- Afslutning: 2-4 sætninger, reflekterende/humoristisk/poetisk
- Brug "Eftertanke", "Refleksion", "I virkeligheden" som afslutningslabels

LÆNGDEKRITIKER:
- Anmeldelser: 700-900 ord (ikke under 600)
- Features/Kultur: 1000-1400 ord (ikke under 800)
- Altid skriv fulde artikler - ikke korte sammenfatninger
- Brug sanselige detaljer og personlige observationer

FORSKNING OG FAKTUALITET:
- Hvis web search resultater er inkluderet, BRUG dem til at underbygge dine påstande
- Citer konkrete data, statistikker og fakta fra kilderne
- Undgå at opdigte information - altid baser på faktuelle kilder
- Hvis du ikke har fakta, bed om mere specifik information i stedet for at gætte

KRITISK VIGTIGT FOR ANMELDELSER:
- Hvis du skriver en anmeldelse af et specifikt værk, SKAL du bruge web search resultaterne
- Inkluder konkrete detaljer: instruktør, skuespillere, udgivelsesdato, genre, budget
- Nævn faktuelle data: box office tal, streaming tal, kritiker scores
- Undgå generiske beskrivelser - brug specifikke detaljer fra research
- Hvis ingen research er tilgængelig, bed om mere specifik information

AVANCERET RESEARCH INTEGRATION:
- Hvis "AVANCERET RESEARCH" er inkluderet, BRUG alle data systematisk
- Integrér "Hovedfund" naturligt i artiklen - ikke som liste
- Brug "Kulturel Kontekst" til at sætte emnet i perspektiv
- Inkorporér "Ekspertperspektiver" som autoritative synspunkter
- Følg "Foreslåede Vinkler" for at finde den bedste artikelvinkel
- Altid citér kilder og underbyg påstande med research data

KRITISK: Hvis research data er tilgængelig, SKRIV HELE ARTIKLEN NU - ikke spørg om flere detaljer!

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

VIKTIGT: Når du genererer en artikel, skal du ALTID udfylde alle felter i articleUpdate:
- title: SEO-titel (max 60 tegn) - Format: [Værk] (Platform): [Fængende undertitel]
- subtitle: Kreativ undertitel (8-14 ord) - Skal være reflekterende eller ironisk
- content: Fuld artikeltekst
- slug: URL-venligt slug
- seo_title: SEO-titel (samme som title)
- meta_description: Meta beskrivelse (max 155 tegn)
- streaming_service: Platform hvis relevant
- stars: Stjerner (1-6) hvis anmeldelse

TITEL FORMAT EKSEMPLER:
- "Paradise (Disflix+): Livets vrangside i glitter og gas"
- "KPOP Demon Hunters (Netflix): En kulturel kollision af lyd og lys"

UNDERTITEL EKSEMPLER:
- "Et sted mellem pop, dæmoner og selvindsigt."
- "En KPOP anime-musical der overrasker og forfører."

KRITISK: Du SKAL returnere et gyldigt JSON objekt med både "response" og "articleUpdate" felter. articleUpdate.content skal indeholde den fulde artikeltekst.

${context ? `\n\nNuværende artikel kontekst:\n${context}` : ''}`;

    const finalSystemContent = systemContent + transformationRules + workflowInstructions;
    
    const messages: any[] = [];

    // Add chat history
    if (chatHistory && chatHistory.length > 0) {
      chatHistory.slice(-10).forEach((msg: any) => {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      });
    }

    const userMessageContent = analysisPrompt && typeof analysisPrompt === 'string' && analysisPrompt.trim().length > 0
      ? `${message}\n\n[Research Analyse Prompt]\n${analysisPrompt.trim()}`
      : message;

    // Add current message
    messages.push({
      role: "user",
      content: userMessageContent
    });

    // Enhanced workflow: Research → Generate → Quality Check → Enhance
    const needsWebSearch = shouldPerformWebSearch(message, articleData);
    let webSearchResults = '';
    let researchData = null;
    
    if (needsWebSearch) {
      try {
        const searchQuery = extractSearchQuery(message, articleData);
        
        // 1. Enhanced Research Engine
        const researchResponse = await fetch(`${request.url.split('/api')[0]}/api/research-engine`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            topic: searchQuery, 
            articleType: (articleData as any).category || 'Generel',
            author: authorName || 'Apropos Writer'
          })
        });
        
        if (researchResponse.ok) {
          researchData = await researchResponse.json();
          if (researchData.success && researchData.researchSummary) {
            webSearchResults = `\n\n**AVANCERET RESEARCH:**\n${researchData.researchSummary}\n\n`;
            
            // Add key findings
            if (researchData.keyFindings?.length > 0) {
              webSearchResults += `**Hovedfund:**\n`;
              researchData.keyFindings.slice(0, 3).forEach((finding: any, index: number) => {
                webSearchResults += `${index + 1}. ${finding}\n`;
              });
              webSearchResults += '\n';
            }
            
            // Add cultural context
            if (researchData.culturalContext?.length > 0) {
              webSearchResults += `**Kulturel Kontekst:**\n${researchData.culturalContext.slice(0, 2).join('\n')}\n\n`;
            }
            
            // Add expert insights
            if (researchData.expertInsights?.length > 0) {
              webSearchResults += `**Ekspertperspektiver:**\n${researchData.expertInsights.slice(0, 2).join('\n')}\n\n`;
            }
            
            // Add suggested angles
            if (researchData.suggestedAngles?.length > 0) {
              webSearchResults += `**Foreslåede Vinkler:**\n${researchData.suggestedAngles.join('\n')}\n\n`;
            }
          }
        }
        
        // Fallback to simple web search if research engine fails
        if (!researchData?.success) {
          const searchResponse = await fetch(`${request.url.split('/api')[0]}/api/web-search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: searchQuery, maxResults: 3 })
          });
          
          if (searchResponse.ok) {
            const searchData = await searchResponse.json();
            if (searchData.results && searchData.results.length > 0) {
              webSearchResults = '\n\n**FAKTUEL RESEARCH (fra web search):**\n';
              searchData.results.forEach((result: any, index: number) => {
                webSearchResults += `${index + 1}. ${result.title}\n${result.content}\n`;
                if (result.url) webSearchResults += `Kilde: ${result.url}\n`;
                webSearchResults += '\n';
              });
            }
          }
        }
        
        // Add research results to the user message
        if (webSearchResults) {
          messages[messages.length - 1].content += webSearchResults;
        }
      } catch (error) {
        console.error('Research failed:', error);
      }
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: 'system', content: finalSystemContent },
        ...messages
      ],
      temperature: 0.7,
      max_tokens: 3000,
      response_format: { type: 'json_object' },
    });

    const rawMessageContent = completion.choices[0]?.message?.content;
    const responseText = Array.isArray(rawMessageContent)
      ? rawMessageContent.map((part: any) => {
          if (typeof part === 'string') return part;
          if (part && typeof part === 'object' && typeof part.text === 'string') return part.text;
          return '';
        }).join('')
      : (rawMessageContent || '');
    const normalizedResponse = typeof responseText === 'string' ? responseText : String(responseText || '');

    if (!normalizedResponse.trim()) {
      throw new Error('No response from OpenAI');
    }

    // Parse/sanitize model output and enforce JSON contract
    let parsed = parseModelPayload(normalizedResponse);
    let outResponse = parsed.response;
    let outSuggestion = parsed.suggestion ?? null;
    let outArticleUpdate = normalizeArticleUpdatePayload(parsed.articleUpdate);
    if ((!outResponse || !String(outResponse).trim()) && outArticleUpdate && typeof outArticleUpdate === 'object') {
      const contentFallback = (outArticleUpdate as any).content || (outArticleUpdate as any).content_html || (outArticleUpdate as any).contentHtml;
      if (typeof contentFallback === 'string' && contentFallback.trim().length > 0) {
        outResponse = contentFallback;
      }
    }

    // Fallback: if model didn't return JSON, wrap raw text into contract
    if (!outResponse && !outArticleUpdate && !outSuggestion) {
      outResponse = normalizedResponse.trim();
      outArticleUpdate = {};
      outSuggestion = null;
    }

    // Enhanced Quality Check and Content Enhancement
    let qualityScore = 0;
    let qualityRecommendations: string[] = [];
    let enhancedContent = outResponse;
    
    if (outResponse && outResponse.length > 100) {
      try {
        // 2. Quality Check
        const qualityResponse = await fetch(`${request.url.split('/api')[0]}/api/quality-check`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: outResponse,
            articleType: (articleData as any).category || 'Generel',
            author: authorName || 'Apropos Writer'
          })
        });
        
        if (qualityResponse.ok) {
          const qualityData = await qualityResponse.json();
          qualityScore = qualityData.overallScore || 0;
          qualityRecommendations = qualityData.recommendations || [];
          
          // 3. Content Enhancement if quality is below 80
          if (qualityScore < 80) {
            const enhancerResponse = await fetch(`${request.url.split('/api')[0]}/api/content-enhancer`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                content: outResponse,
                articleType: (articleData as any).category || 'Generel',
                author: authorName || 'Apropos Writer',
                targetLength: outResponse.split(/\s+/).length < 800 ? 1000 : outResponse.split(/\s+/).length
              })
            });
            
            if (enhancerResponse.ok) {
              const enhancerData = await enhancerResponse.json();
              if (enhancerData.success && enhancerData.enhancedContent) {
                enhancedContent = enhancerData.enhancedContent;
                
                // Update articleUpdate with enhanced content
                if (outArticleUpdate && typeof outArticleUpdate === 'object') {
                  (outArticleUpdate as any).content = enhancedContent;
                }
                
                // Add enhancement info to response
                outResponse = `${enhancedContent}\n\n---\n*Artikel forbedret med AI-assistance (Kvalitetsscore: ${qualityScore} → ${Math.min(qualityScore + 20, 100)})*`;
              }
            }
          }
        }
      } catch (error) {
        console.error('Quality check/enhancement failed:', error);
      }
    }

    // --- Server-side validator & optional auto-revision ---
    const countWords = (s: string) => (s||'').trim().split(/\s+/).filter(Boolean).length;
    const hasIntro = (s: string) => /\bintro\s*:/i.test(s);
    const hasEnding = (s: string) => /(eftertanke|refleksion|i virkeligheden|og hvad så\?|lad os bare sige det sådan her)/i.test(s);
    const overlapRatio = (() => {
      try {
        const a = String(notes||'').replace(/\s+/g,' ').toLowerCase();
        const b = String(outArticleUpdate?.content||'').replace(/\s+/g,' ').toLowerCase();
        if (!a || !b) return 0;
        // crude char overlap using substrings length >= 40
        let overlap = 0;
        const parts = a.split(/[\.!?]\s+/).map(x=>x.trim()).filter(x=>x.length>=40);
        for (const p of parts) { if (b.includes(p)) overlap += p.length; }
        const base = Math.max(1, a.length);
        return overlap/base;
      } catch { return 0; }
    })();
    const wc = countWords(outArticleUpdate?.content||'');
    const needsLength = wc < targetMin;
    const needsStructure = !(hasIntro(outArticleUpdate?.content||'') && hasEnding(outArticleUpdate?.content||''));
    const tooSimilar = overlapRatio > 0.25; // 25% or more is suspicious

    if (needsLength || needsStructure || tooSimilar) {
      // Build a precise revision instruction
      const issues: string[] = [];
      if (needsLength) issues.push(`Udvid til mindst ${targetMin} ord (mål: ${targetMin}–${targetMax}).`);
      if (needsStructure) issues.push('Tilføj tydelig “Intro:” samt en afsluttende sektion med et af de godkendte labels.');
      if (tooSimilar) issues.push('Omskriv og parafrasér — undgå sætninger identiske med brugerens noter.');

      const revisionMessages = [
        { role: 'system', content: finalSystemContent },
        { role: 'user', content: `Revider artiklen ud fra disse krav:\n- ${issues.join('\n- ')}\n\nReturnér KUN ét JSON-objekt i samme kontrakt som før (articleUpdate.content skal være den fulde artikel).\n\nAktuel artikel JSON:\n${JSON.stringify({ response: outResponse, suggestion: outSuggestion, articleUpdate: outArticleUpdate }).slice(0,12000)}` }
      ];

      const revision = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: revisionMessages as any,
        temperature: 0.6,
        max_tokens: 3200,
        response_format: { type: 'json_object' },
      });
      const revisionContentRaw = revision.choices[0]?.message?.content;
      const revisionText = Array.isArray(revisionContentRaw)
        ? revisionContentRaw.map((part: any) => {
            if (typeof part === 'string') return part;
            if (part && typeof part === 'object' && typeof part.text === 'string') return part.text;
            return '';
          }).join('')
        : (revisionContentRaw || '');
      const revisionNormalized = typeof revisionText === 'string' ? revisionText : String(revisionText || '');
      const reParsed = parseModelPayload(revisionNormalized);
      if (reParsed?.articleUpdate) {
        outResponse = reParsed.response || outResponse;
        outSuggestion = reParsed.suggestion ?? outSuggestion;
        outArticleUpdate = normalizeArticleUpdatePayload({ ...(outArticleUpdate||{}), ...reParsed.articleUpdate });
      }
      if ((!outResponse || !String(outResponse).trim()) && reParsed?.articleUpdate) {
        const revContent = (reParsed.articleUpdate as any).content || (reParsed.articleUpdate as any).content_html || (reParsed.articleUpdate as any).contentHtml;
        if (typeof revContent === 'string' && revContent.trim()) {
          outResponse = revContent;
        }
      }
    }

    // Final salvage: if model still didn't supply articleUpdate.content but response is long text, use it
    const finalContentWords = (() => {
      if (outArticleUpdate && typeof outArticleUpdate.content === 'string') return outArticleUpdate.content.trim().split(/\s+/).length;
      return 0;
    })();
    if ((!outArticleUpdate || !outArticleUpdate.content) && (outResponse||'').trim().split(/\s+/).length >= 600) {
      outArticleUpdate = normalizeArticleUpdatePayload({ ...(outArticleUpdate||{}), content: outResponse });
    }


    const finalResponse = typeof outResponse === 'string' ? outResponse.trim() : '';

    const finalArticleUpdate = (outArticleUpdate && typeof outArticleUpdate === 'object') ? outArticleUpdate : {};

    return NextResponse.json({ 
      response: finalResponse,
      suggestion: outSuggestion,
      articleUpdate: finalArticleUpdate,
      usage: completion.usage,
      // Enhanced quality metrics
      qualityMetrics: {
        score: qualityScore,
        recommendations: qualityRecommendations,
        enhanced: qualityScore < 80,
        researchUsed: !!researchData?.success,
        wordCount: enhancedContent.split(/\s+/).length,
        readingTime: Math.ceil(enhancedContent.split(/\s+/).length / 160)
      }
    });

  } catch (error) {
    console.error('OpenAI API error:', error);
    return NextResponse.json(
      { error: 'Failed to get AI response' }, 
      { status: 500 }
    );
  }
}
