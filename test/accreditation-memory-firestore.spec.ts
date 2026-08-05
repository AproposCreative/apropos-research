import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __setMemoryBackendForTests,
  getMemoryBackend,
  loadMemoryForReply,
  updateMemoryAfterEvent,
} from '@/lib/accreditation/memory-store';
import { createInMemoryMemoryBackend } from '@/lib/accreditation/memory-json-adapter';
import { createFirestoreMemoryBackend } from '@/lib/accreditation/memory-firestore-adapter';
import {
  isOutreachEligibleArchiveContact,
  syncMailboxContactArchiveToMemory,
} from '@/lib/accreditation/mailbox-archive-sync';
import { parseMailboxArchiveRows } from '@/lib/accreditation/sheet-client';
import {
  filterOutreachCandidates,
  isConsumerEmailAddress,
  isOutreachCandidateForRequest,
  scoreContact,
} from '@/lib/accreditation/research';
import { containsForbiddenDash, sanitizeLivOutput } from '@/lib/accreditation/sanitize';
import { resetAllAccreditationStoresForTests } from '@/lib/accreditation/persistence/test-reset';
import type { AccreditationRequest, SheetContact } from '@/lib/accreditation/types';

vi.mock('@/lib/firebase-admin', () => {
  const store = new Map<string, Record<string, unknown>>();
  function collection(name: string) {
    return {
      doc(id: string) {
        const key = `${name}/${id}`;
        return {
          async get() {
            const data = store.get(key);
            return {
              exists: Boolean(data),
              id,
              data: () => data,
            };
          },
          async set(payload: Record<string, unknown>, _opts?: { merge?: boolean }) {
            const prev = store.get(key) || {};
            store.set(key, { ...prev, ...payload });
          },
        };
      },
      async get() {
        const docs = [...store.entries()]
          .filter(([k]) => k.startsWith(`${name}/`))
          .map(([k, data]) => ({
            id: k.slice(name.length + 1),
            data: () => data,
          }));
        return { docs, size: docs.length };
      },
      limit(_n: number) {
        return {
          async get() {
            const docs = [...store.entries()]
              .filter(([k]) => k.startsWith(`${name}/`))
              .slice(0, _n)
              .map(([k, data]) => ({
                id: k.slice(name.length + 1),
                data: () => data,
              }));
            return { docs, size: docs.length };
          },
        };
      },
    };
  }
  return {
    getAdminDb: () => ({ collection }),
    __firestoreMockStore: store,
  };
});

vi.mock('@/lib/accreditation/sheet-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/accreditation/sheet-client')>();
  return {
    ...actual,
    pullMailboxContactArchive: vi.fn(async () => [
      {
        email: 'presse@venue.dk',
        name: 'Press Desk',
        company: 'Venue',
        category: 'role',
        relationship: 'established two-way',
        sourceMailbox: 'liv@aproposmagazine.com',
        messageCount: 4,
        hasReply: true,
        recentSubject: 'Re: Akkreditering',
        isAutomated: false,
        raw: {},
        rowNumber: 2,
      },
      {
        email: 'noreply@tickets.example',
        name: 'Ticket System',
        category: 'automated',
        isAutomated: true,
        messageCount: 12,
        raw: { type: 'noreply' },
        rowNumber: 3,
      },
      {
        email: 'booking@label.com',
        name: 'Booking',
        category: 'human',
        relationship: 'one-way',
        messageCount: 1,
        isAutomated: false,
        raw: {},
        rowNumber: 4,
      },
      {
        name: 'No Email Row',
        isAutomated: false,
        raw: {},
        rowNumber: 5,
      },
    ]),
  };
});

