// Run after next build using node --no-experimental-require-module.
// No provider calls or secrets: verify the deployed route modules can load.
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
for (const route of ['editorial/desk', 'liv/status', 'liv/plan', 'liv/preview']) {
  const mod = await import(pathToFileURL(path.resolve('.next/server/app/api', route, 'route.js')).href);
  const handlers = (mod.routeModule || mod.default.routeModule).userland;
  const method = route === 'liv/preview' ? 'POST' : 'GET';
  const response = await handlers[method](new Request(`http://localhost/api/${route}`, { method }));
  assert.equal(response.status, 401, 'Unauthenticated calls must stay blocked');
  assert.equal(typeof (await response.json()).error, 'string');
  console.log(`Runtime import OK: /api/${route}`);
}
