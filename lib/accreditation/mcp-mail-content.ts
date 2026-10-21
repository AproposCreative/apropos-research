/** Exact displayed text only. No hidden template/signature, statistics, tracking or promises. */
export function accreditationMailHtml(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  return `<div style="font-family:Georgia,serif;font-size:15px;line-height:1.55;color:#111;white-space:pre-wrap">${escaped}</div>`;
}
