/**
 * Instagram access token: Firestore (prod) → data/instagram-config.json (lokal) → env.
 * UI under Indstillinger → Social gemmer her, så I slipper for manuel Vercel-opdatering.
 */

import fs from 'fs';
import path from 'path';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { env } from '@/lib/config/env';

export type InstagramTokenSource = 'firestore' | 'file' | 'env' | 'none';

export type InstagramConfigMeta = {
  hasToken: boolean;
  tokenPreview?: string;
  source: InstagramTokenSource;
  updatedAt?: string | null;
};

type FileConfig = {
  accessToken?: string;
  updatedAt?: string;
};

const CONFIG_DIR = path.join(process.cwd(), 'data');
const CONFIG_PATH = path.join(CONFIG_DIR, 'instagram-config.json');
const FIRESTORE_DOC = 'app_settings/integrations';

function tokenPreview(token?: string): string | undefined {
  if (!token) return undefined;
  if (token.length <= 12) return `${token.slice(0, 4)}…`;
  return `${token.slice(0, 8)}…${token.slice(-4)}`;
}

function readConfigFile(): FileConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as FileConfig;
    }
  } catch {
    /* ignore */
  }
  return {};
}

function writeConfigFile(accessToken: string): void {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const payload: FileConfig = {
    accessToken,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(payload, null, 2), 'utf8');
}

async function readFirestoreToken(): Promise<{ token?: string; updatedAt?: string } | null> {
  const db = getAdminDb();
  if (!db) return null;
  try {
    const snap = await db.doc(FIRESTORE_DOC).get();
    if (!snap.exists) return null;
    const data = snap.data();
    const token =
      typeof data?.instagramAccessToken === 'string' ? data.instagramAccessToken.trim() : '';
    if (!token) return null;
    const updatedAt =
      data?.instagramAccessTokenUpdatedAt?.toDate?.()?.toISOString?.() ??
      (typeof data?.instagramAccessTokenUpdatedAt === 'string'
        ? data.instagramAccessTokenUpdatedAt
        : undefined);
    return { token, updatedAt };
  } catch (err) {
    console.error('[instagram-config] Firestore read failed:', err);
    return null;
  }
}

async function writeFirestoreToken(accessToken: string): Promise<boolean> {
  const db = getAdminDb();
  if (!db) return false;
  try {
    await db.doc(FIRESTORE_DOC).set(
      {
        instagramAccessToken: accessToken,
        instagramAccessTokenUpdatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return true;
  } catch (err) {
    console.error('[instagram-config] Firestore write failed:', err);
    return false;
  }
}

/** Aktivt token til API-kald (prioritet: gemt i app → env). */
export async function resolveInstagramAccessToken(): Promise<{
  token?: string;
  source: InstagramTokenSource;
}> {
  const fromDb = await readFirestoreToken();
  if (fromDb?.token) return { token: fromDb.token, source: 'firestore' };

  const file = readConfigFile();
  if (file.accessToken?.trim()) {
    return { token: file.accessToken.trim(), source: 'file' };
  }

  const fromEnv = env.INSTAGRAM_ACCESS_TOKEN?.trim();
  if (fromEnv) return { token: fromEnv, source: 'env' };

  return { source: 'none' };
}

export async function getInstagramConfigMeta(): Promise<InstagramConfigMeta> {
  const fromDb = await readFirestoreToken();
  if (fromDb?.token) {
    return {
      hasToken: true,
      tokenPreview: tokenPreview(fromDb.token),
      source: 'firestore',
      updatedAt: fromDb.updatedAt ?? null,
    };
  }

  const file = readConfigFile();
  if (file.accessToken?.trim()) {
    return {
      hasToken: true,
      tokenPreview: tokenPreview(file.accessToken),
      source: 'file',
      updatedAt: file.updatedAt ?? null,
    };
  }

  const fromEnv = env.INSTAGRAM_ACCESS_TOKEN?.trim();
  if (fromEnv) {
    return {
      hasToken: true,
      tokenPreview: tokenPreview(fromEnv),
      source: 'env',
      updatedAt: null,
    };
  }

  return { hasToken: false, source: 'none' };
}

export async function saveInstagramAccessToken(
  accessToken: string,
): Promise<{ savedTo: Array<'firestore' | 'file'>; tokenPreview: string }> {
  const token = accessToken.trim();
  if (!token || token.length < 40) {
    throw new Error('Tokenet ser for kort ud. Indsæt hele Page access token fra konvertering.');
  }

  const savedTo: Array<'firestore' | 'file'> = [];

  if (await writeFirestoreToken(token)) {
    savedTo.push('firestore');
  }

  try {
    writeConfigFile(token);
    savedTo.push('file');
  } catch (err) {
    console.error('[instagram-config] File write failed:', err);
    if (savedTo.length === 0) {
      throw new Error(
        'Kunne ikke gemme token (hverken Firestore eller lokal fil). Tjek Firebase Admin env eller skriv til .env.local.',
      );
    }
  }

  return { savedTo, tokenPreview: tokenPreview(token) || '…' };
}
