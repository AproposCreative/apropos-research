import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "../utils/env";

export type ArticleRecord = {
  url: string;
  hash: string;
  published_at?: string;
  title?: string;
  author?: string;
  category?: string;
  body_text?: string;
  fetched_at?: string;
  changed_from?: string;
  prev_hash?: string;
};

export type PromptChunkRecord = {
  url: string;
  hash: string;
  summary: string;
  bullets: string[];
  chunk_index: number;
  chunk_text: string;
  created_at?: string;
};

const ARTICLES_FILE = path.resolve(env.RAGE_STORAGE_DIR, "rage_articles.jsonl");
const PROMPTS_FILE = path.resolve("./prompts", "rage_prompts.jsonl");

async function ensureParentDir(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function ensureFile(filePath: string): Promise<void> {
  await ensureParentDir(filePath);
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, "", "utf8");
  }
}

async function readJsonl(filePath: string): Promise<any[]> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    if (!content.trim()) return [];
    return content
      .split(/\r?\n/) 
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line));
  } catch (err: any) {
    if (err && (err.code === "ENOENT" || err.code === "ENOTDIR")) return [];
    throw err;
  }
}

async function writeJsonl(filePath: string, records: any[]): Promise<void> {
  await ensureFile(filePath);
  const lines = records.map((r) => JSON.stringify(r));
  await fs.writeFile(filePath, lines.join("\n") + (lines.length ? "\n" : ""), "utf8");
}

async function appendJsonlIfNew<T>(filePath: string, records: T[], keyOf: (r: T) => string): Promise<{ added: number; skipped: number }>{
  await ensureFile(filePath);
  const existing = await readJsonl(filePath);
  const seen = new Set(existing.map((r: any) => keyOf(r)));
  const toAppend = records.filter((r) => {
    const k = keyOf(r);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (toAppend.length > 0) {
    const lines = toAppend.map((r) => JSON.stringify(r)).join("\n") + "\n";
    await fs.appendFile(filePath, lines, "utf8");
  }
  return { added: toAppend.length, skipped: records.length - toAppend.length };
}

async function upsertJsonlBy<T>(filePath: string, records: T[], match: (a: any, b: T) => boolean, onReplace?: (prev: any, next: any) => any): Promise<{ upserted: number }>{
  await ensureFile(filePath);
  const existing = await readJsonl(filePath);
  const result: any[] = [...existing];
  for (const rec of records) {
    const idx = result.findIndex((r) => match(r, rec));
    if (idx >= 0) result[idx] = onReplace ? onReplace(result[idx], rec) : rec;
    else result.push(rec);
  }
  await writeJsonl(filePath, result);
  return { upserted: records.length };
}

export async function appendArticles(records: ArticleRecord[]): Promise<{ added: number; skipped: number }>{
  const withTimestamps = records.map((r) => ({ ...r, fetched_at: r.fetched_at ?? new Date().toISOString() }));
  return appendJsonlIfNew<ArticleRecord>(ARTICLES_FILE, withTimestamps, (r) => `${r.url}#${r.hash}`);
}

export async function upsertArticlesByUrl(records: ArticleRecord[]): Promise<{ upserted: number }>{
  const withTimestamps = records.map((r) => ({ ...r, fetched_at: r.fetched_at ?? new Date().toISOString() }));
  return upsertJsonlBy<ArticleRecord>(
    ARTICLES_FILE,
    withTimestamps,
    (a, b) => a.url === b.url,
    (prev, next) => {
      if (prev.hash && next.hash && prev.hash !== next.hash) {
        return { ...next, changed_from: prev.url, prev_hash: prev.hash };
      }
      return next;
    },
  );
}

export async function appendPrompts(records: PromptChunkRecord[]): Promise<{ added: number; skipped: number }>{
  const withTimestamps = records.map((r) => ({ ...r, created_at: r.created_at ?? new Date().toISOString() }));
  return appendJsonlIfNew<PromptChunkRecord>(PROMPTS_FILE, withTimestamps, (r) => `${r.url}#${r.hash}#${r.chunk_index}`);
}

export async function upsertPromptsByUrlAndIndex(records: PromptChunkRecord[]): Promise<{ upserted: number }>{
  const withTimestamps = records.map((r) => ({ ...r, created_at: r.created_at ?? new Date().toISOString() }));
  return upsertJsonlBy<PromptChunkRecord>(PROMPTS_FILE, withTimestamps, (a, b) => a.url === b.url && a.chunk_index === b.chunk_index);
}

export const paths = {
  articles: ARTICLES_FILE,
  prompts: PROMPTS_FILE,
};


