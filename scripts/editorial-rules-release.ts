import { readFile } from 'node:fs/promises';
import { GoogleAuth } from 'google-auth-library';
import { getAdminAuth, getAdminDb } from '../lib/firebase-admin';
import { editorialRole, EDITORIAL_EMAILS } from '../lib/auth-policy';

/** Provision only the explicit existing administrators; never reactivate revoked entries. */
export async function migrateEditorialAdministrators() {
  const database = getAdminDb(), userAuth = getAdminAuth();
  if (!database || !userAuth) throw new Error('firebase_admin_unavailable');
  const uids = [...new Set((process.env.SEO_ENGINE_ADMIN_UIDS || '').split(',').map(x => x.trim()).filter(Boolean))];
  let migrated = 0;
  for (const uid of uids) {
    const user = await userAuth.getUser(uid);
    // Historical administrators outside the current roster must not regain access.
    if (!EDITORIAL_EMAILS.some(email => email === user.email?.trim().toLowerCase())) continue;
    if (!user.email || !user.emailVerified || user.disabled) throw new Error('bootstrap_admin_not_verified');
    const ref = database.collection('editorialAccess').doc(user.email.trim().toLowerCase());
    await database.runTransaction(async tx => {
      const existing = await tx.get(ref);
      if (existing.exists) {
        if (existing.data()?.active !== true || existing.data()?.role !== 'admin') throw new Error('existing_admin_entry_conflict');
        return;
      }
      const entry = { active: true, role: 'admin', updatedBy: 'migration:existing-admin-list', updatedAt: new Date().toISOString() };
      tx.create(ref, entry);
      tx.create(database.collection('editorialAccessAudit').doc(), { email: ref.id, ...entry });
    });
    const saved = (await ref.get()).data();
    if (saved?.active !== true || saved?.role !== 'admin') throw new Error('admin_migration_readback_failed');
    migrated++;
  }
  let currentAdministrators = 0;
  for (const email of EDITORIAL_EMAILS) {
    const user = await userAuth.getUserByEmail(email).catch(() => null);
    if (!user) continue;
    const entry = (await database.collection('editorialAccess').doc(email).get()).data();
    if (editorialRole({ email, emailVerified: user.emailVerified, disabled: user.disabled,
      entry: entry as Parameters<typeof editorialRole>[0]['entry'] }) === 'admin') currentAdministrators++;
  }
  if (!currentAdministrators) throw new Error('current_roster_admin_missing');
  console.log(JSON.stringify({ administratorMigration: 'verified', count: migrated, currentAdministrators }));
}

