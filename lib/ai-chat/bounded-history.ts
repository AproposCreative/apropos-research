export const WRITER_HISTORY_MAX_MESSAGES = 12;
export const WRITER_HISTORY_MAX_CHARS = 24_000;

type ChatMessage = { role: 'user' | 'assistant'; content: string };

/** Reserve space for the current request first; it is never clipped or omitted. */
export function boundedWriterConversation(history: unknown, currentRequest: string): ChatMessage[] {
  const current: ChatMessage = { role: 'user', content: currentRequest };
  if (!Array.isArray(history)) return [current];
  let remaining = Math.max(0, WRITER_HISTORY_MAX_CHARS - currentRequest.length);
  const recent: ChatMessage[] = [];
  for (let i = history.length - 1; i >= 0 && recent.length < WRITER_HISTORY_MAX_MESSAGES && remaining > 0; i--) {
    const entry = history[i];
    if (!entry || (entry.role !== 'user' && entry.role !== 'assistant') || typeof entry.content !== 'string' || !entry.content.trim()) continue;
    let content = entry.content;
    if (content.length > remaining) {
      const marker = '\n[Ældre samtaletekst forkortet]\n';
      if (remaining <= marker.length) break;
      // Preserve both the opening instructions and ending of a large recent turn.
      const available = remaining - marker.length;
      const head = Math.ceil(available / 2);
      const tail = available - head;
      content = content.slice(0, head) + marker + (tail ? content.slice(-tail) : '');
    }
    recent.push({ role: entry.role, content });
    remaining -= content.length;
  }
  return [...recent.reverse(), current];
}
