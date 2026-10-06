'use client';

import React, { useRef, useState } from 'react';
import { ACCESS_MESSAGE, ACCESS_TIMEOUT_MESSAGE, ACCESS_UNAVAILABLE_MESSAGE } from '@/lib/auth-access-client';

const button = 'min-h-12 w-full rounded-xl border border-white/20 px-5 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:opacity-40';

export function connectionLoginMessage(cause: unknown, method: 'google' | 'password'): string {
  const message = cause instanceof Error ? cause.message : '';
  if ([ACCESS_MESSAGE, ACCESS_TIMEOUT_MESSAGE, ACCESS_UNAVAILABLE_MESSAGE].includes(message)) return message;
  const code = cause && typeof cause === 'object' && 'code' in cause ? cause.code : '';
  if (code === 'auth/popup-blocked') return 'Browseren blokerede Google-vinduet. Tillad pop op-vinduer for Apropos, og tryk på Fortsæt med Google igen.';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return 'Google-login blev afbrudt. Tryk på Fortsæt med Google, når du er klar.';
  if (code === 'auth/network-request-failed') return 'Forbindelsen blev afbrudt. Kontrollér dit netværk, og prøv igen.';
  if (method === 'google') return 'Google-login kunne ikke bekræftes. Brug den Google-konto, du allerede bruger i Apropos.';
  return 'Login kunne ikke bekræftes. Kontrollér din Apropos-mail og adgangskode. Bruger du normalt Google, skal du vælge Fortsæt med Google.';
}

export default function ConnectionLogin({ signIn, signInWithGoogle, accessError }: {
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  accessError: string;
}) {
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'google' | 'password' | null>(null), [error, setError] = useState('');
  const inFlight = useRef(false);
  async function login(method: 'google' | 'password') {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(method); setError('');
    try {
      // Use the same sign-in and server access checks as the normal Apropos app.
      // This authenticates only; it does not grant ChatGPT access or publish.
      if (method === 'google') await signInWithGoogle();
      else await signIn(email.trim(), password);
    } catch (cause) { setError(connectionLoginMessage(cause, method)); }
    finally { inFlight.current = false; setBusy(null); }
  }
  return <div className="space-y-5">
    <div className="space-y-2">
      <p>Log ind på Apropos AI</p>
      <p className="text-sm leading-relaxed text-white/65">Brug samme konto som på Apropos. Med Google behøver du ikke en separat Apropos-adgangskode.</p>
    </div>
    <button type="button" className={`${button} flex items-center justify-center gap-3 bg-white font-medium text-[#000] hover:bg-white/90`} disabled={busy !== null} onClick={() => login('google')}>
      <svg aria-hidden="true" className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
      </svg>
      {busy === 'google' ? 'Åbner Google …' : 'Fortsæt med Google'}
    </button>
    <details className="border-t border-white/15 pt-4">
      <summary className="flex min-h-12 cursor-pointer items-center text-sm text-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">Brug e-mail og adgangskode</summary>
      <form className="mt-4 space-y-4" onSubmit={event => { event.preventDefault(); void login('password'); }}>
        <label className="block">E-mail<input autoComplete="username" type="email" name="email" required value={email} onChange={event => setEmail(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-white/25 bg-transparent p-3" /></label>
        <label className="block">Adgangskode<input autoComplete="current-password" type="password" name="password" required value={password} onChange={event => setPassword(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-white/25 bg-transparent p-3" /></label>
        <button type="submit" className={`${button} bg-white/10 text-white hover:bg-white/15`} disabled={busy !== null}>{busy === 'password' ? 'Logger ind …' : 'Log ind med adgangskode'}</button>
      </form>
    </details>
    {(error || accessError) && <p role="alert" className="rounded-xl border border-red-400/40 p-4 text-sm text-red-200">{error || accessError}</p>}
    <p className="text-xs text-white/50">Brug din verificerede Apropos-mail. Du får personlig adgang til dine kladder og udgivelser, ikke kollegernes private arbejde.</p>
  </div>;
}
