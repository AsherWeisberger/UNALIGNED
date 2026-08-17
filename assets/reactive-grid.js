// OriginKit ReactiveGrid-inspired proximity bloom, tuned for a calm intake flow.
(() => {
  const canvas = document.querySelector('.ua-reactive-grid');
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pointer = { x: -9999, y: -9999, active: false };
  const particles = [];
  let width = 0, height = 0, raf = 0;

  function roundedSquare(x, y, size) {
    const half = size / 2;
    ctx.beginPath();
    ctx.roundRect(x - half, y - half, size, size, Math.min(4, size * .28));
    ctx.fill();
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    let moving = false;
    for (const p of particles) {
      const distance = Math.hypot(pointer.x - p.x, pointer.y - p.y);
      const strength = pointer.active && !reduced ? Math.max(0, 1 - distance / 210) : 0;
      const target = 2 + 16 * strength * strength;
      const next = reduced ? 2 : p.size + (target - p.size) * .12;
      moving ||= Math.abs(next - p.size) > .05;
      p.size = next;
      ctx.fillStyle = 'rgba(217, 204, 172, ' + (.16 + strength * .34) + ')';
      roundedSquare(p.x, p.y, Math.max(1.5, p.size));
    }
    raf = moving || pointer.active ? requestAnimationFrame(draw) : 0;
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
    draw();
  }

  function wake() { if (!raf) raf = requestAnimationFrame(draw); }
  addEventListener('pointermove', event => {
    pointer.x = event.clientX; pointer.y = event.clientY; pointer.active = true; wake();
  }, { passive: true });
  document.addEventListener('pointerleave', () => { pointer.active = false; wake(); });
  addEventListener('blur', () => { pointer.active = false; wake(); });
  new ResizeObserver(resize).observe(canvas);
  resize();
})();
