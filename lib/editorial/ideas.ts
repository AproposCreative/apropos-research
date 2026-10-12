import { z } from 'zod';
import { workspaceRef, researchSchema } from '@/lib/mcp/workspace';
import { getAdminDb } from '@/lib/firebase-admin';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { normalizeEditorialText } from './signal-store';
import { listSubmissions } from './submissions';

// Ideas are private source material in the existing Writer workspace, not articles,
// delivery slots or approvals. No model, CMS writes or generation jobs here.
export const ideaId = z.string().regex(/^[a-f0-9]{64}$/);
export const ideaInput = z.object({
  topicKey: z.string().trim().min(3).max(150).describe('Stable subject + angle key; reuse across briefs. Not the proposed headline.'),
  title: z.string().trim().min(3).max(200),
  angle: z.string().trim().min(10).max(1500),
  whyNow: z.string().trim().min(3).max(1000),
  caveats: z.string().trim().min(3).max(2000),
  sources: researchSchema.refine(rows => rows.length > 0 && rows.length <= 6),
}).strict();
export const saveIdeasInput = z.object({ requestId: z.string().regex(/^[a-zA-Z0-9_-]{16,100}$/),
  ideas: z.array(ideaInput).min(1).max(5) }).strict();
export const deskInput = z.object({ limit: z.number().int().min(1).max(30).default(10) }).strict();
export const getIdeaInput = z.object({ ideaId }).strict();
export const startIdeaInput = getIdeaInput.extend({ expectedRevision: z.number().int().positive() });
type Idea = z.infer<typeof ideaInput> & { id: string; uid: string; revision: number; status: 'suggested' | 'selected';
  createdAt: string; updatedAt: string; selectedAt?: string; sourceRequestId: string };
export const ideaRef = (uid: string, id: string) => workspaceRef(uid).collection('editorialIdeas').doc(ideaId.parse(id));
export const ideaSubmissionRequest = (id: string) => `editorial-idea-${ideaId.parse(id)}`;
export const ideaSubmissionId = (uid: string, id: string) => cmsFieldHash({ uid, requestId: ideaSubmissionRequest(id) });
const stableId = (uid: string, topicKey: string) => cmsFieldHash({ uid, editorialIdea: normalizeEditorialText(topicKey) });

export async function saveEditorialIdeas(uid: string, raw: unknown) {
  const input = saveIdeasInput.parse(raw), db = getAdminDb(); if (!db) throw Error('mcp_unavailable');
  if (input.ideas.some(idea => normalizeEditorialText(idea.topicKey).length < 3)) throw Error('mcp_idea_invalid_topic');
  const ids = input.ideas.map(idea => stableId(uid, idea.topicKey));
  if (new Set(ids).size !== ids.length) throw Error('mcp_idea_duplicate_batch');
  const receipt = workspaceRef(uid).collection('editorialIdeaImports').doc(cmsFieldHash({ requestId: input.requestId }));
  const hash = cmsFieldHash(input);
  const result = await db.runTransaction(async tx => {
    const prior = (await tx.get(receipt)).data();
    if (prior) { if (prior.hash !== hash) throw Error('mcp_idea_idempotency_conflict'); return { ids: prior.ids as string[], replay: true }; }
    const refs = ids.map(id => ideaRef(uid, id));
    const existing = await Promise.all(refs.map(ref => tx.get(ref)));
    const now = new Date().toISOString();
    existing.forEach((row, index) => {
      // A repeated brief never silently overwrites a chosen idea or its source history.
      if (!row.exists) tx.create(refs[index], { ...input.ideas[index], id: ids[index], uid, revision: 1,
        status: 'suggested', createdAt: now, updatedAt: now, sourceRequestId: input.requestId });
    });
    tx.create(receipt, { hash, ids, createdAt: now });
    return { ids, replay: false };
  });
  return { ...result, ideas: await Promise.all(result.ids.map(id => getEditorialIdea(uid, { ideaId: id }))),
    note: 'Eksisterende emne/vinkel er genbrugt uden overskrivning. Kilder og datoer er forslag, ikke verificerede fakta.', paidAiCalls: 0 };
}

