/**
 * Centralized Environment Configuration
 * 
 * All environment variables should be accessed through this module.
 * Provides runtime validation, type safety, and clear error messages.
 */

import { z } from 'zod';

/**
 * Environment variable schema with validation
 */
const EnvSchema = z.object({
  // Node Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // OpenAI Configuration
  OPENAI_API_KEY: z.string().min(1, 'OpenAI API key is required'),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_RESEARCH_MODEL: z.string().optional(),
  
  // Base URL Configuration
  NEXT_PUBLIC_BASE_URL: z.string().url().optional(),
  
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
  
  // TMDB Configuration
  TMDB_API_KEY: z.string().optional(),
  
  // OMDB Configuration
  OMDB_API_KEY: z.string().optional(),
  
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
    OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4o-mini',
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
    TMDB_API_KEY: process.env.TMDB_API_KEY,
    OMDB_API_KEY: process.env.OMDB_API_KEY,
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
  },
} as const;
