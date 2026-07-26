import { NextRequest, NextResponse } from 'next/server';
import { requireSeoEngineUser } from '@/lib/seo-engine/require-auth';
import { mapPipelineError } from '@/lib/seo-engine/http';
import { getOpportunity } from '@/lib/seo-engine/opportunity-engine/store';
import {
  approveOpportunity,
  rejectOpportunity,
  rollbackOpportunity,
  applyOpportunityProposals,
} from '@/lib/seo-engine/opportunity-engine/apply';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requireSeoEngineUser(req);
  if (!auth.ok) return auth.response;
  try {
    const { id } = await ctx.params;
    const opp = await getOpportunity(id);
    if (!opp) {
      return NextResponse.json({ ok: false, error: 'Ikke fundet' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, opportunity: opp });
  } catch (e) {
    return mapPipelineError(e);
  }
}

/**
 * Actions: approve | reject | apply | rollback | dismiss
 * Default remains recommendation/approval — apply requires confirmOverwrite.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireSeoEngineUser(req);
  if (!auth.ok) return auth.response;
  try {
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      applyNow?: boolean;
      confirmOverwrite?: boolean;
    };
    const action = body.action || '';

    if (action === 'approve') {
      const opportunity = await approveOpportunity({
        opportunityId: id,
        actor: auth.userId,
        applyNow: body.applyNow === true,
        confirmOverwrite: body.confirmOverwrite === true,
      });
      return NextResponse.json({ ok: true, opportunity });
    }
    if (action === 'reject' || action === 'dismiss') {
      const opportunity = await rejectOpportunity({
        opportunityId: id,
        actor: auth.userId,
      });
      return NextResponse.json({ ok: true, opportunity });
    }
    if (action === 'apply') {
      const result = await applyOpportunityProposals({
        opportunityId: id,
        actor: auth.userId,
        mode: 'approved',
        confirmOverwrite: body.confirmOverwrite === true,
      });
      return NextResponse.json({ ok: true, opportunity: result.opportunity });
    }
    if (action === 'rollback') {
      const opportunity = await rollbackOpportunity({
        opportunityId: id,
        actor: auth.userId,
      });
      return NextResponse.json({ ok: true, opportunity });
    }

    return NextResponse.json(
      { ok: false, error: 'Ukendt action — brug approve|reject|apply|rollback' },
      { status: 400 }
    );
  } catch (e) {
    return mapPipelineError(e);
  }
}
