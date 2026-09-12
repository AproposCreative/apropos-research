export type ScrollNavigationState = { last: number; travel: number; hidden: boolean };
export const initialScrollNavigation = (): ScrollNavigationState => ({ last: 0, travel: 0, hidden: false });

/** Direction hysteresis ignores hand jitter and clamps Safari rubber-banding. */
export function scrollNavigation(state: ScrollNavigationState, top: number, maximum: number): ScrollNavigationState {
  const y = Math.max(0, Math.min(top, Math.max(0, maximum)));
  if (y <= 24) return { last: y, travel: 0, hidden: false };
  const delta = y - state.last;
  if (!delta) return state;
  const travel = Math.sign(delta) === Math.sign(state.travel) ? state.travel + delta : delta;
  const hidden = travel >= 24 && y > 80 ? true : travel <= -12 ? false : state.hidden;
  return { last: y, travel: hidden !== state.hidden ? 0 : travel, hidden };
}
