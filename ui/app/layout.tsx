import './globals.css';
import type { Metadata } from 'next';
import RefreshButton from '@/components/RefreshButton';
import { SelectProvider } from '@/components/SelectCtx';

export const metadata: Metadata = {
  title: 'Ragekniv UI',
  description: 'Research & Prompts – Apropos-stil',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="da">
      <body className="bg-paper text-ink min-h-dvh">
        <header className="sticky top-0 z-30 w-full border-b border-line bg-white/70 backdrop-blur-lg shadow-sm">
          <div className="container mx-auto flex items-center justify-between h-14">
            <div className="text-base font-semibold tracking-tight">Ragekniv UI</div>
            <div className="flex items-center gap-2">
              <RefreshButton />
              <button
                className="rounded-full border border-line px-3 py-1 text-xs text-gray-700 bg-white cursor-not-allowed opacity-60"
                title="kommer snart"
                disabled
              >
                Datafolder
              </button>
            </div>
          </div>
        </header>
        <SelectProvider>
          <main className="container mx-auto px-4 md:px-6 py-10">
            {children}
          </main>
        </SelectProvider>
      </body>
    </html>
  );
}


