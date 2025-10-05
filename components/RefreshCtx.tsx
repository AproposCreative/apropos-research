'use client';
import { createContext, useContext, useState } from 'react';

type RefreshContext = {
  refreshing: boolean;
  setRefreshing: (refreshing: boolean) => void;
};

const Context = createContext<RefreshContext | null>(null);

export function RefreshProvider({ children }: { children: React.ReactNode }) {
  const [refreshing, setRefreshing] = useState(false);
  return (
    <Context.Provider value={{ refreshing, setRefreshing }}>
      {children}
    </Context.Provider>
  );
}

export function useRefreshing() {
  const context = useContext(Context);
  if (!context) throw new Error('useRefreshing must be used within RefreshProvider');
  return context;
}
