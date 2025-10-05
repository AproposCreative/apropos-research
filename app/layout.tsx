import './globals.css';
import type { Metadata } from 'next';
import { AuthProvider } from '../lib/auth-context';
import { SelectProvider } from '../components/SelectCtx';
import { RefreshProvider } from '../components/RefreshCtx';
import ConditionalLayout from '../components/ConditionalLayout';

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
              <ConditionalLayout>
                {children}
              </ConditionalLayout>
            </RefreshProvider>
          </SelectProvider>
        </AuthProvider>
      </body>
    </html>
  );
}


