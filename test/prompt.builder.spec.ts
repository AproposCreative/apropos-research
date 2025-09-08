import { describe, it, expect } from "vitest";
import { buildPrompts } from "../src/prompt/builder";

function makeWords(n: number): string {
  const w = "lorem";
  return Array.from({ length: n }, () => w).join(" ");
}

describe("prompt builder", () => {
  it("summary 450–600 chars, bullets=3 (≤120 each), chunks 900–1400 words", () => {
    const body = makeWords(2800);
    const res = buildPrompts({ title: "Title", body_text: body });
    expect(res.summary.length, `summary length=${res.summary.length}`).toBeGreaterThanOrEqual(450);
    expect(res.summary.length, `summary length=${res.summary.length}`).toBeLessThanOrEqual(600);
    expect(res.bullets.length, `bullets length=${res.bullets.length}`).toBe(3);
    for (const b of res.bullets) expect(b.length).toBeLessThanOrEqual(120);
    for (const c of res.chunks) {
      const wc = c.split(/\s+/).filter(Boolean).length;
      expect(wc).toBeGreaterThanOrEqual(810); // -10%
      expect(wc).toBeLessThanOrEqual(1540); // +10%
    }
  });

  it("merger tiny tail in low-punctuation text", () => {
    const words = Array.from({ length: 2200 }, (_, i) => `ord${i + 1}`).join(" ");
    const res = buildPrompts({ title: "T", body_text: words });
    expect(res.chunks.length).toBeGreaterThan(0);
    for (const c of res.chunks) {
      const count = c.trim().split(/\s+/).filter(Boolean).length;
      expect(count).toBeGreaterThanOrEqual(900);
      expect(count).toBeLessThanOrEqual(1540);
    }
  });
});


