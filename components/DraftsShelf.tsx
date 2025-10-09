'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { getUserDrafts, type ArticleDraft } from '@/lib/firebase-service';

interface DraftsShelfProps {
  onSelect: (draft: ArticleDraft) => void;
  onClose?: () => void;
  isOpen?: boolean;
}

export default function DraftsShelf({ onSelect, onClose, isOpen = true }: DraftsShelfProps) {
  const { user } = useAuth();
  const [drafts, setDrafts] = useState<ArticleDraft[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      if (!user) return;
      try {
        setLoading(true);
        const ds = await getUserDrafts(user.uid);
        setDrafts(ds);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [user]);

  const normalizeDate = (v: any): Date => {
    if (!v) return new Date();
    // Firestore Timestamp support
    if (typeof v?.toDate === 'function') return v.toDate();
    if (v instanceof Date) return v;
    return new Date(v);
  };

  const formatDate = (d: any) => {
    const date = normalizeDate(d);
    return date.toLocaleDateString('da-DK', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div className="h-full flex flex-col bg-[#171717] p-4">
      <div className="px-0 py-3 border-b border-white/10 flex items-center justify-between">
        <h3 className="text-white text-base font-medium">Mine artikler</h3>
        {onClose && (
          <button onClick={onClose} className="text-white/60 hover:text-white text-xs">Luk</button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-0 transition-[opacity,transform] duration-500 ease-out" style={{ opacity: isOpen ? 1 : 0, transform: isOpen ? 'translateY(0px)' : 'translateY(4px)' }}>
        {loading ? (
          <div className="text-white/60 text-sm">Indlæser…</div>
        ) : drafts.length === 0 ? (
          <div className="text-white/60 text-sm">Ingen artikler endnu</div>
        ) : (
          <div className="grid gap-1">
            {drafts.map((d, i) => (
              <button
                key={d.id}
                onClick={() => onSelect(d)}
                className="w-full text-left px-0 py-2 text-white/80 hover:text-white border-b border-white/10 transition-colors transition-opacity"
                style={{ opacity: isOpen ? 1 : 0, transitionDuration: '520ms', transitionTimingFunction: 'ease-out', transitionProperty: 'opacity', transitionDelay: isOpen ? `${Math.min(i, 8) * 25}ms` : '0ms' }}
              >
                <div className="text-[13px] leading-snug break-words whitespace-normal pr-2">{d.chatTitle || d.title || 'Untitled'}</div>
                <div className="text-white/40 text-xs mt-1">{formatDate((d as any).createdAt || (d as any).updatedAt)} · {d.messages.length} beskeder</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


