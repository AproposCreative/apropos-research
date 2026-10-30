/** Individual unsubscribe URLs contain private tokens/addresses. Keep those out
 * of analytics, while retaining safe public article paths and campaign tags. */
export function safeNewsletterClick(link: unknown): Record<string, string> {
  if (typeof link !== 'string') return {};
  try {
    const url = new URL(link);
    const result: Record<string, string> = { click_host: url.hostname.slice(0, 80) };
    if (url.protocol !== 'https:' || !['aproposmagazine.com','www.aproposmagazine.com'].includes(url.hostname) ||
      !/^\/articles\/[a-zA-Z0-9-]+\/?$/.test(url.pathname)) return { ...result, click_type: 'other' };
    const publicUrl = new URL(url.origin + url.pathname);
    for (const key of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term']) {
      const value = url.searchParams.get(key);
      if (value && /^[a-zA-Z0-9_.-]{1,100}$/.test(value)) { result[key] = value; publicUrl.searchParams.set(key, value); }
    }
    return { ...result, link: publicUrl.toString(), click_type: 'article' };
  } catch { return {}; }
}
