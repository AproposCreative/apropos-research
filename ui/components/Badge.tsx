import { ReactNode } from "react";

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-gray-100 text-gray-700 px-3 py-1 text-[11px] tracking-wider uppercase">
      {children}
    </span>
  );
}


