import { appendAudit } from '@/lib/accreditation/audit-store';
import {
  addAssetToPackage,
  extractAccessLinks,
  extractGuestListInstructions,
  getAccessPackage,
  looksLikeAccessPackage,
  readStoredAttachment,
  storeAttachmentBuffer,
  upsertAccessPackage,
} from '@/lib/accreditation/attachments';
import {
  buildAccessPackageDeliveryNotice,
  textToEmailHtml,
} from '@/lib/accreditation/draft-template';
import { isAutomationEnabled, isDryRun } from '@/lib/accreditation/agent-control';
import { getRequestById, updateRequest } from '@/lib/accreditation/request-store';
import { sendAccreditationEmail } from '@/lib/accreditation/send-email';
import type { AccessPackageAsset } from '@/lib/accreditation/types';
import { newEntityId } from '@/lib/accreditation/ids';

export type InboundAttachmentInput = {
  filename: string;
  contentType?: string;
  contentBase64?: string;
  buffer?: Buffer;
};

/**
 * Ingest promoter inbound attachments + text links into the access package.
 * Does NOT claim delivery — only stores and marks package_ready when assets are present.
 */
export async function ingestInboundAccessMaterials(params: {
  requestId: string;
  text: string;
  attachments?: InboundAttachmentInput[];
}): Promise<{
  hasPackage: boolean;
  approvalOnly: boolean;
  assetCount: number;
}> {
  const { requestId, text } = params;
  const attachments = params.attachments || [];
  let safeCount = 0;

  for (const att of attachments) {
    let buf: Buffer | null = null;
    if (att.buffer) buf = att.buffer;
    else if (att.contentBase64) {
      try {
        buf = Buffer.from(att.contentBase64, 'base64');
      } catch {
        buf = null;
      }
    }
    if (!buf) continue;
    const asset = await storeAttachmentBuffer({
      requestId,
      filename: att.filename || 'attachment',
      buffer: buf,
      contentType: att.contentType,
    });
    await addAssetToPackage(requestId, asset);
    if (asset.safe) safeCount++;
    else {
      await appendAudit({
        requestId,
        type: 'attachment_quarantine',
        detail: `Quarantined ${asset.filename}: ${asset.quarantineReason}`,
        meta: { assetId: asset.id },
      });
    }
  }

  for (const url of extractAccessLinks(text)) {
    const asset: AccessPackageAsset = {
      id: newEntityId('link'),
      kind: 'link',
      url,
      safe: true,
      createdAt: new Date().toISOString(),
    };
    await addAssetToPackage(requestId, asset);
    safeCount++;
  }

  const instructions = extractGuestListInstructions(text);
  if (instructions) {
    const pkg = (await getAccessPackage(requestId)) || {
      requestId,
      assets: [],
      deliveryStatus: 'none' as const,
      updatedAt: new Date().toISOString(),
    };
    pkg.guestListInstructions = instructions;
    if (pkg.deliveryStatus === 'none' || pkg.deliveryStatus === 'approval_only') {
      pkg.deliveryStatus = 'package_ready';
    }
    pkg.updatedAt = new Date().toISOString();
    await upsertAccessPackage(pkg);
    safeCount++;
  }

  const hasPackage = looksLikeAccessPackage(text, safeCount > 0) && safeCount > 0;
  return {
    hasPackage,
    approvalOnly: !hasPackage,
    assetCount: safeCount,
  };
}

export async function resolveDeliveryRecipient(
  requestId: string
): Promise<{ name: string; email: string } | null> {
  const req = await getRequestById(requestId);
  if (!req) return null;
  const email = (req.deliveryRecipientEmail || req.applicants.find((a) => a.email)?.email || '').trim();
  if (!email || !email.includes('@')) return null;
  const name =
    req.deliveryRecipientName ||
    req.applicants.find((a) => a.email === email)?.name ||
    req.applicants[0]?.name ||
    email;
  return { name, email };
}

