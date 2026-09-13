import { getAdminAuth } from '@/lib/firebase-admin';
import { sendAuthMail } from '@/lib/auth-mail';
import { z } from 'zod';
import { after } from 'next/server';

export const runtime = 'nodejs';
const input = z.discriminatedUnion('kind', [z.object({ kind: z.literal('reset'), email: z.string().max(254) }).strict(), z.object({ kind: z.literal('verify') }).strict()]);
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function POST(request: Request) {
  // Exact same-origin browser operation; non-browser callers still need verify auth.
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: 'Ugyldig oprindelse.' }, 403);
  let data: z.infer<typeof input>;
  try { const raw = await request.text(); if (raw.length > 1000) throw new Error(); data = input.parse(JSON.parse(raw)); }
  catch { return reply({ error: 'Ugyldig forespørgsel.' }, 400); }
  if (data.kind === 'reset') {
    // Account lookup and provider latency must not become an enumeration oracle.
    const email = data.email;
    after(async () => {
      try { await sendAuthMail('reset', email); }
      catch { console.error('[auth-mail] reset delivery failed; inspect authMailOperations'); }
    });
    // Same response for absent, restricted, throttled and existing accounts.
    return reply({ message: 'Hvis adressen har adgang, sender vi et link. Tjek også spam.' });
  }
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return reply({ error: 'Log ind igen.' }, 401);
  let email: string;
  try {
    const auth = getAdminAuth(); if (!auth) throw new Error();
    const claims = await auth.verifyIdToken(token, true);
    const user = await auth.getUser(claims.uid);
    if (user.disabled || !user.email) throw new Error();
    email = user.email;
  } catch { return reply({ error: 'Log ind igen.' }, 401); }
  try { await sendAuthMail('verify', email); return reply({ message: 'Tjek din indbakke og spam. Vent et minut før et nyt forsøg.' }); }
  catch { return reply({ error: 'Mailen kunne ikke sendes. Prøv igen om et minut.' }, 503); }
}
