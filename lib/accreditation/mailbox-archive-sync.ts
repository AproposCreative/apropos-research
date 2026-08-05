import {
  classifyCategory,
  emailDomain,
  isAutomatedSenderHeuristic,
  normalizeContactEmail,
  sanitizeSubjectLine,
  type ContactCategory,
  type ContactRelationshipStatus,
} from '@/lib/accreditation/memory-types';
import { getMemoryBackend } from '@/lib/accreditation/memory-store';
import { pullMailboxContactArchive } from '@/lib/accreditation/sheet-client';
import type { MailboxArchiveContact } from '@/lib/accreditation/types';

export type MailboxArchiveSyncResult = {
  ok: boolean;
  totalRows: number;
  imported: number;
  upserted: number;
  skipped: number;
  automatedCount: number;
  humanOrRoleCount: number;
  contactCount: number;
  lastSyncAt: string;
  error?: string;
};

function mapArchiveRow(row: MailboxArchiveContact): {
  email: string;
  name?: string;
  companyHint?: string;
  domain?: string;
  roleHint?: string;
  category: ContactCategory;
  relationshipStatus: ContactRelationshipStatus;
  sourceMailbox?: string;
  recentSubject?: string;
  interactionCount: number;
  firstSeenAt?: string;
  lastSeenAt?: string;
  notes?: string;
} | null {
  const email = row.email ? normalizeContactEmail(row.email) : '';
  if (!email.includes('@')) return null;

  const automated =
    row.isAutomated === true ||
    isAutomatedSenderHeuristic({
      email,
      name: row.name,
      category: row.category,
      role: row.role,
      rawText: Object.values(row.raw).join(' '),
    });

  const category: ContactCategory = automated
    ? 'automated'
    : classifyCategory({
        email,
        name: row.name,
        category: row.category,
        role: row.role,
      });

  let relationshipStatus: ContactRelationshipStatus = 'unknown';
  if (automated) relationshipStatus = 'automated';
  else if (row.relationship && /two|2-way|established|dialog|svar/i.test(row.relationship)) {
    relationshipStatus = 'established_two_way';
  } else if (row.relationship && /one|1-way|outbound/i.test(row.relationship)) {
    relationshipStatus = 'one_way';
  } else if ((row.messageCount || 0) >= 2 || row.hasReply) {
    relationshipStatus = 'established_two_way';
  } else if ((row.messageCount || 0) === 1) {
    relationshipStatus = 'one_way';
  }

  return {
    email,
    name: row.name || undefined,
    companyHint: row.company || undefined,
    domain: row.domain || emailDomain(email),
    roleHint: row.role || undefined,
    category,
    relationshipStatus,
    sourceMailbox: row.sourceMailbox || undefined,
    recentSubject: row.recentSubject ? sanitizeSubjectLine(row.recentSubject) : undefined,
    interactionCount: Math.max(0, row.messageCount || 0),
    firstSeenAt: row.firstSeenAt || undefined,
    lastSeenAt: row.lastSeenAt || undefined,
    notes: row.notes?.slice(0, 400),
  };
}

/**
 * Idempotent import of Mailbox contact archive → memory backend (Firestore in prod).
 * Skips rows without email; upserts by deterministic email doc id.
 */
export async function syncMailboxContactArchiveToMemory(opts?: {
  dryRun?: boolean;
}): Promise<MailboxArchiveSyncResult> {
  const lastSyncAt = new Date().toISOString();
  try {
    const rows = await pullMailboxContactArchive();
    let imported = 0;
    let upserted = 0;
    let skipped = 0;
    let automatedCount = 0;
    let humanOrRoleCount = 0;

    const backend = getMemoryBackend();

    for (const row of rows) {
      const mapped = mapArchiveRow(row);
      if (!mapped) {
        skipped++;
        continue;
      }
      if (mapped.category === 'automated') automatedCount++;
      else humanOrRoleCount++;

      if (opts?.dryRun) {
        imported++;
        continue;
      }

      const existing = await backend.getContactProfile(mapped.email);
      await backend.upsertContactProfile({
        email: mapped.email,
        name: mapped.name,
        companyHint: mapped.companyHint,
        domain: mapped.domain,
        roleHint: mapped.roleHint,
        category: mapped.category,
        relationshipStatus: mapped.relationshipStatus,
        sourceMailbox: mapped.sourceMailbox,
        recentSubject: mapped.recentSubject,
        notes: mapped.notes,
        importSource: 'mailbox_contact_archive',
        preserveInteractionCount: true,
        interactionCount: Math.max(
          mapped.interactionCount,
          existing?.interactionCount || 0
        ),
        firstSeenAt: mapped.firstSeenAt || existing?.firstSeenAt,
        lastSeenAt: mapped.lastSeenAt || existing?.lastSeenAt,
      });
      if (existing) upserted++;
      else imported++;
    }

    const contactCount = opts?.dryRun
      ? imported
      : (await backend.listContactProfiles()).length;

    if (!opts?.dryRun) {
      await backend.setSyncMeta({
        lastSyncAt,
        contactCount,
        imported,
        upserted,
        skipped,
        automatedCount,
        humanOrRoleCount,
      });
    }

    return {
      ok: true,
      totalRows: rows.length,
      imported,
      upserted,
      skipped,
      automatedCount,
      humanOrRoleCount,
      contactCount,
      lastSyncAt,
    };
  } catch (e) {
    return {
      ok: false,
      totalRows: 0,
      imported: 0,
      upserted: 0,
      skipped: 0,
      automatedCount: 0,
      humanOrRoleCount: 0,
      contactCount: 0,
      lastSyncAt,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Pure helper for tests — classify whether an archive row is outreach-eligible. */
export function isOutreachEligibleArchiveContact(row: MailboxArchiveContact): boolean {
  const mapped = mapArchiveRow(row);
  if (!mapped) return false;
  return mapped.category !== 'automated' && mapped.relationshipStatus !== 'do_not_contact';
}
