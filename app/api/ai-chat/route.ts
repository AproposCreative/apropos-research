import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { 
  performComprehensiveResearch, 
  verifyContent, 
  formatResearchForPrompt,
  type ResearchSources,
  type VerificationResult 
} from '@/lib/research-verification-service';

// Progress tracking stubs (UI handles loading timeline locally)
const initProgress = (..._args: any[]) => {};
const updateProgressStep = (..._args: any[]) => {};
const completeProgress = (..._args: any[]) => {};
const getProgress = (..._args: any[]) => null;

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

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

const fs = require('fs');
const path = require('path');

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

const AUTHOR_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

let cachedAuthors: { expires: number; authors: any[] } | null = null;

const getCachedAuthors = async (baseUrl: string) => {
  if (cachedAuthors && cachedAuthors.expires > Date.now()) {
    return cachedAuthors.authors;
  }

  try {
    const response = await fetch(`${baseUrl}/api/webflow/authors`, { cache: 'no-store' });
    if (!response.ok) return null;
    const data = await response.json();
    if (Array.isArray(data.authors)) {
      cachedAuthors = {
        authors: data.authors,
        expires: Date.now() + AUTHOR_CACHE_TTL
      };
      return data.authors;
    }
  } catch (error) {
    console.error('Author cache fetch failed:', error);
  }

  return null;
};

const determineWordTargets = (articleData: any) => {
  const lower = (value: any) => (value ? String(value).toLowerCase() : '');
  const section = lower(articleData?.category ?? articleData?.section);
  const topic = lower(articleData?.topic);
  const tags = Array.isArray(articleData?.tags)
    ? articleData.tags.map((tag: any) => lower(tag))
    : [];
  const combined = [section, topic, ...tags].filter(Boolean);
  const includesAny = (...needles: string[]) =>
    needles.some((needle) =>
      combined.some((value) => value.includes(needle))
    );

  // Enhanced dynamic behavior with more granular targeting
  if (includesAny('koncert', 'concert', 'live', 'show', 'festival')) {
    return { min: 700, max: 900, label: 'koncertanmeldelse', type: 'review' };
  }

  if (includesAny('serie', 'film', 'movie', 'streaming', 'sæson', 'episode')) {
    return { min: 900, max: 1100, label: 'serie/film anmeldelse', type: 'review' };
  }

  if (includesAny('gaming', 'spil', 'tech', 'teknologi', 'gadget')) {
    return { min: 1000, max: 1200, label: 'gaming/tech feature', type: 'feature' };
  }

  if (includesAny('anmeld', 'review', 'kritik', 'critique')) {
    return { min: 1100, max: 1300, label: 'anmeldelse', type: 'review' };
  }

  if (includesAny('essay', 'kommentar', 'commentary', 'opinion', 'perspektiv')) {
    return { min: 1100, max: 1300, label: 'kommentar/essay', type: 'opinion' };
  }

  if (includesAny('feature', 'kultur', 'portræt', 'portraet', 'magasin', 'interview', 'longread', 'profil')) {
    return { min: 1200, max: 1500, label: 'feature', type: 'feature' };
  }

  // Default to longform targets so vi undgår korte tekster
  return { min: 1100, max: 1300, label: 'longform', type: 'general' };
};

const authorPromptCache = new Map<string, boolean>();
const authorPromptTextCache = new Map<string, string>();
let cachedArticleDataset: { expires: number; items: any[] } | null = null;
const authorSampleCache = new Map<string, string>();

const authorNameToSlug = (name: string) =>
  String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();

const hasAuthorPromptFile = (name: string) => {
  const slug = authorNameToSlug(name);
  if (!slug) return false;
  if (authorPromptCache.has(slug)) {
    return authorPromptCache.get(slug)!;
  }
  const promptPath = path.join(process.cwd(), 'data', 'author-prompts', `${slug}.txt`);
  let exists = false;
  try {
    exists = fs.existsSync(promptPath);
  } catch {
    exists = false;
  }
  authorPromptCache.set(slug, exists);
  return exists;
};

const getAuthorPromptText = (name: string) => {
  const slug = authorNameToSlug(name);
  if (!slug) return '';
  if (authorPromptTextCache.has(slug)) {
    return authorPromptTextCache.get(slug)!;
  }
  const promptPath = path.join(process.cwd(), 'data', 'author-prompts', `${slug}.txt`);
  try {
    if (fs.existsSync(promptPath)) {
      const text = fs.readFileSync(promptPath, 'utf8');
      authorPromptTextCache.set(slug, text);
      return text;
    }
  } catch {
    // ignore
  }
  authorPromptTextCache.set(slug, '');
  return '';
};

const chooseAuthorCandidate = (candidates: string[]) => {
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const name = String(candidate || '').trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    if (hasAuthorPromptFile(name)) {
      return name;
    }
  }
  // fallback to first distinct candidate
  for (const candidate of candidates) {
    const name = String(candidate || '').trim();
    if (name) return name;
  }
  return '';
};

const ARTICLE_DATA_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
let cachedArticleKnowledge: {
  expires: number;
  knowledge: {
    categories: Record<string, {
      count: number;
      topTags: string[];
      topAuthors: string[];
      keywords: string[];
    }>;
    defaultCategory: string;
    globalTopAuthor?: string;
  };
} | null = null;

const loadArticleKnowledge = async () => {
  if (cachedArticleKnowledge && cachedArticleKnowledge.expires > Date.now()) {
    return cachedArticleKnowledge.knowledge;
  }

  try {
    const fs = require('fs');
    const path = require('path');
    const datasetPath = path.join(process.cwd(), 'data', 'apropos-articles.json');
    if (!fs.existsSync(datasetPath)) {
      return null;
    }

    const raw = fs.readFileSync(datasetPath, 'utf8');
    const articles = JSON.parse(raw);
    if (!Array.isArray(articles)) return null;
    cachedArticleDataset = {
      expires: Date.now() + ARTICLE_DATA_CACHE_TTL,
      items: articles
    };

    const categoryStats: Map<string, {
      count: number;
      tagCounts: Map<string, number>;
      authorCounts: Map<string, number>;
      keywordCounts: Map<string, number>;
    }> = new Map();

    const addCount = (map: Map<string, number>, key: string, weight = 1) => {
      const current = map.get(key) || 0;
      map.set(key, current + weight);
    };

    const tokenize = (value: string) =>
      value
        .toLowerCase()
        .split(/[^a-z0-9øæåéüöæøå]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3);

    for (const article of articles) {
      const category = (article.category || 'Ukendt').trim();
      if (!categoryStats.has(category)) {
        categoryStats.set(category, {
          count: 0,
          tagCounts: new Map(),
          authorCounts: new Map(),
          keywordCounts: new Map()
        });
      }

      const entry = categoryStats.get(category)!;
      entry.count += 1;

      if (Array.isArray(article.tags)) {
        for (const tag of article.tags) {
          if (!tag || typeof tag !== 'string') continue;
          const cleanTag = tag.trim();
          if (!cleanTag) continue;
          addCount(entry.tagCounts, cleanTag, 1);
          for (const token of tokenize(cleanTag)) {
            addCount(entry.keywordCounts, token, 1);
          }
        }
      }

      if (article.title && typeof article.title === 'string') {
        for (const token of tokenize(article.title)) {
          addCount(entry.keywordCounts, token, 1);
        }
      }

      if (article.content && typeof article.content === 'string') {
        // Sample a limited number of tokens from content to avoid over-weighting long pieces
        const tokens = tokenize(article.content).slice(0, 80);
        for (const token of tokens) {
          addCount(entry.keywordCounts, token, 0.25);
        }
      }

      if (article.author && typeof article.author === 'string') {
        addCount(entry.authorCounts, article.author.trim(), 1);
      }
    }

    const categories: Record<string, { count: number; topTags: string[]; topAuthors: string[]; keywords: string[] }> =
      {};
    let defaultCategory = '';
    let bestCategoryCount = 0;
    const globalAuthorCounts: Map<string, number> = new Map();

    categoryStats.forEach((entry, category) => {
      const sortedTags = Array.from(entry.tagCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([tag]) => tag);
      const sortedAuthors = Array.from(entry.authorCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([author]) => author);
      const sortedKeywords = Array.from(entry.keywordCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([keyword]) => keyword);

      categories[category] = {
        count: entry.count,
        topTags: sortedTags.slice(0, 8),
        topAuthors: sortedAuthors.slice(0, 5),
        keywords: sortedKeywords.slice(0, 80)
      };

      if (entry.count > bestCategoryCount) {
        bestCategoryCount = entry.count;
        defaultCategory = category;
      }

      sortedAuthors.forEach((author, index) => {
        addCount(globalAuthorCounts, author, sortedAuthors.length - index);
      });
    });

    const globalTopAuthor =
      Array.from(globalAuthorCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || undefined;

    const knowledge = {
      categories,
      defaultCategory,
      globalTopAuthor
    };

    cachedArticleKnowledge = {
      expires: Date.now() + ARTICLE_DATA_CACHE_TTL,
      knowledge
    };

    return knowledge;
  } catch (error) {
    console.error('Failed to load article knowledge:', error);
    return null;
  }
};

const loadArticleDataset = async (): Promise<any[] | null> => {
  if (cachedArticleDataset && cachedArticleDataset.expires > Date.now()) {
    return cachedArticleDataset.items;
  }
  try {
    const datasetPath = path.join(process.cwd(), 'data', 'apropos-articles.json');
    if (!fs.existsSync(datasetPath)) return null;
    const raw = fs.readFileSync(datasetPath, 'utf8');
    const articles = JSON.parse(raw);
    if (!Array.isArray(articles)) return null;
    cachedArticleDataset = {
      expires: Date.now() + ARTICLE_DATA_CACHE_TTL,
      items: articles
    };
    return articles;
  } catch (error) {
    console.error('Failed to load article dataset:', error);
    return null;
  }
};

const guessCategoryFromText = (title: string, content: string, knowledge: any) => {
  if (!knowledge || !knowledge.categories) return '';
  const haystack = `${title || ''}\n${content || ''}`.toLowerCase();
  let bestCategory = '';
  let bestScore = 0;

  for (const [category, stats] of Object.entries<any>(knowledge.categories)) {
    let score = 0;
    for (const keyword of stats.keywords || []) {
      if (!keyword || keyword.length < 3) continue;
      if (haystack.includes(keyword.toLowerCase())) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  if (bestScore === 0) return knowledge.defaultCategory || '';
  return bestCategory;
};

const ensureSeoTitle = (title: string, maxLength = 60) => {
  if (!title) return '';
  if (title.length <= maxLength) return title.trim();
  return `${title.trim().slice(0, maxLength - 1)}…`;
};

const deriveMetaDescription = (content: string, maxLength = 155) => {
  const text = stripHtmlToText(content || '');
  if (!text) return '';
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const candidate = sentences.find((sentence) => sentence.length >= 40) || sentences[0] || text;
  if (candidate.length <= maxLength) return candidate;
  return `${candidate.slice(0, maxLength - 1)}…`;
};

const deriveSubtitle = (content: string) => {
  if (!content) return '';
  const lines = content
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (/^intro\s*:/im.test(line)) continue;
    if (line.length < 30) continue;
    const words = line.split(/\s+/);
    const slice = words.slice(0, 14).join(' ');
    return slice.length > 0 ? slice : '';
  }
  return '';
};

const normalizeTags = (value: any) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
      .filter((tag) => tag.length > 0);
  }
  if (typeof value === 'string') {
    return value
      .split(/[,;|\n]+/)
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  }
  return [];
};

