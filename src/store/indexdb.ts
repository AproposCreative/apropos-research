import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "../utils/env";

export type HeadEntry = {
  etag?: string;
  lastModified?: string;
  lastSeenAt?: string;
  lastStatus?: number;
};

export type IndexDb = {
  heads: Record<string, HeadEntry>;
};

const INDEX_PATH = path.resolve(env.RAGE_STORAGE_DIR, "index.json");

async function ensureDir(): Promise<void> {
  await fs.mkdir(path.dirname(INDEX_PATH), { recursive: true });
}

export async function readIndex(): Promise<IndexDb> {
  await ensureDir();
  try {
    const raw = await fs.readFile(INDEX_PATH, "utf8");
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || !data.heads) {
      return { heads: {} };
    }
    return { heads: { ...(data.heads as Record<string, HeadEntry>) } };
  } catch (err: any) {
    if (err && err.code === "ENOENT") return { heads: {} };
    throw err;
  }
}

export async function writeIndex(index: IndexDb): Promise<void> {
  await ensureDir();
  const tmp = INDEX_PATH + ".tmp";
  const data = JSON.stringify(index, null, 2);
  await fs.writeFile(tmp, data, "utf8");
  await fs.rename(tmp, INDEX_PATH);
}

export async function upsertHead(url: string, update: HeadEntry): Promise<void> {
  const idx = await readIndex();
  const prev = idx.heads[url] || {};
  idx.heads[url] = { ...prev, ...update };
  await writeIndex(idx);
}

export const indexPaths = { path: INDEX_PATH };


