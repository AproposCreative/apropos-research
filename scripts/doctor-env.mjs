#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const out = {};
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function hasValue(key, mergedEnv) {
  const val = mergedEnv[key];
  return typeof val === 'string' && val.trim().length > 0;
}

function printGroup(title, keys, mergedEnv, failOnMissing) {
  console.log(`\n${title}`);
  let missingCount = 0;
  for (const key of keys) {
    const ok = hasValue(key, mergedEnv);
    if (!ok) missingCount += 1;
    console.log(`${ok ? '  ✅' : '  ❌'} ${key}`);
  }
  if (missingCount === 0) {
    console.log('  -> all set');
  } else {
    console.log(`  -> missing ${missingCount}`);
  }
  return failOnMissing ? missingCount : 0;
}

const root = process.cwd();
const envLocal = parseEnvFile(path.join(root, '.env.local'));
const envDefault = parseEnvFile(path.join(root, '.env'));
const mergedEnv = { ...envDefault, ...envLocal, ...process.env };

console.log('Apropos env doctor');
console.log(`Checking env in ${root}`);

const requiredCore = [
  'OPENAI_API_KEY',
  'WEBFLOW_API_TOKEN',
  'WEBFLOW_SITE_ID',
];

const recommendedFirebase = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
];

const recommendedInstagram = [
  'INSTAGRAM_ACCOUNT_ID',
  'INSTAGRAM_ACCESS_TOKEN',
  'FACEBOOK_PAGE_ID',
];

const recommendedFirebaseAdmin = [
  'FIREBASE_ADMIN_PROJECT_ID',
  'FIREBASE_ADMIN_CLIENT_EMAIL',
  'FIREBASE_ADMIN_PRIVATE_KEY',
];

const recommendedMediaSearch = [
  'TMDB_API_KEY',
  'OMDB_API_KEY',
  'GOOGLE_CUSTOM_SEARCH_API_KEY',
  'GOOGLE_CUSTOM_SEARCH_ENGINE_ID',
];

const recommendedBuild = [
  'NEXT_PUBLIC_BASE_URL',
  'NEXT_PUBLIC_BUILD_LABEL',
];

const optionalSecurity = [
  'CRON_SECRET',
];

const optionalNewsletter = [
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'WEBFLOW_NEWSLETTER_FORM_ID',
  'NEWSLETTER_ARTICLE_BASE_URL',
  'NEWSLETTER_LOGO_URL',
  'NEWSLETTER_UNSUBSCRIBE_SECRET',
  'WEBFLOW_NEWSLETTER_SIGNUPS_COLLECTION_ID',
  'WEBFLOW_SIGNUP_EMAIL_FIELD_SLUG',
  'NEWSLETTER_WEBHOOK_SECRET',
  'NEWSLETTER_WELCOME_SUBJECT',
  'NEWSLETTER_WELCOME_WEBHOOK_ENABLED',
];

let failures = 0;
failures += printGroup('Required (core app)', requiredCore, mergedEnv, true);
printGroup('Recommended (Firebase client)', recommendedFirebase, mergedEnv, false);
printGroup('Recommended (Firebase Admin / server)', recommendedFirebaseAdmin, mergedEnv, false);
printGroup('Recommended (Instagram / Facebook publish)', recommendedInstagram, mergedEnv, false);
printGroup('Recommended (Media search: TMDB, OMDB, Google)', recommendedMediaSearch, mergedEnv, false);
printGroup('Recommended (Build metadata)', recommendedBuild, mergedEnv, false);
printGroup('Optional (Security)', optionalSecurity, mergedEnv, false);
printGroup('Optional (Nyhedsbrev / Resend)', optionalNewsletter, mergedEnv, false);

if (failures > 0) {
  console.error('\nEnv doctor failed: missing required variables.');
  process.exit(1);
}

async function checkGoogleCustomSearch(mergedEnv) {
  const key = mergedEnv.GOOGLE_CUSTOM_SEARCH_API_KEY;
  const cx = mergedEnv.GOOGLE_CUSTOM_SEARCH_ENGINE_ID;
  console.log('\nGoogle Custom Search (live probe)');
  if (!key || !cx) {
    console.log('  ⚠️  keys not set — web search uses Wikipedia, Google News RSS, DuckDuckGo');
    return;
  }
  try {
    const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(key)}&cx=${encodeURIComponent(cx)}&q=test&num=1`;
    const res = await fetch(url);
    if (res.ok) {
      console.log('  ✅ Custom Search JSON API responds OK');
      return;
    }
    let msg = '';
    try {
      const body = await res.json();
      msg = body?.error?.message || '';
    } catch {
      /* ignore */
    }
    if (res.status === 403 && /Custom Search JSON API/i.test(msg)) {
      console.log('  ⚠️  403 — enable "Custom Search API" in Google Cloud Console (APIs & Services → Library)');
      console.log('     Fallbacks (Google News RSS, Wikipedia, DuckDuckGo) still work.');
    } else {
      console.log(`  ⚠️  HTTP ${res.status}${msg ? `: ${msg}` : ''}`);
    }
  } catch (err) {
    console.log(`  ⚠️  probe failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

await checkGoogleCustomSearch(mergedEnv);

console.log('\nEnv doctor passed.');
