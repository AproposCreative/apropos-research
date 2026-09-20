import { beforeEach, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({ clean: vi.fn(), read: vi.fn() }));
vi.mock('@/lib/images/text-free', () => ({ ensureTextFreeImage: f.clean, readEditorialImage: f.read }));
import { enforceTextFreeArticleImages } from '@/lib/webflow/text-free-images';
beforeEach(() => { vi.clearAllMocks(); f.read.mockResolvedValue(Buffer.from('image')); f.clean.mockResolvedValue({ receipt: { edited: true, image: { url: 'https://images.test/clean.webp' } } }); });
it('cleans cover/mobile/inline and preserves prose, alt, caption and real credit', async () => {
  const fields = { name: 'Reacher', thumb: { url: 'https://images.test/old.jpg', alt: 'Reacher' }, 'mobile-image': 'https://images.test/old.jpg',
    'foto-credit': 'Prime Video', content: '<p>Original prose</p><figure><img src="https://images.test/old.jpg" alt="Alan" srcset="old.jpg 2x"><figcaption>Foto: Prime Video</figcaption></figure>' };
  await enforceTextFreeArticleImages(fields);
  expect(f.clean).toHaveBeenCalledOnce(); expect(fields.thumb.alt).toBe('Reacher');
  expect(fields.content).toContain('Original prose'); expect(fields.content).toContain('Foto: Prime Video'); expect(fields.content).not.toContain('srcset');
  expect(fields['foto-credit']).toBe('Prime Video');
});
it('leaves clean HTML exactly unchanged', async () => {
  f.clean.mockResolvedValue({ receipt: { edited: false } });
  const fields = { content: "<p> Keep   spacing </p>\n<img src='https://images.test/a.jpg'>" }, before = fields.content;
  await enforceTextFreeArticleImages(fields); expect(fields.content).toBe(before);
});
it('propagates budget/review errors instead of silently publishing lettering', async () => {
  f.clean.mockRejectedValue(new Error('budget_stop'));
  await expect(enforceTextFreeArticleImages({ thumb: 'https://images.test/a.jpg' })).rejects.toThrow('budget_stop');
});
