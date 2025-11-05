import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
  try {
    const { title, topic, author, category, content, section, platform, streaming_service, rating, skipIndex } = await req.json() as GenerateImageRequest & { section?: string; platform?: string; streaming_service?: string; rating?: number; skipIndex?: number };

    if (!title) {
      return NextResponse.json({
        success: false,
        error: 'Title is required for image generation'
      }, { status: 400 });
    }

    // Check if this is a film/TV/game review - if so, search for existing images instead of generating
    console.log('🔍 Checking if article is media review:', { 
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
    console.log('🔍 Should search for media:', shouldSearchForMedia);
    
    if (shouldSearchForMedia) {
      console.log('🎬 Detected media review, searching for existing image (NO AI generation)...');
      try {
        // Import and call search functions directly to avoid HTTP fetch issues
        const { isMediaReview: checkMediaReview, searchTMDB, searchGoogleImages } = await import('../search-media-image/route');
        
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
        
        console.log('🔍 Media check result:', mediaCheck);
        
        if (mediaCheck.type === 'film' || mediaCheck.type === 'tv') {
          console.log(`🔍 Searching TMDB for ${mediaCheck.type}: "${mediaCheck.searchTerm}"`);
          
          // If section is "Serier & Film" and no explicit topic, try both film and TV
          // This handles cases where platform suggests TV but it's actually a film
          const sectionLower = (section || '').toLowerCase();
          const shouldTryBoth = sectionLower.includes('serier & film') || sectionLower.includes('serier og film');
          
          let imageUrl: string | null = null;
          
          const skipIdx = skipIndex || 0;
          if (shouldTryBoth && mediaCheck.type === 'tv') {
            // Try film first (more common for "Serier & Film" section)
            console.log(`🔍 Trying film first (Serier & Film section): "${mediaCheck.searchTerm}" (skipIndex: ${skipIdx})`);
            imageUrl = await searchTMDB(mediaCheck.searchTerm, 'film', skipIdx);
            
            // If film didn't work, try TV
            if (!imageUrl) {
              console.log(`🔍 Film search failed, trying TV: "${mediaCheck.searchTerm}" (skipIndex: ${skipIdx})`);
              imageUrl = await searchTMDB(mediaCheck.searchTerm, 'tv', skipIdx);
            }
          } else {
            // Normal search - try the detected type
            imageUrl = await searchTMDB(mediaCheck.searchTerm, mediaCheck.type, skipIdx);
          }
          
          if (imageUrl) {
            console.log(`✅ Found TMDB image: ${imageUrl}`);
            // Process image to WebP format and compress
            let processedImageUrl = imageUrl;
            try {
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
                }
              }
            } catch (error) {
              console.log('⚠️ Image processing error, using original:', error);
            }
            
            console.log(`✅ Found existing image from TMDB for: ${title}`);
            return NextResponse.json({
              success: true,
              imageUrl: processedImageUrl,
              source: 'tmdb',
              prompt: 'Found from TMDB'
            });
          } else {
            // No image found - return error instead of falling back to AI
            console.log(`⚠️ No TMDB image found for: "${mediaCheck.searchTerm}" (tried ${shouldTryBoth ? 'both film and TV' : mediaCheck.type})`);
            return NextResponse.json({
              success: false,
              error: `No image found for ${mediaCheck.type}: ${mediaCheck.searchTerm}. Please check TMDB or try a different search term.`
            }, { status: 404 });
          }
        } else if (mediaCheck.type === 'game') {
          console.log(`🔍 Searching Google Images for game: "${mediaCheck.searchTerm}"`);
          const imageUrl = await searchGoogleImages(mediaCheck.searchTerm);
          if (imageUrl) {
            // Process image to WebP format and compress
            let processedImageUrl = imageUrl;
            try {
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
                }
              }
            } catch (error) {
              console.log('⚠️ Image processing error, using original:', error);
            }
            
            console.log(`✅ Found existing image from Google for: ${title}`);
            return NextResponse.json({
              success: true,
              imageUrl: processedImageUrl,
              source: 'google',
              prompt: 'Found from Google'
            });
          } else {
            // No image found - return error instead of falling back to AI
            console.log(`⚠️ No Google image found for: "${mediaCheck.searchTerm}"`);
            return NextResponse.json({
              success: false,
              error: `No image found for game: ${mediaCheck.searchTerm}. Please check Google Custom Search or try a different search term.`
            }, { status: 404 });
          }
        } else {
          // No media type detected - this shouldn't happen if checkIfMediaReview returned true
          console.log(`⚠️ No media type detected for: "${mediaCheck.searchTerm}"`);
          return NextResponse.json({
            success: false,
            error: 'Could not determine media type for image search'
          }, { status: 400 });
        }
      } catch (error) {
        console.error('❌ Media image search error:', error);
        return NextResponse.json({
          success: false,
          error: `Failed to search for media image: ${error instanceof Error ? error.message : 'Unknown error'}`
        }, { status: 500 });
      }
    }
    
    // Only generate AI image if NOT a media review
    console.log('🎨 Not a media review - generating AI image for:', title);

    // Generate contextual prompt based on article content
    const prompt = await generateAproposPrompt({
      title,
      topic,
      author,
      category,
      content
    });

    console.log('🎨 Generated Apropos prompt:', prompt);

    // Generate image using DALL-E 3
    const imageResponse = await openai.images.generate({
      model: "dall-e-3",
      prompt: prompt,
      size: "1792x1024", // 16:9 aspect ratio (closest to 1920x1080)
      quality: "standard",
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
    console.error('❌ Image generation error:', err);
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : 'Image generation failed'
    }, { status: 500 });
  }
}

