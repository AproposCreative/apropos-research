import { NextRequest, NextResponse } from 'next/server';
import { getOpenAIClient, models } from '@/lib/openai';
import { config } from '@/lib/config/env';
import { logger, createRequestLogger } from '@/lib/logger';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';

const openai = getOpenAIClient();

interface GenerateImageRequest {
  title: string;
  topic?: string;
  author?: string;
  category?: string;
  content?: string;
}

interface GenerateImageResponse {
  success: boolean;
  imageUrl?: string;
  prompt?: string;
  error?: string;
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const requestLogger = createRequestLogger(requestId);
  
  try {
    const aiImagesEnabled =
      process.env.AI_IMAGE_GENERATION_ENABLED === '1' ||
      process.env.AI_IMAGE_GENERATION_ENABLED?.toLowerCase() === 'true';
    if (!aiImagesEnabled) {
      requestLogger.warn('generate-image rejected — AI billedgenerering er globalt slået fra');
      return NextResponse.json(
        createErrorResponse(
          'AI-billedgenerering er slået fra. Brug officielle billeder / upload / tom thumb.',
          {
            statusCode: 403,
            errorCode: ErrorCode.INVALID_REQUEST,
            requestId,
          }
        ),
        { status: 403 }
      );
    }

    if (!openai) {
      requestLogger.error('OpenAI client not initialized');
      return NextResponse.json(
        createErrorResponse('OpenAI API key not configured', {
          statusCode: 500,
          errorCode: ErrorCode.MISSING_API_KEY,
          requestId,
        }),
        { status: 500 }
      );
    }

    const requestBody = await req.json().catch(() => ({}));
    const { title, topic, author, category, content, section, platform, streaming_service, rating, skipIndex } = requestBody as GenerateImageRequest & { section?: string; platform?: string; streaming_service?: string; rating?: number; skipIndex?: number };

    requestLogger.info('Generate image request received', {
      hasTitle: !!title,
      title: title?.substring(0, 50),
      category,
      section,
      topic,
      platform,
      streaming_service,
    });

    if (!title) {
      requestLogger.warn('Missing title in request');
      return NextResponse.json(
        createErrorResponse('Title is required for image generation', {
          statusCode: 400,
          errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
          requestId,
        }),
        { status: 400 }
      );
    }

    // Check if this is a film/TV/game review - if so, search for existing images instead of generating
    requestLogger.debug('Checking if article is media review', { 
      title, 
      category, 
      section, 
      topic, 
      platform, 
      streaming_service,
      sectionValue: section,
      topicValue: topic
    });
    
    // ALWAYS try to search for media images first if section/topic matches
    // Don't fall back to AI generation for media reviews - only search
    const shouldSearchForMedia = checkIfMediaReview({ title, category, section, topic, platform, streaming_service, content, rating });
    requestLogger.debug('Should search for media', {
      shouldSearchForMedia,
      title,
      category,
      section,
      topic,
      platform,
      streaming_service
    });
    
    if (shouldSearchForMedia) {
      requestLogger.info('Detected media review, searching for existing image first');
      let foundMediaImage = false;
      try {
        // Import and call search functions directly to avoid HTTP fetch issues
        const { isMediaReview: checkMediaReview, searchTMDB, searchGoogleImages } = await import('@/lib/media-search-utils');
        
        // Check media type and get search term
        const mediaCheck = checkMediaReview({
          title,
          category,
          section,
          topic,
          platform,
          streaming_service,
          content
        });
        
        requestLogger.debug('Media check result', { mediaCheck });
        
        if (!mediaCheck.type) {
          requestLogger.warn('Media check returned no type, but shouldSearchForMedia was true. This might indicate a detection issue.');
        }
        
        if (mediaCheck.type === 'film' || mediaCheck.type === 'tv') {
          requestLogger.info(`Searching TMDB for ${mediaCheck.type}`, { searchTerm: mediaCheck.searchTerm });
          
          // For film/TV we only use TMDB – no DALL-E fallback (officielle poster/backdrops)
          if (!config.features.tmdb) {
            requestLogger.warn('TMDB_API_KEY is not set. Film/TV anmeldelser kræver TMDB.');
            return NextResponse.json(
              createErrorResponse(
                'For film- og serieanmeldelser hentes billeder fra TMDB. Sæt TMDB_API_KEY i miljøvariabler for at bruge denne funktion.',
                { statusCode: 503, errorCode: ErrorCode.TMDB_ERROR, requestId }
              ),
              { status: 503 }
            );
          }
          const sectionLower = (section || '').toLowerCase();
          const shouldTryBoth = sectionLower.includes('serier & film') || sectionLower.includes('serier og film');
          let imageUrl: string | null = null;
          const skipIdx = skipIndex || 0;
          if (shouldTryBoth && mediaCheck.type === 'tv') {
            requestLogger.debug('Trying film first (Serier & Film section)', { searchTerm: mediaCheck.searchTerm, skipIndex: skipIdx });
            imageUrl = await searchTMDB(mediaCheck.searchTerm, 'film', skipIdx);
            if (!imageUrl) {
              console.log(`🔍 Film search failed, trying TV: "${mediaCheck.searchTerm}" (skipIndex: ${skipIdx})`);
              imageUrl = await searchTMDB(mediaCheck.searchTerm, 'tv', skipIdx);
            }
          } else {
            imageUrl = await searchTMDB(mediaCheck.searchTerm, mediaCheck.type, skipIdx);
          }
          if (imageUrl) {
            console.log(`✅ Found TMDB image: ${imageUrl}`);
            foundMediaImage = true;
            return NextResponse.json({
              success: true,
              imageUrl: imageUrl,
              source: 'tmdb',
              prompt: 'Found from TMDB'
            });
          }
          const isPlaceholderTitle = !title || title.toLowerCase().includes('arbejdstitel') || title.toLowerCase().includes('ikke sat');
          const errMsg = isPlaceholderTitle
            ? `Sæt en konkret titel (fx serienavn) før du henter billede.`
            : `Ingen poster/backdrop fundet i TMDB for "${mediaCheck.searchTerm}". Prøv at tilpasse titel eller tjek at værket findes.`;
          return NextResponse.json(
            createErrorResponse(errMsg, { statusCode: 404, errorCode: ErrorCode.NOT_FOUND, requestId }),
            { status: 404 }
          );
        } else if (mediaCheck.type === 'game') {
          console.log(`🔍 Searching Google Images for game: "${mediaCheck.searchTerm}"`);
          const imageUrl = await searchGoogleImages(mediaCheck.searchTerm);
          if (imageUrl) {
            // Return Google Images URL directly - may need CORS proxy for some sources
            // But for now, return directly and let browser handle it
            console.log(`✅ Returning Google Images URL directly for: ${title}`);
            foundMediaImage = true;
            return NextResponse.json({
              success: true,
              imageUrl: imageUrl, // Return Google Images URL directly
              source: 'google',
              prompt: 'Found from Google'
            });
          } else {
            // No image found - fall back to AI generation if title is not a placeholder
            console.log(`⚠️ No Google image found for: "${mediaCheck.searchTerm}"`);
            
            // If title is a placeholder, don't fall back to AI
            const isPlaceholderTitle = !title || title.toLowerCase().includes('arbejdstitel') || title.toLowerCase().includes('ikke sat');
            if (isPlaceholderTitle) {
              return NextResponse.json({
                success: false,
                error: `No image found for game: ${mediaCheck.searchTerm}. Please set a proper title before generating images.`
              }, { status: 404 });
            }
            
            // Fall back to AI generation for non-placeholder titles
            console.log('🎨 Falling back to AI generation for game review...');
            // Continue to AI generation below
          }
        } else {
          // No media type detected - this shouldn't happen if checkIfMediaReview returned true
          console.error(`❌ No media type detected for: "${mediaCheck.searchTerm}"`, {
            title,
            category,
            section,
            topic,
            platform,
            streaming_service,
            mediaCheckResult: mediaCheck
          });
          // Don't return 400 - fall back to AI generation instead
          console.log('🎨 Falling back to AI generation (no media type detected)');
          // Continue to AI generation below
        }
      } catch (error) {
        console.error('❌ Media image search error:', error);
        // Continue to AI generation on error
        foundMediaImage = false;
      }
      
      // If we found a media image, we already returned it above
      // Otherwise, continue to AI generation
      if (foundMediaImage) {
        return; // This should never be reached, but just in case
      }
      
      console.log('🎨 No media image found, falling back to AI generation...');
    }
    
    // Generate AI image (either not a media review, or fallback from media search)
    console.log('🎨 Generating AI image for:', title);

    // Generate contextual prompt based on article content
    const prompt = await generateAproposPrompt({
      title,
      topic,
      author,
      category,
      content
    });

    console.log('🎨 Generated Apropos prompt:', prompt);

    // Generate image using DALL-E 3 (backup when no official image found; film/TV use TMDB only)
    const imageResponse = await openai.images.generate({
      model: "dall-e-3",
      prompt: prompt,
      size: "1792x1024", // 16:9 aspect ratio (closest to 1920x1080)
      quality: "hd",
      n: 1,
    });

    const imageUrl = imageResponse.data[0]?.url;

    if (!imageUrl) {
      throw new Error('No image URL returned from DALL-E 3');
    }

    console.log('✅ Apropos-style image generated successfully:', imageUrl);

    // Process image to WebP format and compress to under 400KB
    let processedImageUrl = imageUrl;
    try {
      console.log('🖼️ Processing image to WebP format...');
      const processResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/process-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: imageUrl,
          maxSizeKB: 400,
          quality: 85
        })
      });

      if (processResponse.ok) {
        const processData = await processResponse.json();
        if (processData.success && processData.processedImageUrl) {
          processedImageUrl = processData.processedImageUrl;
          console.log(`✅ Image processed: ${processData.originalSizeKB}KB → ${processData.processedSizeKB}KB`);
        }
      } else {
        console.log('⚠️ Image processing failed, using original image');
      }
    } catch (error) {
      console.log('⚠️ Image processing error, using original image:', error);
    }

    return NextResponse.json({
      success: true,
      imageUrl: processedImageUrl,
      prompt
    });

  } catch (err) {
    console.error('❌ Image generation API error:', err);
    console.error('❌ Error details:', {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      name: err instanceof Error ? err.name : undefined
    });
    
    // If it's a validation error (like missing title), return 400
    if (err instanceof Error && err.message.includes('required')) {
      return NextResponse.json({
        success: false,
        error: err.message
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : 'Image generation failed'
    }, { status: 500 });
  }
}

