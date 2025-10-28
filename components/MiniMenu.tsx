'use client';
import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';

export default function MiniMenu({ translateX, onSearch, onToggleReview, onToggleShelf, onNewArticle }: { translateX: string; onSearch: ()=>void; onToggleReview: ()=>void; onToggleShelf: ()=>void; onNewArticle: ()=>void; }) {
  const { user, logout } = useAuth();
  const [accountOpen, setAccountOpen] = useState(false);

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
    <div className={`hidden md:block absolute top-[1%] left-[1%] z-20`}>
      <div className={`md:flex border border-white/20 rounded-2xl items-center overflow-hidden mini-menu-expand ${accountOpen ? 'mini-menu-expand-active' : ''}`}
        style={{ backgroundColor: 'rgb(0, 0, 0)', height: '50px', padding: '4px', transition: 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)' , transform: translateX }}>
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
          <button onClick={onToggleShelf} className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-xl transition-colors" title="Mine artikler">
            <div className="grid grid-cols-3 gap-0.5 w-3 h-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="w-0.5 h-0.5 bg-white rounded-full"></div>
              ))}
            </div>
          </button>
          <button onClick={onNewArticle} className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-xl transition-colors" title="Ny artikel">
            <div className="relative w-3 h-3">
              <div className="absolute top-1/2 left-1/2 w-2.5 h-0.5 bg-white transform -translate-x-1/2 -translate-y-1/2"></div>
              <div className="absolute top-1/2 left-1/2 w-0.5 h-2.5 bg-white transform -translate-x-1/2 -translate-y-1/2"></div>
            </div>
          </button>
          <div className="relative flex items-center" style={{ marginLeft: 'auto' }}>
            <button onClick={() => setAccountOpen(v=>!v)} className="w-8 h-8 flex items-center justify-center rounded-xl overflow-hidden border border-white/10 hover:border-white/20 transition-colors p-[2px]" title={user?.displayName || user?.email || 'Konto'}>
              {user?.photoURL ? (
                 
                <img src={user.photoURL} alt="" className="w-[calc(100%-2px)] h-[calc(100%-2px)] object-cover rounded-lg" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[11px] font-semibold text-white rounded-lg" style={{ background: avatarBg }}>{userInitials}</div>
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


