import { z } from 'zod';
import { load } from 'cheerio';
import { getAdminDb } from '@/lib/firebase-admin';
import { readEditorialCmsCandidates } from '@/lib/image-gen/webflow';
import { readMapping } from '@/lib/webflow-mapping';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { copenhagenClock } from '@/lib/liv/delivery-policy';
import { workspaceRef } from '@/lib/mcp/workspace';
import { readEditorialWorkSnapshot, runSummary, workTimestamp } from './work-catalog';
import { savedWritingSummary } from './saved-writing-status';

export const draftOverviewInput = z.object({ limit: z.number().int().min(1).max(10).default(5),
  query: z.string().trim().max(150).optional() }).strict();
const objectId = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{24}$/.test(v);
const label = (v: unknown, max = 200) => typeof v === 'string' ? v.slice(0, max)
  .replace(/\b(?:sk-|re_|ghp_|gho_)[a-z\d_-]+/gi, '[skjult]').replace(/\bBearer\s+\S+/gi, '[skjult]').trim() : '';
const safeCode = (v: unknown) => typeof v === 'string' && /^[a-z0-9_:-]{1,120}$/i.test(v) ? v : null;
const codes = (v: unknown) => Array.isArray(v) ? [...new Set(v.map(safeCode).filter((s): s is string => !!s))].slice(0, 8) : [];
const record = (v: unknown): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : {};

/** Presence only, not asset validation, source checking or editorial approval. No excerpts leave this helper. */
export function draftPresence(article: Record<string, unknown>) {
  const content = article.content;
  if (content == null) return { hasText: false, missing: ['content'], bodyImages: 0 };
  if (typeof content !== 'string' || content.length > 200_000) return { hasText: null, missing: ['text_presence_unknown'], bodyImages: null };
  const $ = load(content); $('script,style,template,noscript').remove();
  const cover = typeof article.featuredImage === 'string' ? article.featuredImage : record(article.featuredImage).url;
  const images = new Set($('img[src]').toArray().map(i => $(i).attr('src')?.trim()).filter(src => src && src !== cover));
  const missing = ['title', 'intro', 'subtitle', 'author', 'category', 'slug', 'seoTitle', 'seoDescription']
    .filter(key => typeof article[key] !== 'string' || !String(article[key]).trim());
  if (!cover) missing.push('cover');
  if (!article.fotoCredit) missing.push('cover_credit');
  if (images.size < 2) missing.push('two_distinct_body_images');
  if ($('img').toArray().some(i => !$(i).attr('alt')?.trim())) missing.push('body_image_alt');
  return { hasText: !!$.root().text().trim(), missing, bodyImages: images.size };
}

type DraftVersion = {
  kind: string; id: string; title: string; version: string | number | null;
  updatedAt: string | null; stage: string; scheduledDay: string | null;
  missing: string[]; blockers: string[]; savedChecks: string[];
  open: { tool: string; arguments: Record<string, string> };
};
type Candidate = { itemId: string | null; version: DraftVersion };
function version(kind: string, id: string, article: Record<string, unknown>, updatedAt: unknown,
  stage: string, open: DraftVersion['open'], stored: Partial<DraftVersion> = {}): DraftVersion {
  return { kind, id, title: label(article.title) || 'Kladde uden titel', version: cmsFieldHash(article),
    updatedAt: workTimestamp(updatedAt), stage, scheduledDay: null, missing: draftPresence(article).missing,
    blockers: [], savedChecks: [], open, ...stored };
}
const sorted = <T extends { updatedAt: string | null; id: string }>(rows: T[]) => rows.sort((a, b) =>
  String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) || a.id.localeCompare(b.id));

