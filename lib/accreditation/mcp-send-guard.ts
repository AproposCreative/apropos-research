import { createHash } from 'node:crypto';
import { getRequestById } from './request-store';
import { getApprovalById } from './approval-store';
import { cmsFieldHash as hash } from '@/lib/liv/cms-field-hash';
import { accreditationMailHtml } from './mcp-mail-content';
import { assertAccreditationContactAllowed } from './mcp-context';
import { assertPersonalAccreditationPolicy } from './mcp-personal-policy';
import { accredEmail } from './mcp-contract';
import type { SendAccreditationEmailParams } from './send-email';

/** Central transport boundary: legacy manual/automatic paths cannot send an owner MCP case. */
export async function assertPersonalAccreditationSend(params: SendAccreditationEmailParams): Promise<boolean> {
  const request = await getRequestById(params.requestId);
  if (!request?.mcp) {
    if (params.personalApproval) throw Error('mcp_accreditation_personal_case_required');
    return false;
  }
  const proof = params.personalApproval;
  if (!proof) throw Error('mcp_accreditation_personal_approval_required');
  const approval = await getApprovalById(proof.approvalId);
  const a = approval?.mcp;
  if (!approval || !a || a.ownerUid !== request.mcp.ownerUid || approval.requestId !== request.id || request.pendingApprovalId !== approval.id ||
      a.status !== 'sending' || !a.attemptId || a.attemptId !== proof.attemptId || hash(request) !== a.caseHash || request.paused ||
      params.to !== approval.to || params.subject !== approval.subject || params.text !== approval.text ||
      params.threadId !== approval.threadId || params.html !== accreditationMailHtml(approval.text)) throw Error('mcp_accreditation_personal_approval_required');
  const expected = a.assets.filter(x => x.kind === 'attachment');
  const actual = params.attachments || [];
  if (actual.length !== expected.length || actual.some((f, i) => f.filename !== expected[i].filename ||
      createHash('sha256').update(Buffer.from(f.content, 'base64')).digest('hex') !== expected[i].sha256)) throw Error('mcp_accreditation_asset_changed');
  await assertAccreditationContactAllowed(params.to);
  if(accredEmail.parse(params.to)!==params.to) throw Error('mcp_accreditation_recipient_blocked');
  await assertPersonalAccreditationPolicy(request.mcp.ownerUid);
  return true;
}
