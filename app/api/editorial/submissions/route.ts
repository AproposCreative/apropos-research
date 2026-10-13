import { after } from 'next/server';
import { z } from 'zod';
import { mcpRequestAccess } from '@/lib/mcp/oauth';
import { getSubmissionStatus } from '@/lib/editorial/submissions';
import { quoteSubmission, acceptSubmissionQuote } from '@/lib/editorial/submission-approval';
import { submissionPublicationPreview, approveSubmissionPublication, publishSubmission } from '@/lib/editorial/submission-publication';
import { continueSubmissionPreparation, continueSubmissionWorkflow } from '@/lib/editorial/submission-continuation';
import { submissionConsentOffer, acceptSubmissionConsent } from '@/lib/editorial/submission-consent';
import { submissionId } from '@/lib/editorial/submission-contract';
import { MCP_ORIGIN, PRIVATE_HEADERS } from '@/lib/mcp/config';
import { acceptImageSelection } from '@/lib/editorial/submission-image-selection';
import { articleReadingPreview } from '@/lib/editorial/submission-preview';
import { resumeSubmissionCms } from '@/lib/editorial/submission-cms-resume';
export const runtime = 'nodejs';
export const maxDuration = 300;
const response = (body: unknown, status = 200) => Response.json(body, { status, headers: PRIVATE_HEADERS });
const safeError = (error: unknown) => error instanceof Error && /^mcp_submission_[a-z_]+$/.test(error.message) ? error.message : 'mcp_submission_unavailable';
export async function GET(req: Request) {
  const access = await mcpRequestAccess(req);
  if (!access) return response({ error: 'unauthorized' }, 401);
  try {
    const id = submissionId.parse(new URL(req.url).searchParams.get('id'));
    const row = await getSubmissionStatus(access.uid, id);
    let quote = null, preview = null, dependencyError: string | null = null;
    let consent: Awaited<ReturnType<typeof submissionConsentOffer>> = null;
    try {
      quote = ['awaiting_answers', 'awaiting_preparation'].includes(row.status) ? await quoteSubmission(access.uid, id) : null;
      preview = row.status === 'prepared' ? await submissionPublicationPreview(access.uid, id) : null;
      if (row.executionPolicy === 'chatgpt-first-v1' && (row.status === 'awaiting_preparation' || preview?.ready)) consent = await submissionConsentOffer(access.uid, id);
    } catch { dependencyError = 'Aktuel pris eller CMS-kontrol er utilgængelig. Dit gemte arbejde er bevaret. Godkendelse er stoppet indtil en frisk kontrol lykkes.'; }
    // Reading is always available, even when a dependency or approval is missing.
    // A readable draft must never be confused with permission to publish it.
    if (consent && (consent.revision !== row.revision || consent.contentHash !== row.contentHash) || quote && (quote.revision !== row.revision || quote.contentHash !== row.contentHash) ||
        preview?.ready && (preview.revision !== row.revision || preview.contentHash !== row.contentHash)) {
      quote = null; preview = null; consent = null; dependencyError = 'Artiklen blev ændret under indlæsning. Genindlæs før godkendelse.';
    }
    const article = preview?.ready ? preview.article! : row.article;
    const reading = articleReadingPreview({ ...article, author: row.displayNames.author, category: row.displayNames.category });
    return response({ row, quote, preview, consent, reading, dependencyError });
  } catch (error) { return response({ error: safeError(error) }, 409); }
}
const inputSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('resume_cms'), id: submissionId, expectedRevision: z.number().int().positive(), expectedCmsHash: submissionId }).strict(),
  z.object({ action: z.literal('accept_media'), id: submissionId, revision: z.number().int().positive(), selectionHash: submissionId }).strict(),
  z.object({ action: z.literal('accept_quote'), id: submissionId, revision: z.number().int().positive(), quoteId: submissionId }).strict(),
  z.object({ action: z.literal('publish'), id: submissionId, preparedHash: submissionId, localTime: z.string().max(20) }).strict(),
  z.object({ action: z.literal('approve_publish'), id: submissionId, revision: z.number().int().positive(), consentId: submissionId, localTime: z.string().max(20).default('now') }).strict(),
]);
export async function POST(req: Request) {
  const access = await mcpRequestAccess(req);
  if (!access) return response({ error: 'unauthorized' }, 401);
  if (req.headers.get('origin') !== MCP_ORIGIN && !(process.env.NODE_ENV === 'development' && req.headers.get('origin') === new URL(req.url).origin)) return response({ error: 'invalid_origin' }, 403);
  try {
    const raw = await req.text(); if (raw.length > 2000) throw Error('mcp_submission_invalid_request');
    const input = inputSchema.parse(JSON.parse(raw));
    if (input.action === 'resume_cms') {
      const result = await resumeSubmissionCms(access.uid, { submissionId: input.id, expectedRevision: input.expectedRevision, expectedCmsHash: input.expectedCmsHash });
      after(() => continueSubmissionWorkflow(access.uid, input.id).then(() => undefined));
      return response(result, 202);
    }
    if (input.action === 'approve_publish') {
      const result = await acceptSubmissionConsent(access.uid, input.id, input.revision, input.consentId, 'external-preview', input.localTime);
      after(() => continueSubmissionWorkflow(access.uid, input.id).then(() => undefined));
      return response(result, 202);
    }
    if (input.action === 'accept_media') return response(await acceptImageSelection(access.uid, input.id, input.revision, input.selectionHash));
    if (input.action === 'accept_quote') {
      const result = await acceptSubmissionQuote(access.uid, input.id, input.revision, input.quoteId);
      after(async () => { await continueSubmissionPreparation(access.uid, input.id); });
      return response(result, 202);
    }
    const result = await approveSubmissionPublication(access.uid, input.id, input.preparedHash, input.localTime);
    if (input.localTime === 'now') after(async () => { await publishSubmission(access.uid, input.id); });
    return response(result, 202);
  } catch (error) { return response({ error: safeError(error) }, 409); }
}
