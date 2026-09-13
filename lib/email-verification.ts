import { reload, type User } from 'firebase/auth';
import { requestAuthMail } from './auth-mail-client';

/** No side effects until the user explicitly sends or checks verification. */
export function createEmailVerificationActions(currentUser: () => User | null,
  requireAccess: (user: User) => Promise<void>) {
  let lastSent: { uid: string; at: number } | null = null;
  let sending = false;
  return {
    async sendVerification() {
      const user = currentUser();
      if (!user || user.emailVerified) throw new Error('Log ind på den konto, der skal verificeres.');
      if (sending || (lastSent?.uid === user.uid && Date.now() - lastSent.at < 60_000)) {
        throw new Error('Vent et minut, før du sender en ny verificeringsmail.');
      }
      sending = true;
      try {
        const token = await user.getIdToken();
        if (currentUser() !== user) throw new Error('Kontoen er ændret. Prøv igen.');
        await requestAuthMail({ kind: 'verify' }, token);
        lastSent = { uid: user.uid, at: Date.now() };
      } finally { sending = false; }
    },
    async checkVerification() {
      const user = currentUser();
      if (!user) throw new Error('Log ind igen for at kontrollere din mail.');
      await reload(user);
      if (currentUser() !== user) throw new Error('Kontoen er ændret. Prøv igen.');
      if (!user.emailVerified) throw new Error('Mailen er ikke verificeret endnu. Åbn linket i din indbakke først.');
      await user.getIdToken(true);
      if (currentUser() !== user) throw new Error('Kontoen er ændret. Prøv igen.');
      await requireAccess(user);
    },
  };
}
