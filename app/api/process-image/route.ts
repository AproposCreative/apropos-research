import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { createSign, createPrivateKey } from 'crypto';
import { env, config } from '@/lib/config/env';
import { logger, createRequestLogger } from '@/lib/logger';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';

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

// Firebase Admin upload functions (server-side only)
function base64url(input: Buffer | string): string {
  const b = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return b.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function getAccessToken(sa: {
  client_email: string;
  private_key: string;
  token_uri: string;
}): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;
  const scope = 'https://www.googleapis.com/auth/devstorage.read_write';
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: sa.client_email,
    scope,
    aud: sa.token_uri,
    exp,
    iat,
  };
  const toSign = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signer = createSign('RSA-SHA256');
  signer.update(toSign);
  
  // Clean up private key - remove quotes and normalize line breaks
  let cleanKey = sa.private_key.replace(/^['"]|['"]$/g, '').replace(/\\n/g, '\n');
  if (!cleanKey.includes('-----BEGIN PRIVATE KEY-----')) {
    cleanKey = `-----BEGIN PRIVATE KEY-----\n${cleanKey}\n-----END PRIVATE KEY-----`;
  }
  
  const keyObj = createPrivateKey({ key: cleanKey, format: 'pem' });
  const sig = signer.sign(keyObj);
  const assertion = `${toSign}.${base64url(sig)}`;
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });
  const res = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  const json: any = await res.json();
  return json.access_token;
}

