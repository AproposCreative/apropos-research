#!/usr/bin/env node
import { config } from 'dotenv';
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: join(root, '.env.local') });

if (!process.env.FIREBASE_STORAGE_BUCKET && process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) {
  process.env.FIREBASE_STORAGE_BUCKET = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
}

const child = spawn('node', ['src/server.js'], {
  cwd: join(root, 'services/podcast-processor'),
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => process.exit(code ?? 0));
