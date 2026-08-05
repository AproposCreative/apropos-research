import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const pollMailbox = vi.fn();

vi.mock('@/lib/accreditation/imap/poll', () => ({
  pollMailbox,
}));

describe('accreditation mailbox poll route auth handoff', () => {
  beforeEach(() => {
    pollMailbox.mockReset();
    pollMailbox.mockResolvedValue({ processed: 1 });
  });

  it('accepts a Firebase-authenticated Studio POST after middleware validation', async () => {
    const { POST } = await import('@/app/api/accreditation/mailboxes/poll/route');
    const request = new NextRequest('https://ai.aproposmagazine.com/api/accreditation/mailboxes/poll', {
      method: 'POST',
      headers: {
        authorization: 'Bearer firebase-id-token-validated-by-middleware',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ mailbox: 'liv_only' }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(pollMailbox).toHaveBeenCalledWith('liv');
    expect(payload.data.liv.processed).toBe(1);
  });
});
