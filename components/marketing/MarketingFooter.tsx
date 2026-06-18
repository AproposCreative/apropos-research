import Link from 'next/link';

type Props = {
  magazineUrl?: string;
};

export default function MarketingFooter({ magazineUrl = 'https://www.aproposmagazine.com' }: Props) {
  return (
    <footer className="border-t border-[var(--research-graphite)] mt-8 py-12">
      <div className="research-container flex flex-col md:flex-row md:items-center md:justify-between gap-8">
        <div>
          <p className="text-[15px] font-medium text-[var(--research-snow)]">Apropos Research</p>
          <p className="text-sm text-[var(--research-slate)] mt-1">
            AI editorial stack for research, publishing, and distribution.
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
          <Link href="/landing/pricing" className="research-ghost-link">
            Pricing
          </Link>
          <Link href="/login" className="research-ghost-link">
            Sign in
          </Link>
          <a href={magazineUrl} target="_blank" rel="noopener noreferrer" className="research-ghost-link">
            Live magazine
          </a>
        </nav>
      </div>
      <div className="research-container mt-8 pt-6 border-t border-[var(--research-graphite)]">
        <p className="text-xs text-[var(--research-slate)] research-mono">
          © {new Date().getFullYear()} Apropos Research
        </p>
      </div>
    </footer>
  );
}
