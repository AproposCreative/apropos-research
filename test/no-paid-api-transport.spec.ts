import { expect, it, vi } from 'vitest';
import { withoutPaidApiTransport } from './no-paid-api-transport';

it.each(['https://api.openai.com/v1/responses', 'https://api.openai.com/v1/images/generations'])
('blocks real provider transport before it can spend: %s', async url => {
  const transport = vi.fn();
  await expect(withoutPaidApiTransport(transport)(url)).rejects.toThrow('paid_api_disabled_in_unit_tests');
  expect(transport).not.toHaveBeenCalled();
});
it('supports Request inputs and permits explicit mocked local transports', async () => {
  const transport = vi.fn().mockResolvedValue(new Response('ok'));
  const guarded = withoutPaidApiTransport(transport);
  await expect(guarded(new Request('https://api.openai.com/v1/chat/completions'))).rejects.toThrow('paid_api_disabled');
  expect(await (await guarded('http://localhost/mock')).text()).toBe('ok');
  expect(transport).toHaveBeenCalledTimes(1);
});
