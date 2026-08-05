import { NextRequest, NextResponse } from 'next/server';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';
import { enqueueApproval } from '@/lib/accreditation/approval-store';
import { appendAudit } from '@/lib/accreditation/audit-store';
import {
  buildAccreditationDraft,
  buildApplicantNotice,
  draftHash,
  textToEmailHtml,
} from '@/lib/accreditation/draft-template';
import { createEmailThread, getThreadsByRequestId } from '@/lib/accreditation/email-thread-store';
import { buildPolicyFlags } from '@/lib/accreditation/policy';
import { getRequestById, updateRequest } from '@/lib/accreditation/request-store';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  try {
    const body = await request.json().catch(() => ({}));
    const accreditationRequestId = String(body.requestId || '').trim();
    const kind = (body.kind as string) || 'first_outbound';
    const item = await getRequestById(accreditationRequestId);
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

    if (kind === 'applicant_notice') {
      const outcome = body.outcome === 'denied' ? 'denied' : 'granted';
      const draft = buildApplicantNotice({
        request: item,
        outcome,
        detail: body.detail ? String(body.detail) : item.outcomeReason,
      });
      const to =
        String(body.to || '').trim() ||
        item.applicants.map((a) => a.email).filter(Boolean).join(', ') ||
        '';
      if (!to) {
        return NextResponse.json(
          createErrorResponse('Ansøger-email mangler (to)', {
            statusCode: 400,
            errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
            requestId,
          }),
          { status: 400 }
        );
      }
      const subject = body.subject ? String(body.subject) : draft.subject;
      const text = body.text ? String(body.text) : draft.text;
      const hash = draftHash(subject, text);
      const approval = await enqueueApproval({
        requestId: item.id,
        threadId: item.threadId,
        kind: 'applicant_notice',
        to,
        subject,
        text,
        html: textToEmailHtml(text),
        draftHash: hash,
        policyFlags: buildPolicyFlags({ kind: 'applicant_notice' }),
      });
      await updateRequest(item.id, {
        status: 'awaiting_approval',
        pendingApprovalId: approval.id,
        outcomeReason: item.outcomeReason || (outcome === 'granted' ? 'Godkendt' : 'Afvist'),
      });
      await appendAudit({
        requestId: item.id,
        type: 'draft',
        detail: `Ansøger-notifikation klar til godkendelse (${outcome})`,
        meta: { approvalId: approval.id },
      });
      return NextResponse.json(createSuccessResponse({ approval }, { requestId }));
    }

    if (!item.contactEmail) {
      return NextResponse.json(
        createErrorResponse('contactEmail mangler — research eller udfyld kontakt først', {
          statusCode: 400,
          errorCode: ErrorCode.INVALID_REQUEST,
          requestId,
        }),
        { status: 400 }
      );
    }

    if (item.contactConfidence === 'low' && !body.force) {
      return NextResponse.json(
        createErrorResponse('Kontakt-confidence er low — bekræft kontakt manuelt før udkast', {
          statusCode: 400,
          errorCode: ErrorCode.INVALID_REQUEST,
          requestId,
        }),
        { status: 400 }
      );
    }

    const draft = buildAccreditationDraft({ request: item });
    const subject = body.subject ? String(body.subject) : draft.subject;
    const text = body.text ? String(body.text) : draft.text;
    const hash = draftHash(subject, text);

    let threadId = item.threadId;
    const existingThreads = await getThreadsByRequestId(item.id);
    if (!threadId && existingThreads[0]) threadId = existingThreads[0].id;
    if (!threadId) {
      const thread = await createEmailThread({
        requestId: item.id,
        contactEmail: item.contactEmail,
        contactName: item.contactName,
        subject,
      });
      threadId = thread.id;
    }

    const approval = await enqueueApproval({
      requestId: item.id,
      threadId,
      kind: kind === 'follow_up' ? 'follow_up' : 'first_outbound',
      to: item.contactEmail,
      subject,
      text,
      html: textToEmailHtml(text),
      draftHash: hash,
      policyFlags: buildPolicyFlags({
        kind: kind === 'follow_up' ? 'follow_up' : 'first_outbound',
        contactConfidence: item.contactConfidence,
        ambiguous: item.contactConfidence === 'low',
        routineFollowUp: kind === 'follow_up',
      }),
    });

    await updateRequest(item.id, {
      status: 'awaiting_approval',
      threadId,
      pendingApprovalId: approval.id,
    });

    await appendAudit({
      requestId: item.id,
      type: 'draft',
      detail: 'Liv-udkast klar til menneskelig godkendelse',
      meta: { approvalId: approval.id, threadId },
    });

    return NextResponse.json(createSuccessResponse({ approval, threadId }, { requestId }));
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
