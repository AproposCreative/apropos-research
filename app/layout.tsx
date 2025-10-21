import './globals.css';
import type { Metadata } from 'next';
import { AuthProvider } from '../lib/auth-context';
import { SelectProvider } from '../components/SelectCtx';
import { RefreshProvider } from '../components/RefreshCtx';
import { MediaProvider } from '../lib/media-context';
import { QueryProvider } from '../lib/query-provider';
import ConditionalLayout from '../components/ConditionalLayout';
// import PerformanceMonitor from '../components/PerformanceMonitor';
import { Poppins } from 'next/font/google';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Analytics } from '@vercel/analytics/react';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-poppins',
});

export const metadata: Metadata = {
  title: 'Apropos Research',
  description: 'Research & Prompts – Apropos Research Platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="da" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => { try { const t = localStorage.getItem('theme'); if (t === 'dark') document.documentElement.classList.add('dark'); else document.documentElement.classList.remove('dark'); } catch {} })();`,
          }}
        />
      </head>
      <body className={`${poppins.variable} min-h-dvh transition-colors duration-300 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-black-950 dark:to-pure-black text-slate-900 dark:text-slate-100`} suppressHydrationWarning>
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
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}


