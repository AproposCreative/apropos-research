'use client';
import { usePathname } from 'next/navigation';

export default function HomeNav() {
  const pathname = usePathname();

  const getLinkClasses = (href: string, isActive: boolean) => {
    return `flex items-center px-4 py-3 rounded-xl transition-all duration-300 backdrop-blur-sm ${
      isActive 
        ? 'bg-slate-200/50 dark:bg-slate-700/50 text-slate-800 dark:text-slate-100 border border-slate-300/50 dark:border-slate-600/50 shadow-lg ring-1 ring-white/20 dark:ring-slate-700/50'
        : 'hover:bg-slate-100/50 dark:hover:bg-slate-700/50 text-slate-600 dark:text-slate-300 border border-transparent hover:border-slate-300/50 dark:hover:border-slate-600/50'
    }`;
  };

  return (
    <nav className="space-y-2">
      <a href="/" className={getLinkClasses('/', pathname === '/')}>
        <span className="font-medium">Home</span>
      </a>
      <a href="/editorial-queue" className={getLinkClasses('/editorial-queue', pathname === '/editorial-queue')}>
        <span className="font-medium">Editorial Queue</span>
      </a>
      <a href="/ai-drafts" className={getLinkClasses('/ai-drafts', pathname === '/ai-drafts')}>
        <span className="font-medium">AI Drafts</span>
      </a>
    </nav>
  );
}
