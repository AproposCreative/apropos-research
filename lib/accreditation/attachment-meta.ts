import type { AccessPackageAssetKind } from '@/lib/accreditation/types';

/**
 * Fast-lane structured metadata for inbound attachments.
 * Filename-only categorization requires no paid model call. Never infer approval
 * or ticket delivery from a filename. validateAttachmentSafety remains authoritative.
 */
export async function classifyAttachmentMetadata(params: {
  requestId?: string;
  filename: string;
  contentType?: string;
  sizeBytes?: number;
}): Promise<{ kind: AccessPackageAssetKind; label: string; model?: string; promptVersion?: string }> {
  const name = params.filename.toLowerCase();
  const heuristic: AccessPackageAssetKind =
    /\.pdf$/i.test(name) || /ticket|billet|pass|badge/i.test(name)
      ? 'attachment'
      : /qr/i.test(name)
        ? 'qr_text'
        : 'attachment';

  return { kind: heuristic, label: params.filename };
}
