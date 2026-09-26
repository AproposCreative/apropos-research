/** Deterministic presentation repair: only a plain paragraph containing a
 * Markdown heading. Preserve every other byte, including image/credit markup.
 * No caller-supplied prose and no AI calls. */
export function normalizeLivHeadingMarkup(html: string): string {
  return html.replace(/<p>\s*(#{2,6})[ \t]+([^<>\r\n]+?)\s*<\/p>/g,
    (_whole, hashes: string, title: string) => `<h${hashes.length}>${title}</h${hashes.length}>`);
}
