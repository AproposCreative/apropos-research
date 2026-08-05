import { getOpenAIClient } from '@/lib/openai';
import { appendAiAudit } from '@/lib/accreditation/audit-store';
import { composeLivSystemPrompt } from '@/lib/accreditation/liv-system-prompt';
import { resolveAccreditationModelForTask } from '@/lib/accreditation/models';
import type { AccessPackageAssetKind } from '@/lib/accreditation/types';

/**
 * Fast-lane structured metadata for inbound attachments.
 * Heuristic first; optional LLM refine. Not a safety layer — validateAttachmentSafety remains authoritative.
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

  const openai = getOpenAIClient();
  if (!openai) {
    return { kind: heuristic, label: params.filename };
  }

  const composed = composeLivSystemPrompt({
    task: 'attachment_meta',
    includeFacts: false,
    taskInstructions:
      'Klassificér fil-metadata. Returnér JSON: {"kind":"attachment"|"link"|"instruction"|"qr_text"|"confirmation","label":"kort dansk label"}. Opfind ikke indhold.',
  });
  const model = resolveAccreditationModelForTask('attachment_meta');

  try {
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0,
      messages: [
        { role: 'system', content: composed.prompt },
        {
          role: 'user',
          content: JSON.stringify({
            filename: params.filename,
            contentType: params.contentType || null,
            sizeBytes: params.sizeBytes ?? null,
          }),
        },
      ],
      response_format: { type: 'json_object' },
    });
    await appendAiAudit({
      requestId: params.requestId,
      type: 'ai_attachment_meta',
      detail: `Attachment meta ${params.filename}`,
      model,
      promptVersion: composed.promptVersion,
      task: composed.task,
      lane: composed.lane,
    });
    const raw = JSON.parse(completion.choices[0]?.message?.content || '{}') as {
      kind?: AccessPackageAssetKind;
      label?: string;
    };
    const kind = raw.kind || heuristic;
    return {
      kind,
      label: raw.label?.trim() || params.filename,
      model,
      promptVersion: composed.promptVersion,
    };
  } catch {
    return { kind: heuristic, label: params.filename };
  }
}
