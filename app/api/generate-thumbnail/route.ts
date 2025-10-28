import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface GenerateThumbnailRequest {
  title: string;
  content?: string;
  category?: string;
  topic?: string;
  rating?: number;
  platform?: string;
  streaming_service?: string;
  author?: string;
}

interface GenerateThumbnailResponse {
  success: boolean;
  imageUrl?: string;
  prompt?: string;
  error?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<GenerateThumbnailResponse>> {
  try {
    const body: GenerateThumbnailRequest = await request.json();
    const { title, content, category, topic, rating, platform, streaming_service, author } = body;

    if (!title) {
      return NextResponse.json({
        success: false,
        error: 'Title is required for thumbnail generation'
      }, { status: 400 });
    }

    console.log('🎨 Generating thumbnail for:', title);

    // Generate intelligent prompt based on article content
    const imagePrompt = await generateImagePrompt({
      title,
      content,
      category,
      topic,
      rating,
      platform,
      streaming_service,
      author
    });

    console.log('🎨 Generated image prompt:', imagePrompt);

    // Generate image using DALL-E 3
    const imageResponse = await openai.images.generate({
      model: "dall-e-3",
      prompt: imagePrompt,
      size: "1024x1024",
      quality: "standard",
      n: 1,
    });

    const imageUrl = imageResponse.data[0]?.url;

    if (!imageUrl) {
      throw new Error('No image URL returned from DALL-E 3');
    }

    console.log('✅ Thumbnail generated successfully:', imageUrl);

    return NextResponse.json({
      success: true,
      imageUrl,
      prompt: imagePrompt
    });

  } catch (error) {
    console.error('❌ Thumbnail generation error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 });
  }
}

async function generateImagePrompt(data: GenerateThumbnailRequest): Promise<string> {
  const { title, content, category, topic, rating, platform, streaming_service, author } = data;

  // Extract key themes and visual elements from content
  const contentPreview = content ? content.substring(0, 500) : '';
  
  // Determine visual style based on category and rating
  let visualStyle = 'professional magazine cover style';
  let mood = 'engaging and dynamic';
  let colorPalette = 'vibrant and modern';
  
  if (category?.toLowerCase().includes('anmeld')) {
    visualStyle = 'cinematic review style';
    if (rating && rating <= 2) {
      mood = 'dramatic and critical';
      colorPalette = 'dark and moody with red accents';
    } else if (rating && rating >= 4) {
      mood = 'celebratory and positive';
      colorPalette = 'bright and energetic with gold accents';
    } else {
      mood = 'balanced and thoughtful';
      colorPalette = 'neutral tones with blue accents';
    }
  } else if (category?.toLowerCase().includes('koncert')) {
    visualStyle = 'live music photography style';
    mood = 'energetic and atmospheric';
    colorPalette = 'dynamic lighting with purple and orange';
  } else if (category?.toLowerCase().includes('gaming')) {
    visualStyle = 'gaming art style';
    mood = 'immersive and exciting';
    colorPalette = 'neon colors with blue and green';
  } else if (category?.toLowerCase().includes('film')) {
    visualStyle = 'film poster style';
    mood = 'cinematic and dramatic';
    colorPalette = 'cinematic lighting with warm tones';
  } else if (category?.toLowerCase().includes('festival')) {
    visualStyle = 'festival photography style';
    mood = 'celebratory and vibrant';
    colorPalette = 'rainbow colors and festival atmosphere';
  } else if (category?.toLowerCase().includes('kultur')) {
    visualStyle = 'cultural magazine style';
    mood = 'sophisticated and artistic';
    colorPalette = 'elegant tones with cultural elements';
  }

  // Build contextual elements
  const contextualElements = [];
  
  if (platform) {
    contextualElements.push(`${platform} platform`);
  }
  
  if (streaming_service) {
    contextualElements.push(`${streaming_service} streaming`);
  }
  
  if (topic) {
    contextualElements.push(topic.toLowerCase());
  }

  // Extract specific visual elements from title and content
  const visualElements = extractVisualElements(title, contentPreview);

  // Create the final prompt
  const basePrompt = `Create a ${visualStyle} thumbnail image for a Danish culture magazine article titled "${title}". The image should be ${mood} with ${colorPalette} color palette.`;
  
  const contextualPrompt = contextualElements.length > 0 
    ? ` Include visual references to: ${contextualElements.join(', ')}.`
    : '';
  
  const visualPrompt = visualElements.length > 0 
    ? ` Incorporate these visual elements: ${visualElements.join(', ')}.`
    : '';
  
  const contentPrompt = contentPreview 
    ? ` The article discusses themes related to: ${extractThemes(contentPreview)}.`
    : '';
  
  const technicalPrompt = ` High quality, 1024x1024 resolution, suitable for magazine thumbnail, clean composition, professional lighting, Danish cultural aesthetic, modern design, eye-catching, suitable for social media sharing.`;

  return basePrompt + contextualPrompt + visualPrompt + contentPrompt + technicalPrompt;
}

function extractVisualElements(title: string, content: string): string[] {
  const elements = [];
  const text = (title + ' ' + content).toLowerCase();
  
  // Gaming elements
  if (text.includes('gaming') || text.includes('spil') || text.includes('playstation') || text.includes('xbox') || text.includes('nintendo')) {
    elements.push('gaming controllers', 'digital worlds', 'pixel art elements');
  }
  
  // Music elements
  if (text.includes('musik') || text.includes('music') || text.includes('koncert') || text.includes('concert') || text.includes('festival')) {
    elements.push('musical instruments', 'stage lighting', 'crowd energy');
  }
  
  // Film elements
  if (text.includes('film') || text.includes('movie') || text.includes('cinema') || text.includes('biograf')) {
    elements.push('film reels', 'cinematic lighting', 'movie theater atmosphere');
  }
  
  // Tech elements
  if (text.includes('tech') || text.includes('teknologi') || text.includes('ai') || text.includes('digital')) {
    elements.push('digital interfaces', 'tech gadgets', 'futuristic elements');
  }
  
  // Cultural elements
  if (text.includes('kultur') || text.includes('culture') || text.includes('kunst') || text.includes('art')) {
    elements.push('artistic elements', 'cultural symbols', 'creative expression');
  }
  
  // Specific game references
  if (text.includes('astro bot')) {
    elements.push('cute robot character', 'colorful platform elements', 'playful design');
  }
  
  // Festival references
  if (text.includes('roskilde') || text.includes('festival')) {
    elements.push('festival stage', 'crowd silhouettes', 'music notes');
  }
  
  return elements;
}

function extractThemes(content: string): string {
  // Simple theme extraction - could be enhanced with AI
  const themes = [];
  
  // Look for common cultural themes
  if (content.toLowerCase().includes('film') || content.toLowerCase().includes('movie')) {
    themes.push('cinema');
  }
  if (content.toLowerCase().includes('musik') || content.toLowerCase().includes('music')) {
    themes.push('music');
  }
  if (content.toLowerCase().includes('gaming') || content.toLowerCase().includes('spil')) {
    themes.push('gaming');
  }
  if (content.toLowerCase().includes('tech') || content.toLowerCase().includes('teknologi')) {
    themes.push('technology');
  }
  if (content.toLowerCase().includes('kultur') || content.toLowerCase().includes('culture')) {
    themes.push('culture');
  }
  if (content.toLowerCase().includes('festival')) {
    themes.push('festival');
  }
  if (content.toLowerCase().includes('koncert') || content.toLowerCase().includes('concert')) {
    themes.push('live music');
  }
  
  return themes.length > 0 ? themes.join(', ') : 'cultural topics';
}