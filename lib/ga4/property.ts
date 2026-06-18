import { env } from '@/lib/config/env';

/** Numerisk GA4 Property ID (fx 484743571) — bruges til Data API (`properties/{id}`). */
export function getGa4PropertyId(): string | undefined {
  return env.GA4_PROPERTY_ID?.trim() || undefined;
}

export function getGa4PropertyResourceName(): string | undefined {
  const id = getGa4PropertyId();
  return id ? `properties/${id}` : undefined;
}
