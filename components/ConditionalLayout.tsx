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
import InspirationHub from './InspirationHub';
import { MediaProvider } from '../lib/media-context';

export default function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  // Routes that should show the full dashboard layout
  const dashboardRoutes = ['/', '/alle-medier', '/editorial-queue', '/ai-drafts', '/search', '/shorts', '/profile'];
  
  // Routes that should show minimal layout (login, etc.)
  const isMinimalLayout = !dashboardRoutes.includes(pathname);
  
  if (isMinimalLayout) {
    return <>{children}</>;
  }
  
  return (
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

          <div className="mt-8">
            <h3 className="text-xs font-semibold text-slate-500 dark:text-black-400 mb-4 tracking-wider uppercase">Explore</h3>
            <nav className="space-y-2">
              <Link href="/" className="flex items-center px-4 py-3 rounded-xl hover:bg-slate-100/50 dark:hover:bg-black-800/50 text-slate-600 dark:text-black-300 border border-transparent hover:border-slate-300/50 dark:hover:border-black-700/50 transition-all duration-300 backdrop-blur-sm">
                <span className="font-medium">Music</span>
              </Link>
              <Link href="/" className="flex items-center px-4 py-3 rounded-xl hover:bg-slate-100/50 dark:hover:bg-black-800/50 text-slate-600 dark:text-black-300 border border-transparent hover:border-slate-300/50 dark:hover:border-black-700/50 transition-all duration-300 backdrop-blur-sm">
                <span className="font-medium">Gaming</span>
              </Link>
              <Link href="/" className="flex items-center px-4 py-3 rounded-xl hover:bg-slate-100/50 dark:hover:bg-black-800/50 text-slate-600 dark:text-black-300 border border-transparent hover:border-slate-300/50 dark:hover:border-black-700/50 transition-all duration-300 backdrop-blur-sm">
                <span className="font-medium">Sports</span>
              </Link>
            </nav>
          </div>

          <div className="mt-8">
            <h3 className="text-xs font-semibold text-slate-500 dark:text-black-400 mb-4 tracking-wider uppercase">Inspiration</h3>
            <InspirationHub />
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
  );
}
