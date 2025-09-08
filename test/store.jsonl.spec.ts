import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { appendArticles, upsertArticlesByUrl, paths } from "../src/store/jsonl";

async function resetFiles() {
  try { await fs.unlink(paths.articles); } catch {}
}

describe("jsonl store", () => {
  beforeEach(async () => { await resetFiles(); });

  it("dedupes same url+hash and records change on new hash", async () => {
    const url = "https://example.com/x";
    const a1 = { url, hash: "h1", body_text: "text" } as any;
    const a2 = { url, hash: "h1", body_text: "text" } as any;
    const a3 = { url, hash: "h2", body_text: "new text" } as any;

    const r1 = await appendArticles([a1]);
    expect(r1.added).toBe(1);
    const r2 = await appendArticles([a2]);
    expect(r2.added).toBe(0);

    const u1 = await upsertArticlesByUrl([a3]);
    expect(u1.upserted).toBe(1);
    const lines = (await fs.readFile(paths.articles, "utf8")).trim().split(/\n/);
    const last = JSON.parse(lines[lines.length - 1]);
    expect(last.prev_hash).toBe("h1");
  });
});