async function generateAproposPrompt(data: GenerateImageRequest): Promise<string> {
  const { title, topic, author, category, content } = data;

  // Base Apropos prompt - EXACT STYLE MUST BE MAINTAINED
  let basePrompt = `Create a hand-drawn digital illustration in Apropos Magazine style. Minimal and editorial with soft digital texture. 

CRITICAL REQUIREMENTS:
- NO TEXT: Absolutely no text, logos, letters, numbers, or words of any kind. Pure visual elements only.
- Format: 16:9 aspect ratio (1920x1080)
- Background: Solid off-white with subtle grainy texture
- Style: Hand-drawn, digital, fresh and subtle - like modern magazine illustrations
- Color palette: Muted, aesthetic colors that match the article's tone
- Focus: Mood, feeling, and motif - NOT plot or people
- Composition: Clean, minimal, editorial aesthetic
- Visual elements: Abstract shapes, patterns, or subtle symbolic elements that represent the article's theme

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
  const contextualElements = [];

  if (category?.toLowerCase().includes('anmeld')) {
    contextualElements.push('kritisk og analytisk stemning');
  } else if (category?.toLowerCase().includes('koncert')) {
    contextualElements.push('live musik og energi');
  } else if (category?.toLowerCase().includes('gaming')) {
    contextualElements.push('digital verden og spil');
  } else if (category?.toLowerCase().includes('film')) {
    contextualElements.push('cinematisk og dramatisk');
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

  // Extract visual themes from content using AI analysis
  if (content) {
    const contentPreview = content.substring(0, 800);
    const themes = await extractVisualThemes(contentPreview, title || '', category || '');
    if (themes.length > 0) {
      contextualElements.push(`specifikke visuelle temaer: ${themes.join(', ')}`);
    }
    
    // Add specific content context
    const contentSummary = contentPreview.substring(0, 200);
    contextualElements.push(`artikelindhold: ${contentSummary}...`);
  }

  // Add contextual elements to prompt
  if (contextualElements.length > 0) {
    basePrompt += `\n\nKontekst for "${title}": ${contextualElements.join(', ')}.`;
  }

  return basePrompt;
}

async function extractVisualThemes(content: string, title: string, category: string): Promise<string[]> {
  try {
    // Use AI to analyze content and extract visual themes
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

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

    const response = await openai.chat.completions.create({
      model: 'gpt-5',
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
// Simplified detection: Check section and topic directly
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
  const section = (data.section || '').toLowerCase();
  const topic = (data.topic || '').toLowerCase();
  
  console.log('🔍 Checking media review detection (simplified):', { section, topic });
  
  // Simple check: If section is "Serier & Film" or "Serier og Film", it's media
  const isSerierOgFilm = section.includes('serier & film') || 
                         section.includes('serier og film') ||
                         section.includes('serier og film');
  
  // Simple check: If topic is "Gaming", "Film", or "TV-serier", it's media
  const isMediaTopic = topic.includes('gaming') || 
                       topic.includes('film') || 
                       topic.includes('tv-serier') ||
                       topic.includes('tv serier') ||
                       topic.includes('spil');
  
  const result = isSerierOgFilm || isMediaTopic;
  
  console.log('🔍 Media review detection result (simplified):', { 
    isSerierOgFilm, 
    isMediaTopic, 
    result,
    sectionValue: data.section,
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
