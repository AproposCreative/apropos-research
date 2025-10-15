'use client';

import { useEffect, useRef, useState } from 'react';

interface ContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  onClose: () => void;
  onDelete: () => void;
  onRename: () => void;
}

export default function ContextMenu({ isOpen, position, onClose, onDelete, onRename }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-[#2a2a2a] border border-white/20 rounded-lg shadow-lg py-1 min-w-[120px]"
      style={{
        left: position.x,
        top: position.y,
      }}
    >
      <button
        onClick={() => {
          onRename();
          onClose();
        }}
        className="w-full px-3 py-2 text-left text-white hover:bg-white/10 transition-colors text-sm"
      >
        Rename
      </button>
      <div className="border-t border-white/10 my-1" />
      <button
        onClick={() => {
          onDelete();
          onClose();
        }}
        className="w-full px-3 py-2 text-left text-red-400 hover:bg-red-400/10 transition-colors text-sm"
      >
        Delete
      </button>
    </div>
  );
}
