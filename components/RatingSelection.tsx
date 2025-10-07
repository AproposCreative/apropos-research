'use client';

interface RatingSelectionProps {
  onRatingSelected: (rating: number) => void;
}

export default function RatingSelection({ onRatingSelected }: RatingSelectionProps) {
  const ratings = [1, 2, 3, 4, 5];

  const renderStars = (count: number) => {
    return (
      <div className="flex gap-0.5">
        {Array.from({ length: count }).map((_, i) => (
          <svg
            key={i}
            className="w-3 h-3 fill-current text-white"
            viewBox="0 0 20 20"
          >
            <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
          </svg>
        ))}
      </div>
    );
  };

  return (
    <>
      {ratings.map((rating) => (
        <button
          key={rating}
          onClick={() => onRatingSelected(rating)}
          className="px-3 py-1.5 text-white text-xs font-medium rounded-lg transition-colors duration-200 border border-white/20"
          style={{ backgroundColor: 'rgb(0, 0, 0)' }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgb(20, 20, 20)'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgb(0, 0, 0)'}
        >
          {renderStars(rating)}
        </button>
      ))}
    </>
  );
}
