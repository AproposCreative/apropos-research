/**
 * Liv Brandt — observability for daglige auto-publishes.
 *
 * Returnerer de seneste N dages kørsler (default 7) — bruges af et UI eller
 * et debug-panel til at se hvilke artikler Liv har skrevet, hvilke der blev
 * skippet og hvorfor.
 *
 * Kræver Firebase ID-token (samme auth som nyhedsbrevs-status), så historikken
 * ikke lækker offentligt.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getNewsletterUserIdFromRequest } from '@/lib/newsletter/auth-request';
import { listRecentLivDaily } from '@/lib/liv/daily-history-store';
import { env } from '@/lib/config/env';
import { getWebflowConfig } from '@/lib/webflow-config';

type LivStatusEntry = {
  id: string;
  dayKey: string;
  status: string;
  topic?: string | null;
  title?: string | null;
  slug?: string | null;
  webflowItemId?: string | null;
  reason?: string | null;
  gateResults?: Array<{ name: string; pass: boolean; detail?: string; skipped?: boolean }>;
  finishedAt: string | null;
};

function resolveWebflowConfig() {
  const file = getWebflowConfig();
  const token = (file.apiToken !== undefined ? file.apiToken : env.WEBFLOW_API_TOKEN) || '';
  const siteId = (file.siteId !== undefined ? file.siteId : env.WEBFLOW_SITE_ID) || '';
  const articlesCollectionId =
    (file.articlesCollectionId !== undefined
      ? file.articlesCollectionId
      : env.WEBFLOW_ARTICLES_COLLECTION_ID) || '';
  const authorsCollectionId =
    (file.authorsCollectionId !== undefined
      ? file.authorsCollectionId
      : env.WEBFLOW_AUTHORS_COLLECTION_ID) || '';
  return { token, siteId, articlesCollectionId, authorsCollectionId };
}

function resolveLivDailyWebflowStatus(): 'draft' | 'published' {
  const raw = (process.env.LIV_DAILY_WEBFLOW_STATUS || '').trim().toLowerCase();
  if (raw === 'published') return 'published';
  return 'draft';
}

function isLivDailyPaused(): boolean {
  const p = process.env.LIV_DAILY_PAUSED;
  return p === '1' || p?.toLowerCase() === 'true';
}

function safeIso(v: unknown): string | null {
  if (!v || typeof v !== 'string') return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function dayKeyFromIso(iso: string | null): string {
  if (!iso) return '—';
  return iso.slice(0, 10);
}

function asBool(v: unknown): boolean {
  if (v === true) return true;
  if (typeof v === 'string') return v.toLowerCase().trim() === 'true' || v.trim() === '1';
  if (typeof v === 'number') return v === 1;
  return false;
}

async function fetchLivAuthorIds(
  token: string,
  siteId: string,
  authorsCollectionId: string
): Promise<Set<string>> {
  const out = new Set<string>();
  if (!token || !siteId || !authorsCollectionId) return out;
  try {
    const res = await fetch(
      `https://api.webflow.com/v2/sites/${siteId}/collections/${authorsCollectionId}/items?limit=200`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Accept-Version': '1.0.0',
        },
      }
    );
    if (!res.ok) return out;
    const data = (await res.json()) as { items?: Array<{ id?: string; fieldData?: Record<string, unknown> }> };
    const items = Array.isArray(data.items) ? data.items : [];
    for (const item of items) {
      const name = String(item.fieldData?.name || '').toLowerCase().trim();
      const slug = String(item.fieldData?.slug || '').toLowerCase().trim();
      if (name.includes('liv brandt') || slug === 'liv-brandt') {
        if (typeof item.id === 'string' && item.id.trim()) out.add(item.id.trim());
      }
    }
  } catch {
    // best effort only
  }
  return out;
}

async function listRecentLivFromWebflow(limit: number): Promise<LivStatusEntry[]> {
  const { token, siteId, articlesCollectionId, authorsCollectionId } = resolveWebflowConfig();
  if (!token || !siteId || !articlesCollectionId) return [];

  const livAuthorIds = await fetchLivAuthorIds(token, siteId, authorsCollectionId);
  const entries: LivStatusEntry[] = [];
  const pageSize = 100;
  let offset = 0;

  for (let page = 0; page < 10; page += 1) {
    const res = await fetch(
      `https://api.webflow.com/v2/sites/${siteId}/collections/${articlesCollectionId}/items?limit=${pageSize}&offset=${offset}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Accept-Version': '1.0.0',
        },
      }
    );
    if (!res.ok) break;
    const data = (await res.json()) as {
      items?: Array<{
        id?: string;
        isDraft?: boolean;
        createdOn?: string;
        lastUpdated?: string;
        lastPublished?: string;
        fieldData?: Record<string, unknown>;
      }>;
    };
    const items = Array.isArray(data.items) ? data.items : [];
    if (items.length === 0) break;

    for (const item of items) {
      const fd = item.fieldData || {};
      const authorRef = typeof fd.author === 'string' ? fd.author : '';
      const aiGenerated = asBool(fd['ai-generated']);
      const sourceAuthor =
        typeof fd['author-name'] === 'string'
          ? String(fd['author-name']).toLowerCase()
          : typeof fd['author_name'] === 'string'
            ? String(fd['author_name']).toLowerCase()
            : '';

      const isLikelyLiv =
        (authorRef && livAuthorIds.has(authorRef)) ||
        sourceAuthor.includes('liv brandt') ||
        aiGenerated;

      if (!isLikelyLiv) continue;

      const title = typeof fd.name === 'string' ? fd.name : null;
      const slug = typeof fd.slug === 'string' ? fd.slug : null;
      const publishDate = safeIso(fd['publish-date']);
      const lastPublished = safeIso(item.lastPublished);
      const lastUpdated = safeIso(item.lastUpdated);
      const createdOn = safeIso(item.createdOn);
      const finishedAt = publishDate || lastPublished || lastUpdated || createdOn;

      const status = item.isDraft ? 'draft' : 'published';
      entries.push({
        id: `webflow-${item.id || slug || Math.random().toString(36).slice(2)}`,
        dayKey: dayKeyFromIso(finishedAt),
        status,
        title,
        slug,
        topic: null,
        webflowItemId: typeof item.id === 'string' ? item.id : null,
        reason: 'Webflow CMS',
        gateResults: [],
        finishedAt,
      });
    }

    if (items.length < pageSize) break;
    offset += pageSize;
  }

  entries.sort((a, b) => {
    const ta = a.finishedAt ? new Date(a.finishedAt).getTime() : 0;
    const tb = b.finishedAt ? new Date(b.finishedAt).getTime() : 0;
    return tb - ta;
  });

  return entries.slice(0, limit);
}

export async function GET(req: NextRequest) {
  const uid = await getNewsletterUserIdFromRequest(req);
  if (!uid) {
    return NextResponse.json({ error: 'Ikke autoriseret' }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const limitRaw = Number.parseInt(sp.get('limit') || '7', 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 60) : 7;
  const includeCms = sp.get('includeCms') !== '0';

  try {
    const [dailyEntries, cmsEntries] = await Promise.all([
      listRecentLivDaily(limit),
      includeCms ? listRecentLivFromWebflow(limit) : Promise.resolve([]),
    ]);

    const mergedBySlug = new Map<string, LivStatusEntry>();
    for (const e of dailyEntries as LivStatusEntry[]) {
      const key = e.slug ? `slug:${e.slug}` : `id:${e.id}`;
      mergedBySlug.set(key, e);
    }
    for (const e of cmsEntries) {
      const key = e.slug ? `slug:${e.slug}` : `id:${e.id}`;
      if (mergedBySlug.has(key)) continue;
      mergedBySlug.set(key, e);
    }

    const entries = Array.from(mergedBySlug.values())
      .sort((a, b) => {
        const ta = a.finishedAt ? new Date(a.finishedAt).getTime() : 0;
        const tb = b.finishedAt ? new Date(b.finishedAt).getTime() : 0;
        return tb - ta;
      })
      .slice(0, limit);

    const counts = entries.reduce(
      (acc, e) => {
        acc[e.status] = (acc[e.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const { siteId, articlesCollectionId } = resolveWebflowConfig();
    const livDailyWebflowStatus = resolveLivDailyWebflowStatus();
    const livDailyPaused = isLivDailyPaused();
    const designerBaseUrl = siteId?.trim()
      ? `https://webflow.com/design/${encodeURIComponent(siteId.trim())}`
      : null;

    return NextResponse.json({
      ok: true,
      limit,
      counts,
      sources: {
        firestoreRuns: dailyEntries.length,
        webflowCms: cmsEntries.length,
      },
      entries,
      config: {
        livDailyWebflowStatus,
        livDailyPaused,
        /** Samme som daglig cron — default draft (redaktionelt review i CMS). */
        cronNote: '0 8 * * * (08:00 UTC) — se vercel.json',
        designerBaseUrl,
        hasArticlesCollectionId: Boolean(articlesCollectionId?.trim()),
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Ukendt fejl' },
      { status: 500 }
    );
  }
}