/**
 * Forward the complete access package to the UI/writer recipient.
 * Never call this for approval-only grants.
 */
export async function deliverFinalAccessPackage(params: {
  requestId: string;
  forceManual?: boolean;
}): Promise<{ ok: boolean; detail: string; resendEmailId?: string }> {
  const req = await getRequestById(params.requestId);
  if (!req) return { ok: false, detail: 'request not found' };

  const pkg = await getAccessPackage(params.requestId);
  const safeAssets = (pkg?.assets || []).filter((a) => a.safe);
  const hasInstructions = Boolean(pkg?.guestListInstructions?.trim());
  if (!safeAssets.length && !hasInstructions) {
    await updateRequest(params.requestId, {
      finalDeliveryStatus: 'approval_only',
      finalPackageDelivered: false,
    });
    return { ok: false, detail: 'no access package assets — approval only' };
  }

  const recipient = await resolveDeliveryRecipient(params.requestId);
  if (!recipient) {
    await updateRequest(params.requestId, {
      status: 'escalated',
      notes: 'Mangler recipient-email til final delivery',
      finalDeliveryStatus: 'package_ready',
    });
    return { ok: false, detail: 'missing recipient email' };
  }

  if (!params.forceManual && !(await isAutomationEnabled())) {
    await updateRequest(params.requestId, { finalDeliveryStatus: 'package_ready' });
    await appendAudit({
      requestId: params.requestId,
      type: 'final_delivery_queued',
      detail: 'Automation OFF — package klar, ikke sendt',
    });
    return { ok: false, detail: 'automation off — queued' };
  }

  const draft = buildAccessPackageDeliveryNotice({
    request: req,
    recipientName: recipient.name,
    package: pkg!,
  });

  if (await isDryRun()) {
    await appendAudit({
      requestId: params.requestId,
      type: 'final_delivery_dry_run',
      detail: `Dry-run final package → ${recipient.email}`,
      meta: { assetCount: safeAssets.length },
    });
    return { ok: true, detail: 'dry-run' };
  }

  const resendAttachments: { filename: string; content: string; contentType?: string }[] = [];
  for (const a of safeAssets.filter((x) => x.kind === 'attachment' && x.storagePath)) {
    const content = await readStoredAttachment(a.storagePath!);
    if (!content) continue;
    resendAttachments.push({
      filename: a.filename || 'file',
      content: content.toString('base64'),
      contentType: a.contentType,
    });
  }

  const threadId = req.threadId || `delivery-${req.id}`;
  const sendResult = await sendAccreditationEmail({
    to: recipient.email,
    subject: draft.subject,
    html: textToEmailHtml(draft.text),
    text: draft.text,
    threadId,
    requestId: req.id,
    attachments: resendAttachments,
  });

  if (!sendResult.ok) {
    await updateRequest(params.requestId, { finalDeliveryStatus: 'failed' });
    await appendAudit({
      requestId: params.requestId,
      type: 'final_delivery_failed',
      detail: sendResult.error || 'send failed',
    });
    return { ok: false, detail: sendResult.error || 'send failed' };
  }

  await upsertAccessPackage({
    ...pkg!,
    deliveryStatus: 'delivered',
    deliveredAt: new Date().toISOString(),
    deliveredTo: recipient.email,
    deliveredResendId: sendResult.resendEmailId,
    updatedAt: new Date().toISOString(),
  });

  await updateRequest(params.requestId, {
    status: 'closed',
    finalPackageDelivered: true,
    finalDeliveryStatus: 'delivered',
    outcomeReason: req.outcomeReason || 'Adgangspakke leveret',
  });

  await appendAudit({
    requestId: params.requestId,
    type: 'final_delivery',
    detail: `Adgangspakke sendt til ${recipient.email}`,
    meta: {
      resendEmailId: sendResult.resendEmailId || null,
      assetCount: safeAssets.length,
      attachmentCount: resendAttachments.length,
    },
  });

  return { ok: true, detail: 'delivered', resendEmailId: sendResult.resendEmailId };
}
