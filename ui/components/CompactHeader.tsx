'use client';
import AuthHeader from './AuthHeader';
import DarkModeToggle from './DarkModeToggle';
import RefreshButton from './RefreshButton';

interface CompactHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export default function CompactHeader({ title, subtitle, actions }: CompactHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{title}</h1>
          {subtitle && (
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{subtitle}</p>
          )}
        </div>
      </div>
      
      <div className="flex items-center gap-3">
        {actions}
        <DarkModeToggle />
        <RefreshButton />
        {/* Account header removed; avatar handled in AI mini-menu */}
      </div>
    </div>
  );
}
