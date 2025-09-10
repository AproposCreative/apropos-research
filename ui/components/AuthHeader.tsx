'use client';
import { useAuth } from '../lib/auth-context';
import { useRouter } from 'next/navigation';

export default function AuthHeader() {
  const { currentUser, logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  if (!currentUser) {
    return null;
  }

  return (
    <div className="flex items-center gap-3">
      <div className="text-sm text-slate-600 dark:text-slate-400">
        Welcome, {currentUser.email?.split('@')[0]}
      </div>
      <button
        onClick={handleLogout}
        className="rounded-xl border border-slate-300/50 dark:border-slate-600/50 px-3 py-1 text-xs text-slate-700 dark:text-slate-300 bg-white/70 dark:bg-slate-800/70 hover:bg-slate-100/70 dark:hover:bg-slate-700/70 transition-all duration-300 backdrop-blur-sm shadow-lg ring-1 ring-white/20 dark:ring-slate-700/50"
      >
        Logout
      </button>
    </div>
  );
}