async function uploadToFirebaseStorage(bucket: string, name: string, content: Buffer, contentType = 'image/webp'): Promise<string> {
  // Note: Firebase Admin env vars not in centralized config yet - add if needed
  const tokenUri = process.env.FIREBASE_ADMIN_TOKEN_URI || 'https://oauth2.googleapis.com/token';
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  
  if (!clientEmail || !privateKey) {
    throw new Error('Missing FIREBASE_ADMIN_CLIENT_EMAIL or FIREBASE_ADMIN_PRIVATE_KEY');
  }
  
  const accessToken = await getAccessToken({ 
    client_email: clientEmail, 
    private_key: privateKey, 
    token_uri: tokenUri 
  });
  
  // Upload with public access enabled
  // Note: predefinedAcl=publicRead requires Firebase Storage security rules to allow public access
  // If this fails, check Firebase Console > Storage > Rules to ensure public read is allowed
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=media&name=${encodeURIComponent(name)}&predefinedAcl=publicRead`;
  const arrBuf = content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer;
  const body = new Blob([arrBuf], { type: contentType });
  
  logger.debug('Uploading to Firebase Storage', {
    bucket,
    fileName: name,
    contentType,
    size: content.length,
  });
  
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': contentType,
    },
    body: body as any,
  });
  
  if (!res.ok) {
    let bodyText = '';
    try { bodyText = await res.text(); } catch {}
    logger.error('Upload failed', new Error(`Upload failed: ${res.status} ${res.statusText}`), {
      status: res.status,
      statusText: res.statusText,
      body: bodyText.substring(0, 500),
    });
    throw new Error(`Upload failed: ${res.status} ${bodyText}`);
  }
  
  const result = await res.json();
  logger.debug('Upload successful', {
    name: result.name,
    bucket: result.bucket,
    size: result.size,
    contentType: result.contentType,
    timeCreated: result.timeCreated
  });
  
  const fileName = result.name || name;
  
  // Make file public by setting ACL after upload
  // This is more reliable than predefinedAcl=publicRead
  try {
    const aclUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(fileName)}/acl?entity=allUsers&role=READER`;
    const aclResponse = await fetch(aclUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (aclResponse.ok) {
      logger.debug('File ACL set to public');
    } else {
      const aclErrorText = await aclResponse.text().catch(() => '');
      logger.warn('Failed to set public ACL', {
        status: aclResponse.status,
        errorText: aclErrorText.substring(0, 200),
      });
      logger.warn('File may not be accessible without authentication');
    }
  } catch (aclError) {
    const errorObj = aclError instanceof Error ? aclError : new Error(String(aclError));
    logger.warn('Error setting public ACL', undefined, errorObj);
    logger.warn('File may not be accessible without authentication');
  }
  
  // Firebase Storage API returns file metadata after upload
  // Use Firebase Storage API format with alt=media parameter for public access
  // Format: https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(fileName)}?alt=media
  // This format works for public files and doesn't require CORS configuration
  const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(fileName)}?alt=media`;
  
  logger.debug('File uploaded successfully', {
    fileName,
    publicUrl: publicUrl.substring(0, 100),
    responseKeys: Object.keys(result),
  });
  
  // If API returned mediaLink, log it for debugging
  if (result.mediaLink) {
    logger.debug('MediaLink available', { mediaLink: result.mediaLink.substring(0, 100) });
  }
  
  return publicUrl;
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const requestLogger = createRequestLogger(requestId);
  
  try {
    const { imageUrl, maxSizeKB = 400, quality = 85 } = await req.json() as ProcessImageRequest;

    if (!imageUrl) {
      requestLogger.warn('Missing imageUrl in request');
      return NextResponse.json(
        createErrorResponse('Image URL is required', {
          statusCode: 400,
          errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
          requestId,
        }),
        { status: 400 }
      );
    }

    requestLogger.info('Processing image', { imageUrl: imageUrl.substring(0, 100) });

    // Fetch the original image
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error('Failed to fetch image');
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const originalSizeKB = Math.round(imageBuffer.byteLength / 1024);

    requestLogger.debug('Original image size', { originalSizeKB });

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
      requestLogger.debug('Reducing quality', { currentQuality, processedSizeKB });
      
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
      requestLogger.debug('Reducing dimensions', { processedSizeKB });
      
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

    // Upload processed image to Firebase Storage to get a public HTTP URL
    // Webflow Image fields require HTTP/HTTPS URLs, not data URLs
    requestLogger.debug('Uploading processed image to Firebase Storage');
    
    try {
      // Get Firebase Admin credentials
      // Note: Firebase Admin env vars not in centralized config yet
      const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
      const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
      const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
      
      if (!clientEmail || !privateKey || !projectId) {
        throw new Error('Missing Firebase Admin credentials. Need FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY, and FIREBASE_ADMIN_PROJECT_ID');
      }
      
      // Determine bucket name
      const explicitBucket = process.env.FIREBASE_STORAGE_BUCKET || 
                             env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 
                             process.env.FIREBASE_ADMIN_STORAGE_BUCKET;
      const bucketCandidates = [
        explicitBucket,
        `${projectId}.appspot.com`,
        `${projectId}.firebasestorage.app`,
      ].filter(Boolean) as string[];
      
      requestLogger.debug('Upload candidates', { buckets: bucketCandidates });
      
      // Generate unique filename
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2, 9);
      const fileName = `processed-images/${timestamp}_${randomId}.webp`;
      
      requestLogger.debug('Uploading to Firebase Storage', { fileName, processedSizeKB });
      
      // Try each bucket candidate
      let lastError: any = null;
      let publicUrl: string | null = null;
      
      for (const bucket of bucketCandidates) {
        try {
          publicUrl = await uploadToFirebaseStorage(bucket, fileName, processedBuffer, 'image/webp');
          requestLogger.info('Uploaded successfully', { bucket });
          break;
        } catch (e: any) {
          lastError = e;
          console.warn(`⚠️ Upload attempt failed for bucket ${bucket}:`, e?.message || String(e));
        }
      }
      
      if (!publicUrl) {
        throw lastError || new Error('Upload failed to all candidate buckets');
      }
      
      requestLogger.info('Image processed and uploaded successfully', {
        originalSizeKB,
        processedSizeKB,
        publicUrl: publicUrl.substring(0, 100),
      });
      
      // Firebase Storage API format with alt=media works for public files
      // No need for image-proxy fallback - this URL format is designed for public access
      // If bucket is not public, predefinedAcl=publicRead will fail, and we'll get an error
      // which is better than silently failing with image-proxy

      return NextResponse.json(
        createSuccessResponse({
          processedImageUrl: publicUrl, // Firebase Storage API format with alt=media
          originalSizeKB,
          processedSizeKB
        }, { requestId })
      );
    } catch (uploadError) {
      const errorMessage = uploadError instanceof Error ? uploadError.message : String(uploadError);
      const errorStack = uploadError instanceof Error ? uploadError.stack : undefined;
      
      requestLogger.error('Failed to upload processed image to Firebase Storage', uploadError instanceof Error ? uploadError : new Error(errorMessage), {
        errorMessage,
        errorStack,
      });
      
      // Fallback to data URL if upload fails (for backward compatibility)
      const base64 = processedBuffer.toString('base64');
      const processedImageUrl = `data:image/webp;base64,${base64}`;
      
      requestLogger.warn('Falling back to data URL (upload failed) - Webflow thumb field will NOT be filled');
      
      return NextResponse.json(
        createSuccessResponse({
          processedImageUrl, // Fallback to data URL
          originalSizeKB,
          processedSizeKB,
          warning: 'Firebase upload failed, using data URL. Webflow may not accept this.'
        }, { requestId })
      );
    }

  } catch (err) {
    const errorObj = err instanceof Error ? err : new Error(String(err));
    requestLogger.error('Image processing error', errorObj);
    return NextResponse.json(
      createErrorResponse(errorObj.message || 'Image processing failed', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500 }
    );
  }
}
