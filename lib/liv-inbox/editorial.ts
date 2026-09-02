/**
 * Editorial grounding for Liv Indbakke.
 *
 * Gives Liv a small "what we cover / what's already planned / deadlines" source
 * so she can answer precisely ("vi dækker allerede den festival") instead of
 * generically. Combines:
 *  - editable editorialFacts from settings, and
 *  - a cached digest of active rows from the accreditation workflow sheet
 *    (same service account as contacts; best-effort, never blocks a reply).
 */
import { pullWorkflowRows } from '@/lib/accreditation/sheet-client';
import { getLivInboxSettings } from '@/lib/liv-inbox/settings-store';

const DIGEST_TTL_MS = 5 * 60 * 1000;
let digestCache: { at: number; text: string } | null = null;

export function __resetEditorialCacheForTests(): void {
  digestCache = null;
}

const INACTIVE_STATUS = /afsluttet|declined|afvist|rejected|closed|done|udgivet|annulleret|cancel/i;

/** Best-effort digest of active/planned coverage from the workflow sheet. */
export async function loadWorkflowDigest(maxRows = 25): Promise<string> {
  const now = Date.now();
  if (digestCache && now - digestCache.at < DIGEST_TTL_MS) return digestCache.text;

  let text = '';
  try {
    const rows = await pullWorkflowRows();
    const active = rows
      .filter((r) => r.artist && !INACTIVE_STATUS.test(r.status || ''))
      .slice(0, maxRows);
    if (active.length) {
      text = active
        .map((r) => {
          const parts = [
            r.artist,
            r.venue ? `@ ${r.venue}` : '',
            r.eventDate ? `(${r.eventDate})` : '',
            r.status ? `- ${r.status}` : '',
            r.nextFollowUp ? `[opfølgning: ${r.nextFollowUp}]` : '',
          ].filter(Boolean);
          return `- ${parts.join(' ')}`;
        })
        .join('\n');
    }
  } catch {
    text = ''; // sheet unavailable / not configured — degrade gracefully
  }

  digestCache = { at: now, text };
  return text;
}

/** Full editorial context block for the prompt (facts + workflow digest). */
export async function loadEditorialContext(): Promise<string> {
  const settings = await getLivInboxSettings();
  const facts = (settings.editorialFacts || '').trim();
  const digest = await loadWorkflowDigest();

  const blocks: string[] = [];
  if (facts) blocks.push(facts);
  if (digest) blocks.push(`Aktuelle/planlagte sager (fra akkrediterings-arket):\n${digest}`);
  if (blocks.length === 0) return '';

  return [
    'REDAKTIONELLE FAKTA (hvad vi dækker/planlægger - brug til at svare præcist, fx "vi dækker allerede den festival"; opfind aldrig fakta udover dette):',
    blocks.join('\n\n'),
  ].join('\n');
}
