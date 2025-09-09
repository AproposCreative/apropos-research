'use client';
import { createContext, useContext, useMemo, useState } from 'react';

export type SelItem = {
  id: string; // stable id (use url)
  title: string;
  url: string;
  summary?: string;
  bullets?: string[];
  source?: string;
};

type Ctx = {
  selected: Record<string, SelItem>;
  toggle: (item: SelItem) => void;
  clear: () => void;
};

const C = createContext<Ctx | null>(null);

export function SelectProvider({ children }: { children: React.ReactNode }) {
  const [map, setMap] = useState<Record<string, SelItem>>({});
  const value = useMemo<Ctx>(() => ({
    selected: map,
    toggle: (item) => setMap((m) => {
      const c = { ...m };
      if (c[item.id]) delete c[item.id];
      else c[item.id] = item;
      return c;
    }),
    clear: () => setMap({}),
  }), [map]);
  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useSelect() {
  const v = useContext(C);
  if (!v) throw new Error('useSelect must be used within SelectProvider');
  return v;
}
