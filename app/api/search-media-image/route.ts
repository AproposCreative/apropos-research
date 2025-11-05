import { NextRequest, NextResponse } from 'next/server';
import { isMediaReview, searchTMDB, searchGoogleImages, type MediaSearchRequest } from '@/lib/media-search-utils';

interface SearchMediaImageRequest extends MediaSearchRequest {
  // Additional fields if needed
}

interface SearchMediaImageResponse {
  success: boolean;
  imageUrl?: string;
  source?: 'tmdb' | 'google' | 'unsplash';
  error?: string;
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json() as SearchMediaImageRequest & { skipIndex?: number };
    
    if (!data.title) {
      return NextResponse.json({
        success: false,
        error: 'Title is required for media image search'
      }, { status: 400 });
    }
    
    const mediaCheck = isMediaReview(data);
    const { type, searchTerm } = mediaCheck;
    
    if (!type) {
      return NextResponse.json({
        success: false,
        error: 'Article does not appear to be a film, TV series, or game review'
      });
    }
    
    const skipIndex = data.skipIndex || 0;
    console.log(`🔍 Searching for ${type} image: "${searchTerm}" (skipIndex: ${skipIndex})`);
    
    let imageUrl: string | null = null;
    let source: 'tmdb' | 'google' | 'unsplash' = 'tmdb';
    
    if (type === 'film' || type === 'tv') {
      // Try TMDB first (best quality, usually text-free)
      // skipIndex allows cycling through different images
      imageUrl = await searchTMDB(searchTerm, type, skipIndex);
      source = 'tmdb';
    } else if (type === 'game') {
      // Try Google Images for games
      imageUrl = await searchGoogleImages(searchTerm);
      source = 'google';
    }
    
    if (!imageUrl) {
      return NextResponse.json({
        success: false,
        error: `No image found for ${type}: ${searchTerm}`
      });
    }
    
    // Process image to WebP format and compress to under 400KB (same as generate-image)
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
      source
    });
    
  } catch (err) {
    console.error('❌ Media image search error:', err);
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : 'Media image search failed'
    }, { status: 500 });
  }
}
