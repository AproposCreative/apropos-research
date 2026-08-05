/**
 * Reset all in-memory accreditation stores between tests.
 * Side-effect imports ensure every store registers its __resetForTests hook.
 */
import { __setAccreditationPersistenceKindForTests } from '@/lib/accreditation/persistence/env';
import { __resetLeasesForTests, __resetSendLocksForTests } from '@/lib/accreditation/persistence/leases';
import { listAccreditationStoreResets } from '@/lib/accreditation/persistence/reset-registry';

import '@/lib/accreditation/agent-control';
import '@/lib/accreditation/request-store';
import '@/lib/accreditation/approval-store';
import '@/lib/accreditation/email-thread-store';
import '@/lib/accreditation/audit-store';
import '@/lib/accreditation/ids';
import '@/lib/accreditation/imap/cursor-store';
import '@/lib/accreditation/attachments';
import '@/lib/accreditation/liv-chat';
import '@/lib/accreditation/imap/contact-overview-store';

export { registerAccreditationStoreReset } from '@/lib/accreditation/persistence/reset-registry';

export async function resetAllAccreditationStoresForTests(): Promise<void> {
  __setAccreditationPersistenceKindForTests('memory');
  __resetLeasesForTests();
  __resetSendLocksForTests();
  for (const s of listAccreditationStoreResets()) {
    await s.__resetForTests?.();
  }
}