async function generateAproposPrompt(data: GenerateImageRequest): Promise<string> {
  const { title, topic, author, category, content } = data;

  // 1) ARTICLE SUBJECT – ud fra titel (og evt. indhold) så billedet matcher artiklen
  const subjectFromTitle = deriveVisualSubjectFromTitle(title || '');
  const hasRealContent = content && content.length > 100 && !content.includes('Her vil artikelindholdet blive vist');
  let articleSubject = subjectFromTitle;
  if (hasRealContent) {
    const themes = await extractVisualThemes(content.substring(0, 800), title || '', category || '');
    if (themes.length > 0) {
      articleSubject = [subjectFromTitle, themes.join(', ')].filter(Boolean).join('. ');
    }
  }
  const subjectLine = `ARTICLE SUBJECT (the image MUST reflect this theme, not something else): ${articleSubject}.`;

  // Base Apropos prompt - EXACT STYLE MUST BE MAINTAINED
  let basePrompt = `Create a hand-drawn digital illustration in Apropos Magazine style. Minimal and editorial with soft digital texture. 

${subjectLine}

CRITICAL REQUIREMENTS:
- NO TEXT: Absolutely no text, logos, letters, numbers, or words of any kind. Pure visual elements only.
- Format: 16:9 aspect ratio (1920x1080)
- Background: Solid off-white with subtle grainy texture
- Style: Hand-drawn, digital, fresh and subtle - like modern magazine illustrations
- Color palette: Muted, aesthetic colors that match the article's tone
- Focus: Mood, feeling, and motif - NOT plot or people
- Composition: Clean, minimal, editorial aesthetic
- Visual elements: Abstract shapes, patterns, or subtle symbolic elements that represent the article's theme (see ARTICLE SUBJECT above)

STYLE GUIDELINES:
- Hand-drawn digital aesthetic (like contemporary magazine illustrations)
- Soft, subtle textures
- Muted color palette (not bright or saturated)
- Minimal composition with breathing room
- Editorial and sophisticated feel
- Avoid literal representations - use abstract, symbolic, or mood-based visuals

SAFETY: Only positive, artistic, and safe elements. No violence, conflict, or problematic content.

Remember: This is a PURE IMAGE with NO TEXT WHATSOEVER.`;

  // Add contextual elements based on category and content
  const contextualElements: string[] = [];

  if (category?.toLowerCase().includes('anmeld')) {
    contextualElements.push('kritisk og analytisk stemning');
  } else if (category?.toLowerCase().includes('koncert')) {
    contextualElements.push('live musik og energi');
  } else if (category?.toLowerCase().includes('gaming')) {
    contextualElements.push('digital verden og spil');
  } else if (category?.toLowerCase().includes('film') || (title && /film|netflix|serie|streaming|biograf|movie/i.test(title))) {
    contextualElements.push('cinematisk, film og streaming – IKKE koncert eller band');
  } else if (category?.toLowerCase().includes('festival')) {
    contextualElements.push('festival og fejring');
  } else if (category?.toLowerCase().includes('kultur')) {
    contextualElements.push('kulturel og kunstnerisk');
  }

  if (topic) {
    contextualElements.push(`tema: ${topic}`);
  }

  if (author) {
    contextualElements.push(`stemning som ${author}'s skrivestil`);
  }

  if (hasRealContent && content) {
    const contentSummary = content.substring(0, 200).replace(/\s+/g, ' ').trim();
    contextualElements.push(`artikelindhold: ${contentSummary}...`);
  }

  if (contextualElements.length > 0) {
    basePrompt += `\n\nKontekst: ${contextualElements.join(', ')}.`;
  }

  return basePrompt;
}

