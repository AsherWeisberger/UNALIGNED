// OriginKit ReactiveGrid-inspired proximity bloom, tuned for a calm intake flow.
(() => {
  const canvas = document.querySelector('.ua-reactive-grid');
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  const reducedMq = matchMedia('(prefers-reduced-motion: reduce)');
  const hoverMq = matchMedia('(hover: hover) and (pointer: fine)');
  let reduced = reducedMq.matches;
  let hoverFine = hoverMq.matches;
  const pointer = { x: -9999, y: -9999, active: false };
  const idle = { x: 0, y: 0, t0: performance.now() };
  const particles = [];
  let width = 0, height = 0, raf = 0;

  function useCursorBloom() {
    return !reduced && hoverFine && innerWidth >= 560;
  }

  function roundedSquare(x, y, size) {
    const half = size / 2;
    ctx.beginPath();
    ctx.roundRect(x - half, y - half, size, size, Math.min(4, size * .28));
    ctx.fill();
  }

  function wander(now) {
    const t = (now - idle.t0) / 1000;
    idle.x = width * .5 + Math.sin(t * .17) * width * .22 + Math.sin(t * .07 + .8) * width * .08;
    idle.y = Math.min(height * .34, 250) + Math.sin(t * .11 + 1.15) * Math.min(height * .14, 72);
  }

  function bloomAt(now) {
    if (reduced) return { x: -9999, y: -9999, active: false, radius: 210, gain: 16, glow: .34 };
    if (useCursorBloom()) return { x: pointer.x, y: pointer.y, active: pointer.active, radius: 210, gain: 16, glow: .34 };
    wander(now);
    return { x: idle.x, y: idle.y, active: true, radius: 186, gain: 12, glow: .24 };
  }

  function draw(now) {
    ctx.clearRect(0, 0, width, height);
    const bloom = bloomAt(now || performance.now());
    let moving = false;
    for (const p of particles) {
      const distance = Math.hypot(bloom.x - p.x, bloom.y - p.y);
      const strength = bloom.active ? Math.max(0, 1 - distance / bloom.radius) : 0;
      const target = 2 + bloom.gain * strength * strength;
      const next = reduced ? 2 : p.size + (target - p.size) * .12;
      moving ||= Math.abs(next - p.size) > .05;
      p.size = next;
      ctx.fillStyle = 'rgba(217, 204, 172, ' + (.16 + strength * bloom.glow) + ')';
      roundedSquare(p.x, p.y, Math.max(1.5, p.size));
    }
    const keep = !reduced && (useCursorBloom() ? (moving || pointer.active) : true);
    raf = keep && !document.hidden ? requestAnimationFrame(draw) : 0;
  }

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    width = rect.width; height = rect.height;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    particles.length = 0;
    const cell = width < 560 ? 34 : 30;
    for (let y = cell / 2; y < height; y += cell)
      for (let x = cell / 2; x < width; x += cell) particles.push({ x, y, size: 2 });
    if (!useCursorBloom()) {
      pointer.active = false;
      pointer.x = -9999;
      pointer.y = -9999;
    }
    draw();
  }

  function wake() { if (!raf && !document.hidden) raf = requestAnimationFrame(draw); }

  addEventListener('pointermove', event => {
    if (!useCursorBloom()) return;
    if (event.pointerType && event.pointerType !== 'mouse') return;
    pointer.x = event.clientX; pointer.y = event.clientY; pointer.active = true; wake();
  }, { passive: true });
  document.addEventListener('pointerleave', () => { pointer.active = false; wake(); });
  addEventListener('blur', () => { pointer.active = false; wake(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) raf = 0; else wake(); });
  hoverMq.addEventListener('change', () => {
    hoverFine = hoverMq.matches;
    if (!useCursorBloom()) { pointer.active = false; pointer.x = -9999; pointer.y = -9999; }
    wake();
  });
  reducedMq.addEventListener('change', () => {
    reduced = reducedMq.matches;
    if (reduced) { pointer.active = false; pointer.x = -9999; pointer.y = -9999; }
    wake();
  });
  new ResizeObserver(resize).observe(canvas);
  resize();
})();
