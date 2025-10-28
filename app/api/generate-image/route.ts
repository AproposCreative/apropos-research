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
    const { title, topic, author, category, content } = await req.json() as GenerateImageRequest;

    if (!title) {
      return NextResponse.json({
        success: false,
        error: 'Title is required for image generation'
      }, { status: 400 });
    }

    console.log('🎨 Generating Apropos-style image for:', title);

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
  let basePrompt = `Håndtegnet digital illustration i Apropos Magazine-stil. Minimal og redaktionel med blød digital tekstur. KRITISK: Ingen tekst, ingen logoer, ingen skrift, ingen ord, ingen bogstaver, ingen tal - kun visuelle elementer. Format 16:9 (1920x1080).
Brug dæmpede, æstetiske farver og en stemning, der matcher artiklens tone.
Fokusér på stemning, følelse og motiv — ikke på plot eller personer.
Baggrund: ensfarvet off-white med grynet tekstur.
Stil: håndtegnet, digital, frisk og subtil – som moderne magasinillustrationer.
VIGTIGT: Dette skal være et rent billede uden nogen form for tekst eller skrift.
STIL-KRAV: Du SKAL følge denne eksakte stil - afvig ALDRIG fra Apropos Magazine-stilen.
SIKKERHED: Kun positive, kunstneriske og sikre elementer. Ingen vold, konflikt eller problematisk indhold.`;

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

    const analysisPrompt = `Analyser denne artikel og uddrag 3-5 SIKRE visuelle temaer til billedgenerering.

Artikel titel: "${title}"
Kategori: "${category}"
Indhold: "${content.substring(0, 800)}"

VIGTIGT: Kun positive, sikre og kunstneriske temaer. Ingen vold, konflikt eller problematisk indhold.

Eksempler på sikre temaer:
- Gaming: "retro gaming konsol, pixel art stil, digitale farver"
- Musik: "koncert scene, musik instrumenter, live energi"
- Film: "cinematisk stemning, dramatisk lys, film atmosfære"
- Festival: "festival atmosfære, farverige lys, musik scene"
- Kultur: "kunstnerisk komposition, kreativ miljø, kulturel stemning"

Returner KUN sikre temaer på dansk. Ingen forklaringer.

Temaer:`;

    const response = await openai.chat.completions.create({
      model: 'gpt-5',
      messages: [{ role: 'user', content: analysisPrompt }],
      max_completion_tokens: 100,
      temperature: 0.7,
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