/** Call after securely supplying the production env. Never logs credentials or account emails. */
export async function editorialRulesRelease(activate = false, verifyLive?: () => Promise<void>) {
  if (activate && !verifyLive) throw new Error('live_rules_verifier_required');
  const project = process.env.FIREBASE_ADMIN_PROJECT_ID!;
  const auth = new GoogleAuth({ credentials: { client_email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    private_key: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n') }, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;
  async function api(path: string, method = 'GET', body?: unknown) {
    const r = await fetch(`https://firebaserules.googleapis.com/v1/${path}`, { method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await r.json();
    if (!r.ok) throw new Error(`rules_http_${r.status}:${JSON.stringify(data.error?.message)}`);
    return data;
  }
  const releases = (await api(`projects/${project}/releases`)).releases;
  const validated: Array<{ name: string; source: unknown; old: string }> = [];
  for (const file of ['firestore.rules', 'storage.rules']) {
    const storage = file === 'storage.rules';
    const source = { files: [{ name: file, content: await readFile(file, 'utf8') }] };
    const release = releases.find((r: { name: string }) => r.name.includes(storage ? '/firebase.storage/' : '/cloud.firestore'));
    if (!release) throw new Error('rules_release_missing');
    const prefix = storage ? '/b/test-bucket/o/article-imports/user/test.jpg' : '/databases/(default)/documents/drafts/test';
    const cases = [
      { email: 'milo@aproposmagazine.com', verified: true, exists: false, active: false, expectation: 'ALLOW' },
      { email: 'casper@aproposmagazine.com', verified: true, exists: false, active: false, expectation: 'ALLOW' },
      { email: 'frederik@aproposmagazine.com', verified: true, exists: true, active: true, expectation: 'ALLOW' },
      { email: 'other@aproposmagazine.com', verified: true, exists: true, active: true, expectation: 'DENY' },
      { email: 'test@aproposmagazine.com.evil.test', verified: true, exists: false, active: false, expectation: 'DENY' },
      { email: 'milo@aproposmagazine.com', verified: false, exists: false, active: false, expectation: 'DENY' },
      { email: 'test@example.com', verified: true, exists: true, active: true, expectation: 'DENY' },
      { email: 'milo@aproposmagazine.com', verified: true, exists: true, active: false, expectation: 'DENY' },
      { email: 'test@example.com', verified: true, exists: true, active: false, expectation: 'DENY' },
    ].map(c => ({ expectation: c.expectation, request: { path: prefix, method: storage ? 'write' : 'get',
      auth: { uid: 'user', token: { email: c.email, email_verified: c.verified } } },
      resource: { data: { userId: 'user' } }, functionMocks: [
        { function: storage ? 'firestore.exists' : 'exists', args: [{ anyValue: {} }], result: { value: c.exists } },
        { function: storage ? 'firestore.get' : 'get', args: [{ anyValue: {} }], result: { value: { data: { active: c.active } } } },
      ] }));
    const report = await api(`projects/${project}:test`, 'POST', { source, testSuite: { testCases: cases } });
    console.log(JSON.stringify({ file, issues: report.issues, tests: report.testResults?.map((x: { state: string; debugMessages: unknown }) => ({ state: x.state, debug: x.debugMessages })) }));
    if (report.issues?.some((x: { severity: string }) => x.severity === 'ERROR') || report.testResults?.length !== cases.length ||
      report.testResults.some((x: { state: string }) => x.state !== 'SUCCESS')) throw new Error('rules_tests_failed');
    validated.push({ name: release.name, old: release.rulesetName, source });
  }
  if (!activate) return;
  // IAM provisioning belongs to the project administrator, not the application.
  // Require direct client-flow verification and roll back only our exact releases
  // on failure. Never impersonate Google service agents to deploy application rules.
  // Only migrate the existing explicit admin list, never all Firebase users.
  await migrateEditorialAdministrators();
  const applied: Array<{ name: string; old: string; current: string }> = [];
  try {
  for (const item of validated) {
    const current = await api(item.name);
    if (current.rulesetName !== item.old) throw new Error('rules_changed_concurrently');
    const ruleset = await api(`projects/${project}/rulesets`, 'POST', { source: item.source });
    await api(`${item.name}?updateMask=rulesetName`, 'PATCH', { release: { name: item.name, rulesetName: ruleset.name } });
    applied.push({ name: item.name, old: item.old, current: ruleset.name });
    const readback = await api(item.name);
    if (readback.rulesetName !== ruleset.name) throw new Error('rules_readback_mismatch');
    console.log(JSON.stringify({ release: item.name, previous: item.old, current: ruleset.name }));
  }
  await verifyLive!();
  } catch (error) {
    for (const item of applied.reverse()) {
      const current = await api(item.name);
      if (current.rulesetName !== item.current) throw new Error('rules_rollback_concurrent_change');
      await api(`${item.name}?updateMask=rulesetName`, 'PATCH', { release: { name: item.name, rulesetName: item.old } });
      if ((await api(item.name)).rulesetName !== item.old) throw new Error('rules_rollback_readback_failed');
      console.log(JSON.stringify({ rollback: item.name, restored: item.old }));
    }
    throw error;
  }
}
