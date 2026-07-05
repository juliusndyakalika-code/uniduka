const RIPPLE_SELECTORS = [
  '.btn-primary',
  '.btn-secondary',
  '.btn-duka',
  '.btn-danger',
  '.card-hover',
].join(', ');

function rippleColor(el: Element): string {
  if (
    el.classList.contains('btn-primary') ||
    el.classList.contains('btn-duka') ||
    el.classList.contains('btn-danger')
  ) {
    return 'rgba(255,255,255,0.35)';
  }
  return 'rgba(0,0,0,0.08)';
}

export function initRipple() {
  document.addEventListener('pointerdown', (e: PointerEvent) => {
    const target = (e.target as Element).closest(RIPPLE_SELECTORS) as HTMLElement | null;
    if (!target) return;

    const computed = getComputedStyle(target);
    if (computed.position === 'static') target.style.position = 'relative';
    if (computed.overflow === 'visible') target.style.overflow = 'hidden';

    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top  - size / 2;

    const drop = document.createElement('span');
    drop.className = 'ripple-drop';
    drop.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      left: ${x}px;
      top: ${y}px;
      background: ${rippleColor(target)};
    `;

    target.appendChild(drop);
    drop.addEventListener('animationend', () => drop.remove(), { once: true });
  });
}
