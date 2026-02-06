/**
 * Professional Research & Verification Service
 * 
 * This service ensures ALL generated content is properly researched,
 * verified, and checked for plagiarism before being returned.
 */

import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { config } from '@/lib/config/env';
import { logger } from '@/lib/logger';

const openai = config.openai.apiKey ? new OpenAI({
  apiKey: config.openai.apiKey,
}) : null;

const RESEARCH_MODEL = config.openai.researchModel;

export interface ResearchSources {
  webSearch: Array<{
    title: string;
    content: string;
    url: string;
    snippet: string;
    source: string; // 'Wikipedia', 'DuckDuckGo', 'IMDb', etc.
  }>;
  wikipedia?: {
    title: string;
    content: string;
    url: string;
    language: 'da' | 'en';
  };
  tmdbVerification?: {
    type: 'film' | 'tv' | 'game' | null;
    verified: boolean;
    title?: string;
    id?: number;
    releaseDate?: string;
    overview?: string;
    source: 'TMDB';
  };
  imdb?: {
    title: string;
    type: 'film' | 'tv' | null;
    year?: string;
    rating?: string;
    plot?: string;
    url?: string;
  };
  advancedResearch?: {
    keyFindings: string[];
    culturalContext: string[];
    expertInsights: string[];
    factualData: string[];
    sources: string[];
  };
  similarArticles?: Array<{
    title: string;
    content: string;
    summary: string;
    category?: string;
    source?: string;
    url?: string;
  }>;
}

export interface VerificationResult {
  passed: boolean;
  issues: string[];
  warnings: string[];
  citations: string[];
  plagiarismScore: number; // 0-1, where 1 is completely plagiarized
  factualityScore: number; // 0-1, where 1 is fully verified
  mediaTypeCorrect: boolean;
}

/**
 * Perform comprehensive research for any topic
 */
