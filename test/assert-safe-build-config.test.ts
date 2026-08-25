import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanBuildConfig } from "../scripts/assert-safe-build-config.mjs";

const temporaryDirectories: string[] = [];

async function fixture(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "onkel-config-scan-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe("build configuration security scan", () => {
  it("accepts the expected PostCSS configuration", async () => {
    const directory = await fixture();
    await writeFile(path.join(directory, "postcss.config.js"), "module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };\n");
    await expect(scanBuildConfig(directory)).resolves.toEqual([]);
  });

  it("rejects dynamic evaluation", async () => {
    const directory = await fixture();
    await writeFile(path.join(directory, "postcss.config.js"), "eval(payload);\n");
    await expect(scanBuildConfig(directory)).resolves.toContain("postcss.config.js: contains dynamic eval");
  });

  it("recursively rejects unusually long obfuscated lines", async () => {
    const directory = await fixture();
    await writeFile(path.join(directory, "next.config.mjs"), `export default '${"x".repeat(5_000)}';\n`);
    await expect(scanBuildConfig(directory)).resolves.toContain("next.config.mjs: contains an unusually long line (5018 characters)");
  });
});
