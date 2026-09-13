/** Unit/regression suites must use mocked providers, never real paid API calls. */
export function withoutPaidApiTransport(transport: typeof fetch): typeof fetch {
  return async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.hostname === 'api.openai.com' || url.hostname.endsWith('.openai.com')) {
      throw new Error('paid_api_disabled_in_unit_tests: mock the OpenAI transport');
    }
    return transport(input, init);
  };
}
