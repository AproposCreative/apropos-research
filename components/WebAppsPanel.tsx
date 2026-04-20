'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getWebApps } from '@/lib/web-apps-config';

interface WebAppsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** Når sat bruges knapper i stedet for links – vælger app i samme miljø (fx hub på /ai) */
  onSelectApp?: (appId: string) => void;
}

export default function WebAppsPanel({ isOpen, onClose, onSelectApp }: WebAppsPanelProps) {
  const pathname = usePathname();
  const apps = getWebApps();

  const baseClass = 'flex items-center gap-3 px-3 py-3 rounded-xl border transition-colors w-full text-left';

  return (
    <div className="h-full min-h-0 flex flex-col font-poppins bg-transparent">
      <header className="flex items-center justify-between px-3 lg:px-4 py-2.5 lg:py-3 border-b border-white/10 bg-black/25 backdrop-blur-md gap-3 shrink-0">
        <h2 className="text-[15px] font-medium tracking-tight text-white">Web-apps</h2>
        <button
          onClick={onClose}
          type="button"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/12 bg-white/[0.06] text-white transition-all duration-200 hover:bg-white/[0.12] active:scale-[0.97] touch-target"
          aria-label="Luk"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2 nice-scrollbar">
        {apps.map((app) => {
          const isActive = !onSelectApp && pathname === app.path;
          if (onSelectApp) {
            return (
              <button
                key={app.id}
                type="button"
                onClick={() => {
                  onSelectApp(app.id);
                  onClose();
                }}
                className={`${baseClass} border-white/10 text-white/90 hover:bg-white/10 hover:border-white/20`}
              >
                <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {app.iconUrl ? (
                    <img src={app.iconUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-lg font-semibold text-white/80">{app.name.charAt(0)}</span>
                  )}
                </div>
                <span className="font-medium">{app.name}</span>
              </button>
            );
          }
          return (
            <Link
              key={app.id}
              href={app.path}
              onClick={onClose}
              className={`${baseClass} ${
                isActive ? 'bg-white/15 border-white/30 text-white' : 'border-white/10 text-white/90 hover:bg-white/10 hover:border-white/20'
              }`}
            >
              <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {app.iconUrl ? (
                  <img src={app.iconUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-lg font-semibold text-white/80">{app.name.charAt(0)}</span>
                )}
              </div>
              <span className="font-medium">{app.name}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
