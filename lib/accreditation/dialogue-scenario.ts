import {
  ACCREDITATION_STATS,
  APROPOS_INSTAGRAM_URL,
  APROPOS_SITE_URL,
} from '@/lib/accreditation/draft-template';
import { LIV_MAILBOX } from '@/lib/accreditation/types';
import { containsForbiddenDash } from '@/lib/accreditation/sanitize';

/**
 * Deterministic approved facts for multi-turn Liv dialogue acceptance.
 * Never invent beyond this allowlist in mocked generators or assertions.
 */
export const APPROVED_KNOWN_ARTICLE_LINKS = [
  'https://www.aproposmagazine.com/lucky-apple-tv-anmeldelse',
  'https://www.aproposmagazine.com',
] as const;

export const DIALOGUE_REQUEST_ID = 'LIV-880';
export const DIALOGUE_THREAD_ID = 'thread-dialogue-880';
export const DIALOGUE_PROMOTER_EMAIL = 'presse@fixture-venue.example';
export const DIALOGUE_PROMOTER_NAME = 'Alex Promoter';
/** Correction the contact introduces in turn 3 — Liv must remember this. */
export const DIALOGUE_CORRECTION_TOKEN = 'Sofie Holm';
export const DIALOGUE_WRONG_NAME = 'Anna Berg';

export type DialogueInboundTurn = {
  id: string;
  subject: string;
  text: string;
  /** Expect Liv to flag novelQuestion on this turn. */
  expectNovel?: boolean;
  /** Contact correction Liv must remember later. */
  introducesCorrection?: boolean;
};

/** Three inbound turns: coverage/stats → novel writer Q → correction. */
export const DIALOGUE_INBOUND_TURNS: DialogueInboundTurn[] = [
  {
    id: 'turn1_articles_readership',
    subject: `Re: Presseakkreditering [${DIALOGUE_REQUEST_ID}]`,
    text: [
      'Hi Liv,',
      '',
      'Thanks for reaching out about the show.',
      'Can you share links to previous concert articles Apropos has published,',
      'and your documented monthly readership figures?',
      '',
      'Best,',
      DIALOGUE_PROMOTER_NAME,
    ].join('\n'),
  },
  {
    id: 'turn2_coverage_writer_novel',
    subject: `Re: Presseakkreditering [${DIALOGUE_REQUEST_ID}]`,
    text: [
      'Also - what coverage are you planning, and which writer will attend?',
      'We need the exact byline before we can approve.',
      '',
      DIALOGUE_PROMOTER_NAME,
    ].join('\n'),
    expectNovel: true,
  },
  {
    id: 'turn3_correction',
    subject: `Fwd: Presseakkreditering [${DIALOGUE_REQUEST_ID}]`,
    text: [
      'Quick correction: the applicant/writer is not',
      `${DIALOGUE_WRONG_NAME} - it is ${DIALOGUE_CORRECTION_TOKEN} who will file the review.`,
      'Please confirm you have that name.',
      '',
      DIALOGUE_PROMOTER_NAME,
    ].join('\n'),
    introducesCorrection: true,
  },
];

export type DialogueOutboundTurn = {
  turnId: string;
  subject: string;
  text: string;
  replyTo: string;
  novelQuestion: boolean;
  memoryLoaded: string;
  aiSummary: string;
};

export type DialogueAssertionResult = {
  ok: boolean;
  failures: string[];
};

