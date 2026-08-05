import { NextRequest, NextResponse } from 'next/server';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';
import { appendAudit } from '@/lib/accreditation/audit-store';
import { syncMailboxContactArchiveToMemory } from '@/lib/accreditation/mailbox-archive-sync';
import { getMemoryBackend, getMemoryHealth } from '@/lib/accreditation/memory-store';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Authenticated (middleware) idempotent sync of Mailbox contact archive → memory.
 * GET: health + last sync meta
 * POST: { action: 'sync' | 'status' }
 */
export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const health = await getMemoryHealth();
  let syncMeta = null;
  try {
    syncMeta = await getMemoryBackend().getSyncMeta();
  } catch (e) {
    return NextResponse.json(
      createSuccessResponse(
        {
          memory: health,
          sync: null,
          error: e instanceof Error ? e.message : String(e),
        },
        { requestId }
      )
    );
  }
  return NextResponse.json(
    createSuccessResponse({ memory: health, sync: syncMeta }, { requestId })
  );
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || 'sync').trim();

    if (action === 'status') {
      const health = await getMemoryHealth();
      const sync = await getMemoryBackend().getSyncMeta().catch(() => null);
      return NextResponse.json(
        createSuccessResponse({ memory: health, sync }, { requestId })
      );
    }

    if (action === 'sync') {
      const result = await syncMailboxContactArchiveToMemory({
        dryRun: Boolean(body.dryRun),
      });
      if (!result.ok) {
        return NextResponse.json(
          createErrorResponse(result.error || 'Mailbox archive sync failed', {
            statusCode: 500,
            errorCode: ErrorCode.INTERNAL_ERROR,
            requestId,
          }),
          { status: 500 }
        );
      }
      await appendAudit({
        type: 'mailbox_archive_sync',
        detail: `Mailbox archive → memory: imported ${result.imported}, upserted ${result.upserted}, skipped ${result.skipped}`,
        meta: {
          totalRows: result.totalRows,
          imported: result.imported,
          upserted: result.upserted,
          skipped: result.skipped,
          automatedCount: result.automatedCount,
          humanOrRoleCount: result.humanOrRoleCount,
          contactCount: result.contactCount,
          dryRun: Boolean(body.dryRun),
        },
      });
      return NextResponse.json(createSuccessResponse(result, { requestId }));
    }

    return NextResponse.json(
      createErrorResponse('action skal være sync|status', {
        statusCode: 400,
        errorCode: ErrorCode.INVALID_REQUEST,
        requestId,
      }),
      { status: 400 }
    );
  } catch (e) {
    return NextResponse.json(
      createErrorResponse(e instanceof Error ? e.message : 'Memory sync failed', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500 }
    );
  }
}
