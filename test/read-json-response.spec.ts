import { describe, it, expect } from 'vitest';
import { readJsonResponse } from '@/lib/api/read-json-response';

describe('Liv API response handling', () => {
  it('preserves a valid empty story list', async () => {
    await expect(readJsonResponse(Response.json({ stories: [] }))).resolves.toEqual({ stories: [] });
  });
  it.each([500, 502, 200])('does not treat empty HTTP %s as empty data', async status => {
    await expect(readJsonResponse(new Response('', { status, headers: { 'x-request-id': 'test-reference' } }))).rejects.toThrow(`HTTP ${status}, reference test-reference`);
  });
  it('reports login expiry without leaking a server response body', async () => {
    await expect(readJsonResponse(new Response('<html>private</html>', { status: 401 }))).rejects.toThrow('Log ind igen');
  });
  it('preserves a structured API error', async () => {
    await expect(readJsonResponse(Response.json({ error: 'Database utilgængelig' }, { status: 503 }))).rejects.toThrow('Database utilgængelig');
  });
  it.each(['null', '[]', '42', '{"stories":'])('rejects invalid success payload %s', async body => {
    await expect(readJsonResponse(new Response(body))).rejects.toThrow();
  });
});
