'use client'

export default function Logo() {
  return (
    <div className="flex items-center gap-3 mb-8">
      <div className="w-full h-12 flex items-center justify-center">
        {/* Light mode logo */}
        <img 
          src="/images/Apropos Research Black.png" 
          alt="Apropos Research" 
          className="dark:hidden h-8 w-auto object-contain"
          onError={(e) => {
            // Fallback til placeholder hvis billedet ikke findes
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            const fallback = target.nextElementSibling as HTMLElement;
            if (fallback) fallback.style.display = 'block';
          }}
        />
        <div className="dark:hidden bg-black px-3 py-1 rounded" style={{ display: 'none' }}>
          <span className="text-white text-sm font-semibold">Apropos Research</span>
        </div>

        {/* Dark mode logo */}
        <img 
          src="/images/Apropos Research White.png" 
          alt="Apropos Research" 
          className="hidden dark:block h-8 w-auto object-contain"
          onError={(e) => {
            // Fallback til placeholder hvis billedet ikke findes
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            const fallback = target.nextElementSibling as HTMLElement;
            if (fallback) fallback.style.display = 'block';
          }}
        />
        <div className="hidden dark:block bg-black px-3 py-1 rounded" style={{ display: 'none' }}>
          <span className="text-white text-sm font-bold uppercase">Apropos Research</span>
        </div>
      </div>
    </div>
  )
}
