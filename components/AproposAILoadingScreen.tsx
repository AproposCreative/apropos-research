'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './boot-screen.module.css';

const LOGO_PRIMARY = '/images/apropos-research-white-loader.svg';
const LOGO_FALLBACK = '/images/apropos-research-white.svg';

/** Fade-out af hele laget (inkl. sort baggrund). Konstant duration så opacity altid animerer. */
export const AI_LOADER_FADE_MS = 320;

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
  const fadeOutMs = reduceMotion ? 100 : AI_LOADER_FADE_MS;
  const [logoSrc, setLogoSrc] = useState(LOGO_PRIMARY);
  const exitedRef = useRef(false);
  const activeRef = useRef(active);
  const rootRef = useRef<HTMLDivElement>(null);
  activeRef.current = active;

  useEffect(() => {
    if (!active || reduceMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    // Motion never gates readiness. A failed module import keeps the logo visible.
    void import('gsap').then(({ gsap }) => {
      if (cancelled || !rootRef.current) return;
      const context = gsap.context(() => {
        gsap.from('[data-boot-mark]', { clipPath: 'inset(0 100% 0 0)', duration: .48, ease: 'power2.out', clearProps: 'clipPath' });
        gsap.fromTo('[data-boot-line]', { xPercent: -100 }, { xPercent: 290, duration: 1.35, ease: 'power2.inOut', repeat: -1, repeatDelay: .15 });
      }, rootRef);
      cleanup = () => context.revert();
    }).catch(() => undefined);
    return () => { cancelled = true; cleanup?.(); };
  }, [active, reduceMotion]);

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
      ref={rootRef}
      data-apropos-boot
      className={`${styles.screen} ${active ? '' : styles.exiting}`}
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
      <span className={styles.status}>Åbner Apropos Research</span>
      {/* w-full + h-auto: undgår h-full i aspect-ratio-boks (kan give højde 0 i nogle browsere). */}
      <div className={styles.mark}>
        <img
          data-boot-mark
          src={logoSrc}
          alt=""
          width={LOGO_NATURAL_W}
          height={LOGO_NATURAL_H}
          decoding="async"
          fetchPriority="high"
          draggable={false}
          onError={() => setLogoSrc((s) => (s === LOGO_FALLBACK ? s : LOGO_FALLBACK))}
          className={styles.logo}
        />
        <div className={styles.rail} aria-hidden="true"><span data-boot-line className={styles.line} /></div>
      </div>
    </div>
  );
}
