import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import {
  assertSameArticleKey,
  diffPublishFields,
  listAnalysisRunsForArticle,
  listSeoVersionsForArticle,
  softDeleteSeoArticle,
} from '@/lib/seo-engine/history';
import { getSeoVersion } from '@/lib/seo-engine/store';
import { jsonError, mapPipelineError } from '@/lib/seo-engine/http';
import {
  assertOwnershipOrAdmin,
  requireSeoEngineUser,
} from '@/lib/seo-engine/require-auth';
import { isEphemeralDemoRequest } from '@/lib/seo-engine/ephemeral-demo';

function tsMillis(v: unknown): number {
  if (!v) return 0;
  if (typeof (v as { toMillis?: () => number }).toMillis === 'function') {
    return (v as { toMillis: () => number }).toMillis();
  }
  if (typeof v === 'string' || typeof v === 'number') return new Date(v).getTime() || 0;
  return 0;
}

export async function GET(req: NextRequest) {
  if (isEphemeralDemoRequest(req)) {
    return jsonError(400, 'demo_ephemeral', 'Historik er utilgængelig i ephemeral demo');
  }
  if (!getAdminDb()) return jsonError(503, 'fail_closed', 'Firestore er ikke konfigureret');
  const auth = await requireSeoEngineUser(req);
  if (!auth.ok) return auth.response;

  const articleKey = req.nextUrl.searchParams.get('articleKey')?.trim();
  const a = req.nextUrl.searchParams.get('seoVersionIdA')?.trim();
  const b = req.nextUrl.searchParams.get('seoVersionIdB')?.trim();

  if (a && b) {
    const va = await getSeoVersion(a);
    const vb = await getSeoVersion(b);
    if (!va || !vb) return jsonError(404, 'not_found', 'Version findes ikke');
    try {
      assertSameArticleKey(va, vb);
      assertOwnershipOrAdmin({ userId: auth.userId, createdBy: va.createdBy });
      assertOwnershipOrAdmin({ userId: auth.userId, createdBy: vb.createdBy });
    } catch (e) {
      return mapPipelineError(e);
    }
    const diffs = diffPublishFields(
      va.pack.recommended.fields as unknown as Record<string, { value?: unknown }>,
      vb.pack.recommended.fields as unknown as Record<string, { value?: unknown }>
    );
    return NextResponse.json({
      ok: true,
      diffs,
      a: { id: va.id, createdAt: tsMillis(va.createdAt), revision: va.revision, articleKey: va.articleKey },
      b: { id: vb.id, createdAt: tsMillis(vb.createdAt), revision: vb.revision, articleKey: vb.articleKey },
    });
  }

  if (!articleKey) {
    return jsonError(400, 'invalid_input', 'articleKey eller seoVersionIdA/B kræves');
  }

  const [versions, runs] = await Promise.all([
    listSeoVersionsForArticle(articleKey, 50, { userId: auth.userId }),
    listAnalysisRunsForArticle(articleKey, 50, { userId: auth.userId }),
  ]);

  return NextResponse.json({
    ok: true,
    articleKey,
    versions: versions.map((v) => ({
      id: v.id,
      revision: v.revision,
      stale: v.stale,
      inputVersionHash: v.inputVersionHash,
      analysisRunId: v.analysisRunId,
      recommendedFamily: v.pack?.recommended?.family,
      createdBy: v.createdBy,
      createdAt: tsMillis(v.createdAt),
      mode: v.mode,
    })),
    analysisRuns: runs.map((r) => ({
      id: r.id,
      mode: r.mode,
      inputMode: r.inputMode,
      inputVersionHash: r.inputVersionHash,
      status: r.status,
      createdBy: r.createdBy,
      createdAt: tsMillis(r.endedAt || r.startedAt),
      error: r.error,
      strategyFailure: r.strategyFailure
        ? { message: r.strategyFailure.message, code: r.strategyFailure.code }
        : undefined,
    })),
  });
}

export async function DELETE(req: NextRequest) {
  if (isEphemeralDemoRequest(req)) {
    return jsonError(400, 'demo_ephemeral', 'Soft-delete utilgængelig i ephemeral demo');
  }
  if (!getAdminDb()) return jsonError(503, 'fail_closed', 'Firestore er ikke konfigureret');
  const auth = await requireSeoEngineUser(req);
  if (!auth.ok) return auth.response;

  const articleKey = req.nextUrl.searchParams.get('articleKey')?.trim();
  if (!articleKey) return jsonError(400, 'invalid_input', 'articleKey kræves');

  try {
    const result = await softDeleteSeoArticle(articleKey, { userId: auth.userId });
    return NextResponse.json({ ok: true, softDeleted: true, ...result });
  } catch (e) {
    return mapPipelineError(e);
  }
}
