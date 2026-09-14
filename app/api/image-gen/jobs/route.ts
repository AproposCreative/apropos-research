import { editorialRequestAccess } from '@/lib/editorial-access';
import { listImageGenJobs, readImageGenJob } from '@/lib/image-gen/jobs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: Request) {
  const access = await editorialRequestAccess(request);
  if (!access) return Response.json({ error: 'unauthorized' }, { status: 401, headers });
  const id = new URL(request.url).searchParams.get('id');
  const cursor = new URL(request.url).searchParams.get('cursor');
  if ([id, cursor].some(value => value !== null && !/^[a-f0-9]{64}$/.test(value))) return Response.json({ error: 'invalid_id' }, { status: 400, headers });
  try {
    if (id) {
      const job = await readImageGenJob(access.uid, id);
      return Response.json(job ?? { error: 'not_found' }, { status: job ? 200 : 404, headers });
    }
    const jobs = await (cursor ? listImageGenJobs(access.uid, cursor) : listImageGenJobs(access.uid));
    return Response.json({ jobs, nextCursor: jobs.length === 30 ? jobs[29].id : null }, { headers });
  } catch { return Response.json({ error: 'Billedhistorikken kunne ikke hentes.' }, { status: 503, headers }); }
}
