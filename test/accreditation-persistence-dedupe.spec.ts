import { beforeEach, describe, expect, it } from 'vitest';
import { resetAllAccreditationStoresForTests } from '@/lib/accreditation/persistence/test-reset';
import {
  releaseLease,
  releaseSendLock,
  tryAcquireLease,
  tryClaimSendLock,
  __resetLeasesForTests,
  __resetSendLocksForTests,
} from '@/lib/accreditation/persistence/leases';
import {
  hasProcessedMessageId,
  markProcessedMessageId,
  markProcessedUid,
  hasProcessedUid,
} from '@/lib/accreditation/imap/cursor-store';
import { setApprovalStatus, enqueueApproval } from '@/lib/accreditation/approval-store';
import { createRequest } from '@/lib/accreditation/request-store';
import { draftHash } from '@/lib/accreditation/draft-template';

beforeEach(async () => {
  await resetAllAccreditationStoresForTests();
  __resetLeasesForTests();
  __resetSendLocksForTests();
});

describe('duplicate cron lease', () => {
  it('only one holder acquires the same cron lease', async () => {
    const a = await tryAcquireLease({
      leaseId: 'cron:accreditation-imap-poll',
      holderId: 'worker-a',
      ttlMs: 60_000,
    });
    const b = await tryAcquireLease({
      leaseId: 'cron:accreditation-imap-poll',
      holderId: 'worker-b',
      ttlMs: 60_000,
    });
    expect(a.acquired).toBe(true);
    expect(b.acquired).toBe(false);
    await releaseLease('cron:accreditation-imap-poll', 'worker-a');
    const c = await tryAcquireLease({
      leaseId: 'cron:accreditation-imap-poll',
      holderId: 'worker-b',
      ttlMs: 60_000,
    });
    expect(c.acquired).toBe(true);
  });

  it('same holder can refresh lease', async () => {
    const a = await tryAcquireLease({
      leaseId: 'cron:accreditation-followups',
      holderId: 'same',
      ttlMs: 60_000,
    });
    const b = await tryAcquireLease({
      leaseId: 'cron:accreditation-followups',
      holderId: 'same',
      ttlMs: 60_000,
    });
    expect(a.acquired).toBe(true);
    expect(b.acquired).toBe(true);
  });
});

describe('duplicate inbound IMAP dedupe', () => {
  it('marks message id only once (firstTime)', async () => {
    const mid = '<dup-inbound-1@example.com>';
    expect(await hasProcessedMessageId(mid)).toBe(false);
    const first = await markProcessedMessageId(mid);
    const second = await markProcessedMessageId(mid);
    expect(first.firstTime).toBe(true);
    expect(second.firstTime).toBe(false);
    expect(await hasProcessedMessageId(mid)).toBe(true);
  });

  it('dedupes UID keys independently', async () => {
    const a = await markProcessedUid('liv', 101);
    const b = await markProcessedUid('liv', 101);
    expect(a.firstTime).toBe(true);
    expect(b.firstTime).toBe(false);
    expect(await hasProcessedUid('liv', 101)).toBe(true);
    expect(await hasProcessedUid('liv', 102)).toBe(false);
  });
});

describe('duplicate send lock', () => {
  it('claim send lock only once per approval+hash', async () => {
    const req = await createRequest({ artist: 'Lock Test', id: 'LIV-777' });
    const hash = draftHash('s', 't');
    const item = await enqueueApproval({
      requestId: req.id,
      kind: 'first_outbound',
      to: 'x@y.com',
      subject: 's',
      text: 't',
      draftHash: hash,
      policyFlags: [],
    });
    const lockKey = `send:${item.id}:${hash}`;
    const first = await tryClaimSendLock({ lockKey });
    const second = await tryClaimSendLock({ lockKey });
    expect(first.claimed).toBe(true);
    expect(second.claimed).toBe(false);

    await setApprovalStatus(item.id, 'auto_sent');
    const again = await setApprovalStatus(item.id, 'auto_sent');
    expect(again?.status).toBe('auto_sent');
  });

  it('allows a retry after a confirmed transport failure releases the lock', async () => {
    const lockKey = 'send:approval-failed:hash';
    expect((await tryClaimSendLock({ lockKey })).claimed).toBe(true);
    expect((await tryClaimSendLock({ lockKey })).claimed).toBe(false);
    await releaseSendLock(lockKey);
    expect((await tryClaimSendLock({ lockKey })).claimed).toBe(true);
  });
});
