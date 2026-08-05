/**
 * One-time / ops: sync Mailbox contact archive → Firestore memory.
 *
 *   ACCREDITATION_MEMORY_BACKEND=firestore npx tsx scripts/accreditation-sync-mailbox-archive.ts
 *
 * Does not print or commit raw mailbox rows.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

process.env.ACCREDITATION_MEMORY_BACKEND = 'firestore';

async function main() {
  const { __setMemoryBackendForTests } = await import('../lib/accreditation/memory-store');
  const { createFirestoreMemoryBackend } = await import(
    '../lib/accreditation/memory-firestore-adapter'
  );
  const { syncMailboxContactArchiveToMemory } = await import(
    '../lib/accreditation/mailbox-archive-sync'
  );
  const { getAdminDb } = await import('../lib/firebase-admin');

  if (!getAdminDb()) {
    console.error('Firebase Admin unavailable — refusing sync (no durable store).');
    process.exit(2);
  }

  __setMemoryBackendForTests('firestore', createFirestoreMemoryBackend());
  const result = await syncMailboxContactArchiveToMemory();
  if (!result.ok) {
    console.error('Sync failed:', result.error);
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        totalRows: result.totalRows,
        imported: result.imported,
        upserted: result.upserted,
        skipped: result.skipped,
        automatedCount: result.automatedCount,
        humanOrRoleCount: result.humanOrRoleCount,
        contactCount: result.contactCount,
        lastSyncAt: result.lastSyncAt,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
