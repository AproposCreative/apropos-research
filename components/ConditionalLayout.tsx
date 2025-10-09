'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Logo from './Logo';
import HomeNav from './HomeNav';
import MediaNav from './MediaNav';
import DarkModeToggle from './DarkModeToggle';
import Drawer from './Drawer';
import DynamicHeader from './DynamicHeader';
import AuthHeader from './AuthHeader';
import RefreshButton from './RefreshButton';
import BulkBar from './BulkBar';
import { MediaProvider } from '../lib/media-context';
import ProtectedRoute from './ProtectedRoute';

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
      <MediaProvider>
        <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-black-950 dark:to-pure-black">
      {/* Sidebar */}
      <aside className="w-64 bg-white/70 dark:bg-pure-black/80 backdrop-blur-2xl border-r border-slate-200/50 dark:border-black-800/50 flex-shrink-0 overflow-y-auto shadow-2xl">
        <div className="p-6">
          <Logo />
          
          <HomeNav />

        <div className="mt-8">
          <h3 className="text-xs font-semibold text-slate-500 dark:text-black-400 mb-4 tracking-wider uppercase">Medier</h3>
          <MediaNav />
        </div>

        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Content Area */}
        <main className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-50 to-slate-100 dark:from-black-950 dark:to-pure-black p-6">
          {children}
        </main>
      </div>
        <Drawer />
        <BulkBar />
        </div>
      </MediaProvider>
    </ProtectedRoute>
  );
}
