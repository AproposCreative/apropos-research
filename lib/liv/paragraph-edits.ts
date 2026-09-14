import { load } from 'cheerio';
import { livBodyText } from './article-length';

export type LivBodyEdit = { index: number; before: string; after: string };
export function livEditableParagraphs(content: string) {
  const protectedRanges = [...content.matchAll(/<(figure|blockquote)\b[^>]*>[\s\S]*?<\/\1>/gi)]
    .map(match => [match.index!, match.index! + match[0].length]);
  return [...content.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((match, index) => ({
    index, before: load(match[1]).root().text(), html: match[0], offset: match.index!,
    editable: !/<[^>]+>/.test(match[1]) && !protectedRanges.some(([start, end]) => match.index! >= start && match.index! < end),
  }));
}

/** Apply only exact plain-text paragraph patches. Keep all other bytes, including
 * source links, quotations, credits and image markup. Not an editorial verdict. */
export function applyLivParagraphEdits(content: string, value: unknown, scopeText = content, alreadyChanged = 0): string {
  if (!Array.isArray(value) || !value.length || value.length > 60) throw new Error('liv_fact_revision_invalid');
  const paragraphs = livEditableParagraphs(content), edits = new Map<number, LivBodyEdit>();
  let changed = alreadyChanged;
  for (const edit of value) {
    const paragraph = paragraphs[edit?.index];
    if (!edit || !Number.isInteger(edit.index) || edits.has(edit.index) || !paragraph?.editable ||
      typeof edit.before !== 'string' || typeof edit.after !== 'string' || paragraph.before !== edit.before ||
      edit.before === edit.after || edit.before.length > 6000 || edit.after.length > 6000 ||
      /[<>\x00-\x1f]/.test(edit.after) || /https?:\/\//i.test(edit.after)) throw new Error('liv_fact_revision_invalid_body_edit');
    edits.set(edit.index, edit);
    changed += Math.max(edit.before.length, edit.after.length);
  }
  if (changed > livBodyText(scopeText).length * 0.8) throw new Error('liv_fact_revision_scope_exceeded');
  const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let revised = content;
  for (const paragraph of [...paragraphs].reverse()) {
    const edit = edits.get(paragraph.index);
    if (!edit) continue;
    const replacement = edit.after.trim() ? paragraph.html.replace(/^(<p\b[^>]*>)[\s\S]*(<\/p>)$/i,
      (_, open: string, close: string) => `${open}${escape(edit.after)}${close}`) : '';
    revised = revised.slice(0, paragraph.offset) + replacement + revised.slice(paragraph.offset + paragraph.html.length);
  }
  if (livEditableParagraphs(revised).filter(p => p.before.trim()).length < 3) throw new Error('liv_fact_revision_length_failed');
  return revised;
}
