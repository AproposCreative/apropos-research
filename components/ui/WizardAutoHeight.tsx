'use client';
import { useEffect, useLayoutEffect, useRef, useState, useCallback, type ReactNode } from 'react';

export default function WizardAutoHeight({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);
  const lastChildrenRef = useRef<ReactNode>(children);
  const heightRef = useRef<number | undefined>(undefined);

  const recompute = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    const next = el.scrollHeight;
    if (heightRef.current !== next) {
      heightRef.current = next;
      setHeight(next);
    }
  }, []);

  useLayoutEffect(() => {
    // Only recompute if children actually changed
    if (lastChildrenRef.current !== children) {
      lastChildrenRef.current = children;
      recompute();
    }
  });

  useEffect(() => {
    const ro = new ResizeObserver(() => recompute());
    if (contentRef.current) ro.observe(contentRef.current);
    return () => ro.disconnect();
  }, [recompute]);

  const clamped = Math.max(48, Math.min(height ?? 0, 400));

  return (
    <div className="mx-[10px] my-[12px]" ref={containerRef}>
      <div
        className="rounded-xl bg-black px-0 py-2 border border-white/10 transition-[height] duration-300 ease-out overflow-y-auto"
        style={{ height: clamped ? `${clamped}px` : undefined }}
      >
        <div ref={contentRef}>
          {children}
        </div>
      </div>
    </div>
  );
}


