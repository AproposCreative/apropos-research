/** Exact displayed text only. No hidden template/signature, statistics, tracking or promises. */
export function accreditationMailHtml(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  // Match Apropos' other editorial mail: a neutral sans-serif without forcing
  // light-mode colors or a panel background in Apple Mail's dark mode.
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;white-space:pre-wrap">${escaped}</div>`;
}
