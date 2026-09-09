// Run after next build using node --no-experimental-require-module.
// No provider calls or secrets: verify the deployed route modules can load.
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
for (const route of ['editorial/desk', 'liv/status', 'liv/plan', 'liv/preview', 'factcheck']) {
  const mod = await import(pathToFileURL(path.resolve('.next/server/app/api', route, 'route.js')).href);
  const handlers = (mod.routeModule || mod.default.routeModule).userland;
  const method = ['liv/preview', 'factcheck'].includes(route) ? 'POST' : 'GET';
  const request = new Request(`http://localhost/api/${route}`, { method });
  // Supply the URL surface used by the shared authorization helper without
  // importing NextRequest ahead of the compiled route's runtime bootstrap.
  Object.defineProperty(request, 'nextUrl', { value: new URL(request.url) });
  const response = await handlers[method](request);
  assert.equal(response.status, 401, 'Unauthenticated calls must stay blocked');
  assert.equal(typeof (await response.json()).error, 'string');
  console.log(`Runtime import OK: /api/${route}`);
}
