import { editorialRequestAccess } from '@/lib/editorial-access';
import { readProviderHold } from '@/lib/ai/provider-hold';
import { activateManualWriterBudget, readManualWriterBudget, manualWriterBudgetStatus, MANUAL_WRITER_BUDGET_ID } from '@/lib/ai/manual-writer-budget';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: Request) {
  if (!await editorialRequestAccess(request)) return Response.json({ error: 'Log ind for at se Writer-status.' }, { status: 401, headers });
  try {
    const [budget, provider] = await Promise.all([readManualWriterBudget(), readProviderHold()]);
    const status = manualWriterBudgetStatus(budget);
    return Response.json({ ...status, providerBlocked: provider.blocked,
      available: status.configured && !status.blocked && !provider.blocked && Number(status.remainingDkk) > 0,
      checkedAt: new Date().toISOString() }, { headers });
  } catch { return Response.json({ error: 'Writer-status kunne ikke bekræftes.' }, { status: 503, headers }); }
}
export async function POST(request: Request) {
  const access = await editorialRequestAccess(request);
  if (!access?.owner) return Response.json({ error: 'Forbidden' }, { status: 403, headers });
  const body = await request.json().catch(() => null);
  if (body?.action !== 'activate-manual-writer-only' || body?.requestId !== MANUAL_WRITER_BUDGET_ID || body?.limitDkk !== 50) {
    return Response.json({ error: 'Ugyldigt input.' }, { status: 400, headers });
  }
  try { return Response.json(manualWriterBudgetStatus(await activateManualWriterBudget(access.uid)), { headers }); }
  catch { return Response.json({ error: 'Budgettet kunne ikke aktiveres. Ingen forbrugsdata er nulstillet.' }, { status: 409, headers }); }
}
