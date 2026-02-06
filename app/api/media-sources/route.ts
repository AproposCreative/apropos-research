import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { logger, createRequestLogger } from '@/lib/logger';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';

interface MediaSource {
  id: string;
  name: string;
  baseUrl: string;
  sitemapIndex: string;
  enabled: boolean;
  addedAt: string;
}

const MEDIA_SOURCES_FILE = path.join(process.cwd(), 'data', 'media-sources.json');

// Ensure data directory exists
const dataDir = path.dirname(MEDIA_SOURCES_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Default media sources
const defaultMediaSources: MediaSource[] = [
  {
    id: 'soundvenue',
    name: 'Soundvenue',
    baseUrl: 'https://soundvenue.com',
    sitemapIndex: '/sitemap.xml',
    enabled: true,
    addedAt: new Date().toISOString()
  },
  {
    id: 'gaffa',
    name: 'GAFFA',
    baseUrl: 'https://gaffa.dk',
    sitemapIndex: '/sitemap',
    enabled: true,
    addedAt: new Date().toISOString()
  },
  {
    id: 'berlingske',
    name: 'BERLINGSKE',
    baseUrl: 'https://www.berlingske.dk',
    sitemapIndex: '/sitemap.xml/news',
    enabled: true,
    addedAt: new Date().toISOString()
  },
  {
    id: 'bt',
    name: 'BT',
    baseUrl: 'https://www.bt.dk',
    sitemapIndex: '/sitemap.xml/news',
    enabled: true,
    addedAt: new Date().toISOString()
  }
];

// Load media sources from file
function loadMediaSources(): MediaSource[] {
  try {
    if (fs.existsSync(MEDIA_SOURCES_FILE)) {
      const data = fs.readFileSync(MEDIA_SOURCES_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    logger.error('Error loading media sources', error instanceof Error ? error : new Error(String(error)));
  }
  return defaultMediaSources;
}

// Save media sources to file
function saveMediaSources(sources: MediaSource[]): void {
  try {
    fs.writeFileSync(MEDIA_SOURCES_FILE, JSON.stringify(sources, null, 2));
  } catch (error) {
    logger.error('Error saving media sources', error instanceof Error ? error : new Error(String(error)));
  }
}

export async function GET(request: Request) {
  const requestId = getRequestId(request as any);
  const requestLogger = createRequestLogger(requestId);
  
  const sources = loadMediaSources();
  requestLogger.info('Media sources loaded', { count: sources.length });
  
  return NextResponse.json(createSuccessResponse({ sources }, { requestId }));
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const requestLogger = createRequestLogger(requestId);
  
  try {
    const body = await req.json();
    const { name, baseUrl, sitemapIndex } = body;

    // Validate input
    if (!name || !baseUrl || !sitemapIndex) {
      return NextResponse.json(
        { error: 'Name, baseUrl, and sitemapIndex are required' },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(baseUrl);
      new URL(sitemapIndex, baseUrl);
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    // Load current sources
    const mediaSources = loadMediaSources();

    // Generate unique ID
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    
    // Check if already exists
    if (mediaSources.find(source => source.id === id)) {
      return NextResponse.json(
        { error: 'Media source with this name already exists' },
        { status: 409 }
      );
    }

    // Test sitemap accessibility with more flexible approach
    try {
      const sitemapUrl = new URL(sitemapIndex, baseUrl).toString();
      
      // Try HEAD first
      let response = await fetch(sitemapUrl, { 
        method: 'HEAD',
        headers: {
          'User-Agent': 'Apropos Research Bot 1.0'
        }
      });
      
      // If HEAD fails, try GET
      if (!response.ok && response.status !== 302 && response.status !== 301) {
        response = await fetch(sitemapUrl, {
          headers: {
            'User-Agent': 'Apropos Research Bot 1.0'
          },
          redirect: 'follow'
        });
      }
      
      if (!response.ok) {
        return NextResponse.json(
          { error: 'Sitemap not accessible or invalid' },
          { status: 400 }
        );
      }

          // More flexible content type checking - accept XML and RSS feeds
          const contentType = response.headers.get('content-type');
          if (contentType && !contentType.includes('xml') && !contentType.includes('text') && !contentType.includes('rss')) {
            // If we have a specific non-XML content type, it might be invalid
            // But we'll be more lenient for now
          }
    } catch (error) {
      return NextResponse.json(
        { error: 'Cannot access sitemap URL' },
        { status: 400 }
      );
    }

    // Create new media source
    const newSource: MediaSource = {
      id,
      name,
      baseUrl,
      sitemapIndex,
      enabled: true,
      addedAt: new Date().toISOString()
    };

    // Add to sources and save
    const updatedSources = [...mediaSources, newSource];
    saveMediaSources(updatedSources);

    requestLogger.info('Media source added', { id: newSource.id, name });

    return NextResponse.json(
      createSuccessResponse({
        source: newSource,
        message: `${name} er blevet tilføjet som mediekilde`
      }, { requestId })
    );

  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    requestLogger.error('Error adding media source', errorObj);
    return NextResponse.json(
      createErrorResponse('Internal server error', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const requestId = getRequestId(req);
  const requestLogger = createRequestLogger(requestId);
  
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Media source ID is required' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { name, baseUrl, sitemapIndex } = body;

    // Validate input
    if (!name || !baseUrl || !sitemapIndex) {
      return NextResponse.json(
        { error: 'Name, baseUrl, and sitemapIndex are required' },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(baseUrl);
      new URL(sitemapIndex, baseUrl);
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    // Load current sources
    const mediaSources = loadMediaSources();
    const sourceIndex = mediaSources.findIndex(source => source.id === id);
    
    if (sourceIndex === -1) {
      return NextResponse.json(
        { error: 'Media source not found' },
        { status: 404 }
      );
    }

    // Test sitemap accessibility with more flexible approach
    try {
      const sitemapUrl = new URL(sitemapIndex, baseUrl).toString();
      
      // Try HEAD first
      let response = await fetch(sitemapUrl, { 
        method: 'HEAD',
        headers: {
          'User-Agent': 'Apropos Research Bot 1.0'
        }
      });
      
      // If HEAD fails, try GET
      if (!response.ok && response.status !== 302 && response.status !== 301) {
        response = await fetch(sitemapUrl, {
          headers: {
            'User-Agent': 'Apropos Research Bot 1.0'
          },
          redirect: 'follow'
        });
      }
      
      if (!response.ok) {
        return NextResponse.json(
          { error: 'Sitemap not accessible or invalid' },
          { status: 400 }
        );
      }

          // More flexible content type checking - accept XML and RSS feeds
          const contentType = response.headers.get('content-type');
          if (contentType && !contentType.includes('xml') && !contentType.includes('text') && !contentType.includes('rss')) {
            // If we have a specific non-XML content type, it might be invalid
            // But we'll be more lenient for now
          }
    } catch (error) {
      return NextResponse.json(
        { error: 'Cannot access sitemap URL' },
        { status: 400 }
      );
    }

    // Update the media source
    const updatedSource: MediaSource = {
      ...mediaSources[sourceIndex],
      name,
      baseUrl,
      sitemapIndex,
    };

    // Save updated sources
    const updatedSources = [...mediaSources];
    updatedSources[sourceIndex] = updatedSource;
    saveMediaSources(updatedSources);

    requestLogger.info('Media source updated', { id, name });

    return NextResponse.json(
      createSuccessResponse({
        source: updatedSource,
        message: `${name} er blevet opdateret`
      }, { requestId })
    );

  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    requestLogger.error('Error updating media source', errorObj);
    return NextResponse.json(
      createErrorResponse('Internal server error', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const requestId = getRequestId(req);
  const requestLogger = createRequestLogger(requestId);
  
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Media source ID is required' },
        { status: 400 }
      );
    }

    // Load current sources
    const mediaSources = loadMediaSources();
    const sourceIndex = mediaSources.findIndex(source => source.id === id);
    
    if (sourceIndex === -1) {
      return NextResponse.json(
        { error: 'Media source not found' },
        { status: 404 }
      );
    }

    const removedSource = mediaSources[sourceIndex];
    const updatedSources = mediaSources.filter(source => source.id !== id);
    saveMediaSources(updatedSources);

    requestLogger.info('Media source removed', { id, name: removedSource.name });

    return NextResponse.json(
      createSuccessResponse({
        message: `${removedSource.name} er blevet fjernet`,
        source: removedSource
      }, { requestId })
    );

  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    requestLogger.error('Error removing media source', errorObj);
    return NextResponse.json(
      createErrorResponse('Internal server error', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500 }
    );
  }
}