export async function performComprehensiveResearch(
  topic: string,
  articleData?: any,
  baseUrl?: string,
  options?: {
    enableWebSearch?: boolean;
    enableAdvancedResearch?: boolean;
  }
): Promise<ResearchSources> {
  const enableWebSearch = options?.enableWebSearch !== false; // Default to true
  const enableAdvancedResearch = options?.enableAdvancedResearch === true; // Default to false
  const sources: ResearchSources = {
    webSearch: []
  };

  // 1. Web Search (if enabled) - includes Wikipedia, DuckDuckGo, etc.
  if (enableWebSearch) {
    try {
      if (baseUrl) {
      const searchQuery = extractSearchQuery(topic, articleData);
      const searchResponse = await fetch(`${baseUrl}/api/web-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, maxResults: 10 })
      });

      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        if (Array.isArray(searchData.results)) {
          sources.webSearch = searchData.results.map((result: any) => ({
            title: result.title || 'Ukendt titel',
            content: typeof result.content === 'string' ? result.content : '',
            url: result.url || '',
            snippet: typeof result.content === 'string' 
              ? result.content.substring(0, 300)
              : '',
            source: result.source || 'Web Search'
          }));
          
          // Extract Wikipedia result separately if available
          const wikipediaResult = searchData.results.find((r: any) => r.source === 'Wikipedia');
          if (wikipediaResult) {
            sources.wikipedia = {
              title: wikipediaResult.title || 'Wikipedia',
              content: wikipediaResult.content || '',
              url: wikipediaResult.url || '',
              language: 'da' // Default to Danish, can be enhanced
            };
          }
        }
      }
    }
    } catch (error) {
      logger.error('Web search failed', error instanceof Error ? error : new Error(String(error)), {
        topic,
        baseUrl,
      });
    }
  }

  // 1b. Enhanced Wikipedia Search (both Danish and English) - only if web search is enabled
  if (enableWebSearch) {
    try {
    const searchQuery = extractSearchQuery(topic, articleData);
    
    // Try Danish Wikipedia first
    try {
      const wikiDaUrl = `https://da.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(searchQuery)}`;
      const wikiDaResponse = await fetch(wikiDaUrl);
      
      if (wikiDaResponse.ok) {
        const wikiDaData = await wikiDaResponse.json();
        if (wikiDaData.extract && !sources.wikipedia) {
          sources.wikipedia = {
            title: wikiDaData.title || 'Wikipedia',
            content: wikiDaData.extract,
            url: wikiDaData.content_urls?.desktop?.page || '',
            language: 'da'
          };
        }
      }
    } catch (error) {
      console.log('Danish Wikipedia search failed:', error);
    }
    
    // Try English Wikipedia as fallback
    if (!sources.wikipedia) {
      try {
        const wikiEnUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(searchQuery)}`;
        const wikiEnResponse = await fetch(wikiEnUrl);
        
        if (wikiEnResponse.ok) {
          const wikiEnData = await wikiEnResponse.json();
          if (wikiEnData.extract) {
            sources.wikipedia = {
              title: wikiEnData.title || 'Wikipedia',
              content: wikiEnData.extract,
              url: wikiEnData.content_urls?.desktop?.page || '',
              language: 'en'
            };
          }
        }
      } catch (error) {
        console.log('English Wikipedia search failed:', error);
      }
    }
    } catch (error) {
      console.error('Wikipedia search failed:', error);
    }
  }

  // 2. TMDB Verification (for media reviews) - always performed if relevant
  if (articleData?.title && (isMediaReview(articleData) || topic.toLowerCase().includes('film') || topic.toLowerCase().includes('serie'))) {
    try {
      const tmdbResult = await verifyMediaType(articleData.title);
      if (tmdbResult) {
        sources.tmdbVerification = tmdbResult;
      }
    } catch (error) {
      console.error('TMDB verification failed:', error);
    }
  }

  // 2b. IMDb Search (for additional film/TV information)
  if (articleData?.title && (isMediaReview(articleData) || topic.toLowerCase().includes('film') || topic.toLowerCase().includes('serie'))) {
    try {
      const imdbResult = await searchIMDb(articleData.title);
      if (imdbResult) {
        sources.imdb = imdbResult;
      }
    } catch (error) {
      console.error('IMDb search failed:', error);
    }
  }

  // 3. Advanced Research (for complex topics) - only if enabled
  if (enableAdvancedResearch) {
    try {
      if (baseUrl) {
      const researchResponse = await fetch(`${baseUrl}/api/research-engine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic,
          articleType: articleData?.category || 'Generel',
          author: articleData?.author || 'Apropos Writer',
          platform: articleData?.platform || articleData?.streaming_service,
          targetLength: articleData?.targetLength || 2000
        })
      });

      if (researchResponse.ok) {
        const structured = await researchResponse.json();
        if (structured?.success) {
          sources.advancedResearch = {
            keyFindings: structured.keyFindings || [],
            culturalContext: structured.culturalContext || [],
            expertInsights: structured.expertInsights || [],
            factualData: structured.factualData || [],
            sources: structured.sources || []
          };
        }
      }
      }
    } catch (error) {
      console.error('Advanced research failed:', error);
    }
  }

  // 4. Find similar articles from database for inspiration
  try {
    const similarArticles = await findSimilarArticles(topic, articleData);
    if (similarArticles.length > 0) {
      sources.similarArticles = similarArticles;
      console.log(`📚 Found ${similarArticles.length} similar articles for inspiration`);
    }
  } catch (error) {
    console.error('Failed to find similar articles:', error);
  }

  return sources;
}

/**
 * Verify media type using TMDB
 */
