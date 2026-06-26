/* ============================================================================
   CUBE THEME TRANSITION — diagonal Rubik's-cube wipe between dark and light.
   Vanilla JS, framework-agnostic, works on every page/view. Exposes a single
   global: window.cubeThemeTransition(apply).

   HOW IT LOOKS: the viewport tiles into a grid of beveled cubes painted in the
   CURRENT theme color. The theme switches underneath (hidden by the overlay),
   then the cubes flip away in a diagonal cascade from the top-left, revealing
   the new theme one rank at a time. Each tile gets a little random jitter so
   the wave reads as thousands of cubes turning, not a clean line.

   WIRING (Claude — two tiny edits, both testable):
   1. Load this file once, before the app bundle, in index.html (plain JS, no
      Babel needed):
        <script src="flow-v4/cube-theme-transition.js?v=20260626-cube-1"></script>
   2. Route the existing theme-apply effect through it (around the
      `document.body.setAttribute('data-theme', t.theme)` effect):
        React.useEffect(() => {
          var apply = function(){ document.body.setAttribute('data-theme', t.theme); };
          if (window.cubeThemeTransition) window.cubeThemeTransition(apply);
          else apply();
        }, [t.theme]);
   That's it — header toggle, command palette, and the settings radio all flow
   through this effect, so the wipe fires everywhere automatically.

   NOTES: the very first call (initial page load) applies with no animation, so
   there's no intro flip. Direction is top-left -> bottom-right; to reverse it,
   change `r + c` to `(rows-1-r) + (cols-1-c)`. Tune TILE / STEP / DUR below.
   Pairs with the `.cube-tx` CSS block in styles.css (keep DUR in sync).
   ============================================================================ */
(function () {
  if (window.cubeThemeTransition) return;

  var TILE = 46;   // target cube size in px
  var STEP = 20;   // ms of delay added per diagonal rank (the wave speed)
  var DUR  = 560;  // ms flip duration — MUST match --cube-dur in styles.css
  var initialized = false;

  window.cubeThemeTransition = function (apply) {
    // First call (page load): apply silently, no animation.
    if (!initialized) {
      initialized = true;
      if (typeof apply === 'function') apply();
      return;
    }

    // Kill any overlay still in flight (rapid toggles).
    var prev = document.getElementById('cube-tx');
    if (prev) prev.remove();

    var fromColor = getComputedStyle(document.body).backgroundColor || '#0b0a09';
    var w = window.innerWidth, h = window.innerHeight;
    var cols = Math.max(1, Math.ceil(w / TILE));
    var rows = Math.max(1, Math.ceil(h / TILE));

    var ov = document.createElement('div');
    ov.id = 'cube-tx';
    ov.className = 'cube-tx';
    ov.style.gridTemplateColumns = 'repeat(' + cols + ',1fr)';
    ov.style.gridTemplateRows = 'repeat(' + rows + ',1fr)';
    ov.style.setProperty('--cube-dur', (DUR / 1000) + 's');

    var tiles = [];
    var maxd = 0;
    var frag = document.createDocumentFragment();
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var t = document.createElement('i');
        t.style.background = fromColor;
        var d = r + c;
        if (d > maxd) maxd = d;
        tiles.push({ el: t, d: d });
        frag.appendChild(t);
      }
    }
    ov.appendChild(frag);
    document.body.appendChild(ov);

    // Paint one frame with the overlay fully covering the page in the OLD color,
    // THEN switch the theme underneath so the swap itself is never visible.
    void ov.offsetWidth;
    if (typeof apply === 'function') apply();

    // Stagger each cube by its diagonal rank + a little jitter.
    tiles.forEach(function (o) {
      var jit = Math.random() * 70;
      o.el.style.transitionDelay = (o.d * STEP + jit) + 'ms';
    });

    // Trigger the flip on the next frame so the delays take effect.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { ov.classList.add('go'); });
    });

    // Remove the overlay once the last cube has finished.
    var total = maxd * STEP + 70 + DUR + 90;
    setTimeout(function () { if (ov && ov.parentNode) ov.remove(); }, total);
  };
})();
