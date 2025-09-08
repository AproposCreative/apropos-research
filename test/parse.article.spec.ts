import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseArticleHtml } from "../src/parse/article";

function readFixture(name: string) {
  return readFileSync(path.resolve(__dirname, "fixtures", name), "utf8");
}

describe("parseArticleHtml", () => {
  it("parses classic article structure and removes share/related", () => {
    const html = readFixture("fixture-a.html");
    const res = parseArticleHtml("https://example.com/a", html);
    expect(res).toBeTruthy();
    expect(res!.title && res!.title.length).toBeGreaterThan(0);
    expect(res!.body_text.length).toBeGreaterThan(50);
    expect(res!.excerpt && res!.excerpt.length).toBeGreaterThan(10);
    expect(/share|related/i.test(res!.body_text)).toBe(false);
  });

  it("parses alt article structure with byline and time[datetime]", () => {
    const html = readFixture("fixture-b.html");
    const res = parseArticleHtml("https://example.com/b", html);
    expect(res).toBeTruthy();
    expect(res!.author && res!.author.length).toBeGreaterThan(0);
    expect(res!.body_text.length).toBeGreaterThan(50);
  });
});