/** One read-only tool for the overview, not an N+1 round-trip through each full-text MCP tool. */
export async function listDrafts(uid: string, value: unknown) {
  const input = draftOverviewInput.parse(value), db = getAdminDb(); if (!db) throw Error('mcp_unavailable');
  const now = new Date(), today = copenhagenClock(now).day;
  // Sources fail independently: a CMS outage must not hide preserved private text.
  const [cmsResult, savedResult, submissionsResult] = await Promise.allSettled([
    readEditorialCmsCandidates(input.limit, input.query), readEditorialWorkSnapshot(uid),
    db.collection('editorialSubmissions').where('uid', '==', uid).limit(100).get(),
  ]);
  const unavailable = [cmsResult.status === 'rejected' ? 'cms' : null, savedResult.status === 'rejected' ? 'saved_work' : null,
    submissionsResult.status === 'rejected' ? 'private_submissions' : null].filter(Boolean);
  if (unavailable.length === 3) throw Error('mcp_draft_overview_unavailable');
  const cms = cmsResult.status === 'fulfilled' ? cmsResult.value : null;
  const saved = savedResult.status === 'fulfilled' ? savedResult.value : null;
  const submissions = submissionsResult.status === 'fulfilled' ? submissionsResult.value : null;
  const candidates: Candidate[] = [], other = { plansOrEmptyCheckpoints: 0, retainedWritingAttempts: 0,
    writingAttemptsWithText: 0, unknownText: 0, publishedOrArchived: 0 };
  const mapping = readMapping().entries;
  const cmsById = new Map(cms?.items.map(item => [item.id, item]) || []);
  for (const item of cms?.items || []) {
    if (item.isArchived || !(item.isDraft === true || item.lastPublished === null)) { other.publishedOrArchived++; continue; }
    const article = Object.fromEntries(mapping.map(m => [m.internal, item.fieldData[m.webflowSlug]]));
    const presence = draftPresence(article);
    if (presence.hasText !== true) { if (presence.hasText === null) other.unknownText++; else other.plansOrEmptyCheckpoints++; continue; }
    const entry = saved?.state.entries.find(e => e.itemId === item.id);
    const usableManifest = entry?.state === 'ready' && entry.decision !== 'rejected' && entry.expiresDay >= today && !entry.publicationBlockers?.length;
    candidates.push({ itemId: item.id, version: version('cms', item.id, article, item.lastUpdated || item.createdOn,
      item.lastPublished ? 'staged_draft_previously_published' : 'cms_draft', { tool: 'get_article', arguments: { articleId: item.id } },
      { version: cmsFieldHash(item.fieldData), scheduledDay: entry?.scheduledDay || null,
        blockers: codes(entry?.publicationBlockers), savedChecks: usableManifest ? ['ready_manifest_not_revalidated'] : [] }) });
  }
  for (const doc of saved?.runs.docs || []) {
    if (!/^(?:prepare|prepare-alternative|reserve|reserve-editorial)-20\d{2}-\d{2}-\d{2}$/.test(doc.id)) continue;
    const row = doc.data(), summary = runSummary(doc.id, row, saved!.state, today);
    if (summary.stage === 'publication_receipt') continue;
    const article = record(row.articleCheckpoint), presence = draftPresence(article);
    if (presence.hasText !== true) { if (presence.hasText === null && row.articleCheckpoint) other.unknownText++;
      else other.plansOrEmptyCheckpoints++; continue; }
    const itemId = objectId(row.webflowItemId) ? row.webflowItemId : null;
    const currentCms = itemId ? cmsById.get(itemId) : null;
    if (currentCms && (currentCms.isArchived || currentCms.lastPublished && !currentCms.isDraft)) continue;
    candidates.push({ itemId, version: version('liv-checkpoint', doc.id, article, row.updatedAt,
      'saved_checkpoint', { tool: 'get_liv_work', arguments: { runId: doc.id } },
      { version: cmsFieldHash(article), scheduledDay: summary.scheduledDay, blockers: codes(summary.blockers),
        savedChecks: Array.isArray(row.gateResults) ? row.gateResults.slice(0, 12).flatMap(g => safeCode(g?.name) ?
          [`${g.name}:${g.pass === true ? 'historical_pass' : 'historical_stop'}`] : []) : [] }) });
  }
  // Paid attempts may be rewrites, briefs or versions of the same article. They are not additional drafts.
  for (const doc of saved?.writing.docs || []) {
    const summary = savedWritingSummary(doc.data()); other.retainedWritingAttempts++;
    if (summary.hasText === true) other.writingAttemptsWithText++;
  }
  const workspace = saved?.workspace.data(), data = record(workspace?.data), article = record(data.articleData);
  if (typeof data.currentDraftId === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(data.currentDraftId) && draftPresence(article).hasText === true) {
    let itemId: string | null = null;
    try {
      const ref = workspaceRef(uid);
      const [binding, receipt] = await Promise.all([ref.collection('mcpBindings').doc(data.currentDraftId).get(),
        ref.collection('cmsSaves').doc(data.currentDraftId).get()]);
      const bound = binding.data()?.itemId || receipt.data()?.articleId;
      if (objectId(bound)) itemId = bound;
    } catch { unavailable.push('private_cms_binding'); }
    candidates.push({ itemId, version: version('private-workspace', data.currentDraftId, article, workspace?.updatedAt,
      'private_revision', { tool: 'get_workspace', arguments: {} }, { version: workspace?.revision ?? null }) });
  }
  for (const doc of submissions?.docs || []) {
    const row = doc.data();
    if (row.uid !== uid || !/^[a-f0-9]{64}$/.test(doc.id) || row.status === 'published' || draftPresence(record(row.article)).hasText !== true) continue;
    const itemId = objectId(row.prepared?.itemId) ? row.prepared.itemId : null;
    candidates.push({ itemId, version: version('private-submission', doc.id, record(row.article), row.updatedAt,
      'submission', { tool: 'get_submission_status', arguments: { submissionId: doc.id } },
      { version: row.revision ?? null, stage: safeCode(row.status) || 'submission', blockers: codes([row.blocker, row.blockedStep]) }) });
  }
  const groups = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    // Only a real server-held CMS identity joins versions. Never merge by title or model-supplied links.
    const key = candidate.itemId || `${candidate.version.kind}:${candidate.version.id}`;
    groups.set(key, [...(groups.get(key) || []), candidate]);
  }
  const needle = input.query?.toLocaleLowerCase('da');
  const items = [...groups.entries()].flatMap(([id, rows]) => {
    const versions = sorted(rows.map(r => r.version)), latest = versions[0];
    if (needle && !versions.some(v => `${v.title} ${v.id}`.toLocaleLowerCase('da').includes(needle))) return [];
    return [{ ...latest, id, itemId: rows[0].itemId, idOfVersion: latest.id,
      relatedVersions: versions.slice(1, 4).map(v => ({ kind: v.kind, id: v.id, version: v.version, stage: v.stage, updatedAt: v.updatedAt, open: v.open })),
      relatedVersionCount: versions.length - 1,
      nextAction: latest.blockers.length ? 'Se den gemte blokering før et nyt forsøg; genbrug tekst og billeder.' :
        latest.missing.length ? 'Udfyld de angivne mangler i denne version; bevar øvrig tekst og billeder.' :
          'Åbn den valgte version til kontrol og godkendelse. Ingen aktuel publiceringsgodkendelse er fastslået.',
      checks: 'not_revalidated', publicationApproval: false }];
  });
  sorted(items);
  return { items: items.slice(0, input.limit), matchingDraftsInWindow: items.length,
    checkedAt: now.toISOString(), coverage: { cmsRows: cms?.rowsRead ?? 0, cmsComplete: cms?.complete ?? false,
      cmsMaxRows: 300, cmsOrder: cms?.sortedBy ?? null, runRows: saved?.runs.size ?? 0, writingRows: saved?.writing.size ?? 0,
      submissionRows: submissions?.size ?? 0, savedWindowTruncated: saved ? saved.runs.size === 100 || saved.writing.size === 100 : null,
      submissionWindowTruncated: submissions ? submissions.size === 100 : null, unavailable,
      note: 'Seneste fund i afgrænsede læsninger, ikke en fuld magasinoptælling. CMS er fælles; Writer og indsendelser er kun dine. Arkivrækker uden dato kan mangle. Versioner samles kun ved kendt CMS-ID.' },
    otherSavedWork: other, paidAiCalls: 0, readOnly: true, untrustedContent: true,
    interpretation: 'missing er felt-/billedtilstedeværelse, ikke kvalitets- eller rettighedskontrol. blockers og savedChecks er historiske. Tomme lister betyder ikke godkendt. En plan eller et skriveforsøg er ikke en kladde.',
    responseGuidance: 'Besvar overblikket nu med titel, status, kendte mangler og næste handling. Hent ikke fuldtekst, workflow eller flere sider for hver post. Brug open kun når brugeren vælger en artikel eller beder om en dybere vurdering.' };
}