async function verifyMediaType(title: string): Promise<ResearchSources['tmdbVerification'] | null> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return null;

  // Clean title
  let cleanTitle = title
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/\s*:\s*.*$/, '')
    .replace(/\s*-\s*.*$/, '')
    .trim();

  try {
    // Search both film and TV
    const [filmResponse, tvResponse] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(cleanTitle)}&language=da-DK`).catch(() => null),
      fetch(`https://api.themoviedb.org/3/search/tv?api_key=${apiKey}&query=${encodeURIComponent(cleanTitle)}&language=da-DK`).catch(() => null)
    ]);

    const filmData = filmResponse?.ok ? await filmResponse.json().catch(() => null) : null;
    const tvData = tvResponse?.ok ? await tvResponse.json().catch(() => null) : null;

    const filmResults = filmData?.results || [];
    const tvResults = tvData?.results || [];

    const bestFilm = filmResults[0];
    const bestTV = tvResults[0];

    if (bestFilm && (!bestTV || bestFilm.popularity > bestTV.popularity)) {
      return {
        type: 'film',
        verified: true,
        title: bestFilm.title,
        id: bestFilm.id,
        releaseDate: bestFilm.release_date,
        overview: bestFilm.overview,
        source: 'TMDB'
      };
    } else if (bestTV) {
      return {
        type: 'tv',
        verified: true,
        title: bestTV.name,
        id: bestTV.id,
        releaseDate: bestTV.first_air_date,
        overview: bestTV.overview,
        source: 'TMDB'
      };
    }

    return {
      type: null,
      verified: false,
      source: 'TMDB'
    };
  } catch (error) {
    console.error('TMDB verification error:', error);
    return null;
  }
}

/**
 * Check if article is a media review
 */
function isMediaReview(articleData: any): boolean {
  const section = (articleData?.section || '').toLowerCase();
  const topic = (articleData?.topic || '').toLowerCase();
  const category = (articleData?.category || '').toLowerCase();
  
  return section.includes('serier & film') || 
         section.includes('serier og film') ||
         topic.includes('film') || 
         topic.includes('serie') ||
         topic.includes('tv-serier') ||
         category.includes('film') ||
         category.includes('serie');
}

/**
 * Search IMDb for film/TV information
 * Note: IMDb doesn't have a public API, so we use web scraping or alternative sources
 */
async function searchIMDb(title: string): Promise<ResearchSources['imdb'] | null> {
  try {
    // Clean title for search
    let cleanTitle = title
      .replace(/\s*\([^)]*\)\s*$/, '')
      .replace(/\s*:\s*.*$/, '')
      .replace(/\s*-\s*.*$/, '')
      .trim();
    
    // Try to find IMDb page using Wikipedia (which often links to IMDb)
    // Or use a service like OMDB API if available
    const omdbApiKey = process.env.OMDB_API_KEY;
    if (omdbApiKey) {
      try {
        const omdbUrl = `https://www.omdbapi.com/?t=${encodeURIComponent(cleanTitle)}&apikey=${omdbApiKey}`;
        const omdbResponse = await fetch(omdbUrl);
        
        if (omdbResponse.ok) {
          const omdbData = await omdbResponse.json();
          if (omdbData.Response === 'True' && omdbData.Title) {
            return {
              title: omdbData.Title,
              type: omdbData.Type === 'movie' ? 'film' : omdbData.Type === 'series' ? 'tv' : null,
              year: omdbData.Year,
              rating: omdbData.imdbRating,
              plot: omdbData.Plot,
              url: `https://www.imdb.com/title/${omdbData.imdbID}`
            };
          }
        }
      } catch (error) {
        console.log('OMDB API search failed:', error);
      }
    }
    
    // Fallback: Try to construct IMDb URL (not as reliable)
    // This is a best-effort approach
    return null;
  } catch (error) {
    console.error('IMDb search error:', error);
    return null;
  }
}

/**
 * Extract search query from topic and article data
 */
/**
 * Find similar articles from the database for inspiration
 */
