import { afterEach, expect, it, vi } from 'vitest';
import { extractLivPhotoCredit, isLivOfficialImageSource, extractLivTudumPhotos, isLivTudumSource, LIV_TUDUM_HTML_MAX_BYTES } from '@/lib/liv/photo-credit';
import { extractCandidateImagesFromHtml } from '@/lib/liv/fetch-official-images';
const page = 'https://press.example.com/film';
afterEach(() => vi.unstubAllEnvs());
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
it('discovers exact film press downloads and credits the distributor without inventing a photographer', () => {
  const page = 'https://distribution.paradisbio.dk/film.asp?id=374';
  const path = '/log/film/Alle%20Guds%20Farver%20(374)/Alle%20Guds%20Farver_01.jpg';
  const url = `https://distribution.paradisbio.dk${path}`;
  const html = `<a href="${path}">Pressebillede 1</a><a href="/log/film/Other%20(375)/Other_01.jpg">Other film</a>`;
  expect(isLivOfficialImageSource(page)).toBe(true);
  expect(extractCandidateImagesFromHtml(html, page)).toEqual([url]);
  expect(extractLivPhotoCredit(html, url, page)).toBe('Pressebillede: Øst for Paradis');
  expect(extractLivPhotoCredit('', url, page)).toBeNull();
  expect(extractLivPhotoCredit(html, url, page.replace('374', '375'))).toBeNull();
  expect(isLivOfficialImageSource('https://distribution.paradisbio.dk.attacker.test')).toBe(false);
});

const tudum = 'https://www.netflix.com/tudum/articles/the-gentlemen-season-2-release-date-photos';
const asset = (name: string) => `https://dnm.nflximg.net/api/v6/2DuQlx0fM4wd1nzqm5BFBi6ILa8/${name}.jpg?r=96a`;
const hero = (url = asset('hero')) => `<div role="presentation"><div data-uia="image-container"><div data-sel="media-card"><div><img data-uia="background-image" src="${url}" alt="A man in a white tuxedo"></div></div></div><div data-uia="image-credit">PHOTO BY CHRISTOPHER RAPHAEL</div></div>`;
const picture = (url: string, credit = 'PHOTO BY CHRISTOPHER RAPHAEL') => `<div class="fade-in-subject"><picture><img data-uia="image" src="${url}" loading="lazy"></picture><div data-uia="media-details"><div><p>Exact picture caption</p></div>${credit ? `<div>${credit}</div>` : ''}</div></div>`;
const gallery = (pictures: string) => `<div data-sel="media-card" data-content-type="inlineImageCollection"><div class="stack-on-mobile">${pictures}</div></div>`;
it('trusts only Netflix Tudum article pages even when production overrides official hosts', () => {
  vi.stubEnv('LIV_OFFICIAL_IMAGE_HOSTS', 'sfstudios.dk');
  expect(isLivOfficialImageSource(tudum)).toBe(true);
  expect(isLivOfficialImageSource('https://sfstudios.dk/film')).toBe(true);
  for (const url of ['https://www.netflix.com/browse', 'https://www.netflix.com/tudum/articles',
    'https://evil.netflix.com/tudum/articles/example', 'https://www.netflix.com.evil.example/tudum/articles/example',
    'http://www.netflix.com/tudum/articles/example', 'https://user:pass@www.netflix.com/tudum/articles/example']) {
    expect(isLivTudumSource(url)).toBe(false); expect(isLivOfficialImageSource(url)).toBe(false);
  }
});
it('extracts the actual hero and two independently credited gallery assets without figure markup', () => {
  const html = hero() + gallery(picture(asset('theo-esposito')) + picture(asset('susie-car')));
  expect(extractLivTudumPhotos(html, tudum)).toEqual(['hero', 'theo-esposito', 'susie-car'].map(name => ({ url: asset(name), credit: 'Foto: CHRISTOPHER RAPHAEL' })));
  expect(extractLivPhotoCredit(html, asset('susie-car'), tudum)).toBe('Foto: CHRISTOPHER RAPHAEL');
  expect(extractLivPhotoCredit(html, asset('susie-car').replace('r=96a', 'r=abc'), tudum)).toBeNull();
  expect(extractLivPhotoCredit(html, asset('unlisted'), tudum)).toBeNull();
});
it('does not borrow a neighboring picture credit, generic footer, or caption prose', () => {
  const html = gallery(picture(asset('no-credit'), '') + picture(asset('other'), 'PHOTO BY ANOTHER PHOTOGRAPHER')) +
    '<footer>PHOTO BY CHRISTOPHER RAPHAEL</footer>';
  expect(extractLivPhotoCredit(html, asset('no-credit'), tudum)).toBeNull();
  expect(extractLivPhotoCredit(html, asset('other'), tudum)).toBe('Foto: ANOTHER PHOTOGRAPHER');
  expect(extractLivTudumPhotos(gallery(picture(asset('caption'), 'A PHOTO BY CHRISTOPHER RAPHAEL appears here.')), tudum)).toEqual([]);
});
it('rejects conflicting credits, multi-image hero containers, unrelated cards and unsupported asset hosts', () => {
  expect(extractLivTudumPhotos(gallery(picture(asset('one')) + picture(asset('one'), 'PHOTO BY OTHER PERSON')), tudum)).toEqual([]);
  expect(extractLivTudumPhotos(hero().replace('</div><div data-uia="image-credit">', `<img src="${asset('other')}"></div><div data-uia="image-credit">`), tudum)).toEqual([]);
  expect(extractLivTudumPhotos(picture(asset('unrelated')), tudum)).toEqual([]);
  expect(extractLivTudumPhotos(`<footer>${gallery(picture(asset('footer')))}</footer>`, tudum)).toEqual([]);
  for (const url of ['https://dnm.nflximg.net.evil.example/api/v6/id/image.jpg', `${asset('one')}&token=secret`, 'https://other.example/image.jpg']) {
    expect(extractLivTudumPhotos(hero(url), tudum)).toEqual([]);
  }
  expect(extractLivTudumPhotos(hero(), page)).toEqual([]);
  expect(extractLivTudumPhotos(hero() + ' '.repeat(LIV_TUDUM_HTML_MAX_BYTES), tudum)).toEqual([]);
});
