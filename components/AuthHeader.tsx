'use client';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../lib/auth-context';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function AuthHeader() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleLogout = async () => {
    try {
      await logout();
      router.replace('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) {
    return null;
  }

  const userInitial = user.displayName?.charAt(0) || user.email?.charAt(0) || 'U';
  const userName = user.displayName || user.email?.split('@')[0] || 'User';

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Compact avatar-only button (especially for mobile) */}
      <button
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        className="group flex items-center gap-2 px-2 py-2 bg-black/60 border border-white/10 rounded-2xl shadow-lg hover:bg-black/70 transition-all duration-300"
        aria-label="Account menu"
      >
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white text-sm font-bold">
          {userInitial.toUpperCase()}
        </div>
      </button>

      {/* Dropdown Menu */}
      {isDropdownOpen && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white/90 dark:bg-pure-black/90 backdrop-blur-2xl border border-white/20 dark:border-black-800/50 rounded-2xl shadow-2xl ring-1 ring-white/10 dark:ring-black-800/20 overflow-hidden z-[99999] animate-fade-in-down">
          {/* User Info Header */}
          <div className="px-4 py-3 border-b border-white/20 dark:border-black-800/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-accent-500 rounded-full flex items-center justify-center text-white font-bold shadow-md">
                {userInitial.toUpperCase()}
              </div>
              <div>
                <div className="font-medium text-slate-800 dark:text-black-100">{userName}</div>
                <div className="text-sm text-slate-500 dark:text-black-400">{user.email}</div>
              </div>
            </div>
          </div>

          {/* Menu Items */}
          <div className="py-2">
            <Link
              href="/profile"
              className="group flex items-center gap-3 px-4 py-3 text-slate-700 dark:text-black-300 hover:bg-white/50 dark:hover:bg-black-800/50 hover:text-primary-600 dark:hover:text-primary-400 transition-all duration-200 ease-out"
              onClick={() => setIsDropdownOpen(false)}
            >
              <span className="text-lg group-hover:scale-110 transition-transform duration-200">👤</span>
              <span>Profile Settings</span>
            </Link>
            
            <Link
              href="/ai-drafts"
              className="group flex items-center gap-3 px-4 py-3 text-slate-700 dark:text-black-300 hover:bg-white/50 dark:hover:bg-black-800/50 hover:text-primary-600 dark:hover:text-primary-400 transition-all duration-200 ease-out"
              onClick={() => setIsDropdownOpen(false)}
            >
              <span className="text-lg group-hover:scale-110 transition-transform duration-200">📝</span>
              <span>AI Drafts</span>
            </Link>
            
            <Link
              href="/editorial-queue"
              className="group flex items-center gap-3 px-4 py-3 text-slate-700 dark:text-black-300 hover:bg-white/50 dark:hover:bg-black-800/50 hover:text-primary-600 dark:hover:text-primary-400 transition-all duration-200 ease-out"
              onClick={() => setIsDropdownOpen(false)}
            >
              <span className="text-lg group-hover:scale-110 transition-transform duration-200">📋</span>
              <span>Editorial Queue</span>
            </Link>

            <div className="border-t border-white/20 dark:border-black-800/50 my-2"></div>
            
            <button
              onClick={handleLogout}
              className="group flex items-center gap-3 px-4 py-3 text-error-600 dark:text-error-400 hover:bg-error-50 dark:hover:bg-error-900/20 hover:text-error-700 dark:hover:text-error-300 transition-all duration-200 ease-out w-full text-left"
            >
              <span className="text-lg group-hover:scale-110 transition-transform duration-200">🚪</span>
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
