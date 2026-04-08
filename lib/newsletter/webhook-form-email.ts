const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

/**
 * Udtræk e-mail fra Webflow form submission webhook `payload.data`
 * (feltnavne varierer: Email, email, osv.).
 */
export function extractEmailFromWebflowFormData(
  data: Record<string, unknown> | null | undefined
): string | null {
  if (!data || typeof data !== 'object') return null;
  const keys = ['email', 'Email', 'e-mail', 'E-mail', 'EMAIL'];
  for (const k of keys) {
    const v = data[k];
    if (typeof v !== 'string') continue;
    const t = v.trim().toLowerCase();
    if (EMAIL_RE.test(t)) return t;
  }
  for (const v of Object.values(data)) {
    if (typeof v !== 'string') continue;
    const t = v.trim().toLowerCase();
    if (EMAIL_RE.test(t)) return t;
  }
  return null;
}