/** Udtrækker et kort, visuelt emne fra titel så prompten matcher artiklen (fx "film på Netflix", "koncert", "spil"). */
function deriveVisualSubjectFromTitle(title: string): string {
  const t = title.toLowerCase();
  if (!title || t.includes('arbejdstitel') || t.includes('ikke sat')) return 'generel redaktionel illustration';
  const parts: string[] = [];
  if (/netflix|hbo|disney|prime|viaplay|streaming|apple tv|serie|film|biograf|movie/i.test(t)) {
    parts.push('film og streaming – cinematisk stemning, ikke koncert eller band');
  }
  if (/koncert|live|band|artist|festival|musik/i.test(t)) {
    parts.push('live musik og koncert – ikke film eller streaming');
  }
  if (/spil|gaming|playstation|xbox|nintendo|game/i.test(t)) {
    parts.push('gaming og spil – digital atmosfære');
  }
  if (/anmeld|review|bedømmelse/i.test(t)) {
    parts.push('anmeldelsesstemning');
  }
  if (parts.length === 0) {
    // Kort version af titel som emne (max ~60 tegn)
    const clean = title.replace(/\s+/g, ' ').trim();
    parts.push(clean.length > 60 ? clean.substring(0, 57) + '...' : clean);
  }
  return parts.join('. ');
}