async function findSimilarArticles(topic: string, articleData?: any): Promise<ResearchSources['similarArticles']> {
  try {
    const promptsPath = path.join(process.cwd(), 'prompts', 'rage_prompts.jsonl');
    
    if (!fs.existsSync(promptsPath)) {
      return [];
    }

    const fileContent = fs.readFileSync(promptsPath, 'utf8');
    const lines = fileContent.trim().split('\n').filter(line => line.trim());
    
    const articles: any[] = [];
    for (const line of lines) {
      try {
        const article = JSON.parse(line);
        articles.push(article);
      } catch (e) {
        // Skip invalid lines
        continue;
      }
    }

    // Filter articles from last 30 days (more recent = better inspiration)
    // But also include articles without dates if they match search terms
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const recentArticles = articles.filter(article => {
      const articleDate = article.published_at || article.date || article.fetched_at;
      if (!articleDate) {
        // Include articles without dates - they might still be relevant
        return true;
      }
      const date = new Date(articleDate).getTime();
      // Include if recent OR if date is invalid (fallback to including it)
      return date >= thirtyDaysAgo || isNaN(date);
    });

    if (recentArticles.length === 0) {
      return [];
    }

    // Extract keywords from topic and articleData
    const searchTerms: string[] = [];
    
    // Add topic words
    if (topic) {
      const topicWords = topic.toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 3 && !['om', 'den', 'det', 'der', 'og', 'eller'].includes(word));
      searchTerms.push(...topicWords);
    }
    
    // Add title words if available
    if (articleData?.title) {
      const titleWords = articleData.title.toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 3);
      searchTerms.push(...titleWords);
    }
    
    // Add category/topic if available
    if (articleData?.category) {
      searchTerms.push(articleData.category.toLowerCase());
    }
    if (articleData?.topic) {
      searchTerms.push(articleData.topic.toLowerCase());
    }
    
    // Add tags if available
    if (Array.isArray(articleData?.tags)) {
      articleData.tags.forEach((tag: string) => {
        if (tag && tag.length > 2) {
          searchTerms.push(tag.toLowerCase());
        }
      });
    }

    // Score articles based on relevance
    const scoredArticles = recentArticles.map(article => {
      let score = 0;
      const articleText = `${article.title || ''} ${article.summary || ''} ${(article.content || '').substring(0, 500)}`.toLowerCase();
      const articleTags = Array.isArray(article.tags) ? article.tags.map((t: any) => String(t).toLowerCase()) : [];
      const articleCategory = (article.category || '').toLowerCase();
      
      // Title match (high weight)
      if (article.title) {
        const titleLower = article.title.toLowerCase();
        searchTerms.forEach(term => {
          if (titleLower.includes(term)) {
            score += 10;
          }
        });
      }
      
      // Summary/content match
      searchTerms.forEach(term => {
        if (articleText.includes(term)) {
          score += 5;
        }
      });
      
      // Category match
      if (articleCategory && articleData?.category) {
        if (articleCategory.includes(articleData.category.toLowerCase()) || 
            articleData.category.toLowerCase().includes(articleCategory)) {
          score += 8;
        }
      }
      
      // Tag match
      searchTerms.forEach(term => {
        if (articleTags.includes(term)) {
          score += 6;
        }
      });
      
      // Recency bonus (more recent = better)
      const articleDate = article.published_at || article.date || article.fetched_at;
      if (articleDate) {
        const daysSince = (Date.now() - new Date(articleDate).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince <= 7) score += 5;
        else if (daysSince <= 14) score += 3;
        else if (daysSince <= 21) score += 1;
      }
      
      return { article, score };
    });

    // Sort by score and take top 3-5 most relevant articles
    const topArticles = scoredArticles
      .filter(item => item.score > 0) // Only articles with some relevance
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(item => ({
        title: item.article.title || 'Ukendt titel',
        content: item.article.content || item.article.summary || '',
        summary: item.article.summary || '',
        category: item.article.category,
        source: item.article.source,
        url: item.article.url
      }));

    return topArticles;
  } catch (error) {
    console.error('Error finding similar articles:', error);
    return [];
  }
}

