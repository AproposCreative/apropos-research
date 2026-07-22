/**
 * Centralized Environment Configuration
 * 
 * All environment variables should be accessed through this module.
 * Provides runtime validation, type safety, and clear error messages.
 */

import { z } from 'zod';

/** Tom streng i .env → undefined, så optional URL/string ikke knækker hele Zod-parse. */
const emptyToUndefined = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? undefined : v;

/**
 * Environment variable schema with validation
 */
const EnvSchema = z.object({
  // Node Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // OpenAI Configuration
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-5.4-mini'),
  OPENAI_RESEARCH_MODEL: z.string().optional(),
  
  // Base URL Configuration
  NEXT_PUBLIC_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  
  // Firebase Configuration (Public)
  NEXT_PUBLIC_FIREBASE_API_KEY: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_APP_ID: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: z.string().optional(),
  
  // Webflow Configuration
  WEBFLOW_API_TOKEN: z.string().optional(),
  WEBFLOW_SITE_ID: z.string().optional(),
  WEBFLOW_AUTHORS_COLLECTION_ID: z.string().optional(),
  WEBFLOW_ARTICLES_COLLECTION_ID: z.string().optional(),
  WEBFLOW_SECTIONS_COLLECTION_ID: z.string().optional(),
  WEBFLOW_TOPICS_COLLECTION_ID: z.string().optional(),
  WEBFLOW_FESTIVALS_COLLECTION_ID: z.string().optional(),
  WEBFLOW_STREAMING_SERVICES_COLLECTION_ID: z.string().optional(),
  /** Client Secret til Webflow API v2 webhook-signatur (x-webflow-signature). */
  WEBFLOW_WEBHOOK_CLIENT_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),
  /** Fallback-hemmelighed (?secret= eller x-webflow-webhook-secret) hvis webhook oprettes i dashboard. */
  WEBFLOW_WEBHOOK_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),
  /** Slå CMS-webhook auto-optimering fra med 0/false (publish fra app kan stadig optimerer). */
  WEBFLOW_ARTICLE_WEBHOOK_OPTIMIZE: z.enum(['true', 'false']).default('true'),
  /** CMS locale ID for dansk (primær). */
  WEBFLOW_CMS_LOCALE_DK: z.string().default('67dbf17ba540975b5b21c225'),
  /** CMS locale ID for engelsk (sekundær /en). */
  WEBFLOW_CMS_LOCALE_EN: z.string().default('690ca0f6b0d13d8788354156'),
  /** Auto-oversæt DK → EN ved publish (webhook). Slå fra med false. */
  WEBFLOW_AUTO_TRANSLATE_EN: z.enum(['true', 'false']).default('true'),
  /** Auto-udfyld tomme SEO-felter via SEO Engine (webhook). Default off indtil klar. */
  WEBFLOW_AUTO_SEO_ENGINE: z.enum(['true', 'false']).default('false'),

  // Instagram / Facebook Publishing
  INSTAGRAM_ACCOUNT_ID: z.string().optional(),
  INSTAGRAM_ACCESS_TOKEN: z.string().optional(),
  FACEBOOK_PAGE_ID: z.string().optional(),
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),

  // Firebase Admin (server-side)
  FIREBASE_ADMIN_PROJECT_ID: z.string().optional(),
  FIREBASE_ADMIN_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_ADMIN_PRIVATE_KEY: z.string().optional(),

  // TMDB Configuration
  TMDB_API_KEY: z.string().optional(),
  
  // OMDB Configuration
  OMDB_API_KEY: z.string().optional(),

  // Google Custom Search (image search)
  GOOGLE_CUSTOM_SEARCH_API_KEY: z.string().optional(),
  GOOGLE_CUSTOM_SEARCH_ENGINE_ID: z.string().optional(),

  /** Hemmelighed til server-til-server og middleware-gate på /api/* (header x-internal-api-secret). */
  INTERNAL_API_SECRET: z.preprocess(
    emptyToUndefined,
    z.union([
      z.undefined(),
      z.string().regex(
        /^[\t\x20-\x7E]+$/,
        'INTERNAL_API_SECRET må kun indeholde synlige ASCII-tegn (ingen æ, ø, å, emojis).'
      ),
    ])
  ),

  // Cron / Security — Vercel sender CRON_SECRET i Authorization-header; kun synlig ASCII (tab/space–~).
  CRON_SECRET: z.preprocess(
    emptyToUndefined,
    z.union([
      z.undefined(),
      z.string().regex(
        /^[\t\x20-\x7E]+$/,
        'CRON_SECRET må kun indeholde synlige ASCII-tegn (ingen æ, ø, å, emojis). Vercel afviser ellers deploy, fordi værdien bruges som HTTP Bearer-token.'
      ),
    ])
  ),
  /** Kun med NODE_ENV=development: tillad /api/cron/newsletter-weekly uden fredag ≥12 København (ægte claim/send). */
  NEWSLETTER_WEEKLY_BYPASS_TIME_GATE: z.enum(['true', 'false']).default('false'),
  /** Vercel: deployment hostname uden protokol (fx `proj-xxx.vercel.app`). Bruges bl.a. til nyhedsbrevslogo når NEXT_PUBLIC_BASE_URL ikke er sat. */
  VERCEL_URL: z.preprocess(emptyToUndefined, z.string().optional()),
  /** Vercel: produktions-hostname (fx `dit-domæne.dk` eller `proj.vercel.app`) — prioriteres over VERCEL_URL til statiske assets i mail. */
  VERCEL_PROJECT_PRODUCTION_URL: z.preprocess(emptyToUndefined, z.string().optional()),

  // Resend (nyhedsbrev)
  RESEND_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  RESEND_FROM_EMAIL: z.preprocess(emptyToUndefined, z.string().optional()),
  WEBFLOW_NEWSLETTER_SIGNUPS_COLLECTION_ID: z.string().optional(),
  WEBFLOW_SIGNUP_EMAIL_FIELD_SLUG: z.string().optional(),
  NEWSLETTER_ARTICLE_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  /** Valgfri absolut URL til logo-PNG i nyhedsbrev (ellers /images/apropos-newsletter-logo.png på siteUrl) */
  NEWSLETTER_LOGO_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  /** HMAC-hemmelighed til signeret frameldingslink i nyhedsbrev (brug en lang tilfældig streng) */
  NEWSLETTER_UNSUBSCRIBE_SECRET: z.string().optional(),
  /** Server-only: absolut origin hvor /api/newsletter/unsubscribe findes (fx https://subscribe.aproposmagazine.com). Prioriteres over NEXT_PUBLIC_BASE_URL til afmeld-links. */
  NEWSLETTER_UNSUBSCRIBE_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  /** Webflow Forms API: form-id eller del af form-navn (auto-detect hvis tom) */
  WEBFLOW_NEWSLETTER_FORM_ID: z.string().optional(),
  /** Hemmelighed til velkomst-webhook (?secret= eller header x-newsletter-webhook-secret) */
  NEWSLETTER_WEBHOOK_SECRET: z.string().optional(),
  /** Emnefelt for automatisk velkomstmail (webhook) */
  NEWSLETTER_WELCOME_SUBJECT: z.string().optional(),
  /** Slå velkomst-webhook til med true; default false = pause */
  NEWSLETTER_WELCOME_WEBHOOK_ENABLED: z.enum(['true', 'false']).default('false'),

  /** GA4 (browser) — valgfri; UTM i mail virker først hvor gtag er installeret (fx Webflow). */
  NEXT_PUBLIC_GA_MEASUREMENT_ID: z.preprocess(emptyToUndefined, z.string().optional()),
  /** Numerisk GA4 Property ID til Data API (dashboard) — fx 484743571. */
  GA4_PROPERTY_ID: z.preprocess(emptyToUndefined, z.string().optional()),
  /** GA4 Measurement Protocol (server) — til Resend-webhooks (åbning/klik). */
  GA4_MEASUREMENT_ID: z.preprocess(emptyToUndefined, z.string().optional()),
  GA4_MEASUREMENT_PROTOCOL_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),
  /** Svix signing secret fra Resend Webhooks (whsec_…). */
  RESEND_WEBHOOK_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),
  /** Funding Desk afsender (fx funding@aproposmagazine.com) */
  FUNDING_FROM_EMAIL: z.preprocess(emptyToUndefined, z.string().optional()),
  /** Domæne til Reply-To alias funding+{threadId}@domain (Resend inbound) */
  FUNDING_INBOUND_DOMAIN: z.preprocess(emptyToUndefined, z.string().optional()),

  /** Cloud Run podcast-processor base URL (fx https://podcast-processor-xxx.run.app) */
  PODCAST_PROCESSOR_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  /** Trigger URL for eksisterende iOS sendPodcastNotification (FCM topic new_podcasts) */
  PODCAST_NOTIFY_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  /** Matcher Firebase secret PODCAST_NOTIFY_SECRET → header X-Apropos-Podcast-Secret */
  PODCAST_NOTIFY_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),
  /** Valgfri override af Storage bucket til podcast-filer */
  PODCAST_STORAGE_BUCKET: z.preprocess(emptyToUndefined, z.string().optional()),

  // Research Provider Configuration
  RESEARCH_PROVIDER: z.enum(['openai_responses', 'legacy_web_search']).default('openai_responses'),
  RESEARCH_FALLBACK_PROVIDER: z.enum(['legacy_web_search', 'none']).default('legacy_web_search'),
  RESEARCH_MIN_SOURCES: z.string().default('2').transform(Number).pipe(z.number().int().min(0)),
  RESEARCH_MIN_CONTEXT_CHARS: z.string().default('240').transform(Number).pipe(z.number().int().min(0)),
  RESEARCH_TIMEOUT_MS: z.string().default('15000').transform(Number).pipe(z.number().int().min(1000)),
  RESEARCH_DEBUG_LOG: z.enum(['true', 'false']).default('false'),

  // Stripe billing (Apropos Research subscriptions)
  STRIPE_SECRET_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  STRIPE_WEBHOOK_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  STRIPE_PRICE_STARTER: z.preprocess(emptyToUndefined, z.string().optional()),
  STRIPE_PRICE_PRO: z.preprocess(emptyToUndefined, z.string().optional()),
  STRIPE_PRICE_STUDIO: z.preprocess(emptyToUndefined, z.string().optional()),
  BILLING_DISABLED: z.enum(['true', 'false']).default('false'),
  BILLING_BYPASS_UIDS: z.preprocess(emptyToUndefined, z.string().optional()),

  // RAGE Ingestion Configuration (CLI)
  RAGE_BASE_URL: z.string().url().default('https://soundvenue.com'),
  RAGE_FEED_PATH: z.string().default('/feed'),
  RAGE_SITEMAP_INDEX: z.string().default('/sitemap.xml'),
  RAGE_RATE_LIMIT_RPS: z.string().transform(Number).pipe(z.number().positive()).default(1),
  RAGE_STORAGE_DIR: z.string().default('./data'),
  RAGE_USER_AGENT: z.string().default('OnkelRageknivBot/1.0'),
});

