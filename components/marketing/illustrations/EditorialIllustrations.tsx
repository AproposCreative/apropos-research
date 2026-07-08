export function ResearchIllustration({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 320 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <rect x="8" y="8" width="304" height="184" rx="8" stroke="#23252a" strokeWidth="1" />
      <circle cx="48" cy="56" r="6" fill="#5e6ad2" fillOpacity="0.9" />
      <circle cx="120" cy="40" r="5" fill="#62666d" />
      <circle cx="200" cy="72" r="5" fill="#62666d" />
      <circle cx="260" cy="48" r="5" fill="#e4f222" fillOpacity="0.85" />
      <path d="M48 56 L120 40 L200 72 L260 48" stroke="#383b3f" strokeWidth="1" />
      <path d="M48 56 L200 72" stroke="#5e6ad2" strokeWidth="1" strokeOpacity="0.6" />
      <rect x="24" y="110" width="272" height="58" rx="6" fill="#161718" stroke="#23252a" />
      <rect x="36" y="124" width="120" height="6" rx="2" fill="#383b3f" />
      <rect x="36" y="138" width="200" height="4" rx="2" fill="#23252a" />
      <rect x="36" y="148" width="160" height="4" rx="2" fill="#23252a" />
    </svg>
  );
}

export function DraftIllustration({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 200" fill="none" className={className} aria-hidden>
      <rect x="24" y="32" width="272" height="136" rx="8" stroke="#23252a" />
      <rect x="40" y="52" width="180" height="8" rx="2" fill="#383b3f" />
      <rect x="40" y="68" width="240" height="4" rx="2" fill="#23252a" />
      <rect x="40" y="78" width="220" height="4" rx="2" fill="#23252a" />
      <rect x="40" y="88" width="200" height="4" rx="2" fill="#23252a" />
      <rect x="40" y="110" width="64" height="20" rx="4" stroke="#5e6ad2" strokeOpacity="0.5" />
      <text x="72" y="124" textAnchor="middle" fill="#8a8f98" fontSize="9" fontFamily="system-ui">
        Review
      </text>
    </svg>
  );
}

export function PublishIllustration({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 200" fill="none" className={className} aria-hidden>
      <rect x="40" y="24" width="200" height="152" rx="8" stroke="#23252a" />
      <rect x="56" y="44" width="168" height="80" rx="4" fill="#161718" stroke="#383b3f" />
      <rect x="56" y="136" width="80" height="8" rx="2" fill="#383b3f" />
      <rect x="144" y="136" width="48" height="8" rx="2" fill="#e4f222" fillOpacity="0.9" />
      <path d="M248 64 L288 44 L288 156 L248 176 Z" fill="#0f1011" stroke="#23252a" />
      <path d="M260 80 L276 72 L276 128 L260 136 Z" fill="#5e6ad2" fillOpacity="0.35" />
    </svg>
  );
}

export function DistributeIllustration({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 200" fill="none" className={className} aria-hidden>
      <rect x="24" y="48" width="120" height="104" rx="8" stroke="#23252a" />
      <rect x="40" y="64" width="88" height="6" rx="2" fill="#383b3f" />
      <rect x="40" y="78" width="72" height="4" rx="2" fill="#23252a" />
      <rect x="40" y="88" width="80" height="4" rx="2" fill="#23252a" />
      <path d="M160 100 H200" stroke="#62666d" strokeWidth="1" strokeDasharray="4 4" />
      <rect x="208" y="56" width="88" height="40" rx="6" stroke="#383b3f" />
      <rect x="208" y="108" width="88" height="40" rx="6" stroke="#383b3f" />
      <circle cx="228" cy="76" r="8" stroke="#5e6ad2" />
      <rect x="244" y="72" width="40" height="4" rx="1" fill="#383b3f" />
      <circle cx="228" cy="128" r="8" stroke="#e4f222" strokeOpacity="0.8" />
      <rect x="244" y="124" width="40" height="4" rx="1" fill="#383b3f" />
    </svg>
  );
}

export function PipelineIllustration({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 80" fill="none" className={className} aria-hidden>
      {['Signal', 'Draft', 'Publish', 'Reach'].map((label, i) => {
        const x = 16 + i * 96;
        return (
          <g key={label}>
            <rect x={x} y="20" width="72" height="40" rx="6" stroke={i === 3 ? '#e4f222' : '#23252a'} strokeOpacity={i === 3 ? 0.7 : 1} />
            <text x={x + 36} y="45" textAnchor="middle" fill="#8a8f98" fontSize="10" fontFamily="system-ui">
              {label}
            </text>
            {i < 3 ? <path d={`M${x + 76} 40 H${x + 92}`} stroke="#383b3f" /> : null}
          </g>
        );
      })}
    </svg>
  );
}
