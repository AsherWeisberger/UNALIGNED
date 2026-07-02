/* ============================================================================
   CUBE TRANSITIONS — diagonal Rubik's-cube wipe for theme toggles, plus a
   corners-in / center-fade reveal for the Company OS boot splash.
   Vanilla JS, framework-agnostic, works on every page/view. Globals:
     window.cubeThemeTransition(apply)        -> theme toggle (diagonal flip)
     window.cubeBootReveal(apply, opts)       -> boot reveal (corners -> center fade)

   THEME WIRING (around the data-theme effect):
     React.useEffect(() => {
       var apply = function(){ document.body.setAttribute('data-theme', t.theme); };
       if (window.cubeThemeTransition) window.cubeThemeTransition(apply);
       else apply();
     }, [t.theme]);

   BOOT WIRING (in V6CompanyOsBoot — replace the exit/done timeouts):
     // instead of setPhase('exit') @2400 + onDone @3200, do one cube reveal:
     const tExit = setTimeout(() => {
       var finish = function(){ document.body.classList.remove('v6-booting'); onDone(); };
       if (window.cubeBootReveal) window.cubeBootReveal(finish);
       else { setPhase('exit'); setTimeout(finish, 800); }
     }, 2400);
   The cubes paint over the splash, finish() unmounts the splash + reveals the
   app underneath, then the cubes clear from the corners inward, the center
   (where the logo sat) fading last.

   TUNE: TILE (cube size — smaller = more cubes / more flow), STEP (wave speed),
   DUR (flip/fade duration; keep in sync with --cube-dur in styles.css).
   ============================================================================ */
(function () {
  if (window.cubeThemeTransition && window.cubeBootReveal) return;

  var TILE = 33;   // px cube size — smaller than before for more flow
  var STEP = 13;   // ms delay per wave rank — snappier
  var DUR  = 400;  // ms flip/fade — snappier (sync with --cube-dur in CSS)

  function runCubes(opts) {
    opts = opts || {};
    var apply = opts.apply;
    var mode = opts.mode || 'diagonal';   // 'diagonal' (flip) | 'corners' (radial)
    var fade = !!opts.fade;               // true -> shrink+fade instead of flip
    var step = opts.step != null ? opts.step : STEP;
    var dur  = opts.dur  != null ? opts.dur  : DUR;
    var tile = opts.tile != null ? opts.tile : TILE;

    var prev = document.getElementById('cube-tx');
    if (prev) prev.remove();

    var fromColor = opts.color || getComputedStyle(document.body).backgroundColor || '#0b0a09';
    var w = window.innerWidth, h = window.innerHeight;
    var cols = Math.max(1, Math.ceil(w / tile));
    var rows = Math.max(1, Math.ceil(h / tile));
    var cx = (cols - 1) / 2, cy = (rows - 1) / 2;
    var maxCorner = Math.sqrt(cx * cx + cy * cy) || 1;

    var ov = document.createElement('div');
    ov.id = 'cube-tx';
    ov.className = 'cube-tx' + (fade ? ' fade' : '');
    ov.style.gridTemplateColumns = 'repeat(' + cols + ',1fr)';
    ov.style.gridTemplateRows = 'repeat(' + rows + ',1fr)';
    ov.style.setProperty('--cube-dur', (dur / 1000) + 's');

    var tiles = [];
    var maxd = 0;
    var frag = document.createDocumentFragment();
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var t = document.createElement('i');
        t.style.background = fromColor;
        var d;
        if (mode === 'corners') {
          var dist = Math.sqrt((c - cx) * (c - cx) + (r - cy) * (r - cy));
          d = (maxCorner - dist);   // corners go first, center last
        } else {
          d = r + c;                // top-left -> bottom-right
        }
        if (d > maxd) maxd = d;
        tiles.push({ el: t, d: d });
        frag.appendChild(t);
      }
    }
    ov.appendChild(frag);
    document.body.appendChild(ov);

    // Paint one covered frame in the OLD color, THEN switch underneath.
    void ov.offsetWidth;
    if (typeof apply === 'function') apply();

    tiles.forEach(function (o) {
      var jit = Math.random() * 50;
      o.el.style.transitionDelay = (o.d * step + jit) + 'ms';
    });

    requestAnimationFrame(function () {
      requestAnimationFrame(function () { ov.classList.add('go'); });
    });

    var total = maxd * step + 50 + dur + 80;
    setTimeout(function () { if (ov && ov.parentNode) ov.remove(); }, total);
  }

  // ---- LIQUID THEME SWEEP (2026-07-01) ----------------------------------
  // Replaces the diagonal cube flip for theme toggles. The old theme becomes
  // a full-screen sheet that dissolves outward from the click point behind a
  // wide feathered mask edge — a receding tide, not a pixel wipe. Driven by
  // an animatable @property (--lqr) so the browser tweens the mask natively.
  // CSS lives in styles.css (.liquid-tx + @property --lqr). The boot reveal
  // below still uses the cubes.

  var lastPointer = { x: null, y: null, t: 0 };
  document.addEventListener('pointerdown', function (e) {
    lastPointer = { x: e.clientX, y: e.clientY, t: Date.now() };
  }, true);

  function liquidSweep(apply) {
    var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var supported = window.CSS && CSS.registerProperty && CSS.supports('mask-image', 'radial-gradient(circle, black, transparent)');
    if (reduced || !supported) {
      if (typeof apply === 'function') apply();
      return;
    }
    var prev = document.getElementById('liquid-tx');
    if (prev) prev.remove();

    var fromColor = getComputedStyle(document.body).backgroundColor || '#0b0a09';
    var w = window.innerWidth, h = window.innerHeight;
    // sweep from the toggle the user just pressed; fall back to upper center
    var fresh = lastPointer.x != null && (Date.now() - lastPointer.t) < 1200;
    var x = fresh ? lastPointer.x : w / 2;
    var y = fresh ? lastPointer.y : h * 0.38;
    var dx = Math.max(x, w - x), dy = Math.max(y, h - y);
    var R = Math.sqrt(dx * dx + dy * dy);

    var ov = document.createElement('div');
    ov.id = 'liquid-tx';
    ov.className = 'liquid-tx';
    ov.style.background = fromColor;
    ov.style.setProperty('--lqx', x + 'px');
    ov.style.setProperty('--lqy', y + 'px');
    document.body.appendChild(ov);

    // Paint one covered frame in the OLD color, THEN switch underneath.
    void ov.offsetWidth;
    if (typeof apply === 'function') apply();

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        ov.style.setProperty('--lqr', (R + 220) + 'px');
      });
    });

    setTimeout(function () { if (ov && ov.parentNode) ov.remove(); }, 1000);
  }

  var initialized = false;
  window.cubeThemeTransition = function (apply) {
    // First call (page load) applies silently — no intro sweep.
    if (!initialized) {
      initialized = true;
      if (typeof apply === 'function') apply();
      return;
    }
    liquidSweep(apply);
  };

  window.cubeBootReveal = function (apply, opts) {
    opts = opts || {};
    runCubes({
      apply: apply, mode: 'corners', fade: true,
      color: opts.color, step: opts.step, dur: opts.dur, tile: opts.tile,
    });
  };
})();
