#!/usr/bin/env node
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv();

const baseUrl = process.env.NEWSLETTER_DEV_BASE_URL || 'http://localhost:3000';
const cronSecret = (process.env.CRON_SECRET || '').trim();
const intervalMsRaw = Number.parseInt(process.env.NEWSLETTER_DEV_CRON_INTERVAL_MS || '60000', 10);
const intervalMs = Number.isFinite(intervalMsRaw) && intervalMsRaw >= 15000 ? intervalMsRaw : 60000;
const root = baseUrl.replace(/\/$/, '');
const cronEndpoints = [
  { name: 'newsletter-scheduled', url: `${root}/api/cron/newsletter-scheduled` },
  { name: 'newsletter-weekly', url: `${root}/api/cron/newsletter-weekly` },
];

if (!cronSecret) {
  console.error('[newsletter-cron-dev] CRON_SECRET mangler i miljøet (.env.local).');
  process.exit(1);
}

let stopped = false;
let inFlight = false;

async function tick() {
  if (stopped || inFlight) return;
  inFlight = true;
  const ts = () => new Date().toLocaleTimeString('da-DK');
  try {
    for (const { name, url } of cronEndpoints) {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${cronSecret}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.warn(`[newsletter-cron-dev] ${ts()} ${name} HTTP ${res.status}: ${data?.error || 'ukendt fejl'}`);
        continue;
      }
      if (name === 'newsletter-scheduled') {
        const processed = typeof data?.processed === 'number' ? data.processed : 0;
        if (processed > 0) {
          console.log(`[newsletter-cron-dev] ${ts()} ${name} processed=${processed}`);
        }
      } else {
        const skipped = data?.skipped === true;
        if (skipped) {
          if (data?.reason === 'time_gate' && process.env.NEWSLETTER_WEEKLY_BYPASS_TIME_GATE !== 'true') {
            console.log(
              `[newsletter-cron-dev] ${ts()} ${name} skipped (time_gate — sæt NEWSLETTER_WEEKLY_BYPASS_TIME_GATE=true lokalt for at teste uden for ugedag/tid)`
            );
          } else if (data?.reason) {
            console.log(`[newsletter-cron-dev] ${ts()} ${name} skipped (${data.reason})`);
          }
        } else if (data?.sent != null || data?.weekKey) {
          console.log(
            `[newsletter-cron-dev] ${ts()} ${name} ok weekKey=${data.weekKey ?? '?'} sent=${data.sent ?? '—'}`
          );
        }
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[newsletter-cron-dev] ${ts()} ${msg}`);
  } finally {
    inFlight = false;
  }
}

console.log(
  `[newsletter-cron-dev] starter: ${cronEndpoints.map((e) => e.name).join(' + ')} hver ${Math.round(intervalMs / 1000)}s → ${root}`
);
void tick();
const timer = setInterval(() => void tick(), intervalMs);

function shutdown() {
  stopped = true;
  clearInterval(timer);
  console.log('[newsletter-cron-dev] stoppet');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
