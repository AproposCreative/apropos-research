import { describe, it, expect } from 'vitest';
import { editorialRole, isSameOriginApi, requestHeaders } from '../lib/auth-policy';

describe('editorial access', () => {
  it('requires a verified named colleague', () => {
    for (const email of ['Milo@Aproposmagazine.com', 'casper@aproposmagazine.com', 'frederik@aproposmagazine.com']) {
      expect(editorialRole({ email, emailVerified: true })).toBe('editor');
      expect(editorialRole({ email, emailVerified: false })).toBeNull();
    }
    for (const email of ['a@aproposmagazine.com.evil.test', 'a@sub.aproposmagazine.com', 'a@gmail.com']) {
      expect(editorialRole({ email, emailVerified: true })).toBeNull();
    }
    expect(editorialRole({ email: 'a@aproposmagazine.com' })).toBeNull();
  });
  it('does not allow old allowlist or bootstrap entries to bypass the three-address restriction', () => {
    const user = { email: 'guest@example.com', emailVerified: true };
    expect(editorialRole({ ...user, entry: { active: true, role: 'editor' } })).toBeNull();
    expect(editorialRole({ ...user, bootstrapAdmin: true })).toBeNull();
    expect(editorialRole({ email: 'other@aproposmagazine.com', emailVerified: true, entry: { active: true, role: 'admin' } })).toBeNull();
    expect(editorialRole({ ...user, entry: { active: false, role: 'editor' } })).toBeNull();
    expect(editorialRole({ ...user, disabled: true, bootstrapAdmin: true })).toBeNull();
    expect(editorialRole({ ...user, emailVerified: false, bootstrapAdmin: true })).toBeNull();
  });
  it('preserves existing verified administrators without elevating domain users', () => {
    expect(editorialRole({ email: 'frederik@aproposmagazine.com', emailVerified: true, bootstrapAdmin: true })).toBe('admin');
    expect(editorialRole({ email: 'milo@aproposmagazine.com', emailVerified: true, entry: { active: false, role: 'editor' } })).toBeNull();
  });
});

describe('token destination', () => {
  const origin = 'https://ai.aproposmagazine.com';
  it('rejects prefix attacks, protocol-relative foreign URLs and non-API paths', () => {
    for (const value of [origin + '.evil.test/api/test', '//evil.test/api/test', '/page?x=/api/test']) {
      expect(isSameOriginApi(value, origin)).toBe(false);
    }
    expect(isSameOriginApi('/api/test', origin)).toBe(true);
    expect(isSameOriginApi(new Request(origin + '/api/test'), origin)).toBe(true);
  });
  it('preserves Request headers unless init replaces them', () => {
    const req = new Request(origin + '/api/test', { headers: { Authorization: 'Bearer existing', 'X-Test': 'yes' } });
    expect(requestHeaders(req).get('authorization')).toBe('Bearer existing');
    expect(requestHeaders(req, { headers: { 'X-New': 'yes' } }).has('authorization')).toBe(false);
  });
});
