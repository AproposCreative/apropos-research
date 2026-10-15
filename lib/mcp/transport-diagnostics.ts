import { MCP_VERSION } from './config';

// Fixed categories only: SDK errors can contain caller-controlled headers/data.
// Never log request/response bodies, credentials, URLs, identities or raw errors.
export function transportErrorCategory(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (message.startsWith('Bad Request: Unsupported protocol version: ')) return 'unsupported_protocol_version';
  if (message === 'Parse error: Invalid JSON') return 'invalid_json';
  if (message === 'Parse error: Invalid JSON-RPC message') return 'invalid_json_rpc';
  if (message === 'Invalid Request: Only one initialization request is allowed') return 'batched_initialization';
  if (message === 'Not Acceptable: Client must accept both application/json and text/event-stream') return 'unsupported_accept';
  if (message === 'Unsupported Media Type: Content-Type must be application/json') return 'unsupported_content_type';
  return 'transport_error';
}

export function logTransportRejection(request: Request, status: number, category: string) {
  const protocol = request.headers.get('mcp-protocol-version');
  console.warn('mcp_transport_rejected', {
    version: MCP_VERSION, status, category,
    protocolVersion: protocol === null ? 'absent' : /^\d{4}-\d{2}-\d{2}$/.test(protocol) ? protocol : 'invalid',
  });
}
