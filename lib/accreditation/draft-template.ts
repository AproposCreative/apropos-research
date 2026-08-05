import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import type { AccreditationRequest } from '@/lib/accreditation/types';
import { ensureRequestIdInSubject, sanitizeLivOutput } from '@/lib/accreditation/sanitize';

/** User-provided magazine reach figures for accreditation outreach. */
export const ACCREDITATION_STATS = {
  uniqueWebUsersPerMonth: '1.700',
  crossChannelPerMonth: '20.000',
} as const;

export const APROPOS_SITE_URL = 'https://www.aproposmagazine.com';
export const APROPOS_INSTAGRAM_URL = 'https://www.instagram.com/aproposmagazineofficial/';

export const LIV_DISPLAY_NAME = 'Liv Brandt';
export const LIV_TITLE = 'Skribent og kulturjournalist Aproposmagazine.com';
export const LIV_ORG = 'Apropos Magazine';
export const LIV_ADDRESS_LINES = ['Flæsketorvet 26-28,', '1711 København V'] as const;
export const LIV_SIGNATURE_IMAGE_PATH = '/images/AM-Signatur.png';

const OM_OS =
  'Apropos Magazine er et uafhængigt og reklamefrit kultmedie, etableret i foråret 2025. Vi arbejder med ambitiøs kulturjournalistik og dækker musik og moderne kultur med en personlig, analytisk og nærværende tilgang - med respekt for både kunstneren og publikum.';

const FORMAT_MAALGRUPPE =
  'Apropos Magazine henvender sig til kulturinteresserede danskere i alderen 25-45 år, der er trætte af overfladiske nyheder og søger journalistik med dybde, humor og holdning.\n\nVores artikler udgives som redaktionelle online-essays - uden reklamer, uden clickbait, bare ord, der vil noget.';

const STANDARD_PLANNED_COVERAGE = [
  'Vores dækning tager udgangspunkt i selve koncertoplevelsen - musikken, lydbilledet, publikum, rummet og det særlige møde, der opstår mellem scene og sal.',
  '',
  'Vi skriver ikke som passive observatører, men som deltagere med åbne sanser og en stemme, der tør mene noget.',
  '',
  '- En koncertanmeldelse publiceret kort efter koncerten',
  '- Fokus på musikalsk udtryk, stemning, publikum og helhedsoplevelse',
  '- Deling via vores Instagram-kanal med citater og link',
].join('\n');

const READER_STATS = [
  `Siden foråret 2025 er magasinet vokset fra få hundrede besøgende til et stabilt gennemsnit på omkring ${ACCREDITATION_STATS.uniqueWebUsersPerMonth} unikke brugere pr. måned (Analytics, juli-september 2025).`,
  '',
  `Samlet set når Apropos Magazine i dag et dokumenteret publikum på over ${ACCREDITATION_STATS.crossChannelPerMonth} brugere pr. måned på tværs af web og sociale medier - og trafikken stiger måned for måned.`,
].join('\n');

let signatureDataUriCache: string | null | undefined;

