import { NextRequest, NextResponse } from 'next/server';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';
import { createRequestLogger } from '@/lib/logger';
import { runFundingResearch } from '@/lib/funding/engine';
import { getOpportunityById } from '@/lib/funding/opportunity-store';
import type { ApplicationSection, FundingOpportunity } from '@/lib/funding/types';

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const requestLogger = createRequestLogger(requestId);

  try {
    const body = await request.json().catch(() => ({}));
    let opportunity: FundingOpportunity | undefined;

    if (body.opportunityId && typeof body.opportunityId === 'string') {
      opportunity = getOpportunityById(body.opportunityId);
    }
    if (!opportunity && body.opportunity && typeof body.opportunity === 'object') {
      opportunity = body.opportunity as FundingOpportunity;
    }

    if (!opportunity) {
      return NextResponse.json(
        createErrorResponse('Opportunity not found', {
          statusCode: 404,
          errorCode: ErrorCode.NOT_FOUND,
          requestId,
        }),
        { status: 404 }
      );
    }

    const applicationSection = (['project', 'impact', 'budget', 'full'] as ApplicationSection[]).includes(
      body.applicationSection
    )
      ? body.applicationSection
      : 'full';

    const result = await runFundingResearch(opportunity, { applicationSection });

    requestLogger.info('Funding research completed', {
      opportunityId: opportunity.id,
      ready: result.qualityGate.ready,
    });

    return NextResponse.json(createSuccessResponse(result, { requestId }));
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    requestLogger.error('Funding research failed', errorObj);
    return NextResponse.json(
      createErrorResponse('Failed to run funding research', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500 }
    );
  }
}
