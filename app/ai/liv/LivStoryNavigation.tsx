'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import LivContentColumn from './LivContentColumn';
import { initialScrollNavigation, scrollNavigation } from '@/lib/liv/scroll-navigation';

export default function LivStoryNavigation({ view, onChange, children }: {
  view: 'upcoming' | 'published'; onChange: (view: 'upcoming' | 'published') => void; children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const nav = useRef<HTMLElement>(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const container = root.current, navigation = nav.current;
    const scroller = container?.querySelector<HTMLElement>('[data-liv-story-scroll]');
    if (!container || !navigation || !scroller) return;
    let state = initialScrollNavigation();
    const measure = () => container.style.setProperty('--liv-tabs-height', `${navigation.getBoundingClientRect().height}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(navigation);
    const onScroll = () => {
      const next = scrollNavigation(state, scroller.scrollTop, scroller.scrollHeight - scroller.clientHeight);
      if (navigation.contains(document.activeElement)) next.hidden = false;
      if (next.hidden !== state.hidden) setHidden(next.hidden);
      state = next;
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => { observer.disconnect(); scroller.removeEventListener('scroll', onScroll); };
  }, []);
  return <div ref={root} className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
    <nav ref={nav} aria-label="Redaktionens faner" aria-hidden={hidden} inert={hidden}
      className={`absolute inset-x-0 top-0 z-20 border-b border-white/10 bg-[#080808] transition-transform duration-300 ease-out motion-reduce:transition-none motion-reduce:duration-0 ${hidden ? '-translate-y-full pointer-events-none' : 'translate-y-0'}`}>
      <LivContentColumn className="grid grid-cols-2 gap-2 py-2">
        {([{ id: 'upcoming', label: 'Kommende' }, { id: 'published', label: 'Udgivet' }] as const).map(tab =>
          <button key={tab.id} onClick={() => onChange(tab.id)} aria-current={view === tab.id ? 'page' : undefined}
            className={`min-h-11 min-w-0 rounded-lg border border-transparent px-3 py-2 text-sm hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${view === tab.id ? 'bg-white/15 text-white' : 'text-white/55'}`}>{tab.label}</button>)}
      </LivContentColumn>
    </nav>
    {children}
  </div>;
}
