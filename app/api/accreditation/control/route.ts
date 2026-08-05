import { NextRequest, NextResponse } from 'next/server';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';
import { getAgentControl, setAgentControl } from '@/lib/accreditation/agent-control';
import { appendAudit } from '@/lib/accreditation/audit-store';
import { getRequestById, updateRequest } from '@/lib/accreditation/request-store';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  return NextResponse.json(
    createSuccessResponse({ control: await getAgentControl() }, { requestId })
  );
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || '').trim();
    const actor = String(body.actor || 'studio').trim().slice(0, 80);
    const source = String(body.source || 'ui').trim().slice(0, 80);

    if (action === 'automation') {
      const enabled = Boolean(body.enabled);
      const control = await setAgentControl({
        automationEnabled: enabled,
        pauseReason: enabled ? undefined : String(body.reason || 'Automation OFF via UI'),
        lastToggledBy: actor,
        lastToggleSource: source,
      });
      await appendAudit({
        type: enabled ? 'automation_on' : 'automation_off',
        detail: enabled
          ? `Liv automation ON (${actor} / ${source})`
          : `Liv automation OFF (${actor} / ${source}) — ingest + drafts continue`,
        meta: { actor, source, automationEnabled: enabled },
      });
      return NextResponse.json(createSuccessResponse({ control }, { requestId }));
    }

    if (action === 'pause') {
      const control = await setAgentControl({
        automationEnabled: false,
        pauseReason: body.reason ? String(body.reason) : 'Manuel pause',
        lastToggledBy: actor,
        lastToggleSource: source,
      });
      await appendAudit({
        type: 'automation_off',
        detail: control.pauseReason || 'paused',
        meta: { actor, source },
      });
      return NextResponse.json(createSuccessResponse({ control }, { requestId }));
    }

    if (action === 'resume') {
      const control = await setAgentControl({
        automationEnabled: true,
        lastToggledBy: actor,
        lastToggleSource: source,
      });
      await appendAudit({
        type: 'automation_on',
        detail: 'Liv automation ON',
        meta: { actor, source },
      });
      return NextResponse.json(createSuccessResponse({ control }, { requestId }));
    }

    if (action === 'dry_run') {
      const control = await setAgentControl({ dryRun: Boolean(body.enabled) });
      await appendAudit({
        type: 'agent_dry_run',
        detail: control.dryRun ? 'Dry-run slået til' : 'Dry-run slået fra',
        meta: { actor, source },
      });
      return NextResponse.json(createSuccessResponse({ control }, { requestId }));
    }

    if (action === 'override_send') {
      // Request-level override used to restart research and could therefore
      // replace the reviewed recipient before sending. Manual sends must now
      // go through the approval queue where the exact recipient is visible.
      await appendAudit({
        requestId: String(body.requestId || '').trim() || undefined,
        type: 'unsafe_override_blocked',
        detail: 'Request-level override blocked. Use an explicit approval.',
        meta: { actor, source },
      });
      return NextResponse.json(
        createErrorResponse('Åbn "Kræver din hjælp" og godkend den konkrete mail og modtager.', {
          statusCode: 409,
          errorCode: ErrorCode.INVALID_REQUEST,
          requestId,
        }),
        { status: 409 }
      );
    }

    if (action === 'pause_request') {
      const id = String(body.requestId || '').trim();
      await updateRequest(id, { paused: true, status: 'paused' }, { bypassTransitionCheck: true });
      await appendAudit({
        requestId: id,
        type: 'request_pause',
        detail: 'Anmodning pauset',
        meta: { actor, source },
      });
      return NextResponse.json(
        createSuccessResponse({ request: await getRequestById(id) }, { requestId })
      );
    }

    if (action === 'resume_request') {
      const id = String(body.requestId || '').trim();
      await updateRequest(
        id,
        { paused: false, status: 'draft_ready' },
        { bypassTransitionCheck: true }
      );
      await appendAudit({
        requestId: id,
        type: 'request_resume',
        detail: 'Anmodning genoptaget',
        meta: { actor, source },
      });
      return NextResponse.json(
        createSuccessResponse({ request: await getRequestById(id) }, { requestId })
      );
    }

    return NextResponse.json(
      createErrorResponse(
        'action: automation|pause|resume|dry_run|pause_request|resume_request',
        {
          statusCode: 400,
          errorCode: ErrorCode.INVALID_REQUEST,
          requestId,
        }
      ),
      { status: 400 }
    );
  } catch (e) {
    return NextResponse.json(
      createErrorResponse(e instanceof Error ? e.message : 'Failed', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500 }
    );
  }
}
