/**
 * WARNING: The file-based config (`data/webflow-config.json`) uses `fs` and
 * `process.cwd()`, which only works reliably in local development. On Vercel
 * serverless/edge deployments the filesystem is read-only and `process.cwd()`
 * does not point to a writable project root, so `saveWebflowConfig` will fail
 * silently or throw.
 *
 * For production, prefer environment variables (`WEBFLOW_API_TOKEN`,
 * `WEBFLOW_SITE_ID`, `WEBFLOW_ARTICLES_COLLECTION_ID`, etc.) configured via
 * the Vercel dashboard or `vercel env`. The file-based fallback is intended
 * only as a convenience during local development.
 */

import fs from 'fs';
import path from 'path';

export type WebflowConfig = {
  apiToken?: string;
  siteId?: string;
  authorsCollectionId?: string;
  articlesCollectionId?: string;
};

const CONFIG_DIR = path.join(process.cwd(), 'data');
const CONFIG_PATH = path.join(CONFIG_DIR, 'webflow-config.json');

export function readConfigFile(): WebflowConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
      return JSON.parse(raw) as WebflowConfig;
    }
  } catch {}
  return {};
}

export function getWebflowConfig(): WebflowConfig {
  return readConfigFile();
}

export function saveWebflowConfig(partial: WebflowConfig): WebflowConfig {
  const prev = readConfigFile();
  // Respect explicit empty strings from UI to allow overriding env values
  const next: WebflowConfig = { ...prev };
  if (Object.prototype.hasOwnProperty.call(partial, 'apiToken')) {
    next.apiToken = (partial.apiToken ?? '').toString().trim();
  }
  if (Object.prototype.hasOwnProperty.call(partial, 'siteId')) {
    next.siteId = (partial.siteId ?? '').toString().trim();
  }
  if (Object.prototype.hasOwnProperty.call(partial, 'authorsCollectionId')) {
    next.authorsCollectionId = (partial.authorsCollectionId ?? '').toString().trim();
  }
  if (Object.prototype.hasOwnProperty.call(partial, 'articlesCollectionId')) {
    next.articlesCollectionId = (partial.articlesCollectionId ?? '').toString().trim();
  }
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

export function getTokenPreview(token?: string): string | undefined {
  if (!token) return undefined;
  if (token.length <= 8) return token;
  return `${token.slice(0, 6)}…`;
}


