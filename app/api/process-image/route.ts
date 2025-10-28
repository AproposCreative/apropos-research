import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

interface ProcessImageRequest {
  imageUrl: string;
  maxSizeKB?: number;
  quality?: number;
}

interface ProcessImageResponse {
  success: boolean;
  processedImageUrl?: string;
  originalSizeKB?: number;
  processedSizeKB?: number;
  error?: string;
}

export async function POST(req: NextRequest) {
  try {
    const { imageUrl, maxSizeKB = 400, quality = 85 } = await req.json() as ProcessImageRequest;

    if (!imageUrl) {
      return NextResponse.json({
        success: false,
        error: 'Image URL is required'
      }, { status: 400 });
    }

    console.log('🖼️ Processing image:', imageUrl);

    // Fetch the original image
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error('Failed to fetch image');
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const originalSizeKB = Math.round(imageBuffer.byteLength / 1024);

    console.log(`📊 Original image size: ${originalSizeKB}KB`);

    // Process image with Sharp
    let processedBuffer = await sharp(Buffer.from(imageBuffer))
      .webp({ 
        quality: quality,
        effort: 6, // Higher effort for better compression
        lossless: false
      })
      .toBuffer();

    let processedSizeKB = Math.round(processedBuffer.byteLength / 1024);

    // If still too large, reduce quality iteratively
    let currentQuality = quality;
    while (processedSizeKB > maxSizeKB && currentQuality > 20) {
      currentQuality -= 10;
      console.log(`🔄 Reducing quality to ${currentQuality}% (current size: ${processedSizeKB}KB)`);
      
      processedBuffer = await sharp(Buffer.from(imageBuffer))
        .webp({ 
          quality: currentQuality,
          effort: 6,
          lossless: false
        })
        .toBuffer();
      
      processedSizeKB = Math.round(processedBuffer.byteLength / 1024);
    }

    // If still too large, reduce dimensions
    if (processedSizeKB > maxSizeKB) {
      console.log(`📐 Reducing dimensions (current size: ${processedSizeKB}KB)`);
      
      // Get original dimensions
      const metadata = await sharp(Buffer.from(imageBuffer)).metadata();
      const { width, height } = metadata;
      
      if (width && height) {
        // Calculate new dimensions (reduce by 10% each iteration)
        let newWidth = Math.round(width * 0.9);
        let newHeight = Math.round(height * 0.9);
        
        while (processedSizeKB > maxSizeKB && newWidth > 200 && newHeight > 200) {
          processedBuffer = await sharp(Buffer.from(imageBuffer))
            .resize(newWidth, newHeight, {
              fit: 'inside',
              withoutEnlargement: true
            })
            .webp({ 
              quality: Math.max(20, currentQuality),
              effort: 6,
              lossless: false
            })
            .toBuffer();
          
          processedSizeKB = Math.round(processedBuffer.byteLength / 1024);
          
          if (processedSizeKB > maxSizeKB) {
            newWidth = Math.round(newWidth * 0.9);
            newHeight = Math.round(newHeight * 0.9);
          }
        }
      }
    }

    // Convert buffer to base64 data URL
    const base64 = processedBuffer.toString('base64');
    const processedImageUrl = `data:image/webp;base64,${base64}`;

    console.log(`✅ Image processed successfully: ${originalSizeKB}KB → ${processedSizeKB}KB`);

    return NextResponse.json({
      success: true,
      processedImageUrl,
      originalSizeKB,
      processedSizeKB
    });

  } catch (err) {
    console.error('❌ Image processing error:', err);
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : 'Image processing failed'
    }, { status: 500 });
  }
}
