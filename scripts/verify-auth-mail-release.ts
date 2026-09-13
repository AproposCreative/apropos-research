import { createHash } from 'node:crypto';
import { getAdminDb } from '../lib/firebase-admin';
import { Resend } from 'resend';

const origin = 'https://ai.aproposmagazine.com';
const email = 'frederik@aproposmagazine.com';
const recipientHash = createHash('sha256').update(email).digest('hex');

/** Explicitly invoked only. Skips sending when an owner reset audit exists today.
 * Never follows the link, changes a password, or prints action tokens/mail bodies.
 */
export async function verifyAuthMailRelease(send = false) {
  const db = getAdminDb(); if (!db) throw new Error('admin_missing');
  const startOfDay = new Date().toISOString().slice(0,10);
  const rows = await db.collection('authMailOperations').where('recipientHash','==',recipientHash).get();
  const recent = rows.docs.map(d=>({id:d.id,...d.data()} as {id:string;kind:string;createdAt:string;status:string;providerId?:string}))
    .filter(d=>d.kind==='reset' && d.createdAt >= startOfDay).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  if (recent[0]) {
    const row = recent[0]; let providerStatus: string | undefined;
    if (row.providerId) {
      const result = await new Resend(process.env.RESEND_API_KEY).emails.get(row.providerId);
      if (result.error) throw new Error('provider_read_failed');
      providerStatus = result.data?.last_event;
    }
    console.log(JSON.stringify({operationId:row.id,status:row.status,providerId:row.providerId,providerStatus}));
    return;
  }
  if (!send) { console.log(JSON.stringify({status:'no_operation_yet'})); return; }
  // No sends during the boundary checks.
  for (const test of [
    {body:{kind:'verify'},headers:{Origin:origin},expected:401},
    {body:{kind:'reset',email},headers:{Origin:'https://invalid.example'},expected:403},
  ]) {
    const r = await fetch(`${origin}/api/auth/mail`, {method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{...test.headers,'Content-Type':'application/json'},body:JSON.stringify(test.body)});
    if (r.status !== test.expected) throw new Error(`auth_mail_boundary_${r.status}`);
    console.log(JSON.stringify({case:'boundary',status:r.status}));
  }
  const response = await fetch(`${origin}/api/auth/mail`, {method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({kind:'reset',email})});
  if (!response.ok) throw new Error(`auth_mail_request_${response.status}`);
  console.log(JSON.stringify({status:'request_accepted',http:response.status}));
}
