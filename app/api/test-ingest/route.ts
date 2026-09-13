import { editorialRequestAccess } from '@/lib/editorial-access';
import { runIngestToFirestore } from '@/lib/trending/ingest-runner';

export const runtime = 'nodejs';
export const maxDuration = 300;
const reply = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { 'Cache-Control': 'private, no-store' },
});

/** A diagnostic GET must never trigger ingestion or import a CLI entry point. */
export async function GET() {
  return Response.json({ error: 'Brug en eksplicit POST for at starte indlæsning.' }, {
    status: 405, headers: { Allow: 'POST', 'Cache-Control': 'private, no-store' },
  });
}

export async function POST(request: Request) {
  const access = await editorialRequestAccess(request);
  if (!access) return reply({ error: 'Log ind.' }, 401);
  if (!access.owner) return reply({ error: 'Kun Frederik kan starte testindlæsning.' }, 403);
  try {
    const result = await runIngestToFirestore({ sinceHrs: 24, limit: 10 });
    return reply({ result });
  } catch {
    return reply({ error: 'Testindlæsning mislykkedes. Kontrollér fælles mediekilder.' }, 503);
  }
}