function extractSearchQuery(topic: string, articleData?: any): string {
  const terms = [];
  
  // Add title if available
  if (articleData?.title) {
    let title = articleData.title
      .replace(/\s*\([^)]*\)\s*$/, '')
      .replace(/\s*:\s*.*$/, '')
      .trim();
    if (title.length > 5) {
      terms.push(title);
    }
  }
  
  // Add topic
  if (topic && topic.length > 3) {
    terms.push(topic);
  }
  
  // Add category/topic if available
  if (articleData?.category) terms.push(articleData.category);
  if (articleData?.topic) terms.push(articleData.topic);
  
  return terms.length > 0 ? terms.join(' ') : topic;
}

/**
 * Verify generated content against research sources
 * Returns verification result with plagiarism and factuality scores
 */
export async function verifyContent(
  generatedContent: string,
  researchSources: ResearchSources,
  originalNotes?: string
): Promise<VerificationResult> {
  const result: VerificationResult = {
    passed: true,
    issues: [],
    warnings: [],
    citations: [],
    plagiarismScore: 0,
    factualityScore: 0,
    mediaTypeCorrect: true
  };

  if (!openai) {
    result.warnings.push('OpenAI API not available - skipping verification');
    return result;
  }

  // 1. Plagiarism Check
  try {
    const plagiarismScore = await checkPlagiarism(generatedContent, researchSources, originalNotes);
    result.plagiarismScore = plagiarismScore;
    
    if (plagiarismScore > 0.4) {
      result.passed = false;
      result.issues.push(`Høj plagiat-score (${Math.round(plagiarismScore * 100)}%) - indholdet er for tæt på kilderne`);
    } else if (plagiarismScore > 0.25) {
      result.warnings.push(`Moderat plagiat-score (${Math.round(plagiarismScore * 100)}%) - overvej at parafrasere mere`);
    }
  } catch (error) {
    console.error('Plagiarism check failed:', error);
    result.warnings.push('Plagiat-check fejlede');
  }

  // 2. Factuality Check
  try {
    const factualityScore = await checkFactuality(generatedContent, researchSources);
    result.factualityScore = factualityScore;
    
    if (factualityScore < 0.7) {
      result.passed = false;
      result.issues.push(`Lav faktualitet-score (${Math.round(factualityScore * 100)}%) - nogle påstande kan ikke verificeres`);
    } else if (factualityScore < 0.85) {
      result.warnings.push(`Moderat faktualitet-score (${Math.round(factualityScore * 100)}%) - nogle påstande mangler kilder`);
    }
  } catch (error) {
    console.error('Factuality check failed:', error);
    result.warnings.push('Faktualitet-check fejlede');
  }

  // 3. Media Type Verification
  if (researchSources.tmdbVerification?.verified) {
    const contentLower = generatedContent.toLowerCase();
    const isFilm = researchSources.tmdbVerification.type === 'film';
    const isTV = researchSources.tmdbVerification.type === 'tv';
    
    // Check if content incorrectly refers to media type
    if (isFilm && (contentLower.includes('serie') || contentLower.includes('sæson'))) {
      result.mediaTypeCorrect = false;
      result.passed = false;
      result.issues.push('FEJL: Værket er en FILM, men artiklen omtaler det som en serie');
    } else if (isTV && contentLower.includes('film') && !contentLower.includes('tv-film')) {
      result.mediaTypeCorrect = false;
      result.passed = false;
      result.issues.push('FEJL: Værket er en TV-SERIE, men artiklen omtaler det som en film');
    }
  }

  // 4. Extract citations
  result.citations = extractCitations(generatedContent, researchSources);

  // Final check
  if (result.issues.length > 0) {
    result.passed = false;
  }

  return result;
}

/**
 * Check for plagiarism against sources and original notes
 */
