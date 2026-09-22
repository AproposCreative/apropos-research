import { createHash } from 'node:crypto';
import type { LivEditorialFields } from './editorial-assessment-contract';

/** Only whitespace BETWEEN block elements. Never normalize words, inline tags,
 * attributes, visible whitespace, quotes, URLs or unit boundaries. */
export const normalizeEditorialLayout = (text: string) => text.replace(
  /(<\/(?:p|h[1-6]|ul|ol|li|blockquote|figure)>)[\t\r\n ]+(?=<(?:p|h[1-6]|ul|ol|li|blockquote|figure)(?:\s|>))/g, '$1\n');

export function editorialRequestKey(request: { messages: Array<{ content: unknown }> }, fields?: LivEditorialFields) {
  const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const exact = hash(request);
  const user = request.messages[1]?.content;
  if (!fields || typeof user !== 'string') return { exact, reusable: exact };
  const input = JSON.parse(user);
  // Pixel checks keep their exact identity. Never detach a caption from its figure.
  if (input.visualEvidence || !input.fieldContext || !Array.isArray(input.units)) return { exact, reusable: exact };
  const semanticInput = { ...input,
    units: input.units.map((u: { id: string; text: string }) => ({ id: u.id, text: normalizeEditorialLayout(u.text) })),
    fieldContext: { policy: input.fieldContext.policy,
      fields: input.fieldContext.fields.map((f: { name: keyof LivEditorialFields }) =>
        ({ name: f.name, text: normalizeEditorialLayout(fields[f.name] || '') })) },
  };
  return { exact, reusable: hash({ version: 'editorial-block-layout-v1', ...request,
    messages: request.messages.map((m, i) => i === 1 ? { ...m, content: JSON.stringify(semanticInput) } : m) }) };
}
