/** Browser host for the unchanged, sandboxed MCP widget. No credentials cross
 * into the frame. Only the exact mounted frame may request these five actions. */
export function mountMailReviewBridge(options: {
  frame: HTMLIFrameElement;
  draftId: string;
  call: (name: string, input: Record<string, unknown>) => Promise<unknown>;
  onError: (message: string) => void;
}) {
  let active = true, initialized = false;
  const names = new Set(['preview_editorial_reply', 'confirm_editorial_reply', 'save_editorial_reply', 'sync_editorial_draft', 'get_editorial_mail_thread']);
  const post = (message: unknown) => { if (active) options.frame.contentWindow?.postMessage(message, '*'); };
  async function receive(event: MessageEvent) {
    const message = event.data;
    if (!active || event.source !== options.frame.contentWindow || message?.jsonrpc !== '2.0') return;
    if (message.method === 'ui/initialize') {
      post({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: '2026-01-26', hostInfo: { name: 'Apropos private mail review', version: '1' }, hostCapabilities: {} } });
    } else if (message.method === 'ui/notifications/initialized' && !initialized) {
      initialized = true;
      try {
        const result = await options.call('preview_editorial_reply', { draftId: options.draftId });
        post({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: result });
      } catch (e) { if (active) options.onError(e instanceof Error ? e.message : 'Mailpreviewet kunne ikke hentes.'); }
    } else if (message.method === 'ui/notifications/size-changed') {
      const height = message.params?.height;
      if (typeof height === 'number' && Number.isFinite(height)) options.frame.style.height = `${Math.min(20000, Math.max(600, height))}px`;
    } else if (message.method === 'tools/call') {
      try {
        const { name, arguments: input } = message.params || {};
        if (!names.has(name) || !input || typeof input !== 'object' || Array.isArray(input)) throw Error('Ukendt mailhandling.');
        const result = await options.call(name, input);
        post({ jsonrpc: '2.0', id: message.id, result });
      } catch (e) {
        post({ jsonrpc: '2.0', id: message.id, error: { code: -32000, message: e instanceof Error ? e.message : 'Handlingen kunne ikke bekræftes. Opdatér status.' } });
      }
    }
  }
  window.addEventListener('message', receive);
  return () => { active = false; window.removeEventListener('message', receive); };
}