async function checkPlagiarism(
  content: string,
  sources: ResearchSources,
  originalNotes?: string
): Promise<number> {
  if (!openai) return 0;

  // Build source text for comparison
  const sourceTexts: string[] = [];
  
  // Add web search results
  sources.webSearch.forEach(result => {
    if (result.content) sourceTexts.push(result.content);
  });
  
  // Add original notes if provided
  if (originalNotes) {
    sourceTexts.push(originalNotes);
  }
  
  // Add advanced research findings
  if (sources.advancedResearch) {
    sourceTexts.push(...sources.advancedResearch.keyFindings);
  }

  if (sourceTexts.length === 0) return 0;

  try {
    const response = await openai.chat.completions.create({
      model: RESEARCH_MODEL,
      messages: [
        {
          role: 'system',
          content: 'Du er en plagiat-detektor. Analyser om det genererede indhold er for tæt på kilderne. Returnér kun et JSON objekt med "similarity" (0-1, hvor 1 er identisk) og "explanation".'
        },
        {
          role: 'user',
          content: `Genereret indhold:\n${content.substring(0, 2000)}\n\nKilder:\n${sourceTexts.join('\n\n').substring(0, 3000)}\n\nAnalyser plagiat-niveau. Returnér JSON: {"similarity": 0.0-1.0, "explanation": "..."}`
        }
      ],
      temperature: 0.3,
      max_completion_tokens: 200,
      response_format: { type: 'json_object' }
    });

    const result = JSON.parse(response.choices[0]?.message?.content || '{"similarity": 0}');
    return result.similarity || 0;
  } catch (error) {
    console.error('Plagiarism check error:', error);
    // Fallback: simple text similarity
    return calculateTextSimilarity(content, sourceTexts.join(' '));
  }
}

/**
 * Check factuality of generated content against research sources
 */
async function checkFactuality(
  content: string,
  sources: ResearchSources
): Promise<number> {
  if (!openai) return 0;

  // Build verification context
  const verificationContext: string[] = [];
  
  if (sources.tmdbVerification?.verified) {
    verificationContext.push(`TMDB: ${sources.tmdbVerification.title} er en ${sources.tmdbVerification.type}`);
    if (sources.tmdbVerification.overview) {
      verificationContext.push(`Beskrivelse: ${sources.tmdbVerification.overview}`);
    }
  }
  
  sources.webSearch.forEach((result, index) => {
    verificationContext.push(`[${index + 1}] ${result.title}: ${result.snippet}`);
  });
  
  if (sources.advancedResearch?.factualData) {
    verificationContext.push(`Faktuelle data: ${sources.advancedResearch.factualData.join(', ')}`);
  }

  if (verificationContext.length === 0) return 0.5; // Neutral if no sources

  try {
    const response = await openai.chat.completions.create({
      model: RESEARCH_MODEL,
      messages: [
        {
          role: 'system',
          content: 'Du er en faktualitets-verifikator. Analyser om påstande i det genererede indhold kan verificeres mod kilderne. Returnér kun et JSON objekt med "factuality" (0-1, hvor 1 er fuldt verificeret) og "unverifiedClaims" (array af påstande der ikke kan verificeres).'
        },
        {
          role: 'user',
          content: `Genereret indhold:\n${content.substring(0, 2000)}\n\nKilder til verifikation:\n${verificationContext.join('\n\n').substring(0, 3000)}\n\nAnalyser faktualitet. Returnér JSON: {"factuality": 0.0-1.0, "unverifiedClaims": []}`
        }
      ],
      temperature: 0.3,
      max_completion_tokens: 300,
      response_format: { type: 'json_object' }
    });

    const result = JSON.parse(response.choices[0]?.message?.content || '{"factuality": 0.5}');
    return result.factuality || 0.5;
  } catch (error) {
    console.error('Factuality check error:', error);
    return 0.5; // Neutral on error
  }
}

/**
 * Extract citations from content based on research sources
 */
function extractCitations(content: string, sources: ResearchSources): string[] {
  const citations: string[] = [];
  
  // Extract URLs from web search
  sources.webSearch.forEach(result => {
    if (result.url && !citations.includes(result.url)) {
      citations.push(result.url);
    }
  });
  
  // Extract URLs from advanced research
  if (sources.advancedResearch?.sources) {
    sources.advancedResearch.sources.forEach(url => {
      if (url && !citations.includes(url)) {
        citations.push(url);
      }
    });
  }
  
  return citations;
}

