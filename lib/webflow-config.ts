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


