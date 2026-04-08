'use client';

import { useEffect, useRef, useState } from 'react';

const LOGO_PRIMARY = '/images/apropos-research-white-loader.svg';
const LOGO_FALLBACK = '/images/apropos-research-white.svg';

/** Fade-out af hele laget (inkl. sort baggrund). Konstant duration så opacity altid animerer. */
export const AI_LOADER_FADE_MS = 1050;

const LOGO_NATURAL_W = 4932;
const LOGO_NATURAL_H = 569;

function useReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduce(mq.matches);
    const onChange = () => setReduce(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduce;
}

type Props = {
  active?: boolean;
  onExited?: () => void;
};

export default function AproposAILoadingScreen({ active = true, onExited }: Props) {
  const reduceMotion = useReducedMotion();
  const fadeOutMs = reduceMotion ? 200 : AI_LOADER_FADE_MS;
  const [logoSrc, setLogoSrc] = useState(LOGO_PRIMARY);
  const exitedRef = useRef(false);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    if (active) exitedRef.current = false;
  }, [active]);

  const handleTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.propertyName !== 'opacity' || activeRef.current || !onExited || exitedRef.current) return;
    exitedRef.current = true;
    onExited();
  };

  useEffect(() => {
    if (active || !onExited) return;
    const t = window.setTimeout(() => {
      if (exitedRef.current) return;
      exitedRef.current = true;
      onExited();
    }, fadeOutMs + 350);
    return () => clearTimeout(t);
  }, [active, onExited, fadeOutMs]);

  return (
    <div
      className={`fixed inset-0 z-[100000] flex flex-col items-center justify-center px-4 transition-opacity ease-in-out will-change-[opacity] ${
        active ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
      style={{
        backgroundColor: '#000',
        transitionDuration: `${fadeOutMs}ms`,
      }}
      role="status"
      aria-live="polite"
      aria-busy={active}
      aria-hidden={!active}
      onTransitionEnd={handleTransitionEnd}
    >
      <span className="sr-only">Indlæser Apropos Research</span>
      {/* w-full + h-auto: undgår h-full i aspect-ratio-boks (kan give højde 0 i nogle browsere). */}
      <div className="mx-auto w-[min(300px,90vw)] shrink-0 px-3">
        <img
          src={logoSrc}
          alt=""
          width={LOGO_NATURAL_W}
          height={LOGO_NATURAL_H}
          decoding="async"
          fetchPriority="high"
          draggable={false}
          onError={() => setLogoSrc((s) => (s === LOGO_FALLBACK ? s : LOGO_FALLBACK))}
          className="apropos-ai-loading-logo block h-auto w-full max-w-full object-contain object-center select-none"
        />
      </div>
    </div>
  );
}