/**
 * Parse and validate environment variables
 */
function parseEnv() {
  const parsed = EnvSchema.safeParse(process.env);
  
  if (!parsed.success) {
    const errors = parsed.error.issues.map(err => 
      `  - ${err.path.join('.')}: ${err.message}`
    ).join('\n');
    
    const errorMessage = `❌ Invalid environment configuration:\n${errors}\n\n` +
      `Please check your .env file or environment variables.`;
    
    // In production, throw immediately
    if (process.env.NODE_ENV === 'production') {
      throw new Error(errorMessage);
    }
    
    // In development, log warning but continue with defaults where possible
    console.warn(errorMessage);
    console.warn('⚠️  Continuing with partial configuration. Some features may not work.');
  }
  
  return parsed.success ? parsed.data : {
    // Provide safe defaults for development
    NODE_ENV: (process.env.NODE_ENV as any) || 'development',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
    OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-5.4-mini',
    OPENAI_RESEARCH_MODEL: process.env.OPENAI_RESEARCH_MODEL,
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
    WEBFLOW_API_TOKEN: process.env.WEBFLOW_API_TOKEN,
    WEBFLOW_SITE_ID: process.env.WEBFLOW_SITE_ID,
    WEBFLOW_AUTHORS_COLLECTION_ID: process.env.WEBFLOW_AUTHORS_COLLECTION_ID,
    WEBFLOW_ARTICLES_COLLECTION_ID: process.env.WEBFLOW_ARTICLES_COLLECTION_ID,
    WEBFLOW_SECTIONS_COLLECTION_ID: process.env.WEBFLOW_SECTIONS_COLLECTION_ID,
    WEBFLOW_TOPICS_COLLECTION_ID: process.env.WEBFLOW_TOPICS_COLLECTION_ID,
    WEBFLOW_FESTIVALS_COLLECTION_ID: process.env.WEBFLOW_FESTIVALS_COLLECTION_ID,
    WEBFLOW_STREAMING_SERVICES_COLLECTION_ID: process.env.WEBFLOW_STREAMING_SERVICES_COLLECTION_ID,
    WEBFLOW_WEBHOOK_CLIENT_SECRET: process.env.WEBFLOW_WEBHOOK_CLIENT_SECRET,
    WEBFLOW_WEBHOOK_SECRET: process.env.WEBFLOW_WEBHOOK_SECRET,
    WEBFLOW_ARTICLE_WEBHOOK_OPTIMIZE:
      process.env.WEBFLOW_ARTICLE_WEBHOOK_OPTIMIZE === 'false' ? 'false' : 'true',
    WEBFLOW_CMS_LOCALE_DK: process.env.WEBFLOW_CMS_LOCALE_DK || '67dbf17ba540975b5b21c225',
    WEBFLOW_CMS_LOCALE_EN: process.env.WEBFLOW_CMS_LOCALE_EN || '690ca0f6b0d13d8788354156',
    WEBFLOW_AUTO_TRANSLATE_EN:
      process.env.WEBFLOW_AUTO_TRANSLATE_EN === 'false' ? 'false' : 'true',
    WEBFLOW_AUTO_SEO_ENGINE:
      process.env.WEBFLOW_AUTO_SEO_ENGINE === 'true' ? 'true' : 'false',
    INSTAGRAM_ACCOUNT_ID: process.env.INSTAGRAM_ACCOUNT_ID,
    INSTAGRAM_ACCESS_TOKEN: process.env.INSTAGRAM_ACCESS_TOKEN,
    FACEBOOK_PAGE_ID: process.env.FACEBOOK_PAGE_ID,
    META_APP_ID: process.env.META_APP_ID,
    META_APP_SECRET: process.env.META_APP_SECRET,
    FIREBASE_ADMIN_PROJECT_ID: process.env.FIREBASE_ADMIN_PROJECT_ID,
    FIREBASE_ADMIN_CLIENT_EMAIL: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    FIREBASE_ADMIN_PRIVATE_KEY: process.env.FIREBASE_ADMIN_PRIVATE_KEY,
    TMDB_API_KEY: process.env.TMDB_API_KEY,
    OMDB_API_KEY: process.env.OMDB_API_KEY,
    GOOGLE_CUSTOM_SEARCH_API_KEY: process.env.GOOGLE_CUSTOM_SEARCH_API_KEY,
    GOOGLE_CUSTOM_SEARCH_ENGINE_ID: process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID,
    INTERNAL_API_SECRET: process.env.INTERNAL_API_SECRET,
    CRON_SECRET: process.env.CRON_SECRET,
    NEWSLETTER_WEEKLY_BYPASS_TIME_GATE:
      process.env.NEWSLETTER_WEEKLY_BYPASS_TIME_GATE === 'true' ? 'true' : 'false',
    VERCEL_URL: process.env.VERCEL_URL,
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    WEBFLOW_NEWSLETTER_SIGNUPS_COLLECTION_ID: process.env.WEBFLOW_NEWSLETTER_SIGNUPS_COLLECTION_ID,
    WEBFLOW_SIGNUP_EMAIL_FIELD_SLUG: process.env.WEBFLOW_SIGNUP_EMAIL_FIELD_SLUG,
    NEWSLETTER_ARTICLE_BASE_URL: process.env.NEWSLETTER_ARTICLE_BASE_URL,
    NEWSLETTER_LOGO_URL: process.env.NEWSLETTER_LOGO_URL,
    NEWSLETTER_UNSUBSCRIBE_SECRET: process.env.NEWSLETTER_UNSUBSCRIBE_SECRET,
    NEWSLETTER_UNSUBSCRIBE_BASE_URL: process.env.NEWSLETTER_UNSUBSCRIBE_BASE_URL,
    WEBFLOW_NEWSLETTER_FORM_ID: process.env.WEBFLOW_NEWSLETTER_FORM_ID,
    NEWSLETTER_WEBHOOK_SECRET: process.env.NEWSLETTER_WEBHOOK_SECRET,
    NEWSLETTER_WELCOME_SUBJECT: process.env.NEWSLETTER_WELCOME_SUBJECT,
    NEWSLETTER_WELCOME_WEBHOOK_ENABLED:
      process.env.NEWSLETTER_WELCOME_WEBHOOK_ENABLED === 'true' ? 'true' : 'false',
    NEXT_PUBLIC_GA_MEASUREMENT_ID: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
    GA4_PROPERTY_ID: process.env.GA4_PROPERTY_ID,
    GA4_MEASUREMENT_ID: process.env.GA4_MEASUREMENT_ID,
    GA4_MEASUREMENT_PROTOCOL_SECRET: process.env.GA4_MEASUREMENT_PROTOCOL_SECRET,
    RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET,
    FUNDING_FROM_EMAIL: process.env.FUNDING_FROM_EMAIL,
    FUNDING_INBOUND_DOMAIN: process.env.FUNDING_INBOUND_DOMAIN,
    RESEARCH_PROVIDER: (process.env.RESEARCH_PROVIDER as any) || 'openai_responses',
    RESEARCH_FALLBACK_PROVIDER: (process.env.RESEARCH_FALLBACK_PROVIDER as any) || 'legacy_web_search',
    RESEARCH_MIN_SOURCES: Number(process.env.RESEARCH_MIN_SOURCES || '2'),
    RESEARCH_MIN_CONTEXT_CHARS: Number(process.env.RESEARCH_MIN_CONTEXT_CHARS || '240'),
    RESEARCH_TIMEOUT_MS: Number(process.env.RESEARCH_TIMEOUT_MS || '15000'),
    RESEARCH_DEBUG_LOG: (process.env.RESEARCH_DEBUG_LOG as any) || 'false',
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    STRIPE_PRICE_STARTER: process.env.STRIPE_PRICE_STARTER,
    STRIPE_PRICE_PRO: process.env.STRIPE_PRICE_PRO,
    STRIPE_PRICE_STUDIO: process.env.STRIPE_PRICE_STUDIO,
    BILLING_DISABLED: process.env.BILLING_DISABLED === 'true' ? 'true' : 'false',
    BILLING_BYPASS_UIDS: process.env.BILLING_BYPASS_UIDS,
    RAGE_BASE_URL: process.env.RAGE_BASE_URL || 'https://soundvenue.com',
    RAGE_FEED_PATH: process.env.RAGE_FEED_PATH || '/feed',
    RAGE_SITEMAP_INDEX: process.env.RAGE_SITEMAP_INDEX || '/sitemap.xml',
    RAGE_RATE_LIMIT_RPS: Number(process.env.RAGE_RATE_LIMIT_RPS || '1'),
    RAGE_STORAGE_DIR: process.env.RAGE_STORAGE_DIR || './data',
    RAGE_USER_AGENT: process.env.RAGE_USER_AGENT || 'OnkelRageknivBot/1.0',
  };
}

