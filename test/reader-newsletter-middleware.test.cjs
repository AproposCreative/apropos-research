'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { stripTypeScriptTypes } = require('node:module');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const sourcePath = path.resolve(__dirname, '../lib/api/middleware-auth.ts');
assert.equal(typeof stripTypeScriptTypes, 'function', 'Use the existing Node 22 built-in TypeScript stripper.');

// Execute the actual source, including its path/method and staff-access guards.
// Only its three runtime imports and export marker are replaced. In particular,
// no authentication decision is reimplemented by this harness or a regex.
let executable = stripTypeScriptTypes(readFileSync(sourcePath, 'utf8'), { mode: 'strip' });
for (const declaration of [
  "import { verifyEditorialToken } from '@/lib/editorial-access';",
  "import { requiresEditorialOwner } from '@/lib/editorial-capabilities';",
  "import { mcpRequestAccess } from '@/lib/mcp/oauth';",
]) {
  assert.equal(executable.split(declaration).length - 1, 1, `Expected exactly one source import: ${declaration}`);
  executable = executable.replace(declaration, '');
}
const exportedFunction = 'export async function isApiRequestAuthorized';
assert.equal(executable.split(exportedFunction).length - 1, 1, 'Expected the actual middleware export.');
executable = executable.replace(exportedFunction, 'async function isApiRequestAuthorized');
executable += '\nglobalThis.middlewareUnderTest = isApiRequestAuthorized;\n';

function middleware({ environment = {}, access = {}, ownerRequired = () => false, mcpAccess = null } = {}) {
  const calls = { verify: [], owner: [], mcp: [] };
  const context = vm.createContext({
    // Never inherit the developer machine's environment or credentials.
    process: Object.freeze({ env: Object.freeze({ ...environment, NODE_ENV: 'production' }) }),
    verifyEditorialToken: async (token) => {
      calls.verify.push(token);
      return Object.hasOwn(access, token) ? access[token] : null;
    },
    requiresEditorialOwner: (pathname, method) => {
      calls.owner.push([pathname, method]);
      return ownerRequired(pathname, method);
    },
    mcpRequestAccess: async (request) => {
      calls.mcp.push([request.nextUrl.pathname, request.method]);
      return mcpAccess;
    },
  });
  new vm.Script(executable, { filename: sourcePath }).runInContext(context, { timeout: 1_000 });
  assert.equal(typeof context.middlewareUnderTest, 'function');
  return { authorize: context.middlewareUnderTest, calls };
}

function request(pathname, method = 'POST', headers = {}) {
  const values = new Map(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]));
  return {
    method,
    nextUrl: { pathname },
    headers: { get: (name) => values.get(name.toLowerCase()) ?? null },
  };
}

test('exact native signup POST reaches its own handler without editorial or MCP authentication', async () => {
  const { authorize, calls } = middleware();
  assert.equal(await authorize(request('/api/reader-newsletter/signup')), true);
  assert.deepEqual(calls, { verify: [], owner: [], mcp: [] });
});

