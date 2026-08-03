/**
 * Preview → confirm → backup → apply for Arkiv content fixes
 * (internal links, headings, canonical). Reuses Webflow locale adapters +
 * serverless-safe backfill paths + optional Firestore backup.
 */

import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import {
  ARCHIVE_APPLY_BACKUP_COL,
  ARCHIVE_APPLY_SYSTEM_USER,
  ARCHIVE_APPLY_WEBFLOW_BUSY_DA,
} from '@/lib/seo-engine/archive-audit-apply-constants';
import {
  assertArchiveApplySelectionGates,
  formatArchiveApplyFetchError,
  normalizeArchiveApplySelection,
  sortSelectionDaFirst,
  type ArchiveApplySelection,
  createCachedLocaleFetch,
} from '@/lib/seo-engine/archive-audit-apply';
import { ensureSeoEngineBackfillDir } from '@/lib/seo-engine/backfill-paths';
import {
  ARCHIVE_CONTENT_MAX_BATCH,
  buildCmsPatchFromContentProposal,
  buildContentFixProposal,
  hashBodyContent,
  loadInternalLinkCatalog,
  normalizeFixKinds,
  readCmsBody,
  readCmsCanonical,
  type ArchiveFixKind,
  type ContentFixKind,
  type ContentFixProposal,
  type InternalLinkCatalogEntry,
} from '@/lib/seo-engine/archive-content-fixes';
import {
  classifyLocaleFetchFailure,
  withTransientFetchRetry,
} from '@/lib/seo-engine/overwrite-backfill';
import {
  fetchArticleItemByLocale,
  isWebflowLocalePublished,
  patchArticleFieldDataForLocale,
  publishArticleItemForLocale,
  resolveWebflowLocaleIds,
} from '@/lib/webflow/locale-items';
import {
  resolveAutoTranslateEnabled,
  setAutoTranslateEnabled,
} from '@/lib/webflow/article-translation-settings';

export const ARCHIVE_CONTENT_APPLY_COL = 'seoEngineArchiveContentPreviews';
export const ARCHIVE_CONTENT_PREVIEW_TTL_MS = 2 * 60 * 60 * 1000;

export type ContentApplyPreviewDocument = {
  schemaVersion: 1;
  previewId: string;
  confirmToken: string;
  createdAt: string;
  createdBy: string;
  mode: 'dry-run';
  selection: ArchiveApplySelection[];
  kinds: ContentFixKind[];
  proposals: ContentFixProposal[];
  rejected: Array<{
    itemId: string;
    locale: string;
    reason: string;
  }>;
  stoppedOnError: boolean;
  errorMessage: string | null;
  expiresAt: string;
  appliedAt?: string | null;
};

export type ContentApplyPreviewStore = {
  save: (doc: ContentApplyPreviewDocument) => Promise<void>;
  get: (previewId: string) => Promise<ContentApplyPreviewDocument | null>;
  markApplied: (previewId: string, appliedAt: string) => Promise<void>;
};

function stripUndefinedDeep(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((v) => stripUndefinedDeep(v)).filter((v) => v !== undefined);
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === undefined) continue;
    const next = stripUndefinedDeep(v);
    if (next !== undefined) out[k] = next;
  }
  return out;
}

function requireDb(): Firestore {
  const db = getAdminDb();
  if (!db) throw Object.assign(new Error('Firestore er ikke tilgængelig'), { code: 'fail_closed' });
  return db;
}

