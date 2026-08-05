import { beforeEach, describe, expect, it } from 'vitest';
import { resetAllAccreditationStoresForTests } from '@/lib/accreditation/persistence/test-reset';
import { ACCREDITATION_STATS } from '@/lib/accreditation/draft-template';
import {
  APPROVED_KNOWN_ARTICLE_LINKS,
  DIALOGUE_CORRECTION_TOKEN,
  DIALOGUE_INBOUND_TURNS,
} from '@/lib/accreditation/dialogue-scenario';
import { LIV_MAILBOX } from '@/lib/accreditation/types';
import {
  createMockedDialogueGenerator,
  runMultiTurnLivDialogue,
} from '@/lib/accreditation/multi-turn-dialogue';
import { getConversationSummary, getContactProfile } from '@/lib/accreditation/memory-store';
import { containsForbiddenDash } from '@/lib/accreditation/sanitize';
import { getAccreditationReplyTo, getAccreditationFromEmail } from '@/lib/accreditation/send-email';

beforeEach(async () => {
  await resetAllAccreditationStoresForTests();
  delete process.env.ACCREDITATION_INBOUND_DOMAIN;
  process.env.ACCREDITATION_MAIL_TRANSPORT = 'smtp';
});

describe('acceptance: multi-turn Liv external dialogue', () => {
  it('covers 3 inbound + 3 replies with memory, facts discipline, Reply-To, request id, no em dash', async () => {
    const result = await runMultiTurnLivDialogue({
      generator: createMockedDialogueGenerator(),
      forceReplyToFallback: true,
    });

    expect(result.outbounds).toHaveLength(3);
    expect(DIALOGUE_INBOUND_TURNS).toHaveLength(3);
    expect(result.assertions.ok).toBe(true);
    if (!result.assertions.ok) {
      // Surface failures clearly in vitest output
      expect(result.assertions.failures).toEqual([]);
    }

    // SMTP root sender identity
    expect(getAccreditationFromEmail()).toBe(`Liv Brandt <${LIV_MAILBOX}>`);

    // Reply-To routes to liv@aproposmagazine.com (fallback, no inbound domain)
    expect(result.replyTo).toBe(LIV_MAILBOX);
    expect(getAccreditationReplyTo(result.threadId)).toBe(LIV_MAILBOX);

    // Memory persisted across turns
    const profile = await getContactProfile('presse@fixture-venue.example');
    expect(profile).toBeTruthy();
    expect(profile!.interactionCount).toBeGreaterThanOrEqual(3);
    const summary = await getConversationSummary(result.requestId);
    expect(summary?.summary).toBeTruthy();
    expect(summary!.summary.length).toBeGreaterThan(40);

    // Turn 2 memory must be non-empty (loaded prior context)
    expect(result.outbounds[1]!.memoryLoaded).toMatch(/Kontaktprofil|Samtale-resume|Ud:|Ind:/);

    // Deterministic figures + allowlisted article
    expect(result.outbounds[0]!.text).toContain(ACCREDITATION_STATS.uniqueWebUsersPerMonth);
    expect(result.outbounds[0]!.text).toContain(ACCREDITATION_STATS.crossChannelPerMonth);
    expect(result.outbounds[0]!.text).toContain(APPROVED_KNOWN_ARTICLE_LINKS[0]);

    // Novel question turn
    expect(result.outbounds[1]!.novelQuestion).toBe(true);
    expect(result.outbounds[1]!.text).toMatch(/check|tjekker|confirm|præcisere|hvem|which writer/i);

    // Correction remembered
    expect(result.outbounds[2]!.text).toContain(DIALOGUE_CORRECTION_TOKEN);

    for (const out of result.outbounds) {
      expect(out.subject).toMatch(/\[LIV-880\]/);
      expect(containsForbiddenDash(out.text)).toBe(false);
      expect(containsForbiddenDash(out.subject)).toBe(false);
      expect(out.replyTo).toBe(LIV_MAILBOX);
    }

    // Public transcript shape (no private mailbox dump)
    expect(result.publicTranscript.length).toBe(6);
    for (const row of result.publicTranscript) {
      expect(row.preview).not.toMatch(/password|imap/i);
    }
  });
});
