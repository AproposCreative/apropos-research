/** Preserve resolved author identity; never invent a profile from a name. */
export function schemaAuthor(name: string, profile?: string): Record<string, unknown> {
  const author: Record<string, unknown> = { '@type': 'Person', name: name.trim() };
  if (profile) {
    try {
      const url = new URL(profile);
      if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) author.url = url.href;
    } catch { /* Omit invalid URLs even when called without contract parsing. */ }
  }
  return author;
}
