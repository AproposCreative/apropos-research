import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_NAME = /(^|\.)(postcss|next|tailwind|eslint|vitest|webpack|babel|prisma)\.config\.(js|cjs|mjs|ts)$/i;
const SKIP_DIRECTORIES = new Set([".git", ".next", ".turbo", "coverage", "dist", "node_modules"]);
const MAX_CONFIG_BYTES = 20_000;
const MAX_LINE_LENGTH = 4_000;
const FORBIDDEN = [
  { label: "dynamic eval", pattern: /\beval\s*\(/ },
  { label: "Function constructor", pattern: /\bnew\s+Function\s*\(/ },
  { label: "known Ethereum-RPC loader", pattern: /1rpc\.io|eth\.drpc\.org|ethereum-rpc\.publicnode\.com|blastapi\.io/ },
];

async function candidateFiles(root, current = root) {
  const files = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRECTORIES.has(entry.name)) files.push(...await candidateFiles(root, path.join(current, entry.name)));
    } else if (entry.isFile() && CONFIG_NAME.test(entry.name)) {
      files.push(path.join(current, entry.name));
    }
  }
  return files;
}

export async function scanBuildConfig(root = DEFAULT_ROOT) {
  const failures = [];
  for (const file of await candidateFiles(root)) {
    const source = await readFile(file, "utf8");
    const relative = path.relative(root, file);
    const longestLine = source.split(/\r?\n/).reduce((max, line) => Math.max(max, line.length), 0);
    if (Buffer.byteLength(source) > MAX_CONFIG_BYTES) failures.push(`${relative}: unexpectedly large config file`);
    if (longestLine > MAX_LINE_LENGTH) failures.push(`${relative}: contains an unusually long line (${longestLine} characters)`);
    for (const rule of FORBIDDEN) {
      if (rule.pattern.test(source)) failures.push(`${relative}: contains ${rule.label}`);
    }
  }
  return failures;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const failures = await scanBuildConfig();
  if (failures.length) {
    console.error("Unsafe build configuration detected:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  } else {
    console.log("Build configuration security check passed.");
  }
}
