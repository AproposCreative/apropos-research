/**
 * Hard inbound gates that do not depend on the LLM.
 * Invitation/access offers never get a "yes"; brand-impersonation never gets a reply.
 */
import type { LivInboxDecision, LivInboxSettings } from '@/lib/liv-inbox/types';
import { sanitizeLivOutput } from '@/lib/accreditation/sanitize';

export type GuardedInbound = {
  fromEmail: string;
  fromName?: string;
  subject: string;
  body: string;
};

type Brand = { labels: string[]; domains: string[] };

const TRUSTED_BRANDS: Brand[] = [
  {
    labels: ['meta', 'facebook', 'instagram', 'whatsapp', 'threads'],
    domains: [
      'meta.com',
      'facebook.com',
      'facebookmail.com',
      'fb.com',
      'instagram.com',
      'whatsapp.com',
      'threads.net',
    ],
  },
  { labels: ['google', 'gmail', 'youtube'], domains: ['google.com', 'gmail.com', 'googlemail.com', 'youtube.com'] },
  { labels: ['apple', 'icloud'], domains: ['apple.com', 'icloud.com'] },
  { labels: ['microsoft', 'outlook', 'hotmail', 'linkedin'], domains: ['microsoft.com', 'outlook.com', 'linkedin.com'] },
  { labels: ['paypal'], domains: ['paypal.com'] },
  { labels: ['amazon'], domains: ['amazon.com', 'amazon.dk'] },
];

const CONSUMER_MAIL = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'yahoo.com',
  'yahoo.dk',
  'icloud.com',
  'proton.me',
  'protonmail.com',
  'mail.com',
]);

function emailDomain(email: string): string {
  const at = email.trim().toLowerCase().lastIndexOf('@');
  return at >= 0 ? email.trim().toLowerCase().slice(at + 1) : '';
}

function domainMatches(fromDomain: string, allowed: string[]): boolean {
  return allowed.some((d) => fromDomain === d || fromDomain.endsWith(`.${d}`));
}

function displayNameClaimsBrand(fromName: string, label: string): boolean {
  const name = fromName.toLowerCase().trim();
  if (!name) return false;
  if (name === label) return true;
  if (name.startsWith(`${label}:`) || name.startsWith(`${label} `) || name.startsWith(`[${label}`)) return true;
  // "Meta Business Suite", "Facebook Security", "Instagram Support"
  return new RegExp(`(?:^|\\b)${label}\\b(?:\\s|:)`, 'i').test(name.split(/[|<]/)[0] || name);
}

/** Display name pretends to be Meta/Google/etc., but the mailbox is not on their domain. */
export function isLikelyBrandImpersonation(input: Pick<GuardedInbound, 'fromEmail' | 'fromName' | 'subject' | 'body'>): boolean {
  const fromDomain = emailDomain(input.fromEmail || '');
  if (!fromDomain) return false;
  return TRUSTED_BRANDS.some((brand) => {
    if (domainMatches(fromDomain, brand.domains)) return false;
    return brand.labels.some((label) => displayNameClaimsBrand(input.fromName || '', label));
  });
}

const PHISH_THREAT =
  /copyright|trademark|immateriel|intellectual property|account (will be )?suspend|legal action|written permission|dmca|infringement/i;

export function isLikelyPhishingInbound(input: Pick<GuardedInbound, 'fromEmail' | 'fromName' | 'subject' | 'body'>): boolean {
  if (isLikelyBrandImpersonation(input)) return true;
  const fromDomain = emailDomain(input.fromEmail || '');
  const text = `${input.subject || ''}\n${input.body || ''}`;
  return CONSUMER_MAIL.has(fromDomain) && PHISH_THREAT.test(text) && /meta|facebook|instagram|google|apple|microsoft|paypal/i.test(text);
}

const ACCESS =
  /gæsteliste|gæstespot|guest\s*list|guestlist|akkredit|pressepas|fotopas|press\s*pass|pressebillet|fotoadgang|anmelderplads|plus[\s-]?one/i;
const LIVE_EVENT = /koncert|concert|festival|spillested|venue|\bgig\b|showcase|releasekoncert/i;
const INVITE = /invitation|inviter|invited|invite/i;
const ASK_COVER =
  /(vil I|kan I|kunne I|would you|can you|are you (coming|covering)).{0,50}(dække|komme|anmelde|cover|attend|review)/i;

/** Concert/festival/press access offered to Apropos — never confirm coverage. */
export function isAccessOrInvitationOffer(input: Pick<GuardedInbound, 'fromEmail' | 'fromName' | 'subject' | 'body'>): boolean {
  const text = `${input.subject || ''}\n${input.body || ''}`;
  if (ACCESS.test(text)) return true;
  if (ASK_COVER.test(text)) return true;
  return INVITE.test(text) && LIVE_EVENT.test(text);
}

export function buildCoverageHoldingReply(settings: LivInboxSettings, input: GuardedInbound, language: string): string {
  const name = (input.fromName || input.fromEmail.split('@')[0] || 'der').split(' ')[0];
  const isEnglish = /^en/.test(language);
  const lines = isEnglish
    ? [
        `Hi ${name},`,
        '',
        'Thanks for thinking of us. I have passed this to the editorial team, and we will get back to you.',
        '',
        settings.signature.trim(),
      ]
    : [
        `Hej ${name},`,
        '',
        'Tak for henvendelsen. Jeg har sendt den videre til redaktionen, og vi vender tilbage.',
        '',
        settings.signature.trim(),
      ];
  return sanitizeLivOutput(lines.join('\n'));
}

export function applyInboundGuards(
  settings: LivInboxSettings,
  input: GuardedInbound,
  decision: LivInboxDecision
): LivInboxDecision {
  if (isLikelyPhishingInbound(input)) {
    return {
      ...decision,
      category: 'spam',
      confidence: Math.min(decision.confidence, 15),
      needsHuman: true,
      reply: '',
      reasoning:
        'Mistænkt phishing eller brand-impersonation (fx Meta/Facebook fra privat mail). Ikke besvaret. Frederik bør afvise uden at svare afsenderen.',
    };
  }
  if (isAccessOrInvitationOffer(input)) {
    const language = decision.language || 'da';
    return {
      ...decision,
      category: decision.category && decision.category !== 'generel' ? decision.category : 'invitation',
      needsHuman: true,
      reply: buildCoverageHoldingReply(settings, input, language),
      reasoning:
        'Tilbud om koncert/adgang/gæsteliste. Liv siger tak og at redaktionen vender tilbage — hun bekræfter aldrig dækning selv.',
    };
  }
  return decision;
}
