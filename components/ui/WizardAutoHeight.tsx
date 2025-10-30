'use client';
import { useEffect, useLayoutEffect, useRef, useState, useCallback, type ReactNode } from 'react';

export default function WizardAutoHeight({ children, collapsed }: { children: ReactNode; collapsed?: boolean }) {
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

  const clamped = collapsed ? 40
   : Math.max(48, Math.min(height ?? 0, 400));

  return (
    <div className="m-0 w-full md:mx-0 md:my-0" ref={containerRef}>
      <div
        className="rounded-xl bg-black/40 md:bg-black backdrop-blur-xl md:backdrop-blur-0 px-0 py-2 border border-white/15 transition-[height] duration-300 ease-out overflow-hidden md:mx-[10px] md:mb-[12px]"
        style={{ height: clamped ? `${clamped}px` : undefined, clipPath: collapsed ? 'inset(0 0 0 0)' : undefined }}
      >
        <div ref={contentRef}>
          {children}
        </div>
      </div>
    </div>
  );
}


