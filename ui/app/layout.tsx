import './globals.css';
import type { Metadata } from 'next';
import RefreshButton from '../components/RefreshButton';
import { SelectProvider } from '../components/SelectCtx';
import { RefreshProvider } from '../components/RefreshCtx';
import { AuthProvider } from '../lib/auth-context';
import DarkModeToggle from '../components/DarkModeToggle';
import Drawer from '../components/Drawer';
import DynamicHeader from '../components/DynamicHeader';
import AuthHeader from '../components/AuthHeader';
import MediaNav from '../components/MediaNav';
import HomeNav from '../components/HomeNav';
import Logo from '../components/Logo';

export const metadata: Metadata = {
  title: 'Apropos Research',
  description: 'Research & Prompts – Apropos Research Platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="da">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  // Get theme from localStorage or system preference
                  let theme = localStorage.getItem('theme');
                  if (!theme) {
                    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                      theme = 'dark';
                    } else {
                      theme = 'light';
                    }
                    localStorage.setItem('theme', theme);
                  }
                  
                  // Apply theme immediately to prevent flash
                  if (theme === 'dark') {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                  }
                } catch (e) {
                  // Fallback: set dark theme
                  document.documentElement.classList.add('dark');
                  localStorage.setItem('theme', 'dark');
                }
              })();
            `,
          }}
        />
      </head>
      <body className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-black text-slate-900 dark:text-slate-100 min-h-dvh transition-colors duration-300">
        <AuthProvider>
          <SelectProvider>
            <RefreshProvider>
            <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-black">
              {/* Sidebar */}
              <aside className="w-64 bg-white/70 dark:bg-slate-900/70 backdrop-blur-2xl border-r border-slate-200/50 dark:border-slate-700/50 flex-shrink-0 overflow-y-auto shadow-2xl">
                <div className="p-6">
                  <Logo />
                  
                  <HomeNav />

                  <div className="mt-8">
                    <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-4 tracking-wider uppercase">Medier</h3>
                    <MediaNav />
                  </div>

                  <div className="mt-8">
                    <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-4 tracking-wider uppercase">Explore</h3>
                    <nav className="space-y-2">
                      <a href="/" className="flex items-center px-4 py-3 rounded-xl hover:bg-slate-100/50 dark:hover:bg-slate-700/50 text-slate-600 dark:text-slate-300 border border-transparent hover:border-slate-300/50 dark:hover:border-slate-600/50 transition-all duration-300 backdrop-blur-sm">
                        <span className="font-medium">Music</span>
                      </a>
                      <a href="/" className="flex items-center px-4 py-3 rounded-xl hover:bg-slate-100/50 dark:hover:bg-slate-700/50 text-slate-600 dark:text-slate-300 border border-transparent hover:border-slate-300/50 dark:hover:border-slate-600/50 transition-all duration-300 backdrop-blur-sm">
                        <span className="font-medium">Gaming</span>
                      </a>
                      <a href="/" className="flex items-center px-4 py-3 rounded-xl hover:bg-slate-100/50 dark:hover:bg-slate-700/50 text-slate-600 dark:text-slate-300 border border-transparent hover:border-slate-300/50 dark:hover:border-slate-600/50 transition-all duration-300 backdrop-blur-sm">
                        <span className="font-medium">Sports</span>
                      </a>
                    </nav>
                  </div>

                  <div className="mt-8">
                    <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-4 tracking-wider uppercase">RSS Feeds</h3>
                    <nav className="space-y-2">
                      <a href="/?source=dr" className="flex items-center px-4 py-3 rounded-xl hover:bg-slate-100/50 dark:hover:bg-slate-700/50 text-slate-600 dark:text-slate-300 border border-transparent hover:border-slate-300/50 dark:hover:border-slate-600/50 transition-all duration-300 backdrop-blur-sm">
                        <span className="font-medium text-sm">DR Seneste nyt</span>
                      </a>
                      <a href="/?source=dr&category=udland" className="flex items-center px-4 py-3 rounded-xl hover:bg-slate-100/50 dark:hover:bg-slate-700/50 text-slate-600 dark:text-slate-300 border border-transparent hover:border-slate-300/50 dark:hover:border-slate-600/50 transition-all duration-300 backdrop-blur-sm">
                        <span className="font-medium text-sm">DR Udland</span>
                      </a>
                      <a href="/?source=dr&category=kultur" className="flex items-center px-4 py-3 rounded-xl hover:bg-slate-100/50 dark:hover:bg-slate-700/50 text-slate-600 dark:text-slate-300 border border-transparent hover:border-slate-300/50 dark:hover:border-slate-600/50 transition-all duration-300 backdrop-blur-sm">
                        <span className="font-medium text-sm">DR Kultur</span>
                      </a>
                      <a href="/?source=dr&category=musik" className="flex items-center px-4 py-3 rounded-xl hover:bg-slate-100/50 dark:hover:bg-slate-700/50 text-slate-600 dark:text-slate-300 border border-transparent hover:border-slate-300/50 dark:hover:border-slate-600/50 transition-all duration-300 backdrop-blur-sm">
                        <span className="font-medium text-sm">DR Musik</span>
                      </a>
                      <a href="/?source=dr&category=sport" className="flex items-center px-4 py-3 rounded-xl hover:bg-slate-100/50 dark:hover:bg-slate-700/50 text-slate-600 dark:text-slate-300 border border-transparent hover:border-slate-300/50 dark:hover:border-slate-600/50 transition-all duration-300 backdrop-blur-sm">
                        <span className="font-medium text-sm">DR Sport</span>
                      </a>
                      <a href="/?source=dr&category=viden" className="flex items-center px-4 py-3 rounded-xl hover:bg-slate-100/50 dark:hover:bg-slate-700/50 text-slate-600 dark:text-slate-300 border border-transparent hover:border-slate-300/50 dark:hover:border-slate-600/50 transition-all duration-300 backdrop-blur-sm">
                        <span className="font-medium text-sm">DR Viden</span>
                      </a>
                    </nav>
                  </div>

                  <div className="mt-8">
                    <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-4 tracking-wider uppercase">International</h3>
                    <nav className="space-y-2">
                      <a href="/?source=bbc" className="flex items-center px-4 py-3 rounded-xl hover:bg-slate-100/50 dark:hover:bg-slate-700/50 text-slate-600 dark:text-slate-300 border border-transparent hover:border-slate-300/50 dark:hover:border-slate-600/50 transition-all duration-300 backdrop-blur-sm">
                        <span className="font-medium text-sm">BBC News</span>
                      </a>
                      <a href="https://rss.cnn.com/rss/edition.rss" target="_blank" rel="noopener noreferrer" className="flex items-center px-4 py-3 rounded-xl hover:bg-slate-100/50 dark:hover:bg-slate-700/50 text-slate-600 dark:text-slate-300 border border-transparent hover:border-slate-300/50 dark:hover:border-slate-600/50 transition-all duration-300 backdrop-blur-sm">
                        <span className="font-medium text-sm">CNN</span>
                      </a>
                      <a href="https://feeds.reuters.com/reuters/topNews" target="_blank" rel="noopener noreferrer" className="flex items-center px-4 py-3 rounded-xl hover:bg-slate-100/50 dark:hover:bg-slate-700/50 text-slate-600 dark:text-slate-300 border border-transparent hover:border-slate-300/50 dark:hover:border-slate-600/50 transition-all duration-300 backdrop-blur-sm">
                        <span className="font-medium text-sm">Reuters</span>
                      </a>
                      <a href="https://feeds.feedburner.com/oreilly/radar" target="_blank" rel="noopener noreferrer" className="flex items-center px-4 py-3 rounded-xl hover:bg-slate-100/50 dark:hover:bg-slate-700/50 text-slate-600 dark:text-slate-300 border border-transparent hover:border-slate-300/50 dark:hover:border-slate-600/50 transition-all duration-300 backdrop-blur-sm">
                        <span className="font-medium text-sm">O'Reilly Radar</span>
                      </a>
                    </nav>
                  </div>
                </div>
              </aside>

              {/* Main Content */}
              <div className="flex-1 flex flex-col">
                       {/* Top Header */}
                       <header className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-2xl border-b border-slate-200/50 dark:border-slate-700/50 px-6 py-4 shadow-lg">
                         <div className="flex items-center justify-between">
                           <div className="flex items-center gap-4">
                             <DynamicHeader />
                           </div>
                           <div className="flex items-center gap-3">
                             <AuthHeader />
                             <DarkModeToggle />
                             <RefreshButton />
                           </div>
                         </div>
                       </header>

                {/* Content Area */}
                <main className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-black p-6">
                  {children}
                </main>
          </div>
        </div>
            <Drawer />
            </RefreshProvider>
          </SelectProvider>
        </AuthProvider>
      </body>
    </html>
  );
}


