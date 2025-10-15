'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { getUserDrafts, deleteDraft, updateDraft, type ArticleDraft } from '@/lib/firebase-service';
import ContextMenu from './ContextMenu';

interface DraftsShelfProps {
  onSelect: (draft: ArticleDraft) => void;
  onClose?: () => void;
  isOpen?: boolean;
}

export default function DraftsShelf({ onSelect, onClose, isOpen = true }: DraftsShelfProps) {
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
      await updateDraft(renamingDraft, { chatTitle: newTitle.trim() });
      setDrafts(drafts.map(d => 
        d.id === renamingDraft 
          ? { ...d, chatTitle: newTitle.trim() }
          : d
      ));
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
    <div className="h-full flex flex-col bg-[#171717] p-4">
      <div className="px-0 py-3 border-b border-white/10 flex items-center justify-between">
        <h3 className="text-white text-base font-medium">Mine artikler</h3>
        {onClose && (
          <button onClick={onClose} className="text-white/60 hover:text-white text-xs">Luk</button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-0 transition-[opacity,transform] duration-500 ease-out no-scrollbar" style={{ opacity: isOpen ? 1 : 0, transform: isOpen ? 'translateY(0px)' : 'translateY(4px)' }}>
        {loading ? (
          <div className="text-white/60 text-sm">Indlæser…</div>
        ) : drafts.length === 0 ? (
          <div className="text-white/60 text-sm">Ingen artikler endnu</div>
        ) : (
          <div className="grid gap-1">
            {drafts.map((d, i) => (
              <div
                key={d.id}
                className="w-full text-left px-0 py-2 text-white/80 hover:text-white border-b border-white/10 transition-colors transition-opacity"
                style={{ opacity: isOpen ? 1 : 0, transitionDuration: '520ms', transitionTimingFunction: 'ease-out', transitionProperty: 'opacity', transitionDelay: isOpen ? `${Math.min(i, 8) * 25}ms` : '0ms' }}
                onContextMenu={(e) => handleContextMenu(e, d.id)}
              >
                {renamingDraft === d.id ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameSubmit();
                        if (e.key === 'Escape') handleRenameCancel();
                      }}
                      className="w-full bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-[13px] focus:outline-none focus:border-white/40"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleRenameSubmit}
                        className="text-xs bg-green-600 hover:bg-green-700 px-2 py-1 rounded transition-colors"
                      >
                        Gem
                      </button>
                      <button
                        onClick={handleRenameCancel}
                        className="text-xs bg-gray-600 hover:bg-gray-700 px-2 py-1 rounded transition-colors"
                      >
                        Annuller
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => onSelect(d)}
                    className="w-full text-left"
                  >
                    <div className="text-[13px] leading-snug break-words whitespace-normal pr-2">{d.chatTitle || d.title || 'Untitled'}</div>
                    <div className="text-white/40 text-xs mt-1">{formatDate((d as any).createdAt || (d as any).updatedAt)} · {d.messages.length} beskeder</div>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Context Menu */}
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