test('the exact signup path does not exempt any other HTTP method', async (t) => {
  for (const method of ['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'TRACE', 'post']) {
    await t.test(method, async () => {
      const { authorize, calls } = middleware();
      assert.equal(await authorize(request('/api/reader-newsletter/signup', method)), false);
      assert.deepEqual(calls, { verify: [], owner: [], mcp: [] });
    });
  }
});

test('trailing, neighboring, case-changed and staff newsletter paths remain protected', async (t) => {
  for (const pathname of [
    '/api/reader-newsletter/signup/',
    '/api/reader-newsletter/signups',
    '/api/reader-newsletter/signup/history',
    '/api/reader-newsletter/signup-evil',
    '/api/reader-newsletter/Signup',
    '/api/Reader-newsletter/signup',
    '/api/newsletter',
    '/api/newsletter/send',
    '/api/newsletter/recipients',
    '/api/newsletter/history',
    '/api/newsletter/settings',
  ]) {
    await t.test(pathname, async () => {
      const { authorize, calls } = middleware();
      assert.equal(await authorize(request(pathname)), false);
      assert.deepEqual(calls, { verify: [], owner: [], mcp: [] });
    });
  }
});

test('a reader bearer is handed to exact signup but never becomes editorial access', async () => {
  const { authorize, calls } = middleware();
  const headers = { authorization: 'Bearer reader-id-token' };
  assert.equal(await authorize(request('/api/reader-newsletter/signup', 'POST', headers)), true);
  assert.deepEqual(calls.verify, [], 'The signup handler owns Firebase/App Check verification.');
  assert.equal(await authorize(request('/api/newsletter/recipients', 'GET', headers)), false);
  assert.deepEqual(calls.verify, ['reader-id-token']);
  assert.deepEqual(calls.owner, [], 'A rejected reader token cannot reach staff capability checks.');
  assert.deepEqual(calls.mcp, []);
});

test('existing editorial access and exact owner capability checks still execute', async () => {
  const { authorize, calls } = middleware({
    access: {
      'editor-token': { role: 'editor', owner: false },
      'owner-token': { role: 'editor', owner: true },
    },
    ownerRequired: (pathname, method) => pathname === '/api/newsletter/send' && method === 'POST',
  });
  assert.equal(await authorize(request('/api/newsletter/recipients', 'GET', {
    authorization: 'Bearer editor-token',
  })), true);
  assert.equal(await authorize(request('/api/newsletter/send', 'POST', {
    authorization: 'Bearer editor-token',
  })), false);
  assert.equal(await authorize(request('/api/newsletter/send', 'POST', {
    authorization: 'Bearer owner-token',
  })), true);
  assert.deepEqual(calls.verify, ['editor-token', 'editor-token', 'owner-token']);
  assert.deepEqual(calls.owner, [
    ['/api/newsletter/recipients', 'GET'],
    ['/api/newsletter/send', 'POST'],
    ['/api/newsletter/send', 'POST'],
  ]);
  assert.deepEqual(calls.mcp, []);
});

test('the existing admin-only settings guard is not bypassed by an editorial owner', async () => {
  const { authorize, calls } = middleware({
    access: {
      'owner-token': { role: 'editor', owner: true },
      'admin-token': { role: 'admin', owner: true },
    },
  });
  assert.equal(await authorize(request('/api/newsletter/settings', 'POST', {
    authorization: 'Bearer owner-token',
  })), false);
  assert.equal(await authorize(request('/api/newsletter/settings', 'POST', {
    authorization: 'Bearer admin-token',
  })), true);
  assert.deepEqual(calls.owner, [
    ['/api/newsletter/settings', 'POST'],
    ['/api/newsletter/settings', 'POST'],
  ]);
});

test('existing internal and cron secret controls are preserved without reading ambient secrets', async () => {
  const { authorize, calls } = middleware({
    environment: { INTERNAL_API_SECRET: ' internal-fixture ', CRON_SECRET: ' cron-fixture ' },
  });
  assert.equal(await authorize(request('/api/newsletter/send', 'POST', {
    'x-internal-api-secret': ' internal-fixture ',
  })), true);
  assert.equal(await authorize(request('/api/newsletter/send', 'POST', {
    authorization: 'Bearer internal-fixture',
  })), true);
  assert.equal(await authorize(request('/api/newsletter/send', 'POST', {
    authorization: 'Bearer cron-fixture',
  })), true);
  assert.deepEqual(calls, { verify: [], owner: [], mcp: [] });
  assert.equal(await authorize(request('/api/newsletter/send', 'POST', {
    authorization: 'Bearer wrong-fixture',
  })), false);
  assert.deepEqual(calls.verify, ['wrong-fixture']);
});

test('existing self-authenticated public routes retain their exact method and prefix behavior', async () => {
  const { authorize, calls } = middleware();
  assert.equal(await authorize(request('/api/health', 'GET')), true);
  assert.equal(await authorize(request('/api/newsletter/webhook/example', 'POST')), true);
  assert.equal(await authorize(request('/api/newsletter/unsubscribe', 'GET')), true);
  assert.equal(await authorize(request('/api/auth/mail', 'POST')), true);
  assert.equal(await authorize(request('/api/auth/mail', 'GET')), false);
  assert.deepEqual(calls, { verify: [], owner: [], mcp: [] });
});

test('MCP membership remains restricted to the existing personal submission endpoint', async () => {
  const { authorize, calls } = middleware({ mcpAccess: { uid: 'fixture-member' } });
  assert.equal(await authorize(request('/api/editorial/submissions', 'GET')), true);
  assert.equal(await authorize(request('/api/editorial/submissions', 'POST')), true);
  assert.equal(await authorize(request('/api/editorial/submissions/other', 'GET')), false);
  assert.equal(await authorize(request('/api/editorial/submissions', 'DELETE')), false);
  assert.deepEqual(calls.mcp, [
    ['/api/editorial/submissions', 'GET'],
    ['/api/editorial/submissions', 'POST'],
  ]);
  assert.deepEqual(calls.verify, []);
  assert.deepEqual(calls.owner, []);
  const denied = middleware();
  assert.equal(await denied.authorize(request('/api/editorial/submissions', 'POST')), false);
});
