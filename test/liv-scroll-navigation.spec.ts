import { expect, it } from 'vitest';
import { initialScrollNavigation, scrollNavigation } from '@/lib/liv/scroll-navigation';

it('hides after meaningful downward motion and shows after 12px upward motion', () => {
  let state = scrollNavigation(initialScrollNavigation(), 100, 1000);
  expect(state.hidden).toBe(true);
  state = scrollNavigation(state, 96, 1000);
  expect(state.hidden).toBe(true);
  state = scrollNavigation(state, 88, 1000);
  expect(state.hidden).toBe(false);
});
it('does not flicker on tiny changes of direction', () => {
  let state = scrollNavigation(initialScrollNavigation(), 150, 1000);
  for (const top of [149, 151, 150, 152, 151]) state = scrollNavigation(state, top, 1000);
  expect(state.hidden).toBe(true);
});
it('keeps the navigation visible near the top and for short content', () => {
  expect(scrollNavigation(initialScrollNavigation(), 70, 1000).hidden).toBe(false);
  expect(scrollNavigation({ last: 100, travel: 0, hidden: true }, 20, 1000).hidden).toBe(false);
  expect(scrollNavigation(initialScrollNavigation(), 100, 0).hidden).toBe(false);
});
it('clamps iOS overscroll so a bottom bounce does not reveal the navigation', () => {
  let state = scrollNavigation(initialScrollNavigation(), 1000, 1000);
  state = scrollNavigation(state, 1060, 1000);
  expect(scrollNavigation(state, 1000, 1000).hidden).toBe(true);
  expect(scrollNavigation(state, -40, 1000)).toEqual(initialScrollNavigation());
});
