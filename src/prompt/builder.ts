import { z } from "zod";

export type PromptBuild = {
  summary: string;
  bullets: string[];
  chunks: string[];
};

const BuildSchema = z.object({
  title: z.string().optional(),
  body_text: z.string(),
});

function splitSentences(text: string): string[] {
  const s = text.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
  const byPunct = s
    .split(/(?<=[.!?])\s+(?=[A-ZÆØÅÄÖÜÐÞ])/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (byPunct.length >= 5) return byPunct;
  // fallback: synthesize pseudo-sentences every ~30 words
  const words = s.split(/\s+/);
  const out: string[] = [];
  const step = 30;
  for (let i = 0; i < words.length; i += step) out.push(words.slice(i, i + step).join(" "));
  return out.filter(Boolean);
}

function summarize(title: string | undefined, sentences: string[]): string {
  let picked = sentences.slice(0, 5);
  let sum = picked.join(" ");
  if (sum.length < 450) {
    for (let i = 5; i < sentences.length && sum.length < 500; i++) {
      sum += (sum ? " " : "") + sentences[i];
    }
  }
  if (sum.length > 600) sum = sum.slice(0, 597) + "…";
  let final = (title ? `${title}. ` : "") + sum;
  if (final.length > 600) final = final.slice(0, 597) + "…";
  return final;
}

function pickBulletCandidates(sentences: string[], max = 3): string[] {
  const scored = sentences.map((s, idx) => {
    let score = 0;
    if (/[0-9]{2,}/.test(s)) score += 2; // numbers/dates
    if (/[A-ZÆØÅÄÖÜÐÞ][a-zæøåäöüðþ]+\s+[A-ZÆØÅÄÖÜÐÞ][a-zæøåäöüðþ]+/.test(s)) score += 1; // name-ish
    if (s.length > 90) score += 1;
    return { s, score, idx };
  });
  scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
  return scored.slice(0, max).map(({ s }) => s);
}

function normalizeBullet(text: string): string {
  let t = text.trim().replace(/\s+/g, " ");
  t = t.replace(/^["'“”]+|["'“”]+$/g, "");
  if (t.length > 120) t = t.slice(0, 117) + "…";
  t = t.replace(/[.,;:—–-]+$/g, "");
  return t;
}

export function buildPrompts(input: unknown): PromptBuild {
  const { title, body_text } = BuildSchema.parse(input);

  const sentences = splitSentences(body_text);
  const summary = summarize(title, sentences);
  let bullets = pickBulletCandidates(sentences, 3);
  if (bullets.length < 3) {
    const used = new Set(bullets);
    for (const s of sentences) {
      if (used.size >= 3) break;
      const candidate = s.trim();
      if (!candidate) continue;
      if (!used.has(candidate)) {
        used.add(candidate);
        bullets.push(candidate);
      }
    }
  }
  // Absolute fallback when text has no punctuation: synthesize bullets from word slices
  if (bullets.length < 3) {
    const words = body_text.split(/\s+/).filter(Boolean);
    const targetPerBullet = Math.max(20, Math.min(80, Math.floor(words.length / 3)));
    for (let i = 0; i < 3 && bullets.length < 3; i++) {
      const start = i * targetPerBullet;
      const slice = words.slice(start, start + targetPerBullet).join(" ");
      if (slice) bullets.push(slice);
    }
  }
  bullets = bullets.slice(0, 3).map(normalizeBullet);

  // Chunk around 900–1400 words with hard max, sentence-aware with fallbacks
  const MIN_WORDS = 900;
  const MAX_WORDS = 1400;
  const chunks: string[] = [];
  let buf: string[] = [];
  let wcount = 0;
  const flush = () => {
    if (!buf.length) return;
    chunks.push(buf.join(" ").trim());
    buf = [];
    wcount = 0;
  };
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i].trim();
    if (!s) continue;
    const words = s.split(/\s+/).filter(Boolean);
    // if single sentence exceeds MAX, hard-split
    if (words.length > MAX_WORDS) {
      if (wcount >= MIN_WORDS) flush();
      let j = 0;
      while (j < words.length) {
        const take = Math.min(MAX_WORDS, words.length - j);
        chunks.push(words.slice(j, j + take).join(" "));
        j += take;
      }
      continue;
    }
    if (wcount + words.length <= MAX_WORDS) {
      buf.push(s);
      wcount += words.length;
      continue;
    }
    if (wcount >= MIN_WORDS) {
      flush();
      buf.push(s);
      wcount = words.length;
      continue;
    }
    // need to hard-split the sentence head to reach MIN..MAX
    const need = Math.min(MAX_WORDS - wcount, words.length);
    if (need > 0) {
      const head = words.slice(0, need).join(" ");
      buf.push(head);
      wcount += need;
    }
    flush();
    const rest = words.slice(need);
    if (rest.length) sentences.splice(i + 1, 0, rest.join(" "));
  }
  flush();

  // Post-process tiny tail: merge or redistribute to avoid < MIN_WORDS last chunk
  const wc = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
  function mergeOrRedistributeTail(list: string[]): string[] {
    if (list.length <= 1) return list;
    const lastIdx = list.length - 1;
    let last = list[lastIdx];
    let prev = list[lastIdx - 1];
    if (wc(last) >= MIN_WORDS) return list;
    if (wc(prev) + wc(last) <= MAX_WORDS) {
      list[lastIdx - 1] = (prev + " " + last).trim();
      list.pop();
      return list;
    }
    const prevWords = prev.trim().split(/\s+/);
    const tailWords = last.trim().split(/\s+/);
    while (wc(last) < MIN_WORDS && prevWords.length > MIN_WORDS) {
      const w = prevWords.pop()!;
      tailWords.unshift(w);
      last = tailWords.join(" ");
      prev = prevWords.join(" ");
      if (wc(prev) <= MAX_WORDS && wc(last) >= MIN_WORDS) break;
    }
    list[lastIdx - 1] = prevWords.join(" ").trim();
    list[lastIdx] = tailWords.join(" ").trim();
    if (wc(list[lastIdx]) < MIN_WORDS && list.length > 1) {
      list[lastIdx - 1] = (list[lastIdx - 1] + " " + list[lastIdx]).trim();
      list.pop();
    }
    return list;
  }
  const fixed = mergeOrRedistributeTail(chunks);

  return { summary, bullets, chunks: fixed };
}


