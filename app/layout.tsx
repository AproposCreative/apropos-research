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
import AiBootPaint from '../components/AiBootPaint';
// import PerformanceMonitor from '../components/PerformanceMonitor';
import { Poppins } from 'next/font/google';
import Script from 'next/script';
import { env } from '@/lib/config/env';
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
        {/* Apropos AI: sort canvas + preload af logo før React (undgår hvid flash) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(()=>{try{var p=location.pathname||'';if(!/^\\/ai(\\/|$)/.test(p))return;var r=document.documentElement;r.setAttribute('data-ai-boot','');r.style.setProperty('background-color','#000','important');r.style.setProperty('background-image','none','important');var pre=document.createElement('link');pre.rel='preload';pre.as='image';pre.href='/images/apropos-research-white-loader.svg';document.head.appendChild(pre);var b=function(){var x=document.body;if(!x)return;x.style.setProperty('background-color','#000','important');x.style.setProperty('background-image','none','important');};b();if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',b);}catch(e){}})();`,
          }}
        />
      </head>
      <body className={`${poppins.variable} min-h-dvh transition-colors duration-300 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-black-950 dark:to-pure-black text-slate-900 dark:text-slate-100`} suppressHydrationWarning>
        {/* PROVIDER STACK - Context providers in dependency order */}
        <QueryProvider>
          <AiBootPaint />
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
        {env.NEXT_PUBLIC_GA_MEASUREMENT_ID ? (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${env.NEXT_PUBLIC_GA_MEASUREMENT_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga4-config" strategy="afterInteractive">
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${env.NEXT_PUBLIC_GA_MEASUREMENT_ID}');`}
            </Script>
          </>
        ) : null}
      </body>
    </html>
  );
}

