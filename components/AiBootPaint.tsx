'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

const LOGO = '/images/apropos-research-white-loader.svg';

/**
 * Holder sort baggrund for /ai uden at låse resten af app’en til sort efter client-navigering væk fra /ai.
 */
export default function AiBootPaint() {
  const pathname = usePathname();
  const isAi = pathname?.startsWith('/ai') ?? false;

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    if (!isAi) {
      root.removeAttribute('data-ai-boot');
      root.style.removeProperty('background-color');
      root.style.removeProperty('background-image');
      body?.style.removeProperty('background-color');
      body?.style.removeProperty('background-image');
      return;
    }
    root.setAttribute('data-ai-boot', '');
    root.style.setProperty('background-color', '#000', 'important');
    root.style.setProperty('background-image', 'none', 'important');
    body?.style.setProperty('background-color', '#000', 'important');
    body?.style.setProperty('background-image', 'none', 'important');

    const href = LOGO;
    if (!document.querySelector(`link[rel="preload"][href="${href}"]`)) {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = href;
      document.head.appendChild(link);
    }
  }, [isAi]);

  return null;
}
