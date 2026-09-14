import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '../lib/firebase-admin';
import { qualityPriorityReadyAt } from '../lib/seo-engine/post-publish/priority';
import { loadProductionEnv } from './liv-production-access';

/** Explicit service migration: derived scheduling metadata only, no model/CMS calls.
 * Transactionally re-read each row to avoid overwriting concurrent worker changes.
 * Repeating the script is safe; completed records need no write.
 */
async function main() {
  await loadProductionEnv(['FIREBASE_ADMIN_PROJECT_ID', 'FIREBASE_ADMIN_CLIENT_EMAIL', 'FIREBASE_ADMIN_PRIVATE_KEY']);
  const db = getAdminDb(); if (!db) throw new Error('database_unavailable');
  const collection = db.collection('seoPostPublishJobs');
  let cursor: string | undefined, inspected = 0, updated = 0;
  for (let page = 0; page < 30; page++) {
    let query = collection.orderBy(FieldPath.documentId()).limit(100);
    if (cursor) query = query.startAfter(cursor);
    const rows = await query.get();
    for (const row of rows.docs) {
      const changed = await db.runTransaction(async tx => {
        const current = await tx.get(row.ref); if (!current.exists) return false;
        const data = current.data()!;
        const priority = qualityPriorityReadyAt(data);
        if ((priority === null && data.priorityReadyAt === undefined) || priority === data.priorityReadyAt) return false;
        tx.update(row.ref, { priorityReadyAt: priority ?? FieldValue.delete() });
        return true;
      });
      inspected++; if (changed) updated++;
    }
    console.log(JSON.stringify({ page: page + 1, inspected, updated, done: rows.size < 100 }));
    if (rows.size < 100) return;
    cursor = rows.docs.at(-1)!.id;
  }
  throw new Error('migration_page_bound_reached');
}
main().then(() => process.exit(0)).catch(() => { console.error('priority_migration_incomplete'); process.exit(1); });
