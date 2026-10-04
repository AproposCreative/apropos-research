import { getAdminDb } from '@/lib/firebase-admin';

export type ConnectionStatus = {
  checkedAt: string;
  authorization: 'granted' | 'none' | 'unknown';
  observedAuthorizations: number;
  inventoryComplete: boolean;
  successfulToolCallObserved: boolean;
  clientAcceptanceVerified: false;
};

/** Read-only onboarding evidence, not a token probe or ChatGPT-client certification.
 * An authorization can outlive a client's refresh token. Never call it a working
 * connection solely because a grant exists. No secrets or grant IDs leave here.
 */
export async function readConnectionStatus(uid: string): Promise<ConnectionStatus> {
  const db = getAdminDb(); if (!db) throw Error('mcp_unavailable');
  const now = Date.now();
  const [grants, revocation] = await Promise.all([
    db.collection('mcpGrants').where('uid', '==', uid).limit(201).get(),
    db.collection('mcpRevocations').doc(uid).get(),
  ]);
  const watermark = revocation.data()?.revokedAt ?? -1;
  const active = grants.docs.filter(doc => {
    const row = doc.data();
    return row.uid === uid && row.revoked === false && Number.isSafeInteger(row.createdAt) &&
      Number.isSafeInteger(row.expiresAt) && row.createdAt <= now && row.createdAt > watermark && row.expiresAt > now;
  });
  // Equality-only queries use existing indexes. Bounded reads, no polling or
  // telemetry writes. A found success is evidence of a call, not necessarily the
  // latest call, a human test, a current token or a successful edit/publication.
  const observed = await Promise.all(active.slice(0, 10).map(async grant => {
    const audit = await db.collection('mcpAudit').where('grantId', '==', grant.id)
      .where('uid', '==', uid).where('status', '==', 'ok').limit(1).get();
    return audit.docs.some(doc => {
      const row = doc.data(), startedAt = Date.parse(row.startedAt);
      return row.uid === uid && row.grantId === grant.id && row.status === 'ok' &&
        Number.isFinite(startedAt) && startedAt >= grant.data().createdAt && startedAt <= now;
    });
  }));
  const inventoryComplete = grants.size < 201;
  return {
    checkedAt: new Date(now).toISOString(),
    authorization: active.length ? 'granted' : inventoryComplete ? 'none' : 'unknown',
    observedAuthorizations: active.length, inventoryComplete,
    successfulToolCallObserved: observed.some(Boolean), clientAcceptanceVerified: false,
  };
}
