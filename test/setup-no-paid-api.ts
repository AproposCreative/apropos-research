import { withoutPaidApiTransport } from './no-paid-api-transport';

// Runs before application imports, including module-scoped OpenAI clients.
globalThis.fetch = withoutPaidApiTransport(globalThis.fetch.bind(globalThis));
