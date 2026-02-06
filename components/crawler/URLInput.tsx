'use client';

interface URLInputProps {
  value: string;
  onChange: (value: string) => void;
  onStart: () => void;
  disabled?: boolean;
}

export function URLInput({ value, onChange, onStart, disabled }: URLInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      console.log('[URLInput] Enter pressed, disabled:', disabled, 'value:', value);
      if (!disabled && value.trim()) {
        e.preventDefault();
        console.log('[URLInput] Calling onStart from Enter key');
        onStart();
      }
    }
  };

  const handleButtonClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    console.log('[URLInput] Button clicked, disabled:', disabled, 'value:', value);
    if (!disabled && value.trim()) {
      console.log('[URLInput] Calling onStart');
      onStart();
    } else {
      console.log('[URLInput] Not calling onStart - disabled or empty');
    }
  };

  return (
    <div className="flex gap-3">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="https://example.com"
        disabled={disabled}
        className="flex-1 px-4 py-3 bg-gray-950/50 border border-gray-800/50 rounded-lg focus:outline-none focus:border-gray-700 focus:ring-1 focus:ring-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-white placeholder-gray-500"
      />
      <button
        type="button"
        onClick={handleButtonClick}
        disabled={disabled || !value.trim()}
        className="px-6 py-3 bg-white text-black rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
      >
        Crawl
      </button>
    </div>
  );
}