/** Embedded AM-Signatur.png for outbound HTML (works without public hosting). */
export function getLivSignatureImageDataUri(): string {
  if (signatureDataUriCache !== undefined) return signatureDataUriCache;
  const file = path.join(process.cwd(), 'public/images/AM-Signatur.png');
  try {
    const buf = fs.readFileSync(file);
    signatureDataUriCache = `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    signatureDataUriCache = '';
  }
  return signatureDataUriCache;
}

/** Canonical plain-text closing used on every Liv outbound mail. */
export function livSignaturePlainText(): string {
  return [
    '--',
    'Venlig hilsen / Best regards',
    '',
    LIV_DISPLAY_NAME,
    LIV_TITLE,
    '',
    LIV_ORG,
    ...LIV_ADDRESS_LINES,
  ].join('\n');
}

/** HTML signature block with AM-Signatur.png. */
export function livSignatureHtml(): string {
  const imgSrc = getLivSignatureImageDataUri() || LIV_SIGNATURE_IMAGE_PATH;
  const img = imgSrc
    ? `<img src="${imgSrc}" alt="Apropos Magazine" width="220" style="display:block;margin-top:12px;border:0;max-width:220px;height:auto;" />`
    : '';
  return [
    '<div style="margin-top:20px;padding-top:12px;border-top:1px solid #ddd;font-family:Georgia,serif;font-size:14px;line-height:1.45;color:#111">',
    '<p style="margin:0 0 12px">Venlig hilsen / Best regards</p>',
    `<p style="margin:0"><strong>${LIV_DISPLAY_NAME}</strong><br/>`,
    `${LIV_TITLE}</p>`,
    `<p style="margin:12px 0 0">${LIV_ORG}<br/>`,
    `${LIV_ADDRESS_LINES.join('<br/>')}</p>`,
    img,
    '</div>',
  ].join('');
}

export function withLivSignature(body: string): string {
  const trimmed = sanitizeLivOutput(body).replace(/\s+$/u, '');
  return sanitizeLivOutput(`${trimmed}\n\n${livSignaturePlainText()}`);
}

/** Use a name only when the mail display value looks like a real person. */
export function validatedGreetingName(value?: string): string | undefined {
  const name = (value || '')
    .replace(/^["']|["']$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!name || name.length < 2 || name.length > 60 || name.includes('@')) return undefined;
  if (
    /^(navn|name|dig|there|team|support|postmaster)$/i.test(name) ||
    /\b(no-?reply|noreply|support|kundeservice|team|presse|press|booking|accreditation|info|newsletter|marketing|communications|festival)\b/i.test(
      name
    )
  ) {
    return undefined;
  }
  if (!/^[\p{L}][\p{L}\p{M}.' -]*$/u.test(name)) return undefined;
  return name;
}

/** Avoid greeting a recipient with an email domain or URL as if it were an organisation. */
export function validatedGreetingOrganization(value?: string): string | undefined {
  const organization = (value || '').replace(/\s+/g, ' ').trim();
  if (
    !organization ||
    organization.toLowerCase() === 'arrangør' ||
    organization.includes('@') ||
    /^(?:https?:\/\/|www\.)/i.test(organization) ||
    /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(organization)
  ) {
    return undefined;
  }
  return organization.slice(0, 80);
}

/**
 * Canonical long-form Danish accreditation mail.
 * Signs as Liv Brandt with official AM signature (never Frederik).
 * Sammy Virji text may be used as a fixture in tests — never as a Sheet row.
 */
export function buildAccreditationDraft(params: {
  request: AccreditationRequest;
  contactName?: string;
  previousCoverageUrl?: string;
  plannedCoverage?: string;
  formatAudience?: string;
}): { subject: string; text: string } {
  const { request } = params;
  const contact = validatedGreetingName(params.contactName || request.contactName);
  const promoter = validatedGreetingOrganization(request.promoter);
  const greeting =
    contact && promoter
      ? `Kære ${contact} / ${promoter},`
      : contact
        ? `Kære ${contact},`
        : promoter
          ? `Kære ${promoter},`
          : 'Kære presseansvarlige,';
  const artist = request.artist.trim();
  const venue = request.venue?.trim();
  const eventDate = request.eventDate?.trim();
  const ticketQuantity = Math.max(1, request.ticketQuantity || 1);
  const applicants = request.applicants.map((a) => a.name).filter(Boolean);
  const applicantLine =
    applicants.length === 0
      ? 'en skribent fra Apropos Magazine'
      : applicants.length === 1
        ? applicants[0]
        : `${applicants.slice(0, -1).join(', ')} og ${applicants[applicants.length - 1]}`;

  const eventWhen = [venue ? `i ${venue}` : null, eventDate ? `den ${eventDate}` : null]
    .filter(Boolean)
    .join(' ');
  const access = request.accessRequested?.trim() || 'presseakkreditering';
  const standingRequested =
    request.ticketType === 'staapladser' ||
    /ståplads|staaplad/i.test(request.accessRequested || '');
  const ticketLabel =
    ticketQuantity === 1
      ? `1 pressebillet${standingRequested ? ' med ståplads' : ''}`
      : `${ticketQuantity} pressebilletter${standingRequested ? ' med ståplads' : ''}`;

  const previousBlock =
    params.previousCoverageUrl || request.previousCoverageUrl
      ? `Se vores relevante tidligere dækning: ${params.previousCoverageUrl || request.previousCoverageUrl}`
      : '';

  const customCoverage =
    params.plannedCoverage?.trim() || request.promisedCoverage?.trim();
  const planned = customCoverage
    ? `${STANDARD_PLANNED_COVERAGE}\n\nSærligt fokus for denne dækning:\n${customCoverage}`
    : STANDARD_PLANNED_COVERAGE;

  const format = params.formatAudience?.trim() || FORMAT_MAALGRUPPE;

  const body = [
    greeting,
    '',
    `Vi vil gerne ansøge om ${access} til ${artist}${eventWhen ? ` ${eventWhen}` : ''} på vegne af Apropos Magazine.`,
    '',
    `Ansøgningen gælder ${ticketLabel} til ${applicantLine}, som vil skrive koncertanmeldelsen.`,
    '',
    'Om os:',
    OM_OS,
    previousBlock,
    '',
    `Site: ${APROPOS_SITE_URL}`,
    `Instagram: ${APROPOS_INSTAGRAM_URL}`,
    '',
    'Planlagt dækning:',
    planned,
    '',
    'Format & målgruppe:',
    format,
    '',
    'Læsertal:',
    READER_STATS,
    '',
    'Vi håber, I vil tage os med til at dække denne særlige aften.',
  ]
    .filter((line, i, arr) => !(line === '' && arr[i - 1] === ''))
    .join('\n');

  const subject = ensureRequestIdInSubject(
    `Presseakkreditering - ${artist}${venue ? `, ${venue}` : ''}`,
    request.id
  );

  return { subject, text: withLivSignature(body) };
}

export function draftHash(subject: string, text: string): string {
  return createHash('sha256').update(`${subject}\n${text}`).digest('hex').slice(0, 16);
}

/**
 * Convert plain body (+ optional embedded plain signature) to HTML.
 * Strips a trailing plain signature block and re-appends the official HTML signature with AM-Signatur.png.
 */
export function textToEmailHtml(text: string): string {
  const signatureMarker = /\n--\nVenlig hilsen \/ Best regards[\s\S]*$/u;
  const bodyOnly = sanitizeLivOutput(text).replace(signatureMarker, '').replace(/\s+$/u, '');
  const escaped = bodyOnly
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(
      /^(Om os:|Planlagt dækning:|Format &amp; målgruppe:|Læsertal:|Særligt fokus for denne dækning:)$/gm,
      '<strong>$1</strong>'
    )
    .replace(
      /(https:\/\/(?:www\.)?(?:aproposmagazine\.com|instagram\.com)\/[^\s<]*)/g,
      '<a href="$1" style="color:#111;text-decoration:underline">$1</a>'
    );
  return sanitizeLivOutput(
    `<div style="font-family:Georgia,serif;font-size:15px;line-height:1.55;color:#111">${escaped.replace(/\n/g, '<br/>')}${livSignatureHtml()}</div>`
  );
}

export function buildApplicantNotice(params: {
  request: AccreditationRequest;
  outcome: 'granted' | 'denied' | 'update';
  detail?: string;
  /** When true, we only have verbal approval — no tickets/QR yet. */
  approvalOnly?: boolean;
}): { subject: string; text: string } {
  const { request, outcome } = params;
  const artist = request.artist;
  const names = request.applicants.map((a) => a.name).filter(Boolean);
  const who =
    request.deliveryRecipientName ||
    (names.length ? names.join(', ') : 'ansøger');
  const statusLine =
    outcome === 'granted' && params.approvalOnly
      ? `Vi har fået positivt svar på presseakkreditering til ${artist}, men de konkrete billetter/adgangsdetaljer er endnu ikke landet hos os. Jeg sender dem videre, så snart de kommer.`
      : outcome === 'granted'
        ? `Der er nu adgang / positivt svar vedrørende presseakkreditering til ${artist}.`
        : outcome === 'denied'
          ? `Der er kommet et svar vedrørende presseakkreditering til ${artist}, som desværre ikke giver adgang.`
          : `Her er en statusopdatering vedrørende akkreditering til ${artist}.`;

  const body = [
    `Kære ${who},`,
    '',
    statusLine,
    params.detail?.trim() || '',
    '',
    request.venue || request.eventDate
      ? `Koncert: ${[artist, request.venue, request.eventDate].filter(Boolean).join(' · ')}`
      : `Koncert: ${artist}`,
  ]
    .filter((line, i, arr) => !(line === '' && arr[i - 1] === ''))
    .join('\n');

  return {
    subject: ensureRequestIdInSubject(
      outcome === 'granted' && params.approvalOnly
        ? `Akkreditering godkendt - afventer billetter · ${artist}`
        : outcome === 'granted'
          ? `Akkreditering bekræftet · ${artist}`
          : outcome === 'denied'
            ? `Akkreditering · svar vedr. ${artist}`
            : `Akkreditering · status · ${artist}`,
      request.id
    ),
    text: withLivSignature(body),
  };
}

export function buildAccessPackageDeliveryNotice(params: {
  request: AccreditationRequest;
  recipientName: string;
  package: {
    assets: Array<{ kind: string; filename?: string; url?: string; safe: boolean }>;
    guestListInstructions?: string;
  };
}): { subject: string; text: string } {
  const { request, recipientName } = params;
  const artist = request.artist;
  const links = params.package.assets
    .filter((a) => a.safe && a.kind === 'link' && a.url)
    .map((a) => a.url!);
  const files = params.package.assets
    .filter((a) => a.safe && a.kind === 'attachment' && a.filename)
    .map((a) => a.filename!);

  const body = [
    `Kære ${recipientName},`,
    '',
    `Her er den endelige adgangspakke til ${artist}.`,
    '',
    request.venue || request.eventDate
      ? `Koncert: ${[artist, request.venue, request.eventDate].filter(Boolean).join(' · ')}`
      : null,
    request.ticketQuantity
      ? `Antal: ${request.ticketQuantity}${request.ticketType ? ` · ${request.ticketType}` : ''}`
      : null,
    '',
    files.length ? `Vedhæftede filer: ${files.join(', ')}` : null,
    links.length ? `Download / billet-links:\n${links.map((u) => `• ${u}`).join('\n')}` : null,
    params.package.guestListInstructions
      ? `\nGæsteliste / afhentning:\n${params.package.guestListInstructions}`
      : null,
    '',
    'Sig endelig til, hvis noget mangler.',
  ]
    .filter((line) => line != null)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');

  return {
    subject: ensureRequestIdInSubject(`Din adgangspakke · ${artist}`, request.id),
    text: withLivSignature(body),
  };
}

export function buildFollowUpDraft(params: {
  request: AccreditationRequest;
  contactName?: string;
}): { subject: string; text: string } {
  const contact = validatedGreetingName(params.contactName || params.request.contactName);
  const promoter = validatedGreetingOrganization(params.request.promoter);
  const artist = params.request.artist;
  const greeting =
    contact && promoter
      ? `Kære ${contact} / ${promoter},`
      : contact
        ? `Kære ${contact},`
        : promoter
          ? `Kære ${promoter},`
          : 'Kære presseansvarlige,';
  const body = [
    greeting,
    '',
    `Jeg følger lige op på vores anmodning om presseakkreditering til ${artist} på vegne af Apropos Magazine.`,
    '',
    'Sig endelig til, hvis I mangler yderligere oplysninger fra os.',
  ].join('\n');
  return {
    subject: ensureRequestIdInSubject(
      `Opfølgning · Presseakkreditering - ${artist}`,
      params.request.id
    ),
    text: withLivSignature(body),
  };
}

/** Internal colleague acknowledgement — warm, direct, “jeg tager den”. */
export function buildInternalAckDraft(params: {
  toName?: string;
  artists: string[];
  requestIds: string[];
}): { subject: string; text: string } {
  const who = params.toName?.trim() || 'dig';
  const artistLine =
    params.artists.length === 0
      ? 'sagen'
      : params.artists.length === 1
        ? params.artists[0]
        : `${params.artists.slice(0, -1).join(', ')} og ${params.artists[params.artists.length - 1]}`;
  const ids = params.requestIds.length ? ` (${params.requestIds.join(', ')})` : '';
  const body = [
    `Hej ${who},`,
    '',
    `Jeg tager den - går i gang med akkreditering til ${artistLine}${ids}.`,
    'Skriver videre, når der er nyt fra arrangør/presse.',
  ].join('\n');
  const primaryId = params.requestIds[0] || '';
  return {
    subject: ensureRequestIdInSubject(
      params.artists.length === 1
        ? `På den · ${params.artists[0]}`
        : `På den · ${params.artists.length || ''} akkrediteringssager`.replace(/\s+/g, ' ').trim(),
      primaryId
    ),
    text: withLivSignature(body),
  };
}

/** Helpful reply when mail to liv@ is not an accreditation brief. */
export function buildRoutingReplyDraft(params: {
  toName?: string;
  subject: string;
}): { subject: string; text: string } {
  const who = validatedGreetingName(params.toName);
  const body = [
    who ? `Hej ${who},` : 'Hej,',
    '',
    'Tak for mailen - den ligner ikke en konkret akkrediteringsanmodning (artist/dato + antal).',
    'Hvis du vil have mig til at skaffe presseadgang: send event/artist, dato, antal og recipient, eller smid en event-URL i Akkreditering i studio.',
    'Ellers kan du pege mig hen til den rigtige kollega, så hjælper jeg med at route.',
  ].join('\n');
  const re = params.subject.startsWith('Re:') ? params.subject : `Re: ${params.subject}`;
  return { subject: sanitizeLivOutput(re), text: withLivSignature(body) };
}
