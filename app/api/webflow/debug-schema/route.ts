import { NextRequest, NextResponse } from 'next/server';
import { getWebflowConfig } from '@/lib/webflow-config';
import { env } from '@/lib/config/env';
import { logger, createRequestLogger } from '@/lib/logger';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';

// Use same config resolution as webflow-service.ts
function resolveConfig() {
  const file = getWebflowConfig();
  const token = (file.apiToken !== undefined ? file.apiToken : env.WEBFLOW_API_TOKEN) || undefined;
  const siteId = (file.siteId !== undefined ? file.siteId : env.WEBFLOW_SITE_ID) || undefined;
  const articlesCollectionId = (file.articlesCollectionId !== undefined ? file.articlesCollectionId : env.WEBFLOW_ARTICLES_COLLECTION_ID) || '67dbf17ba540975b5b21c2a6';
  return { token, siteId, articlesCollectionId };
}

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const requestLogger = createRequestLogger(requestId);
  
  try {
    // Use the same config loading as webflow-service.ts
    const { token, siteId, articlesCollectionId } = resolveConfig();

    if (!token) {
      requestLogger.warn('Webflow API token not configured');
      return NextResponse.json(
        createErrorResponse('Webflow API token not configured', {
          statusCode: 400,
          errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
          requestId,
          details: 'Check your .env.local file for WEBFLOW_API_TOKEN or WEBFLOW_TOKEN'
        }),
        { status: 400 }
      );
    }
    
    if (!siteId) {
      requestLogger.warn('Webflow Site ID not configured');
      return NextResponse.json(
        createErrorResponse('Webflow Site ID not configured', {
          statusCode: 400,
          errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
          requestId,
          details: 'Check your .env.local file for WEBFLOW_SITE_ID'
        }),
        { status: 400 }
      );
    }

    requestLogger.info('Fetching Webflow schema for collection', { articlesCollectionId });

    // Fetch collection schema
    const schemaRes = await fetch(`https://api.webflow.com/v2/collections/${articlesCollectionId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept-Version': '1.0.0'
      },
    });

    if (!schemaRes.ok) {
      const errorText = await schemaRes.text();
      requestLogger.error('Failed to fetch Webflow schema', new Error(`Webflow API error: ${schemaRes.status}`), {
        status: schemaRes.status,
        statusText: schemaRes.statusText,
      });
      return NextResponse.json(
        createErrorResponse('Failed to fetch Webflow schema', {
          statusCode: schemaRes.status,
          errorCode: ErrorCode.EXTERNAL_API,
          requestId,
          details: errorText,
        }),
        { status: schemaRes.status }
      );
    }

    const schema: any = await schemaRes.json();

    // Extract all fields with detailed information
    const fields = (schema.fields || []).map((field: any) => {
      return {
        slug: field.slug,
        displayName: field.displayName,
        type: field.type,
        isRequired: field.isRequired || false,
        isEditable: field.isEditable,
        isUnique: field.isUnique,
        // Reference field specific
        reference: field.reference ? {
          collectionId: field.reference.collectionId,
          collectionName: field.reference.collectionName,
          isOneToMany: field.reference.isOneToMany,
          isManyToMany: field.reference.isManyToMany
        } : null,
        // Image field specific
        isImage: field.type === 'Image',
        // Other metadata
        validations: field.validations,
        helpText: field.helpText
      };
    });

    // Find specific fields we care about
    const streamingServiceField = fields.find((f: any) => 
      f.slug === 'streaming-service' || 
      f.slug === 'streaming-service' ||
      f.slug?.toLowerCase().includes('streaming') ||
      f.slug?.toLowerCase().includes('service') ||
      f.displayName?.toLowerCase().includes('streaming') ||
      f.displayName?.toLowerCase().includes('service')
    );

    const thumbField = fields.find((f: any) => 
      f.slug === 'thumb' || 
      f.slug === 'thumbnail' ||
      f.slug === 'featured-image' ||
      f.slug === 'featuredimage' ||
      f.slug?.toLowerCase().includes('thumb') ||
      f.slug?.toLowerCase().includes('image') ||
      f.displayName?.toLowerCase().includes('thumb') ||
      f.displayName?.toLowerCase().includes('image')
    );

    // Get all image fields
    const imageFields = fields.filter((f: any) => f.isImage);

    // Get all reference fields
    const referenceFields = fields.filter((f: any) => f.type === 'Reference');

    requestLogger.info('Webflow schema fetched successfully', {
      totalFields: fields.length,
      collectionId: schema.id,
    });

    return NextResponse.json(
      createSuccessResponse({
        collection: {
          id: schema.id,
          displayName: schema.displayName,
          singularName: schema.singularName,
          pluralName: schema.pluralName
        },
        totalFields: fields.length,
        fields: fields,
        // Specific fields we're looking for
        streamingServiceField: streamingServiceField || null,
        thumbField: thumbField || null,
        // Field groups
        imageFields: imageFields.map((f: any) => ({ slug: f.slug, displayName: f.displayName })),
        referenceFields: referenceFields.map((f: any) => ({ 
          slug: f.slug, 
          displayName: f.displayName,
          reference: f.reference 
        })),
        // All field slugs for easy reference
        allFieldSlugs: fields.map((f: any) => f.slug),
        // Search for fields containing specific keywords
        fieldsContainingStreaming: fields.filter((f: any) => 
          f.slug?.toLowerCase().includes('streaming') ||
          f.displayName?.toLowerCase().includes('streaming')
        ).map((f: any) => ({ slug: f.slug, displayName: f.displayName, type: f.type })),
        fieldsContainingImage: fields.filter((f: any) => 
          f.slug?.toLowerCase().includes('image') ||
          f.slug?.toLowerCase().includes('thumb') ||
          f.displayName?.toLowerCase().includes('image') ||
          f.displayName?.toLowerCase().includes('thumb')
        ).map((f: any) => ({ slug: f.slug, displayName: f.displayName, type: f.type }))
      }, { requestId })
    );

  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    requestLogger.error('Error fetching Webflow schema', errorObj);
    return NextResponse.json(
      createErrorResponse('Failed to fetch Webflow schema', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
        details: errorObj.message,
      }),
      { status: 500 }
    );
  }
}

