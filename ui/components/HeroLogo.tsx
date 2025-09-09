'use client';

export default function HeroLogo() {
  return (
    <div className="flex justify-center mb-6">
      <div className="w-96 h-24 flex items-center justify-center">
        {/* Light mode logo */}
        <img 
          src="/images/Apropos Research Black.png" 
          alt="Apropos Research" 
          className="dark:hidden h-20 w-auto object-contain"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            const fallback = target.nextElementSibling as HTMLElement;
            if (fallback) fallback.style.display = 'block';
          }}
        />
        <div className="dark:hidden bg-black px-8 py-4 rounded-xl" style={{ display: 'none' }}>
          <span className="text-white text-3xl font-bold">Apropos Research</span>
        </div>

        {/* Dark mode logo */}
        <img 
          src="/images/Apropos Research White.png" 
          alt="Apropos Research" 
          className="hidden dark:block h-20 w-auto object-contain"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            const fallback = target.nextElementSibling as HTMLElement;
            if (fallback) fallback.style.display = 'block';
          }}
        />
        <div className="hidden dark:block bg-white px-8 py-4 rounded-xl" style={{ display: 'none' }}>
          <span className="text-black text-3xl font-bold">Apropos Research</span>
        </div>
      </div>
    </div>
  );
}
