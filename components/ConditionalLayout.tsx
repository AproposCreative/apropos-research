'use client';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
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
  const closeMenu = () => setIsOpen(false);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);
  
  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="md:hidden fixed top-3 left-3 z-50 touch-target p-2 rounded-xl bg-white/90 dark:bg-black-800/90 backdrop-blur-sm border border-slate-200/50 dark:border-black-700/50 shadow-lg app-safe-top"
        aria-label="Open menu"
      >
        <svg className="w-6 h-6 text-slate-800 dark:text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      
      {isOpen && (
        <div 
          className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={closeMenu}
          role="dialog"
          aria-modal="true"
        >
          <aside
            className="fixed left-0 top-0 h-[100dvh] w-[min(82vw,320px)] bg-white/95 dark:bg-black-900/95 backdrop-blur-2xl border-r border-slate-200/50 dark:border-black-800/50 shadow-2xl overflow-y-auto app-safe-top app-safe-bottom"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <Logo />
                <button
                  onClick={closeMenu}
                  className="touch-target p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-black-800 transition-colors"
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

function MobileBottomNav() {
  const pathname = usePathname();
  const links = [
    { href: '/alle-medier', label: 'Feed', icon: (<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h10" />) },
    { href: '/ai', label: 'AI', icon: (<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />) },
    { href: '/design-editor', label: 'Designer', icon: (<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16v12H4zM9 10h6M9 14h4" />) },
    { href: '/media-admin', label: 'Kilder', icon: (<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />) },
    { href: '/settings', label: 'Settings', icon: (<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317a1.724 1.724 0 013.35 0 1.724 1.724 0 002.573 1.066 1.724 1.724 0 012.421 2.421 1.724 1.724 0 001.066 2.573 1.724 1.724 0 010 3.35 1.724 1.724 0 00-1.066 2.573 1.724 1.724 0 01-2.421 2.421 1.724 1.724 0 00-2.573 1.066 1.724 1.724 0 01-3.35 0 1.724 1.724 0 00-2.573-1.066 1.724 1.724 0 01-2.421-2.421 1.724 1.724 0 00-1.066-2.573 1.724 1.724 0 010-3.35 1.724 1.724 0 001.066-2.573 1.724 1.724 0 012.421-2.421 1.724 1.724 0 002.573-1.066zM12 15a3 3 0 100-6 3 3 0 000 6z" />) },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-white/10 bg-black/90 backdrop-blur-xl app-safe-bottom">
      <div className="grid grid-cols-5">
        {links.map((item) => {
          const isActive = pathname === item.href || (item.href === '/alle-medier' && pathname === '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`touch-target flex flex-col items-center justify-center gap-1 py-2 text-[11px] ${isActive ? 'text-white' : 'text-white/65'}`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {item.icon}
              </svg>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
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
      <div className="flex app-shell-mobile min-h-[100dvh] bg-gradient-to-br from-slate-50 to-slate-100 dark:from-black-950 dark:to-pure-black">
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
          <main className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-50 to-slate-100 dark:from-black-950 dark:to-pure-black p-3 md:p-6 app-main-mobile-offset md:pb-6">
            {children}
          </main>
        </div>
        <MobileBottomNav />
        <Drawer />
        <BulkBar />
      </div>
    </ProtectedRoute>
  );
}