export function createFirestoreContentApplyPreviewStore(): ContentApplyPreviewStore {
  return {
    async save(doc) {
      await requireDb()
        .collection(ARCHIVE_CONTENT_APPLY_COL)
        .doc(doc.previewId)
        .set(stripUndefinedDeep(doc) as Record<string, unknown>);
    },
    async get(previewId) {
      const snap = await requireDb().collection(ARCHIVE_CONTENT_APPLY_COL).doc(previewId).get();
      if (!snap.exists) return null;
      return snap.data() as ContentApplyPreviewDocument;
    },
    async markApplied(previewId, appliedAt) {
      await requireDb().collection(ARCHIVE_CONTENT_APPLY_COL).doc(previewId).set(
        { appliedAt, updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
    },
  };
}

export function createMemoryContentApplyPreviewStore(
  seed?: Map<string, ContentApplyPreviewDocument>
): ContentApplyPreviewStore {
  const map = seed || new Map<string, ContentApplyPreviewDocument>();
  return {
    async save(doc) {
      map.set(doc.previewId, structuredClone(doc));
    },
    async get(previewId) {
      const d = map.get(previewId);
      return d ? structuredClone(d) : null;
    },
    async markApplied(previewId, appliedAt) {
      const d = map.get(previewId);
      if (d) {
        d.appliedAt = appliedAt;
        map.set(previewId, d);
      }
    },
  };
}

function newPreviewId(): string {
  return `acp-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(4).toString('hex')}`;
}

function cmsLocaleFor(code: 'da' | 'en'): string {
  const ids = resolveWebflowLocaleIds();
  return code === 'da' ? ids.dk : ids.en;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function assertContentFixKinds(
  kinds: ArchiveFixKind[]
): { ok: true; contentKinds: ContentFixKind[] } | { ok: false; reason: string } {
  const contentKinds = kinds.filter((k) => k !== 'seo_meta') as ContentFixKind[];
  if (!contentKinds.length) {
    return { ok: false, reason: 'Vælg mindst én brødtekst-/canonical-/alt-fix' };
  }
  return { ok: true, contentKinds };
}

export function assertContentApplySelectionGates(
  selection: ArchiveApplySelection[]
): { ok: true } | { ok: false; reason: string } {
  const base = assertArchiveApplySelectionGates(selection);
  if (base.ok === false) return base;
  if (selection.length > ARCHIVE_CONTENT_MAX_BATCH) {
    return {
      ok: false,
      reason: `Max ${ARCHIVE_CONTENT_MAX_BATCH} valgte for brødtekst/canonical (fik ${selection.length}).`,
    };
  }
  return { ok: true };
}

export async function generateContentFixPreview(opts: {
  selection: ArchiveApplySelection[];
  kinds: ArchiveFixKind[];
  createdBy: string;
  store?: ContentApplyPreviewStore;
  fetchFn?: typeof fetchArticleItemByLocale;
  catalog?: InternalLinkCatalogEntry[];
  previewPaceMs?: number;
  onLog?: (line: string) => void;
}): Promise<ContentApplyPreviewDocument> {
  const kindNorm = normalizeFixKinds(opts.kinds);
  if (kindNorm.ok === false) {
    throw Object.assign(new Error(kindNorm.reason), { code: 'invalid_input' });
  }
  const kindsGate = assertContentFixKinds(kindNorm.kinds);
  if (kindsGate.ok === false) {
    throw Object.assign(new Error(kindsGate.reason), { code: 'invalid_input' });
  }
  const selNorm = normalizeArchiveApplySelection(opts.selection);
  if (selNorm.ok === false) {
    throw Object.assign(new Error(selNorm.reason), { code: 'invalid_input' });
  }
  const gate = assertContentApplySelectionGates(selNorm.selection);
  if (gate.ok === false) {
    throw Object.assign(new Error(gate.reason), { code: 'invalid_input' });
  }

  const selection = sortSelectionDaFirst(selNorm.selection);
  const log = opts.onLog || (() => undefined);
  const paceMs = opts.previewPaceMs ?? 300;
  const catalog = opts.catalog || loadInternalLinkCatalog();
  const baseFetch = opts.fetchFn || fetchArticleItemByLocale;
  const fetchFn = createCachedLocaleFetch(
    withTransientFetchRetry(baseFetch, {
      onRetry: (info) =>
        log(
          `Transient fetch retry ${info.attempt}/${info.maxAttempts} status=${info.status ?? 'n/a'} waitMs=${info.delayMs}`
        ),
    })
  );
  const store = opts.store || createFirestoreContentApplyPreviewStore();

  const proposals: ContentFixProposal[] = [];
  const rejected: ContentApplyPreviewDocument['rejected'] = [];
  let stoppedOnError = false;
  let errorMessage: string | null = null;

  for (let i = 0; i < selection.length; i++) {
    const sel = selection[i]!;
    if (stoppedOnError) break;
    if (i > 0 && paceMs > 0) await sleep(paceMs);

    const cmsLocaleId = cmsLocaleFor(sel.locale);
    try {
      const item = await fetchFn(sel.itemId, cmsLocaleId);
      if (!isWebflowLocalePublished(item)) {
        if (sel.locale === 'da') {
          stoppedOnError = true;
          errorMessage = `DA er ikke publiceret for ${sel.itemId}`;
          rejected.push({ itemId: sel.itemId, locale: sel.locale, reason: errorMessage });
          break;
        }
        rejected.push({
          itemId: sel.itemId,
          locale: sel.locale,
          reason: 'EN ikke publiceret — skip',
        });
        continue;
      }

      const slug = String(item.fieldData.slug || '').trim();
      const title = String(item.fieldData.name || item.fieldData.title || '').trim();
      const proposal = buildContentFixProposal({
        itemId: sel.itemId,
        locale: sel.locale,
        title,
        slug,
        fieldData: item.fieldData,
        lastUpdated: item.lastUpdated ?? null,
        kinds: kindsGate.contentKinds,
        catalog,
      });

      if (!proposal.contentChanged && !proposal.canonicalChanged && !proposal.thumbAltChanged) {
        rejected.push({
          itemId: sel.itemId,
          locale: sel.locale,
          reason: 'Ingen sikre ændringer fundet for valgte fix-typer',
        });
        continue;
      }
      proposals.push(proposal);
    } catch (err) {
      const classified = classifyLocaleFetchFailure(err);
      if (classified.kind === 'blocking') {
        stoppedOnError = true;
        errorMessage = formatArchiveApplyFetchError({
          itemId: sel.itemId,
          locale: sel.locale,
          message: classified.message,
          status: classified.status,
        });
        if (/overbelastet|429|too many/i.test(errorMessage)) {
          errorMessage = ARCHIVE_APPLY_WEBFLOW_BUSY_DA;
        }
        rejected.push({ itemId: sel.itemId, locale: sel.locale, reason: errorMessage });
        break;
      }
      rejected.push({
        itemId: sel.itemId,
        locale: sel.locale,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const doc: ContentApplyPreviewDocument = {
    schemaVersion: 1,
    previewId: newPreviewId(),
    confirmToken: randomBytes(24).toString('hex'),
    createdAt: new Date().toISOString(),
    createdBy: opts.createdBy || ARCHIVE_APPLY_SYSTEM_USER,
    mode: 'dry-run',
    selection,
    kinds: kindsGate.contentKinds,
    proposals: stoppedOnError ? [] : proposals,
    rejected,
    stoppedOnError,
    errorMessage,
    expiresAt: new Date(Date.now() + ARCHIVE_CONTENT_PREVIEW_TTL_MS).toISOString(),
    appliedAt: null,
  };
  await store.save(doc);
  return doc;
}

export type ContentApplyResult = {
  previewId: string;
  backupPath: string;
  backupDocId: string | null;
  writtenCount: number;
  stoppedOnError: boolean;
  errorMessage?: string;
  autoTranslatePaused: boolean;
  autoTranslateRestored: boolean;
};

export async function applyContentFixPreview(opts: {
  previewId: string;
  confirmOverwrite: boolean;
  confirmToken: string;
  store?: ContentApplyPreviewStore;
  fetchFn?: typeof fetchArticleItemByLocale;
  patchFn?: typeof patchArticleFieldDataForLocale;
  publishFn?: typeof publishArticleItemForLocale;
  reportDir?: string;
  writePaceMs?: number;
  pauseAutoTranslate?: boolean;
  onLog?: (line: string) => void;
}): Promise<ContentApplyResult> {
  const store = opts.store || createFirestoreContentApplyPreviewStore();
  const preview = await store.get(opts.previewId);
  if (!preview) {
    throw Object.assign(new Error('Preview ikke fundet — kør ny preview'), { code: 'not_found' });
  }
  if (opts.confirmOverwrite !== true) {
    throw Object.assign(new Error('confirmOverwrite=true kræves'), { code: 'forbidden' });
  }
  if (String(opts.confirmToken || '') !== preview.confirmToken) {
    throw Object.assign(new Error('confirmToken matcher ikke'), { code: 'forbidden' });
  }
  if (preview.appliedAt) {
    throw Object.assign(new Error('Preview er allerede anvendt'), { code: 'forbidden' });
  }
  if (Date.parse(preview.expiresAt) < Date.now()) {
    throw Object.assign(new Error('Preview er udløbet — kør ny preview'), { code: 'forbidden' });
  }
  if (preview.stoppedOnError || !preview.proposals.length) {
    throw Object.assign(new Error('Preview har ingen godkendte forslag'), { code: 'invalid_input' });
  }

  const log = opts.onLog || (() => undefined);
  const reportDir = ensureSeoEngineBackfillDir({ reportDir: opts.reportDir });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseFetch = opts.fetchFn || fetchArticleItemByLocale;
  const fetchFn = withTransientFetchRetry(baseFetch, {
    onRetry: (info) =>
      log(
        `Transient fetch retry ${info.attempt}/${info.maxAttempts} status=${info.status ?? 'n/a'} waitMs=${info.delayMs}`
      ),
  });
  const patchFn = opts.patchFn || patchArticleFieldDataForLocale;
  const publishFn = opts.publishFn || publishArticleItemForLocale;
  const paceMs = opts.writePaceMs ?? 300;

  // Backup all locales before first write
  const backups: Array<{
    itemId: string;
    locale: string;
    content: string;
    canonical: string | null;
    thumb: unknown;
    lastUpdated: string | null;
    contentHash: string;
  }> = [];

  for (const p of preview.proposals) {
    const item = await fetchFn(p.itemId, cmsLocaleFor(p.locale));
    backups.push({
      itemId: p.itemId,
      locale: p.locale,
      content: readCmsBody(item.fieldData),
      canonical: readCmsCanonical(item.fieldData),
      thumb: item.fieldData.thumb ?? null,
      lastUpdated: item.lastUpdated ?? null,
      contentHash: hashBodyContent(readCmsBody(item.fieldData)),
    });
  }

  const backupPath = join(reportDir, `backup-content-apply-${stamp}.json`);
  const backupPayload = {
    createdAt: new Date().toISOString(),
    previewId: preview.previewId,
    kinds: preview.kinds,
    note: 'Rollback: restore content + the snapshotted canonical field via Webflow PATCH. No secrets.',
    items: backups,
  };
  writeFileSync(backupPath, JSON.stringify(backupPayload, null, 2), 'utf8');

  let backupDocId: string | null = null;
  try {
    const db = getAdminDb();
    if (db) {
      await db.collection(ARCHIVE_APPLY_BACKUP_COL).doc(preview.previewId).set(
        stripUndefinedDeep({
          previewId: preview.previewId,
          kind: 'content_apply',
          createdAt: new Date().toISOString(),
          backupPath,
          backup: backupPayload,
        }) as Record<string, unknown>
      );
      backupDocId = preview.previewId;
    }
  } catch (err) {
    log(
      `ADVARSEL: Firestore backup fejlede: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  let autoTranslatePaused = false;
  let autoTranslateRestored = false;
  let priorAT: boolean | null = null;
  if (opts.pauseAutoTranslate !== false) {
    try {
      priorAT = await resolveAutoTranslateEnabled();
      if (priorAT) {
        await setAutoTranslateEnabled(false);
        autoTranslatePaused = true;
      }
    } catch (err) {
      log(
        `Kunne ikke pause auto-translate: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  let writtenCount = 0;
  let stoppedOnError = false;
  let errorMessage: string | undefined;

  try {
    for (let i = 0; i < preview.proposals.length; i++) {
      const p = preview.proposals[i]!;
      if (i > 0 && paceMs > 0) await sleep(paceMs);
      const cmsLocaleId = cmsLocaleFor(p.locale);
      try {
        const live = await fetchFn(p.itemId, cmsLocaleId);
        const liveHash = hashBodyContent(readCmsBody(live.fieldData));
        if (liveHash !== p.contentHashBefore) {
          stoppedOnError = true;
          errorMessage = `Concurrent change for ${p.itemId}:${p.locale} (content hash). Restore from backup.`;
          break;
        }
        if (p.lastUpdated && live.lastUpdated && live.lastUpdated !== p.lastUpdated) {
          stoppedOnError = true;
          errorMessage = `Concurrent change for ${p.itemId}:${p.locale} (lastUpdated). Restore from backup.`;
          break;
        }

        const patch = buildCmsPatchFromContentProposal(p);
        if (!Object.keys(patch).length) continue;

        await patchFn(p.itemId, patch, cmsLocaleId);
        if (isWebflowLocalePublished(live)) {
          await publishFn(p.itemId, cmsLocaleId);
        }

        // Exact readback
        const after = await fetchFn(p.itemId, cmsLocaleId);
        if (p.contentChanged) {
          const got = readCmsBody(after.fieldData);
          if (got !== p.newContent) {
            stoppedOnError = true;
            errorMessage = `Readback mismatch (content) for ${p.itemId}:${p.locale}. Restore from backup.`;
            break;
          }
        }
        if (p.canonicalChanged && p.newCanonical) {
          const got = readCmsCanonical(after.fieldData);
          if (got !== p.newCanonical) {
            stoppedOnError = true;
            errorMessage = `Readback mismatch (canonical) for ${p.itemId}:${p.locale}. Restore from backup.`;
            break;
          }
        }
        if (p.thumbAltChanged && p.newThumbAlt) {
          const thumb = after.fieldData.thumb;
          const got =
            thumb && typeof thumb === 'object'
              ? String((thumb as { alt?: string }).alt || '').trim()
              : '';
          if (got !== p.newThumbAlt) {
            stoppedOnError = true;
            errorMessage = `Readback mismatch (thumb.alt) for ${p.itemId}:${p.locale}. Restore from backup.`;
            break;
          }
        }
        writtenCount += 1;
      } catch (err) {
        stoppedOnError = true;
        errorMessage = err instanceof Error ? err.message : String(err);
        break;
      }
    }

    if (!stoppedOnError) {
      await store.markApplied(preview.previewId, new Date().toISOString());
    }
  } finally {
    if (autoTranslatePaused && priorAT === true) {
      try {
        await setAutoTranslateEnabled(true);
        autoTranslateRestored = true;
      } catch (err) {
        log(
          `ADVARSEL: kunne ikke genaktivere auto-translate: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }
  }

  return {
    previewId: preview.previewId,
    backupPath,
    backupDocId,
    writtenCount,
    stoppedOnError,
    errorMessage,
    autoTranslatePaused,
    autoTranslateRestored,
  };
}
