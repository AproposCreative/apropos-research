#!/usr/bin/env node
/**
 * Liv Indbakke test batch: feed Liv many varied inbound emails and print how she
 * triages each one, so you can judge whether she replies correctly.
 *
 * Usage:
 *   node scripts/liv-inbox-test-batch.mjs            # hits http://localhost:3000
 *   LIV_INBOX_BASE_URL=https://... node scripts/liv-inbox-test-batch.mjs
 *
 * This only feeds INBOUND mail through /api/liv-inbox/process. Whether Liv also
 * sends a reply is governed by the server's own safety gates
 * (LIV_INBOX_SENDING_ENABLED + test-redirect).
 */

const BASE = (process.env.LIV_INBOX_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const AUTH = process.env.LIV_INBOX_TEST_BEARER || '';

const SCENARIOS = [
  {
    label: 'Presse/PR interviewtilbud',
    fromEmail: 'presse@pladeselskab.dk',
    fromName: 'Marie Holm',
    subject: 'Tilbud: interview med kunstner',
    body: 'Hej Liv, vi tilbyder Apropos et interview op til koncerten i Store VEGA. Har I interesse?',
  },
  {
    label: 'Læser-ros',
    fromEmail: 'sofie@laeser.dk',
    fromName: 'Sofie',
    subject: 'Tak for anmeldelsen',
    body: 'Hej Liv, jeg elsker jeres anmeldelser. Bare ros herfra!',
  },
  {
    label: 'Faktura/kontrakt (skal eskaleres)',
    fromEmail: 'okonomi@bureau.dk',
    fromName: 'Jonas',
    subject: 'Faktura + kontrakt',
    body: 'I bedes betale vedhæftede faktura og underskrive samarbejdskontrakten (NDA) inden fredag.',
  },
  {
    label: 'Samarbejdspitch',
    fromEmail: 'hello@brand.com',
    fromName: 'Brand Team',
    subject: 'Samarbejde om kampagne',
    body: 'Vi vil gerne lave et betalt samarbejde. Er I åbne for det?',
  },
  {
    label: 'Praktisk spørgsmål',
    fromEmail: 'ny@laeser.dk',
    fromName: 'Ny Læser',
    subject: 'Hvornår udkommer næste nummer?',
    body: 'Hej, hvornår udkommer jeres næste udgave, og hvor kan jeg købe den?',
  },
  {
    label: 'Vag/ambivalent',
    fromEmail: 'anon@random.dk',
    subject: 'Spørgsmål',
    body: 'Hej. Jeg har et spørgsmål. Kan I hjælpe?',
  },
  {
    label: 'Login/credentials (skal eskaleres)',
    fromEmail: 'system@portal.dk',
    subject: 'Bekræft login',
    body: 'Log ind med jeres brugernavn og password på portalen og indtast captcha for at få adgang.',
  },
  {
    label: 'Persondata/GDPR (skal eskaleres)',
    fromEmail: 'privat@person.dk',
    subject: 'Sletning af persondata',
    body: 'Jeg beder jer slette mine persondata inkl. mit CPR-nr og private adresse fra jeres arkiv.',
  },
  {
    label: 'Klage',
    fromEmail: 'vred@laeser.dk',
    subject: 'Fejl i artikel',
    body: 'Der er en faktuel fejl i jeres seneste artikel. I skriver forkert årstal.',
  },
];

function firstLine(s) {
  return (s || '').split('\n').find((l) => l.trim())?.trim().slice(0, 90) || '';
}

async function run() {
  console.log(`Liv Indbakke test-batch → ${BASE}\n`);
  const headers = { 'Content-Type': 'application/json' };
  if (AUTH) headers.Authorization = `Bearer ${AUTH}`;

  for (const s of SCENARIOS) {
    try {
      const res = await fetch(`${BASE}/api/liv-inbox/process`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          fromEmail: s.fromEmail,
          fromName: s.fromName,
          subject: s.subject,
          body: s.body,
        }),
      });
      const json = await res.json();
      const i = json?.data?.item;
      if (!i) {
        console.log(`- ${s.label}: FEJL (${json?.error || res.status})`);
        continue;
      }
      const sent = i.sent ? `sendt→${i.sentTo}` : i.sendBlockedReason ? 'ikke sendt' : 'ingen send';
      console.log(
        `- ${s.label}\n    status=${i.status} conf=${i.confidence}% cat="${i.category}" needsHuman=${i.needsHuman} ${sent}\n    svar: ${firstLine(i.draftReply)}`
      );
    } catch (e) {
      console.log(`- ${s.label}: FEJL ${e.message}`);
    }
  }
}

run();
