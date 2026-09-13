/** Shared policy only; never trust email/domain supplied by the client. */
export type EditorialRole = 'editor' | 'admin';
export type AccessEntry = { active: boolean; role: EditorialRole };

export function normalizeAccessEmail(email: unknown): string | null {
  if (typeof email !== 'string') return null;
  const value = email.trim().toLowerCase();
  return /^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(value) ? value : null;
}

export function editorialRole(args: {
  email?: string; emailVerified?: boolean; disabled?: boolean;
  entry?: AccessEntry | null; bootstrapAdmin?: boolean;
}): EditorialRole | null {
  const email = normalizeAccessEmail(args.email);
  if (!email || !args.emailVerified || args.disabled) return null;
  // Explicit suspension also disables a domain account.
  if (args.entry?.active === false) return null;
  if (args.bootstrapAdmin) return 'admin';
  if (args.entry?.active === true) return args.entry.role === 'admin' ? 'admin' : 'editor';
  return email.split('@')[1] === 'aproposmagazine.com' ? 'editor' : null;
}

export function isSameOriginApi(input: string | URL | Request, origin: string): boolean {
  try {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, origin);
    return url.origin === new URL(origin).origin && url.pathname.startsWith('/api/');
  } catch { return false; }
}

export function requestHeaders(input: RequestInfo | URL, init?: RequestInit): Headers {
  return new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
}
