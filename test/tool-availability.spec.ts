import { expect, it } from 'vitest';
import { describeTools } from '@/lib/tool-availability';

it('opens manual Writer but not image generation when funding resumes under the 50 DKK policy', () => {
  const signals = { paidAiBlocked: false, accreditationPaused: true, inboxAutoRespond: false,
    manualWriterOnly: true, manualWriterBudgetAvailable: true };
  const tools = describeTools(signals, { owner: true });
  expect(tools.find(x => x.id === 'ai-writer')).toMatchObject({ hidden: false, status: expect.stringContaining('50 kr.') });
  expect(tools.find(x => x.id === 'image-gen')?.hidden).toBe(true);
  expect(describeTools({ ...signals, manualWriterBudgetAvailable: false }, { owner: true }).find(x => x.id === 'ai-writer')?.hidden).toBe(true);
  expect(describeTools({ ...signals, paidAiBlocked: true }, { owner: true }).find(x => x.id === 'ai-writer')?.hidden).toBe(true);
});

it('hides only explicitly paused/blocked tools and keeps their data routes', () => {
  const tools = describeTools({ paidAiBlocked: true, accreditationPaused: true, inboxAutoRespond: false }, { owner: true });
  expect(tools.filter(x => x.hidden).map(x => x.id)).toEqual(['ai-writer', 'image-gen', 'akkreditering']);
  expect(tools.filter(x => !x.hidden).map(x => x.id)).toContain('push-desk');
  expect(tools.every(x => x.description && x.path)).toBe(true);
});
it.each([false, true, null])('keeps the manual inbox visible near the top when autosvar is %s', (inboxAutoRespond) => {
  const signals = { paidAiBlocked: true, accreditationPaused: true, inboxAutoRespond };
  const tools = describeTools(signals, { owner: true });
  expect(tools.filter(x => !x.hidden).slice(0, 4).map(x => x.id)).toEqual([
    'chatgpt-editorial', 'liv-desk', 'liv-inbox', 'design-editor',
  ]);
  expect(tools.find(x => x.id === 'liv-inbox')).toMatchObject({
    name: 'Livs indbakke', hidden: false, path: '/ai?view=liv-inbox',
    status: inboxAutoRespond === false ? 'Autosvar slået fra. Manuel gennemgang er tilgængelig.' :
      inboxAutoRespond === null ? 'Autosvarstatus kunne ikke bekræftes.' : null,
  });
  expect(signals.inboxAutoRespond).toBe(inboxAutoRespond);
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