async function extractVisualThemes(content: string, title: string, category: string): Promise<string[]> {
  try {
    // Use AI to analyze content and extract visual themes
    const aiClient = getOpenAIClient();
    if (!aiClient) return [];

    const analysisPrompt = `Analyze this article and extract 3-5 SAFE visual themes for image generation.

Article title: "${title}"
Category: "${category}"
Content: "${content.substring(0, 800)}"

IMPORTANT: Only positive, safe, and artistic themes. No violence, conflict, or problematic content.

Extract abstract, symbolic, or mood-based visual themes that can be represented in a minimal, editorial illustration style.

Examples of safe themes:
- Gaming: "abstract game controller shapes, digital patterns, technological aesthetics"
- Music: "musical note silhouettes, sound wave patterns, rhythmic visual elements"
- Film: "cinematic lighting effects, film strip patterns, dramatic atmosphere"
- Festival: "celebratory geometric shapes, festive color gradients, energetic patterns"
- Culture: "artistic composition elements, creative visual motifs, cultural symbols"

Return ONLY safe themes in Danish. No explanations. Focus on abstract, symbolic, or pattern-based visual elements.

Themes:`;

    const response = await aiClient.chat.completions.create({
      model: models.default,
      messages: [{ role: 'user', content: analysisPrompt }],
      max_completion_tokens: 100,
      temperature: 1, // GPT-5 only supports default temperature (1)
    });

    const themesText = response.choices[0]?.message?.content?.trim() || '';
    
    if (themesText) {
      const themes = themesText.split(',').map(theme => theme.trim()).filter(Boolean);
      const safeThemes = filterSafeThemes(themes);
      console.log('🎨 Extracted visual themes:', safeThemes);
      return safeThemes;
    }
  } catch (error) {
    console.error('❌ Error extracting visual themes:', error);
  }

  // Fallback to simple keyword matching
  const themes = [];
  const text = content.toLowerCase();

  // Specific content analysis with safe themes
  if (text.includes('astro bot') || text.includes('playstation') || text.includes('dualsense')) {
    themes.push('retro gaming konsol', 'pixel art stil', 'digitale farver');
  } else if (text.includes('gaming') || text.includes('spil') || text.includes('nintendo') || text.includes('xbox')) {
    themes.push('gaming atmosfære', 'digital teknologi', 'spil karakterer');
  }

  if (text.includes('koncert') || text.includes('live') || text.includes('band') || text.includes('artist')) {
    themes.push('koncert scene', 'musik instrumenter', 'live energi');
  }

  if (text.includes('film') || text.includes('cinema') || text.includes('biograf') || text.includes('movie')) {
    themes.push('cinematisk stemning', 'film atmosfære', 'dramatisk lys');
  }

  if (text.includes('festival') || text.includes('musik festival')) {
    themes.push('festival atmosfære', 'farverige lys', 'musik scene');
  }

  if (text.includes('tech') || text.includes('teknologi') || text.includes('ai') || text.includes('digital')) {
    themes.push('teknologi', 'fremtid', 'digital innovation');
  }

  if (text.includes('kultur') || text.includes('kunst') || text.includes('art') || text.includes('museum')) {
    themes.push('kulturel atmosfære', 'kunstnerisk', 'kreativ miljø');
  }

  return filterSafeThemes(themes);
}

