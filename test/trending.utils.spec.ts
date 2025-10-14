import { describe, it, expect } from 'vitest';
import { extractKeyPoints, inferCategoryFrom } from '@/src/utils/trending';

describe('trending utils', () => {
  it('extractKeyPoints filters noise and limits to 3', () => {
    const text = `7. okt. 2025 Af Morten\n\nDette er en meningsfuld sætning med indhold, der er lang nok til at tælle.
    FOTO: Presse
    En anden vigtig sætning som også er tilpas lang til at tælle.
    En tredje vigtig sætning med yderligere kontekst.
    En fjerde sætning, der ikke bør komme med, fordi vi stopper ved tre.`;
    const kp = extractKeyPoints(text, 'Titel', 'Lead');
    expect(kp.length).toBeLessThanOrEqual(3);
    expect(kp.every(s => s.length >= 25)).toBe(true);
  });

  it('inferCategoryFrom derives category from URL/title', () => {
    expect(inferCategoryFrom('https://example.com/musik/nyhed')).toBe('Musik');
    expect(inferCategoryFrom('New movie review')).toBe('Film');
    expect(inferCategoryFrom('PlayStation showcase')).toBe('Gaming');
  });
});