function project(row: Idea, article: Record<string, any> | undefined) {
  const id = ideaSubmissionId(row.uid, row.id);
  // Explicit projection. Never return uid, tokens or fabricated readiness.
  return { id: row.id, title: row.title, angle: row.angle, whyNow: row.whyNow, caveats: row.caveats,
    sources: row.sources, revision: row.revision, status: article ? 'draft_saved' : row.status,
    createdAt: row.createdAt, selectedAt: row.selectedAt ?? null, sourceRequestId: row.sourceRequestId,
    factsVerified: false, publicationApproval: false, paidAiCalls: 0, untrustedContent: true,
    submission: article ? { id, revision: article.revision, status: article.status, title: article.article?.title } : null,
    handoff: { editorialIdeaId: row.id, requestId: ideaSubmissionRequest(row.id), submissionId: id,
      nextTool: article ? 'get_submission_status' : row.status === 'selected' ? 'get_workflow' : 'start_editorial_idea',
      instructions: 'Valg starter research i ChatGPT, ikke publicering. Hent get_workflow(editorial). Kontrollér først aktualitet og dubletter i list_articles/list_submissions. Brug idéens kilder som spor, ikke som faktagodkendelse. Gem færdig tekst via prepare_submission med editorialIdeaId og requestId ovenfor. Hvis submission findes, genbrug den; aldrig ny requestId. Slut ved preview_submission og personlig godkendelse. Ingen betalt backend-AI.' } };
}

export async function getEditorialIdea(uid: string, raw: unknown) {
  const input = getIdeaInput.parse(raw), row = (await ideaRef(uid, input.ideaId).get()).data() as Idea | undefined;
  if (!row || row.uid !== uid) throw Error('mcp_idea_not_found');
  const article = (await getAdminDb()!.collection('editorialSubmissions').doc(ideaSubmissionId(uid, row.id)).get()).data();
  if (article && article.uid !== uid) throw Error('mcp_idea_not_found');
  return project(row, article);
}

export async function startEditorialIdea(uid: string, raw: unknown) {
  const input = startIdeaInput.parse(raw), ref = ideaRef(uid, input.ideaId), db = getAdminDb();
  if (!db) throw Error('mcp_unavailable');
  await db.runTransaction(async tx => {
    const row = (await tx.get(ref)).data() as Idea | undefined;
    if (!row || row.uid !== uid) throw Error('mcp_idea_not_found');
    // A lost response is recoverable with exactly the previous revision.
    if (row.status === 'selected' && [row.revision, row.revision - 1].includes(input.expectedRevision)) return;
    if (row.revision !== input.expectedRevision) throw Error('mcp_idea_revision_conflict');
    const now = new Date().toISOString();
    tx.update(ref, { status: 'selected', revision: row.revision + 1, selectedAt: now, updatedAt: now });
  });
  return getEditorialIdea(uid, { ideaId: input.ideaId });
}

export async function getEditorialDesk(uid: string, raw: unknown) {
  const input = deskInput.parse(raw);
  const [rows, drafts] = await Promise.all([workspaceRef(uid).collection('editorialIdeas').orderBy('createdAt', 'desc').limit(input.limit + 1).get(), listSubmissions(uid)]);
  const ideas = await Promise.all(rows.docs.slice(0, input.limit).map(row => getEditorialIdea(uid, { ideaId: row.id })));
  const unpublished = drafts.submissions.filter(row => row.status !== 'published');
  return { ideas, drafts: unpublished.slice(0, 10),
    coverage: { ideasHaveMore: rows.size > input.limit, ideaLimit: input.limit, draftsComplete: drafts.complete && unpublished.length <= 10,
      draftLimit: 10, note: 'Idéer er ikke færdige artikler. Gemte kladder og personlige godkendelser genbruges.' },
    readAt: new Date().toISOString(), paidAiCalls: 0, publicationApproval: false, untrustedContent: true };
}
