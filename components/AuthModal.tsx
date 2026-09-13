'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function AuthModal() {
  const { user, signInWithGoogle, accessError, verificationEmail, sendVerification, checkVerification } = useAuth();
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');

  const handleVerification = async (check: boolean) => {
    setLoading(true);
    setError('');
    setNotice('');
    try {
      if (check) { await checkVerification(); router.replace('/ai'); }
      else { await sendVerification(); setNotice('Tjek din indbakke og spam. Vent et minut før et nyt forsøg.'); }
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'Kunne ikke kontrollere mailen. Prøv igen.');
    } finally { setLoading(false); }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      await signInWithGoogle();
      router.replace('/ai');
    } catch (error: any) {
      setError(error.message || 'Der opstod en fejl ved login');
      console.error('Error signing in with Google:', error);
    } finally {
      setLoading(false);
    }
  };

  if (user) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-black border border-white/10 rounded-2xl p-8 w-full max-w-md mx-4">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-white mb-2 font-poppins">Apropos AI Writer</h2>
          <p className="text-white/60 text-sm">Log ind for at komme i gang</p>
        </div>

        {(error || accessError) && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-red-400 text-sm" role="alert">{error || accessError}</p>
          </div>
        )}

        {verificationEmail && (
          <div className="mb-5 space-y-3 text-sm text-white/80">
            <p>Bekræft din mail: <span className="break-all">{verificationEmail}</span></p>
            <button type="button" disabled={loading} onClick={() => handleVerification(false)} className="w-full rounded-lg border border-white/30 px-4 py-3 disabled:opacity-50">Send verificeringsmail</button>
            <button type="button" disabled={loading} onClick={() => handleVerification(true)} className="w-full rounded-lg border border-white/30 px-4 py-3 disabled:opacity-50">Jeg har verificeret min mail</button>
            {notice && <p role="status">{notice}</p>}
          </div>
        )}

        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full bg-white hover:bg-gray-100 text-black font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          {loading ? 'Logger ind...' : 'Fortsæt med Google'}
        </button>

        <Link href="/login" className="mt-3 block w-full rounded-lg border border-white/30 px-4 py-3 text-center text-sm text-white hover:bg-white/10">
          Log ind med mail og adgangskode
        </Link>

        <div className="mt-6 text-center">
          <p className="text-white/40 text-xs">
            Kun for redaktionens tre godkendte og verificerede konti.
          </p>
        </div>
      </div>
    </div>
  );
}
