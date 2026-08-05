import { NextRequest, NextResponse } from 'next/server';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';
import { appendAudit } from '@/lib/accreditation/audit-store';
import { upsertRequestFromSheetRow } from '@/lib/accreditation/request-store';
import {
  checkSheetConnection,
  pullContacts,
  pullWorkflowRows,
  syncRequestToSheet,
} from '@/lib/accreditation/sheet-client';
import { getRequestById } from '@/lib/accreditation/request-store';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const health = await checkSheetConnection();
  return NextResponse.json(createSuccessResponse({ sheet: health }, { requestId }));
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || 'pull').trim();

    if (action === 'pull') {
      const rows = await pullWorkflowRows();
      // Only upsert real workflow rows from the sheet — never invent Sammy Virji etc.
      const upserted = await Promise.all(rows.map((row) => upsertRequestFromSheetRow(row)));
      let contactsCount = 0;
      try {
        contactsCount = (await pullContacts()).length;
      } catch {
        /* contacts optional for pull */
      }
      await appendAudit({
        type: 'sheet_pull',
        detail: `Hentede ${rows.length} workflow-rækker; Contacts etc. read-only (${contactsCount})`,
      });
      return NextResponse.json(
        createSuccessResponse(
          { rows: rows.length, requests: upserted, contactsCount },
          { requestId }
        )
      );
    }

    if (action === 'push') {
      const id = String(body.requestId || '').trim();
      const item = await getRequestById(id);
      if (!item) {
        return NextResponse.json(
          createErrorResponse('Request not found', {
            statusCode: 404,
            errorCode: ErrorCode.NOT_FOUND,
            requestId,
          }),
          { status: 404 }
        );
      }
      const result = await syncRequestToSheet(item, {
        lastAction: body.lastAction ? String(body.lastAction) : 'Manuel sync',
        nextFollowUp: body.nextFollowUp ? String(body.nextFollowUp) : '',
        emailThreadSource: item.threadId || '',
      });
      await appendAudit({
        requestId: id,
        type: 'sheet_push',
        detail: `Synkroniseret til Accreditation workflow række ${result.rowNumber}`,
      });
      return NextResponse.json(createSuccessResponse({ ...result }, { requestId }));
    }

    return NextResponse.json(
      createErrorResponse('action skal være pull|push', {
        statusCode: 400,
        errorCode: ErrorCode.INVALID_REQUEST,
        requestId,
      }),
      { status: 400 }
    );
  } catch (e) {
    return NextResponse.json(
      createErrorResponse(e instanceof Error ? e.message : 'Sheet sync failed', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500 }
    );
  }
}
