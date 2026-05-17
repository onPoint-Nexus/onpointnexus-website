/* ───────────────────────────────────────────────────────────
   Case Study Enhancements — shared component JS
   Activates:
     - Image lightbox (any element with [data-zoom])
     - Phase accordion (.cs-phase / .cs-phase-head)
     - Before/after slider (.cs-ba container)
     - Smooth scroll reveals for .cs-reveal
   Drop in via:  <script src="/js/case-study-enhance.js" defer></script>
─────────────────────────────────────────────────────────── */
(() => {
  'use strict';

  /* ─── 1. Lightbox / zoom modal ─────────────────────────── */
  function ensureLightbox() {
    if (document.getElementById('csLightbox')) return document.getElementById('csLightbox');
    const lb = document.createElement('div');
    lb.id = 'csLightbox';
    lb.className = 'cs-lightbox';
    lb.innerHTML = `
      <div class="cs-lightbox-bar">
        <div class="cs-lightbox-title" id="csLbTitle">Image</div>
        <div class="cs-lightbox-controls">
          <button class="cs-lightbox-btn" id="csLbOut" aria-label="Zoom out">−</button>
          <span class="cs-lightbox-zoomlbl" id="csLbZoom">100%</span>
          <button class="cs-lightbox-btn" id="csLbIn" aria-label="Zoom in">+</button>
          <button class="cs-lightbox-btn" id="csLbReset" aria-label="Reset" title="Reset">⟲</button>
          <button class="cs-lightbox-btn" id="csLbClose" aria-label="Close" style="margin-left:6px">✕</button>
        </div>
      </div>
      <div class="cs-lightbox-stage" id="csLbStage">
        <img id="csLbImg" alt="">
      </div>
    `;
    document.body.appendChild(lb);
    return lb;
  }

  let zoom = 1, panX = 0, panY = 0, panning = false, startPanX = 0, startPanY = 0;

  function applyTransform(img) {
    img.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
    const lbl = document.getElementById('csLbZoom');
    if (lbl) lbl.textContent = `${Math.round(zoom * 100)}%`;
  }

  function openLightbox(src, title) {
    const lb = ensureLightbox();
    const img = document.getElementById('csLbImg');
    const titleEl = document.getElementById('csLbTitle');
    img.src = src;
    titleEl.textContent = title || 'Image';
    zoom = 1; panX = 0; panY = 0;
    applyTransform(img);
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    const lb = document.getElementById('csLightbox');
    if (!lb) return;
    lb.classList.remove('open');
    document.body.style.overflow = '';
  }

  function bindLightboxControls() {
    const lb = ensureLightbox();
    const img = document.getElementById('csLbImg');
    const stage = document.getElementById('csLbStage');

    document.getElementById('csLbClose').addEventListener('click', closeLightbox);
    document.getElementById('csLbIn').addEventListener('click', () => {
      zoom = Math.min(zoom + 0.25, 3);
      applyTransform(img);
    });
    document.getElementById('csLbOut').addEventListener('click', () => {
      zoom = Math.max(zoom - 0.25, 0.5);
      applyTransform(img);
    });
    document.getElementById('csLbReset').addEventListener('click', () => {
      zoom = 1; panX = 0; panY = 0;
      applyTransform(img);
    });

    /* Pan with pointer when zoomed > 1 */
    stage.addEventListener('pointerdown', e => {
      if (zoom <= 1 || e.target !== img) return;
      panning = true;
      stage.classList.add('dragging');
      stage.setPointerCapture?.(e.pointerId);
      startPanX = e.clientX - panX;
      startPanY = e.clientY - panY;
    });
    stage.addEventListener('pointermove', e => {
      if (!panning) return;
      panX = e.clientX - startPanX;
      panY = e.clientY - startPanY;
      applyTransform(img);
    });
    stage.addEventListener('pointerup', () => {
      panning = false;
      stage.classList.remove('dragging');
    });
    stage.addEventListener('pointercancel', () => {
      panning = false;
      stage.classList.remove('dragging');
    });

    /* Click outside img to close */
    stage.addEventListener('click', e => {
      if (e.target === stage) closeLightbox();
    });

    /* ESC to close */
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && lb.classList.contains('open')) closeLightbox();
      if (lb.classList.contains('open')) {
        if (e.key === '+' || e.key === '=') { zoom = Math.min(zoom + 0.25, 3); applyTransform(img); }
        if (e.key === '-' || e.key === '_') { zoom = Math.max(zoom - 0.25, 0.5); applyTransform(img); }
        if (e.key === '0') { zoom = 1; panX = 0; panY = 0; applyTransform(img); }
      }
    });
  }

  function bindZoomTriggers() {
    document.querySelectorAll('[data-zoom]').forEach(el => {
      if (el.dataset.csBound) return;
      el.dataset.csBound = '1';
      // Determine the image source to open
      let src = el.dataset.zoomSrc || el.getAttribute('src');
      if (!src && el.tagName !== 'IMG') {
        const img = el.querySelector('img');
        if (img) src = img.getAttribute('src');
      }
      if (!src) return;
      const title = el.dataset.zoomTitle || el.alt || el.getAttribute('aria-label') || '';
      el.addEventListener('click', e => {
        e.preventDefault();
        openLightbox(src, title);
      });
    });
  }

  /* ─── 2. Phase Accordion ───────────────────────────────── */
  function bindAccordions() {
    document.querySelectorAll('.cs-phases').forEach(group => {
      const phases = group.querySelectorAll('.cs-phase');
      phases.forEach(p => {
        const head = p.querySelector('.cs-phase-head');
        if (!head || head.dataset.csBound) return;
        head.dataset.csBound = '1';
        head.addEventListener('click', () => {
          const wasOpen = p.classList.contains('open');
          phases.forEach(o => o.classList.remove('open'));
          if (!wasOpen) p.classList.add('open');
        });
      });
    });
  }

  /* ─── 3. Before/After Slider ───────────────────────────── */
  function bindBeforeAfter() {
    document.querySelectorAll('.cs-ba').forEach(slider => {
      if (slider.dataset.csBound) return;
      slider.dataset.csBound = '1';
      const clip = slider.querySelector('.cs-ba-clip');
      const line = slider.querySelector('.cs-ba-line');
      const handle = slider.querySelector('.cs-ba-handle');
      if (!clip || !line || !handle) return;
      let dragging = false;
      function setPos(pct) {
        pct = Math.max(0, Math.min(100, pct));
        clip.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
        line.style.left = `${pct}%`;
        handle.style.left = `${pct}%`;
      }
      function fromEvent(e) {
        const rect = slider.getBoundingClientRect();
        const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
        setPos((x / rect.width) * 100);
      }
      slider.addEventListener('pointerdown', e => {
        dragging = true;
        slider.setPointerCapture?.(e.pointerId);
        fromEvent(e);
      });
      slider.addEventListener('pointermove', e => { if (dragging) fromEvent(e); });
      slider.addEventListener('pointerup', () => { dragging = false; });
      slider.addEventListener('pointercancel', () => { dragging = false; });
      setPos(50);
    });
  }

  /* ─── 4. Soft scroll reveals ───────────────────────────── */
  function bindReveals() {
    const els = document.querySelectorAll('.cs-reveal');
    if (!els.length) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      els.forEach(el => el.classList.add('cs-in'));
      return;
    }
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('cs-in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
    els.forEach(el => io.observe(el));
  }

  /* ─── Init ──────────────────────────────────────────────── */
  function init() {
    ensureLightbox();
    bindLightboxControls();
    bindZoomTriggers();
    bindAccordions();
    bindBeforeAfter();
    bindReveals();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* Re-scan in case content is added later */
  window.csEnhanceRescan = function () {
    bindZoomTriggers();
    bindAccordions();
    bindBeforeAfter();
  };
})();