/**
 * Validated environment configuration
 * Access all environment variables through this object
 */
export const env = parseEnv();

/**
 * Type-safe environment configuration
 */
export type Env = typeof env;

/**
 * Check if required environment variables are set
 */
export function validateRequiredEnv(): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  
  if (!env.OPENAI_API_KEY) {
    missing.push('OPENAI_API_KEY');
  }
  
  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Get environment-specific configuration
 */
export const config = {
  isDevelopment: env.NODE_ENV === 'development',
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  
  // API Configuration
  openai: {
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL,
    researchModel: env.OPENAI_RESEARCH_MODEL || env.OPENAI_MODEL,
  },
  
  // Base URL helpers
  baseUrl: env.NEXT_PUBLIC_BASE_URL || (typeof window !== 'undefined' 
    ? `${window.location.protocol}//${window.location.host}`
    : 'http://localhost:3000'),
  
  // Feature flags
  features: {
    tmdb: !!env.TMDB_API_KEY,
    omdb: !!env.OMDB_API_KEY,
    webflow: !!(env.WEBFLOW_API_TOKEN && env.WEBFLOW_SITE_ID),
    instagram: !!(env.INSTAGRAM_ACCOUNT_ID && env.INSTAGRAM_ACCESS_TOKEN),
    facebook: !!env.FACEBOOK_PAGE_ID,
    googleSearch: !!(env.GOOGLE_CUSTOM_SEARCH_API_KEY && env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID),
  },
} as const;
