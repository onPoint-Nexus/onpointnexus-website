/* ───────────────────────────────────────────────────────────
   Site Cursor — small primary-cyan accent that follows the
   native pointer. Two elements:
     • A 6px filled dot that follows the pointer exactly
     • A 32px ring that lerps behind with ~12% catch-up

   On hover over interactive elements ([a], [button],
   [role="button"], or [data-cursor-hover]) the ring expands
   and gets a slightly brighter border.

   Native system cursor is NOT hidden — this is a layered
   accent. Disabled on touch / coarse-pointer devices and
   when prefers-reduced-motion is set.
─────────────────────────────────────────────────────────── */
(() => {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const supportsHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!supportsHover || reducedMotion) return;

  /* ── Inject CSS once ─────────────────────────────────── */
  const css = `
    .site-cursor-dot, .site-cursor-ring {
      position: fixed;
      top: 0; left: 0;
      pointer-events: none;
      z-index: 9998;
      will-change: transform, width, height, opacity;
      transform: translate3d(-100px, -100px, 0);
      mix-blend-mode: screen;
    }
    .site-cursor-dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: #1ABADC;
      opacity: 1;
      transition: opacity .2s ease, background .2s ease;
    }
    .site-cursor-ring {
      width: 32px; height: 32px;
      border-radius: 50%;
      border: 1.5px solid rgba(26,186,220,0.55);
      background: transparent;
      margin-left: -16px;
      margin-top: -16px;
      transition: width .25s cubic-bezier(.16,1,.3,1),
                  height .25s cubic-bezier(.16,1,.3,1),
                  margin .25s cubic-bezier(.16,1,.3,1),
                  border-color .25s ease,
                  background .25s ease,
                  opacity .2s ease;
    }
    .site-cursor-ring.is-hover {
      width: 56px; height: 56px;
      margin-left: -28px; margin-top: -28px;
      border-color: rgba(26,186,220,0.85);
      background: rgba(26,186,220,0.07);
    }
    .site-cursor-ring.is-click {
      width: 24px; height: 24px;
      margin-left: -12px; margin-top: -12px;
      background: rgba(26,186,220,0.18);
      border-color: rgba(26,186,220,1);
    }
    .site-cursor-dot.is-hide,
    .site-cursor-ring.is-hide {
      opacity: 0;
    }
  `;
  const style = document.createElement('style');
  style.id = 'site-cursor-style';
  style.textContent = css;
  document.head.appendChild(style);

  /* ── Elements ────────────────────────────────────────── */
  const dot = document.createElement('div');
  dot.className = 'site-cursor-dot is-hide';
  dot.setAttribute('aria-hidden', 'true');

  const ring = document.createElement('div');
  ring.className = 'site-cursor-ring is-hide';
  ring.setAttribute('aria-hidden', 'true');

  document.body.appendChild(dot);
  document.body.appendChild(ring);

  /* ── Position state ──────────────────────────────────── */
  let mouseX = -100, mouseY = -100;
  let dotX   = -100, dotY   = -100;
  let ringX  = -100, ringY  = -100;
  let firstMove = true;

  function onMove(e) {
    mouseX = e.clientX;
    mouseY = e.clientY;
    if (firstMove) {
      firstMove = false;
      dot.classList.remove('is-hide');
      ring.classList.remove('is-hide');
    }
  }

  function onLeave() {
    dot.classList.add('is-hide');
    ring.classList.add('is-hide');
  }

  function onEnter() {
    if (!firstMove) {
      dot.classList.remove('is-hide');
      ring.classList.remove('is-hide');
    }
  }

  function onDown() { ring.classList.add('is-click'); }
  function onUp()   { ring.classList.remove('is-click'); }

  document.addEventListener('mousemove', onMove, { passive: true });
  document.addEventListener('mouseleave', onLeave);
  document.addEventListener('mouseenter', onEnter);
  document.addEventListener('mousedown', onDown);
  document.addEventListener('mouseup', onUp);

  /* ── Hover state via event delegation ────────────────── */
  const HOVER_SELECTOR = 'a, button, [role="button"], [data-cursor-hover], input[type="submit"], label';

  document.addEventListener('mouseover', e => {
    if (e.target.closest && e.target.closest(HOVER_SELECTOR)) {
      ring.classList.add('is-hover');
    }
  }, { passive: true });

  document.addEventListener('mouseout', e => {
    if (e.target.closest && e.target.closest(HOVER_SELECTOR)) {
      ring.classList.remove('is-hover');
    }
  }, { passive: true });

  /* ── rAF lerp loop ───────────────────────────────────── */
  function tick() {
    // Dot follows quickly (32% catch-up — nearly tracks pointer)
    dotX += (mouseX - dotX) * 0.32;
    dotY += (mouseY - dotY) * 0.32;
    dot.style.transform = `translate3d(${dotX}px, ${dotY}px, 0)`;

    // Ring lerps slower for that smooth trailing feel (12%)
    ringX += (mouseX - ringX) * 0.14;
    ringY += (mouseY - ringY) * 0.14;
    ring.style.transform = `translate3d(${ringX}px, ${ringY}px, 0)`;

    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
