import { afterEach, expect, it, vi } from 'vitest';
vi.mock('fs', () => ({ default: { existsSync: vi.fn(() => true), readFileSync: vi.fn(() => '{"apiToken":"local-test-token"}') } }));
import fs from 'fs';
import { getWebflowConfig } from '@/lib/webflow-config';
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it('does not read local credentials when service environment is selected', () => {
  vi.stubEnv('WEBFLOW_CONFIG_SOURCE', 'environment');
  expect(getWebflowConfig()).toEqual({});
  expect(fs.readFileSync).not.toHaveBeenCalled();
});
it('preserves the explicit local development configuration otherwise', () => {
  vi.stubEnv('WEBFLOW_CONFIG_SOURCE', '');
  expect(getWebflowConfig()).toEqual({ apiToken: 'local-test-token' });
});
