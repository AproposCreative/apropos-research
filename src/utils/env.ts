import "dotenv/config";
import { z } from "zod";

// Use defaults for optional env vars (now that we use dynamic media sources from media-sources.json)
// These are only used as fallbacks if media-sources.json doesn't exist or is empty
const defaults = {
  RAGE_BASE_URL: "https://soundvenue.com",
  RAGE_FEED_PATH: "/feed",
  RAGE_SITEMAP_INDEX: "/sitemap.xml",
  RAGE_RATE_LIMIT_RPS: "1",
  RAGE_STORAGE_DIR: "./data",
  RAGE_USER_AGENT: "OnkelRageknivBot/1.0",
};

// Merge process.env with defaults, but ignore empty strings (they override defaults)
const envWithDefaults = {
  ...defaults,
  ...Object.fromEntries(
    Object.entries(process.env).filter(([_, value]) => value !== undefined && value !== '')
  ),
};

const EnvSchema = z.object({
  RAGE_BASE_URL: z.string().url(),
  RAGE_FEED_PATH: z.string(),
  RAGE_SITEMAP_INDEX: z.string(),
  RAGE_RATE_LIMIT_RPS: z
    .string()
    .transform((v) => Number(v))
    .pipe(z.number().positive()),
  RAGE_STORAGE_DIR: z.string(),
  RAGE_USER_AGENT: z.string().min(1),
});

const parsed = EnvSchema.safeParse(envWithDefaults);
if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(parsed.error.format());
  // Use defaults even if validation fails
  console.warn("⚠️  Using default values for RAGE environment variables");
}

export const env = parsed.success ? parsed.data : {
  RAGE_BASE_URL: defaults.RAGE_BASE_URL,
  RAGE_FEED_PATH: defaults.RAGE_FEED_PATH,
  RAGE_SITEMAP_INDEX: defaults.RAGE_SITEMAP_INDEX,
  RAGE_RATE_LIMIT_RPS: Number(defaults.RAGE_RATE_LIMIT_RPS),
  RAGE_STORAGE_DIR: defaults.RAGE_STORAGE_DIR,
  RAGE_USER_AGENT: defaults.RAGE_USER_AGENT,
};


