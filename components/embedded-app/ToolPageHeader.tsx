'use client';

import type { ReactNode } from 'react';
import { EmbeddedAppHeader } from './EmbeddedAppHeader';
import DarkModeToggle from '../DarkModeToggle';
import RefreshButton from '../RefreshButton';

/** Standalone tool header; deliberately not installed in the Writer's header. */
export default function ToolPageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return <EmbeddedAppHeader embedded={false} title={title} subtitle={subtitle}
    trailing={<div className="flex items-center gap-1">{actions}<DarkModeToggle /><RefreshButton /></div>} />;
}
