import { createContext, runInContext } from 'node:vm';
import { expect, it, vi } from 'vitest';
import { mailWidgetHtml } from '@/lib/mcp/mail-widget';

// Actual embedded script with inert DOM/host doubles, not browser automation.
// No network, real mailbox, real consent tokens or live send operations.
function widget(openai: Record<string, unknown> = {}) {
  const elements = new Map<string, any>(), listeners = new Map<string, Function>();
  const element = (id: string) => {
    if (!elements.has(id)) elements.set(id, { textContent: '', disabled: false, style: {}, value: '',
      classList: { remove: vi.fn(), add: vi.fn() }, replaceChildren: vi.fn(), append: vi.fn(),
      closest: () => element(`${id}-parent`) });
    return elements.get(id);
  };
  const parent = { postMessage: vi.fn() }, timers: Function[] = [];
  const window = { openai, addEventListener: (name: string, fn: Function) => listeners.set(name, fn) };
  const context = createContext({ window, parent, document: { getElementById: element,
    createElement: () => element(`created-${elements.size}`), head: { appendChild: vi.fn() },
    body: {}, documentElement: { scrollHeight: 1200 } },
    ResizeObserver: class { observe() {} }, setInterval: vi.fn(), clearTimeout: vi.fn(),
    setTimeout: (fn: Function) => { timers.push(fn); return timers.length; },
    crypto: { randomUUID: () => 'fixture-request' } });
  runInContext(mailWidgetHtml.split('<script>')[1].split('</script>')[0], context);
  const run = (source: string) => runInContext(source, context);
  return { element, parent, timers, openai, run,
    receive: (result: unknown) => { context.result = result; run('receive(result)'); },
    globals: (globals: Record<string, unknown>) => listeners.get('openai:set_globals')!({ detail: { globals } }),
    message: (data: unknown) => listeners.get('message')!({ source: parent, data }),
    state: () => run('({data,confirmation,attempted})') };
}
const draft = (revision = 2, status = 'draft') => ({ draftId: 'fixture-draft', revision,
  contentHash: `hash-${revision}`, status, updatedAt: '2026-10-22T10:00:00.000Z',
  previewReadAt: '2026-10-22T10:01:00.000Z', from: 'owner@example.test', fromName: 'Owner',
  to: 'test@example.test', cc: [], bcc: [], subject: 'Test', body: 'Exact text', bodyText: 'Exact text',
  source: { kind: 'compose', body: '' } });
const preview = (revision = 2) => ({ structuredContent: draft(revision),
  _meta: { confirmation: { token: 'FIXTURE-NOT-A-REAL-TOKEN', expiresAt: Date.now() + 600000 } } });
const accepted = () => ({ structuredContent: { ...draft(2, 'accepted'), approvedAt: '2026-10-22T10:02:00Z',
  previewReadAt: '2026-10-22T10:03:00Z', receipt: { acceptedBySmtp: true,
    acceptedAt: '2026-10-22T10:02:01Z', recipientDeliveryVerified: false,
    sentFolderSync: { status: 'verified', folder: 'INBOX.Sent Messages' } } } });
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

