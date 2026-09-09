import { describe, expect, it } from 'vitest';
import { stripUndefined } from '@/lib/accreditation/persistence/firestore-kit';

describe('stripUndefined (deep)', () => {
  it('removes top-level undefined', () => {
    expect(stripUndefined({ a: 1, b: undefined })).toEqual({ a: 1 });
  });

  it('removes undefined nested inside objects', () => {
    expect(stripUndefined({ a: { b: undefined, c: 2 } })).toEqual({ a: { c: 2 } });
  });

  it('removes undefined nested inside array elements (messages[].resendEmailId regression)', () => {
    const input = {
      id: 'thread-1',
      messages: [
        { id: 'm1', direction: 'outbound', resendEmailId: undefined, subject: 'Hej' },
        { id: 'm2', direction: 'inbound', aiSummary: undefined, text: 'Svar' },
      ],
    } as Record<string, unknown>;

    const out = stripUndefined(input);

    expect(out).toEqual({
      id: 'thread-1',
      messages: [
        { id: 'm1', direction: 'outbound', subject: 'Hej' },
        { id: 'm2', direction: 'inbound', text: 'Svar' },
      ],
    });

    const firstMessage = (out.messages as Array<Record<string, unknown>>)[0];
    expect('resendEmailId' in firstMessage).toBe(false);
    // Firestore would reject any remaining undefined value.
    expect(JSON.stringify(out)).not.toContain('undefined');
  });

  it('preserves falsy values (0, empty string, false, null)', () => {
    expect(stripUndefined({ a: 0, b: '', c: false, d: null })).toEqual({
      a: 0,
      b: '',
      c: false,
      d: null,
    });
  });
});