/** Shared transcript assertions for mocked + smoke runs (no mailbox secrets). */
export function assertDialogueTranscript(params: {
  requestId: string;
  outbounds: DialogueOutboundTurn[];
  inbounds: DialogueInboundTurn[];
}): DialogueAssertionResult {
  const failures: string[] = [];
  const { requestId, outbounds, inbounds } = params;

  if (inbounds.length < 3) failures.push('Need at least 3 inbound turns');
  if (outbounds.length < 3) failures.push('Need at least 3 Liv replies');

  const marker = `[${requestId.toUpperCase()}]`;
  for (const [i, out] of outbounds.entries()) {
    if (!out.subject.includes(marker)) {
      failures.push(`Outbound ${i + 1} subject missing ${marker}: ${out.subject}`);
    }
    const idHits = out.subject.match(/\[LIV-(?:HIST-)?\d+\]/gi) || [];
    if (idHits.length !== 1) {
      failures.push(`Outbound ${i + 1} must contain request id exactly once (got ${idHits.length})`);
    }
    if (out.replyTo.toLowerCase() !== LIV_MAILBOX) {
      failures.push(`Outbound ${i + 1} Reply-To must be ${LIV_MAILBOX}, got ${out.replyTo}`);
    }
    if (containsForbiddenDash(out.text) || containsForbiddenDash(out.subject)) {
      failures.push(`Outbound ${i + 1} contains forbidden em/en dash`);
    }
    if (i > 0 && !out.memoryLoaded.trim()) {
      failures.push(`Outbound ${i + 1} must load contact/thread memory between turns`);
    }
  }

  // Turn 1: approved stats + only allowlisted article links if any URL present
  const t1 = outbounds[0]?.text || '';
  const hasUnique =
    t1.includes(ACCREDITATION_STATS.uniqueWebUsersPerMonth) || /1[.,]700/.test(t1);
  const hasCross =
    t1.includes(ACCREDITATION_STATS.crossChannelPerMonth) || /20[.,]000/.test(t1);
  if (!hasUnique) {
    failures.push('Turn 1 must cite approved uniqueWebUsersPerMonth figure (1.700 / 1,700)');
  }
  if (!hasCross) {
    failures.push('Turn 1 must cite approved crossChannelPerMonth figure (20.000 / 20,000)');
  }
  const urls = t1.match(/https?:\/\/[^\s)>\]]+/gi) || [];
  for (const u of urls) {
    const clean = u.replace(/[.,;]+$/, '');
    const allowed =
      APPROVED_KNOWN_ARTICLE_LINKS.some((a) => clean.startsWith(a)) ||
      clean.startsWith(APROPOS_SITE_URL) ||
      clean.startsWith(APROPOS_INSTAGRAM_URL);
    if (!allowed) {
      failures.push(`Turn 1 uses non-allowlisted URL: ${clean}`);
    }
  }

  // Invented analytics / commitments heuristics
  for (const [i, out] of outbounds.entries()) {
    if (/million|mio\.?|guaranteed coverage|I can confirm we will publish/i.test(out.text)) {
      failures.push(`Outbound ${i + 1} invents analytics or commitments`);
    }
    if (/\b\d{2,3}\s*%\s*(growth|increase|CTR|open rate)/i.test(out.text)) {
      failures.push(`Outbound ${i + 1} invents analytics percentages`);
    }
  }

  // Novel question turn — must not invent a specific attending writer/byline
  const novelIdx = inbounds.findIndex((t) => t.expectNovel);
  if (novelIdx >= 0) {
    const out = outbounds[novelIdx];
    const inventsByline =
      /\b(writer assigned|the writer (is|will be|attending)|skribenten er|byline is)\b/i.test(
        out?.text || ''
      ) && !/check|tjekker|confirm|præcisere|could you|kan du/i.test(out?.text || '');
    if (inventsByline) {
      failures.push('Novel turn must not invent which writer will attend');
    }
    const hedges =
      /jeg tjekker|jeg vender tilbage|kan du præcisere|which writer|hvem (kommer|deltager)|I'll check|let me check|could you confirm|before I confirm|before confirming/i.test(
        out?.text || ''
      );
    if (!out?.novelQuestion && !hedges) {
      failures.push(
        'Novel/ambiguous writer question must set novelQuestion=true or ask/check precisely'
      );
    }
    if (!hedges) {
      failures.push(
        'Novel turn reply must check/ask a precise question rather than inventing the writer'
      );
    }
  }

  // Correction remembered in final reply
  const final = outbounds[outbounds.length - 1]?.text || '';
  if (!final.includes(DIALOGUE_CORRECTION_TOKEN)) {
    failures.push(`Final reply must remember correction token "${DIALOGUE_CORRECTION_TOKEN}"`);
  }
  if (final.includes(DIALOGUE_WRONG_NAME) && !final.includes(DIALOGUE_CORRECTION_TOKEN)) {
    failures.push('Final reply must not stick with the corrected-away wrong name');
  }

  return { ok: failures.length === 0, failures };
}

/** Deterministic mock generator for acceptance (no LLM). */
export function buildMockedDialogueReplies(): Array<{
  summary: string;
  suggestedReply: string;
  novelQuestion: boolean;
}> {
  const article = APPROVED_KNOWN_ARTICLE_LINKS[0];
  return [
    {
      summary: 'Promotor spurgte om tidligere artikler og læsertal.',
      suggestedReply: [
        'Hi Alex,',
        '',
        `For documented reach we use our approved figures: around ${ACCREDITATION_STATS.uniqueWebUsersPerMonth} unique web users per month and over ${ACCREDITATION_STATS.crossChannelPerMonth} across web and social.`,
        `A known published piece you can reference: ${article}`,
        `Instagram: ${APROPOS_INSTAGRAM_URL}`,
        '',
        'Happy to share more once we align on the accreditation details.',
        '',
        'Best,',
        'Liv Brandt',
      ].join('\n'),
      novelQuestion: false,
    },
    {
      summary: 'Promotor spurgte om planlagt dækning og hvilken skribent der kommer (uvant).',
      suggestedReply: [
        'Hi Alex,',
        '',
        'I will check internally who is available for this date before I confirm a byline.',
        'Could you confirm whether you need a named writer now, or if a role (reviewer/photographer) is enough for approval?',
        'I will not invent a writer name.',
        '',
        'Best,',
        'Liv Brandt',
      ].join('\n'),
      novelQuestion: true,
    },
    {
      summary: `Korrektion: skribent er ${DIALOGUE_CORRECTION_TOKEN} (ikke ${DIALOGUE_WRONG_NAME}).`,
      suggestedReply: [
        'Hi Alex,',
        '',
        `Thanks for the correction - I have noted that ${DIALOGUE_CORRECTION_TOKEN} is the writer who will file the review (not ${DIALOGUE_WRONG_NAME}).`,
        'I will keep that name on the request going forward.',
        '',
        'Best,',
        'Liv Brandt',
      ].join('\n'),
      novelQuestion: false,
    },
  ];
}
