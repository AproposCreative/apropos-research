'use client';
import { useState } from 'react';
import { useAuth } from '../../lib/auth-context';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';

const SplineAnimation = dynamic(() => import('../../components/SplineAnimation'), { ssr: false });

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');

  const { signIn, signUp, resetPassword, signInWithGoogle } = useAuth();
  const router = useRouter();

  const formatAuthError = (err: any) => {
    const code = String(err?.code || '').replace('auth/', '');
    switch (code) {
      case 'invalid-email':
        return 'Ugyldig emailadresse';
      case 'missing-password':
      case 'weak-password':
        return 'Ugyldigt eller manglende password';
      case 'user-not-found':
        return 'Bruger findes ikke';
      case 'wrong-password':
      case 'invalid-credential':
        return 'Forkert email eller password';
      case 'popup-closed-by-user':
        return 'Login‑vinduet blev lukket';
      case 'popup-blocked':
        return 'Popup blev blokeret – tillad popups og prøv igen';
      case 'operation-not-allowed':
        return 'Login‑metoden er ikke aktiveret i Firebase';
      case 'network-request-failed':
        return 'Netværksfejl – prøv igen';
      default:
        return err?.message || 'Der opstod en fejl ved login';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (isSignUp) {
        await signUp(email, password);
        setSuccess('Thank you! Your submission has been received!');
        setIsSignUp(false);
      } else {
        await signIn(email, password);
        setSuccess('Thank you! Your submission has been received!');
        setTimeout(() => {
          router.push('/ai');
        }, 1500);
      }
    } catch (error: any) {
      setError(formatAuthError(error));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await signInWithGoogle();
      setSuccess('Thank you! Your submission has been received!');
      setTimeout(() => {
        router.push('/ai');
      }, 1500);
    } catch (error: any) {
      setError(formatAuthError(error));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await resetPassword(forgotEmail);
      setSuccess('Password reset email sent! Check your inbox.');
      setShowForgotPassword(false);
    } catch (error: any) {
      setError('Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  if (showForgotPassword) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Reset Password
              </h1>
              <p className="text-gray-600">
                Enter your email to receive a password reset link
              </p>
            </div>

            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            {success && (
              <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                {success}
              </div>
            )}

            <form onSubmit={handleForgotPassword} className="space-y-6">
              <div>
                <label htmlFor="forgot-email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <input
                  id="forgot-email"
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                  placeholder="Enter your email"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Sending...' : 'Send Reset Email'}
              </button>
            </form>

            <div className="mt-6 text-center">
              <button
                onClick={() => setShowForgotPassword(false)}
                className="text-blue-600 hover:text-blue-700 text-sm font-medium transition-colors"
              >
                ← Back to Login
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: 'rgb(0,0,0)' }}>
      {/* Left Side - Login Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">

          {/* Main Card */}
          <div className="rounded-2xl p-8 border border-white/10 bg-black/60">
            {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">
              {isSignUp ? 'Create an account' : 'Login'}
            </h1>
          </div>

          {/* Social Login Button */}
          <div className="mb-6">
            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full flex items-center justify-center px-4 py-3 border border-white/20 rounded-lg hover:bg-white/10 transition-colors text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Log in with Google
            </button>
          </div>

          {/* Divider */}
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/20" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-black text-white/60">or</span>
            </div>
          </div>

          {/* Success/Error Messages */}
          {success && (
            <div className="mb-4 p-4 bg-green-900/20 border border-green-500/30 rounded-lg text-green-300 text-sm">
              {success}
            </div>
          )}

          {error && (
            <div className="mb-4 p-4 bg-red-900/20 border border-red-500/30 rounded-lg text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Field */}
            <div>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="w-full px-4 py-3 border border-white/20 rounded-lg bg-black text-white placeholder-white/40 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                required
              />
            </div>

            {/* Password Field */}
            <div>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full px-4 py-3 border border-white/20 rounded-lg bg-black text-white placeholder-white/40 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                required
              />
            </div>

            {/* Forgot Password */}
            {!isSignUp && (
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(true)}
                  className="text-white hover:text-white/80 text-sm font-medium transition-colors"
                >
                  Forgot your password?
                </button>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-white text-black hover:bg-white/90 font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Please wait...' : (isSignUp ? 'Create Account' : 'Login')}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-8 text-center">
            <p className="text-sm text-white/70 mb-4">
              {isSignUp ? 'Already have an account?' : "Don't have an account?"}
            </p>
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError('');
                setSuccess('');
              }}
              className="text-white hover:text-white/80 text-sm font-medium transition-colors"
            >
              {isSignUp ? 'Login instead' : 'Create an account'}
            </button>
          </div>

          </div>
        </div>
      </div>

      {/* Right Side - Spline Embed */}
      <div className="flex-1 relative overflow-hidden">
        <div className="absolute inset-0">
          <iframe
            src={process.env.NEXT_PUBLIC_SPLINE_LOGIN_EMBED_URL || 'https://my.spline.design/animatedbackgroundgradientforweb-k9vy84HznMWrADyOW44KZ3Ue/'}
            frameBorder="0"
            allow="autoplay; fullscreen; vr"
            className="w-full h-full"
          />
        </div>
        {/* Centered white logo overlay */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <img
            src="/images/Apropos Research White.png"
            alt="Apropos Research"
            className="w-64 h-auto drop-shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
          />
        </div>
      </div>
    </div>
  );
}