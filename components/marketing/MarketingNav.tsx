'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import PrimaryLimeButton from './PrimaryLimeButton';

const navLinks = [
  { href: '#features', label: 'Product' },
  { href: '/landing/pricing', label: 'Pricing' },
];

type Props = {
  logoUrl?: string | null;
  siteName?: string;
  partnerLogos?: { name: string; url: string }[];
};

export default function MarketingNav({ logoUrl, siteName = 'Apropos Research' }: Props) {
  const [open, setOpen] = useState(false);
  const mark = logoUrl || '/images/apropos-research-white.svg';

  return (
    <header
      className="sticky top-0 z-50 border-b border-[var(--research-graphite)] backdrop-blur-xl bg-[var(--research-nav)]/85"
      style={{ height: 'var(--research-nav-height)' }}
    >
      <div className="research-container h-full flex items-center justify-between gap-4">
        <Link href="/landing" className="flex items-center gap-2.5 shrink-0">
          <Image src={mark} alt="" width={22} height={22} className="opacity-90" unoptimized />
          <span className="text-[15px] font-medium tracking-tight text-[var(--research-snow)]">{siteName}</span>
        </Link>

        <nav className="hidden md:flex items-center gap-7">
          {navLinks.map((l) => (
            <Link key={l.href} href={l.href} className="research-ghost-link">
              {l.label}
            </Link>
          ))}
          <Link href="/login" className="research-ghost-link">
            Sign in
          </Link>
          <PrimaryLimeButton href="/landing/pricing">Get started</PrimaryLimeButton>
        </nav>

        <button
          type="button"
          className="md:hidden touch-target flex items-center justify-center size-10 rounded-md border border-[var(--research-graphite)] text-[var(--research-fog)]"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Close menu' : 'Open menu'}
        >
          <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            {open ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {open ? (
        <div className="md:hidden border-t border-[var(--research-graphite)] px-5 py-4 flex flex-col gap-3 bg-[var(--research-nav)]">
          {navLinks.map((l) => (
            <Link key={l.href} href={l.href} className="research-ghost-link py-2" onClick={() => setOpen(false)}>
              {l.label}
            </Link>
          ))}
          <Link href="/login" className="research-ghost-link py-2" onClick={() => setOpen(false)}>
            Sign in
          </Link>
          <PrimaryLimeButton href="/landing/pricing" className="w-full">
            Get started
          </PrimaryLimeButton>
        </div>
      ) : null}
    </header>
  );
}