// Check if article is about film, TV series, or game
// Enhanced detection: Check section, category, topic, platform, and content
function checkIfMediaReview(data: {
  title?: string;
  category?: string;
  section?: string;
  topic?: string;
  platform?: string;
  streaming_service?: string;
  content?: string;
  rating?: number;
}): boolean {
  const title = (data.title || '').toLowerCase();
  const category = (data.category || '').toLowerCase();
  const section = (data.section || '').toLowerCase();
  const topic = (data.topic || '').toLowerCase();
  const platform = (data.platform || data.streaming_service || '').toLowerCase();
  const content = (data.content || '').toLowerCase();
  
  console.log('🔍 Checking media review detection (enhanced):', { 
    title: data.title,
    category: data.category,
    section: data.section,
    topic: data.topic,
    platform: data.platform || data.streaming_service
  });
  
  // Keywords indicating a media review
  const reviewKeywords = ['anmeldelse', 'review', 'bedømmelse', 'vurdering'];
  const filmTvKeywords = ['film', 'serie', 'tv', 'biograf', 'streaming', 'netflix', 'hbo', 'prime', 'disney', 'apple tv', 'serier & film', 'serier og film'];
  const gameKeywords = ['spil', 'gaming', 'anmeldelse', 'playstation', 'xbox', 'nintendo', 'pc-spil', 'game'];
  
  // Check if it's a review
  const isReview = reviewKeywords.some(keyword => 
    title.includes(keyword) || 
    category.includes(keyword) || 
    topic.includes(keyword)
  );
  
  // Check if it's film/TV related
  const isFilmTv = filmTvKeywords.some(keyword => 
    title.includes(keyword) || 
    category.includes(keyword) || 
    section.includes(keyword) ||
    topic.includes(keyword) || 
    platform.includes(keyword) ||
    content.includes(keyword)
  );
  
  // Check if it's game related
  const isGame = gameKeywords.some(keyword => 
    title.includes(keyword) || 
    category.includes(keyword) || 
    section.includes(keyword) ||
    topic.includes(keyword) || 
    platform.includes(keyword) ||
    content.includes(keyword)
  );
  
  // Check if section/category explicitly states "Serier & Film" or "Gaming"
  const isSerierOgFilm = section.includes('serier & film') || 
                         section.includes('serier og film') ||
                         category.includes('serier & film') ||
                         category.includes('serier og film');
  const isGamingCategory = category.includes('gaming') || 
                          section.includes('gaming') || 
                          topic.includes('gaming');
  
  const isMediaTopic = isSerierOgFilm || isGamingCategory || isFilmTv || isGame;
  
  // Result: It's a media review if it's explicitly a review AND media-related, OR if section/topic/category indicates media
  const result = (isReview && (isFilmTv || isGame)) || isMediaTopic;
  
  console.log('🔍 Media review detection result (enhanced):', { 
    isReview,
    isFilmTv,
    isGame,
    isSerierOgFilm,
    isGamingCategory,
    isMediaTopic,
    result,
    sectionValue: data.section,
    categoryValue: data.category,
    topicValue: data.topic
  });
  
  return result;
}

function filterSafeThemes(themes: string[]): string[] {
  const unsafeKeywords = [
    'vold', 'konflikt', 'krig', 'død', 'blod', 'våben', 'terror', 'bombe', 'eksplosion',
    'violence', 'conflict', 'war', 'death', 'blood', 'weapon', 'terror', 'bomb', 'explosion',
    'nøgen', 'sex', 'pornografi', 'nude', 'sexual', 'pornography',
    'hate', 'racisme', 'diskrimination', 'racism', 'discrimination',
    'selvmord', 'selvskade', 'suicide', 'self-harm'
  ];

  return themes.filter(theme => {
    const lowerTheme = theme.toLowerCase();
    return !unsafeKeywords.some(keyword => lowerTheme.includes(keyword));
  });
}