/**
 * Simple text similarity calculation (fallback)
 */
function calculateTextSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/));
  const words2 = new Set(text2.toLowerCase().split(/\s+/));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

/**
 * Format research sources for AI prompt
 */
export function formatResearchForPrompt(sources: ResearchSources): string {
  let prompt = '\n\n**RESEARCH DATA TILGÆNGELIG - BRUG DISSE FAKTA:**\n';
  
  // Wikipedia (prioritized - most reliable source)
  if (sources.wikipedia) {
    prompt += '\n**WIKIPEDIA (primær kilde):**\n';
    prompt += `📖 ${sources.wikipedia.title} (${sources.wikipedia.language === 'da' ? 'Dansk' : 'Engelsk'})\n`;
    prompt += `${sources.wikipedia.content.substring(0, 500)}...\n`;
    if (sources.wikipedia.url) {
      prompt += `Kilde: ${sources.wikipedia.url}\n`;
    }
    prompt += '\n🚨 KRITISK: Wikipedia er en verificeret kilde - brug denne information som primær reference!\n';
    prompt += '\n';
  }
  
  // Web Search Results (DuckDuckGo, etc.)
  if (sources.webSearch.length > 0) {
    prompt += '\n**FAKTUEL RESEARCH (web):**\n';
    sources.webSearch.forEach((result, index) => {
      prompt += `[${index + 1}] ${result.title} (${result.source || 'Web'})\n`;
      if (result.snippet) {
        prompt += `${result.snippet}\n`;
      }
      if (result.url) {
        prompt += `Kilde: ${result.url}\n`;
      }
      prompt += '\n';
    });
  }
  
  // IMDb (for film/TV)
  if (sources.imdb) {
    prompt += '\n**IMDb VERIFIKATION:**\n';
    prompt += `🎬 ${sources.imdb.title}`;
    if (sources.imdb.year) prompt += ` (${sources.imdb.year})`;
    if (sources.imdb.type) prompt += ` - ${sources.imdb.type === 'film' ? 'FILM' : 'TV-SERIE'}`;
    prompt += '\n';
    if (sources.imdb.rating) {
      prompt += `IMDb Rating: ${sources.imdb.rating}/10\n`;
    }
    if (sources.imdb.plot) {
      prompt += `Plot: ${sources.imdb.plot.substring(0, 300)}...\n`;
    }
    if (sources.imdb.url) {
      prompt += `Kilde: ${sources.imdb.url}\n`;
    }
    prompt += '\n';
  }
  
  // TMDB Verification
  if (sources.tmdbVerification?.verified) {
    prompt += '\n**MEDIATYPE VERIFIKATION (TMDB):**\n';
    prompt += `✅ VERIFICERET: "${sources.tmdbVerification.title}" er en ${sources.tmdbVerification.type === 'film' ? 'FILM' : 'TV-SERIE'}\n`;
    prompt += `TMDB ID: ${sources.tmdbVerification.id}\n`;
    if (sources.tmdbVerification.releaseDate) {
      prompt += `Premiere: ${sources.tmdbVerification.releaseDate}\n`;
    }
    if (sources.tmdbVerification.overview) {
      prompt += `Beskrivelse: ${sources.tmdbVerification.overview.substring(0, 200)}...\n`;
    }
    prompt += '\n🚨 KRITISK: DU SKAL ALDRIG kalde dette en ' + (sources.tmdbVerification.type === 'film' ? 'serie' : 'film') + '!\n';
    prompt += '🚨 DU SKAL ALDRIG opdigte fakta om dette værk!\n';
  }
  
  // Advanced Research
  if (sources.advancedResearch) {
    prompt += '\n**AVANCERET RESEARCH:**\n';
    if (sources.advancedResearch.keyFindings.length > 0) {
      prompt += '**Hovedfund:**\n';
      sources.advancedResearch.keyFindings.slice(0, 3).forEach((finding, index) => {
        prompt += `${index + 1}. ${finding}\n`;
      });
      prompt += '\n';
    }
    if (sources.advancedResearch.factualData.length > 0) {
      prompt += '**Faktuelle Data:**\n';
      sources.advancedResearch.factualData.slice(0, 3).forEach(data => {
        prompt += `- ${data}\n`;
      });
      prompt += '\n';
    }
  }
  
  // Similar Articles for Inspiration (CRITICAL for style and context)
  if (sources.similarArticles && sources.similarArticles.length > 0) {
    prompt += '\n**INSPIRATION FRA LIGNENDE ARTIKLER (BRUG DISSE SOM STIL- OG INDHOLDSINSPIRATION):**\n';
    prompt += '🚨 KRITISK: Disse artikler er fra Apropos Magazine eller lignende kilder. Brug dem til at forstå:\n';
    prompt += '- Hvordan lignende emner er blevet behandlet\n';
    prompt += '- Hvilken stil og tone der bruges\n';
    prompt += '- Hvilke vinkler og perspektiver der fungerer\n';
    prompt += '- Hvordan strukturen og opbygningen er\n';
    prompt += '\n🚨 VIGTIGT OM TOV OG STRUKTUR:\n';
    prompt += '- FORFATTERENS TOV (Tone of Voice) som er defineret tidligere i prompten er DIN PRIMÆRE IDENTITET\n';
    prompt += '- Struktur-reglerne fra structure.apropos.md skal ALTID følges\n';
    prompt += '- Disse lignende artikler er KUN inspiration - de må ALDRIG overskrive din TOV eller struktur\n';
    prompt += '- Brug dem til at se hvordan andre har behandlet lignende emner, men skriv med DIN forfatter-identitet\n';
    prompt += '- Hvis der er konflikt mellem lignende artikler og din TOV/struktur, følg ALTID din TOV/struktur\n';
    prompt += '\n**LIGNENDE ARTIKLER:**\n';
    sources.similarArticles.forEach((article, index) => {
      prompt += `\n[Inspiration ${index + 1}] ${article.title}`;
      if (article.category) prompt += ` (${article.category})`;
      prompt += '\n';
      if (article.summary) {
        prompt += `Resume: ${article.summary.substring(0, 200)}${article.summary.length > 200 ? '...' : ''}\n`;
      }
      if (article.content) {
        // Extract first paragraph or first 300 chars as style example
        const contentPreview = article.content
          .replace(/<[^>]*>/g, '') // Remove HTML tags
          .substring(0, 300)
          .trim();
        if (contentPreview) {
          prompt += `Indholdseksempel: ${contentPreview}...\n`;
        }
      }
      if (article.url) {
        prompt += `Kilde: ${article.url}\n`;
      }
    });
    prompt += '\n🚨 VIGTIGT: Brug disse artikler som INSPIRATION - ikke som kilde til fakta.\n';
    prompt += 'Lad dig inspirere af deres stil, vinkler og tilgang, men skriv din egen originale artikel.\n';
    prompt += 'Kopier ALDRIG direkte - brug dem til at forstå hvordan lignende emner kan behandles.\n';
    prompt += 'HUSK: Din forfatter-TOV og struktur-reglerne er ALTID vigtigere end disse eksempler.\n';
  }
  
  prompt += '\n**KRITISK INSTRUKTION:**\n';
  prompt += '- Brug kilderne ovenfor og henvis i teksten med firkantede parenteser – fx [1], [2]\n';
  prompt += '- Undgå at opdigte fakta; hvis detaljer mangler, skriv generelt (fx "instruktøren")\n';
  prompt += '- Parafrasér altid - kopier ALDRIG direkte fra kilder\n';
  prompt += '- Hver faktuel påstand skal kunne verificeres mod kilderne\n';
  prompt += '- Hvis der er lignende artikler, lad dig inspirere af deres stil og tilgang, men skriv originalt\n';
  
  return prompt;
}