const countWordsStrict = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

const extractIntroSection = (content: string) => {
  if (!content) return '';
  // Improved regex to capture full intro section
  const match = content.match(/^intro\s*:\s*([\s\S]+?)(?=\n\n|\n[A-ZÆØÅ]|$)/im);
  if (!match) return '';
  return match[1].replace(/\n+/g, ' ').trim();
};

const removeIntroFromContent = (content: string) => {
  if (!content) return content;
  // Remove the intro section from content - improved regex
  return content.replace(/^intro\s*:\s*[\s\S]+?(?=\n\n|\n[A-ZÆØÅ]|$)/im, '').trim();
};

const buildSeoTitle = (title: string, platform: string | undefined, fallbackSubtitle: string) => {
  const cleanTitle = (title || '').trim();
  if (!cleanTitle) return '';
  const existing = cleanTitle.match(/^(.*?)\s*\((.*?)\)\s*:\s*(.+)$/);
  if (existing) {
    const [, focus, existingPlatform, rest] = existing;
    if (!platform || existingPlatform.toLowerCase() === platform.toLowerCase()) {
      const formatted = `${focus.trim()}${platform ? ` (${platform.trim()})` : ` (${existingPlatform})`}: ${rest.trim()}`;
      return formatted.length <= 60 ? formatted : `${formatted.slice(0, 57)}…`;
    }
  }
  const focus = cleanTitle.split(':')[0].trim();
  const secondary = fallbackSubtitle || cleanTitle.split(':').slice(1).join(':').trim() || 'Apropos perspektiv';
  const base = platform ? `${focus} (${platform.trim()}): ${secondary}` : `${focus}: ${secondary}`;
  return base.length <= 60 ? base : `${base.slice(0, 57)}…`;
};

const buildExcerpt = (content: string, maxWords = 45) => {
  const text = stripHtmlToText(content || '');
  if (!text) return '';
  const words = text.split(/\s+/).filter(Boolean);
  const slice = words.slice(0, maxWords).join(' ');
  return words.length > maxWords ? `${slice}…` : slice;
};

const applyFieldFallbacks = async (articleUpdate: any, articleData: any) => {
  if (!articleUpdate || typeof articleUpdate !== 'object') return articleUpdate;

  const knowledge = await loadArticleKnowledge();
  const content = typeof articleUpdate.content === 'string' ? articleUpdate.content : '';
  const title = articleUpdate.title || articleData?.title || articleData?.previewTitle || '';

  let category =
    articleUpdate.category ||
    articleData?.category ||
    articleData?.section ||
    (knowledge ? guessCategoryFromText(title, content, knowledge) : '');
  if (!category && knowledge) {
    category = knowledge.defaultCategory || '';
  }
  if (category) {
    articleUpdate.category = category;
    if (!articleUpdate.section) articleUpdate.section = category;
  }

  let tags = normalizeTags(articleUpdate.tags);
  const wizardTags = normalizeTags(articleData?.tags);
  const topicTags = normalizeTags(articleData?.topicsSelected);
  if (articleData?.topic && typeof articleData.topic === 'string') {
    topicTags.push(articleData.topic);
  }

  tags = [...tags, ...wizardTags, ...topicTags];

  if (knowledge && category && knowledge.categories?.[category]) {
    tags = [...tags, ...knowledge.categories[category].topTags];
  }

  if (!tags.length && knowledge?.defaultCategory && knowledge.categories?.[knowledge.defaultCategory]) {
    tags = knowledge.categories[knowledge.defaultCategory].topTags.slice(0, 5);
  }

  if (category) {
    tags.unshift(category);
  }
  const uniqueTags = Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)));
  articleUpdate.tags = uniqueTags.slice(0, 12);

  const authorCandidates: string[] = [];
  if (articleUpdate.author) authorCandidates.push(articleUpdate.author);
  if (articleData?.author) authorCandidates.push(articleData.author);
  if (knowledge && category && knowledge.categories?.[category]?.topAuthors?.length) {
    authorCandidates.push(...knowledge.categories[category].topAuthors);
  }
  if (knowledge?.globalTopAuthor) {
    authorCandidates.push(knowledge.globalTopAuthor);
  }

  const chosenAuthor = chooseAuthorCandidate(authorCandidates);
  if (chosenAuthor) {
    articleUpdate.author = chosenAuthor;
    if (hasAuthorPromptFile(chosenAuthor)) {
      const tov = getAuthorPromptText(chosenAuthor);
      if (tov) {
        articleUpdate.authorTOV = tov;
      }
    }
  }

  const platform = articleUpdate.streaming_service || articleData?.platform || articleData?.streaming_service;
  if (!articleUpdate.streaming_service && platform) {
    articleUpdate.streaming_service = platform;
  }

  const subtitleExisting = articleUpdate.subtitle || deriveSubtitle(content);
  if (!articleUpdate.subtitle && subtitleExisting) {
    articleUpdate.subtitle = subtitleExisting;
  }

  const seo = buildSeoTitle(articleUpdate.title || title, platform, subtitleExisting || '');
  if (seo) {
    articleUpdate.seoTitle = seo;
    articleUpdate.seo_title = seo;
  } else if (articleUpdate.title && !articleUpdate.seoTitle) {
    articleUpdate.seoTitle = ensureSeoTitle(articleUpdate.title);
    articleUpdate.seo_title = articleUpdate.seoTitle;
  }

  const existingMeta = articleUpdate.seoDescription || articleUpdate.meta_description;
  if (!existingMeta && content) {
    const meta = deriveMetaDescription(content);
    if (meta) {
      articleUpdate.seoDescription = meta;
      articleUpdate.meta_description = meta;
    }
  } else if (!articleUpdate.meta_description && articleUpdate.seoDescription) {
    articleUpdate.meta_description = articleUpdate.seoDescription;
  }

  if (!articleUpdate.previewTitle && articleUpdate.title) {
    articleUpdate.previewTitle = articleUpdate.title;
  }

  const intro = extractIntroSection(content);
  if (intro && !articleUpdate.intro) {
    articleUpdate.intro = intro;
  }

  // DON'T remove intro from content here - we want it in content for article display
  // The intro will be handled separately, but content should include it for display
  // Only remove if content explicitly has intro and we want to avoid duplication in specific contexts
  // For now, keep intro in content - it will be recombined properly after normalization

  if (!articleUpdate.excerpt) {
    articleUpdate.excerpt = buildExcerpt(content);
  }

  const wordCount = countWordsStrict(stripHtmlToText(content));
  if (!articleUpdate.wordCount) articleUpdate.wordCount = wordCount;
  if (!articleUpdate.minutes_to_read) {
    articleUpdate.minutes_to_read = Math.max(1, Math.round(wordCount / 160));
  }

  if (articleData?.press !== undefined) {
    articleUpdate.presseakkreditering = !!articleData.press;
  }

  const topicCandidates = articleUpdate.tags.filter((tag: string) => tag !== category);
  if (!articleUpdate.topic && topicCandidates.length) {
    articleUpdate.topic = topicCandidates[0];
  }
  if (!articleUpdate.topic_two && topicCandidates.length > 1) {
    articleUpdate.topic_two = topicCandidates[1];
  }

  if (articleUpdate.featured === undefined) articleUpdate.featured = false;

  if (!articleUpdate.slug && articleUpdate.title) {
    articleUpdate.slug = slugify(articleUpdate.title);
  }

  if (!articleUpdate.status) {
    articleUpdate.status = 'draft';
  }

  return articleUpdate;
};

const computeOverlapRatio = (notes: string, content: string) => {
  try {
    const a = String(notes || '').replace(/\s+/g, ' ').toLowerCase();
    const b = String(content || '').replace(/\s+/g, ' ').toLowerCase();
    if (!a || !b) return 0;
    let overlap = 0;
    const parts = a
      .split(/[\.!?]\s+/)
      .map((segment) => segment.trim())
      .filter((segment) => segment.length >= 40);
    for (const part of parts) {
      if (b.includes(part)) overlap += part.length;
    }
    const base = Math.max(1, a.length);
    return overlap / base;
  } catch {
    return 0;
  }
};

