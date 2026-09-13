import { readFile } from 'node:fs/promises';
import { GoogleAuth } from 'google-auth-library';
import { getAdminAuth, getAdminDb } from '../lib/firebase-admin';

/** Call after securely supplying the production env. Never logs credentials or account emails. */
export async function editorialRulesRelease(activate = false) {
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
      { email: 'test@aproposmagazine.com', verified: true, exists: false, active: false, expectation: 'ALLOW' },
      { email: 'test@aproposmagazine.com.evil.test', verified: true, exists: false, active: false, expectation: 'DENY' },
      { email: 'test@aproposmagazine.com', verified: false, exists: false, active: false, expectation: 'DENY' },
      { email: 'test@example.com', verified: true, exists: true, active: true, expectation: 'ALLOW' },
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
  // Cross-service Storage rules require this narrowly scoped service-agent role.
  async function cloud(path: string, method = 'GET', body?: unknown) {
    const response = await fetch(`https://cloudresourcemanager.googleapis.com/v1/${path}`, { method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) throw new Error(`rules_iam_http_${response.status}`);
    return response.json();
  }
  const projectInfo = await cloud(`projects/${project}`);
  const member = `serviceAccount:service-${projectInfo.projectNumber}@gcp-sa-firebasestorage.iam.gserviceaccount.com`;
  const policy = await cloud(`projects/${project}:getIamPolicy`, 'POST', { options: { requestedPolicyVersion: 3 } });
  const role = 'roles/firebaserules.firestoreServiceAgent';
  if (!policy.bindings?.some((b: { role: string; members: string[]; condition?: unknown }) => b.role === role && !b.condition && b.members.includes(member))) {
    policy.bindings = [...(policy.bindings || []), { role, members: [member] }];
    await cloud(`projects/${project}:setIamPolicy`, 'POST', { policy });
  }
  // Only migrate the existing explicit admin list, never all Firebase users.
  const database = getAdminDb()!, userAuth = getAdminAuth()!;
  for (const uid of (process.env.SEO_ENGINE_ADMIN_UIDS || '').split(',').map(x => x.trim()).filter(Boolean)) {
    const user = await userAuth.getUser(uid);
    if (!user.email || !user.emailVerified || user.disabled) throw new Error('bootstrap_admin_not_verified');
    const ref = database.collection('editorialAccess').doc(user.email.trim().toLowerCase());
    await database.runTransaction(async tx => {
      if ((await tx.get(ref)).exists) return;
      const entry = { active: true, role: 'admin', updatedBy: 'migration:existing-admin-list', updatedAt: new Date().toISOString() };
      tx.create(ref, entry);
      tx.create(database.collection('editorialAccessAudit').doc(), { email: ref.id, ...entry });
    });
  }
  for (const item of validated) {
    const current = await api(item.name);
    if (current.rulesetName !== item.old) throw new Error('rules_changed_concurrently');
    const ruleset = await api(`projects/${project}/rulesets`, 'POST', { source: item.source });
    await api(`${item.name}?updateMask=rulesetName`, 'PATCH', { release: { name: item.name, rulesetName: ruleset.name } });
    const readback = await api(item.name);
    if (readback.rulesetName !== ruleset.name) throw new Error('rules_readback_mismatch');
    console.log(JSON.stringify({ release: item.name, previous: item.old, current: ruleset.name }));
  }
}
