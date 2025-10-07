'use client';

import { useState, useEffect } from 'react';
import { WebflowAuthor } from '@/lib/webflow-service';

interface AuthorSelectionProps {
  onAuthorSelected: (author: WebflowAuthor) => void;
}

export default function AuthorSelection({ onAuthorSelected }: AuthorSelectionProps) {
  const [authors, setAuthors] = useState<WebflowAuthor[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchAuthors();
  }, []);

  const fetchAuthors = async () => {
    try {
      const response = await fetch('/api/webflow/authors');
      const data = await response.json();
      
      if (data.authors) {
        setAuthors(data.authors);
      }
    } catch (error) {
      console.error('Error fetching authors:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <>
      {authors.map((author) => (
        <button
          key={author.id}
          onClick={() => onAuthorSelected(author)}
          className="px-3 py-1.5 text-white text-xs font-medium rounded-lg transition-colors duration-200 border border-white/20"
          style={{ backgroundColor: 'rgb(0, 0, 0)' }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgb(20, 20, 20)'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgb(0, 0, 0)'}
        >
          {author.name}
        </button>
      ))}
    </>
  );
}
