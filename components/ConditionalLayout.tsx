'use client';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import Logo from './Logo';
import HomeNav from './HomeNav';
import MediaNav from './MediaNav';
import DarkModeToggle from './DarkModeToggle';
import Drawer from './Drawer';
import DynamicHeader from './DynamicHeader';
import BulkBar from './BulkBar';
import ProtectedRoute from './ProtectedRoute';

function MobileMenuButton() {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="md:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-white/90 dark:bg-black-800/90 backdrop-blur-sm border border-slate-200/50 dark:border-black-700/50 shadow-lg"
        aria-label="Open menu"
      >
        <svg className="w-6 h-6 text-slate-800 dark:text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      
      {isOpen && (
        <div 
          className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        >
          <aside
            className="fixed left-0 top-0 h-full w-64 bg-white/95 dark:bg-black-900/95 backdrop-blur-2xl border-r border-slate-200/50 dark:border-black-800/50 shadow-2xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <Logo />
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-black-800 transition-colors"
                  aria-label="Close menu"
                >
                  <svg className="w-6 h-6 text-slate-800 dark:text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <HomeNav />
              
              <div className="mt-8">
                <h3 className="text-xs font-semibold text-slate-500 dark:text-black-400 mb-4 tracking-wider uppercase">Medier</h3>
                <MediaNav />
              </div>
              
              <div className="mt-8 pt-8 border-t border-slate-200/50 dark:border-black-800/50">
                <DarkModeToggle />
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

function MobileSidebar() {
  // This component is now handled by MobileMenuButton
  return null;
}

export default function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  // Routes that should show the full dashboard layout
  const dashboardRoutes = ['/', '/alle-medier', '/editorial-queue', '/ai-drafts', '/search', '/shorts', '/profile', '/media-admin', '/settings'];
  
  // Routes that should show minimal layout (login, etc.)
  const isMinimalLayout = !dashboardRoutes.includes(pathname);
  const isLogin = pathname === '/login';
  
  if (isMinimalLayout) {
    // Allow access to the public login page without auth guard
    if (isLogin) return <>{children}</>;
    return <ProtectedRoute>{children}</ProtectedRoute>;
  }
  
  return (
    <ProtectedRoute>
      <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-black-950 dark:to-pure-black">
        {/* Mobile Menu Button */}
        <MobileMenuButton />
        
        {/* Sidebar - Hidden on mobile, shown on desktop */}
        <aside className="hidden md:flex w-64 bg-white/70 dark:bg-pure-black/80 backdrop-blur-2xl border-r border-slate-200/50 dark:border-black-800/50 flex-shrink-0 overflow-y-auto shadow-2xl">
          <div className="p-6">
            <Logo />
            
            <HomeNav />

            <div className="mt-8">
              <h3 className="text-xs font-semibold text-slate-500 dark:text-black-400 mb-4 tracking-wider uppercase">Medier</h3>
              <MediaNav />
            </div>

          </div>
        </aside>

        {/* Mobile Sidebar Overlay */}
        <MobileSidebar />

        {/* Main Content */}
        <div className="flex-1 flex flex-col w-full md:w-auto">
          {/* Content Area */}
          <main className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-50 to-slate-100 dark:from-black-950 dark:to-pure-black p-3 md:p-6">
            {children}
          </main>
        </div>
        <Drawer />
        <BulkBar />
      </div>
    </ProtectedRoute>
  );
}
