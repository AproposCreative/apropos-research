'use client';

import type { WebAppEntry } from '@/lib/web-apps-config';
import { getWebApps } from '@/lib/web-apps-config';

function AppIcon({ app }: { app: WebAppEntry }) {
  if (app.iconUrl) {
    return <img src={app.iconUrl} alt="" className="size-[22px] object-cover" />;
  }
  if (app.id === 'podcast') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="text-white/70">
        <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="22" />
      </svg>
    );
  }
  if (app.id === 'push-desk') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="text-white/70">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    );
  }
  if (app.id === 'newsletter') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="text-white/70">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
      </svg>
    );
  }
  if (app.id === 'design-editor') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="text-white/70">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M9 21V9" />
      </svg>
    );
  }
  if (app.id === 'ai-writer') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="text-white/70">
        <path d="M12 20h9M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    );
  }
  return <span className="text-[15px] font-medium text-white/70">{app.name.charAt(0)}</span>;
}

const tileClass =
  'touch-target flex flex-col items-center gap-2 py-5 rounded-2xl border border-white/15 bg-white/[0.05] backdrop-blur-xl shadow-[0_0_32px_-12px_rgba(255,255,255,0.14)] hover:bg-white/[0.09] hover:border-white/22 active:scale-[0.98] transition-all duration-200';

type MobileAppLauncherProps = {
  onSelectApp: (appId: string) => void;
  onOpenShelf: () => void;
};

export default function MobileAppLauncher({ onSelectApp, onOpenShelf }: MobileAppLauncherProps) {
  const apps = getWebApps();

  return (
    <div className="md:hidden absolute inset-0 z-20 flex flex-col items-center justify-center px-6">
      <img
        src="/images/Apropos Research White.png"
        alt="Apropos Research"
        className="h-8 opacity-50 mb-8"
      />
      <div className="grid grid-cols-2 gap-3 w-full max-w-xs">
        {apps.map((app) => (
          <button key={app.id} type="button" className={tileClass} onClick={() => onSelectApp(app.id)}>
            <AppIcon app={app} />
            <span className="text-[13px] text-white/70 text-center leading-tight">{app.name}</span>
          </button>
        ))}
        <button type="button" className={tileClass} onClick={onOpenShelf}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="text-white/70">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <span className="text-[13px] text-white/70 text-center leading-tight">Mine artikler</span>
        </button>
      </div>
    </div>
  );
}
