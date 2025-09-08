import { setTimeout as delay } from "node:timers/promises";
import { URL } from "node:url";
import { env } from "../utils/env";
import { readIndex, upsertHead } from "../store/indexdb";

type HttpMethod = "GET";

const RATE_LIMIT_INTERVAL_MS = Math.max(1000, Math.floor(1000 / env.RAGE_RATE_LIMIT_RPS));

let lastRequestAt = 0;

async function rateLimitWait(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestAt;
  if (elapsed < RATE_LIMIT_INTERVAL_MS) {
    await delay(RATE_LIMIT_INTERVAL_MS - elapsed);
  }
}

type RobotsRules = {
  disallow: string[];
};

const robotsCache = new Map<string, RobotsRules | "allow-all">();

function pathMatchesRule(pathname: string, rule: string): boolean {
  if (!rule) return false;
  if (rule === "/") return true;
  return pathname.startsWith(rule);
}

function parseRobotsTxt(text: string, userAgent: string): RobotsRules {
  const lines = text.split(/\r?\n/);
  let currentUA: string | null = null;
  const rulesForUA: Record<string, RobotsRules> = {};
  for (const lineRaw of lines) {
    const line = lineRaw.trim();
    if (!line || line.startsWith("#")) continue;
    const [keyRaw, ...rest] = line.split(":");
    if (!keyRaw || rest.length === 0) continue;
    const key = keyRaw.toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      currentUA = value.toLowerCase();
      if (!rulesForUA[currentUA]) rulesForUA[currentUA] = { disallow: [] };
    } else if (key === "disallow" && currentUA) {
      rulesForUA[currentUA].disallow.push(value);
    }
  }
  const wanted = [userAgent.toLowerCase(), "*"];
  for (const ua of wanted) {
    if (rulesForUA[ua]) return rulesForUA[ua];
  }
  return { disallow: [] };
}

async function checkRobots(url: string, opts?: { noRobots?: boolean }): Promise<void> {
  if (opts?.noRobots) return;
  const urlObj = new URL(url);
  const origin = `${urlObj.protocol}//${urlObj.host}`;
  const robotsUrl = `${origin}/robots.txt`;

  let rules = robotsCache.get(origin);
  if (!rules) {
    try {
      await rateLimitWait();
      const res = await fetch(robotsUrl, {
        method: "GET",
        headers: { "User-Agent": env.RAGE_USER_AGENT },
      });
      lastRequestAt = Date.now();
      if (!res.ok) {
        robotsCache.set(origin, "allow-all");
        return;
      }
      const text = await res.text();
      rules = parseRobotsTxt(text, env.RAGE_USER_AGENT);
      robotsCache.set(origin, rules);
    } catch {
      robotsCache.set(origin, "allow-all");
      return;
    }
  }

  if (rules !== "allow-all") {
    const pathname = urlObj.pathname;
    for (const rule of rules.disallow) {
      if (rule && pathMatchesRule(pathname, rule)) {
        throw new Error(`Blocked by robots.txt: ${pathname} disallow ${rule}`);
      }
    }
  }
}

export async function httpFetch(
  url: string,
  method: HttpMethod = "GET",
  accept: string = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  opts?: { noRobots?: boolean }
): Promise<Response> {
  await checkRobots(url, { noRobots: opts?.noRobots });

  const maxAttempts = 5;
  let attempt = 0;
  let waitMs = 1000;

  while (true) {
    const headers: Record<string, string> = {
      "User-Agent": env.RAGE_USER_AGENT,
      Accept: accept,
    };

    // Conditional headers from index
    try {
      const idx = await readIndex();
      const head = idx.heads[url];
      if (head?.etag) headers["If-None-Match"] = head.etag;
      if (head?.lastModified) headers["If-Modified-Since"] = head.lastModified;
    } catch {}

    await rateLimitWait();
    const res = await fetch(url, { method, headers, redirect: "follow" });
    lastRequestAt = Date.now();

    if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
      attempt++;
      if (attempt >= maxAttempts) return res;
      await delay(waitMs);
      waitMs = Math.min(waitMs * 2, 16000);
      continue;
    }

    // Update index on each response
    try {
      const etag = res.headers.get("etag") || undefined;
      const lastModified = res.headers.get("last-modified") || undefined;
      await upsertHead(url, {
        etag,
        lastModified,
        lastSeenAt: new Date().toISOString(),
        lastStatus: res.status,
      });
    } catch {}

    return res;
  }
}

export async function fetchText(
  url: string,
  opts?: { noRobots?: boolean }
): Promise<{ text: string; contentType: string | null; status: number }>{
  const res = await httpFetch(url, "GET", undefined as any, { noRobots: opts?.noRobots });
  if (res.status === 304) {
    return { text: "", contentType: res.headers.get("content-type"), status: 304 };
  }
  const text = await res.text();
  const contentType = res.headers.get("content-type");
  return { text, contentType, status: res.status };
}


