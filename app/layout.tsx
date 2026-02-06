// ROOT LAYOUT - Next.js app entry point
// Wraps entire app with providers and global configuration

import './globals.css';
import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '../lib/auth-context';
import { SelectProvider } from '../components/SelectCtx';
import { RefreshProvider } from '../components/RefreshCtx';
import { MediaProvider } from '../lib/media-context';
import { QueryProvider } from '../lib/query-provider';
import ConditionalLayout from '../components/ConditionalLayout';
// import PerformanceMonitor from '../components/PerformanceMonitor';
import { Poppins } from 'next/font/google';
import VercelAnalytics from '../components/VercelAnalytics';

// THEME SETUP - Google Fonts configuration
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-poppins',
});

// METADATA - SEO and page metadata
export const metadata: Metadata = {
  title: 'Apropos Research',
  description: 'Research & Prompts – Apropos Research Platform',
};

// VIEWPORT - Mobile responsive configuration
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

// ROOT LAYOUT - Main app wrapper with context providers
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="da" suppressHydrationWarning>
      <head>
        {/* DARK MODE TOGGLE - Prevents flash of wrong theme on load */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => { try { const t = localStorage.getItem('theme'); if (t === 'dark') document.documentElement.classList.add('dark'); else document.documentElement.classList.remove('dark'); } catch {} })();`,
          }}
        />
      </head>
      <body className={`${poppins.variable} min-h-dvh transition-colors duration-300 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-black-950 dark:to-pure-black text-slate-900 dark:text-slate-100`} suppressHydrationWarning>
        {/* PROVIDER STACK - Context providers in dependency order */}
        <QueryProvider>
          <AuthProvider>
            <MediaProvider>
              <SelectProvider>
                <RefreshProvider>
                  <ConditionalLayout>
                    {children}
                  </ConditionalLayout>
                </RefreshProvider>
              </SelectProvider>
            </MediaProvider>
          </AuthProvider>
        </QueryProvider>
        {/* <PerformanceMonitor /> */}
        <VercelAnalytics />
      </body>
    </html>
  );
}

