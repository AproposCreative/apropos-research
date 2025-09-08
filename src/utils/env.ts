import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  RAGE_BASE_URL: z.string().url(),
  RAGE_FEED_PATH: z.string().startsWith("/"),
  RAGE_SITEMAP_INDEX: z.string().startsWith("/"),
  RAGE_RATE_LIMIT_RPS: z
    .string()
    .transform((v) => Number(v))
    .pipe(z.number().positive()),
  RAGE_STORAGE_DIR: z.string(),
  RAGE_USER_AGENT: z.string().min(1),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;


