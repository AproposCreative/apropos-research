import { createContext, runInContext } from 'node:vm';
import { expect, it, vi } from 'vitest';
import { accreditationWidgetHtml } from '@/lib/mcp/accreditation-widget';

function widget(openai: Record<string, unknown> = {}) {
  const elements = new Map<string, any>();
  const element = (id: string) => {
    if (!elements.has(id)) elements.set(id, { textContent: '', disabled: false,
      classList: { remove: vi.fn() }, style: {}, parentElement: { hidden: false } });
    return elements.get(id);
  };
  const parent = { postMessage: vi.fn() }, listeners = new Map<string, Function>();
  const context = createContext({ window: { openai, addEventListener: (name: string, fn: Function) => listeners.set(name, fn) },
    parent, document: { getElementById: element, body: {}, documentElement: { scrollHeight: 900 } },
    ResizeObserver: class { observe() {} }, setInterval: vi.fn(), clearTimeout: vi.fn(),
    setTimeout: vi.fn(() => 1), Date });
  runInContext(accreditationWidgetHtml.split('<script>')[1].split('</script>')[0], context);
  return { element, parent, listeners, run: (code: string) => runInContext(code, context),
    receive: (value: unknown) => { context.value = value; runInContext('receive(value)', context); } };
}
const data = { draftId:'mcp-fixture', approvalId:'mcp-fixture', revision:1, contentHash:'a'.repeat(64), status:'draft',
  previewReadAt:'2026-10-22T12:00:00Z', fromName:'Liv Brandt',from:'liv@aproposmagazine.com',to:'press@example.org',
  subject:'Presseakkreditering',body:'Hele ansøgningen',event:{artist:'Fixture Band',venue:'Fixture Hall',date:'2027-06-14',
    ticketQuantity:1,applicants:[{name:'Frederik'}]},attachments:[] };
const confirmation = { token:'FIXTURE-ONLY',expiresAt:Date.now()+600_000 };

it('renders a canonical host result and its matching private consent in the same card', () => {
  const w=widget({toolOutput:{...data,body:'Stale global copy'},toolResponseMetadata:{mcp_tool_result:{structuredContent:data,_meta:{confirmation}}}});
  expect(w.element('body').textContent).toBe('Hele ansøgningen');
  expect(w.element('event').textContent).toContain('Fixture Band');
  expect(w.element('send').disabled).toBe(false);
  expect(w.run('confirmation.token')).toBe('FIXTURE-ONLY');
});
it('does not approve a card that lacks personal metadata or becomes stale', () => {
  const w=widget({toolOutput:data}); expect(w.element('send').disabled).toBe(true);
  w.receive({structuredContent:data,_meta:{confirmation}});
  w.receive({structuredContent:{...data,status:'accepted',previewReadAt:'2026-10-22T12:01:00Z',receipt:{acceptedByMailServer:true,sentCopyArchived:true}}});
  w.receive({structuredContent:data,_meta:{confirmation}});
  expect(w.element('send').disabled).toBe(true);
  expect(w.element('status').textContent).toContain('ikke bekræftet');
});
it('sends at most one UI request after a fixture click', async () => {
  const callTool=vi.fn().mockResolvedValue({structuredContent:{...data,status:'accepted',previewReadAt:'2026-10-22T12:01:00Z'}});
  const w=widget({toolOutput:data,toolResponseMetadata:{confirmation},callTool});
  await Promise.all([w.element('send').onclick(),w.element('send').onclick()]);
  expect(callTool).toHaveBeenCalledTimes(1);
  expect(callTool.mock.calls[0][0]).toBe('confirm_accreditation_draft');
  expect(w.element('send').disabled).toBe(true);
});
