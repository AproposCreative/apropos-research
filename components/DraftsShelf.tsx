'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { getUserDrafts, deleteDraft, updateDraft, type ArticleDraft } from '@/lib/firebase-service';
import ContextMenu from './ContextMenu';

const pillLink =
  'px-3 py-1.5 rounded-lg border border-white/12 text-[12px] text-white/65 hover:bg-white/[0.06] hover:text-white/90 transition-all duration-200 active:scale-[0.98] touch-target';

const secondaryBtn =
  'px-3 py-2 rounded-xl border border-white/12 text-[12px] text-white/75 hover:bg-white/[0.05] hover:border-white/18 transition-all duration-200 active:scale-[0.98] touch-target';

interface DraftsShelfProps {
  onSelect: (draft: ArticleDraft) => void;
  onClose?: () => void;
  isOpen?: boolean;
  onRenameLive?: (draftId: string, newTitle: string) => void; // notify open session
  refreshTrigger?: number; // trigger refresh when this changes
}

export default function DraftsShelf({ onSelect, onClose, isOpen = true, onRenameLive, refreshTrigger }: DraftsShelfProps) {
  const { user } = useAuth();
  const [drafts, setDrafts] = useState<ArticleDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
    draftId: string;
  }>({
    isOpen: false,
    position: { x: 0, y: 0 },
    draftId: '',
  });
  const [renamingDraft, setRenamingDraft] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');

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
  }, [user, refreshTrigger]);

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

  const handleContextMenu = (e: React.MouseEvent, draftId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
      draftId,
    });
  };

  const handleDelete = async () => {
    try {
      await deleteDraft(contextMenu.draftId);
      setDrafts(drafts.filter(d => d.id !== contextMenu.draftId));
    } catch (error) {
      console.error('Error deleting draft:', error);
    }
  };

  const handleRename = () => {
    const draft = drafts.find(d => d.id === contextMenu.draftId);
    if (draft) {
      setRenamingDraft(contextMenu.draftId);
      setNewTitle(draft.chatTitle || draft.title || '');
    }
  };

  const handleRenameSubmit = async () => {
    if (!renamingDraft || !newTitle.trim()) return;

    try {
      const trimmed = newTitle.trim();
      await updateDraft(renamingDraft, { chatTitle: trimmed, title: trimmed });
      setDrafts(prev =>
        prev.map(d =>
          d.id === renamingDraft
            ? {
                ...d,
                chatTitle: trimmed,
                title: trimmed,
                articleData: { ...(d.articleData || {}), title: trimmed, previewTitle: trimmed },
              }
            : d
        )
      );
      try {
        onRenameLive?.(renamingDraft, trimmed);
      } catch {}
      setRenamingDraft(null);
      setNewTitle('');
    } catch (error) {
      console.error('Error renaming draft:', error);
    }
  };

  const handleRenameCancel = () => {
    setRenamingDraft(null);
    setNewTitle('');
  };

  return (
    <div className="h-full flex flex-col font-poppins min-h-0 bg-transparent">
      <header className="border-b border-white/10 px-3 lg:px-4 py-2.5 lg:py-3 flex items-center justify-between gap-3 shrink-0 bg-black/25 backdrop-blur-md">
        <h3 className="text-[15px] font-medium tracking-tight text-white">Mine artikler</h3>
        {onClose && (
          <button type="button" onClick={onClose} className={pillLink}>
            Luk
          </button>
        )}
      </header>
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 nice-scrollbar min-h-0 transition-[opacity,transform] duration-500 ease-out"
        style={{
          opacity: isOpen ? 1 : 0,
          transform: isOpen ? 'translateY(0px)' : 'translateY(4px)',
        }}
      >
        {loading ? (
          <p className="text-white/45 text-[13px]">Indlæser…</p>
        ) : drafts.length === 0 ? (
          <p className="text-white/45 text-[13px]">Ingen artikler endnu</p>
        ) : (
          <div className="flex flex-col gap-2">
            {drafts.map((d, i) => (
              <div
                key={d.id}
                className="rounded-xl transition-opacity duration-500 ease-out"
                style={{
                  opacity: isOpen ? 1 : 0,
                  transitionDelay: isOpen ? `${Math.min(i, 8) * 25}ms` : '0ms',
                }}
                onContextMenu={e => handleContextMenu(e, d.id)}
              >
                {renamingDraft === d.id ? (
                  <div className="rounded-xl border border-white/15 bg-white/[0.05] p-3 space-y-3">
                    <input
                      type="text"
                      value={newTitle}
                      onChange={e => setNewTitle(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleRenameSubmit();
                        if (e.key === 'Escape') handleRenameCancel();
                      }}
                      className="apropos-input-dark w-full rounded-lg border border-white/[0.12] bg-[#141414] px-3 py-2.5 text-[13px] text-white focus:border-white/25 focus:outline-none focus:ring-1 focus:ring-white/10"
                      autoFocus
                    />
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={handleRenameSubmit} className={secondaryBtn}>
                        Gem
                      </button>
                      <button type="button" onClick={handleRenameCancel} className={secondaryBtn}>
                        Annuller
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelect(d)}
                    className="touch-target w-full text-left rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 transition-all duration-200 hover:bg-white/[0.05] hover:border-white/15 active:scale-[0.98]"
                  >
                    <div className="text-[13px] leading-snug text-white/85 break-words whitespace-normal pr-1">
                      {d.chatTitle || d.title || 'Untitled'}
                    </div>
                    <div className="text-[11px] text-white/40 mt-1">
                      {formatDate((d as any).createdAt || (d as any).updatedAt)} · {d.messages.length} beskeder
                    </div>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <ContextMenu
        isOpen={contextMenu.isOpen}
        position={contextMenu.position}
        onClose={() => setContextMenu({ isOpen: false, position: { x: 0, y: 0 }, draftId: '' })}
        onDelete={handleDelete}
        onRename={handleRename}
      />
    </div>
  );
}
