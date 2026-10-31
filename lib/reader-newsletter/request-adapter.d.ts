export const BINDING: Readonly<{projectID: string; appID: string}>;
export const MAX_BODY_BYTES: number;
export function configuration(environment: Readonly<Record<string, string | undefined>>): Record<string, unknown>;
export function assertReaderNewsletterServiceIdentity(db: unknown, auth: unknown): void;
export function createReaderNewsletterRequestHandler(options: {
  environment: Readonly<Record<string, string | undefined>>;
  createServices: () => unknown | Promise<unknown>;
  now?: () => number;
}): (request: Request) => Promise<Response>;