const getAuthorSampleSnippet = async (authorName: string) => {
  const trimmed = String(authorName || '').trim();
  if (!trimmed) return '';
  const key = trimmed.toLowerCase();
  if (authorSampleCache.has(key)) {
    return authorSampleCache.get(key)!;
  }

  const dataset = await loadArticleDataset();
  if (!dataset) {
    authorSampleCache.set(key, '');
    return '';
  }

  const matches = dataset.filter((article: any) => {
    const author = String(article?.author || '').trim().toLowerCase();
    if (author && author === key) return true;
    if (Array.isArray(article?.tags)) {
      return article.tags.some((tag: any) => String(tag || '').trim().toLowerCase() === key);
    }
    return false;
  });

  const sampleArticle = matches[0] || dataset.find((article: any) => {
    const author = String(article?.author || '').trim().toLowerCase();
    return author && author !== 'unknown author';
  });

  if (!sampleArticle) {
    authorSampleCache.set(key, '');
    return '';
  }

  const baseText = stripHtmlToText(
    sampleArticle.content ||
    sampleArticle.excerpt ||
    ''
  );

  if (!baseText) {
    authorSampleCache.set(key, '');
    return '';
  }

  const words = baseText.split(/\s+/).filter(Boolean);
  const snippetWords = words.slice(0, 120);
  const snippet = snippetWords.join(' ');
  authorSampleCache.set(key, snippet);
  return snippet;
};

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
  
  // Preserve SetupWizard topicsSelected - don't let AI override them
  // Note: This will be handled in the main route where articleData is available
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
  const lowerMessage = message.toLowerCase().trim();
  const lowerContent = (articleData?.content || '').toLowerCase();

  // Skip research for very short messages (likely follow-ups or simple requests)
  if (lowerMessage.length < 30) {
    return false;
  }

  // Skip research for simple editing requests
  const simpleEditPatterns = [
    /^(ret|ændre|tilføj|fjern|skift|opdater|rediger)/i,
    /^(mere|mindre|længere|kortere|bedre)/i,
    /^(kan du|prøv|gør|lav)/i
  ];
  if (simpleEditPatterns.some(pattern => pattern.test(lowerMessage))) {
    return false;
  }

  const factualIndicators = [
    'ifølge',
    'statistik',
    'undersøgelse',
    'rapport',
    'studie',
    'data viser',
    'forskning',
    'ekspert',
    'professor',
    'millioner',
    'milliarder',
    'procent',
    '%',
    'antal',
    'årstal',
    'dato',
    'premiere',
    'budget',
    'indtægter',
    'omsætning',
    'pris',
    'box office',
    'kilde',
    'kilder',
    'factcheck',
    'fact-check',
    'verificer',
    'bevis',
    'dokumentation'
  ];

  const hasFactualClaims = factualIndicators.some(
    (indicator) => lowerMessage.includes(indicator) || lowerContent.includes(indicator)
  );
  const explicitResearchIntent = /\b(fakta|kilde|kilder|factcheck|fact-check|research|baggrund|dokumentation|verificer)\b/i.test(
    message
  );
  const isReviewRequest = /\b(anmeld|anmeldelse|review|bedøm|bedømmelse|kritik|kritiker)\b/i.test(message);
  const hasSpecificSubject = /\b(film|serie|bog|album|kunstner|skuespiller|instruktør|forfatter|spil|koncert)\b/i.test(
    message
  );
  const hasQuotedTitle = /"[^"]+"/.test(message);
  const hasNamedEntity = /[A-ZÆØÅ][a-zæøå]+(?: [A-ZÆØÅ][a-zæøå]+){1,3}/.test(message);
  const contentWordCount = (articleData?.content || '').split(/\s+/).filter(Boolean).length;
  const contentIsSparse = contentWordCount < 250;
  const newBrief = !articleData?.content || contentIsSparse;
  
  // CRITICAL: For reviews, ALWAYS perform web search to verify facts
  // This prevents hallucinations and incorrect information
  if (isReviewRequest || hasSpecificSubject) {
    console.log(`✅ Review/subject detected - requiring mandatory research`);
    return true;
  }

  if (explicitResearchIntent) return true;
  const strongEvidenceRequest =
    hasFactualClaims &&
    (/[0-9]{3,}/.test(lowerMessage) || /%\b/.test(lowerMessage) || lowerMessage.includes('ifølge'));
  if (strongEvidenceRequest && newBrief) return true;

  return false;
}

