import {NextRequest, NextResponse} from 'next/server';
import {z} from 'zod';
import {requireCronBearer} from '@/lib/cron/cron-auth';
import {deliverReadyArticle} from '@/lib/liv/deliver-ready';
import {copenhagenClock} from '@/lib/liv/delivery-policy';

export const runtime = 'nodejs';
export const maxDuration = 300;
const inputSchema = z.object({
  dayKey: z.string(), requestId: z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/),
  itemId: z.string().regex(/^[a-f0-9]{24}$/), expectedPayloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  reason: z.string().trim().min(10).max(600).refine(v => !/[<>\x00-\x1f]/.test(v)),
}).strict();
const json = (data: unknown, status = 200) => NextResponse.json(data, {status, headers:{'Cache-Control':'no-store'}});

/** Explicit operator request for today's exact, ready article. Same publisher,
 * gates, daily uniqueness, lease and ambiguous-write reconciliation as cron.
 * Never generates, advances future stories, or changes the automatic window. */
export async function POST(req: NextRequest) {
  const denied = requireCronBearer(req);
  if (denied) return denied;
  if (process.env.LIV_DELIVERY_QUEUE_ENABLED !== 'true' || process.env.LIV_DAILY_PUBLICATION_MODE !== 'auto_publish' ||
      /^(1|true)$/i.test(process.env.LIV_DAILY_PAUSED || '')) return json({error:'liv_publication_disabled'},409);
  let input: z.infer<typeof inputSchema>;
  try {
    if (req.nextUrl.search) throw new Error('invalid');
    const raw = await req.text();
    if (raw.length > 2000) throw new Error('invalid');
    input = inputSchema.parse(JSON.parse(raw));
    if (input.dayKey !== copenhagenClock().day) throw new Error('invalid');
  } catch { return json({error:'liv_publication_invalid_request'},400); }
  try {
    const {dayKey: _dayKey, ...explicit} = input;
    return json(await deliverReadyArticle(new Date(), undefined, explicit));
  } catch (error) {
    return json({error:error instanceof Error && error.message === 'liv_delivery_explicit_conflict'
      ? error.message : 'liv_publication_failed'},409);
  }
}
