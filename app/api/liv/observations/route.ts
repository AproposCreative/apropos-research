import { NextRequest, NextResponse } from 'next/server';
import { editorialRequestAccess } from '@/lib/editorial-access';
import { getAdminAuth } from '@/lib/firebase-admin';
import { observationInput, observationWitness, observationRunId } from '@/lib/liv/observation-contract';
import { listObservationStories, readObservationBaseline, confirmObservation } from '@/lib/liv/observations';

export const runtime = 'nodejs';
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
async function identity(req: NextRequest) {
  const access = await editorialRequestAccess(req);
  if (!access) return null;
  const user = await getAdminAuth()!.getUser(access.uid);
  const witness = !user.disabled && user.emailVerified ? observationWitness(user.email) : null;
  return witness ? { userId: access.uid, witness } : null;
}
function failure(error: unknown) {
  const code = error instanceof Error && /^liv_observation_[a-z_]+$/.test(error.message) ? error.message : 'liv_observation_unavailable';
  return reply({ error: code }, code === 'liv_observation_unavailable' ? 503 : 409);
}
export async function GET(req: NextRequest) {
  try {
    const actor = await identity(req); if (!actor) return reply({ error: 'login_required' }, 401);
    const params = req.nextUrl.searchParams;
    if ([...params.keys()].some(key => key !== 'runId') || params.getAll('runId').length > 1) return reply({ error: 'invalid_request' }, 400);
    const runId = params.get('runId');
    if (runId === null) return reply({ stories: await listObservationStories() });
    if (!observationRunId.safeParse(runId).success) return reply({ error: 'invalid_request' }, 400);
    return reply(await readObservationBaseline(runId, actor.userId, actor.witness));
  } catch (error) { return failure(error); }
}
export async function POST(req: NextRequest) {
  try {
    const actor = await identity(req); if (!actor) return reply({ error: 'login_required' }, 401);
    let input;
    try {
      const raw = await req.text();
      if (req.nextUrl.search || raw.length > 6000) throw Error('invalid');
      input = observationInput.parse(JSON.parse(raw));
    } catch { return reply({ error: 'invalid_request' }, 400); }
    return reply(await confirmObservation(input, actor.userId, actor.witness));
  } catch (error) { return failure(error); }
}
