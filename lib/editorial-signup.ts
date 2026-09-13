import { EDITORIAL_EMAILS, normalizeAccessEmail } from './auth-policy';

type SignupUser = { uid: string; getIdToken: () => Promise<string> };
export async function registerEditorialAccount(email: string, password: string, deps: {
  create: (email: string, password: string) => Promise<{ user: SignupUser }>;
  current: () => SignupUser | null;
  send: (token: string) => Promise<void>;
}) {
  const normalized = normalizeAccessEmail(email);
  if (!normalized || !EDITORIAL_EMAILS.some(allowed => allowed === normalized)) {
    throw new Error('Adgang er kun for redaktionens tre godkendte konti.');
  }
  // A creation failure is distinct from failure of the following mail step.
  const { user } = await deps.create(normalized, password);
  try {
    const token = await user.getIdToken();
    if (deps.current()?.uid !== user.uid) throw new Error('account_changed');
    await deps.send(token);
  } catch {
    throw Object.assign(new Error('Kontoen er oprettet, men bekræftelsesmailen kunne ikke bekræftes afsendt. Opret ikke kontoen igen. Åbn mailbekræftelse for at prøve igen.'), { code: 'auth/verification-send-failed' });
  }
}
