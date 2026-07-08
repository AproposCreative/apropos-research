import Link from 'next/link';

type Props = {
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
  children: React.ReactNode;
};

export default function PrimaryLimeButton({
  href,
  onClick,
  disabled,
  type = 'button',
  className = '',
  children,
}: Props) {
  const cls = `research-lime-btn touch-target ${className}`.trim();

  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }

  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cls}>
      {children}
    </button>
  );
}
