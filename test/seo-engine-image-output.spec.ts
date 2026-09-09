import { describe, expect, it } from 'vitest';
import { load } from 'cheerio';
import { replaceOptimizedImageHtml } from '../lib/images/output-image-html';
const output = { url: 'https://images.example/new.webp?a=1&b=2', width: 1200, height: 800 };
describe('optimized inline image HTML', () => {
  it('sets actual output dimensions and preserves alt preceding src, credits and text', () => {
    const html = '<p>Photo old.jpg</p><a href="old.jpg"><img alt="Musikeren på scenen" src="old.jpg" data-credit="Fotograf" width="auto" height="auto"></a>';
    const result = replaceOptimizedImageHtml(html, 'old.jpg', output);
    const $ = load(result);
    expect($('img').attr('width')).toBe('1200'); expect($('img').attr('height')).toBe('800');
    expect($('img').attr('alt')).toBe('Musikeren på scenen'); expect($('img').attr('data-credit')).toBe('Fotograf');
    expect($('a').attr('href')).toBe('old.jpg'); expect($('p').text()).toBe('Photo old.jpg');
  });
  it('preserves empty decorative alt and never duplicates alt attributes', () => {
    const result = replaceOptimizedImageHtml('<img src="old.jpg" alt="">', 'old.jpg', output);
    expect((result.match(/ alt=/g) || []).length).toBe(1); expect(load(result)('img').attr('alt')).toBe('');
  });
  it('does not invent alt when absent', () => {
    expect(load(replaceOptimizedImageHtml('<img src="old.jpg">', 'old.jpg', output))('img').attr('alt')).toBeUndefined();
  });
  it('updates responsive candidates so the browser uses optimized output', () => {
    const $ = load(replaceOptimizedImageHtml('<img src="old.jpg" srcset="old-large.jpg 2400w" sizes="100vw">', 'old.jpg', output));
    expect($('img').attr('srcset')).toBe(`${output.url} 1200w`); expect($('img').attr('sizes')).toBe('100vw');
  });
  it('does not fabricate dimensions when processing did not return them', () => {
    const $ = load(replaceOptimizedImageHtml('<img src="old.jpg" width="400" height="300">', 'old.jpg', { ...output, width: null }));
    expect($('img').attr('width')).toBe('400'); expect($('img').attr('height')).toBe('300');
  });
  it('matches decoded ampersands and leaves unrelated elements unchanged', () => {
    const html = '<img src="old.jpg?a=1&amp;b=2" alt="A > B"><img src="other.jpg" alt="Keep">';
    const result = replaceOptimizedImageHtml(html, 'old.jpg?a=1&b=2', output);
    expect(load(result)('img').first().attr('src')).toBe(output.url);
    expect(result).toContain('<img src="other.jpg" alt="Keep">');
  });
});
