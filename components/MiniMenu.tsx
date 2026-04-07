'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';

export default function MiniMenu({ translateX, onSearch, onToggleReview, onToggleWebApps, onToggleShelf, onNewArticle, onToggleSources, onOpenPromptArchitect, onToggleSettings }: { translateX: string; onSearch: ()=>void; onToggleReview: ()=>void; onToggleWebApps: ()=>void; onToggleShelf: ()=>void; onNewArticle: ()=>void; onToggleSources: ()=>void; onOpenPromptArchitect: ()=>void; onToggleSettings: ()=>void; }) {
  const { user, logout } = useAuth();
  const [accountOpen, setAccountOpen] = useState(false);
  const [photoLoaded, setPhotoLoaded] = useState(false);
  useEffect(() => setPhotoLoaded(false), [user?.photoURL]);

  const userInitials = (() => {
    const name = (user?.displayName || user?.email || '').trim();
    if (!name) return 'U';
    const [first, last] = name.replace(/@.+$/, '').split(/[\s._-]+/);
    const f = (first || '').charAt(0);
    const l = (last || '').charAt(0);
    return (f + (l || '')).toUpperCase();
  })();
  const avatarBg = (() => {
    const seed = (user?.uid || userInitials).split('').reduce((a,c)=>a+c.charCodeAt(0),0);
    const hues = [210, 260, 190, 330, 20, 150];
    const h = hues[seed % hues.length];
    return `hsl(${h} 70% 30%)`;
  })();
  const userName = (user?.displayName || user?.email?.split('@')[0] || 'Bruger');


  return (
    <div className={`hidden md:block absolute top-[1%] left-[1%] z-50`}>
      <div className={`md:flex border border-white/20 rounded-2xl items-center overflow-hidden mini-menu-expand ${accountOpen ? 'mini-menu-expand-active' : ''}`}
        style={{ backgroundColor: 'rgb(0, 0, 0)', height: '50px', padding: '4px', transition: 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)', transform: translateX, willChange: 'transform' }}>
        <div className="flex items-center" style={{ width: accountOpen ? 'auto' : 'auto' }}>
          <button onClick={onSearch} className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-xl transition-colors" title="Søg i beskeder">
            <div className="relative w-3 h-3">
              <div className="absolute top-0 left-0 w-2.5 h-2.5 border-2 border-white rounded-full"></div>
              <div className="absolute bottom-0 right-0 w-1.5 h-1 bg-white transform rotate-45"></div>
            </div>
          </button>
          <button onClick={onToggleReview} className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-xl transition-colors" title="Review">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white">
              <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
          <button onClick={onToggleWebApps} className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-xl transition-colors" title="Web-apps">
            <div className="grid grid-cols-3 gap-0.5 w-3 h-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="w-0.5 h-0.5 bg-white rounded-full"></div>
              ))}
            </div>
          </button>
          <button onClick={onToggleShelf} className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-xl transition-colors" title="Mine artikler">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <button onClick={onNewArticle} className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-xl transition-colors" title="Ny artikel">
            <div className="relative w-3 h-3">
              <div className="absolute top-1/2 left-1/2 w-2.5 h-0.5 bg-white transform -translate-x-1/2 -translate-y-1/2"></div>
              <div className="absolute top-1/2 left-1/2 w-0.5 h-2.5 bg-white transform -translate-x-1/2 -translate-y-1/2"></div>
            </div>
          </button>
          <button
            type="button"
            onClick={onToggleSources}
            className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-xl transition-colors text-white"
            title="Mediekilder"
            aria-label="Åbn mediekilder"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
              <circle cx="12" cy="12" r="10"/>
              <line x1="2" y1="12" x2="22" y2="12"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
          </button>
          <button
            type="button"
            onClick={onOpenPromptArchitect}
            className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-xl transition-colors text-white"
            title="Prompt Architect"
            aria-label="Åbn Prompt Architect"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="text-white">
              <circle cx="6" cy="6" r="2.5" />
              <circle cx="18" cy="10" r="2.5" />
              <circle cx="10" cy="18" r="2.5" />
              <path d="M8.2 7.4 15.3 9.2M12.2 11.2 10.8 16.2" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onToggleSettings}
            className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-xl transition-colors text-white"
            title="Indstillinger"
            aria-label="Indstillinger"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
              <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
          <div className="relative flex items-center" style={{ marginLeft: 'auto' }}>
            <button onClick={() => setAccountOpen(v=>!v)} className="w-8 h-8 flex items-center justify-center rounded-xl overflow-hidden border border-white/10 hover:border-white/20 transition-colors p-[2px]" title={user?.displayName || user?.email || 'Konto'}>
              {user?.photoURL && photoLoaded ? (
                <img
                  src={user.photoURL}
                  alt=""
                  className="w-[calc(100%-2px)] h-[calc(100%-2px)] object-cover rounded-lg"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[11px] font-semibold text-white rounded-lg" style={{ background: avatarBg }}>{userInitials}</div>
              )}
              {user?.photoURL && !photoLoaded && (
                <img
                  src={user.photoURL}
                  alt=""
                  className="absolute opacity-0 w-px h-px pointer-events-none"
                  onLoad={() => setPhotoLoaded(true)}
                  onError={() => setPhotoLoaded(false)}
                />
              )}
            </button>
            <div className={`overflow-hidden transition-[width] duration-300 ease-out flex items-center`} style={{ width: accountOpen ? (8 + userName.length * 7 + 70) + 'px' : '0px' }}>
              <div className="flex items-center gap-3 pl-2 pr-2">
                <span className="text-white text-sm whitespace-nowrap">{userName}</span>
                <button onClick={async()=>{ try { await logout(); setAccountOpen(false); } catch(e){ console.error(e); } }} className="text-white/70 hover:text-white text-sm px-2 py-1 rounded hover:bg-white/10 whitespace-nowrap">Log ud</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


