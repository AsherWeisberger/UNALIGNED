/**
 * FLOW WORLD — Pokemon GB / MapleStory vibe pixel habitat for Machine Room.
 * Attach to a <canvas>; pass live flowData + workers for animated carriers.
 */
(function (global) {
  'use strict';

  const PX = 4;
  const W = 80;
  const H = 72;

  const GB = {
    g0: '#0f380f',
    g1: '#306230',
    g2: '#8bac0f',
    g3: '#9bbc0f',
    ink: '#0f380f',
    paper: '#e8f4c8',
    white: '#f8fff0',
  };

  const ZONE_COLORS = {
    intake: { roof: '#c84830', wall: '#f8f0d8', accent: '#4a7ab8' },
    conversion: { roof: '#7040b0', wall: '#f0e8ff', accent: '#9b6edf' },
    execution: { roof: '#208868', wall: '#e0fff4', accent: '#3cb8a0' },
    retention: { roof: '#c89018', wall: '#fff8d8', accent: '#d4a017' },
  };

  const STATIONS = {
    intake: { cx: 18, cy: 20, label: 'INTAKE' },
    conversion: { cx: 62, cy: 20, label: 'CONVERT' },
    retention: { cx: 18, cy: 52, label: 'KEEP' },
    execution: { cx: 62, cy: 52, label: 'EXEC' },
  };

  const CENTER = { cx: 40, cy: 36 };

  const ROUTES = [
    ['intake', 'conversion'],
    ['conversion', 'execution'],
    ['intake', 'retention'],
    ['retention', 'execution'],
    ['intake', 'execution'],
    ['conversion', 'retention'],
  ];

  const ACCENT_SHIRT = {
    blue: '#4a7ab8',
    violet: '#7b5cbf',
    gold: '#c89018',
    mint: '#3cb8a0',
    coral: '#e07058',
    red: '#c84830',
    amber: '#d4a017',
    sky: '#58a8d8',
    plum: '#9060a8',
    slate: '#687888',
  };

  function fill(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x * PX, y * PX, w * PX, h * PX);
  }

  function grassTile(ctx, tx, ty, t) {
    const flicker = ((tx + ty + Math.floor(t / 18)) % 7 === 0) ? GB.g3 : GB.g2;
    fill(ctx, tx, ty, 1, 1, flicker);
    if ((tx * 3 + ty) % 11 === 0) fill(ctx, tx, ty, 1, 1, GB.g1);
  }

  function drawTree(ctx, tx, ty) {
    fill(ctx, tx, ty + 2, 3, 3, '#604020');
    fill(ctx, tx - 1, ty, 5, 3, GB.g1);
    fill(ctx, tx, ty - 1, 3, 2, GB.g2);
  }

  function drawSign(ctx, tx, ty, text) {
    fill(ctx, tx, ty + 2, 1, 3, '#604020');
    fill(ctx, tx - 2, ty, 5, 2, GB.paper);
    fill(ctx, tx - 1, ty, 3, 1, GB.ink);
    ctx.fillStyle = GB.ink;
    ctx.font = `${PX}px "Press Start 2P", monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(text, (tx + 0.5) * PX, (ty + 1.5) * PX);
  }

  function drawPath(ctx) {
    const paths = [
      [14, 34, 66, 34],
      [40, 14, 40, 58],
      [18, 20, 62, 52],
      [62, 20, 18, 52],
    ];
    paths.forEach(([x1, y1, x2, y2]) => {
      const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
      for (let i = 0; i <= steps; i++) {
        const t = steps ? i / steps : 0;
        const x = Math.round(x1 + (x2 - x1) * t);
        const y = Math.round(y1 + (y2 - y1) * t);
        fill(ctx, x - 1, y, 3, 1, '#a08050');
        fill(ctx, x, y - 1, 1, 3, '#a08050');
      }
    });
    fill(ctx, 37, 33, 6, 6, '#b89868');
  }

  function drawBuilding(ctx, zone, activity, t) {
    const s = STATIONS[zone];
    const pal = ZONE_COLORS[zone];
    const pulse = activity > 2 ? Math.sin(t * 0.08) * 0.5 + 0.5 : 0;
    const bx = s.cx - 7;
    const by = s.cy - 6;

    fill(ctx, bx, by + 2, 14, 10, pal.wall);
    fill(ctx, bx, by, 14, 3, pal.roof);
    fill(ctx, bx + 1, by, 12, 1, '#00000022');
    fill(ctx, bx + 5, by + 5, 4, 6, GB.g1);
    fill(ctx, bx + 6, by + 9, 2, 2, '#604020');

    if (activity > 0) {
      fill(ctx, s.cx - 1, by - 3, 2, 2, pal.accent);
      if (pulse > 0.7) {
        fill(ctx, s.cx + 4, by - 4, 1, 1, GB.white);
        fill(ctx, s.cx + 5, by - 5, 1, 1, GB.white);
      }
    }

    if (activity > 3 && Math.floor(t / 40) % 2 === 0) {
      ctx.fillStyle = GB.ink;
      ctx.font = `bold ${PX * 3}px "Press Start 2P", monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('!', s.cx * PX, (by - 2) * PX);
    }
  }

  function drawMachine(ctx, totalActive, t) {
    const cx = CENTER.cx;
    const cy = CENTER.cy;
    fill(ctx, cx - 6, cy - 4, 12, 8, '#d8e8f8');
    fill(ctx, cx - 5, cy - 5, 10, 2, '#88a8c8');
    fill(ctx, cx - 4, cy - 2, 8, 4, '#1a2840');
    const blink = Math.floor(t / 30) % 2;
    fill(ctx, cx - 3, cy - 1, 2, 1, blink ? '#58f8a8' : '#208848');
    fill(ctx, cx + 1, cy - 1, 2, 1, blink ? '#f8d858' : '#a87818');
    fill(ctx, cx - 2, cy + 2, 4, 2, '#506070');
    if (totalActive > 0) {
      const spark = (t % 20) / 20;
      fill(ctx, cx + 5, cy - 3 + Math.sin(spark * 6.28) * 2, 1, 1, '#f8f8a0');
    }
  }

  function drawWorker(ctx, x, y, frame, shirt, carrying) {
    const f = frame % 2;
    const bob = f ? 0 : -1;
    const py = y + bob;
    fill(ctx, x - 2, py - 4, 4, 2, '#f0c0a0');
    fill(ctx, x - 2, py - 2, 4, 3, shirt);
    fill(ctx, x - 3, py, 1, 2, shirt);
    fill(ctx, x + 2, py, 1, 2, shirt);
    fill(ctx, x - 1, py + 2, 1, 2, GB.ink);
    fill(ctx, x, py + 2, 1, 2, GB.ink);
    fill(ctx, x - 1, py - 3, 1, 1, GB.ink);
    fill(ctx, x, py - 3, 1, 1, GB.ink);
    if (carrying) {
      fill(ctx, x + 2, py - 2, 2, 2, '#f8e878');
      fill(ctx, x + 2, py - 3, 2, 1, '#e8c040');
    }
  }

  function lerpPath(from, to, t) {
    const a = STATIONS[from];
    const b = STATIONS[to];
    const mid = CENTER;
    const t1 = Math.min(t * 2, 1);
    const t2 = Math.max(0, t * 2 - 1);
    const x1 = a.cx + (mid.cx - a.cx) * t1;
    const y1 = a.cy + (mid.cy - a.cy) * t1;
    if (t < 0.5) return { x: x1, y: y1 };
    return {
      x: mid.cx + (b.cx - mid.cx) * t2,
      y: mid.cy + (b.cy - mid.cy) * t2,
    };
  }

  function buildWalkers(workers) {
    const walkers = [];
    (workers || []).forEach((worker, wi) => {
      const count = Math.min(3, Math.max(0, worker.active || 0));
      const route = ROUTES[wi % ROUTES.length];
      for (let i = 0; i < count; i++) {
        walkers.push({
          id: `${worker.id}-${i}`,
          workerId: worker.id,
          name: worker.glyph || worker.name?.slice(0, 2) || '??',
          shirt: ACCENT_SHIRT[worker.accent] || '#4a7ab8',
          from: route[0],
          to: route[1],
          progress: Math.random(),
          speed: 0.003 + Math.random() * 0.004,
          frame: Math.floor(Math.random() * 4),
          carrying: true,
        });
      }
    });
    if (!walkers.length) {
      ['intake', 'conversion', 'execution', 'retention'].forEach((zone, i) => {
        walkers.push({
          id: `idle-${zone}`,
          workerId: null,
          shirt: ZONE_COLORS[zone].accent,
          from: zone,
          to: ROUTES[i][1],
          progress: Math.random(),
          speed: 0.002,
          frame: 0,
          carrying: false,
        });
      });
    }
    return walkers;
  }

  function attach(canvas, options) {
    if (!canvas) return () => {};
    const opts = options || {};
    const flowData = opts.flowData || {};
    const workers = opts.workers || [];

    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    const resize = () => {
      canvas.width = W * PX;
      canvas.height = H * PX;
    };
    resize();

    let walkers = buildWalkers(workers);
    let time = 0;
    let raf = 0;

    const draw = () => {
      time += 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let ty = 0; ty < H; ty++) {
        for (let tx = 0; tx < W; tx++) {
          grassTile(ctx, tx, ty, time);
        }
      }

      drawTree(ctx, 4, 8);
      drawTree(ctx, 72, 10);
      drawTree(ctx, 6, 62);
      drawTree(ctx, 70, 60);
      drawSign(ctx, 40, 8, 'OPS');
      drawPath(ctx);
      drawMachine(ctx, opts.totalActive || 0, time);

      Object.keys(STATIONS).forEach((zone) => {
        drawBuilding(ctx, zone, flowData[zone] || 0, time + zone.length * 11);
      });

      walkers.forEach((w) => {
        w.progress += w.speed;
        if (w.progress > 1) {
          w.progress = 0;
          const swap = w.from;
          w.from = w.to;
          w.to = swap;
        }
        const pos = lerpPath(w.from, w.to, w.progress);
        w.frame += 0.12;
        const wx = Math.round(pos.x);
        const wy = Math.round(pos.y);
        drawWorker(ctx, wx, wy, Math.floor(w.frame), w.shirt, w.carrying);
        if (w.carrying && Math.floor(w.frame) % 8 < 4) {
          fill(ctx, wx + 3, wy - 5, 1, 1, '#f8f8a0');
        }
      });

      ctx.fillStyle = GB.ink;
      ctx.font = `${PX * 2}px "Press Start 2P", monospace`;
      ctx.textAlign = 'center';
      Object.entries(STATIONS).forEach(([zone, s]) => {
        const count = flowData[zone] || 0;
        ctx.fillText(String(count), s.cx * PX, (s.cy + 9) * PX);
      });

      raf = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(raf);
    };
  }

  global.FlowWorldPixel = { attach, GB, STATIONS };
})(typeof window !== 'undefined' ? window : globalThis);