import { NextRequest, NextResponse } from 'next/server';
import { requireCronBearer } from '@/lib/cron/cron-auth';
import { costReconcileInput, inspectLivCostReconciliation, reconcileLivCostLedger } from '@/lib/liv/cost-reconcile';

export const runtime = 'nodejs';
export const maxDuration = 60;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/** Ledger-only reconciliation. Never starts preparation, grants a retry or calls a provider. */
export async function POST(req: NextRequest) {
  const denied = requireCronBearer(req);
  if (denied) return denied;
  let input: unknown;
  try {
    if (req.nextUrl.search) throw new Error('invalid');
    const raw = await req.text();
    if (raw.length > 2000) throw new Error('invalid');
    input = JSON.parse(raw);
  } catch { return json({ error: 'liv_cost_reconcile_invalid' }, 400); }
  const parsed = costReconcileInput.safeParse(input);
  if (!parsed.success) return json({ error: 'liv_cost_reconcile_invalid' }, 400);
  try {
    return json(parsed.data.action === 'inspect' ? await inspectLivCostReconciliation(parsed.data.month)
      : await reconcileLivCostLedger(parsed.data));
  } catch (error) {
    const code = error instanceof Error && /^liv_cost_reconcile_(invalid|conflict|unavailable)$/.test(error.message)
      ? error.message : 'liv_cost_reconcile_failed';
    return json({ error: code }, code.endsWith('invalid') ? 400 : code.endsWith('conflict') ? 409 : 503);
  }
}
