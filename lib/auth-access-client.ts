import type { EditorialCapabilities } from './editorial-capabilities';

export const ACCESS_MESSAGE = 'Adgang er kun for redaktionens tre godkendte og verificerede konti.';
export const ACCESS_UNAVAILABLE_MESSAGE = 'Adgangen kunne ikke kontrolleres lige nu. Prøv at logge ind igen.';
export const ACCESS_TIMEOUT_MESSAGE = 'Adgangskontrollen tog for lang tid. Prøv at logge ind igen.';
export const AUTH_ACCESS_TIMEOUT_MS = 20_000;

/** Bound both token refresh and the access request. Never log credentials. */
export async function requireAllowedUser(user: { getIdToken: () => Promise<string> }): Promise<EditorialCapabilities> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(ACCESS_TIMEOUT_MESSAGE));
      controller.abort();
    }, AUTH_ACCESS_TIMEOUT_MS);
  });
  try {
    return await Promise.race([timeout, (async () => {
      const token = await user.getIdToken();
      // A late token must not start a request after the UI has timed out.
      if (controller.signal.aborted) throw new Error(ACCESS_TIMEOUT_MESSAGE);
      const response = await fetch('/api/auth/access', {
        headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403) throw new Error(ACCESS_MESSAGE);
      if (!response.ok) throw new Error(ACCESS_UNAVAILABLE_MESSAGE);
      const body = await response.json();
      if (body.allowed !== true) throw new Error(ACCESS_MESSAGE);
      return { owner: body.capabilities?.owner === true };
    })()]);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if ([ACCESS_MESSAGE, ACCESS_UNAVAILABLE_MESSAGE, ACCESS_TIMEOUT_MESSAGE].includes(message)) throw error;
    throw new Error(ACCESS_UNAVAILABLE_MESSAGE);
  } finally {
    clearTimeout(timer);
  }
}