it.each(['mcp_tool_result', 'call_tool_result'])('loads full canonical %s envelope without pairing another output with its consent', key => {
  const w = widget({ toolOutput: { ...draft(1), body: 'Stale global text' }, toolResponseMetadata: { status: 'success', [key]: preview() } });
  expect(w.element('body').textContent).toBe('Exact text');
  expect(w.state().data.revision).toBe(2); expect(w.state().confirmation.token).toBe('FIXTURE-NOT-A-REAL-TOKEN');
  expect(w.element('send').disabled).toBe(false);
  expect(w.parent.postMessage.mock.calls.map(c => c[0].method)).toEqual(['ui/initialize']);
});
it('supports old flat widget metadata and delayed globals after initialization', () => {
  const w = widget(); expect(w.state().data).toBeNull();
  w.globals({ toolOutput: preview().structuredContent, toolResponseMetadata: preview()._meta });
  expect(w.element('send').disabled).toBe(false); expect(w.element('to').textContent).toBe('test@example.test');
});
it('missing private metadata never enables sending; malformed/error results do not crash or erase the mail', () => {
  const w = widget({ toolOutput: draft() }); expect(w.element('send').disabled).toBe(true);
  for (const value of [null, { content: [{ type: 'text', text: 'not JSON' }] }, { isError: true, structuredContent: draft(9) }]) w.receive(value);
  expect(w.state().data.revision).toBe(2); expect(w.element('body').textContent).toBe('Exact text');
});
it('rejects stale status, older revision and another draft; receipt never enables send', () => {
  const w = widget(); w.receive(preview()); w.receive(accepted()); w.receive(preview());
  w.receive({ structuredContent: { ...draft(8), draftId: 'another' } });
  expect(w.state().data.status).toBe('accepted'); expect(w.element('send').disabled).toBe(true);
  expect(w.element('receipt').append.mock.calls.map(c => c[0].textContent).join('\n')).toContain('Levering til modtager: ikke dokumenteret');
});
it('replays height once standard initialization finishes even when content was sized earlier', async () => {
  const w = widget({ toolOutput: draft() }); w.run('reportHeight()');
  w.message({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2026-01-26' } }); await flush();
  expect(w.parent.postMessage).toHaveBeenCalledWith(expect.objectContaining({ method: 'ui/notifications/size-changed', params: { height: 1200 } }), '*');
});
it('uses supported compatibility sizing when no standard bridge is ready', () => {
  const notifyIntrinsicHeight = vi.fn(); widget({ toolOutput: draft(), notifyIntrinsicHeight });
  expect(notifyIntrinsicHeight).toHaveBeenCalledWith(1200);
});
it('does not announce historical receipts just because a card opens or refreshes', async () => {
  const sendFollowUpMessage = vi.fn(); const w = widget({ sendFollowUpMessage }); w.receive(accepted()); await flush();
  expect(sendFollowUpMessage).not.toHaveBeenCalled();
});
it('one explicit fixture click sends once and announces the actual receipt once, without consent or body', async () => {
  const callTool = vi.fn().mockResolvedValue(accepted()), sendFollowUpMessage = vi.fn().mockResolvedValue({});
  const w = widget({ toolOutput: draft(), toolResponseMetadata: preview()._meta, callTool, sendFollowUpMessage });
  const first = w.element('send').onclick(); const duplicate = w.element('send').onclick(); await Promise.all([first, duplicate]); await flush();
  expect(callTool).toHaveBeenCalledTimes(1); expect(callTool.mock.calls[0][0]).toBe('confirm_editorial_reply');
  w.receive(accepted()); await flush(); expect(sendFollowUpMessage).toHaveBeenCalledTimes(1);
  const text = sendFollowUpMessage.mock.calls[0][0].prompt;
  expect(text).toContain('"recipientDeliveryVerified":false'); expect(text).toContain('INBOX.Sent Messages');
  expect(text).not.toContain('FIXTURE-NOT-A-REAL-TOKEN'); expect(text).not.toContain('Exact text');
  expect(w.element('send').disabled).toBe(true);
});
it('a lost send acknowledgement stays locked, schedules status readback and never retries SMTP', async () => {
  const callTool = vi.fn().mockRejectedValue(Error('lost acknowledgement')), sendFollowUpMessage = vi.fn();
  const w = widget({ toolOutput: draft(), toolResponseMetadata: preview()._meta, callTool, sendFollowUpMessage });
  await w.element('send').onclick(); await w.element('send').onclick();
  expect(callTool).toHaveBeenCalledTimes(1); expect(w.element('send').disabled).toBe(true);
  expect(w.timers).toHaveLength(2); expect(sendFollowUpMessage).not.toHaveBeenCalled();
});
