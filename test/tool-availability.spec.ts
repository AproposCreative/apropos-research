import { expect, it } from 'vitest';
import { describeTools } from '@/lib/tool-availability';

it('hides only explicitly paused/blocked tools and keeps their data routes', () => {
  const tools = describeTools({ paidAiBlocked: true, accreditationPaused: true, inboxAutoRespond: false }, { owner: true });
  expect(tools.filter(x => x.hidden).map(x => x.id)).toEqual(['ai-writer', 'image-gen', 'akkreditering', 'liv-inbox']);
  expect(tools.filter(x => !x.hidden).map(x => x.id)).toContain('push-desk');
  expect(tools.every(x => x.description && x.path)).toBe(true);
});
it('does not call unknown status paused, or hide based on inactivity', () => {
  const tools = describeTools({ paidAiBlocked: null, accreditationPaused: null, inboxAutoRespond: null }, { owner: true });
  expect(tools.every(x => !x.hidden)).toBe(true);
  expect(tools.find(x => x.id === 'ai-writer')?.status).toContain('ikke bekræftes');
});
it('restores entries when stored flags change without editing the registry', () => {
  expect(describeTools({ paidAiBlocked: false, accreditationPaused: false, inboxAutoRespond: true }, { owner: true }).every(x => !x.hidden)).toBe(true);
});
it('does not expose private owner tools or the owner chat to colleagues', () => {
  const ids = describeTools({ paidAiBlocked: true, accreditationPaused: true, inboxAutoRespond: null }, { owner: false }).map(x => x.id);
  expect(ids).toEqual(['liv-desk', 'design-editor', 'dashboard', 'ai-writer', 'akkreditering']);
});
