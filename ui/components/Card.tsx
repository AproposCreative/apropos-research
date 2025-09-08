import { ReactNode } from "react";

export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-white p-5 shadow-sm hover:shadow transition">
      {children}
    </div>
  );
}


