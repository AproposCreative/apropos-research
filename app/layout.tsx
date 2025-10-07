import './globals.css';
import type { Metadata } from 'next';
import { AuthProvider } from '../lib/auth-context';
import { SelectProvider } from '../components/SelectCtx';
import { RefreshProvider } from '../components/RefreshCtx';
import { MediaProvider } from '../lib/media-context';
import ConditionalLayout from '../components/ConditionalLayout';
import { Poppins } from 'next/font/google';

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
    <html lang="da" className="dark">
      <head>
      </head>
      <body className={`${poppins.variable} bg-gradient-to-br from-slate-950 to-black text-slate-100 min-h-dvh transition-colors duration-300`} suppressHydrationWarning>
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
      </body>
    </html>
  );
}


