'use client';
import { useEffect, useState } from 'react';

export default function DarkModeToggle() {
  const [dark, setDark] = useState(false); // Will be updated from localStorage on mount
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Get theme from localStorage (script in layout.tsx already applied it)
    const savedTheme = localStorage.getItem('theme');
    const shouldBeDark = savedTheme === 'dark';
    
    setDark(shouldBeDark);
    setMounted(true);
  }, []);

  const toggle = () => {
    const newDark = !dark;
    setDark(newDark);
    
    // Update document class
    if (newDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    
    // Save to localStorage
    localStorage.setItem('theme', newDark ? 'dark' : 'light');
  };

  // Prevent hydration mismatch
  if (!mounted) {
    return (
      <button
        className="rounded-xl border border-slate-300/50 dark:border-black-700/50 px-4 py-2 text-sm text-slate-700 dark:text-black-300 bg-white/70 dark:bg-pure-black/70 hover:bg-slate-100/70 dark:hover:bg-black-700/70 transition-all duration-300 backdrop-blur-sm shadow-lg ring-1 ring-white/20 dark:ring-black-800/50"
      >
        Dark
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      className="rounded-xl border border-slate-300/50 dark:border-black-700/50 px-4 py-2 text-sm text-slate-700 dark:text-black-300 bg-white/70 dark:bg-pure-black/70 hover:bg-slate-100/70 dark:hover:bg-black-700/70 transition-all duration-300 backdrop-blur-sm shadow-lg ring-1 ring-white/20 dark:ring-black-800/50"
      title={dark ? 'Skift til lys tilstand' : 'Skift til mørk tilstand'}
    >
      {dark ? 'Light' : 'Dark'}
    </button>
  );
}
