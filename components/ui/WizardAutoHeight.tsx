'use client';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export default function WizardAutoHeight({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);

  const recompute = () => {
    const el = contentRef.current;
    if (!el) return;
    const next = el.scrollHeight;
    setHeight(next);
  };

  useLayoutEffect(() => {
    recompute();
  }, [children]);

  useEffect(() => {
    const ro = new ResizeObserver(() => recompute());
    if (contentRef.current) ro.observe(contentRef.current);
    return () => ro.disconnect();
  }, []);

  const clamped = Math.max(48, Math.min(height ?? 0, 800));

  return (
    <div className="mx-[10px] my-[12px]" ref={containerRef}>
      <div
        className="rounded-xl bg-black px-0 py-2 border border-white/10 transition-[height] duration-300 ease-out overflow-hidden"
        style={{ height: clamped ? `${clamped}px` : undefined }}
      >
        <div ref={contentRef}>
          {children}
        </div>
      </div>
    </div>
  );
}


