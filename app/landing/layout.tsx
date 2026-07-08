import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import '../styles/research-tokens.css';
import MarketingNav from '@/components/marketing/MarketingNav';
import MarketingFooter from '@/components/marketing/MarketingFooter';
import { fetchLandingAssets } from '@/lib/landing/webflow-assets';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Apropos Research',
    template: '%s · Apropos Research',
  },
  description: 'AI editorial stack for research, publishing, and distribution.',
  openGraph: {
    title: 'Apropos Research',
    description: 'Build your media on an AI editorial stack.',
    type: 'website',
  },
};

export default async function LandingLayout({ children }: { children: React.ReactNode }) {
  const assets = await fetchLandingAssets();

  return (
    <div className={`research-root min-h-dvh flex flex-col ${inter.variable} ${jetbrainsMono.variable}`}>
      <MarketingNav logoUrl={assets.logoMarkUrl || assets.logoUrl} siteName="Apropos Research" />
      <main className="flex-1">{children}</main>
      <MarketingFooter magazineUrl={assets.magazineUrl} />
    </div>
  );
}
