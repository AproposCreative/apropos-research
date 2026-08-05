const WATERMARK_SELECTOR =
  'a.spline-watermark, .spline-watermark, a[href*="spline.design"].spline-watermark';

export function hideSplineWatermarks(root: ParentNode = document): void {
  if (typeof document === 'undefined') return;
  root.querySelectorAll(WATERMARK_SELECTOR).forEach((el) => {
    const node = el as HTMLElement;
    node.style.setProperty('display', 'none', 'important');
    node.style.setProperty('visibility', 'hidden', 'important');
    node.style.setProperty('opacity', '0', 'important');
    node.style.setProperty('pointer-events', 'none', 'important');
    node.style.setProperty('width', '0', 'important');
    node.style.setProperty('height', '0', 'important');
    node.setAttribute('aria-hidden', 'true');
    node.remove();
  });
}

/** Observe DOM and hide Spline free-tier branding when injected by @splinetool/runtime. */
export function installSplineWatermarkFilter(): () => void {
  if (typeof document === 'undefined') return () => undefined;
  hideSplineWatermarks();
  const observer = new MutationObserver(() => hideSplineWatermarks());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  return () => observer.disconnect();
}
