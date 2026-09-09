// Run after next build. Reads only freshly generated deployment manifests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const forbidden = ['tmp', '.git'].map(name => path.join(root, name) + path.sep);
let count = 0;
const failures = [];
function scan(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) scan(file);
    else if (entry.name.endsWith('.nft.json')) {
      count++;
      const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const reference of manifest.files || []) {
        const target = path.resolve(path.dirname(file), reference);
        if (forbidden.some(prefix => target.startsWith(prefix)) ||
            (path.dirname(target) === root && path.basename(target).startsWith('.env'))) {
          failures.push(`${path.relative(root, file)}: ${path.relative(root, target)}`);
        }
      }
    }
  }
}
scan(path.join(root, '.next'));
assert.ok(count > 0, 'No deployment manifests found; run a fresh build first');
assert.equal(failures.length, 0, failures.slice(0, 20).join('\n'));
console.log(`${count} deployment manifests checked: no tmp, Git or root .env files included.`);
