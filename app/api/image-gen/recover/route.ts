import { after } from 'next/server';
import { editorialRequestAccess } from '@/lib/editorial-access';
import { claimImageGenJob, markImageGenJobExpired } from '@/lib/image-gen/jobs';
import { runImageGenJob } from '@/lib/image-gen/runtime';
export const runtime = 'nodejs';
export const maxDuration = 300;
export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store' };
  const access = await editorialRequestAccess(request);
  if (!access) return Response.json({ error: 'unauthorized' }, { status: 401, headers });
  try {
    const body = await request.json();
    if (!/^[a-f0-9]{64}$/.test(body.id)) throw new Error('invalid');
    const parent = await markImageGenJobExpired(access.uid, body.id);
    if (!parent || parent.status !== 'uncertain') throw new Error('not_recoverable');
    if (!['generate', 'edit'].includes(parent.operation)) return Response.json({ job: parent, recoveryAvailable: false }, { headers });
    const claim = await claimImageGenJob(access.uid, { requestId: `recover-${parent.id}`, articleId: parent.articleId,
      articleVersion: parent.articleVersion, operation: 'recover', parameters: { ...(parent.parameters as object), parentJobId: parent.id } });
    if (claim.created) after(() => runImageGenJob(claim.job));
    return Response.json({ job: claim.job }, { headers, status: claim.created ? 202 : 200 });
  } catch { return Response.json({ error: 'Jobbet arbejder stadig eller har ingen gendannelse tilgængelig. Der er ikke bestilt et nyt billede.' }, { headers, status: 409 }); }
}
