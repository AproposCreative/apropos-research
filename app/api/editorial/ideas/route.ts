import { NextResponse } from 'next/server';
import { editorialRequestAccess } from '@/lib/editorial-access';
import { getEditorialIdea, getIdeaInput, startEditorialIdea, startIdeaInput } from '@/lib/editorial/ideas';
import { editorialIdeaHandoff } from '@/lib/editorial/idea-handoff';
import { readLivIdeaOverview } from '@/lib/liv/idea-overview';

const reply = (body: object, status = 200) => NextResponse.json(body, { status,
  headers: { 'Cache-Control': 'private, no-store' } });
async function owner(req: Request) {
  const access = await editorialRequestAccess(req);
  return !access ? reply({ error: 'Log ind for at se idéerne.' }, 401) :
    !access.owner ? reply({ error: 'Kun ejeren kan vælge idéer her.' }, 403) : access;
}
export async function GET(req: Request) {
  const access = await owner(req); if (access instanceof Response) return access;
  const id = new URL(req.url).searchParams.get('id');
  if (id !== null && !getIdeaInput.safeParse({ ideaId: id }).success) return reply({ error: 'Ugyldig idé.' }, 400);
  try { return reply(id ? await getEditorialIdea(access.uid, { ideaId: id }) : await readLivIdeaOverview(access.uid)); }
  catch (e) { return e instanceof Error && e.message === 'mcp_idea_not_found' ?
    reply({ error: 'Idéen findes ikke i dit arbejdsrum.' }, 404) : reply({ error: 'Idéerne kunne ikke hentes.' }, 503); }
}
export async function POST(req: Request) {
  const access = await owner(req); if (access instanceof Response) return access;
  let input;
  try {
    const raw = await req.text(); if (raw.length > 1000) throw Error();
    input = startIdeaInput.strict().parse(JSON.parse(raw));
  } catch { return reply({ error: 'Ugyldigt valg.' }, 400); }
  try {
    const idea = await startEditorialIdea(access.uid, input);
    return reply({ idea, handoff: editorialIdeaHandoff(idea.id), publicationApproval: false, paidAiCalls: 0 });
  } catch (e) {
    const reason = e instanceof Error ? e.message : '';
    return reason === 'mcp_idea_not_found' ? reply({ error: 'Idéen findes ikke i dit arbejdsrum.' }, 404) :
      reason === 'mcp_idea_revision_conflict' ? reply({ error: 'Idéen er ændret. Åbn den igen, før du starter.' }, 409) :
      reason === 'liv_idea_requires_review_or_guide_rebrief' ? reply({ error: 'Idéen kræver en ny vinkel som anmeldelse eller kulturguide.' }, 409) :
      reply({ error: 'Valget kunne ikke bekræftes. Åbn idéen igen, før du prøver på ny.' }, 503);
  }
}