function shouldRunAdvancedResearch(message: string, articleData: any, webSearchTriggered: boolean): boolean {
  // CRITICAL: For reviews, ALWAYS run advanced research to verify media type and facts
  const isReviewRequest = /\b(anmeld|anmeldelse|review|bedøm|bedømmelse|kritik|kritiker)\b/i.test(message);
  const hasSpecificSubject = /\b(film|serie|bog|album|kunstner|skuespiller|instruktør|forfatter|spil|koncert)\b/i.test(message);
  
  if (isReviewRequest || hasSpecificSubject) {
    console.log(`✅ Review/subject detected - requiring advanced research for verification`);
    return true;
  }
  
  // For other cases, only run if web search was triggered
  return webSearchTriggered && (articleData?.title || articleData?.topic);
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

function parseModelPayload(raw: string): { response?: string; suggestion?: any; articleUpdate?: any; citations?: string[]; warnings?: string[] } {
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
    const citations = Array.isArray(obj.citations)
      ? (obj.citations as any[]).map((url: any) => String(url)).filter((url: string) => url.trim().length > 0)
      : undefined;
    const warnings = Array.isArray(obj.warnings)
      ? (obj.warnings as any[]).map((warning: any) => String(warning)).filter((warning: string) => warning.trim().length > 0)
      : undefined;
    return { response: String(obj.response || ''), suggestion: obj.suggestion, articleUpdate: normalizedUpdate, citations, warnings } as any;
  }

  // 2) Try fenced code block
  const fenced = raw.match(/```[\s\S]*?```/);
  if (fenced) {
    const inner = stripFences(fenced[0]);
    obj = normalizeShape(tryParse(inner));
    if (obj && typeof obj === 'object' && (obj.response || obj.articleUpdate || obj.suggestion)) {
      const normalizedUpdate = normalizeArticleUpdatePayload(obj.articleUpdate);
      const citations = Array.isArray(obj.citations)
        ? (obj.citations as any[]).map((url: any) => String(url)).filter((url: string) => url.trim().length > 0)
        : undefined;
      const warnings = Array.isArray(obj.warnings)
        ? (obj.warnings as any[]).map((warning: any) => String(warning)).filter((warning: string) => warning.trim().length > 0)
        : undefined;
      return { response: String(obj.response || ''), suggestion: obj.suggestion, articleUpdate: normalizedUpdate, citations, warnings } as any;
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

import { performanceMonitor, startStage, endStage, logReport } from '@/lib/performance-monitor';

// Vercel function configuration - increase timeout for AI chat
// Note: maxDuration 300 requires Vercel Pro plan. Hobby plan max is 10 seconds.
// For Hobby plan, use maxDuration = 10
export const maxDuration = 300; // 5 minutes (requires Vercel Pro plan) - adjust to 10 if on Hobby plan
export const runtime = 'nodejs'; // Use Node.js runtime instead of Edge

export async function POST(request: NextRequest) {
  let progressId = '';
  try {
    startStage('ai-chat-request', { timestamp: new Date().toISOString() });
    console.log('🚀 AI CHAT API CALLED - Starting request processing');
    const {
      message,
      articleData,
      notes,
      chatHistory,
      authorTOV,
      authorName,
      analysisPrompt,
      clientRequestId
    } = await request.json();
    console.log('🔍 Author name from request:', authorName);
    console.log('🔍 Author TOV from request length:', authorTOV?.length || 0);
    const generationMode = (articleData as any)?.generationMode === 'fast' ? 'fast' : 'editorial';
    const isFastMode = generationMode === 'fast';
    console.log('🎛️ Generation mode:', generationMode);

    if (!message) {
      if (progressId) {
        updateProgressStep(progressId, 'prepare', 'failed', { error: 'Message is required' });
        completeProgress(progressId);
      }
      endStage(false, 'Message is required');
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    progressId = typeof clientRequestId === 'string' ? clientRequestId.trim() : '';
    if (progressId) {
      initProgress(progressId, [
        { id: 'prepare', label: 'Analyserer prompt og setup' },
        { id: 'web-search', label: 'Søger efter fakta og kilder' },
        { id: 'advanced-research', label: 'Indsamler redaktionel research' },
        { id: 'generation', label: 'Genererer artikeludkast' },
        { id: 'quality', label: 'Kører kvalitetskontrol' },
        { id: 'format', label: 'Formatterer svar til UI' }
      ]);
      updateProgressStep(progressId, 'prepare', 'active');
    }

    if (!openai) {
      if (progressId) {
        updateProgressStep(progressId, 'prepare', 'failed', { error: 'OpenAI API key missing' });
        completeProgress(progressId);
      }
      return NextResponse.json({ 
        response: 'OpenAI API key ikke konfigureret. Sæt OPENAI_API_KEY miljøvariablen for at bruge AI funktionalitet.' 
      });
    }

    const proto = request.headers.get('x-forwarded-proto') || 'http';
    const host = request.headers.get('host');
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || (host ? `${proto}://${host}` : 'http://localhost:3001');

    // Build context from article data and notes
    let context = '';
    if (articleData?.title) context += `Titel: ${articleData.title}\n`;
    if (articleData?.subtitle) context += `Undertitel: ${articleData.subtitle}\n`;
    if (articleData?.category) context += `Kategori: ${articleData.category}\n`;
    if (articleData?.content) context += `Nuværende indhold: ${articleData.content.substring(0, 500)}...\n`;
    if (Array.isArray(articleData?.tags) && articleData.tags.length) {
      context += `Tags: ${articleData.tags.join(', ')}\n`;
    }
    if (articleData?.platform) context += `Platform: ${articleData.platform}\n`;
    if (articleData?.streaming_service) context += `Streaming Service: ${articleData.streaming_service}\n`;
    if (articleData?.topic) context += `Topic: ${articleData.topic}\n`;
    if (Array.isArray(articleData?.topicsSelected) && articleData.topicsSelected.length) {
      context += `Selected Topics: ${articleData.topicsSelected.join(', ')}\n`;
    }
    if (articleData?.rating) {
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

    if (progressId) {
      updateProgressStep(progressId, 'prepare', 'completed');
    }

            // Load trained TOV for author if available
            let trainedTOV = '';
            if (authorName) {
              try {
                console.log('🔍 Loading TOV for author:', authorName);
                // First try to get TOV from Webflow API
                const authors = await getCachedAuthors(baseUrl);
                console.log('🔍 Authors from cache:', authors?.length || 0);
                if (Array.isArray(authors)) {
                  const author = authors.find((a: any) => a.name === authorName);
                  console.log('🔍 Found author:', author?.name, 'TOV length:', author?.tov?.length || 0);
                  if (author?.tov) {
                    trainedTOV = author.tov;
                    console.log('✅ Using TOV from Webflow:', trainedTOV.substring(0, 100) + '...');
                  }
                }
                
                // Fallback to file system
                if (!trainedTOV) {
                  console.log('🔍 Trying file system fallback...');
                  const promptText = getAuthorPromptText(authorName);
                  if (promptText) {
                    trainedTOV = promptText;
                    console.log('✅ Using TOV from file system:', trainedTOV.substring(0, 100) + '...');
                  }
                }
                
                if (!trainedTOV) {
                  console.log('❌ No TOV found for author:', authorName);
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
    let combinedTOV = [trainedTOV, authorTOV].filter(Boolean).join('\n\n');
    console.log('🔍 Combined TOV length:', combinedTOV.length);
    console.log('🔍 Combined TOV preview:', combinedTOV.substring(0, 200) + '...');
    // Skip author sample loading in fast mode for speed
    const shouldLoadAuthorSample = !isFastMode;
    const authorSample = shouldLoadAuthorSample ? await getAuthorSampleSnippet(authorInfo) : '';
    if (isFastMode) {
      console.log('⚡ Fast mode: Skipping author sample loading for speed');
      // Also reduce TOV length in fast mode
      if (combinedTOV.length > 500) {
        combinedTOV = combinedTOV.substring(0, 500) + '...';
        console.log('⚡ Fast mode: Truncated TOV to 500 chars for speed');
      }
    }
    // Lightweight diagnostics for prompt composition
    // Determine dynamic target lengths from section/topic
    const lower = (s: any) => String(s||'').toLowerCase();
    const sec = lower((articleData||{}).category || (articleData||{}).section);
    const topic = lower((articleData||{}).topic);
    const tagsArr: string[] = Array.isArray((articleData||{}).tags) ? (articleData as any).tags.map((t:any)=>lower(t)) : [];
    const targetConfig = determineWordTargets(articleData);
    let targetMin = targetConfig.min;
    let targetMax = targetConfig.max;
    const targetLabel = targetConfig.label;
    const articleType = targetConfig.type;
    if (isFastMode) {
      targetMin = Math.max(450, Math.round(targetMin * 0.55));
      targetMax = Math.max(targetMin + 200, Math.round(targetMax * 0.65));
    }
    
    // Enhanced dynamic behavior injection
    const dynamicBehaviors = [];
    
    // Rating injection for reviews
    if (articleType === 'review' && articleData?.rating) {
      dynamicBehaviors.push(`RATING INJEKTION: Artikel skal have ${articleData.rating}/6 stjerner. Indarbejd stjernetallet naturligt i teksten uden at bruge formuleringen "Læs Apropos Magazines anmeldelse her (${articleData.rating}/6 stjerner).".`);
    }
    
    // Streaming service injection
    if (articleData?.platform || articleData?.streaming_service) {
      const platform = articleData.platform || articleData.streaming_service;
      dynamicBehaviors.push(`STREAMING SERVICE: Artikel handler om indhold på ${platform}.`);
      dynamicBehaviors.push(`TITEL FORMAT: Titlen SKAL ALTID være formatet "{Titel} (${platform})" - altså titlen efterfulgt af service/platform i parentes. Eksempel: "Highest 2 Lowest (Apple TV)" eller "Paradise (Disney+)".`);
    }
    
    // Mode-specific behavior
    if (isFastMode) {
      dynamicBehaviors.push(`FAST MODE: Hurtig sparring med ${targetMin}-${targetMax} ord. Lever konkrete vinkler, strukturforslag og stilgreb; gør tydeligt at fakta skal verificeres før publicering.`);
    } else {
      dynamicBehaviors.push(`LÆNGDE-MÅL: ${targetLabel} skal være ${targetMin}-${targetMax} ord. Minimum ${targetMin} ord er KRITISK.`);
    }
    
    const systemSections: string[] = [];
    systemSections.push(basePrompt.trim());
    
    if (combinedTOV) {
      console.log('✅ Adding TOV to system prompt, length:', combinedTOV.length);
      systemSections.push(`🚨 KRITISK FORFATTERSTEMME - DETTE ER DIN IDENTITET 🚨\n\nDu ER ${authorInfo}. Din personlighed og skrivestil er defineret nedenfor. Følg denne TOV nøjagtigt:\n\n${combinedTOV}\n\n🚨 DU SKAL SKRIVE SOM ${authorInfo} - IKKE GENERISK! 🚨\n- Brug din karakteristiske tone og stil\n- Inkorporér din personlighed i hver sætning\n- Dette er IKKE et forslag - det er din identitet!`);
    } else {
      console.log('❌ No TOV to add to system prompt');
    }
    
    systemSections.push(`Skriv ALDRIG uden fuld Apropos-personlighed. Du er ${authorInfo}; rul tonen ind i hver sætning.`);
    
    if (authorSample) {
      systemSections.push(`FORFATTER-EKSEMPEL (${authorInfo}) — brug som rytme og energi, men omskriv alt i ny formulering:\n${authorSample}`);
    }
    
    // Add dynamic behaviors
    if (dynamicBehaviors.length > 0) {
      systemSections.push(`DYNAMISKE ADFÆRDS-INJEKTIONER:\n${dynamicBehaviors.join('\n')}`);
    }
    if (isFastMode) {
      // Much shorter instructions for fast mode to reduce prompt size
      systemSections.push(`**FAST MODE**\n${targetMin}-${targetMax} ord. Idéer og struktur. Noter manglende fakta.`);
      systemSections.push(`**FORMAT**\nIntro (3 sætninger) → Krop (2-3 punkter) → Eftertanke.`);
    } else {
      systemSections.push(`**KRITISK LÆNGDE-KRAV**\n🚨 ARTIKLEN SKAL VÆRE MINIMUM ${targetMin} ORD - IKKE MINDRE! 🚨\n- Hvis artiklen er under ${targetMin} ord, er det EN FEJL der skal rettes\n- Brødteksten alene skal være ${targetMin}-${targetMax} ord (ekskl. intro og afslutning)\n- Tæl ordene mens du skriver - stop ikke før du når ${targetMin} ord\n- Korte artikler under ${targetMin} ord bliver afvist som utilstrækkelige\n- DU SKAL SKRIVE ${targetMin} ORD ELLER MERE - DET ER IKKE ET FORSLAG!\n- SKRIV EN DETALJERET ARTIKEL PÅ MINDST ${targetMin} ORD OM DETTE EMNE`);
      systemSections.push(`**REDAKTIONELT ARBEJDSFLOW (internt)**\n1. Skriv et fuldt første udkast (MINIMUM ${targetMin} ord) med KORREKT struktur:\n   - START direkte med "Intro:" (ikke ##Intro: eller andet)\n   - Intro: 2-4 linjer i første person\n   - Brødtekst: ${targetMin}-${targetMax} ord med dybde og detaljer\n   - Afslut med "Eftertanke:", "Refleksion:" eller lignende\n2. TÆL ORDENE: Kontroller at brødteksten er mindst ${targetMin} ord\n3. Lever KUN den forbedrede, færdige artikel i JSON-kontrakten – ingen interne noter eller halvfærdige udkast.\n4. HVIS ARTIKLEN ER UNDER ${targetMin} ORD: SKRIV DEN OM HELT FRA BUNDEN!`);
      systemSections.push(`**ARTIKELFORMAT & LÆNGDE**\n- Struktur: Intro (2-4 sætninger i jeg-form) → brødtekst (${targetMin}-${targetMax} ord) → afslutning (godkendt label + 2-4 sætninger).\n- Længde: artiklen må ALDRIG være under ${targetMin} ord; sigt efter ${targetMin}-${targetMax} ord.\n- Brødtekst: brug sanselige detaljer, konkrete observationer, research og reflektion (forventning → oplevelse → indsigt → eftertanke).\n- Variér sætningslængder og rytme; undgå synopsis eller punktopstillinger.\n- UDVID hver tanke med konkrete eksempler og dybdegående analyse.\n- HVIS DU SKRIVER UNDER ${targetMin} ORD: STOP OG SKRIV OM ARTIKLEN HELT FRA BUNDEN!`);
    }
    const platform = (articleData as any).platform || (articleData as any).streaming_service || '';
    systemSections.push(`**SETUPWIZARD DATA – BRUG SOM KANON**\n- Kategori/Sektion: ${sec || 'Ikke valgt'}\n- Topics/Tags: ${tagsArr.join(', ') || 'Ikke valgt'}\n- Platform: ${platform || 'Ikke valgt'}\n- Rating: ${articleData.rating || 'Ikke valgt'} stjerner (tilpas tone hertil)`);
    if (platform) {
      systemSections.push(`**TITEL FORMAT KRAV**\n🚨 KRITISK: Titlen SKAL ALTID være formatet "{Titel} (${platform})" hvis platform/service er udfyldt.\n- Eksempel: "Highest 2 Lowest (Apple TV)" eller "Paradise (Disney+)"\n- Dette er IKKE et forslag - det er et KRAV!\n- Titlen skal ALTID slutte med " (${platform})" hvis platform er sat\n- ALDRIG send titlen uden platform i parentes hvis platform er udfyldt`);
    }
    if (isFastMode) {
      systemSections.push(`**RESEARCH-DISCLAIMER**\n- Ingen citations i fast mode; fokuser på ideer og noter behov for kilder.\n- Skriv eksplicit hvor fakta skal verificeres, og foreslå hvilke typer kilder der kan bruges.\n- Du må gerne skrive sætninger som "Her bør vi finde tal for ..." for at guide journalisten.`);
    } else {
      systemSections.push(`**KILDEBRUG & CITATIONS**\n- Integrér research-data aktivt; ingen opfundne fakta.\n- Markér kilder med [1], [2] i teksten og lad dem matche den medsendte kilde-liste.\n- Hvis fakta mangler, skriv generelt ("instruktøren", "hovedskuespilleren") i stedet for at gætte navne.`);
    }
    
    // Enhanced JSON contract enforcement
      const platformForPrompt = articleData?.platform || articleData?.streaming_service || '';
      const titleExample = platformForPrompt ? `"artikel titel (${platformForPrompt})"` : '"artikel titel"';
      systemSections.push(`**JSON-KONTRAKT HÅNDHÆVELSE**\n- Returnér ALTID ét JSON-objekt med nøjagtig struktur:\n  {\n    "response": "menneskelig svartekst til chatten",\n    "articleUpdate": {\n      "title": ${titleExample}${platformForPrompt ? ' (SKAL inkludere platform i parentes!)' : ''},\n      "subtitle": "undertitel",\n      "content": "fuld artikel med Intro: og afslutning",\n      "category": "${sec || 'kategori'}",\n      "tags": ["tag1", "tag2"],\n      "author": "${authorInfo}",\n      "rating": ${articleData?.rating || 'null'},\n      "platform": "${platformForPrompt}",\n      "slug": "url-venlig-titel",\n      "seoTitle": "SEO titel (max 60 tegn)",\n      "seoDescription": "meta beskrivelse (max 155 tegn)"\n    },\n    "suggestion": null,\n    "citations": ["url1", "url2"]\n  }\n- ALDRIG returnér tekst udenfor JSON-strukturen\n- ALDRIG returnér delvise eller ufuldstændige JSON-objekter`);
    
    const systemContent = systemSections.join('\n\n');

    // Add hard guidance: transform notes, not copy
    const transformationRules = `\n\nTRANSFORMATION KRAV:\n- Brug noter som råmateriale — omskriv alt; ingen sætninger må være identiske med noterne.\n- Integrér noter i en sammenhængende artikelstruktur (Intro → Brødtekst → Afslutning).\n- Mål: ${targetMin}–${targetMax} ord for denne artikel.`;
    const workflowInstructions = `

**SAMTALEROLLE**
- Brug hver besked fra brugeren til at bygge artiklen videre — ingen meta-snak, ingen delvise kladder.
- Bed kun om ekstra oplysninger, hvis artiklen ikke kan skrives uden dem.
- Returnér altid KUN JSON-objektet (response, articleUpdate, citations, suggestion).

**KRITISK LÆNGDE-KONTROL**
🚨 ARTIKLEN SKAL VÆRE MINIMUM ${targetMin} ORD - IKKE MINDRE! 🚨
- Tæl ordene mens du skriver - stop ikke før du når ${targetMin} ord
- Hvis artiklen er under ${targetMin} ord, er det EN FEJL der skal rettes
- Brødteksten alene skal være ${targetMin}-${targetMax} ord (ekskl. intro og afslutning)
- UDVID hver tanke med konkrete eksempler og dybdegående analyse
- DU SKAL SKRIVE ${targetMin} ORD ELLER MERE - DET ER IKKE ET FORSLAG!
- HVIS DU SKRIVER UNDER ${targetMin} ORD: STOP OG SKRIV OM ARTIKLEN HELT FRA BUNDEN!
- SKRIV EN DETALJERET ARTIKEL PÅ MINDST ${targetMin} ORD OM DETTE EMNE

**CHUNKED GENERATION STRATEGI**
- Skriv artiklen i logiske sektioner: Intro → Hoveddel 1 → Hoveddel 2 → Hoveddel 3 → Afslutning
- Hver hoveddel skal være minimum ${Math.floor(targetMin/4)} ord
- Udvid hver sektion med konkrete detaljer, eksempler og reflektioner
- Fortsæt skrivning indtil du når ${targetMin} ord

**EGEN REDAKTION**
- Kontroller selv længde, Intro:, afslutningslabel, citations og TOV før du svarer.
- Brug researchdata aktivt og sørg for, at [1], [2] matcher kildelisten.
- Hvis noget mangler (fx længde eller struktur), ret det inden du sender resultatet.
- TÆL ORDENE: Kontroller at brødteksten er mindst ${targetMin} ord

**CMS-FELTER & SUGGESTIONS**
- Udfyld articleUpdate med title, subtitle, content, category, tags, author, seo_title, meta_description, streaming_service, stars, slug m.m.
- Foreslå rating via suggestion-objektet når det er relevant (anmeldelser); ellers lad suggestion være null.
- Hold alle felter trimmede og klar til Webflow.
- VIGTIGT: Generér ALDRIG topicsSelected - dette kommer fra SetupWizard og må ikke overskrives.

${context ? `\n\nAktuel artikel-kontekst:\n${context}` : ''}`;

    let finalSystemContent = systemContent + transformationRules + workflowInstructions;
    
    // Log system prompt size for debugging
    const systemPromptSize = finalSystemContent.length;
    const systemPromptTokens = Math.ceil(systemPromptSize / 4); // Rough estimate: 1 token ≈ 4 chars
    console.log(`📊 System prompt size: ${systemPromptSize} chars (~${systemPromptTokens} tokens)`);
    if (systemPromptTokens > 8000) {
      console.warn(`⚠️ System prompt is very large (${systemPromptTokens} tokens) - this may slow down generation`);
    }
    
    const messages: any[] = [];

    // Add chat history - limit to last 5 messages for faster responses
    if (chatHistory && chatHistory.length > 0) {
      chatHistory.slice(-5).forEach((msg: any) => {
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

    // End initial setup stage before starting research/generation
    endStage(true, undefined, { 
      hasContext: !!context, 
      hasAuthorTOV: !!authorName || !!trainedTOV,
      messageLength: userMessageContent.length,
      systemPromptLength: finalSystemContent.length
    });

    // PROFESSIONAL RESEARCH & VERIFICATION PIPELINE
    // CRITICAL: ALL content generation must use research and verification
    const isNotesTemplate = (articleData as any)?.template === 'notes';
    
    // Check if this is a simple message that doesn't need research
    const isSimpleMessage = /^(hej|hi|hello|hey|ja|nej|okay|ok|tak|super|mange tak|thanks|thank you)\b/i.test(message.trim()) && message.trim().length < 30;
    
    // Determine whether this request actually needs the heavy research pipeline
    const heuristicsNeedWebResearch = !isNotesTemplate && !isSimpleMessage && shouldPerformWebSearch(message, articleData);
    const heuristicsNeedAdvancedResearch =
      heuristicsNeedWebResearch && shouldRunAdvancedResearch(message, articleData, heuristicsNeedWebResearch);
    const needsWebResearch = isFastMode ? false : (generationMode === 'editorial' ? true : heuristicsNeedWebResearch);
    const needsAdvancedResearch = needsWebResearch
      ? (generationMode === 'editorial' ? true : heuristicsNeedAdvancedResearch)
      : false;
    
    console.log(`🔍 Professional Research Pipeline - Template: ${(articleData as any)?.template}, Mode: ${generationMode}, IsSimpleMessage: ${isSimpleMessage}, HeuristicNeedWeb: ${heuristicsNeedWebResearch}, NeedsWebResearch: ${needsWebResearch}, NeedsAdvancedResearch: ${needsAdvancedResearch}`);
    
    const researchStartTime = Date.now();
    let researchSources: ResearchSources | null = null;
    let verificationResult: VerificationResult | null = null;
    
    // Better baseUrl detection for production - reuse existing baseUrl variable
    const baseRequestUrl = baseUrl; // Use the baseUrl already calculated above
    
    const researchTopic = (articleData as any)?.title || (articleData as any)?.topic || message;
    
    // PERFORM COMPREHENSIVE RESEARCH (mode-aware)
    if (needsWebResearch) {
      if (progressId) {
        updateProgressStep(progressId, 'web-search', 'active');
      }
      startStage('comprehensive-research', { topic: researchTopic });
      
      try {
        console.log(`🔬 Starting comprehensive research for: "${researchTopic}"`);
        researchSources = await performComprehensiveResearch(researchTopic, articleData, baseRequestUrl, {
          enableWebSearch: true,
          enableAdvancedResearch: needsAdvancedResearch
        });
        console.log(`✅ Research completed:`, {
          webSearchResults: researchSources.webSearch.length,
          tmdbVerified: !!researchSources.tmdbVerification?.verified,
          advancedResearch: !!researchSources.advancedResearch
        });
        
        // Format research for prompt
        const researchPrompt = formatResearchForPrompt(researchSources);
        finalSystemContent += researchPrompt;
        
        if (progressId) {
          updateProgressStep(progressId, 'web-search', 'completed');
          updateProgressStep(progressId, 'advanced-research', researchSources.advancedResearch ? 'completed' : 'skipped');
        }
        
        endStage(true, undefined, { 
          webSearchResults: researchSources.webSearch.length,
          tmdbVerified: !!researchSources.tmdbVerification?.verified 
        });
      } catch (error) {
        console.error('Comprehensive research failed:', error);
        endStage(false, error instanceof Error ? error.message : 'Research failed');
        if (progressId) {
          updateProgressStep(progressId, 'web-search', 'failed', { error: (error as Error)?.message });
        }
      }
      
      const researchTime = Date.now() - researchStartTime;
      console.log(`⏱️ Comprehensive research completed in ${researchTime}ms`);
    } else {
      // Fast mode or simple follow-ups skip heavy research
      if (progressId) {
        updateProgressStep(progressId, 'web-search', 'skipped');
        updateProgressStep(progressId, 'advanced-research', 'skipped');
      }
    }
    
    // Note: Old research logic removed - using new comprehensive research service above
    // Legacy variables kept for compatibility but not used
    let webSearchResults = '';
    let researchData = researchSources ? {
      success: true,
      webSearchResults: researchSources.webSearch.length,
      tmdbVerified: !!researchSources.tmdbVerification?.verified,
      advancedResearch: needsAdvancedResearch && !!researchSources.advancedResearch
    } : null;
    const citationSet = new Set<string>();
    
    // Extract citations from research sources
    if (researchSources) {
      researchSources.webSearch.forEach(result => {
        if (result.url) citationSet.add(result.url);
      });
      if (researchSources.advancedResearch?.sources) {
        researchSources.advancedResearch.sources.forEach(url => {
          if (url) citationSet.add(url);
        });
      }
    }
    
    // Legacy research code removed - using new comprehensive research service above

    startStage('ai-generation', { 
      model: OPENAI_MODEL, 
      temperature: 1, // GPT-5 only supports default temperature (1) 
      maxTokens: 4000,
      hasResearchData: !!researchSources 
    });
    if (progressId) {
      updateProgressStep(progressId, 'generation', 'active');
    }
    
    let completion;
    const generationStartTime = Date.now();
    try {
      console.log(`🤖 Calling OpenAI API with model: ${OPENAI_MODEL}`);
      console.log(`📊 Generation request - System prompt: ~${Math.ceil(finalSystemContent.length / 4)} tokens, Messages: ${messages.length}`);
      completion = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: finalSystemContent },
          ...messages
        ],
        temperature: 1, // GPT-5 only supports default temperature (1)
        max_completion_tokens: isSimpleMessage ? 500 : (isFastMode ? 1500 : 3000), // Reduced tokens for fast mode
        response_format: { type: 'json_object' },
      }, {
        timeout: isSimpleMessage ? 20000 : (isFastMode ? 60000 : 120000), // Increased timeouts: 20s simple, 60s fast mode, 120s editorial
      });
      const generationTime = Date.now() - generationStartTime;
      console.log(`✅ OpenAI API call completed successfully in ${generationTime}ms`);
      console.log(`📊 Response choices: ${completion.choices?.length || 0}, Usage: ${JSON.stringify(completion.usage || {})}`);
    } catch (apiError: any) {
      console.error('❌ OpenAI API call failed:', apiError.message);
      endStage(false, apiError.message || 'OpenAI API call failed');
      if (progressId) {
        updateProgressStep(progressId, 'generation', 'failed', { error: apiError.message || 'OpenAI API call failed' });
        completeProgress(progressId);
      }
      throw apiError; // Re-throw to be caught by outer catch block
    }

    const rawMessageContent = completion.choices[0]?.message?.content;
    const responseText = Array.isArray(rawMessageContent)
      ? rawMessageContent.map((part: any) => {
          if (typeof part === 'string') return part;
          if (part && typeof part === 'object' && typeof part.text === 'string') return part.text;
          return '';
        }).join('')
      : (rawMessageContent || '');
    const normalizedResponse = typeof responseText === 'string' ? responseText : String(responseText || '');
    
    console.log('📝 Normalized response length:', normalizedResponse.length);
    console.log('📝 Response preview:', normalizedResponse.substring(0, 200) + '...');

    if (!normalizedResponse.trim()) {
      console.error('❌ Empty response from OpenAI');
      endStage(false, 'No response from OpenAI');
      throw new Error('No response from OpenAI');
    }

    endStage(true, undefined, { 
      responseLength: normalizedResponse.length,
      usage: completion.usage 
    });
    console.log('✅ Generation stage completed');
    if (progressId) {
      updateProgressStep(progressId, 'generation', 'completed');
    }

    // Parse/sanitize model output and enforce JSON contract
    startStage('quality-control', { responseLength: normalizedResponse.length });
    console.log('🔍 Starting quality control stage');
    if (progressId) {
      updateProgressStep(progressId, 'quality', 'active');
    }
    let parsed = parseModelPayload(normalizedResponse);
    console.log('📦 Parsed payload keys:', Object.keys(parsed));
    let outResponse = parsed.response;
    let outSuggestion = parsed.suggestion ?? null;
    let outArticleUpdate = normalizeArticleUpdatePayload(parsed.articleUpdate);
    
    console.log('📝 Parsed response length:', outResponse?.length || 0);
    console.log('📝 Has article update:', !!outArticleUpdate);
    console.log('📝 Article update keys:', outArticleUpdate ? Object.keys(outArticleUpdate) : []);
    
    // Preserve SetupWizard topicsSelected - don't let AI override them
    if (Array.isArray(articleData?.topicsSelected) && articleData.topicsSelected.length > 0) {
      outArticleUpdate = { ...outArticleUpdate, topicsSelected: articleData.topicsSelected };
    }
    
    let outCitations: string[] = Array.isArray((parsed as any)?.citations)
      ? Array.from(new Set(((parsed as any).citations as any[]).map((url: any) => String(url)).filter(Boolean)))
      : [];
    const modelWarnings = Array.isArray(parsed.warnings) ? parsed.warnings : [];
    let qualityRecommendations: string[] = isFastMode ? [] : [...modelWarnings];
    if (outArticleUpdate && typeof outArticleUpdate === 'object' && Array.isArray((outArticleUpdate as any).citations)) {
      outCitations = Array.from(new Set([
        ...outCitations,
        ...((outArticleUpdate as any).citations as any[]).map((url: any) => String(url)).filter(Boolean)
      ]));
    }
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

    // --- Server-side validator & iterative auto-revision ---
    const countWords = (s: string) => (s || '').trim().split(/\s+/).filter(Boolean).length;
    const hasIntro = (s: string) => /^intro\s*:/im.test(s);
    const hasEnding = (s: string) =>
      /(eftertanke|refleksion|i virkeligheden|og hvad så\?|lad os bare sige det sådan her)/i.test(s);

    const getContent = () => String((outArticleUpdate as any)?.content || outResponse || '');

    let revisionAttempts = 0;
    // For notes template: Skip revisions - integrate everything in first attempt
    // User doesn't want to see quality warnings, so we should get it right the first time
    const isNotesTemplateForRevisions = (articleData as any)?.template === 'notes';
    const skipQualityLoop = isNotesTemplateForRevisions || isFastMode;
    const maxRevisions = skipQualityLoop ? 0 : 1; // Skip revisions for fast mode + notes template
    const qualityControlStartTime = Date.now();
    const maxQualityControlTime = skipQualityLoop ? 0 : (isNotesTemplateForRevisions ? 10000 : 20000); // Faster timeout for notes template
    
    console.log(`🔍 Quality check starting - Target: ${targetMin}-${targetMax} ord, Max revisions: ${maxRevisions}, Timeout: ${maxQualityControlTime}ms, Fast mode: ${isFastMode}`);
    
    // For notes template and fast mode: Skip quality check loop entirely - trust first generation
    if (!skipQualityLoop) {
      while (revisionAttempts < maxRevisions) {
        // Check timeout
        if (Date.now() - qualityControlStartTime > maxQualityControlTime) {
          console.log(`⏰ Quality control timeout after ${Date.now() - qualityControlStartTime}ms - stopping revisions`);
          break;
        }
      
      revisionAttempts += 1; // Increment at start to prevent infinite loops
      
      const currentContent = getContent();
      const currentWordCount = countWords(currentContent);
      const needsLength = currentWordCount < targetMin;
      const needsStructure = !(hasIntro(currentContent) && hasEnding(currentContent));
      const tooSimilar = computeOverlapRatio(String(notes || ''), currentContent) > 0.4; // Increased threshold

      // Enhanced quality check with detailed analysis
      const qualityIssues = [];
      if (needsLength) qualityIssues.push('length');
      if (needsStructure) qualityIssues.push('structure');
      if (tooSimilar) qualityIssues.push('similarity');

      console.log(`🔍 Quality check attempt ${revisionAttempts + 1}: ${currentWordCount}/${targetMin} ord, issues: ${qualityIssues.join(', ') || 'none'}`);

      if (qualityIssues.length === 0) {
        console.log(`✅ Quality check passed after ${revisionAttempts} attempts`);
        break;
      }

      console.log(`🔄 Quality issues detected (attempt ${revisionAttempts + 1}/${maxRevisions}):`, qualityIssues);

      const issues: string[] = [];
      if (needsLength) {
        issues.push(
          `🚨 KRITISK LÆNGDE-FEJL: Artiklen er kun ${currentWordCount} ord, men skal være minimum ${targetMin} ord. Udvid med sanselige detaljer, konkrete observationer og researchpunkter.`
        );
      }
      if (needsStructure) {
        issues.push('📝 STRUKTUR-FEJL: Mangler "Intro:" (ikke ##Intro:) eller godkendt afslutningslabel (Eftertanke:, Refleksion:, osv.).');
      }
      if (tooSimilar) {
        issues.push('⚠️ SIMILARITY-FEJL: Omskriv og parafrasér — undgå sætninger der matcher brugerens noter for tæt.');
      }

      // Enhanced revision strategy based on specific issues
      let revisionStrategy = '';
      if (needsLength && needsStructure) {
        revisionStrategy = `🚨 KOMPLET REVISION KRÆVET 🚨\n\nArtiklen mangler både længde (${currentWordCount}/${targetMin} ord) og struktur. Skriv artiklen HELT OM med:\n- Minimum ${targetMin} ord\n- Korrekt "Intro:" struktur\n- Godkendt afslutningslabel\n\n`;
      } else         if (needsLength) {
          revisionStrategy = `🚨 LÆNGDE-REVISION KRÆVET 🚨\n\nArtiklen er kun ${currentWordCount} ord, men skal være minimum ${targetMin} ord. Dette er KRITISK!\n\nUDVID HURTIGT med:\n- Konkrete detaljer og observationer\n- Dybdegående analyse\n- Research eksempler\n- Personlige refleksioner\n- Anekdoter og historier\n\n🚨 SKRIV ${targetMin} ORD ELLER MERE - STOP IKKE FØR!\n\n`;
        } else if (needsStructure) {
        revisionStrategy = `📝 STRUKTUR-REVISION KRÆVET 📝\n\nArtiklen mangler korrekt struktur. Tilføj:\n- "Intro:" label (ikke ##Intro:)\n- Godkendt afslutningslabel (Eftertanke:, Refleksion:, osv.)\n\n`;
      } else if (tooSimilar) {
        revisionStrategy = `⚠️ PARAFRASER-REVISION KRÆVET ⚠️\n\nArtiklen er for tæt på brugerens noter. Omskriv med:\n- Forskellige vendinger og formuleringer\n- Din egen redaktionelle vinkel\n- Parafrasering af alle citater\n\n`;
      }

      const revisionMessages = [
        { role: 'system', content: finalSystemContent },
        {
          role: 'user',
          content: `${revisionStrategy}${issues.join('\n')}\n\n🚨 KRITISK LÆNGDE-KONTROL: Tæl ordene mens du skriver - stop ikke før du når ${targetMin} ord!\n\n🚨 DU SKAL SKRIVE ${targetMin} ORD ELLER MERE - DET ER IKKE ET FORSLAG!\n🚨 HVIS DU SKRIVER UNDER ${targetMin} ORD: STOP OG SKRIV OM ARTIKLEN HELT FRA BUNDEN!\n🚨 BRUG DIN FORFATTERSTEMME OG SKRIV SOM ${authorInfo}!\n\nReturnér KUN ét JSON-objekt i samme kontrakt som før (articleUpdate.content skal være den fulde artikel).\n\nAktuel artikel JSON:\n${JSON.stringify({
            response: outResponse,
            suggestion: outSuggestion,
            articleUpdate: outArticleUpdate
          })}`
        }
      ];

        const revision = await openai.chat.completions.create({
          model: OPENAI_MODEL,
          messages: revisionMessages as any,
          temperature: 1, // GPT-5 only supports default temperature (1)
          max_completion_tokens: 3000, // Mindre revisioner for hurtigere svartid
          response_format: { type: 'json_object' }
        });

      const revisionContentRaw = revision.choices[0]?.message?.content;
      const revisionText = Array.isArray(revisionContentRaw)
        ? revisionContentRaw
            .map((part: any) => {
            if (typeof part === 'string') return part;
            if (part && typeof part === 'object' && typeof part.text === 'string') return part.text;
            return '';
            })
            .join('')
        : revisionContentRaw || '';
      const revisionNormalized =
        typeof revisionText === 'string' ? revisionText : String(revisionText || '');
      const reParsed = parseModelPayload(revisionNormalized);

      if (Array.isArray((reParsed as any)?.citations)) {
        outCitations = Array.from(
          new Set([
            ...outCitations,
            ...((reParsed as any).citations as any[]).map((url: any) => String(url)).filter(Boolean)
          ])
        );
      }

      if (reParsed?.articleUpdate) {
        outResponse = reParsed.response || outResponse;
        outSuggestion = reParsed.suggestion ?? outSuggestion;
        outArticleUpdate = normalizeArticleUpdatePayload({
          ...(outArticleUpdate || {}),
          ...reParsed.articleUpdate
        });
        if (
          outArticleUpdate &&
          typeof outArticleUpdate === 'object' &&
          Array.isArray((outArticleUpdate as any).citations)
        ) {
          outCitations = Array.from(
            new Set([
              ...outCitations,
              ...((outArticleUpdate as any).citations as any[]).map((url: any) => String(url)).filter(Boolean)
            ])
          );
        }
      }

      if ((!outResponse || !String(outResponse).trim()) && reParsed?.articleUpdate) {
        const revContent =
          (reParsed.articleUpdate as any).content ||
          (reParsed.articleUpdate as any).content_html ||
          (reParsed.articleUpdate as any).contentHtml;
        if (typeof revContent === 'string' && revContent.trim()) {
          outResponse = revContent;
        }
      }

      // Enhanced error handling and recovery
      if (revisionAttempts >= maxRevisions) {
        console.warn(`⚠️ Max revision attempts (${maxRevisions}) reached. Final quality status:`);
        console.warn(`  - Word count: ${countWords(getContent())}/${targetMin} (${needsLength ? 'FAIL' : 'PASS'})`);
        console.warn(`  - Structure: ${needsStructure ? 'FAIL' : 'PASS'}`);
        console.warn(`  - Similarity: ${tooSimilar ? 'FAIL' : 'PASS'}`);
        
        // Add quality warnings to final output
        const finalIssues = [];
        if (needsLength) finalIssues.push(`Længde: ${countWords(getContent())}/${targetMin} ord`);
        if (needsStructure) finalIssues.push('Mangler korrekt struktur');
        if (tooSimilar) finalIssues.push('For tæt på kilder');
        
        if (finalIssues.length > 0) {
          qualityRecommendations = qualityRecommendations || [];
          qualityRecommendations.push(`⚠️ Kvalitetsproblemer efter ${maxRevisions} revisioner: ${finalIssues.join(', ')}`);
        }
        
        break;
      } else {
        console.log(`🔄 Revision ${revisionAttempts}/${maxRevisions} completed. Checking quality...`);
      }
      }
    }
    
    const qualityControlTime = Date.now() - qualityControlStartTime;
    if (!skipQualityLoop) {
      console.log(`⏱️ Quality control completed in ${qualityControlTime}ms (${revisionAttempts} revisions)`);
    } else {
      console.log('⏭️ Quality control skipped for fast mode/notes template');
    }

    let finalContent = getContent();
    
    // PROFESSIONAL VERIFICATION PIPELINE
    // CRITICAL: Verify ALL generated content against research sources
    if (researchSources && needsWebResearch && !isNotesTemplate && !isFastMode) {
      if (progressId) {
        updateProgressStep(progressId, 'quality', 'active');
      }
      startStage('content-verification', { contentLength: finalContent.length });
      
      try {
        console.log(`🔍 Starting content verification...`);
        verificationResult = await verifyContent(finalContent, researchSources, notes);
        console.log(`✅ Verification completed:`, {
          passed: verificationResult.passed,
          plagiarismScore: verificationResult.plagiarismScore,
          factualityScore: verificationResult.factualityScore,
          mediaTypeCorrect: verificationResult.mediaTypeCorrect,
          issues: verificationResult.issues.length,
          warnings: verificationResult.warnings.length
        });
        
        // If verification failed, add warnings to output
        if (!verificationResult.passed || verificationResult.issues.length > 0) {
          console.warn(`⚠️ Verification failed or has issues:`, verificationResult.issues);
          
          // Add verification issues to quality recommendations
          if (!qualityRecommendations) qualityRecommendations = [];
          verificationResult.issues.forEach(issue => {
            qualityRecommendations.push(`🚨 VERIFIKATION: ${issue}`);
          });
          verificationResult.warnings.forEach(warning => {
            qualityRecommendations.push(`⚠️ VERIFIKATION: ${warning}`);
          });
          
          // If critical issues, add to articleUpdate warnings
          if (verificationResult.issues.some(issue => issue.includes('FEJL'))) {
            if (!outArticleUpdate) outArticleUpdate = {};
            if (!(outArticleUpdate as any).warnings) (outArticleUpdate as any).warnings = [];
            (outArticleUpdate as any).warnings.push(...verificationResult.issues.filter(issue => issue.includes('FEJL')));
          }
        }
        
        // Add citations from verification
        if (verificationResult.citations.length > 0) {
          if (!outArticleUpdate) outArticleUpdate = {};
          if (!(outArticleUpdate as any).citations) (outArticleUpdate as any).citations = [];
          const existingCitations = Array.isArray((outArticleUpdate as any).citations) 
            ? (outArticleUpdate as any).citations 
            : [];
          (outArticleUpdate as any).citations = Array.from(new Set([...existingCitations, ...verificationResult.citations]));
        }
        
        endStage(verificationResult.passed, undefined, {
          plagiarismScore: verificationResult.plagiarismScore,
          factualityScore: verificationResult.factualityScore,
          mediaTypeCorrect: verificationResult.mediaTypeCorrect
        });
      } catch (error) {
        console.error('Content verification failed:', error);
        endStage(false, error instanceof Error ? error.message : 'Verification failed');
        if (!qualityRecommendations) qualityRecommendations = [];
        qualityRecommendations.push('⚠️ Content verification fejlede - manual review anbefalet');
      }
      
      if (progressId) {
        updateProgressStep(progressId, 'quality', verificationResult?.passed ? 'completed' : 'failed');
      }
    } else if (progressId && !isFastMode) {
      updateProgressStep(progressId, 'quality', 'skipped');
    }
    // Extract intro from multiple sources - prioritize outArticleUpdate.intro, then extract from content
    let introSection = '';
    if (typeof (outArticleUpdate as any)?.intro === 'string' && (outArticleUpdate as any).intro.trim()) {
      introSection = String((outArticleUpdate as any).intro);
    } else {
      // Try to extract intro from finalContent if not already in intro field
      const extractedIntro = extractIntroSection(finalContent);
      if (extractedIntro) {
        introSection = extractedIntro;
      }
    }
    const combinedArticle = [introSection.trim(), finalContent.trim()]
      .filter(Boolean)
      .join('\n\n');
    let finalWordCount = countWords(combinedArticle);
    // Remove intro from finalContent for body word count
    const bodyContent = introSection ? removeIntroFromContent(finalContent) : finalContent;
    let bodyWordCount = countWords(bodyContent);
    let finalMissingIntro = !hasIntro(finalContent) && !introSection;
    let finalMissingEnding = !hasEnding(finalContent);
    let finalOverlapRatio = computeOverlapRatio(String(notes || ''), finalContent);
    let finalOverlap = finalOverlapRatio > 0.25;

    // Ensure outArticleUpdate.content matches what we're counting (without intro for now)
    // Intro will be added back after normalization
    if (outArticleUpdate && typeof outArticleUpdate === 'object') {
      // Store intro separately
      if (introSection && !(outArticleUpdate as any).intro) {
        (outArticleUpdate as any).intro = introSection;
      }
      // Store content without intro (will be recombined later)
      (outArticleUpdate as any).content = introSection ? removeIntroFromContent(finalContent) : finalContent;
    }

    // Skip rewrite fallback for notes template - it should be good on first attempt
    if ((finalWordCount < targetMin || finalMissingIntro || finalMissingEnding || finalOverlap) && revisionAttempts >= maxRevisions && !isNotesTemplateForRevisions) {
      try {
        console.log('🔄 Starting rewrite fallback due to quality issues...');
        const rewritePrompt = `Genskab hele artiklen fra bunden med Apropos' fulde struktur og tone.

- Længde: ${targetMin}–${targetMax} ord (ikke under ${targetMin}; stræb efter ${Math.min(targetMax, targetMin + 200)} ord).
- START direkte med "Intro:" (ikke ##Intro: eller andet markdown)
- Intro: 2–4 sætninger i jeg-form, sætter tone og nysgerrighed
- Brødtekst: forventning → oplevelse → indsigt → eftertanke (ingen overskrifter)
- Afslut med godkendt label (fx "Eftertanke:") og 2–4 sætninger
- Brug researchdata og noter, men omskriv og udbyg med egne formuleringer (ingen direkte overlap med noter)
- Medtag citations i teksten som [1], [2] svarende til kilderne

Returnér ét JSON-objekt med "response", "articleUpdate" og "citations".`;

        const rewrite = await openai.chat.completions.create({
          model: OPENAI_MODEL,
          messages: [
            { role: 'system', content: finalSystemContent },
            { role: 'user', content: rewritePrompt }
          ],
          temperature: 1, // GPT-5 only supports default temperature (1)
          max_completion_tokens: 6000, // Øget for længere revisioner
          response_format: { type: 'json_object' }
        });

        const rewriteRaw = rewrite.choices[0]?.message?.content;
        const rewriteText = Array.isArray(rewriteRaw)
          ? rewriteRaw
              .map((part: any) => {
                if (typeof part === 'string') return part;
                if (part && typeof part === 'object' && typeof part.text === 'string') return part.text;
                return '';
              })
              .join('')
          : rewriteRaw || '';
        const rewriteNormalized =
          typeof rewriteText === 'string' ? rewriteText : String(rewriteText || '');
        const rewriteParsed = parseModelPayload(rewriteNormalized);

        if (rewriteParsed?.articleUpdate) {
          outResponse = rewriteParsed.response || rewriteParsed.articleUpdate?.content || outResponse;
          outSuggestion = rewriteParsed.suggestion ?? outSuggestion;
          outArticleUpdate = normalizeArticleUpdatePayload({
            ...(outArticleUpdate || {}),
            ...rewriteParsed.articleUpdate
          });
        }
        if (Array.isArray((rewriteParsed as any)?.citations)) {
          outCitations = Array.from(
            new Set([
              ...outCitations,
              ...((rewriteParsed as any).citations as any[]).map((url: any) => String(url)).filter(Boolean)
            ])
          );
        }
      } catch (error) {
        console.error('Forced rewrite failed:', error);
      }
      finalContent = getContent();
      const recombined = [introSection.trim(), finalContent.trim()]
        .filter(Boolean)
        .join('\n\n');
      finalWordCount = countWords(recombined);
      bodyWordCount = countWords(finalContent);
      finalMissingIntro = !hasIntro(finalContent);
      finalMissingEnding = !hasEnding(finalContent);
      finalOverlapRatio = computeOverlapRatio(String(notes || ''), finalContent);
      finalOverlap = finalOverlapRatio > 0.25;
    }

    // Only add quality recommendations if NOT notes template (for notes template, integrate in first attempt)
    const isNotesTemplateForQuality = (articleData as any)?.template === 'notes';
    if (!isFastMode && !isNotesTemplateForQuality) {
      if (finalWordCount < targetMin) {
        qualityRecommendations.push(
          `Artiklen er ${finalWordCount} ord (inklusiv intro). Udvid til mindst ${targetMin} ord (mål ${targetMin}–${targetMax}).`
        );
      }
      if (finalMissingIntro) {
        qualityRecommendations.push('Artiklen mangler en tydelig sektion, der starter med "Intro:" (ikke ##Intro:).');
      }
      if (finalMissingEnding) {
        qualityRecommendations.push('Tilføj en afsluttende sektion med et godkendt label (fx "Eftertanke").');
      }
      if (finalOverlap) {
        qualityRecommendations.push('Noget af teksten matcher dine noter for tæt – omskriv relevante afsnit for unik formulering.');
      }
    }

    // introSection is already set above, ensure it's stored in outArticleUpdate
    const introForDisplay = introSection.trim() || '';
    if (outArticleUpdate && typeof outArticleUpdate === 'object') {
      // Ensure intro is stored
      if (introForDisplay && !(outArticleUpdate as any).intro) {
        (outArticleUpdate as any).intro = introForDisplay;
      }
      // Content is already set without intro above (or with intro if not extracted)
      // We'll recombine after normalization
    }
    // Response without intro for now (will be recombined later)
    outResponse = introForDisplay ? removeIntroFromContent(finalContent) : finalContent;
    
    // Debug: Log word count consistency
    console.log(`🔍 Word count consistency check:`);
    console.log(`  - body word count: ${bodyWordCount}`);
    console.log(`  - combined article word count (intro + body): ${finalWordCount}`);
    console.log(`  - finalContent length: ${finalContent.length} chars`);
    console.log(`  - finalContent preview: ${finalContent.substring(0, 100)}...`);

    // Final salvage: if model still didn't supply articleUpdate.content but response is long text, use it
    // IMPORTANT: Use finalContent (which still has intro) instead of outResponse (which was stripped of intro)
    // This ensures the intro is preserved and can be properly recombined later
    if ((!outArticleUpdate || !outArticleUpdate.content) && (finalContent||'').trim().split(/\s+/).length >= 600) {
      // Store intro separately if we have one
      const salvageIntro = introForDisplay || '';
      const salvageContent = salvageIntro ? removeIntroFromContent(finalContent) : finalContent;
      outArticleUpdate = normalizeArticleUpdatePayload({ 
        ...(outArticleUpdate||{}), 
        content: salvageContent,
        ...(salvageIntro ? { intro: salvageIntro } : {})
      });
    }

    if (citationSet.size > 0) {
      outCitations = Array.from(new Set([...outCitations, ...Array.from(citationSet)]));
    }
    if (outArticleUpdate && typeof outArticleUpdate === 'object') {
      if (outCitations.length > 0) {
        (outArticleUpdate as any).citations = outCitations;
      } else if ((outArticleUpdate as any).citations) {
        delete (outArticleUpdate as any).citations;
      }
      // Save intro before applyFieldFallbacks (which might modify content)
      const introBeforeNormalization = (outArticleUpdate as any).intro?.trim() || introForDisplay || '';
      
      outArticleUpdate = await applyFieldFallbacks(outArticleUpdate, articleData);
      
      // Format title to always include platform/service in parentheses if provided
      const platform = (articleData as any)?.platform || (articleData as any)?.streaming_service || '';
      if (platform && outArticleUpdate && typeof outArticleUpdate === 'object') {
        const currentTitle = (outArticleUpdate as any).title || '';
        if (currentTitle && typeof currentTitle === 'string') {
          // Check if title already has platform in parentheses
          const hasPlatformInTitle = currentTitle.includes(`(${platform})`) || currentTitle.includes(`(${platform.trim()})`);
          if (!hasPlatformInTitle) {
            // Remove any existing parentheses and add platform
            const titleWithoutParentheses = currentTitle.replace(/\s*\([^)]*\)\s*$/, '').trim();
            const formattedTitle = `${titleWithoutParentheses} (${platform})`;
            (outArticleUpdate as any).title = formattedTitle;
            console.log(`✅ Formatted title with platform: "${formattedTitle}"`);
          }
        }
      }
      
      // Preserve SetupWizard topicsSelected - don't let AI override them
      if (Array.isArray(articleData?.topicsSelected) && articleData.topicsSelected.length > 0) {
        outArticleUpdate = { ...outArticleUpdate, topicsSelected: articleData.topicsSelected };
      }
      
      // NOW recombine intro and content for display - AFTER all normalizations
      // This ensures intro shows up in article display
      // Get intro from multiple sources - prioritize outArticleUpdate.intro, then saved intro
      let finalIntro = (outArticleUpdate as any).intro?.trim() || introBeforeNormalization || '';
      
      // If intro is missing, try to extract from current content
      if (!finalIntro) {
        const extractedFromContent = extractIntroSection((outArticleUpdate as any).content || '');
        if (extractedFromContent) {
          finalIntro = extractedFromContent;
        }
      }
      
      // Ensure intro has "Intro:" label if it doesn't already
      if (finalIntro && !/^intro\s*:/i.test(finalIntro)) {
        finalIntro = `Intro: ${finalIntro}`;
      }
      
      // Get content body - remove intro if it's already there to avoid duplication
      let finalContentBody = (outArticleUpdate as any).content?.trim() || finalContent.trim() || '';
      if (finalIntro && finalContentBody.startsWith('Intro:')) {
        // Intro is already in content, extract body part
        finalContentBody = removeIntroFromContent(finalContentBody);
      }
      
      // Combine intro and body
      const contentWithIntro = finalIntro 
        ? [finalIntro, finalContentBody].filter(Boolean).join('\n\n')
        : finalContentBody;
      
      // Store content WITH intro included for article display
      (outArticleUpdate as any).content = contentWithIntro;
      outResponse = contentWithIntro; // Response also includes intro
      
      // Ensure intro is also stored separately for preview panel (without "Intro:" label for preview)
      const introForPreview = finalIntro.replace(/^intro\s*:\s*/i, '').trim();
      if (introForPreview) {
        (outArticleUpdate as any).intro = introForPreview;
      }
      
      console.log(`✅ Final content with intro word count: ${countWords(contentWithIntro)}`);
      console.log(`✅ Intro included in content: ${contentWithIntro.substring(0, 200)}...`);
      console.log(`✅ Intro text: ${finalIntro.substring(0, 100)}...`);
      console.log(`✅ Content body preview: ${finalContentBody.substring(0, 100)}...`);
      console.log(`✅ Final articleUpdate.content length: ${(outArticleUpdate as any).content?.length || 0}`);
      console.log(`✅ Final articleUpdate.content starts with: ${(outArticleUpdate as any).content?.substring(0, 50) || 'N/A'}...`);
    }

    qualityRecommendations = Array.from(
      new Set(
        (qualityRecommendations || [])
          .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
          .filter((entry) => entry.length > 0)
      )
    );

    // Don't show quality recommendations in chat - suppress all warnings
    const suppressWarnings = true; // Always suppress warnings - user doesn't want to see them
    const warningsForChat = [];

    endStage(true, undefined, { 
      qualityIssues: qualityRecommendations.length,
      wordCount: finalWordCount,
      hasCitations: outCitations.length > 0
    });

    const finalResponse = typeof outResponse === 'string' ? outResponse.trim() : '';

    const finalArticleUpdate = (outArticleUpdate && typeof outArticleUpdate === 'object') ? outArticleUpdate : {};
    
    // Include featuredImage from articleData if it exists
    if (articleData?.featuredImage) {
      finalArticleUpdate.featuredImage = articleData.featuredImage;
    }
    const readingTimeMinutes =
      finalWordCount > 0 ? Math.max(1, Math.ceil(finalWordCount / 160)) : 0;

    startStage('response-formatting', { 
      finalWordCount, 
      readingTimeMinutes,
      hasCitations: outCitations.length > 0 
    });

    const responsePayload = { 
      response: finalResponse,
      suggestion: outSuggestion,
      articleUpdate: finalArticleUpdate,
      warnings: warningsForChat, // Empty for notes/fast templates
      citations: outCitations,
      usage: completion.usage,
      mode: generationMode,
      qualityMetrics: {
        issues: qualityRecommendations.length,
        wordCount: finalWordCount,
        bodyWordCount,
        readingTimeMinutes,
        readingTime: readingTimeMinutes,
        introPresent: !finalMissingIntro,
        endingPresent: !finalMissingEnding,
        overlapRatio: Number(finalOverlapRatio.toFixed(3)),
        researchUsed: !!researchData?.success
      }
    };
    const response = NextResponse.json(responsePayload);

    if (progressId) {
      if (isFastMode) {
        updateProgressStep(progressId, 'quality', 'skipped');
      } else {
        updateProgressStep(progressId, 'quality', 'completed');
      }
      updateProgressStep(progressId, 'format', 'active');
    }
    endStage(true, undefined, { 
      responseSize: JSON.stringify(responsePayload).length,
      qualityMetrics: qualityRecommendations.length 
    });

    // Log performance report
    logReport();
    
    console.log('✅ Quality control completed');
    console.log('📊 Final response length:', finalResponse.length);
    console.log('📊 Final article update:', Object.keys(finalArticleUpdate || {}));

    if (progressId) {
      updateProgressStep(progressId, 'format', 'completed');
      completeProgress(progressId);
      console.log('✅ Progress marked as complete');
    }

    return response;

  } catch (error) {
    console.error('OpenAI API error:', error);
    
    // Enhanced error handling with detailed error analysis
    const errorAnalysis = {
      type: error.name || 'UnknownError',
      message: error.message || 'Unknown error occurred',
      stack: error.stack?.split('\n').slice(0, 3).join('\n') || 'No stack trace',
      timestamp: new Date().toISOString(),
      requestId: Math.random().toString(36).substr(2, 9)
    };
    
    console.error('🔍 Error Analysis:', errorAnalysis);
    
    // Determine error category and recovery strategy
    let errorCategory = 'unknown';
    let recoveryMessage = 'Der opstod en uventet fejl';
    let statusCode = 500;
    
    if (error.message?.includes('API key')) {
      errorCategory = 'authentication';
      recoveryMessage = 'OpenAI API nøgle er ikke konfigureret korrekt';
      statusCode = 401;
    } else if (error.message?.includes('rate limit')) {
      errorCategory = 'rate_limit';
      recoveryMessage = 'For mange anmodninger til OpenAI API. Prøv igen om et øjeblik';
      statusCode = 429;
    } else if (error.message?.includes('timeout')) {
      errorCategory = 'timeout';
      recoveryMessage = 'Anmodningen tog for lang tid. Prøv igen';
      statusCode = 408;
    } else if (error.message?.includes('network')) {
      errorCategory = 'network';
      recoveryMessage = 'Netværksfejl. Tjek din internetforbindelse';
      statusCode = 503;
    } else if (error.message?.includes('JSON')) {
      errorCategory = 'parsing';
      recoveryMessage = 'Fejl i dataformatering. Prøv igen';
      statusCode = 400;
    }
    
    // Enhanced error logging
    console.error(`🚨 Error Category: ${errorCategory}`);
    console.error(`🚨 Recovery Message: ${recoveryMessage}`);
    console.error(`🚨 Status Code: ${statusCode}`);
    
    endStage(false, `${errorCategory}: ${error.message}`, errorAnalysis);
    logReport();
    
    if (progressId) {
      const snapshot = getProgress(progressId);
      const failingStep =
        snapshot?.steps.find((step) => step.status === 'active') ??
        snapshot?.steps.find((step) => step.status === 'pending');
      if (failingStep) {
        updateProgressStep(progressId, failingStep.id, 'failed', { error: error.message });
      } else {
        updateProgressStep(progressId, 'format', 'failed', { error: error.message });
      }
      completeProgress(progressId);
    }
    
    return NextResponse.json(
      { 
        response: `${recoveryMessage}. Jeg gemte dine noter, så du kan prøve igen uden at miste noget.`,
        error: recoveryMessage,
        errorCategory,
        requestId: errorAnalysis.requestId,
        timestamp: errorAnalysis.timestamp,
        details: process.env.NODE_ENV === 'development' ? errorAnalysis : undefined
      }
    );
  }
}
