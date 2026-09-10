import { expect, it } from 'vitest';
import { extractLivPhotoCredit } from '@/lib/liv/photo-credit';
import { extractCandidateImagesFromHtml } from '@/lib/liv/fetch-official-images';
const page = 'https://press.example.com/film';
it('uses only the credit attached to the exact image, including relative/lazy URLs', () => {
  expect(extractLivPhotoCredit('<figure><img data-src="/still.jpg"><figcaption>En scene. Foto: Anna Jensen / Producent</figcaption></figure>', 'https://press.example.com/still.jpg', page)).toBe('Foto: Anna Jensen / Producent');
});
it('does not claim a generic footer copyright or another photo credit', () => {
  const html = '<img src="/still.jpg"><footer>© Website</footer><figure><img src="/other.jpg"><figcaption>Foto: Another photographer</figcaption></figure>';
  expect(extractLivPhotoCredit(html, 'https://press.example.com/still.jpg', page)).toBeNull();
});
it('does not mistake prose containing photo for a credit', () => {
  expect(extractLivPhotoCredit('<figure><img src="/still.jpg"><figcaption>A photographic scene in a room</figcaption></figure>', 'https://press.example.com/still.jpg', page)).toBeNull();
});
it('finds gallery stills in addition to the social image and excludes footer imagery', () => {
  const html = '<meta property="og:image" content="https://press.example.com/hero.jpg"><main><figure><img src="/one.jpg"><figcaption>Foto: One</figcaption></figure><figure><img data-src="/two.jpg"><figcaption>Foto: Two</figcaption></figure></main><footer><figure><img src="/logo.jpg"><figcaption>Credit: Footer</figcaption></figure></footer>';
  expect(extractCandidateImagesFromHtml(html, page)).toEqual(['https://press.example.com/hero.jpg', 'https://press.example.com/one.jpg', 'https://press.example.com/two.jpg']);
});