const sampleRequest: AccreditationRequest = {
  id: 'LIV-500',
  artist: 'Test Artist',
  venue: 'Venue',
  applicants: [{ name: 'Writer' }],
  accessRequested: 'presse',
  senderMailbox: 'liv@aproposmagazine.com',
  status: 'researching',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

beforeEach(async () => {
  await resetAllAccreditationStoresForTests();
  const mem = createInMemoryMemoryBackend();
  __setMemoryBackendForTests('memory', mem);
  await mem.resetForTests?.();
});

afterEach(() => {
  __setMemoryBackendForTests(null);
  vi.clearAllMocks();
});

describe('Firestore adapter via mocks', () => {
  it('upserts by deterministic email id and loads compact memory', async () => {
    __setMemoryBackendForTests('firestore', createFirestoreMemoryBackend());
    const backend = getMemoryBackend();
    await backend.upsertContactProfile({
      email: 'Promoter@Example.COM',
      name: 'Promoter',
      category: 'human',
      relationshipStatus: 'one_way',
      recentSubject: 'Presseakkreditering — test',
      preserveInteractionCount: true,
      interactionCount: 2,
    });
    const profile = await backend.getContactProfile('promoter@example.com');
    expect(profile?.email).toBe('promoter@example.com');
    expect(profile?.name).toBe('Promoter');
    expect(profile?.interactionCount).toBe(2);
    expect(containsForbiddenDash(profile?.recentSubjects.join(' ') || '')).toBe(false);

    await updateMemoryAfterEvent({
      requestId: 'LIV-501',
      contactEmail: 'promoter@example.com',
      direction: 'inbound',
      blurb: 'Godkendt',
      subject: 'Re: Presse',
    });
    const block = await loadMemoryForReply({
      requestId: 'LIV-501',
      contactEmail: 'promoter@example.com',
    });
    expect(block).toContain('Kontaktprofil');
    expect(block).toContain('Samtale-resume');
    expect(block).not.toMatch(/password|imap/i);
    expect(containsForbiddenDash(block)).toBe(false);
  });

  it('fails visibly when Firestore Admin is null', async () => {
    const firebase = await import('@/lib/firebase-admin');
    const spy = vi.spyOn(firebase, 'getAdminDb').mockReturnValue(null);
    __setMemoryBackendForTests('firestore', createFirestoreMemoryBackend());
    await expect(
      getMemoryBackend().upsertContactProfile({ email: 'a@b.com', name: 'A' })
    ).rejects.toThrow(/Firestore unavailable/i);
    spy.mockRestore();
  });
});

describe('mailbox archive parse + sync', () => {
  it('parses archive headers flexibly', () => {
    const rows = parseMailboxArchiveRows([
      ['Email', 'Name', 'Category', 'Relationship', 'Source mailbox', 'Message count', 'Recent subject'],
      ['human@x.com', 'Human', 'human', 'established two-way', 'liv@aproposmagazine.com', '3', 'Emne'],
      ['noreply@x.com', 'Bot', 'automated', '', 'liv@aproposmagazine.com', '9', 'Receipt'],
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].email).toBe('human@x.com');
    expect(rows[0].hasReply).toBe(true);
    expect(rows[1].isAutomated).toBe(true);
  });

  it('imports idempotently and skips rows without email', async () => {
    const first = await syncMailboxContactArchiveToMemory();
    expect(first.ok).toBe(true);
    expect(first.totalRows).toBe(4);
    expect(first.imported).toBe(3);
    expect(first.upserted).toBe(0);
    expect(first.skipped).toBe(1);
    expect(first.automatedCount).toBe(1);
    expect(first.humanOrRoleCount).toBe(2);

    const second = await syncMailboxContactArchiveToMemory();
    expect(second.ok).toBe(true);
    expect(second.imported).toBe(0);
    expect(second.upserted).toBe(3);
    expect(second.skipped).toBe(1);
  });

  it('marks automated archive contacts as not outreach-eligible', () => {
    expect(
      isOutreachEligibleArchiveContact({
        email: 'noreply@tickets.example',
        name: 'Ticket System',
        isAutomated: true,
        raw: {},
        rowNumber: 1,
      })
    ).toBe(false);
    expect(
      isOutreachEligibleArchiveContact({
        email: 'presse@venue.dk',
        name: 'Press',
        isAutomated: false,
        hasReply: true,
        raw: {},
        rowNumber: 2,
      })
    ).toBe(true);
  });
});

describe('research outreach priority + exclusion', () => {
  it('never treats an unrelated writer or private mailbox as a press contact', () => {
    const writer: SheetContact = {
      name: 'Mathilde Sigshøj',
      company: 'live.dk',
      email: 'mathilde.sigshoj@live.dk',
      category: 'human',
      establishedTwoWay: true,
      messageCount: 12,
      raw: {},
    };
    const internalWriter: SheetContact = {
      name: 'Writer',
      email: sampleRequest.applicants[0]?.email,
      category: 'human',
      raw: { role: 'skribent' },
    };

    expect(isConsumerEmailAddress(writer.email)).toBe(true);
    expect(isOutreachCandidateForRequest(writer, sampleRequest)).toBe(false);
    expect(isOutreachCandidateForRequest(internalWriter, sampleRequest)).toBe(false);
    expect(scoreContact(writer, sampleRequest)).toBeLessThan(0);
    expect(filterOutreachCandidates([writer, internalWriter], sampleRequest)).toEqual([]);
  });

  it('excludes automated senders and prioritizes established two-way', () => {
    const contacts: SheetContact[] = [
      {
        name: 'Bot',
        email: 'noreply@x.com',
        category: 'automated',
        isAutomated: true,
        raw: {},
      },
      {
        name: 'New PR',
        email: 'new@label.com',
        category: 'human',
        messageCount: 1,
        raw: { venue: 'Venue' },
      },
      {
        name: 'Known Press',
        email: 'presse@venue.dk',
        category: 'role',
        establishedTwoWay: true,
        messageCount: 5,
        raw: { venue: 'Venue' },
      },
    ];
    const eligible = filterOutreachCandidates(contacts);
    expect(eligible.every((c) => !c.isAutomated)).toBe(true);
    expect(eligible).toHaveLength(2);

    const ranked = eligible
      .map((c) => ({ c, score: scoreContact(c, sampleRequest) }))
      .sort((a, b) => b.score - a.score);
    expect(ranked[0].c.email).toBe('presse@venue.dk');
    expect(scoreContact(contacts[0], sampleRequest)).toBeLessThan(0);
  });

  it('does not trust an unrelated established business contact for a known promoter', () => {
    const liveNationRequest: AccreditationRequest = {
      ...sampleRequest,
      artist: 'Masego',
      venue: 'K.B. Hallen',
      promoter: 'Live Nation',
    };
    const unrelatedVenueContact: SheetContact = {
      name: 'Nanna',
      company: 'ÅBEN Bryg',
      email: 'nanna@aabenbryg.dk',
      category: 'human',
      establishedTwoWay: true,
      messageCount: 9,
      raw: { oldSubject: 'Arrangement ved K.B. Hallen' },
    };
    const promoterPress: SheetContact = {
      name: 'Press Desk',
      company: 'Live Nation',
      email: 'presse@livenation.dk',
      category: 'role',
      establishedTwoWay: true,
      messageCount: 4,
      raw: { role: 'presseakkreditering' },
    };

    expect(isOutreachCandidateForRequest(unrelatedVenueContact, liveNationRequest)).toBe(false);
    expect(scoreContact(unrelatedVenueContact, liveNationRequest)).toBeLessThan(0);
    expect(isOutreachCandidateForRequest(promoterPress, liveNationRequest)).toBe(true);
    expect(scoreContact(promoterPress, liveNationRequest)).toBeGreaterThan(0);
  });
});

describe('memory injection + em dash ban', () => {
  it('loads profile + summary for reply prompts and sanitizes output', async () => {
    await updateMemoryAfterEvent({
      requestId: 'LIV-200',
      threadId: 't-mem',
      contactEmail: 'promoter@example.com',
      contactName: 'Promoter',
      direction: 'outbound',
      blurb: 'Sendte akkrediteringsanmodning [LIV-200]',
      subject: 'Presse — test',
    });
    await updateMemoryAfterEvent({
      requestId: 'LIV-200',
      threadId: 't-mem',
      contactEmail: 'promoter@example.com',
      direction: 'inbound',
      blurb: 'Svarede med godkendelse',
    });

    const block = await loadMemoryForReply({
      requestId: 'LIV-200',
      contactEmail: 'promoter@example.com',
    });
    expect(block).toContain('Kontaktprofil');
    expect(block).toContain('promoter@example.com');
    expect(block).toContain('Samtale-resume');
    expect(block).toContain('Ud:');
    expect(block).toContain('Ind:');
    expect(block).toContain('established_two_way');
    expect(sanitizeLivOutput('Hej — dig')).not.toMatch(/\u2014/);
    expect(containsForbiddenDash(block)).toBe(false);
  });
});
