import { promises as fs } from "node:fs";
import path from "node:path";

type PromptItem = {
  title: string;
  url: string;
  date?: string;
  category?: string;
  bullets: string[];
  summary: string;
  chunks: { chunk_id: string; text: string }[];
  image?: string;
};

export async function readPrompts(): Promise<PromptItem[]> {
  const filePath = path.resolve(process.cwd(), "../prompts/rage_prompts.jsonl");
  try {
    const data = await fs.readFile(filePath, "utf8");
    const items: any[] = [];
    for (const line of data.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        items.push(JSON.parse(trimmed));
      } catch {
        // skip malformed lines
      }
    }

    const grouped = new Map<string, any>();
    for (const it of items) {
      const key = it.url + "#" + (it.hash || "");
      if (!grouped.has(key)) {
        // Extract title from summary if no title field exists
        const title = it.title || (it.summary ? it.summary.split('.')[0] : "");
        
        grouped.set(key, {
          title: title,
          url: it.url,
          date: it.published_at,
          category: it.category,
          bullets: it.bullets || [],
          summary: it.summary || "",
          chunks: [],
          image: it.image,
        });
      }
      const g = grouped.get(key)!;
      if (typeof it.chunk_index === "number" && typeof it.chunk_text === "string") {
        g.chunks.push({ chunk_id: String(it.chunk_index), text: it.chunk_text });
      }
      // Update image if it exists and we don't have one yet
      if (it.image && !g.image) {
        g.image = it.image;
      }
    }
    return Array.from(grouped.values());
  } catch (err: any) {
    if (err && err.code === "ENOENT") return [];
    throw err;
  }
}


