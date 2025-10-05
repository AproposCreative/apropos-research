'use client';
import { useEffect, useState } from 'react';

export default function ScrollHeader({ children }: { children: React.ReactNode }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const isScrolled = window.scrollY > 10;
      setScrolled(isScrolled);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 w-full border-b border-line bg-white/80 backdrop-blur-xl transition-all duration-300 ${
      scrolled ? 'shadow-lg' : 'shadow-sm'
    }`}>
      {children}
    </header>
  );
}
