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
    return 'rgba(255,255,255,0.4)';
  }
  return 'rgba(0,0,0,0.07)';
}

export function initRipple() {
  document.addEventListener('pointerdown', (e: PointerEvent) => {
    const target = (e.target as Element).closest(RIPPLE_SELECTORS) as HTMLElement | null;
    if (!target) return;

    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;

    // Center ripple on the pointer, clipped visually to the button rect
    const drop = document.createElement('span');
    drop.style.cssText = [
      'position:fixed',
      `width:${size}px`,
      `height:${size}px`,
      `left:${e.clientX - size / 2}px`,
      `top:${e.clientY - size / 2}px`,
      'border-radius:50%',
      'transform:scale(0)',
      'pointer-events:none',
      `background:${rippleColor(target)}`,
      'animation:ripple-drop 550ms cubic-bezier(0.4,0,0.2,1) forwards',
      // clip to the button bounds so it doesn't bleed outside
      `clip-path:inset(${e.clientY - size / 2 < rect.top ? rect.top - (e.clientY - size / 2) : 0}px ${(e.clientX + size / 2) > rect.right ? (e.clientX + size / 2) - rect.right : 0}px ${(e.clientY + size / 2) > rect.bottom ? (e.clientY + size / 2) - rect.bottom : 0}px ${e.clientX - size / 2 < rect.left ? rect.left - (e.clientX - size / 2) : 0}px round ${getComputedStyle(target).borderRadius})`,
      'z-index:9999',
    ].join(';');

    document.body.appendChild(drop);
    drop.addEventListener('animationend', () => drop.remove(), { once: true });
  });
}
