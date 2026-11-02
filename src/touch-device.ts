// Touch devices (phones, tablets): the primary pointer is coarse and cannot hover. The body gets the
// class `touch`, which turns on the touch controls and the touch layout in style.css; with a mouse
// nothing changes. Re-evaluated when the media query changes (e.g. a tablet docking a keyboard).
export const TOUCH_QUERY = '(pointer: coarse) and (hover: none)';

type MatchMedia = (query: string) => Pick<MediaQueryList, 'matches' | 'addEventListener'>;

export function isTouchDevice(media: MatchMedia | undefined = globalThis.matchMedia): boolean {
  return typeof media === 'function' && media(TOUCH_QUERY).matches;
}
export function watchTouchDevice(
  body: Pick<HTMLElement, 'classList'> = document.body,
  media: MatchMedia | undefined = globalThis.matchMedia
): void {
  const apply = () => body.classList.toggle('touch', isTouchDevice(media));
  apply();
  if (typeof media === 'function') media(TOUCH_QUERY).addEventListener('change', apply);
}
