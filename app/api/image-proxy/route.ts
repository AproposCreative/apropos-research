import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '../error-handler';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get('url');
  
  if (!imageUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  // Validate URL format
  try {
    new URL(imageUrl);
  } catch {
    return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
  }

  try {
    console.log(`🔍 Image Proxy: Fetching image from: ${imageUrl}`);
    
    // Add timeout to prevent ETIMEDOUT errors
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    // Fetch image (Firebase Storage URLs don't need special headers, but others might)
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Ragekniv-UI/1.0)',
        'Referer': 'https://soundvenue.com/',
        'Accept': 'image/*',
      },
      signal: controller.signal,
      // Don't follow redirects automatically - handle them explicitly if needed
      redirect: 'follow',
    });

    clearTimeout(timeoutId);

    console.log(`🔍 Image Proxy: Response status: ${response.status} ${response.statusText}`);
    console.log(`🔍 Image Proxy: Response headers:`, Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error(`❌ Image Proxy: Failed to fetch image: ${response.status} ${response.statusText}`);
      console.error(`❌ Image Proxy: Error body: ${errorText.substring(0, 500)}`);
      return NextResponse.json({ error: 'Failed to fetch image' }, { status: response.status });
    }

    const imageBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/jpeg';

    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
        'Access-Control-Allow-Origin': '*', // Allow CORS for images
        'Access-Control-Allow-Methods': 'GET',
      },
    });
  } catch (error) {
    const { error: errorMessage, status } = handleApiError(error, 'Image Proxy');
    return NextResponse.json({ error: errorMessage }, { status });
  }
}
