
// tweaks-panel.jsx
// Reusable Tweaks shell + form-control helpers.
//
// Owns the host protocol (listens for __activate_edit_mode / __deactivate_edit_mode,
// posts __edit_mode_available / __edit_mode_set_keys / __edit_mode_dismissed) so
// individual prototypes don't re-roll it. Ships a consistent set of controls so you
// don't hand-draw <input type="range">, segmented radios, steppers, etc.
//
// Usage (in an HTML file that loads React + Babel):
//
//   const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
//     "primaryColor": "#D97757",
//     "palette": ["#D97757", "#29261b", "#f6f4ef"],
//     "fontSize": 16,
//     "density": "regular",
//     "dark": false
//   }/*EDITMODE-END*/;
//
//   function App() {
//     const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
//     return (
//       <div style={{ fontSize: t.fontSize, color: t.primaryColor }}>
//         Hello
//         <TweaksPanel>
//           <TweakSection label="Typography" />
//           <TweakSlider label="Font size" value={t.fontSize} min={10} max={32} unit="px"
//                        onChange={(v) => setTweak('fontSize', v)} />
//           <TweakRadio  label="Density" value={t.density}
//                        options={['compact', 'regular', 'comfy']}
//                        onChange={(v) => setTweak('density', v)} />
//           <TweakSection label="Theme" />
//           <TweakColor  label="Primary" value={t.primaryColor}
//                        options={['#D97757', '#2A6FDB', '#1F8A5B', '#7A5AE0']}
//                        onChange={(v) => setTweak('primaryColor', v)} />
//           <TweakColor  label="Palette" value={t.palette}
//                        options={[['#D97757', '#29261b', '#f6f4ef'],
//                                  ['#475569', '#0f172a', '#f1f5f9']]}
//                        onChange={(v) => setTweak('palette', v)} />
//           <TweakToggle label="Dark mode" value={t.dark}
//                        onChange={(v) => setTweak('dark', v)} />
//         </TweaksPanel>
//       </div>
//     );
//   }
//
// ─────────────────────────────────────────────────────────────────────────────

const __TWEAKS_STYLE = `
  .twk-panel{position:fixed;right:16px;bottom:16px;z-index:2147483646;width:280px;
    max-height:calc(100vh - 32px);display:flex;flex-direction:column;
    transform:scale(var(--dc-inv-zoom,1));transform-origin:bottom right;
    background:rgba(250,249,247,.78);color:#29261b;
    -webkit-backdrop-filter:blur(24px) saturate(160%);backdrop-filter:blur(24px) saturate(160%);
    border:.5px solid rgba(255,255,255,.6);border-radius:14px;
    box-shadow:0 1px 0 rgba(255,255,255,.5) inset,0 12px 40px rgba(0,0,0,.18);
    font:11.5px/1.4 ui-sans-serif,system-ui,-apple-system,sans-serif;overflow:hidden}
  .twk-hd{display:flex;align-items:center;justify-content:space-between;
    padding:10px 8px 10px 14px;cursor:move;user-select:none}
  .twk-hd b{font-size:12px;font-weight:600;letter-spacing:.01em}
  .twk-x{appearance:none;border:0;background:transparent;color:rgba(41,38,27,.55);
    width:22px;height:22px;border-radius:6px;cursor:default;font-size:13px;line-height:1}
  .twk-x:hover{background:rgba(0,0,0,.06);color:#29261b}
  .twk-body{padding:2px 14px 14px;display:flex;flex-direction:column;gap:10px;
    overflow-y:auto;overflow-x:hidden;min-height:0;
    scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.15) transparent}
  .twk-body::-webkit-scrollbar{width:8px}
  .twk-body::-webkit-scrollbar-track{background:transparent;margin:2px}
  .twk-body::-webkit-scrollbar-thumb{background:rgba(0,0,0,.15);border-radius:4px;
    border:2px solid transparent;background-clip:content-box}
  .twk-body::-webkit-scrollbar-thumb:hover{background:rgba(0,0,0,.25);
    border:2px solid transparent;background-clip:content-box}
  .twk-row{display:flex;flex-direction:column;gap:5px}
  .twk-row-h{flex-direction:row;align-items:center;justify-content:space-between;gap:10px}
  .twk-lbl{display:flex;justify-content:space-between;align-items:baseline;
    color:rgba(41,38,27,.72)}
  .twk-lbl>span:first-child{font-weight:500}
  .twk-val{color:rgba(41,38,27,.5);font-variant-numeric:tabular-nums}

  .twk-sect{font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
    color:rgba(41,38,27,.45);padding:10px 0 0}
  .twk-sect:first-child{padding-top:0}

  .twk-field{appearance:none;box-sizing:border-box;width:100%;min-width:0;height:26px;padding:0 8px;
    border:.5px solid rgba(0,0,0,.1);border-radius:7px;
    background:rgba(255,255,255,.6);color:inherit;font:inherit;outline:none}
  .twk-field:focus{border-color:rgba(0,0,0,.25);background:rgba(255,255,255,.85)}
  select.twk-field{padding-right:22px;
    background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path fill='rgba(0,0,0,.5)' d='M0 0h10L5 6z'/></svg>");
    background-repeat:no-repeat;background-position:right 8px center}

  .twk-slider{appearance:none;-webkit-appearance:none;width:100%;height:4px;margin:6px 0;
    border-radius:999px;background:rgba(0,0,0,.12);outline:none}
  .twk-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;
    width:14px;height:14px;border-radius:50%;background:#fff;
    border:.5px solid rgba(0,0,0,.12);box-shadow:0 1px 3px rgba(0,0,0,.2);cursor:default}
  .twk-slider::-moz-range-thumb{width:14px;height:14px;border-radius:50%;
    background:#fff;border:.5px solid rgba(0,0,0,.12);box-shadow:0 1px 3px rgba(0,0,0,.2);cursor:default}

  .twk-seg{position:relative;display:flex;padding:2px;border-radius:8px;
    background:rgba(0,0,0,.06);user-select:none}
  .twk-seg-thumb{position:absolute;top:2px;bottom:2px;border-radius:6px;
    background:rgba(255,255,255,.9);box-shadow:0 1px 2px rgba(0,0,0,.12);
    transition:left .15s cubic-bezier(.3,.7,.4,1),width .15s}
  .twk-seg.dragging .twk-seg-thumb{transition:none}
  .twk-seg button{appearance:none;position:relative;z-index:1;flex:1;border:0;
    background:transparent;color:inherit;font:inherit;font-weight:500;min-height:22px;
    border-radius:6px;cursor:default;padding:4px 6px;line-height:1.2;
    overflow-wrap:anywhere}

  .twk-toggle{position:relative;width:32px;height:18px;border:0;border-radius:999px;
    background:rgba(0,0,0,.15);transition:background .15s;cursor:default;padding:0}
  .twk-toggle[data-on="1"]{background:#34c759}
  .twk-toggle i{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;
    background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .15s}
  .twk-toggle[data-on="1"] i{transform:translateX(14px)}

  .twk-num{display:flex;align-items:center;box-sizing:border-box;min-width:0;height:26px;padding:0 0 0 8px;
    border:.5px solid rgba(0,0,0,.1);border-radius:7px;background:rgba(255,255,255,.6)}
  .twk-num-lbl{font-weight:500;color:rgba(41,38,27,.6);cursor:ew-resize;
    user-select:none;padding-right:8px}
  .twk-num input{flex:1;min-width:0;height:100%;border:0;background:transparent;
    font:inherit;font-variant-numeric:tabular-nums;text-align:right;padding:0 8px 0 0;
    outline:none;color:inherit;-moz-appearance:textfield}
  .twk-num input::-webkit-inner-spin-button,.twk-num input::-webkit-outer-spin-button{
    -webkit-appearance:none;margin:0}
  .twk-num-unit{padding-right:8px;color:rgba(41,38,27,.45)}

  .twk-btn{appearance:none;height:26px;padding:0 12px;border:0;border-radius:7px;
    background:rgba(0,0,0,.78);color:#fff;font:inherit;font-weight:500;cursor:default}
  .twk-btn:hover{background:rgba(0,0,0,.88)}
  .twk-btn.secondary{background:rgba(0,0,0,.06);color:inherit}
  .twk-btn.secondary:hover{background:rgba(0,0,0,.1)}

  .twk-swatch{appearance:none;-webkit-appearance:none;width:56px;height:22px;
    border:.5px solid rgba(0,0,0,.1);border-radius:6px;padding:0;cursor:default;
    background:transparent;flex-shrink:0}
  .twk-swatch::-webkit-color-swatch-wrapper{padding:0}
  .twk-swatch::-webkit-color-swatch{border:0;border-radius:5.5px}
  .twk-swatch::-moz-color-swatch{border:0;border-radius:5.5px}

  .twk-chips{display:flex;gap:6px}
  .twk-chip{position:relative;appearance:none;flex:1;min-width:0;height:46px;
    padding:0;border:0;border-radius:6px;overflow:hidden;cursor:default;
    box-shadow:0 0 0 .5px rgba(0,0,0,.12),0 1px 2px rgba(0,0,0,.06);
    transition:transform .12s cubic-bezier(.3,.7,.4,1),box-shadow .12s}
  .twk-chip:hover{transform:translateY(-1px);
    box-shadow:0 0 0 .5px rgba(0,0,0,.18),0 4px 10px rgba(0,0,0,.12)}
  .twk-chip[data-on="1"]{box-shadow:0 0 0 1.5px rgba(0,0,0,.85),
    0 2px 6px rgba(0,0,0,.15)}
  .twk-chip>span{position:absolute;top:0;bottom:0;right:0;width:34%;
    display:flex;flex-direction:column;box-shadow:-1px 0 0 rgba(0,0,0,.1)}
  .twk-chip>span>i{flex:1;box-shadow:0 -1px 0 rgba(0,0,0,.1)}
  .twk-chip>span>i:first-child{box-shadow:none}
  .twk-chip svg{position:absolute;top:6px;left:6px;width:13px;height:13px;
    filter:drop-shadow(0 1px 1px rgba(0,0,0,.3))}
`;

// ── useTweaks ───────────────────────────────────────────────────────────────
// Single source of truth for tweak values. setTweak persists via the host
// (__edit_mode_set_keys → host rewrites the EDITMODE block on disk).
function useTweaks(defaults) {
  const [values, setValues] = React.useState(defaults);
  // Accepts either setTweak('key', value) or setTweak({ key: value, ... }) so a
  // useState-style call doesn't write a "[object Object]" key into the persisted
  // JSON block.
  const setTweak = React.useCallback((keyOrEdits, val) => {
    const edits = typeof keyOrEdits === 'object' && keyOrEdits !== null
      ? keyOrEdits : { [keyOrEdits]: val };
    setValues((prev) => ({ ...prev, ...edits }));
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits }, '*');
    // Same-window signal so in-page listeners (deck-stage rail thumbnails)
    // can react — the parent message only reaches the host, not peers.
    window.dispatchEvent(new CustomEvent('tweakchange', { detail: edits }));
  }, []);
  return [values, setTweak];
}

// ── TweaksPanel ─────────────────────────────────────────────────────────────
// Floating shell. Registers the protocol listener BEFORE announcing
// availability — if the announce ran first, the host's activate could land
// before our handler exists and the toolbar toggle would silently no-op.
// The close button posts __edit_mode_dismissed so the host's toolbar toggle
// flips off in lockstep; the host echoes __deactivate_edit_mode back which
// is what actually hides the panel.
function TweaksPanel({ title = 'Tweaks', noDeckControls = false, children }) {
  const [open, setOpen] = React.useState(false);
  const dragRef = React.useRef(null);
  // Auto-inject a rail toggle when a <deck-stage> is on the page. The
  // toggle drives the deck's per-viewer _railVisible via window message;
  // state is mirrored from the same localStorage key the deck reads so
  // the control reflects reality across reloads. The mechanism is the
  // message — authors who want custom placement can post it directly
  // and pass noDeckControls to suppress this one.
  const hasDeckStage = React.useMemo(
    () => typeof document !== 'undefined' && !!document.querySelector('deck-stage'),
    [],
  );
  // deck-stage enables its rail in connectedCallback, but this panel can
  // mount before that element has upgraded. The initial read catches the
  // common case; the listener covers mounting first. (Older deck-stage.js
  // copies still wait for the host's __omelette_rail_enabled postMessage —
  // same listener handles those.)
  const [railEnabled, setRailEnabled] = React.useState(
    () => hasDeckStage && !!document.querySelector('deck-stage')?._railEnabled,
  );
  React.useEffect(() => {
    if (!hasDeckStage || railEnabled) return undefined;
    const onMsg = (e) => {
      if (e.data && e.data.type === '__omelette_rail_enabled') setRailEnabled(true);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [hasDeckStage, railEnabled]);
  const [railVisible, setRailVisible] = React.useState(() => {
    try { return localStorage.getItem('deck-stage.railVisible') !== '0'; } catch (e) { return true; }
  });
  const toggleRail = (on) => {
    setRailVisible(on);
    window.postMessage({ type: '__deck_rail_visible', on }, '*');
  };
  const offsetRef = React.useRef({ x: 16, y: 16 });
  const PAD = 16;

  const clampToViewport = React.useCallback(() => {
    const panel = dragRef.current;
    if (!panel) return;
    const w = panel.offsetWidth, h = panel.offsetHeight;
    const maxRight = Math.max(PAD, window.innerWidth - w - PAD);
    const maxBottom = Math.max(PAD, window.innerHeight - h - PAD);
    offsetRef.current = {
      x: Math.min(maxRight, Math.max(PAD, offsetRef.current.x)),
      y: Math.min(maxBottom, Math.max(PAD, offsetRef.current.y)),
    };
    panel.style.right = offsetRef.current.x + 'px';
    panel.style.bottom = offsetRef.current.y + 'px';
  }, []);

  React.useEffect(() => {
    if (!open) return;
    clampToViewport();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', clampToViewport);
      return () => window.removeEventListener('resize', clampToViewport);
    }
    const ro = new ResizeObserver(clampToViewport);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, [open, clampToViewport]);

  React.useEffect(() => {
    const onMsg = (e) => {
      const t = e?.data?.type;
      if (t === '__activate_edit_mode') setOpen(true);
      else if (t === '__deactivate_edit_mode') setOpen(false);
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const dismiss = () => {
    setOpen(false);
    window.parent.postMessage({ type: '__edit_mode_dismissed' }, '*');
  };

  const onDragStart = (e) => {
    const panel = dragRef.current;
    if (!panel) return;
    const r = panel.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY;
    const startRight = window.innerWidth - r.right;
    const startBottom = window.innerHeight - r.bottom;
    const move = (ev) => {
      offsetRef.current = {
        x: startRight - (ev.clientX - sx),
        y: startBottom - (ev.clientY - sy),
      };
      clampToViewport();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  if (!open) return null;
  return (
    <>
      <style>{__TWEAKS_STYLE}</style>
      <div ref={dragRef} className="twk-panel" data-noncommentable=""
           style={{ right: offsetRef.current.x, bottom: offsetRef.current.y }}>
        <div className="twk-hd" onMouseDown={onDragStart}>
          <b>{title}</b>
          <button className="twk-x" aria-label="Close tweaks"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={dismiss}>✕</button>
        </div>
        <div className="twk-body">
          {children}
          {hasDeckStage && railEnabled && !noDeckControls && (
            <TweakSection label="Deck">
              <TweakToggle label="Thumbnail rail" value={railVisible} onChange={toggleRail} />
            </TweakSection>
          )}
        </div>
      </div>
    </>
  );
}

// ── Layout helpers ──────────────────────────────────────────────────────────

function TweakSection({ label, children }) {
  return (
    <>
      <div className="twk-sect">{label}</div>
      {children}
    </>
  );
}

function TweakRow({ label, value, children, inline = false }) {
  return (
    <div className={inline ? 'twk-row twk-row-h' : 'twk-row'}>
      <div className="twk-lbl">
        <span>{label}</span>
        {value != null && <span className="twk-val">{value}</span>}
      </div>
      {children}
    </div>
  );
}

// ── Controls ────────────────────────────────────────────────────────────────

function TweakSlider({ label, value, min = 0, max = 100, step = 1, unit = '', onChange }) {
  return (
    <TweakRow label={label} value={`${value}${unit}`}>
      <input type="range" className="twk-slider" min={min} max={max} step={step}
             value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </TweakRow>
  );
}

function TweakToggle({ label, value, onChange }) {
  return (
    <div className="twk-row twk-row-h">
      <div className="twk-lbl"><span>{label}</span></div>
      <button type="button" className="twk-toggle" data-on={value ? '1' : '0'}
              role="switch" aria-checked={!!value}
              onClick={() => onChange(!value)}><i /></button>
    </div>
  );
}

function TweakRadio({ label, value, options, onChange }) {
  const trackRef = React.useRef(null);
  const [dragging, setDragging] = React.useState(false);
  // The active value is read by pointer-move handlers attached for the lifetime
  // of a drag — ref it so a stale closure doesn't fire onChange for every move.
  const valueRef = React.useRef(value);
  valueRef.current = value;

  // Segments wrap mid-word once per-segment width runs out. The track is
  // ~248px (280 panel − 28 body pad − 4 seg pad), each button loses 12px
  // to its own padding, and 11.5px system-ui averages ~6.3px/char — so 2
  // options fit ~16 chars each, 3 fit ~10. Past that (or >3 options), fall
  // back to a dropdown rather than wrap.
  const labelLen = (o) => String(typeof o === 'object' ? o.label : o).length;
  const maxLen = options.reduce((m, o) => Math.max(m, labelLen(o)), 0);
  const fitsAsSegments = maxLen <= ({ 2: 16, 3: 10 }[options.length] ?? 0);
  if (!fitsAsSegments) {
    // <select> emits strings — map back to the original option value so the
    // fallback stays type-preserving (numbers, booleans) like the segment path.
    const resolve = (s) => {
      const m = options.find((o) => String(typeof o === 'object' ? o.value : o) === s);
      return m === undefined ? s : typeof m === 'object' ? m.value : m;
    };
    return <TweakSelect label={label} value={value} options={options}
                        onChange={(s) => onChange(resolve(s))} />;
  }
  const opts = options.map((o) => (typeof o === 'object' ? o : { value: o, label: o }));
  const idx = Math.max(0, opts.findIndex((o) => o.value === value));
  const n = opts.length;

  const segAt = (clientX) => {
    const r = trackRef.current.getBoundingClientRect();
    const inner = r.width - 4;
    const i = Math.floor(((clientX - r.left - 2) / inner) * n);
    return opts[Math.max(0, Math.min(n - 1, i))].value;
  };

  const onPointerDown = (e) => {
    setDragging(true);
    const v0 = segAt(e.clientX);
    if (v0 !== valueRef.current) onChange(v0);
    const move = (ev) => {
      if (!trackRef.current) return;
      const v = segAt(ev.clientX);
      if (v !== valueRef.current) onChange(v);
    };
    const up = () => {
      setDragging(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <TweakRow label={label}>
      <div ref={trackRef} role="radiogroup" onPointerDown={onPointerDown}
           className={dragging ? 'twk-seg dragging' : 'twk-seg'}>
        <div className="twk-seg-thumb"
             style={{ left: `calc(2px + ${idx} * (100% - 4px) / ${n})`,
                      width: `calc((100% - 4px) / ${n})` }} />
        {opts.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={o.value === value}>
            {o.label}
          </button>
        ))}
      </div>
    </TweakRow>
  );
}

function TweakSelect({ label, value, options, onChange }) {
  return (
    <TweakRow label={label}>
      <select className="twk-field" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => {
          const v = typeof o === 'object' ? o.value : o;
          const l = typeof o === 'object' ? o.label : o;
          return <option key={v} value={v}>{l}</option>;
        })}
      </select>
    </TweakRow>
  );
}

function TweakText({ label, value, placeholder, onChange }) {
  return (
    <TweakRow label={label}>
      <input className="twk-field" type="text" value={value} placeholder={placeholder}
             onChange={(e) => onChange(e.target.value)} />
    </TweakRow>
  );
}

function TweakNumber({ label, value, min, max, step = 1, unit = '', onChange }) {
  const clamp = (n) => {
    if (min != null && n < min) return min;
    if (max != null && n > max) return max;
    return n;
  };
  const startRef = React.useRef({ x: 0, val: 0 });
  const onScrubStart = (e) => {
    e.preventDefault();
    startRef.current = { x: e.clientX, val: value };
    const decimals = (String(step).split('.')[1] || '').length;
    const move = (ev) => {
      const dx = ev.clientX - startRef.current.x;
      const raw = startRef.current.val + dx * step;
      const snapped = Math.round(raw / step) * step;
      onChange(clamp(Number(snapped.toFixed(decimals))));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div className="twk-num">
      <span className="twk-num-lbl" onPointerDown={onScrubStart}>{label}</span>
      <input type="number" value={value} min={min} max={max} step={step}
             onChange={(e) => onChange(clamp(Number(e.target.value)))} />
      {unit && <span className="twk-num-unit">{unit}</span>}
    </div>
  );
}

// Relative-luminance contrast pick — checkmarks drawn over a swatch need to
// read on both #111 and #fafafa without per-option configuration. Hex input
// only (#rgb / #rrggbb); named or rgb()/hsl() colors fall through to "light".
function __twkIsLight(hex) {
  const h = String(hex).replace('#', '');
  const x = h.length === 3 ? h.replace(/./g, (c) => c + c) : h.padEnd(6, '0');
  const n = parseInt(x.slice(0, 6), 16);
  if (Number.isNaN(n)) return true;
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return r * 299 + g * 587 + b * 114 > 148000;
}

const __TwkCheck = ({ light }) => (
  <svg viewBox="0 0 14 14" aria-hidden="true">
    <path d="M3 7.2 5.8 10 11 4.2" fill="none" strokeWidth="2.2"
          strokeLinecap="round" strokeLinejoin="round"
          stroke={light ? 'rgba(0,0,0,.78)' : '#fff'} />
  </svg>
);

// TweakColor — curated color/palette picker. Each option is either a single
// hex string or an array of 1-5 hex strings; the card adapts — a lone color
// renders solid, a palette renders colors[0] as the hero (left ~2/3) with the
// rest stacked in a sharp column on the right. onChange emits the
// option in the shape it was passed (string stays string, array stays array).
// Without options it falls back to the native color input for back-compat.
function TweakColor({ label, value, options, onChange }) {
  if (!options || !options.length) {
    return (
      <div className="twk-row twk-row-h">
        <div className="twk-lbl"><span>{label}</span></div>
        <input type="color" className="twk-swatch" value={value}
               onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }
  // Native <input type=color> emits lowercase hex per the HTML spec, so
  // compare case-insensitively. String() guards JSON.stringify(undefined),
  // which returns the primitive undefined (no .toLowerCase).
  const key = (o) => String(JSON.stringify(o)).toLowerCase();
  const cur = key(value);
  return (
    <TweakRow label={label}>
      <div className="twk-chips" role="radiogroup">
        {options.map((o, i) => {
          const colors = Array.isArray(o) ? o : [o];
          const [hero, ...rest] = colors;
          const sup = rest.slice(0, 4);
          const on = key(o) === cur;
          return (
            <button key={i} type="button" className="twk-chip" role="radio"
                    aria-checked={on} data-on={on ? '1' : '0'}
                    aria-label={colors.join(', ')} title={colors.join(' · ')}
                    style={{ background: hero }}
                    onClick={() => onChange(o)}>
              {sup.length > 0 && (
                <span>
                  {sup.map((c, j) => <i key={j} style={{ background: c }} />)}
                </span>
              )}
              {on && <__TwkCheck light={__twkIsLight(hero)} />}
            </button>
          );
        })}
      </div>
    </TweakRow>
  );
}

function TweakButton({ label, onClick, secondary = false }) {
  return (
    <button type="button" className={secondary ? 'twk-btn secondary' : 'twk-btn'}
            onClick={onClick}>{label}</button>
  );
}

Object.assign(window, {
  useTweaks, TweaksPanel, TweakSection, TweakRow,
  TweakSlider, TweakToggle, TweakRadio, TweakSelect,
  TweakText, TweakNumber, TweakColor, TweakButton,
});


// FLOW v3 — atoms

const V3_ICONS = {
  today:    "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z M9 22V12h6v10",
  inbox:    "M3 12h5l2 3h4l2-3h5M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z",
  board:    "M4 6h6v12H4zM14 6h6v8h-6zM14 16h6v2h-6z",
  leads:    "M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2 M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M17 3.13a4 4 0 0 1 0 7.75",
  search:   "M21 21l-4.3-4.3M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z",
  plus:     "M12 5v14M5 12h14",
  filter:   "M3 5h18l-7 8v6l-4-2v-4L3 5Z",
  sort:     "M3 6h13M3 12h9M3 18h5M17 4v16M14 17l3 3 3-3",
  chev_d:   "M6 9l6 6 6-6",
  chev_r:   "M9 6l6 6-6 6",
  chev_l:   "M15 6l-6 6 6 6",
  x:        "M18 6 6 18M6 6l12 12",
  more:     "M5 12h.01M12 12h.01M19 12h.01",
  mail:     "M3 7l9 6 9-6M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",
  reply:    "M9 17l-5-5 5-5M4 12h11a5 5 0 0 1 5 5v2",
  send:     "M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z",
  check:    "M20 6 9 17l-5-5",
  bell:     "M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9 M13.7 21a2 2 0 0 1-3.4 0",
  clock:    "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z M12 6v6l4 2",
  cal:      "M3 8h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z M8 2v4M16 2v4",
  spark:    "M9 2L7 7 2 9l5 2 2 5 2-5 5-2-5-2-2-5z",
  video:    "M23 7l-7 5 7 5V7zM3 5h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z",
  invoice:  "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 14h8M8 18h5",
  doc:      "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6M8 13h8M8 17h6",
  bolt:     "M13 2 3 14h7l-1 8 10-12h-7l1-8Z",
  fire:     "M12 22s-7-4-7-11a7 7 0 0 1 5-7c0 2 1 4 3 5 1-1 2-2 2-4a7 7 0 0 1 4 6c0 7-7 11-7 11Z",
  arrow_r:  "M5 12h14M13 6l6 6-6 6",
  diamond:  "M6 3h12l4 6-10 12L2 9z M2 9h20M9 3l3 6 3-6M9 21l3-12 3 12",
  table:    "M3 6h18v12H3zM3 12h18M9 6v12",
  compact:  "M3 6h18M3 10h18M3 14h18M3 18h18",
  network:  "M12 5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M5 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M19 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M7 17l3-7M14 10l3 7M9 5h6",
  trash:    "M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M5 6l1 14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-14",
  star:     "M12 2l3 7 7 .8-5.3 4.9 1.6 7L12 17.7 5.7 21.7l1.6-7L2 9.8 9 9z",
  archive:  "M21 8H3v13h18zM23 4H1v4h22zM10 12h4",
};

function V3Icon({ name, w = 14, className = "ic" }) {
  const d = V3_ICONS[name];
  if (!d) return <svg width={w} height={w} className={className}></svg>;
  return (
    <svg className={className} width={w} height={w} viewBox="0 0 24 24"
         fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

function V3AvatarLookupKeys(value) {
  const raw = String(value || '').toLowerCase().trim();
  if (!raw) return [];
  const emailLocal = raw.includes('@') ? raw.split('@')[0].trim() : '';
  const collapsed = raw.replace(/\s+/g, ' ');
  const stripped = collapsed
    .replace(/<[^>]*>/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[|·/,_-]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = stripped.split(' ').filter(Boolean);
  const compact = words.join('');
  const firstTwo = words.slice(0, 2).join(' ');
  const firstThree = words.slice(0, 3).join(' ');
  return [...new Set([collapsed, stripped, firstTwo, firstThree, compact, emailLocal].filter(Boolean))];
}

function V3Avatar({ name, color, size = '', className = '', style = {} }) {
  const cls = 'av' + (size ? ' av-' + size : '') + (className ? ' ' + className : '');
  const avatarMap = window.AVATARS || window.V3?.AVATARS || {};
  const lookupKeys = V3AvatarLookupKeys(name);
  const rawSrc = lookupKeys.map(k => avatarMap[k]).find(Boolean) || null;
  const src = rawSrc ? new URL(rawSrc, window.location.href).href : null;
  const initials = String(name || '').split(/\s+/).filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase() || '?';
  return (
    <div
      className={cls + (src ? ' has-photo' : '')}
      style={{ background: color || '#2f5fd6', ...style }}
      aria-label={name}
      title={name}
    >
      {src && <img className="av-photo" src={src} alt="" aria-hidden="true" />}
      {!src && initials}
    </div>
  );
}

function v3Money(n, { compact = false } = {}) {
  if (n == null) return '—';
  if (compact && n >= 1000) {
    if (n >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M';
    return '$' + (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k';
  }
  return '$' + n.toLocaleString();
}

function V3StageProg({ stageId, big = false }) {
  const { ACTIVE_STAGE_IDS } = window.V3;
  const idx = ACTIVE_STAGE_IDS.indexOf(stageId);
  const cls = big ? 'stage-prog-big' : 'stage-prog';
  return (
    <div className={cls}>
      {ACTIVE_STAGE_IDS.map((s, i) => {
        let mod = '';
        if (i < idx) mod = 'done';
        else if (i === idx) mod = 'current';
        return <div key={s} className={'sp-step ' + mod}></div>;
      })}
    </div>
  );
}

function V3Empty({ icon = 'check', title, sub }) {
  return (
    <div className="empty">
      <div className="empty-ic"><V3Icon name={icon} w={20} /></div>
      <div className="empty-title">{title}</div>
      {sub && <div className="empty-sub">{sub}</div>}
    </div>
  );
}

Object.assign(window, {
  V3Icon,
  V3Avatar,
  V3StageProg,
  V3Empty,
  v3Money,
  AVATARS: {
    robert: 'flow-v4/assets/avatars/robert.png',
    'robert scoble': 'flow-v4/assets/avatars/robert.png',
    robertscoble: 'flow-v4/assets/avatars/robert.png',
    'robert scobleizer': 'flow-v4/assets/avatars/robert.png',
    scobleizer: 'flow-v4/assets/avatars/robert.png',
    sam: 'flow-v4/assets/avatars/sam.png',
    sammy: 'flow-v4/assets/avatars/sam.png',
    'sam levin': 'flow-v4/assets/avatars/sam.png',
    samlevin: 'flow-v4/assets/avatars/sam.png',
    'sam levin / unalignedx': 'flow-v4/assets/avatars/sam.png',
    unalignedx: 'flow-v4/assets/avatars/sam.png',
    asher: 'flow-v4/assets/avatars/asher.jpeg',
    'asher weisberger': 'flow-v4/assets/avatars/asher.jpeg',
    asherweisberger: 'flow-v4/assets/avatars/asher.jpeg',
  },
});


// FLOW v4 — live Supabase/email helpers

const V3_SUPABASE_URL = "https://hbnpwphxjurvtydezwgh.supabase.co";
const V3_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhibnB3cGh4anVydnR5ZGV6d2doIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MTQ1MzIsImV4cCI6MjA5MDk5MDUzMn0.p5E48__GlGqjC17Z28q8fYFK-qV8CmiidYIP02vGe4s";
const V3_MIN_VISIBLE_TS = Date.parse('2026-01-01T00:00:00Z');

async function V3LoadXDmIntakeRows() {
  try {
    const res = await fetch('flow-v4/assets/x_dm_daily_intake.json?v=20260622-live-x-inbox-dates-1');
    if (!res.ok) throw new Error('X intake ' + res.status);
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    console.warn('Failed to load X DM intake', e);
    return [];
  }
}

async function V3LoadSupabaseLeads() {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const url = V3_SUPABASE_URL + "/rest/v1/cards?select=*&order=id.desc&offset=" + offset + "&limit=1000";
    const res = await fetch(url, {
      headers: {
        apikey: V3_SUPABASE_ANON_KEY,
        Authorization: "Bearer " + V3_SUPABASE_ANON_KEY,
      },
    });
    if (!res.ok) throw new Error("Supabase " + res.status + ": " + await res.text());
    const chunk = await res.json();
    if (!Array.isArray(chunk) || chunk.length === 0) break;
    rows.push(...chunk);
    if (chunk.length < 1000) break;
  }
  const internalEmails = new Set(['scobleizer@gmail.com', 'unalignedx@gmail.com', 'asherunaligned@gmail.com']);
  const canonical = new Map();

  const scoreRow = (row) => {
    const email = V3ExtractEmail(row.email);
    const updated = Date.parse(row.updated_at || row.moved_at || row.created_at || '') || 0;
    const created = Date.parse(row.created_at || row.moved_at || row.updated_at || '') || 0;
    let score = 0;
    if (email && !internalEmails.has(email)) score += 1000;
    if (row.contact_name) score += 100;
    if (row.title) score += 10;
    score += Math.max(updated, created) / 1e13;
    score += Number(row.id || 0) / 1e9;
    return score;
  };

  for (const row of rows) {
    const key = row.gmail_thread_id ? `thread:${row.gmail_thread_id}` : `row:${row.id}`;
    const prev = canonical.get(key);
    if (!prev || scoreRow(row) > scoreRow(prev)) canonical.set(key, row);
  }

  const xRows = await V3LoadXDmIntakeRows();
  const leads = V3FilterVisibleLeads([...canonical.values()].map(V3NormalizeSupabaseLead))
    .map(lead => {
      if (V3NewLeadSourceKind(lead) !== 'x') return lead;
      const intakeMatch = V3FindXdMIntakeMatch(lead, xRows);
      return intakeMatch ? V3MergeXdMIntakeIntoLead(lead, intakeMatch) : lead;
    });
  const dedupedLeads = V3CollapseDuplicateXLeads(leads);
  dedupedLeads.push(...V3FilterVisibleLeads(V3NormalizeXDmLeads(xRows, dedupedLeads)));
  if (!dedupedLeads.some(lead => String(lead.email || '').trim().toLowerCase() === 'jocelyn.cruz@hockeystick.io')) {
    dedupedLeads.push(V3HockeystickFallbackLead());
  }
  return V3FilterVisibleLeads(dedupedLeads);
}

function V3NormalizeEmailLeadStage(email, rawStage) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (normalizedEmail === 'jocelyn.cruz@hockeystick.io') {
    return ['done', 'paid-out'].includes(rawStage) ? rawStage : 'paid-out';
  }
  return rawStage;
}

function V3IsRobertBriefRow(row) {
  const briefType = String(row?.brief_type || row?.briefType || '').trim().toLowerCase();
  const leadSource = String(row?.lead_source || row?.leadSource || '').trim().toLowerCase();
  const listId = String(row?.list_id || row?.listId || '').trim().toLowerCase();
  return briefType === 'official-posting' || leadSource === 'official-posting' || listId === 'briefs';
}

function V3BriefList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(item => String(item));
  if (typeof value === 'object') return Object.values(value).filter(Boolean).map(item => String(item));
  return String(value).split(/\n|•|;|\|/).map(item => item.trim()).filter(Boolean);
}

function V3ParseBriefDescription(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return {};
  try {
    return JSON.parse(value);
  } catch (e) {
    return { body: value };
  }
}

function V3ParseOperatorMemory(value) {
  const payload = V3ParseBriefDescription(value);
  const memory = payload && typeof payload === 'object' ? payload.operator_memory : null;
  return memory && typeof memory === 'object' ? memory : null;
}

function V3NormalizeRobertBriefRow(row) {
  const brief = V3ParseBriefDescription(row.description);
  const toValue = row.brief_to || row.briefTo || row.to || [];
  const ccValue = row.brief_cc || row.briefCc || row.cc || [];
  const notesValue = row.brief_notes || row.briefNotes || row.notes || [];
  const linksValue = row.brief_links || row.briefLinks || row.links || [];
  return {
    id: String(row.id),
    title: brief.title || row.brief_title || row.briefTitle || row.title || 'Robert brief',
    subtitle: brief.subtitle || row.brief_subtitle || row.briefSubtitle || '',
    subject: brief.subject || row.brief_subject || row.briefSubject || row.title || '',
    gmailThreadId: brief.gmailThreadId || row.brief_thread_id || row.gmail_thread_id || row.gmailThreadId || '',
    sentAt: brief.sentAt || row.brief_sent_at || row.briefSentAt || row.date_received_iso || row.created_at || row.moved_at || '',
    from: brief.from || row.brief_from || row.briefFrom || row.from || '',
    to: V3BriefList(brief.to || toValue),
    cc: V3BriefList(brief.cc || ccValue),
    status: brief.status || row.brief_status || row.briefStatus || 'ready',
    partner: brief.partner || row.brief_partner || row.briefPartner || row.contact_name || row.title || '',
    company: brief.company || row.brief_company || row.briefCompany || row.business_name || row.title || '',
    summary: brief.summary || row.brief_summary || row.briefSummary || row.description || row.intent || '',
    body: brief.body || row.brief_body || row.briefBody || row.description || row.notes || '',
    action: brief.action || row.brief_action || row.briefAction || row.intent || '',
    notes: V3BriefList(brief.notes || notesValue),
    attachment: brief.attachment || row.brief_attachment || row.briefAttachment || null,
    links: Array.isArray(brief.links) ? brief.links : (Array.isArray(linksValue) ? linksValue : []),
  };
}

function V3HockeystickFallbackLead() {
  const email = 'jocelyn.cruz@hockeystick.io';
  const name = 'Jocelyn Cruz';
  const brand = 'Hockeystick';
  const stage = 'paid-out';
  const now = new Date().toISOString();
  return {
    id: 'manual-hockeystick-jocelyn-cruz',
    contactName: name,
    contactRole: 'Founder',
    brand,
    stage,
    value: null,
    deliverables: 'Paid partnership',
    ownerId: 'robert',
    category: 'paid',
    daysInStage: 0,
    activityDays: 0,
    timelineDays: null,
    lastTouch: '0m',
    lastTouchAt: now,
    needsReply: false,
    approve: null,
    color: __v3Color(name + brand),
    email,
    gmailThreadId: '',
    draftReply: null,
    draftReplyStatus: '',
    rowId: 'manual-hockeystick-jocelyn-cruz',
    source: 'Manual',
    nextMove: { who: null, text: 'Closed and paid', action: '' },
    timeline: __v3Timeline(stage, 0, name, brand),
    thread: [{
      from: name,
      when: '0m',
      date: now,
      subject: 'Hockeystick collaboration',
      body: 'Lead placeholder added so the Jocelyn Cruz thread shows in the paid/completed lane.',
      to: [email],
      cc: [],
      replyTo: [],
    }],
    progress: Math.max(0, V3_ACTIVE_STAGE_IDS.indexOf(stage)),
    unread: false,
  };
}

function V3NormalizeSupabaseLead(row) {
  const name = row.contact_name || row.title || row.email || 'Untitled lead';
  const brand = row.business_name || V3DomainBrand(row.email) || row.title || 'Unknown company';
  const received = V3NormalizeDateForUi(row.date_received_iso || row.created_at || row.moved_at);
  const thread = V3ThreadFromRow(row, name, brand, row.list_id);
  const latestThreadDate = V3LatestThreadDate(thread);
  const lastTouchAt = V3NormalizeDateForUi(latestThreadDate || row.moved_at || received);
  const activityDays = V3DaysSince(lastTouchAt || row.moved_at || received);
  const rawStage = V3NormalizeStage(row.list_id);
  const closedStage = V3NormalizeEmailLeadStage(row.email, rawStage);
  const stage = closedStage;
  const daysInStage = V3DaysSince(row.moved_at || received);
  const followUpDue = V3LeadFollowUpDue(row, thread, stage, activityDays);
  const needsReply = Boolean(row.new_reply_at) || row.draft_reply_status === 'pending' || stage === 'new' || followUpDue;
  const ownerId = V3NormalizeOwner(row.assignee || row.created_by);
  const value = V3ParseMoney(row.estimated_value);
  const category = V3CategoryFromRow(row);
  const timelineDays = V3TimelineDaysFromRow(row);
  const briefPayload = V3ParseBriefDescription(row.description);
  const operatorMemory = V3ParseOperatorMemory(row.description);
  const isRobertBrief = V3IsRobertBriefRow(row) || briefPayload.kind === 'official-posting' || briefPayload.type === 'official-posting';
  const leadSource = row.lead_source || (row.gmail_thread_id ? 'Gmail' : 'Manual');
  const xWebsite = String(row.website || row.url || '').trim();
  const xOpenDm = /https?:\/\/(?:www\.)?(?:x|twitter)\.com\/messages\//i.test(xWebsite) ? xWebsite : '';
  const xHandleMatch = xWebsite.match(/https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{2,30})\/?$/i);
  const xHandle = xHandleMatch ? ('@' + xHandleMatch[1]) : '';
  return {
    id: String(row.id),
    contactName: name,
    contactRole: row.job_title || row.lead_source || '',
    brand,
    stage,
    value,
    deliverables: row.intent || row.lead_source || '',
    ownerId,
    category,
    daysInStage,
    activityDays,
    followUpDue,
    timelineDays,
    lastTouch: V3RelativeTime(lastTouchAt || row.moved_at || received),
    lastTouchAt: lastTouchAt || row.moved_at || received || null,
    receivedAt: received || null,
    needsReply,
    approve: row.draft_reply ? ownerId : null,
    color: __v3Color(name + brand),
    email: row.email || '',
    gmailThreadId: row.gmail_thread_id || '',
    draftReply: V3ParseDraftReply(row.draft_reply),
    draftReplyStatus: row.draft_reply_status || '',
    operatorMemory,
    operatorSummary: operatorMemory?.summary || null,
    operatorAnalysis: operatorMemory?.analysis || null,
    operatorEscalation: Array.isArray(operatorMemory?.escalation) ? operatorMemory.escalation : [],
    operatorUpdatedAt: operatorMemory?.updated_at || null,
    rowId: row.id,
    source: leadSource,
    rawDescription: row.description || '',
    notes: briefPayload.rich_description || briefPayload.notes || row.notes || '',
    evidence: briefPayload.evidence || '',
    suggestedStage: briefPayload.suggested_stage || row.suggested_stage || '',
    isRobertBrief,
    briefTitle: briefPayload.title || row.brief_title || row.briefTitle || '',
    briefSubtitle: briefPayload.subtitle || row.brief_subtitle || row.briefSubtitle || '',
    briefSubject: briefPayload.subject || row.brief_subject || row.briefSubject || '',
    briefSentAt: briefPayload.sentAt || row.brief_sent_at || row.briefSentAt || '',
    briefFrom: briefPayload.from || row.brief_from || row.briefFrom || '',
    briefTo: briefPayload.to || row.brief_to || row.briefTo || [],
    briefCc: briefPayload.cc || row.brief_cc || row.briefCc || [],
    briefPartner: briefPayload.partner || row.brief_partner || row.briefPartner || '',
    briefCompany: briefPayload.company || row.brief_company || row.briefCompany || '',
    briefSummary: briefPayload.summary || row.brief_summary || row.briefSummary || '',
    briefBody: briefPayload.body || row.brief_body || row.briefBody || '',
    briefAction: briefPayload.action || row.brief_action || row.briefAction || '',
    briefNotes: briefPayload.notes || row.brief_notes || row.briefNotes || [],
    briefAttachment: briefPayload.attachment || row.brief_attachment || row.briefAttachment || null,
    briefLinks: briefPayload.links || row.brief_links || row.briefLinks || [],
    briefStatus: briefPayload.status || row.brief_status || row.briefStatus || '',
    nextMove: V3NextMoveFromRow(stage, name, ownerId, needsReply, row),
    timeline: __v3Timeline(stage, daysInStage, name, brand),
    thread,
    progress: Math.max(0, V3_ACTIVE_STAGE_IDS.indexOf(stage)),
    unread: Boolean(row.new_reply_at),
    xHandle,
    xOpenDm,
    xContactInfo: String(row.contact_info || row.contactInfo || ''),
  };
}

function V3ParseDraftReply(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch (e) {
    return { subject: '', body: value };
  }
}

function V3IsTeamParticipant(value) {
  const text = String(value || '').toLowerCase();
  return [
    'scobleizer@gmail.com',
    'asherunaligned@gmail.com',
    'unalignedx@gmail.com',
    'samlevin@mac.com',
    'sam levin',
    'robert scoble',
    'asher weisberger',
    'unaligned',
  ].some(marker => text.includes(marker));
}

function V3LeadFollowUpDue(row, thread, stage, activityDays) {
  if (!row || !Array.isArray(thread) || !thread.length) return false;
  if (['trash', 'dead-leads', 'paid-out'].includes(stage)) return false;
  if (row.new_reply_at) return false;
  if ((row.draft_reply_status || '').toLowerCase() === 'pending') return false;
  const latest = thread[thread.length - 1];
  if (!latest || !V3IsTeamParticipant(latest.from)) return false;
  return Number(activityDays || 0) >= 2;
}

function V3NormalizeStage(stage) {
  const s = String(stage || 'new').toLowerCase();
  if (V3_ACTIVE_STAGE_IDS.includes(s)) return s;
  if (V3_TRASH_STAGE_IDS.includes(s)) return s;
  const map = { discovery: 'new', build: 'engaged', posted: 'done', paid: 'paid-out', 'anything-else': 'dead-leads', dead: 'dead-leads' };
  return map[s] || 'new';
}

function V3NormalizeOwner(owner) {
  const s = String(owner || '').toLowerCase();
  if (s.includes('robert')) return 'robert';
  if (s.includes('sam')) return 'sammy';
  return 'asher';
}

function V3ParseMoney(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(n)) return null;
  // Deal sizes never exceed five figures; bigger numbers are bad AI extractions
  return (n > 100000 || n < 0) ? null : n;
}

function V3DomainBrand(email) {
  const m = String(email || '').match(/@([^@.]+)\./);
  return m ? m[1].replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '';
}

function V3DaysSince(value) {
  const t = value ? Date.parse(value) : NaN;
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

function V3RelativeTime(value) {
  const t = value ? Date.parse(value) : NaN;
  if (!Number.isFinite(t)) return '';
  const mins = Math.max(0, Math.floor((Date.now() - t) / 60000));
  if (mins < 60) return String(mins || 1) + 'm';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return String(hrs) + 'h';
  return String(Math.floor(hrs / 24)) + 'd';
}

function V3NormalizeDateForUi(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw + 'T12:00:00';
  return raw;
}

function V3DateIsVisible(value) {
  const t = V3TimestampForUi(value);
  return !t || t >= V3_MIN_VISIBLE_TS;
}

function V3LeadDatedValues(lead) {
  return [
    lead?.receivedAt,
    lead?.lastTouchAt,
    lead?.briefSentAt,
    ...(Array.isArray(lead?.thread) ? lead.thread.map(msg => msg?.date || msg?.dateIso || msg?.timestamp || msg?.when) : []),
  ]
    .map(V3TimestampForUi)
    .filter(t => Number.isFinite(t) && t > 0);
}

function V3PruneLeadForVisibleRange(lead) {
  if (!lead) return null;
  const dated = V3LeadDatedValues(lead);
  if (dated.length && Math.max(...dated) < V3_MIN_VISIBLE_TS) return null;

  const next = { ...lead };
  if (Array.isArray(lead.thread)) {
    next.thread = lead.thread.filter(msg => V3DateIsVisible(msg?.date || msg?.dateIso || msg?.timestamp || msg?.when));
  }

  const threadDates = (next.thread || [])
    .map(msg => V3NormalizeDateForUi(msg?.date || msg?.dateIso || msg?.timestamp || msg?.when))
    .filter(Boolean);
  if (threadDates.length) {
    const sorted = threadDates.slice().sort((a, b) => V3TimestampForUi(a) - V3TimestampForUi(b));
    if (!V3DateIsVisible(next.receivedAt)) next.receivedAt = sorted[0];
    next.lastTouchAt = sorted[sorted.length - 1];
  } else {
    if (!V3DateIsVisible(next.receivedAt)) next.receivedAt = null;
    if (!V3DateIsVisible(next.lastTouchAt)) next.lastTouchAt = next.receivedAt || null;
  }

  if (!V3DateIsVisible(next.briefSentAt)) next.briefSentAt = '';
  next.lastTouch = next.lastTouchAt ? V3RelativeTime(next.lastTouchAt) : '';
  if (next.lastTouchAt) next.activityDays = V3DaysSince(next.lastTouchAt);
  return next;
}

function V3FilterVisibleLeads(leads) {
  return (Array.isArray(leads) ? leads : [])
    .map(V3PruneLeadForVisibleRange)
    .filter(Boolean);
}

function V3FilterVisibleBriefs(briefs) {
  return (Array.isArray(briefs) ? briefs : []).filter(brief => V3DateIsVisible(brief?.sentAt));
}

function V3LeadIdentityKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/@/g, '')
    .replace(/\.(com|ai|io|co|org|net|app|xyz|tech|ly|fm|vc|us|me|cc)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function V3NormalizeXDmLeads(rows, existingLeads = []) {
  const list = Array.isArray(rows) ? rows : [];
  const existingEmails = new Set(existingLeads.map(lead => String(lead?.email || '').trim().toLowerCase()).filter(Boolean));
  const existingDomains = new Set(
    existingLeads
      .map(lead => String(lead?.email || '').trim().toLowerCase())
      .filter(email => /@/.test(email))
      .map(email => email.split('@')[1])
  );
  const existingIdentityKeys = new Set(
    existingLeads.flatMap(lead => [
      lead?.contactName,
      lead?.brand,
      lead?.email ? String(lead.email).split('@')[0] : '',
      lead?.email ? String(lead.email).split('@')[1] : '',
      lead?.xHandle,
    ].map(V3LeadIdentityKey)).filter(Boolean)
  );
  return list
    .filter(row => row && row.newLead !== false)
    .filter(row => !row.alreadyEmailedInRobertGmail)
    .filter(row => {
      const emails = String(row.contactEmails || '')
        .split(/[,\s|]+/)
        .map(item => item.trim().toLowerCase())
        .filter(item => /@/.test(item));
      if (emails.some(email => existingEmails.has(email))) return false;
      if (emails.some(email => existingDomains.has(email.split('@')[1]))) return false;
      const keys = [
        row.xName,
        row.xUsername,
        ...emails.map(email => email.split('@')[0]),
        ...emails.map(email => email.split('@')[1]),
      ].map(V3LeadIdentityKey).filter(Boolean);
      if (keys.some(key => existingIdentityKeys.has(key))) return false;
      return true;
    })
    .map(V3NormalizeXDmLeadRow);
}

function V3NormalizeXDmLeadRow(row) {
  const name = String(row.xName || 'Unknown X lead').trim();
  const emails = String(row.contactEmails || '')
    .split(/[,\s|]+/)
    .map(item => item.trim().toLowerCase())
    .filter(item => /@/.test(item));
  const email = emails[0] || '';
  const brand = String(row.xName || '').replace(/^@/, '').trim() || V3DomainBrand(email) || 'X lead';
  const received = V3NormalizeDateForUi(row.newestDmDate || '');
  const summary = String(row.summaryForTeam || row.lastLeadMessage || '').trim();
  const latestLeadMessage = String(row.lastLeadMessage || '').trim();
  const dmLink = String(row.openDm || '').trim();
  const handle = String(row.xUsername || '').trim();
  const nextStep = String(row.bestNextStep || '').trim();
  const currentStatus = String(row.currentStatus || '').trim();
  const quickNote = String(row.quickNote || '').trim();
  const owner = String(row.recommendedOwner || '').toLowerCase();
  const ownerId = owner.includes('robert') ? 'robert' : (owner.includes('sam') ? 'sammy' : 'asher');
  const type = String(row.leadType || '').toLowerCase();
  const category = type.includes('interview') || type.includes('media') || type.includes('event')
    ? 'interview'
    : (type.includes('intro') || type.includes('network')
      ? 'intro'
      : (type.includes('paid') || type.includes('sponsor')
        ? 'partnership'
        : 'collaboration'));
  return {
    id: 'xdm-' + String(row.rank || brand || name).replace(/[^a-z0-9_-]+/gi, '-').toLowerCase(),
    contactName: name,
    contactRole: 'X DM lead',
    brand,
    stage: 'new',
    value: null,
    deliverables: String(row.leadType || 'X DM lead'),
    ownerId,
    category,
    daysInStage: V3DaysSince(received),
    activityDays: V3DaysSince(received),
    timelineDays: null,
    lastTouch: V3RelativeTime(received),
    lastTouchAt: received || null,
    receivedAt: received || null,
    needsReply: true,
    approve: null,
    color: __v3Color(name + brand),
    email,
    gmailThreadId: '',
    draftReply: null,
    draftReplyStatus: '',
    rowId: dmLink || ('xdm:' + name),
    source: 'x-dm-intake',
    rawDescription: summary,
    notes: summary,
    evidence: latestLeadMessage,
    suggestedStage: '',
    isRobertBrief: false,
    briefTitle: '',
    briefSubtitle: '',
    briefSubject: '',
    briefSentAt: '',
    briefFrom: '',
    briefTo: [],
    briefCc: [],
    briefPartner: '',
    briefCompany: '',
    briefSummary: '',
    briefBody: '',
    briefAction: '',
    briefNotes: [],
    briefAttachment: null,
    briefLinks: [],
    briefStatus: '',
    nextMove: { who: ownerId, text: nextStep || 'Open X thread and move to email.', action: 'Reply' },
    timeline: __v3Timeline('new', 0, name, brand),
    thread: [{
      from: handle || name,
      when: V3RelativeTime(received),
      date: received || null,
      subject: String(row.leadType || 'X DM lead'),
      body: latestLeadMessage || summary,
      to: [],
      cc: [],
      replyTo: [],
    }],
    progress: Math.max(0, V3_ACTIVE_STAGE_IDS.indexOf('new')),
    unread: true,
    xHandle: handle,
    xOpenDm: dmLink,
    xLeadScore: Number(row.leadScore || 0),
    xContactInfo: String(row.contactInfo || ''),
    xBestNextStep: nextStep,
    xMessageCount: Number(row.messageCount || 0),
    xCurrentStatus: currentStatus,
    xEmailDraft: String(row.emailDraft || ''),
    xQuickNote: quickNote,
  };
}

function V3FindXdMIntakeMatch(lead, rows) {
  if (!lead || !Array.isArray(rows) || !rows.length) return null;
  const leadDm = String(lead.xOpenDm || '').trim();
  const leadNameKey = V3LeadIdentityKey(lead.contactName || lead.brand || '');
  return rows.find(row => {
    const rowDm = String(row?.openDm || '').trim();
    if (leadDm && rowDm && leadDm === rowDm) return true;
    const rowNameKey = V3LeadIdentityKey(row?.xName || row?.contactName || '');
    return Boolean(leadNameKey && rowNameKey && leadNameKey === rowNameKey);
  }) || null;
}

function V3MergeXdMIntakeIntoLead(lead, row) {
  if (!lead || !row) return lead;
  const intakeLead = V3NormalizeXDmLeadRow(row);
  const mergedThread = Array.isArray(lead.thread) && lead.thread.length && String(lead.thread[0]?.body || '').trim()
    ? lead.thread
    : intakeLead.thread;
  const mergedNotes = String(lead.notes || '').trim() || intakeLead.notes;
  const mergedEvidence = String(lead.evidence || '').trim() || intakeLead.evidence;
  const mergedNextMoveText = String(lead.nextMove?.text || '').trim() || intakeLead.nextMove?.text || 'Open X thread and move to email.';
  const mergedXHandle = String(lead.xHandle || '').trim() || intakeLead.xHandle;
  const mergedContactInfo = String(lead.xContactInfo || '').trim() || intakeLead.xContactInfo;
  const mergedReceivedAt = lead.receivedAt || intakeLead.receivedAt || null;
  const mergedLastTouchAt = lead.lastTouchAt || intakeLead.lastTouchAt || mergedReceivedAt;
  return {
    ...lead,
    contactRole: lead.contactRole || intakeLead.contactRole,
    deliverables: lead.deliverables || intakeLead.deliverables,
    category: lead.category || intakeLead.category,
    notes: mergedNotes,
    evidence: mergedEvidence,
    rawDescription: String(lead.rawDescription || '').trim() || intakeLead.rawDescription,
    thread: mergedThread,
    lastTouchAt: mergedLastTouchAt,
    receivedAt: mergedReceivedAt,
    lastTouch: lead.lastTouch || intakeLead.lastTouch,
    nextMove: {
      who: lead.nextMove?.who || intakeLead.nextMove?.who || 'asher',
      text: mergedNextMoveText,
      action: lead.nextMove?.action || intakeLead.nextMove?.action || 'Reply',
    },
    xHandle: mergedXHandle,
    xOpenDm: String(lead.xOpenDm || '').trim() || intakeLead.xOpenDm,
    xContactInfo: mergedContactInfo,
    xLeadScore: Number(lead.xLeadScore || intakeLead.xLeadScore || 0),
    xBestNextStep: String(lead.xBestNextStep || '').trim() || intakeLead.xBestNextStep,
    xMessageCount: Number(lead.xMessageCount || intakeLead.xMessageCount || 0),
    xCurrentStatus: String(lead.xCurrentStatus || '').trim() || intakeLead.xCurrentStatus,
    xEmailDraft: String(lead.xEmailDraft || '').trim() || intakeLead.xEmailDraft,
    xQuickNote: String(lead.xQuickNote || '').trim() || intakeLead.xQuickNote,
  };
}

function V3CollapseDuplicateXLeads(leads) {
  const passthrough = [];
  const xLeads = new Map();
  for (const lead of Array.isArray(leads) ? leads : []) {
    if (V3NewLeadSourceKind(lead) !== 'x') {
      passthrough.push(lead);
      continue;
    }
    const key = String(lead.xOpenDm || '').trim() || `x:${V3LeadIdentityKey(lead.contactName || lead.brand || lead.id)}`;
    const prev = xLeads.get(key);
    if (!prev) {
      xLeads.set(key, lead);
      continue;
    }
    const prevScore = (Date.parse(prev.lastTouchAt || prev.receivedAt || '') || 0) + Number(prev.rowId || prev.id || 0);
    const nextScore = (Date.parse(lead.lastTouchAt || lead.receivedAt || '') || 0) + Number(lead.rowId || lead.id || 0);
    if (nextScore >= prevScore) xLeads.set(key, lead);
  }
  return [...passthrough, ...xLeads.values()].filter(Boolean);
}

function V3TimestampForUi(value) {
  const normalized = V3NormalizeDateForUi(value);
  const t = normalized ? Date.parse(normalized) : NaN;
  return Number.isFinite(t) ? t : 0;
}

function V3LeadActivityTimestamp(lead) {
  if (!lead) return 0;
  return Math.max(
    V3TimestampForUi(lead.lastTouchAt),
    V3TimestampForUi(lead.receivedAt),
    ...(Array.isArray(lead.thread) ? lead.thread.map(msg => V3TimestampForUi(msg.date || msg.dateIso || msg.timestamp || msg.when)) : [0])
  );
}

function V3LeadReceivedTimestamp(lead) {
  if (!lead) return 0;
  return Math.max(
    V3TimestampForUi(lead.receivedAt),
    Array.isArray(lead.thread) && lead.thread.length ? V3TimestampForUi(lead.thread[0].date || lead.thread[0].dateIso || lead.thread[0].timestamp || lead.thread[0].when) : 0
  );
}

function V3SortLeadsByActivity(a, b) {
  return V3LeadActivityTimestamp(b) - V3LeadActivityTimestamp(a);
}

function V3LatestThreadDate(thread) {
  if (!Array.isArray(thread) || !thread.length) return null;
  let newest = 0;
  let newestValue = null;
  for (const msg of thread) {
    const value = msg.date || msg.dateIso || msg.timestamp || msg.when;
    const t = V3TimestampForUi(value);
    if (t >= newest) {
      newest = t;
      newestValue = V3NormalizeDateForUi(value);
    }
  }
  return newestValue;
}

function V3TimelineDaysFromRow(row) {
  const pieces = [row.title, row.intent, row.description, row.lead_source];
  const thread = Array.isArray(row.email_thread) ? row.email_thread : (Array.isArray(row.original_email) ? row.original_email : []);
  for (const m of thread.slice(-6)) pieces.push(m.subject, m.body, m.text, m.snippet);
  const text = pieces.filter(Boolean).join(' ').toLowerCase();
  if (!text) return null;
  if (new RegExp('\\b(asap|urgent|immediately|today|eod|end of day)\\b').test(text)) return 0;
  if (new RegExp('\\b(tomorrow|next day)\\b').test(text)) return 1;
  if (new RegExp('\\b(this week|by friday|by monday|next week)\\b').test(text)) return 7;
  const inMatch = text.match(new RegExp('\\b(?:in|within)\\s+(\\d{1,2})\\s*(day|days|week|weeks)\\b'));
  if (inMatch) return Number(inMatch[1]) * (inMatch[2].startsWith('week') ? 7 : 1);
  const byMatch = text.match(new RegExp('\\bby\\s+(\\d{1,2})\\/(\\d{1,2})(?:\\/(\\d{2,4}))?\\b'));
  if (byMatch) {
    const now = new Date();
    const year = byMatch[3] ? Number(byMatch[3].length === 2 ? '20' + byMatch[3] : byMatch[3]) : now.getFullYear();
    const due = new Date(year, Number(byMatch[1]) - 1, Number(byMatch[2]));
    if (Number.isFinite(due.getTime())) return Math.max(0, Math.ceil((due - now) / 86400000));
  }
  return null;
}
function V3CategoryFromRow(row) {
  const text = String((row.lead_source || '') + ' ' + (row.intent || '') + ' ' + (row.description || '')).toLowerCase();
  if (text.includes('intro')) return 'intro';
  if (text.includes('interview') || text.includes('podcast')) return 'interview';
  if (text.includes('partner') || text.includes('sponsor')) return 'partnership';
  if (['done','paid-out'].includes(V3NormalizeStage(row.list_id))) return 'paid';
  return 'collaboration';
}

function V3NextMoveFromRow(stage, name, owner, needsReply, row) {
  const first = String(name).split(' ')[0] || 'Lead';
  if (row.new_reply_at) return { who: owner, text: 'Reply to ' + first + ' - new message in thread', action: 'Reply' };
  if (row.draft_reply) return { who: owner, text: 'Review drafted reply for ' + first, action: 'Review' };
  if (V3LeadFollowUpDue(row, Array.isArray(row.email_thread) ? row.email_thread : (Array.isArray(row.original_email) ? row.original_email : []), stage, V3DaysSince(V3LatestThreadDate(Array.isArray(row.email_thread) ? row.email_thread : (Array.isArray(row.original_email) ? row.original_email : [])) || row.moved_at || row.date_received_iso || row.created_at))) {
    return {
      who: owner || (stage === 'negotiating' || stage === 'invoice-sent' ? 'asher' : 'sammy'),
      text: 'Follow up with ' + first + ' - no movement in 2d',
      action: 'Nudge',
    };
  }
  return __v3NextMove(stage, name, owner, needsReply);
}

function V3ThreadFromRow(row, name, brand, stage) {
  const thread = Array.isArray(row.email_thread) ? row.email_thread : (Array.isArray(row.original_email) ? row.original_email : null);
  if (thread && thread.length) {
    return thread.map((m, i) => ({
      from: m.from || m.sender || (i % 2 ? name : 'UNALIGNED'),
      when: V3RelativeTime(V3NormalizeDateForUi(m.date || m.date_iso || m.timestamp || row.created_at)),
      date: V3NormalizeDateForUi(m.date || m.date_iso || m.timestamp || row.created_at),
      dateIso: V3NormalizeDateForUi(m.date_iso),
      subject: m.subject || row.title || (brand + ' conversation'),
      body: m.body || m.text || m.snippet || '',
      to: V3EmailsFromValue(m.to || m.to_list || m.recipients?.to),
      cc: V3EmailsFromValue(m.cc || m.cc_list || m.recipients?.cc),
      replyTo: V3EmailsFromValue(m.reply_to || m.replyTo),
    })).sort((a, b) => V3TimestampForUi(a.date || a.dateIso || a.when) - V3TimestampForUi(b.date || b.dateIso || b.when));
  }
  return [{
    from: name,
    when: V3RelativeTime(row.created_at),
    date: row.created_at || null,
    subject: row.title || (brand + ' lead'),
    body: row.description || row.intent || '',
    to: V3EmailsFromValue(row.email ? [row.email] : []),
    cc: [],
    replyTo: [],
  }];
}

function V3SenderForUser(user) {
  if (user === 'robert') return 'robert';
  if (user === 'sammy') return 'sam';
  return 'asher';
}

function V3SenderName(sender) {
  if (sender === 'robert') return 'Robert Scoble';
  if (sender === 'sam') return 'Sam Levin';
  return 'Asher';
}

function V3SenderSignature(sender) {
  if (sender === 'robert') {
    return [
      'Robert Scoble',
      'Founder, Unaligned (media company about how AI is bringing us new things)',
      'Mobile: +1-425-205-1921',
      'X: https://x.com/scobleizer',
      'Web: https://unaligned.io',
      'This message copyright the sender. All rights reserved.',
    ].join('\n');
  }
  if (sender === 'sam') {
    return [
      'Sam Levin',
      'Partnerships, UNALIGNED',
      'unalignedx@gmail.com',
    ].join('\n');
  }
  return [
    'Asher Weisberger',
    'Client Services Manager',
    'Unaligned',
    'asherunaligned@gmail.com',
    'unaligned.io | x.com/unalignedx',
  ].join('\n');
}

function V3EnsureSenderSignature(body, sender) {
  const text = String(body || '').trim();
  const signature = V3SenderSignature(sender);
  if (!signature) return text;
  const normText = V3NormalizeThreadText(text);
  const normSig = V3NormalizeThreadText(signature);
  if (!text) return signature;
  if (normText.includes(normSig)) return text;
  return text + '\n\n' + signature;
}

function V3FallbackDraftBody(lead, sender) {
  const first = String(lead?.contactName || 'there').split(' ')[0] || 'there';
  const brand = String(lead?.brand || 'your company');
  const last = Array.isArray(lead?.thread) ? lead.thread[lead.thread.length - 1] : null;
  const lastSnippet = String(last?.body || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const stage = String(lead?.stage || '');
  if (sender === 'robert') {
    return [
      `Hi ${first},`,
      '',
      `Thanks for reaching out about ${brand}.`,
      lastSnippet ? `I saw the latest note in the thread and want to keep the conversation moving cleanly.` : `I want to keep the conversation moving cleanly and make sure we answer the latest notes.`,
      '',
      'Best,',
    ].join('\n');
  }
  if (sender === 'sam') {
    const opener = stage === 'rates-sent' || stage === 'negotiating' || stage === 'invoice-sent'
      ? 'I saw the latest note and I’m keeping this moving on the partnership side.'
      : 'I’m jumping in to keep the thread moving on the partnership side.';
    return [
      `Hi ${first},`,
      '',
      opener,
      lastSnippet ? `We’re tracking the latest detail from the thread and will reply accordingly.` : `We’ll keep the thread aligned with the latest details before sending anything else.`,
      '',
      'Best,',
    ].join('\n');
  }
  return [
    `Hi ${first},`,
    '',
    'I’m jumping in to keep the chain organized and make sure we reply to the latest information in the thread.',
    lastSnippet ? `I’ve got the newest note in view and will respond from there.` : `I’ve got the newest note in view and will respond from there.`,
    '',
    'Best,',
  ].join('\n');
}

function V3ComposeReplyDraft(lead, sender) {
  const draft = lead?.draftReply && typeof lead.draftReply === 'object' ? lead.draftReply : null;
  const subject = draft?.subject || V3SubjectForLead(lead);
  const sourceBody = draft?.body ? String(draft.body) : V3FallbackDraftBody(lead, sender);
  return {
    subject,
    body: V3EnsureSenderSignature(sourceBody, sender),
  };
}

function V3SubjectForLead(lead) {
  const last = lead?.thread?.[lead.thread.length - 1] || {};
  const base = lead?.draftReply?.subject || last.subject || ((lead?.brand || 'Lead') + ' conversation');
  return /^re:/i.test(base) ? base : 'Re: ' + base;
}

function V3DefaultCc(sender) {
  return V3InternalEmails(sender)
    .join(',');
}

function V3InternalEmails(excludeSender) {
  return ['scobleizer@gmail.com', 'UnalignedX@gmail.com', 'asherunaligned@gmail.com']
    .filter(email => {
      const normalized = email.toLowerCase();
      if (excludeSender === 'robert') return normalized !== 'scobleizer@gmail.com';
      if (excludeSender === 'sam') return normalized !== 'unalignedx@gmail.com';
      if (excludeSender === 'asher') return normalized !== 'asherunaligned@gmail.com';
      return true;
    });
}

function V3SenderEmails(sender) {
  if (sender === 'robert') return ['scobleizer@gmail.com'];
  if (sender === 'sam') return ['unalignedx@gmail.com'];
  return ['asherunaligned@gmail.com'];
}

function V3ProfileTeam(user) {
  return user === 'robert' ? ['robert'] : ['asher', 'sammy'];
}

function V3ProfileLane(user) {
  return user === 'robert' ? 'robert' : 'shared';
}

function V3LeadLane(lead) {
  if (!lead) return 'shared';
  if (lead.ownerId === 'robert') return 'robert';
  if (['done', 'paid-out'].includes(lead.stage)) return 'robert';
  return 'shared';
}

function V3LeadVisibleToProfile(lead, user) {
  if (lead?.isRobertBrief) return false;
  return V3LeadLane(lead) === V3ProfileLane(user);
}

function V3LeadIsMineForProfile(lead, user, ownerId = lead.ownerId) {
  return V3ProfileTeam(user).includes(ownerId || '');
}

function V3MoveIsMineForProfile(lead, user) {
  return V3ProfileTeam(user).includes(lead?.nextMove?.who || '');
}

function V3IsSelfRecipient(sender, to) {
  const recipients = String(to || '').toLowerCase();
  return V3SenderEmails(sender).some(email => recipients.includes(email));
}

function V3SplitEmails(value) {
  return String(value || '')
    .split(/[,\s;]+/)
    .map(email => email.trim())
    .filter(Boolean);
}

function V3EmailsFromValue(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return V3UniqueEmails(value.flatMap(item => V3EmailsFromValue(item)));
  }
  if (typeof value === 'object') {
    return V3EmailsFromValue(value.email || value.emails || value.to || value.cc || value.reply_to || value.replyTo || '');
  }
  return V3UniqueEmails(V3SplitEmails(String(value)).map(item => V3ExtractEmail(item)).filter(Boolean));
}

function V3ExtractEmail(value) {
  const match = String(value || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].toLowerCase() : '';
}

function V3LeadReplyToEmail(lead, sender) {
  const senderEmails = new Set(V3SenderEmails(sender).map(email => email.toLowerCase()));
  const internalEmails = new Set(['scobleizer@gmail.com', 'unalignedx@gmail.com', 'asherunaligned@gmail.com']);
  const candidates = [];

  const pushCandidate = (value) => {
    for (const email of V3EmailsFromValue(value)) {
      candidates.push(email);
    }
  };

  pushCandidate(lead?.replyTo);
  pushCandidate(lead?.email);
  if (Array.isArray(lead?.thread)) {
    for (let i = lead.thread.length - 1; i >= 0; i--) {
      pushCandidate(lead.thread[i]?.from);
      pushCandidate(lead.thread[i]?.to);
      pushCandidate(lead.thread[i]?.cc);
      pushCandidate(lead.thread[i]?.replyTo);
      pushCandidate(lead.thread[i]?.reply_to);
    }
  }

  for (const email of candidates) {
    if (senderEmails.has(email)) continue;
    if (internalEmails.has(email) && !String(lead?.email || '').toLowerCase().includes(email)) continue;
    return email;
  }
  return '';
}

function V3UniqueEmails(values) {
  const seen = new Set();
  return values.filter(email => {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function V3ReplyRecipients(lead, sender, internalOnly = false) {
  if (internalOnly) return { to: V3InternalEmails(sender), cc: [] };
  const senderEmails = V3SenderEmails(sender).map(email => email.toLowerCase());
  const leadEmail = V3LeadReplyToEmail(lead, sender) || String(lead?.email || '').trim();
  const leadIsSender = senderEmails.includes(leadEmail.toLowerCase());
  const participants = V3UniqueEmails([...V3ThreadParticipants(lead), ...V3InternalEmails(sender)]);
  const to = leadEmail && !leadIsSender ? [leadEmail] : [];
  const cc = participants.filter(email =>
    email &&
    email.toLowerCase() !== leadEmail.toLowerCase() &&
    !senderEmails.includes(email.toLowerCase())
  );
  return { to: V3UniqueEmails(to), cc: V3UniqueEmails(cc) };
}

function V3NormalizeThreadText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function V3ThreadMessageKey(msg) {
  return [
    V3ExtractEmail(msg?.from) || V3NormalizeThreadText(msg?.from),
    V3NormalizeThreadText(msg?.subject),
    V3NormalizeThreadText(msg?.body),
  ].join('|');
}

function V3PendingReplyKey(pending) {
  return [
    String(pending?.leadId || ''),
    String(pending?.sender || ''),
    V3NormalizeThreadText(pending?.subject),
    V3NormalizeThreadText(pending?.body),
  ].join('|');
}

function V3ThreadParticipants(lead) {
  const emails = [];
  const push = (value) => {
    emails.push(...V3EmailsFromValue(value));
  };
  push(lead?.email);
  push(lead?.replyTo);
  push(lead?.reply_to);
  if (Array.isArray(lead?.thread)) {
    for (const msg of lead.thread) {
      push(msg?.from);
      push(msg?.to);
      push(msg?.cc);
      push(msg?.replyTo);
      push(msg?.reply_to);
    }
  }
  return V3UniqueEmails(emails);
}

function V3LeadMatchesQuery(lead, query) {
  const q = V3NormalizeThreadText(query);
  if (!q) return true;
  const hay = V3NormalizeThreadText([
    lead?.contactName,
    lead?.brand,
    lead?.contactRole,
    lead?.email,
    lead?.stage,
    lead?.deliverables,
    lead?.ownerId,
    lead?.nextMove?.text,
    lead?.nextMove?.action,
    lead?.source,
    lead?.notes,
    lead?.evidence,
    ...(Array.isArray(lead?.thread) ? lead.thread.flatMap(msg => [
      msg?.from,
      msg?.subject,
      msg?.body,
      msg?.to,
      msg?.cc,
    ]) : []),
  ].flat().join(' '));
  if (hay.includes(q)) return true;
  return q.split(' ').filter(Boolean).every(token => hay.includes(token));
}

function V3IsNewLeadReview(lead) {
  if (!lead || lead.isRobertBrief) return false;
  const sourceKind = V3NewLeadSourceKind(lead);
  const mailbox = V3LeadMailboxOrigin(lead);
  if (mailbox === 'asher') return false;
  if (sourceKind === 'x' || mailbox === 'robert') return !V3CompanyOsQualifiedLead(lead);
  return false;
}

function V3NewLeadSourceKind(lead) {
  const source = String(lead?.source || '').toLowerCase();
  if (source.includes('x-dm-intake') || source.includes('twitter_dm') || source.includes('ingest-twitter_dm')) return 'x';
  return 'gmail';
}

function V3LeadMailboxOrigin(lead) {
  const source = String(lead?.source || '').toLowerCase();
  if (source.includes('x-dm-intake') || source.includes('twitter_dm') || source.includes('ingest-twitter_dm')) return 'x';
  if (
    source.includes('robert-gmail-new-lead') ||
    source.includes('gmail-robert') ||
    source.includes('robert gmail')
  ) return 'robert';
  if (
    source.includes('asher-gmail') ||
    source.includes('gmail-asher') ||
    source.includes('asher candidate') ||
    source.includes('asher gmail')
  ) return 'asher';

  const participants = V3ThreadParticipants(lead).map(email => String(email || '').toLowerCase());
  if (participants.includes('asherunaligned@gmail.com')) return 'asher';
  if (participants.includes('scobleizer@gmail.com')) return 'robert';
  return 'unknown';
}

function V3LeadHasInternalReply(lead) {
  const internal = new Set(['asherunaligned@gmail.com', 'scobleizer@gmail.com', 'unalignedx@gmail.com']);
  return Array.isArray(lead?.thread) && lead.thread.some(msg => {
    const from = String(msg?.from || '').toLowerCase();
    const emails = [...from.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g)].map(match => match[0]);
    return emails.some(email => internal.has(email));
  });
}

function V3CompanyOsQualifiedLead(lead) {
  if (!lead || lead.isRobertBrief) return false;
  const stage = String(lead.stage || '').toLowerCase();
  if (['rates-sent', 'negotiating', 'invoice-sent', 'done', 'paid-out'].includes(stage)) return true;

  const sourceKind = V3NewLeadSourceKind(lead);
  const mailbox = V3LeadMailboxOrigin(lead);
  const context = [
    lead?.brand,
    lead?.deliverables,
    lead?.notes,
    lead?.evidence,
    lead?.nextMove?.text,
    ...(Array.isArray(lead?.thread) ? lead.thread.flatMap(msg => [msg?.subject, msg?.body]) : []),
  ].filter(Boolean).join(' ').toLowerCase();
  const hasCommercialSignal = /\b(rate|pricing|quote|budget|paid|payment|invoice|deliverable|campaign|sponsor|sponsorship|partnership|repost|post|thread|brief|launch)\b/.test(context);
  const introLike = /\b(intro|introduction|connect|connection|network|meeting|coffee|founder chat|catch up)\b/.test(context);
  const hasInternalReply = V3LeadHasInternalReply(lead);

  if (mailbox === 'asher') {
    return ['first-touch', 'engaged'].includes(stage) || lead.unread || lead.followUpDue || Number(lead.value || 0) > 0;
  }

  if (sourceKind === 'x' || mailbox === 'robert') {
    if (!['first-touch', 'engaged'].includes(stage)) return false;
    if (!hasInternalReply) return false;
    if (introLike && !hasCommercialSignal) return false;
    return hasCommercialSignal || Number(lead.value || 0) > 0;
  }

  return false;
}

function V3NewLeadSourceLabel(lead) {
  return V3NewLeadSourceKind(lead) === 'x' ? 'X' : 'Gmail';
}

function V3NewLeadHandle(lead) {
  if (lead?.xHandle) return String(lead.xHandle).trim();
  const text = [
    lead?.contactName,
    lead?.brand,
    lead?.source,
    lead?.deliverables,
    lead?.notes,
    lead?.evidence,
    lead?.title,
    ...(Array.isArray(lead?.thread) ? lead.thread.flatMap(msg => [msg?.from, msg?.subject, msg?.body]) : []),
  ].filter(Boolean).join(' ');
  const lowered = String(text).toLowerCase();
  const urlMatches = [...lowered.matchAll(/(?:x|twitter)\.com\/([a-z0-9_]{2,30})\b/g)]
    .map(match => match[1])
    .filter(handle => !['scobleizer', 'unalignedx'].includes(handle));
  if (urlMatches.length) return '@' + urlMatches[0];
  const mentions = [...String(text).matchAll(/(^|[\s(>])@([A-Za-z0-9_]{2,30})\b/g)]
    .map(match => match[2])
    .filter(handle => !['Robert', 'Scobleizer', 'UnalignedX', 'Asher'].includes(handle));
  return mentions.length ? ('@' + mentions[0]) : '';
}

function V3NewLeadSummary(lead) {
  const latest = Array.isArray(lead?.thread) && lead.thread.length ? lead.thread[lead.thread.length - 1] : null;
  const source = V3NewLeadSourceKind(lead);
  const raw = source === 'x'
    ? (lead?.notes || lead?.xQuickNote || lead?.evidence || latest?.body || lead?.nextMove?.text || lead?.deliverables || '')
    : (lead?.notes || latest?.body || lead?.evidence || lead?.nextMove?.text || lead?.deliverables || '');
  let text = String(raw || '');
  // The stored body often contains the whole thread (the lead's latest message
  // followed by an earlier quoted reply). Truncate at the first quote marker so
  // only the lead's message shows. Done before whitespace is collapsed so the
  // newline-anchored markers still match.
  const quoteMarkers = [
    /\n\s*\[recovered quoted[^\]]*\]/i,          // pipeline artifact wrapping the quoted reply
    /\n\s*on\b.{0,160}?\bwrote:/is,              // "On <date> <name> wrote:"
    /\n\s*-{2,}\s*original message\s*-{2,}/i,    // "----- Original Message -----"
    /\n\s*from:\s.{0,80}@/i,                     // quoted "From: name <email>" header block
    /\n\s*(?:发件人|寄件者)\s*[：:]/,             // Chinese "From:" quoted header block
    /<blockquote/i,                              // HTML quoted reply
    /<div[^>]*class="[^"]*gmail_quote/i,         // Gmail HTML quote container
    /\n\s*[^\n]{0,80}<[^>\n]+@[^>\n]+>[^\n]{0,80}(?:写道|寫道|wrote)\s*[：:]/i, // "Name <email> … wrote:/写道:" (any locale)
    /\n\s*>/,                                    // leading ">" quote lines
  ];
  for (const marker of quoteMarkers) {
    const at = text.search(marker);
    if (at > 0) text = text.slice(0, at);
  }
  text = text
    .replace(/Robert['’]s latest position:\s*/gi, 'Robert: ')
    .replace(/Latest lead message:\s*/gi, '')
    // strip HTML tags (whitelisted names so emails in <angle brackets> survive)
    .replace(/<\/?(?:div|p|br|span|a|b|i|u|strong|em|blockquote|ul|ol|li|table|tr|td|th|h[1-6]|img|font|hr|pre|code)\b[^>]*\/?>/gi, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&#3[49];|&quot;|&apos;/gi, "'")
    .replace(/\[[^\]]*\]/g, ' ')                 // drop any remaining bracketed artifacts
    .replace(/\s+/g, ' ')
    .trim();
  // Lead with the substance: strip an opening greeting and a closing sign-off
  // so the card shows what the lead actually wants, not "Hi Asher, ... Warm regards".
  text = text.replace(/^(hi|hello|hey|dear|greetings|good (?:morning|afternoon|evening))\b[^,.!?]*[,!]?\s+/i, '');
  text = text.replace(/[\s,]*\b(warm(?:est)? regards|best regards|kind regards|warm wishes|best wishes|kind wishes|all the best|talk soon|many thanks|thanks so much|regards|cheers|sincerely(?: yours)?)\b[\s\S]{0,40}$/i, '');
  // also strip a bare comma sign-off followed by a name ("Best, Kevin Picchi",
  // "Thanks, Joe"). The capital after the comma keeps prose like
  // "the best, most reliable option" from being treated as a sign-off.
  text = text.replace(/\s*\b([Bb]est|[Tt]hanks|[Tt]hank you|[Cc]heers|[Ss]incerely|[Rr]egards|[Tt]alk soon|[Tt]ake care)\s*,\s+[A-Z][^,]{0,45}$/, '');
  return text.trim();
}

function V3NewLeadPrimaryIdentity(lead) {
  if (!lead) return 'Unknown contact';
  if (V3NewLeadSourceKind(lead) === 'x') return lead.contactName || V3NewLeadHandle(lead) || 'Unknown account';
  return lead.contactName || lead.email || 'Unknown contact';
}

function V3NewLeadReason(lead) {
  if (V3NewLeadSourceKind(lead) === 'x') {
    const status = String(lead?.xCurrentStatus || lead?.xBestNextStep || '').toLowerCase();
    if (status.includes('needs live check')) return 'Needs live check';
    if (status.includes('already routed')) return 'Already routed';
    if (status.includes('robert was last')) return 'Waiting on them';
    if (status.includes('route scheduling')) return 'Route to email';
    if (status.includes('invoice')) return 'Payment follow-up';
    if (status.includes('lead waiting')) return 'Needs reply';
    if (status.includes('soft future-business handoff')) return 'Future handoff';
    return 'X lead';
  }
  const source = String(lead?.source || '').toLowerCase();
  const text = [
    lead?.notes,
    lead?.evidence,
    lead?.deliverables,
    lead?.nextMove?.text,
    ...(Array.isArray(lead?.thread) ? lead.thread.slice(-3).flatMap(msg => [msg?.subject, msg?.body]) : []),
  ].filter(Boolean).join(' ').toLowerCase();
  if (lead?.ownerId === 'robert' || source.includes('robert')) return 'Robert inbox lead';
  if (text.match(/\b(rate|pricing|budget|paid|sponsor|quote repost|qrt|invoice)\b/)) return 'Commercial signal';
  if (text.match(/\b(interview|podcast|call|meeting|demo)\b/)) return 'Collaboration ask';
  if (V3NewLeadSourceKind(lead) === 'x') return 'X lead';
  if (source.includes('asher')) return 'Asher inbox lead';
  if (source.includes('gmail')) return 'Gmail lead';
  return 'Needs review';
}

function V3PendingReplyMatchesLead(pending, lead) {
  if (!pending || !lead) return false;
  const senderEmail = V3SenderEmails(pending.sender || '').map(email => email.toLowerCase());
  const pendingSubject = V3NormalizeThreadText(pending.subject);
  const pendingBody = V3NormalizeThreadText(pending.body);
  const thread = Array.isArray(lead.thread) ? lead.thread : [];
  return thread.some(msg => {
    const msgEmail = V3ExtractEmail(msg.from);
    const msgSubject = V3NormalizeThreadText(msg.subject);
    const msgBody = V3NormalizeThreadText(msg.body);
    const senderMatch =
      senderEmail.includes(msgEmail) ||
      V3NormalizeThreadText(msg.from).includes(V3NormalizeThreadText(V3SenderName(pending.sender || '')));
    const subjectMatch = !pendingSubject || msgSubject === pendingSubject || msgSubject.includes(pendingSubject) || pendingSubject.includes(msgSubject);
    const bodyMatch = !pendingBody || msgBody === pendingBody || msgBody.includes(pendingBody) || pendingBody.includes(msgBody);
    return senderMatch && subjectMatch && bodyMatch;
  });
}

function V3PrunePendingReplies(pendingReplies, leads) {
  const list = Array.isArray(pendingReplies) ? pendingReplies : [];
  const currentLeads = Array.isArray(leads) ? leads : [];
  return list.filter(pending => {
    const lead = currentLeads.find(l => String(l.id) === String(pending.leadId));
    return lead ? !V3PendingReplyMatchesLead(pending, lead) : true;
  });
}

function V3MergePendingReplies(leads, pendingReplies) {
  const list = Array.isArray(leads) ? leads : [];
  const pendings = Array.isArray(pendingReplies) ? pendingReplies : [];
  if (!pendings.length) return list;
  const byLead = new Map();
  for (const pending of pendings) {
    const key = String(pending.leadId || '');
    if (!key) continue;
    if (!byLead.has(key)) byLead.set(key, []);
    byLead.get(key).push(pending);
  }
  return list.map(lead => {
    const items = byLead.get(String(lead.id)) || [];
    if (!items.length) return lead;
    const existingKeys = new Set((Array.isArray(lead.thread) ? lead.thread : []).map(V3ThreadMessageKey));
    const thread = Array.isArray(lead.thread) ? lead.thread.slice() : [];
    let changed = false;
    for (const pending of items) {
      const pendingMsg = {
        from: V3SenderName(pending.sender || ''),
        when: 'just now',
        date: pending.createdAt || new Date().toISOString(),
        subject: pending.subject || '',
        body: pending.body || '',
        to: Array.isArray(pending.to) ? pending.to : V3EmailsFromValue(pending.to),
        cc: Array.isArray(pending.cc) ? pending.cc : V3EmailsFromValue(pending.cc),
        pending: true,
      };
      const key = V3ThreadMessageKey(pendingMsg);
      if (existingKeys.has(key)) continue;
      thread.push(pendingMsg);
      existingKeys.add(key);
      changed = true;
    }
    if (!changed) return lead;
    const newest = thread.reduce((latest, msg) => {
      const t = Date.parse(msg.date || msg.when || '') || 0;
      return t > latest ? t : latest;
    }, 0);
    return {
      ...lead,
      thread,
      lastTouchAt: newest ? new Date(newest).toISOString() : lead.lastTouchAt,
      lastTouch: newest ? 'just now' : lead.lastTouch,
      unread: lead.unread,
    };
  });
}

async function V3SendLeadEmail({ lead, sender, to, cc, subject, body, attachPdf = false }) {
  const resp = await fetch('https://us-central1-unaligned-fc556.cloudfunctions.net/sendEmail', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to,
      subject,
      body,
      from: sender,
      threadId: lead?.gmailThreadId || null,
      cc: cc ?? V3DefaultCc(sender),
      attachPdf,
    }),
  });
  const data = await resp.json();
  if (!resp.ok || data.error) throw new Error(data.error || 'Send failed');
  return data;
}

Object.assign(window, { V3SenderForUser, V3SenderName, V3SenderSignature, V3EnsureSenderSignature, V3ComposeReplyDraft, V3SubjectForLead, V3DefaultCc, V3InternalEmails, V3SenderEmails, V3IsSelfRecipient, V3SplitEmails, V3EmailsFromValue, V3ExtractEmail, V3LeadReplyToEmail, V3ThreadParticipants, V3LeadMatchesQuery, V3UniqueEmails, V3ReplyRecipients, V3ThreadMessageKey, V3PendingReplyKey, V3PendingReplyMatchesLead, V3PrunePendingReplies, V3MergePendingReplies, V3SendLeadEmail, V3LeadActivityTimestamp, V3LeadReceivedTimestamp, V3SortLeadsByActivity, V3NewLeadReason });


// FLOW v3 — data with category labels matching UNALIGNED's INTERVIEW / COLLABORATION / PARTNERSHIP / INTRO tabs

// ─── UNALIGNED Tiers (from SINGLE TIER pricing sheet) ────────
let V3_TIERS = {
  1: { id: 1, price: 1195, name: 'Retweet',           short: 'RT',         items: ['1 retweet'] },
  2: { id: 2, price: 1895, name: 'Quote Repost',      short: 'QUOTE',      items: ['1 quote repost', "Robert's original quote (≤3 sentences)"] },
  3: { id: 3, price: 1995, name: 'Custom X Post',     short: 'CUSTOM X',   items: ['1 custom-written X post'] },
  4: { id: 4, price: 2495, name: 'Narrative Thread',  short: 'THREAD',     items: ['1 thread (1 + 2 attached)'] },
  5: { id: 5, price: 2995, name: 'Content Core',      short: 'CORE',       items: ['1 custom X post', '1 LinkedIn post', 'Newsletter feature'] },
  6: { id: 6, price: 3995, name: 'Growth Bundle',     short: 'GROWTH',     items: ['1 custom X post', '1 LinkedIn post', '1 retweet', 'Newsletter feature'] },
  7: { id: 7, price: 5995, name: 'Maximum Impact',    short: 'MAX',        items: ['2 custom X posts', '1 LinkedIn post', '2 retweets', 'Newsletter feature', 'Strategy sync'] },
};

const V3_DELIV_TYPES = {
  'retweet':    { label: 'Retweet',           icon: 'arrow_r', short: 'RT'        },
  'quote':      { label: 'Quote Repost',      icon: 'reply',   short: 'QUOTE'     },
  'custom-x':   { label: 'Custom X Post',     icon: 'send',    short: 'X POST'    },
  'thread':     { label: 'Narrative Thread',  icon: 'doc',     short: 'THREAD'    },
  'linkedin':   { label: 'LinkedIn Post',     icon: 'network', short: 'LINKEDIN'  },
  'newsletter': { label: 'Newsletter',        icon: 'mail',    short: 'NEWSLETTER'},
};

let V3_USERS = {
  asher:  { id: 'asher',  name: 'Asher',  role: 'Services', color: '#2f5fd6', initials: 'AW' },
  sammy:  { id: 'sammy',  name: 'Sammy',  role: 'Manager',  color: '#16894a', initials: 'SM' },
  robert: { id: 'robert', name: 'Robert', role: 'Creator',  color: '#a93268', initials: 'RW' },
};

// Stages — keep stable ids for automation, but use language that matches
// the real lead-to-close workflow in Company OS.
const V3_STAGES = [
  { id: 'new',         name: 'New lead',      color: 'var(--st-new)',     short: 'NEW LEAD' },
  { id: 'first-touch', name: 'Scoped',        color: 'var(--st-touch)',   short: 'SCOPED' },
  { id: 'engaged',     name: 'Qualified',     color: 'var(--st-engaged)', short: 'QUALIFIED' },
  { id: 'rates-sent',  name: 'Rates sent',   color: 'var(--st-rates)',   short: 'RATES SENT' },
  { id: 'negotiating', name: 'Negotiating',  color: 'var(--st-nego)',    short: 'NEGOTIATING' },
  { id: 'invoice-sent',name: 'Payment / terms', color: 'var(--st-invoice)', short: 'PAYMENT / TERMS' },
  { id: 'trash',       name: 'Trash',        color: 'var(--text-4)',     short: 'TRASH' },
  { id: 'done',        name: 'Brief / calendar', color: 'var(--st-booked)',  short: 'BRIEF / CALENDAR' },
  { id: 'paid-out',    name: 'Closed',       color: 'var(--st-paid)',    short: 'CLOSED' },
];
const V3_STAGE_BY_ID = Object.fromEntries(V3_STAGES.map(s => [s.id, s]));
const V3_ACTIVE_STAGE_IDS = ['new','first-touch','engaged','rates-sent','negotiating','invoice-sent','done','paid-out'];
const V3_BOARD_STAGE_IDS = ['new','first-touch','engaged','rates-sent','negotiating','invoice-sent','trash','done','paid-out'];
const V3_TRASH_STAGE_IDS = ['trash'];

const V3_CATEGORIES = ['interview', 'collaboration', 'partnership', 'intro', 'paid'];

// 30+ leads with stage + category + needs-reply status
// [contact, role, brand, stage, value, owner, category, daysIn, lastTouch, needsReply, approve, deliverables, emailDeadline?, emailDeadlineNote?]
// emailDeadline: days from today the lead has explicitly asked for a reply / decision in the email thread.
//                Negative = past their stated deadline. These bubble to a "Priority" bucket at the top.
const V3_RAW = [
  // NEW
  ['Tomás Quintero',     'Founder',          'Ember Kitchen',          'new',         null, 'sammy', 'intro',       0,  '2h',  true,  null,  '—'],
  ['Bella Marquez',      'PR Lead',          'Halo Optics',            'new',         null, 'sammy', 'interview',   0,  '4h',  true,  null,  '—'],
  ['Wren Costa',         'Brand mgr',        'Linden Wellness',        'new',         null, 'sammy', 'collaboration', 1,'18h', true,  null,  '—'],
  ['Ines Tavares',       'Founder',          'Cardinal Tools',         'new',         null, 'sammy', 'intro',       2,  '1d',  false, null,  '—'],
  // FIRST TOUCH
  ['Devon Ortiz',        'Founder',          'Northcurrent Outfit',    'first-touch', 1895, 'sammy', 'collaboration', 2,'1d',  true,  null,  'Tier 2 · Quote Repost'],
  ['Rosa Pellegrini',    'Founder',          'Mira Home',              'first-touch', 1995, 'sammy', 'collaboration', 1,'20h', true,  null,  'Tier 3 · Custom X Post'],
  ['Naomi Friedman',     'Underwriting',     'Tideglass Insurance',    'first-touch', 2495, 'sammy', 'partnership', 3,  '2d',  false, null,  'Tier 4 · Narrative Thread'],
  ['Owen Castellanos',   'Head of Brokerage','Veridian Realty',        'first-touch', null, 'sammy', 'intro',       2,  '2d',  false, null,  '—'],
  ['Mia Kuznetsova',     'CMO',              'Pinpoint Watches',       'first-touch', 2995, 'asher', 'partnership', 4,  '3d',  false, null,  'Tier 5 · Content Core'],
  // ENGAGED
  ['Jordan Hale',        'Marketing Dir',    'Pace Hydration',         'engaged',     2995, 'sammy', 'collaboration', 1,'5h',  true,  null,  'Tier 5 · Content Core'],
  ['Henry Voss',         'Founder',          'Beacon Travel',          'engaged',     1995, 'sammy', 'collaboration', 2,'8h',  true,  null,  'Tier 3 · Custom X Post'],
  ['Aria Lindqvist',     'Founder',          'Solstice Energy',        'engaged',     3995, 'sammy', 'partnership', 1,  '12h', true,  null,  'Tier 6 · Growth Bundle', 3, 'Wants to lock by Friday — launch tied to Earth Day'],
  ['Theo Nakamura',      'Buyer',            'Kindred Foods',          'engaged',     1895, 'sammy', 'collaboration', 4,'2d',  false, 'sam', 'Tier 2 · Quote Repost'],
  ['Caleb Sundgren',     'Influencer mgr',   'Forge Athletics',        'engaged',     2495, 'sammy', 'collaboration', 3,'1d',  false, null,  'Tier 4 · Narrative Thread'],
  // RATES SENT
  ['Priya Naidu',        'Influencer mgr',   'Glow Foundry',           'rates-sent',  3995, 'asher', 'collaboration', 4,'3d',  false, 'asher','Tier 6 · Growth Bundle'],
  ['Adrienne Park',      'CMO',              'Vault Fitness',          'rates-sent',  5995, 'asher', 'partnership', 6,  '4d',  false, null,  'Tier 7 · Maximum Impact'],
  ['Clara Sundgren',     'Owner',            'Halo Optics',            'rates-sent',  1995, 'asher', 'collaboration', 8,'6d',  false, null,  'Tier 3 · Custom X Post'],
  ['Marcus Wei',         'Brand strategy',   'Trailmark Coffee',       'rates-sent',  2995, 'asher', 'partnership', 5,  '4d',  false, null,  'Tier 5 · Content Core'],
  ['Felix Achebe',       'CMO',              'Northwind Bio',          'rates-sent',  5995, 'asher', 'partnership', 7,  '5d',  false, null,  'Tier 7 · Maximum Impact'],
  // NEGOTIATING
  ['Maria Castellanos',  'Brand mgr',        'Salt + Cedar',           'negotiating', 2995, 'asher', 'collaboration', 3,'2h',  true,  null,  'Tier 5 · Content Core', 1, 'Needs revised quote by end of day tomorrow'],
  ['Eli Brennan',        'Marketing lead',   'Cardinal Tools',         'negotiating', 3995, 'asher', 'partnership', 2,  '4h',  true,  'asher','Tier 6 · Growth Bundle'],
  ['Vera Hossini',       'Founder',          'Vesper Studio',          'negotiating', 2495, 'asher', 'collaboration', 4,'1d',  false, null,  'Tier 4 · Narrative Thread'],
  // INVOICE SENT
  ['Wes Tanaka',         'Athlete liaison',  'Forge Athletics',        'invoice-sent', 5995,'sammy','partnership',  3,  '2d',  false, null,  'Tier 7 · Maximum Impact'],
  ['Lia Berenstein',     'Brand partners',   'Trailmark Coffee',       'invoice-sent', 3995,'sammy','collaboration',1,  '1d',  false, null,  'Tier 6 · Growth Bundle'],
  // BOOKED / DONE (Robert needs to post)
  ['Sam Whitaker',       'Founder',          'Trailmark Coffee',       'done',        2995, 'robert','collaboration', 2,'6h',  false, null,  'Tier 5 · Content Core'],
  ['Nina Akande',        'Founder',          'Halo Optics',            'done',        3995, 'robert','collaboration', 5,'2d',  false, null,  'Tier 6 · Growth Bundle', 2, 'Campaign aligned with their product launch — needs to go live this week'],
  // PAID OUT
  ['Keith Newman',       'Marketing dir',    'FSO Venture',            'paid-out',    2995, null,    'paid',        15, '2w',  false, null,  'Tier 5 · Content Core'],
  ['Ryan Teknium',       'Founder',          'Nous Research',          'paid-out',    5995, null,    'paid',        18, '3w',  false, null,  'Tier 7 · Maximum Impact'],
];

const V3_LEADS = V3_RAW.map((row, i) => {
  const [contact, role, brand, stage, value, owner, category, daysIn, lastTouch, needsReply, approve, deliverables, emailDeadline, emailDeadlineNote] = row;
  return {
    id: 'F-' + String(2401 + i).padStart(4, '0'),
    contactName: contact,
    contactRole: role,
    brand,
    stage,
    value,
    deliverables,
    ownerId: owner,
    category,
    daysInStage: daysIn,
    lastTouch,
    needsReply,
    approve,
    emailDeadline: emailDeadline ?? null,
    emailDeadlineNote: emailDeadlineNote ?? null,
    color: __v3Color(contact),
    email: contact.toLowerCase().replace(/[^a-z]/g, '.').replace(/\.+/g, '.').replace(/^\.|\.$/g, '') + '@' + brand.toLowerCase().replace(/[^a-z]/g, '') + '.com',
    source: ['Gmail','Outbound','Inbound','Agency','Referral','LinkedIn','Form'][i % 7],
    nextMove: __v3NextMove(stage, contact, owner, needsReply),
    timeline: __v3Timeline(stage, daysIn, contact, brand),
    thread: __v3Thread(contact, brand, stage),
    progress: V3_ACTIVE_STAGE_IDS.indexOf(stage),
    unread: needsReply && i % 3 !== 0,
  };
});

function __v3Color(seed) {
  const palette = ['#2f5fd6','#d56a35','#c43d2b','#16894a','#6b46c1','#b48117','#a93268','#0e8aab'];
  let h = 0; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 9999;
  return palette[h % palette.length];
}

function __v3NextMove(stage, contact, owner, needsReply) {
  const first = contact.split(' ')[0];
  const map = {
    'new':          { who: 'sammy',  text: `Qualify the lead and send first response to ${first}`, action: 'Reply' },
    'first-touch':  { who: needsReply ? 'sammy' : null, text: needsReply ? `Tighten scope with ${first}` : `Waiting on ${first} to confirm scope`, action: needsReply ? 'Reply' : '' },
    'engaged':      { who: needsReply ? 'sammy' : null, text: needsReply ? `Get timing, deliverable, and budget from ${first}` : `Awaiting ${first}'s scope details`, action: 'Reply' },
    'rates-sent':   { who: null,     text: `Pricing is out — waiting on ${first}`,                action: 'Nudge' },
    'negotiating':  { who: needsReply ? 'asher' : null, text: needsReply ? `Send revised terms to ${first}` : `Awaiting ${first}'s answer on price / terms`, action: 'Send' },
    'invoice-sent': { who: null,     text: `Verify payment, contract, or invoice status`,         action: '' },
    'done':         { who: 'robert', text: `Brief is ready — lock calendar and execute`,          action: 'Post' },
    'paid-out':     { who: null,     text: `Closed — paid and archived`,                          action: '' },
  };
  return map[stage] || { who: null, text: '—', action: '' };
}

function __v3Timeline(stage, days, contact, brand) {
  const ids = V3_ACTIVE_STAGE_IDS;
  const idx = ids.indexOf(stage);
  return ids.map((s, i) => {
    const def = V3_STAGE_BY_ID[s];
    const status = i < idx ? 'done' : i === idx ? 'current' : 'pending';
    return {
      stageId: s, name: def.name, status,
      when: i < idx ? `${(idx - i) + days}d ago` : i === idx ? `${days}d in stage` : '',
      note: i <= idx ? __v3StageNote(s, contact, brand) : '',
    };
  });
}

function __v3StageNote(stage, contact, brand) {
  const first = contact.split(' ')[0];
  return ({
    'new':          `${first} from ${brand} came in`,
    'first-touch':  `Scope being clarified`,
    'engaged':      `${first} replied — budget and timing in play`,
    'rates-sent':   `Pricing package delivered`,
    'negotiating':  `Working through terms and usage`,
    'invoice-sent': `Payment path or contract is in motion`,
    'done':         `Brief approved and queued for execution`,
    'paid-out':     `Payment received and thread closed`,
  })[stage] || '';
}

function __v3Thread(contact, brand, stage) {
  const first = contact.split(' ')[0];
  const out = [{
    from: 'Sammy', when: '6d ago',
    subject: `Robert × ${brand} — collab opportunity`,
    body: `Hi ${first},\n\nRobert's been a fan of ${brand} and we'd love to put a collaboration together. Rundown of his recent numbers + past partnerships below — let me know if it resonates and we can scope something out.\n\nBest,\nSammy`,
  }];
  if (!['new','first-touch'].includes(stage)) {
    out.push({
      from: first, when: '4d ago',
      subject: `RE: Robert × ${brand}`,
      body: `Hi Sammy,\n\nThanks for reaching out — Robert is exactly the voice we've been after. Planning a campaign for next month with budget for two creators. Can you share his rate card and standard deliverable mix?\n\nBest,\n${first}`,
    });
  }
  if (['rates-sent','negotiating','invoice-sent','done','paid-out'].includes(stage)) {
    out.push({
      from: 'Asher', when: '3d ago',
      subject: `RE: Robert × ${brand}`,
      body: `Hi ${first},\n\nGreat to hear. Where Robert lands for this scope:\n\n• 1× Reel (90s, 30d usage): $3,200\n• Story set add-on: $600\n• TikTok cross-post: $400\n\nHappy to bundle. Posting windows next month: Tue/Thu after 4pm PT.\n\nThanks,\nAsher`,
    });
  }
  if (['negotiating','invoice-sent','done','paid-out'].includes(stage)) {
    out.push({
      from: first, when: '2d ago',
      subject: `RE: Robert × ${brand}`,
      body: `Hi Asher,\n\nWorks. Can we bump usage to 60 days, and add first refusal for a Q1 follow-up Reel? Otherwise looks good.\n\n${first}`,
    });
  }
  return out;
}

// ─── Briefs — attached to closed (done) and shipped (invoice-sent) deals ───
// Each brief is structured around the UNALIGNED tier deliverables. Asher
// reviews/approves; Robert executes. Status flow:
//   draft → awaiting-approval → ready → in-production → shipped
const V3_BRIEFS = {
  // Sam Whitaker · Trailmark Coffee · Tier 5 Content Core · $2,995
  // READY — Asher already approved. Robert needs to post.
  'F-2425': {
    tier: 5,
    status: 'ready',
    approvedBy: 'asher',
    approvedAt: '4h ago',
    deadlineDays: 2,
    postingWindow: 'Tue or Thu, 4–7pm PT',
    summary: "Trailmark is small-batch single-origin coffee. They want the angle of 'coffee as a thinking ritual' — not a discount push. Sam loved the morning-rhythm story.",
    notes: "Keep it human. No discount codes. Don't compare to specific competitors.",
    mustInclude: ['Tag @trailmarkcoffee', 'Mention "single-origin"', 'Link trailmarkcoffee.com'],
    mustAvoid: ['Discount codes', 'Naming competitors', 'Generic "best coffee" language'],
    deliverables: [
      {
        id: 'd1',
        type: 'custom-x',
        status: 'ready',
        title: 'Custom X Post',
        hook: 'Most coffee marketing is about caffeine. Trailmark is about the 10 minutes you spend with it.',
        beats: [
          'Open with the contrast: most coffee marketing screams caffeine',
          'Trailmark is the opposite — quiet, ritual, intentional',
          'Personal: switched to their single-origin a month ago',
          'Close with the brand mechanic — small-batch, roasted to order',
        ],
        draftText: "Most coffee marketing screams caffeine.\n\nTrailmark is the opposite — it's about the 10 quiet minutes you spend with it.\n\nSwitched to their single-origin pour-over a month ago and my mornings haven't been the same.\n\nSmall-batch roasted to order, ships next day.\n\n@trailmarkcoffee · trailmarkcoffee.com",
        media: null,
        postedAt: null,
        postedUrl: null,
      },
      {
        id: 'd2',
        type: 'linkedin',
        status: 'ready',
        title: 'LinkedIn Post',
        angle: 'How rituals shape company culture — using Trailmark as the lens. High-authority, leadership audience.',
        draftText: "I've been thinking about how the smallest rituals shape company culture.\n\nFor me it's coffee. Not the caffeine — the 10 minutes before the first meeting where my brain catches up to my day.\n\nA month ago I switched to Trailmark's single-origin pour-over. Small change. Big impact on how I show up.\n\nThe team noticed. Now we keep a Trailmark setup in the office and the morning standup runs differently.\n\nRituals → habits → culture. The leverage is in the small things.\n\n#leadership #remoteculture #habits",
        postedAt: null,
        postedUrl: null,
      },
      {
        id: 'd3',
        type: 'newsletter',
        status: 'queued',
        title: 'Newsletter Feature',
        slot: 'Next Tuesday · Brand Spotlight section',
        blurb: "Trailmark Coffee is what happens when a small-batch roaster takes the supply chain personally. Single-origin, roasted-to-order, shipped next day. Their pour-over has reshaped my mornings.",
        ctaUrl: 'https://trailmarkcoffee.com',
        scheduledFor: 'Tue 9am PT',
      },
    ],
  },

  // Nina Akande · Halo Optics · Tier 6 Growth Bundle · $3,995
  // AWAITING APPROVAL — Sammy drafted, Asher needs to review.
  'F-2426': {
    tier: 6,
    status: 'awaiting-approval',
    draftedBy: 'sammy',
    draftedAt: '1d ago',
    deadlineDays: 5,
    postingWindow: 'Wed or Fri, 12–4pm PT',
    summary: "Halo Optics is a direct-to-consumer eyewear brand pushing their new 'reading-glasses-for-screens' category. Nina wants Robert to talk about screen fatigue as a founder problem.",
    notes: "Lean into the founder-fatigue angle. The product matters less than the problem framing.",
    mustInclude: ['Tag @halooptics', 'Link halo.com/screens', 'Mention "screen blue-light"'],
    mustAvoid: ['Health claims (FTC)', 'Naming Warby Parker'],
    deliverables: [
      {
        id: 'd1',
        type: 'custom-x',
        status: 'draft',
        title: 'Custom X Post',
        hook: "I'm a founder. My eyes work 14 hours a day. I should've thought about them earlier.",
        beats: [
          'Founder eye-strain as the universal-but-unspoken problem',
          'Screen blue-light at high doses — what changed for me',
          'Halo Optics — the only screen-glasses I don\'t feel dorky wearing',
        ],
        draftText: "I'm a founder. My eyes work 14 hours a day.\n\nI should've thought about them earlier.\n\nStarted wearing @halooptics screen blue-light glasses two weeks ago. Headaches I'd accepted as normal — gone by Wednesday.\n\nThe only screen-glasses I don't feel dorky wearing.\n\nhalo.com/screens",
        media: null,
        postedAt: null,
        postedUrl: null,
      },
      {
        id: 'd2',
        type: 'linkedin',
        status: 'draft',
        title: 'LinkedIn Post',
        angle: 'Founder health as a leadership issue. Screen fatigue as cumulative debt.',
        draftText: "Founder health is a leadership issue.\n\nI accepted daily headaches as the cost of running a company. For years.\n\nTwo weeks ago I started wearing Halo Optics screen glasses — blue-light filtering, not a gimmick.\n\nThe headaches I'd written off as normal? Gone by Wednesday.\n\nYou can't lead a team well if your body is sending you signals you keep ignoring.\n\nhalo.com/screens",
        postedAt: null,
        postedUrl: null,
      },
      {
        id: 'd3',
        type: 'retweet',
        status: 'draft',
        title: 'Retweet',
        sourceUrl: 'https://x.com/halooptics/status/1857234567890123456',
        sourcePreview: '@halooptics: "Why we filter blue light in the 415–455nm range — and why most brands don\'t bother." (3-post thread)',
      },
      {
        id: 'd4',
        type: 'newsletter',
        status: 'draft',
        title: 'Newsletter Feature',
        slot: 'Two weeks out · Brand Spotlight',
        blurb: "Halo Optics is what happens when a founder-built eyewear company decides screen-fatigue is the real category. Their blue-light readers are the first pair I haven't taken off after the third hour.",
        ctaUrl: 'https://halo.com/screens',
        scheduledFor: 'Tue 9am PT (TBD)',
      },
    ],
  },

  // Wes Tanaka · Forge Athletics · Tier 7 · already shipped
  'F-2423': {
    tier: 7,
    status: 'shipped',
    approvedBy: 'asher',
    approvedAt: '5d ago',
    deadlineDays: -3,
    postingWindow: 'Mon–Wed, prime hours',
    summary: 'Forge Athletics campaign — fully shipped, awaiting payment.',
    notes: '',
    mustInclude: [], mustAvoid: [],
    deliverables: [
      { id: 'd1', type: 'custom-x',   status: 'shipped', title: 'Custom X Post #1', draftText: '[Shipped — see post]', postedAt: '3d ago', postedUrl: 'https://x.com/Scobleizer/status/...' },
      { id: 'd2', type: 'custom-x',   status: 'shipped', title: 'Custom X Post #2', draftText: '[Shipped]',           postedAt: '2d ago', postedUrl: 'https://x.com/Scobleizer/status/...' },
      { id: 'd3', type: 'linkedin',   status: 'shipped', title: 'LinkedIn Post',    draftText: '[Shipped]',           postedAt: '2d ago', postedUrl: 'https://linkedin.com/posts/...' },
      { id: 'd4', type: 'retweet',    status: 'shipped', title: 'Retweet #1',       sourceUrl: 'https://x.com/forgeathletics/status/...', postedAt: '3d ago' },
      { id: 'd5', type: 'retweet',    status: 'shipped', title: 'Retweet #2',       sourceUrl: 'https://x.com/forgeathletics/status/...', postedAt: '2d ago' },
      { id: 'd6', type: 'newsletter', status: 'shipped', title: 'Newsletter',       slot: 'Last Tuesday', postedAt: '4d ago' },
    ],
  },

  // Lia Berenstein · Trailmark Coffee · Tier 6 · already shipped
  'F-2424': {
    tier: 6,
    status: 'shipped',
    approvedBy: 'asher',
    approvedAt: '3d ago',
    deadlineDays: -1,
    postingWindow: 'Tue or Thu, 4–7pm PT',
    summary: 'Trailmark Coffee follow-on (Lia\'s second campaign) — fully shipped.',
    notes: '',
    mustInclude: [], mustAvoid: [],
    deliverables: [
      { id: 'd1', type: 'custom-x',   status: 'shipped', title: 'Custom X Post', draftText: '[Shipped]', postedAt: '1d ago', postedUrl: 'https://x.com/Scobleizer/status/...' },
      { id: 'd2', type: 'linkedin',   status: 'shipped', title: 'LinkedIn Post', draftText: '[Shipped]', postedAt: '1d ago', postedUrl: 'https://linkedin.com/posts/...' },
      { id: 'd3', type: 'retweet',    status: 'shipped', title: 'Retweet',       sourceUrl: 'https://x.com/trailmarkcoffee/status/...', postedAt: '1d ago' },
      { id: 'd4', type: 'newsletter', status: 'shipped', title: 'Newsletter',    slot: 'Last week', postedAt: '2d ago' },
    ],
  },
};

// Brief status meta
const V3_BRIEF_STATUSES = {
  'draft':              { label: 'Draft',              tone: 'neutral', short: 'DRAFT' },
  'awaiting-approval':  { label: 'Awaiting approval',  tone: 'warn',    short: 'AWAITING APPROVAL' },
  'ready':              { label: 'Ready for Robert',   tone: 'go',      short: 'READY' },
  'in-production':      { label: 'In production',      tone: 'accent',  short: 'IN PRODUCTION' },
  'shipped':            { label: 'Shipped',            tone: 'done',    short: 'SHIPPED' },
};

const V3_ROBERT_BRIEFS = [
  {
    id: 'official-posting-viktor-2026-05-19',
    title: 'GET VIKTOR',
    subtitle: 'Time-sensitive official posting',
    subject: '**OFFICIAL POSTING** GET VIKTOR - MAY 19TH',
    gmailThreadId: '19e3e4341ab2c4ee',
    sentAt: '2026-05-18T23:24:02-04:00',
    from: 'Asher Weisberger <asherunaligned@gmail.com>',
    to: ['Robert Scoble <scobleizer@gmail.com>', 'Sam Levin UX <unalignedx@gmail.com>'],
    status: 'ready',
    partner: 'Ori',
    company: 'Viktor',
    summary: 'Asher sent Robert a brief with three proposed post options and asked him to pick one or edit it before posting.',
    body: `Hi Robert,

Here are the details for the collaboration with Ori, a past lead.

I’ve included a PDF with the proposed post options.

This one is time-sensitive, as they’re asking for the post to go live at 9:00 AM EST / 6:00 AM your time.

I’m still waiting for the live link to come through by email. Once we have it, I can handle the posting on your X account so you don’t have to think about it.

Please choose one of the three post options you prefer.

You’re also welcome to edit any of them and send me the final version you’d like used.

Happy to get up early and take care of the post for you. Just let me know how you’d like to proceed.

Thanks again for your trust and confidence.`,
    attachment: {
      filename: 'Viktor_Brief_Robert.pdf',
      type: 'pdf',
    },
    links: [],
    action: 'Pick one post option or edit it, then let Asher know the final version.',
    notes: ['Live at 9:00 AM EST / 6:00 AM Robert time', 'PDF attached with three post options'],
  },
  {
    id: 'official-posting-polyai-2026-05-18',
    title: 'PolyAI posting today',
    subtitle: 'Quote repost official posting',
    subject: 'OFFICIAL POSTING POLY AI POSTING TODAY',
    gmailThreadId: '19e3c14de4bba514',
    sentAt: '2026-05-18T17:14:07-04:00',
    from: 'Asher Weisberger <asherunaligned@gmail.com>',
    to: ['Robert Scoble <scobleizer@gmail.com>', 'Sam Levin UX <unalignedx@gmail.com>'],
    status: 'ready',
    partner: 'PolyAI',
    company: 'PolyAI',
    summary: 'Asher sent Robert a quote repost task with the live X link and a Google Doc write-up.',
    body: `THIS IS THE TASK

POLYAI - QUOTE REPOST - MAY 18 - TODAY MONDAY

FULL PDF WRITE UP BETWEEN POLYAI AND MYSELF IN LINK FOR USE ON POST

LIVE LINK

[LT-fW7_jnzT5lVod.jpeg
Starting today, we're opening our Agentic Dialog Platform to every enterprise builder.

Our dialog agents have resolved 1 billion+ customer conversations for clients like FedEx, Unicredit, PG&E, Marriott, Foot Locker, and many more.

These aren't easy conversations. They solve

PolyAI (@polyaivoice)
154 likes · 37 replies
x.com](https://x.com/polyaivoice/status/2056404397089825165)

THESE ARE THE DOCUMENTS

[AHkbwyLSSWmC1mRkEhtH_bGBXECei72ujIcuTquAckY0OmR_4iiSr85aawrmpVRbqu4QhLfaZgWIMg-qt0MjBdv2cRFXHdTz7ZfvBkyLErT8aXMXx-M3ZtKJ=w1200-h630-p.png

BHARAT ROBERT SCOBLE X POLYAI COLLAB
docs.google.com](https://docs.google.com/document/d/18VKhSyLIftOB40zV2pjVA-oajDh6TyDzMoJEmQg85tg/edit?usp=sharing)`,
    attachment: null,
    links: [
      { label: 'Live post', href: 'https://x.com/polyaivoice/status/2056404397089825165' },
      { label: 'Docs', href: 'https://docs.google.com/document/d/18VKhSyLIftOB40zV2pjVA-oajDh6TyDzMoJEmQg85tg/edit?usp=sharing' },
    ],
    action: 'Use the live link and docs to post the quote repost.',
    notes: ['Quote repost', 'Use the Google Doc write-up for the final post'],
  },
];

// Attach briefs to leads (mutable so check-off can mutate in-session)
for (const lead of V3_LEADS) {
  if (V3_BRIEFS[lead.id]) lead.brief = V3_BRIEFS[lead.id];
}

const V3_VISIBLE_LEADS = V3FilterVisibleLeads(V3_LEADS);
const V3_VISIBLE_ROBERT_BRIEFS = V3FilterVisibleBriefs(V3_ROBERT_BRIEFS);

// Aggregates
function v3FlowCounts() {
  const leads = window.V3?.LEADS || V3_VISIBLE_LEADS;
  return V3_ACTIVE_STAGE_IDS.map(s => ({
    id: s,
    name: V3_STAGE_BY_ID[s].name,
    short: V3_STAGE_BY_ID[s].short,
    color: V3_STAGE_BY_ID[s].color,
    count: leads.filter(l => l.stage === s).length,
    value: leads.filter(l => l.stage === s).reduce((sum, l) => sum + (l.value || 0), 0),
  }));
}

function v3Greeting() {
  const h = new Date().getHours();
  if (h < 5)  return 'Late night';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

// ─── Task derivation ─────────────────────────────────────────
// Turns lead state into concrete, dated tasks for the Today view.
// Each task has a `dueIn` (days from today; negative = past due, 0 = today,
// 1 = tomorrow, >1 = upcoming) and a `type` driving icon + color.

const V3_TASK_TYPES = {
  qualify: { label: 'New lead',     icon: 'spark',   tone: 'new'     },
  reply:   { label: 'Reply',        icon: 'reply',   tone: 'reply'   },
  followup:{ label: 'Follow up',    icon: 'send',    tone: 'followup'},
  rates:   { label: 'Send rates',   icon: 'invoice', tone: 'rates'   },
  nudge:   { label: 'Nudge',        icon: 'bolt',    tone: 'nudge'   },
  respond: { label: 'Respond',      icon: 'reply',   tone: 'reply'   },
  invoice: { label: 'Send invoice', icon: 'invoice', tone: 'invoice' },
  payment: { label: 'Confirm $',    icon: 'check',   tone: 'payment' },
  post:    { label: 'Post content', icon: 'send',    tone: 'post'    },
  live:    { label: 'Live',         icon: 'spark',   tone: 'live'    },
  approve: { label: 'Approve brief',icon: 'check',   tone: 'approve' },
};

function v3DeriveTasks(user, leads = window.V3?.LEADS || V3_LEADS) {
  const laneUser = user === 'robert' ? 'robert' : 'asher';
  const tasks = [];
  const first = n => n.split(' ')[0];
  const moneyTag = v => v ? '$' + v.toLocaleString() : '';

  for (const lead of leads) {
    if (lead.stage === 'paid-out') continue;
    if (!V3LeadVisibleToProfile(lead, user)) continue;
    const ownsThis = lead.ownerId === laneUser;

    // ─── Robert (creator): post + live tracking ───
    if (laneUser === 'robert') {
      if (lead.stage === 'done') {
        const brief = lead.brief;
        // Only "ready" or "in-production" briefs are actionable for Robert.
        // Awaiting-approval = Asher's task, not Robert's.
        const briefReady = brief && (brief.status === 'ready' || brief.status === 'in-production');
        if (briefReady) {
          const dueIn = (brief.deadlineDays != null) ? brief.deadlineDays : (3 - lead.daysInStage);
          // Count un-shipped deliverables for the subtitle
          const remaining = brief.deliverables.filter(d => d.status !== 'shipped').length;
          tasks.push({
            id: lead.id + ':post', leadId: lead.id, type: 'post',
            title: `Post deliverables · ${lead.brand}`,
            sub: `${V3_TIERS[brief.tier]?.name || 'Tier ' + brief.tier} · ${remaining} item${remaining === 1 ? '' : 's'} to post`,
            dueIn, value: lead.value, lead,
            briefStatus: brief.status,
            action: 'open-brief',
          });
        } else if (brief && brief.status === 'awaiting-approval') {
          // Surface to Robert as informational — pipeline visibility, not actionable.
          tasks.push({
            id: lead.id + ':pending', leadId: lead.id, type: 'post',
            title: `${lead.brand} — brief awaiting Asher's approval`,
            sub: `${V3_TIERS[brief.tier]?.name || 'Tier ' + brief.tier} · drafted ${brief.draftedAt} by ${brief.draftedBy}`,
            dueIn: (brief.deadlineDays || 5) + 1,
            value: lead.value, lead,
            briefStatus: brief.status,
            kind: 'info',
          });
        }
      }
      if (lead.stage === 'invoice-sent') {
        const dueIn = 14 - lead.daysInStage;
        tasks.push({
          id: lead.id + ':live', leadId: lead.id, type: 'live',
          title: `${lead.brand} live · awaiting payment`,
          sub:   `${(V3_TIERS[lead.brief?.tier]?.name) || lead.deliverables} · invoice out ${lead.daysInStage}d`,
          dueIn, value: lead.value, lead, kind: 'info',
        });
      }
      continue;
    }

    // ─── Sammy + Asher: sales pipeline tasks ───
    // Asher and Sammy share the same sales lane.
    if (!ownsThis && laneUser !== 'asher') continue;

    if (lead.stage === 'new') {
      tasks.push({
        id: lead.id + ':qualify', leadId: lead.id, type: 'qualify',
        title: `Qualify ${first(lead.contactName)} · ${lead.brand}`,
        sub:   `New inbound · came in ${lead.lastTouch} ago`,
        dueIn: lead.daysInStage > 0 ? -lead.daysInStage : 0,
        value: null, lead,
      });
    }
    if (lead.stage === 'first-touch' && lead.needsReply) {
      tasks.push({
        id: lead.id + ':followup', leadId: lead.id, type: 'followup',
        title: `Follow up with ${first(lead.contactName)}`,
        sub:   `${lead.brand} · outreach sent ${lead.daysInStage}d ago, no reply`,
        dueIn: 3 - lead.daysInStage, value: lead.value, lead,
      });
    }
    if (lead.stage === 'engaged' && lead.needsReply) {
      tasks.push({
        id: lead.id + ':reply', leadId: lead.id, type: 'reply',
        title: `Reply to ${first(lead.contactName)} re: scope`,
        sub:   `${lead.brand} · discovery — ${lead.deliverables}`,
        dueIn: Math.max(-3, 1 - lead.daysInStage), value: lead.value, lead,
      });
    }
    if (lead.stage === 'engaged' && !lead.needsReply) {
      tasks.push({
        id: lead.id + ':rates', leadId: lead.id, type: 'rates',
        title: `Send rates to ${first(lead.contactName)}`,
        sub:   `${lead.brand} · scope locked · ${lead.deliverables}`,
        dueIn: 1, value: lead.value, lead,
      });
    }
    if (lead.stage === 'rates-sent') {
      const dueIn = 4 - lead.daysInStage;
      tasks.push({
        id: lead.id + ':nudge', leadId: lead.id, type: 'nudge',
        title: `Nudge ${first(lead.contactName)} on rates`,
        sub:   `${lead.brand} · ${moneyTag(lead.value)} · sent ${lead.daysInStage}d ago`,
        dueIn, value: lead.value, lead,
      });
    }
    if (lead.stage === 'negotiating' && lead.needsReply) {
      tasks.push({
        id: lead.id + ':respond', leadId: lead.id, type: 'respond',
        title: `Respond to ${first(lead.contactName)}'s counter`,
        sub:   `${lead.brand} · revised terms requested`,
        dueIn: Math.max(-2, 1 - lead.daysInStage), value: lead.value, lead,
      });
    }
    if (lead.stage === 'done') {
      tasks.push({
        id: lead.id + ':invoice', leadId: lead.id, type: 'invoice',
        title: `Send invoice · ${lead.brand}`,
        sub:   `${lead.deliverables} · with ${first(lead.contactName)} · ${moneyTag(lead.value)}`,
        dueIn: 2 - lead.daysInStage, value: lead.value, lead,
      });
      // Asher-only: approve brief if it's awaiting approval.
      if (laneUser === 'asher' && lead.brief && lead.brief.status === 'awaiting-approval') {
        tasks.push({
          id: lead.id + ':approve-brief', leadId: lead.id, type: 'approve',
          title: `Approve brief · ${lead.brand}`,
          sub:   `${V3_TIERS[lead.brief.tier]?.name || 'Tier ' + lead.brief.tier} · drafted by ${lead.brief.draftedBy} ${lead.brief.draftedAt}`,
          dueIn: Math.max(0, (lead.brief.deadlineDays || 5) - 2),
          value: lead.value, lead,
          briefStatus: lead.brief.status,
          action: 'open-brief',
        });
      }
    }
    if (lead.stage === 'invoice-sent') {
      const dueIn = 14 - lead.daysInStage;
      tasks.push({
        id: lead.id + ':payment', leadId: lead.id, type: 'payment',
        title: `Confirm payment · ${lead.brand}`,
        sub:   `Invoice ${moneyTag(lead.value)} · out ${lead.daysInStage}d`,
        dueIn, value: lead.value, lead,
      });
    }
  }

  // Apply email-deadline overrides to all derived tasks (these are
  // priority items — the lead said in-thread when they need a response)
  for (const t of tasks) {
    const lead = t.lead;
    if (lead && lead.emailDeadline != null) {
      t.urgent = true;
      t.emailDeadline = lead.emailDeadline;
      t.emailDeadlineNote = lead.emailDeadlineNote;
      // Override dueIn to the email-stated deadline (only if tighter than the default).
      if (lead.emailDeadline < t.dueIn) t.dueIn = lead.emailDeadline;
    }
  }

  return tasks;
}

function v3BucketTasks(tasks) {
  // Visible window: 14 days back (recent past-due) to 28 days forward (next 4 weeks).
  // Beyond that — hide ("the shit that's 40+ days old, fuck it").
  const PAST_WINDOW = 14;     // show past-due if <= 14 days late
  const FUTURE_WINDOW = 28;   // show upcoming if <= 28 days out

  const buckets = {
    urgent:   [],   // email-specified deadlines — pinned at top
    today:    [],
    tomorrow: [],
    thisWeek: [],   // 2–7 days out
    upcoming: [],   // 8–28 days out
    past:     [],   // -14 to -1 days
  };
  for (const t of tasks) {
    if (t.dueIn < -PAST_WINDOW)  continue; // ancient — drop
    if (t.dueIn >  FUTURE_WINDOW) continue; // too far out — drop

    if (t.urgent) { buckets.urgent.push(t); continue; }
    if (t.dueIn < 0)        buckets.past.push(t);
    else if (t.dueIn === 0) buckets.today.push(t);
    else if (t.dueIn === 1) buckets.tomorrow.push(t);
    else if (t.dueIn <= 7)  buckets.thisWeek.push(t);
    else                    buckets.upcoming.push(t);
  }
  // Sorts: urgent by tightest first, then $; date buckets soonest-first; past by least-overdue first
  buckets.urgent.sort((a, b) => (a.dueIn - b.dueIn) || ((b.value || 0) - (a.value || 0)));
  buckets.today.sort((a, b) => (b.value || 0) - (a.value || 0));
  buckets.tomorrow.sort((a, b) => (b.value || 0) - (a.value || 0));
  buckets.thisWeek.sort((a, b) => a.dueIn - b.dueIn);
  buckets.upcoming.sort((a, b) => a.dueIn - b.dueIn);
  buckets.past.sort((a, b) => b.dueIn - a.dueIn); // least-overdue first (most recent past-due at top of the past bucket)
  return buckets;
}

// ─── Gmail-style time formatting ─────────────────────────────
// list()    → compact like Gmail's inbox column: "3:42 PM" (today), "May 12" (this year), "11/4/24" (older)
// full()    → "Mon, May 12, 2025, 3:42 PM" — the per-message header in an open thread
// tooltip() → "Mon, May 12, 2025 at 3:42 PM (2 days ago)" — full absolute + relative for hover
// relative()→ "2 days ago", "yesterday", "just now" — for the parenthetical
const V3GmailTime = (() => {
  const parse = (v) => {
    if (!v) return null;
    if (v instanceof Date) return isNaN(v) ? null : v;
    // accept "Nd ago" / "Nh ago" / "Nm ago" as fallbacks
    let s = String(v).trim();
    const dm = s.match(/^(\d+)\s*d/i);
    const hm = s.match(/^(\d+)\s*h/i);
    const mm = s.match(/^(\d+)\s*m(?!o)/i); // m but not "month"
    if (dm) return new Date(Date.now() - +dm[1] * 86400000);
    if (hm) return new Date(Date.now() - +hm[1] * 3600000);
    if (mm) return new Date(Date.now() - +mm[1] * 60000);
    // Normalize Supabase-style strings like "May 15, 2026 12:31PM PT / 3:31PM ET"
    // → strip the alt-timezone tail, normalize "12:31PM" → "12:31 PM"
    s = s.replace(/\s*\/.*$/, '').replace(/(\d)(AM|PM)\b/i, '$1 $2');
    // Strip trailing timezone abbreviations Date.parse can't handle ("PT", "ET", etc.)
    // Keep ISO offsets like "+00:00" or "Z" intact.
    s = s.replace(/\s+(PT|PST|PDT|ET|EST|EDT|CT|CST|CDT|MT|MST|MDT|BST|CEST|CET)$/i, '');
    const t = Date.parse(s);
    return Number.isFinite(t) ? new Date(t) : null;
  };
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const time12 = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  const list = (v) => {
    const d = parse(v); if (!d) return '';
    const now = new Date();
    if (sameDay(d, now)) return time12(d);
    if (d.getFullYear() === now.getFullYear()) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    // older — Gmail uses "11/4/24" style
    const mm = d.getMonth() + 1, dd = d.getDate(), yy = String(d.getFullYear()).slice(-2);
    return `${mm}/${dd}/${yy}`;
  };

  const full = (v) => {
    const d = parse(v); if (!d) return '';
    const raw = String(v instanceof Date ? '' : (v || '')).trim();
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw) ||
      /T(?:00:00:00(?:\.000)?|12:00:00(?:\.000)?)(?:Z|[+-]\d{2}:?\d{2})?$/.test(raw) ||
      /\b12:00\s*(?:AM|PM)\b/i.test(raw) ||
      (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0);
    if (dateOnly) {
      return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    }
    return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
      .replace(/,([^,]*)$/, ',$1'); // pass-through; toLocaleString already gives a nice format
  };

  const relative = (v) => {
    const d = parse(v); if (!d) return '';
    const now = new Date();
    const diff = now - d;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + ' minute' + (mins === 1 ? '' : 's') + ' ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24 && sameDay(d, now)) return hrs + ' hour' + (hrs === 1 ? '' : 's') + ' ago';
    const yest = new Date(now); yest.setDate(yest.getDate() - 1);
    if (sameDay(d, yest)) return 'yesterday';
    const days = Math.floor(diff / 86400000);
    if (days < 7) return days + ' days ago';
    if (days < 30) { const w = Math.floor(days / 7); return w + ' week' + (w === 1 ? '' : 's') + ' ago'; }
    if (days < 365) { const mo = Math.floor(days / 30); return mo + ' month' + (mo === 1 ? '' : 's') + ' ago'; }
    const yr = Math.floor(days / 365); return yr + ' year' + (yr === 1 ? '' : 's') + ' ago';
  };

  const tooltip = (v) => {
    const d = parse(v); if (!d) return '';
    return full(v) + ' (' + relative(d) + ')';
  };

  return { list, full, relative, tooltip, parse };
})();

// ─── Backfill real ISO dates onto synthetic threads ───────────
// The seed leads only have "Nd ago" strings on messages; convert them into real Date
// objects so the Gmail formatter can render proper timestamps. Real Supabase-loaded
// leads already have .date on each message.
(function backfillSeedDates() {
  const minutesSinceMidnight = () => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  };
  for (const lead of V3_LEADS) {
    if (!Array.isArray(lead.thread)) continue;
    for (const m of lead.thread) {
      if (m.date) continue;
      const d = V3GmailTime.parse(m.when);
      if (d) {
        // For "Nd ago" messages, snap to a plausible workday time (9–6) instead of "exactly now".
        const dm = /^(\d+)\s*d/i.test(m.when || '');
        if (dm) {
          const offsetMin = ((d.getTime() * 7919) >>> 0) % (9 * 60); // deterministic per-day spread
          d.setHours(9, 0, 0, 0);
          d.setMinutes(d.getMinutes() + offsetMin);
        }
        m.date = d.toISOString();
      }
    }
    // lastTouchAt = newest message date
    const dates = lead.thread.map(m => m.date && Date.parse(m.date)).filter(Number.isFinite);
    if (dates.length) lead.lastTouchAt = new Date(Math.max(...dates)).toISOString();
  }
})();

const V3_SUPABASE_HEADERS = {
  apikey: V3_SUPABASE_ANON_KEY,
  Authorization: 'Bearer ' + V3_SUPABASE_ANON_KEY,
  'Content-Type': 'application/json',
};

function V3RefreshConfigGlobals() {
  if (!window.V3) return;
  window.V3.USERS = V3_USERS;
  window.V3.TIERS = V3_TIERS;
  window.dispatchEvent(new CustomEvent('v3:config-loaded', {
    detail: { users: V3_USERS, tiers: V3_TIERS },
  }));
}

async function V3LoadPricingTiers() {
  try {
    const res = await fetch(
      V3_SUPABASE_URL + '/rest/v1/pricing_tiers?select=id,name,price,short,items,sort_order,is_active&order=sort_order.asc,id.asc',
      { headers: V3_SUPABASE_HEADERS }
    );
    if (!res.ok) throw new Error('pricing_tiers ' + res.status);
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows.length) return;
    const next = {};
    for (const row of rows) {
      if (row && row.is_active === false) continue;
      const id = Number(row.id);
      if (!Number.isFinite(id)) continue;
      next[id] = {
        id,
        price: Number(row.price || 0),
        name: row.name || ('Tier ' + id),
        short: row.short || ('T' + id),
        items: Array.isArray(row.items) ? row.items.filter(Boolean).map(String) : [],
      };
    }
    if (Object.keys(next).length) {
      V3_TIERS = next;
      V3RefreshConfigGlobals();
    }
  } catch (err) {
    console.warn('[ALIGNED v4] pricing tiers load failed:', err);
  }
}

async function V3LoadTeamUsers() {
  try {
    const res = await fetch(
      V3_SUPABASE_URL + '/rest/v1/team_users?select=id,name,role,color,initials,lane,is_active,sort_order&is_active=eq.true&order=sort_order.asc,name.asc',
      { headers: V3_SUPABASE_HEADERS }
    );
    if (!res.ok) throw new Error('team_users ' + res.status);
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows.length) return;
    const next = {};
    for (const row of rows) {
      const id = String(row.id || '').trim();
      if (!id) continue;
      next[id] = {
        id,
        name: row.name || id,
        role: row.role || '',
        color: row.color || '#2f5fd6',
        initials: row.initials || String(row.name || id).split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase(),
        lane: row.lane || '',
      };
    }
    if (Object.keys(next).length) {
      V3_USERS = next;
      V3RefreshConfigGlobals();
    }
  } catch (err) {
    console.warn('[ALIGNED v4] team users load failed:', err);
  }
}

function V3MoveLeadStage(lead, nextStage, leads = window.V3?.LEADS || V3_LEADS) {
  const normalizedStage = V3NormalizeStage(nextStage);
  const updated = leads.map(item => String(item.id) === String(lead.id) ? { ...item, stage: normalizedStage } : item);
  window.V3.LEADS = updated;
  window.dispatchEvent(new CustomEvent('v3:leads-loaded', { detail: { leads: updated } }));

  // X DM intake leads are not backed by a Supabase row, so a PATCH would no-op
  // and the lead would resurface on the next scrape. Persist the decision as a
  // card instead — its contact_name makes the daily X intake dedupe skip this
  // lead on future loads, and we relink the in-memory id so Restore can PATCH it.
  const isXIntake = String(lead?.source || '').includes('x-dm-intake') || String(lead?.id || '').startsWith('xdm-');
  if (isXIntake) {
    fetch(V3_SUPABASE_URL + '/rest/v1/cards', {
      method: 'POST',
      headers: { ...V3_SUPABASE_HEADERS, Prefer: 'return=representation' },
      body: JSON.stringify({
        list_id: normalizedStage,
        title: lead.contactName || lead.brand || 'X lead',
        contact_name: lead.contactName || '',
        lead_source: 'x-dm-intake',
        website: lead.xOpenDm || (lead.xHandle ? 'https://x.com/' + String(lead.xHandle).replace(/^@/, '') : ''),
        email: lead.email || '',
        intent: lead.deliverables || '',
      }),
    })
      .then(res => res.ok ? res.json() : null)
      .then(rows => {
        const newId = Array.isArray(rows) && rows[0] ? rows[0].id : null;
        if (newId == null) return;
        const relinked = (window.V3.LEADS || updated).map(item =>
          String(item.id) === String(lead.id) ? { ...item, id: newId, rowId: newId, source: 'x-dm-intake' } : item);
        window.V3.LEADS = relinked;
        window.dispatchEvent(new CustomEvent('v3:leads-loaded', { detail: { leads: relinked } }));
      })
      .catch(err => console.warn('[ALIGNED v4] x suppress failed:', err));
    return;
  }

  const id = lead?.rowId || lead?.id;
  if (!id) return;
  fetch(V3_SUPABASE_URL + '/rest/v1/cards?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH',
    headers: { ...V3_SUPABASE_HEADERS, Prefer: 'return=minimal' },
    body: JSON.stringify({ list_id: normalizedStage }),
  }).catch(err => console.warn('[ALIGNED v4] stage update failed:', err));
}

window.V3 = { USERS: V3_USERS, STAGES: V3_STAGES, STAGE_BY_ID: V3_STAGE_BY_ID, ACTIVE_STAGE_IDS: V3_ACTIVE_STAGE_IDS, BOARD_STAGE_IDS: V3_BOARD_STAGE_IDS, TRASH_STAGE_IDS: V3_TRASH_STAGE_IDS, LEADS: V3_VISIBLE_LEADS, TIERS: V3_TIERS, DELIV_TYPES: V3_DELIV_TYPES, BRIEF_STATUSES: V3_BRIEF_STATUSES, ROBERT_BRIEFS: V3_VISIBLE_ROBERT_BRIEFS, TASK_TYPES: V3_TASK_TYPES, GmailTime: V3GmailTime, flowCounts: v3FlowCounts, greeting: v3Greeting, deriveTasks: v3DeriveTasks, bucketTasks: v3BucketTasks, ProfileTeam: V3ProfileTeam, ProfileLane: V3ProfileLane, LeadLane: V3LeadLane, LeadVisibleToProfile: V3LeadVisibleToProfile, LeadIsMineForProfile: V3MoveIsMineForProfile, MoveIsMineForProfile: V3MoveIsMineForProfile, MoveLeadStage: V3MoveLeadStage, IsNewLeadReview: V3IsNewLeadReview, CompanyOsQualifiedLead: V3CompanyOsQualifiedLead, LeadActivityTimestamp: V3LeadActivityTimestamp, LeadReceivedTimestamp: V3LeadReceivedTimestamp, SortLeadsByActivity: V3SortLeadsByActivity, NewLeadReason: V3NewLeadReason, NewLeadSourceKind: V3NewLeadSourceKind, NewLeadSourceLabel: V3NewLeadSourceLabel, NewLeadHandle: V3NewLeadHandle, NewLeadSummary: V3NewLeadSummary, NewLeadPrimaryIdentity: V3NewLeadPrimaryIdentity, LeadMatchesQuery: V3LeadMatchesQuery, PrunePendingReplies: V3PrunePendingReplies, MergePendingReplies: V3MergePendingReplies };

V3LoadPricingTiers();
V3LoadTeamUsers();

V3LoadSupabaseLeads().then(leads => {
  window.V3.LEADS = leads;
  window.dispatchEvent(new CustomEvent('v3:leads-loaded', { detail: { leads } }));
}).catch(err => console.error('Supabase load failed:', err));


// FLOW v3 — Board view

function V3BoardView({ leads, openId, onOpen, user, ownerFilter, setOwnerFilter }) {
  const { STAGE_BY_ID, BOARD_STAGE_IDS } = window.V3;

  const filtered = leads.filter(l => {
    if (ownerFilter !== 'all' && l.ownerId !== ownerFilter) return false;
    return true;
  });

  const activeLeads = filtered.filter(l => l.stage !== 'trash');
  const trashLeads  = filtered.filter(l => l.stage === 'trash');

  return (
    <div className="board-wrap">
      <div className="board">
        {BOARD_STAGE_IDS.map(stageId => {
          const stage = STAGE_BY_ID[stageId];
          const stageLeads = (stageId === 'trash'
            ? trashLeads
            : activeLeads.filter(l => l.stage === stageId))
            .sort((a, b) => V3TimestampForUi(b.lastTouchAt) - V3TimestampForUi(a.lastTouchAt));
          const needsReply = stageId === 'trash' ? [] : stageLeads.filter(l => l.needsReply);
          const waiting    = stageId === 'trash' ? [] : stageLeads.filter(l => !l.needsReply);

          return (
            <div key={stageId} className={'b-col' + (stageId === 'trash' ? ' is-trash' : '')}>
              <div className="b-col-hd">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <div className="b-col-count" style={{ color: stage.color }}>
                    {String(stageLeads.length).padStart(2, '0').slice(-2)}
                  </div>
                  <div className="b-col-name" style={{ color: stage.color }}>{stage.short}</div>
                </div>
                <div className="b-col-actions">
                  <button title="Info"><V3Icon name="more" w={14} /></button>
                  <button title="Sort"><V3Icon name="sort" w={14} /></button>
                  <button title="More"><V3Icon name="filter" w={14} /></button>
                </div>
              </div>

              <div className="b-col-body">
                {stageId !== 'trash' && needsReply.length > 0 && (
                  <>
                    <div className="b-subhead needs-reply">
                      <span>NEEDS REPLY</span>
                      <span className="cnt">{needsReply.length}</span>
                    </div>
                    {needsReply.map(l => (
                      <V3BoardCard key={l.id} lead={l} isActive={openId === l.id} user={user} onOpen={() => onOpen(l.id)} onMoveStage={(nextStage) => window.V3.MoveLeadStage(l, nextStage, leads)} />
                    ))}
                  </>
                )}

                {stageId !== 'trash' && waiting.length > 0 && (
                  <>
                    <div className="b-subhead waiting">
                      <span>WAITING ON THEM</span>
                      <span className="cnt">{waiting.length}</span>
                    </div>
                    {waiting.map(l => (
                      <V3BoardCard key={l.id} lead={l} isActive={openId === l.id} user={user} onOpen={() => onOpen(l.id)} onMoveStage={(nextStage) => window.V3.MoveLeadStage(l, nextStage, leads)} />
                    ))}
                  </>
                )}

                {stageId === 'trash' && trashLeads.length > 0 && (
                  <>
                    <div className="trash-column-hint">Cards moved here can be restored if needed.</div>
                    {trashLeads.map(l => (
                      <V3BoardCard key={l.id} lead={l} isActive={openId === l.id} user={user} onOpen={() => onOpen(l.id)} onMoveStage={(nextStage) => window.V3.MoveLeadStage(l, nextStage, leads)} />
                    ))}
                  </>
                )}

                {stageLeads.length === 0 && (
                  <div style={{ padding: '20px 8px', textAlign: 'center', color: 'var(--text-4)', fontSize: 11.5 }}>
                    {stageId === 'trash' ? 'Nothing in trash' : 'Nothing here'}
                  </div>
                )}

                {stageId !== 'trash' && (
                  <button className="b-col-add">
                    <V3Icon name="plus" w={12} />
                    Add card
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function V3BoardCard({ lead, isActive, user, onOpen, onMoveStage }) {
  const { USERS, STAGE_BY_ID } = window.V3;
  const isMine = window.V3.MoveIsMineForProfile(lead, user);
  const isThem = !lead.nextMove.who && !['paid-out'].includes(lead.stage);
  const isAssignedToMe = window.V3.LeadIsMineForProfile(lead, user);
  const sourceLabel = (lead.source || '').toUpperCase();
  const isTrash = lead.stage === 'trash';

  return (
    <div className={'b-card' + (isActive ? ' is-active' : '')} onClick={onOpen}>
      {/* Category tab */}
      {lead.category && <span className={'cat-tab cat-' + lead.category}>{lead.category}</span>}

      {/* Top row */}
      <div className="b-card-top">
        <div className="b-card-top-main">
          <span className="b-card-name">{lead.contactName}</span>
          <span className="b-card-badge">{sourceLabel.slice(0, 6)}</span>
          <span className="b-card-date">{lead.lastTouch}</span>
        </div>
        <button
          className="b-card-trash-btn"
          title={isTrash ? "Restore to New" : "Move to trash"}
          aria-label={(isTrash ? 'Restore ' : 'Move ') + lead.contactName + (isTrash ? ' to New' : ' to trash')}
          onClick={e => { e.stopPropagation(); onMoveStage?.(isTrash ? 'new' : 'trash'); }}
        >
          <V3Icon name={isTrash ? "reply" : "trash"} w={12} />
        </button>
      </div>

      {/* Company */}
      <div className="b-card-co">
        <strong>{lead.brand}</strong>
        {lead.value && <span> · {v3Money(lead.value, { compact: true })}</span>}
      </div>

      {/* Next move dashed callout */}
      {isTrash ? (
        <div className="b-card-next trash">
          <div className="b-card-next-ic">
            <V3Icon name="trash" w={13} />
          </div>
          <span className="b-card-next-text">Moved to trash</span>
        </div>
      ) : (
        <div className={'b-card-next ' + (isMine ? 'you' : isThem ? 'them' : '')}>
          <div className="b-card-next-ic">
            <V3Icon name={isMine
              ? (lead.nextMove.action === 'Post' ? 'video' : lead.nextMove.action === 'Send' ? 'send' : lead.nextMove.action === 'Nudge' ? 'bell' : lead.nextMove.action === 'Invoice' ? 'invoice' : 'reply')
              : isThem ? 'clock' : 'check'} w={13} />
          </div>
          <span className="b-card-next-text">{lead.nextMove.text}</span>
        </div>
      )}

      {/* Footer */}
      <div className="b-card-foot">
        <span className="age">{lead.daysInStage}d</span>
        {!isTrash && lead.nextMove.action && (
          <button className="reply-btn" onClick={e => e.stopPropagation()}>
            <V3Icon name={lead.nextMove.action === 'Post' ? 'video' : lead.nextMove.action === 'Send' ? 'send' : lead.nextMove.action === 'Nudge' ? 'bell' : 'reply'} w={13} />
            {lead.nextMove.action}
          </button>
        )}
        <button
          className={isTrash ? "b-card-restore-action" : "b-card-trash-action"}
          onClick={e => { e.stopPropagation(); onMoveStage?.(isTrash ? 'new' : 'trash'); }}
        >
          <V3Icon name={isTrash ? "reply" : "trash"} w={12} />
          {isTrash ? 'Restore' : 'Trash'}
        </button>
        <span className="stage-pill" style={{ color: STAGE_BY_ID[lead.stage].color, marginLeft: 'auto' }}>
          <span className="dot"></span>
          {STAGE_BY_ID[lead.stage].short.slice(0, 8)}
        </span>
      </div>

      {/* Approval pill at bottom */}
      {lead.approve === 'sam' && (
        <div className="approve-pill green">
          <span className="dot" style={{ background: 'currentColor' }}></span>
          Approve Sam
        </div>
      )}
      {lead.approve === 'asher' && (
        <div className="approve-pill amber">
          <span className="dot" style={{ background: 'currentColor' }}></span>
          Approve Asher
        </div>
      )}
    </div>
  );
}

Object.assign(window, { V3BoardView });


// FLOW v3 — Brief panel (Asher) + Brief viewer modal (Robert)
//
// Briefs are attached to closed deals (stage = 'done' or 'invoice-sent').
// Status flow: draft → awaiting-approval → ready → in-production → shipped
//
// - Asher sees the brief inside the right drawer when he opens a closed deal.
//   He can edit any field and Approve → status becomes 'ready'.
// - Robert sees the brief in a fullscreen-style modal launched from his Today
//   task. He copies text per deliverable, marks each posted, and once all
//   deliverables ship the deal advances to invoice-sent.

// ─── Status pill ─────────────────────────────────────────────
function V3BriefStatusPill({ status }) {
  const meta = window.V3.BRIEF_STATUSES[status] || { label: status, tone: 'neutral' };
  return <span className={'brief-stat brief-stat-' + meta.tone}>{meta.short || meta.label}</span>;
}

// ─── Asher's panel: in-drawer brief review/approve ───────────
function V3BriefPanel({ lead, user, onChange, onApprove }) {
  const { TIERS } = window.V3;
  const [brief, setBrief] = React.useState(lead.brief);
  const [drafting, setDrafting] = React.useState(false);
  const [draftError, setDraftError] = React.useState(null);

  if (!brief) return null;
  const tier = TIERS[brief.tier];
  const canApprove = user === 'asher' && brief.status === 'awaiting-approval';
  const isShipped = brief.status === 'shipped';

  const updateBrief = (patch) => {
    const next = { ...brief, ...patch };
    setBrief(next);
    lead.brief = next; // mutate so other views (Robert's Today) see updates
    if (onChange) onChange(next);
  };
  const updateDeliv = (i, patch) => {
    const next = brief.deliverables.map((d, idx) => idx === i ? { ...d, ...patch } : d);
    updateBrief({ deliverables: next });
  };

  // AI drafting via window.claude — pre-fills draft text from email thread + tier
  const aiDraft = async () => {
    if (!window.claude?.complete) return;
    setDrafting(true); setDraftError(null);
    try {
      const ctx = (lead.thread || []).map(m => `[${m.from}] ${m.subject}\n${m.body}`).join('\n\n---\n\n');
      const tierItems = tier.items.join(', ');
      const undrafted = brief.deliverables.findIndex(d => !d.draftText && d.type !== 'newsletter' && d.type !== 'retweet');
      if (undrafted === -1) { setDrafting(false); return; }
      const d = brief.deliverables[undrafted];

      const prompt = `You're drafting social copy for Robert Scoble (founder of UNALIGNED, large X/LinkedIn following in tech).
Brand: ${lead.brand}.
Tier ${brief.tier} (${tier.name}): ${tierItems}.
This deliverable: ${d.type} — ${d.title}.
${d.hook ? 'Hook the brand suggested: ' + d.hook : ''}
${d.beats ? 'Story beats: ' + d.beats.join('; ') : ''}
${d.angle ? 'Angle: ' + d.angle : ''}
Must include: ${(brief.mustInclude || []).join(', ')}.
Must avoid: ${(brief.mustAvoid || []).join(', ')}.
Notes: ${brief.notes || '—'}.

Email context with the brand:
${ctx.slice(0, 2000)}

Write ONLY the post copy — no preamble, no quotes, no markdown. Keep it under 280 chars for an X post; 600 chars for LinkedIn. Use Robert's voice: direct, observational, occasionally dry. Don't sound like marketing.`;
      const out = await window.claude.complete(prompt);
      updateDeliv(undrafted, { draftText: out.trim() });
    } catch (e) {
      setDraftError(e.message || 'Drafting failed');
    } finally {
      setDrafting(false);
    }
  };

  const approve = () => {
    updateBrief({ status: 'ready', approvedBy: user, approvedAt: 'just now' });
    if (onApprove) onApprove();
  };

  return (
    <div className="brief-panel">
      <div className="brief-panel-hd">
        <div>
          <div className="brief-panel-eyebrow">Content brief</div>
          <h3 className="brief-panel-title">{tier.name} · ${tier.price.toLocaleString()}</h3>
        </div>
        <V3BriefStatusPill status={brief.status} />
      </div>

      <div className="brief-meta">
        <div className="brief-meta-row">
          <span className="brief-meta-lbl">Deadline</span>
          <span className="brief-meta-val">
            {brief.deadlineDays >= 0 ? `in ${brief.deadlineDays} day${brief.deadlineDays === 1 ? '' : 's'}` : `${Math.abs(brief.deadlineDays)}d past`}
          </span>
        </div>
        <div className="brief-meta-row">
          <span className="brief-meta-lbl">Window</span>
          <span className="brief-meta-val">{brief.postingWindow || '—'}</span>
        </div>
        {brief.approvedBy && (
          <div className="brief-meta-row">
            <span className="brief-meta-lbl">Approved</span>
            <span className="brief-meta-val">{brief.approvedBy} · {brief.approvedAt}</span>
          </div>
        )}
        {brief.draftedBy && !brief.approvedBy && (
          <div className="brief-meta-row">
            <span className="brief-meta-lbl">Drafted</span>
            <span className="brief-meta-val">{brief.draftedBy} · {brief.draftedAt}</span>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="brief-block">
        <div className="brief-block-lbl">Summary</div>
        <textarea className="brief-input brief-textarea" rows={2} value={brief.summary || ''}
                  onChange={e => updateBrief({ summary: e.target.value })}
                  disabled={isShipped}
                  placeholder="One-line angle for the campaign." />
      </div>

      {/* Must include / must avoid */}
      <div className="brief-twocol">
        <div className="brief-block">
          <div className="brief-block-lbl">Must include</div>
          <V3BriefChips items={brief.mustInclude || []} onChange={v => updateBrief({ mustInclude: v })} placeholder="Add item…" tone="good" disabled={isShipped} />
        </div>
        <div className="brief-block">
          <div className="brief-block-lbl">Must avoid</div>
          <V3BriefChips items={brief.mustAvoid || []} onChange={v => updateBrief({ mustAvoid: v })} placeholder="Add item…" tone="bad" disabled={isShipped} />
        </div>
      </div>

      {/* Notes */}
      <div className="brief-block">
        <div className="brief-block-lbl">Notes for Robert</div>
        <textarea className="brief-input brief-textarea" rows={2} value={brief.notes || ''}
                  onChange={e => updateBrief({ notes: e.target.value })}
                  disabled={isShipped}
                  placeholder="Anything tonal / context Robert needs." />
      </div>

      {/* Deliverables */}
      <div className="brief-block">
        <div className="brief-block-lbl brief-block-lbl-row">
          <span>Deliverables · {brief.deliverables.length}</span>
          {user === 'asher' && !isShipped && (
            <button className="btn btn-sm btn-ghost" onClick={aiDraft} disabled={drafting}>
              <V3Icon name="spark" w={12} /> {drafting ? 'Drafting…' : 'Draft with AI'}
            </button>
          )}
        </div>
        {draftError && <div className="brief-err">⚠ {draftError}</div>}
        <div className="brief-delivs">
          {brief.deliverables.map((d, i) => (
            <V3BriefDelivEditor key={d.id} deliv={d} idx={i} onChange={p => updateDeliv(i, p)} disabled={isShipped} />
          ))}
        </div>
      </div>

      {canApprove && (
        <div className="brief-approve-bar">
          <div>
            <strong>Send to Robert?</strong>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              Once approved, this becomes a task on Robert's Today tab.
            </div>
          </div>
          <button className="btn btn-good btn-approve" onClick={approve}>
            <V3Icon name="check" w={13} /> Approve & send to Robert
          </button>
        </div>
      )}
      {brief.status === 'ready' && (
        <div className="brief-approve-bar brief-approve-bar-ready">
          <div>
            <V3Icon name="check" w={13} /> <strong>Approved · ready for Robert</strong>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              {brief.deliverables.filter(d => d.status === 'shipped').length} of {brief.deliverables.length} shipped.
            </div>
          </div>
          {user === 'robert' && (
            <button className="btn btn-accent" onClick={() => window.dispatchEvent(new CustomEvent('v3:open-brief', { detail: { leadId: lead.id } }))}>
              Open & post →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Per-deliverable editor (used inside Asher's panel) ──────
function V3BriefDelivEditor({ deliv, idx, onChange, disabled }) {
  const { DELIV_TYPES } = window.V3;
  const meta = DELIV_TYPES[deliv.type] || { label: deliv.type, icon: 'doc', short: deliv.type.toUpperCase() };
  const [open, setOpen] = React.useState(idx === 0); // first one expanded by default

  return (
    <div className={'deliv deliv-' + deliv.type}>
      <header className="deliv-hd" onClick={() => setOpen(o => !o)}>
        <div className={'deliv-type tk-type tk-type-' + (deliv.type === 'linkedin' ? 'reply' : deliv.type === 'retweet' ? 'nudge' : deliv.type === 'newsletter' ? 'invoice' : 'rates')}>
          <V3Icon name={meta.icon} w={12} />
        </div>
        <div className="deliv-hd-text">
          <div className="deliv-title">{deliv.title}</div>
          <div className="deliv-sub">{meta.short}{deliv.status === 'shipped' ? ' · SHIPPED' : ''}</div>
        </div>
        <V3Icon name={open ? 'chev_d' : 'chev_r'} w={13} />
      </header>
      {open && (
        <div className="deliv-body">
          {deliv.type === 'retweet' && (
            <>
              <Field label="Source post URL">
                <input className="brief-input" value={deliv.sourceUrl || ''}
                       onChange={e => onChange({ sourceUrl: e.target.value })} disabled={disabled} />
              </Field>
              {deliv.sourcePreview && <div className="deliv-preview">{deliv.sourcePreview}</div>}
            </>
          )}
          {deliv.type === 'quote' && (
            <>
              <Field label="Source post URL">
                <input className="brief-input" value={deliv.sourceUrl || ''}
                       onChange={e => onChange({ sourceUrl: e.target.value })} disabled={disabled} />
              </Field>
              <Field label="Robert's quote (≤3 sentences)">
                <textarea className="brief-input brief-textarea" rows={3} value={deliv.quote || ''}
                          onChange={e => onChange({ quote: e.target.value })} disabled={disabled} />
              </Field>
            </>
          )}
          {(deliv.type === 'custom-x' || deliv.type === 'linkedin') && (
            <>
              {deliv.hook && (
                <Field label="Hook">
                  <input className="brief-input" value={deliv.hook}
                         onChange={e => onChange({ hook: e.target.value })} disabled={disabled} />
                </Field>
              )}
              {deliv.angle && (
                <Field label="Angle">
                  <input className="brief-input" value={deliv.angle}
                         onChange={e => onChange({ angle: e.target.value })} disabled={disabled} />
                </Field>
              )}
              {deliv.beats && (
                <Field label="Story beats">
                  <ol className="deliv-beats">
                    {deliv.beats.map((b, i) => (
                      <li key={i}>
                        <input className="brief-input" value={b} disabled={disabled}
                               onChange={e => {
                                 const next = [...deliv.beats]; next[i] = e.target.value;
                                 onChange({ beats: next });
                               }} />
                      </li>
                    ))}
                  </ol>
                </Field>
              )}
              <Field label={"Draft text · " + (deliv.draftText ? deliv.draftText.length : 0) + " chars"}>
                <textarea className="brief-input brief-textarea" rows={6} value={deliv.draftText || ''}
                          onChange={e => onChange({ draftText: e.target.value })}
                          disabled={disabled}
                          placeholder="Paste or write the post copy here. AI can pre-fill." />
              </Field>
            </>
          )}
          {deliv.type === 'thread' && (
            <Field label="Thread posts">
              <textarea className="brief-input brief-textarea" rows={8} value={deliv.draftText || ''}
                        onChange={e => onChange({ draftText: e.target.value })} disabled={disabled}
                        placeholder="Each post separated by a blank line." />
            </Field>
          )}
          {deliv.type === 'newsletter' && (
            <>
              <Field label="Slot">
                <input className="brief-input" value={deliv.slot || ''}
                       onChange={e => onChange({ slot: e.target.value })} disabled={disabled} />
              </Field>
              <Field label="Blurb">
                <textarea className="brief-input brief-textarea" rows={3} value={deliv.blurb || ''}
                          onChange={e => onChange({ blurb: e.target.value })} disabled={disabled} />
              </Field>
              <Field label="CTA URL">
                <input className="brief-input" value={deliv.ctaUrl || ''}
                       onChange={e => onChange({ ctaUrl: e.target.value })} disabled={disabled} />
              </Field>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="field">
      <div className="field-lbl">{label}</div>
      {children}
    </div>
  );
}

function V3BriefChips({ items, onChange, placeholder, tone, disabled }) {
  const [draft, setDraft] = React.useState('');
  const add = () => {
    if (!draft.trim()) return;
    onChange([...items, draft.trim()]);
    setDraft('');
  };
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i));
  return (
    <div className={'chip-set chip-set-' + (tone || 'neutral')}>
      {items.map((c, i) => (
        <span key={i} className="chip">
          {c}
          {!disabled && <button className="chip-x" onClick={() => remove(i)}>×</button>}
        </span>
      ))}
      {!disabled && (
        <input className="chip-input" placeholder={placeholder} value={draft}
               onChange={e => setDraft(e.target.value)}
               onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
               onBlur={add} />
      )}
    </div>
  );
}

// ─── Robert's BRIEF VIEWER MODAL ──────────────────────────────
// Fullscreen-style execution view. Shows each deliverable as a card with
// "Copy text" and "Mark posted" buttons; once all deliverables shipped,
// advances the deal to invoice-sent.
function V3BriefViewer({ lead, user, onClose, onAllShipped }) {
  const { TIERS, DELIV_TYPES, BRIEF_STATUSES } = window.V3;
  const [brief, setBrief] = React.useState(lead.brief);
  if (!brief) return null;
  const tier = TIERS[brief.tier];

  const updateDeliv = (i, patch) => {
    const next = brief.deliverables.map((d, idx) => idx === i ? { ...d, ...patch } : d);
    const allShipped = next.every(d => d.status === 'shipped' || d.type === 'newsletter');
    const newStatus = allShipped ? 'shipped' : (next.some(d => d.status === 'shipped') ? 'in-production' : brief.status);
    const nextBrief = { ...brief, deliverables: next, status: newStatus };
    setBrief(nextBrief);
    lead.brief = nextBrief;
    if (allShipped && onAllShipped) onAllShipped();
  };

  const shippedCount = brief.deliverables.filter(d => d.status === 'shipped').length;
  const total = brief.deliverables.length;

  return (
    <div className="brief-modal-back" onClick={onClose}>
      <div className="brief-modal" onClick={e => e.stopPropagation()}>
        <header className="brief-modal-hd">
          <div className="brief-modal-hd-left">
            <button className="hd-icon-btn" onClick={onClose} aria-label="Close"><V3Icon name="x" /></button>
            <div>
              <div className="brief-modal-eyebrow">
                {lead.brand} · {tier.name} · ${tier.price.toLocaleString()}
              </div>
              <h2 className="brief-modal-title">{lead.brand} brief</h2>
            </div>
          </div>
          <div className="brief-modal-hd-right">
            <div className="brief-modal-progress">
              <div className="brief-modal-progress-bar">
                <div className="brief-modal-progress-fill" style={{ width: (shippedCount / total * 100) + '%' }}></div>
              </div>
              <div className="brief-modal-progress-text">{shippedCount} / {total} shipped</div>
            </div>
            <V3BriefStatusPill status={brief.status} />
          </div>
        </header>

        <div className="brief-modal-body">
          {/* Summary card */}
          <section className="brief-card brief-card-summary">
            <div className="brief-card-row">
              <div>
                <div className="brief-card-lbl">Deadline</div>
                <div className="brief-card-val">
                  {brief.deadlineDays >= 0
                    ? <><strong>{brief.deadlineDays === 0 ? 'Today' : brief.deadlineDays + ' day' + (brief.deadlineDays === 1 ? '' : 's')}</strong> · {brief.postingWindow}</>
                    : <strong style={{ color: 'var(--bad)' }}>{Math.abs(brief.deadlineDays)} days past · {brief.postingWindow}</strong>}
                </div>
              </div>
              <div>
                <div className="brief-card-lbl">Approved by</div>
                <div className="brief-card-val">{brief.approvedBy || '—'} · {brief.approvedAt || ''}</div>
              </div>
            </div>
            {brief.summary && (
              <div className="brief-card-summary-body">
                <div className="brief-card-lbl">Angle</div>
                <p>{brief.summary}</p>
              </div>
            )}
            {brief.notes && (
              <div className="brief-card-notes">
                <V3Icon name="bolt" w={13} /> {brief.notes}
              </div>
            )}
            <div className="brief-card-rules">
              {brief.mustInclude?.length > 0 && (
                <div>
                  <div className="brief-card-rules-lbl rules-good">Must include</div>
                  <div className="chip-set chip-set-good">
                    {brief.mustInclude.map((c, i) => <span key={i} className="chip">{c}</span>)}
                  </div>
                </div>
              )}
              {brief.mustAvoid?.length > 0 && (
                <div>
                  <div className="brief-card-rules-lbl rules-bad">Must avoid</div>
                  <div className="chip-set chip-set-bad">
                    {brief.mustAvoid.map((c, i) => <span key={i} className="chip">{c}</span>)}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Deliverable cards */}
          {brief.deliverables.map((d, i) => (
            <V3BriefDelivCard key={d.id} deliv={d} idx={i}
                              brand={lead.brand}
                              canShip={user === 'robert' && brief.status === 'ready' || brief.status === 'in-production'}
                              onShip={url => updateDeliv(i, { status: 'shipped', postedAt: 'just now', postedUrl: url || d.postedUrl })}
                              onUnship={() => updateDeliv(i, { status: 'ready', postedAt: null, postedUrl: null })} />
          ))}
        </div>
      </div>
    </div>
  );
}

function V3BriefDelivCard({ deliv, idx, brand, canShip, onShip, onUnship }) {
  const { DELIV_TYPES } = window.V3;
  const meta = DELIV_TYPES[deliv.type] || { label: deliv.type, icon: 'doc' };
  const [copied, setCopied] = React.useState(false);
  const [postedUrl, setPostedUrl] = React.useState('');

  const isShipped = deliv.status === 'shipped';
  const hasCopyable = deliv.draftText || deliv.quote || deliv.blurb;
  const copyText = deliv.draftText || deliv.quote || deliv.blurb || '';

  const doCopy = async () => {
    try { await navigator.clipboard.writeText(copyText); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch {}
  };
  const doShip = () => onShip(postedUrl || null);

  const platform = ({ 'custom-x': 'x.com', 'thread': 'x.com', 'quote': 'x.com', 'retweet': 'x.com', 'linkedin': 'linkedin.com', 'newsletter': 'newsletter' })[deliv.type];

  return (
    <section className={'brief-card brief-deliv-card' + (isShipped ? ' is-shipped' : '')}>
      <header className="brief-deliv-hd">
        <div className={'deliv-num'}>0{idx + 1}</div>
        <div className={'deliv-type tk-type tk-type-' + (deliv.type === 'linkedin' ? 'reply' : deliv.type === 'retweet' ? 'nudge' : deliv.type === 'newsletter' ? 'invoice' : 'rates')}>
          <V3Icon name={meta.icon} w={14} />
        </div>
        <div className="brief-deliv-hd-text">
          <h3 className="brief-deliv-title">{deliv.title}</h3>
          <div className="brief-deliv-sub">{meta.label} · {platform}</div>
        </div>
        {isShipped
          ? <span className="brief-deliv-status shipped"><V3Icon name="check" w={12} /> Shipped {deliv.postedAt || ''}</span>
          : <span className="brief-deliv-status ready">Ready to post</span>}
      </header>

      <div className="brief-deliv-body">
        {/* Source URL for retweets/quotes */}
        {(deliv.type === 'retweet' || deliv.type === 'quote') && deliv.sourceUrl && (
          <div className="brief-deliv-source">
            <div className="brief-card-lbl">Retweet / quote this post</div>
            <div className="brief-deliv-url-row">
              <a className="brief-deliv-url" href={deliv.sourceUrl} target="_blank" rel="noreferrer">{deliv.sourceUrl}</a>
              <button className="btn btn-sm" onClick={() => navigator.clipboard.writeText(deliv.sourceUrl)}>Copy URL</button>
            </div>
            {deliv.sourcePreview && <div className="deliv-preview">{deliv.sourcePreview}</div>}
          </div>
        )}

        {/* Hook + beats for custom posts */}
        {(deliv.hook || deliv.angle) && (
          <div className="brief-deliv-hook">
            <div className="brief-card-lbl">{deliv.hook ? 'Hook' : 'Angle'}</div>
            <p>{deliv.hook || deliv.angle}</p>
          </div>
        )}

        {deliv.beats && deliv.beats.length > 0 && (
          <div className="brief-deliv-beats">
            <div className="brief-card-lbl">Story beats</div>
            <ol>{deliv.beats.map((b, i) => <li key={i}>{b}</li>)}</ol>
          </div>
        )}

        {/* The actual copy-pastable text */}
        {hasCopyable && (
          <div className="brief-deliv-copy">
            <div className="brief-deliv-copy-hd">
              <div className="brief-card-lbl">Post text · {copyText.length} chars</div>
              <button className="btn btn-sm btn-primary" onClick={doCopy}>
                <V3Icon name={copied ? 'check' : 'doc'} w={12} /> {copied ? 'Copied!' : 'Copy text'}
              </button>
            </div>
            <pre className="brief-deliv-text">{copyText}</pre>
          </div>
        )}

        {/* Quote-specific: source post + custom quote */}
        {deliv.type === 'quote' && deliv.quote && (
          <div className="brief-deliv-copy">
            <div className="brief-deliv-copy-hd">
              <div className="brief-card-lbl">Your quote</div>
              <button className="btn btn-sm btn-primary" onClick={() => navigator.clipboard.writeText(deliv.quote)}>
                <V3Icon name="doc" w={12} /> Copy quote
              </button>
            </div>
            <pre className="brief-deliv-text">{deliv.quote}</pre>
          </div>
        )}

        {/* Newsletter — typically not Robert's job */}
        {deliv.type === 'newsletter' && (
          <div className="brief-deliv-newsletter">
            <div className="brief-card-lbl">Newsletter slot</div>
            <p><strong>{deliv.slot}</strong> — {deliv.scheduledFor}</p>
            <div className="brief-deliv-newsletter-note">
              <V3Icon name="bolt" w={12} /> Newsletter inclusion is handled by Asher. Confirmed slot.
            </div>
          </div>
        )}

        {/* Ship controls */}
        {canShip && !isShipped && deliv.type !== 'newsletter' && (
          <div className="brief-deliv-ship">
            <input className="brief-input brief-deliv-url-input"
                   placeholder="Posted URL (optional) — paste once live"
                   value={postedUrl}
                   onChange={e => setPostedUrl(e.target.value)} />
            <button className="btn btn-good btn-ship" onClick={doShip}>
              <V3Icon name="check" w={13} /> Mark posted
            </button>
          </div>
        )}

        {isShipped && deliv.postedUrl && (
          <div className="brief-deliv-shipped">
            <V3Icon name="check" w={12} />
            <a href={deliv.postedUrl} target="_blank" rel="noreferrer">{deliv.postedUrl}</a>
            <button className="btn btn-sm btn-ghost" onClick={onUnship}>Undo</button>
          </div>
        )}
        {isShipped && !deliv.postedUrl && (
          <div className="brief-deliv-shipped">
            <V3Icon name="check" w={12} /> <span>Marked shipped {deliv.postedAt || ''}</span>
            <button className="btn btn-sm btn-ghost" onClick={onUnship}>Undo</button>
          </div>
        )}
      </div>
    </section>
  );
}

Object.assign(window, { V3BriefPanel, V3BriefViewer, V3BriefStatusPill });


// FLOW v3 — Detail drawer (right slide-in)

function V3DrawerQueue({ queue, currentId, onNavigate }) {
  const currentRef = React.useRef(null);
  React.useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest' });
  }, [currentId]);
  const replyNow = queue.filter(l => l.unread);
  const followUps = queue.filter(l => !l.unread);
  const renderItem = (l) => {
    const isCurrent = String(l.id) === String(currentId);
    return (
      <button
        key={l.id}
        ref={isCurrent ? currentRef : null}
        type="button"
        className={'dq-item' + (isCurrent ? ' is-current' : '')}
        onClick={() => onNavigate(l.id)}
      >
        <span className="dq-item-top">
          {l.unread && <span className="dq-dot" />}
          <span className="dq-brand">{l.brand}</span>
          <span className={'dq-age' + ((l.daysInStage || 0) >= 10 ? ' is-late' : '')}>{l.daysInStage || 0}d</span>
        </span>
        <span className="dq-move">{l.nextMove?.text || l.contactName}</span>
      </button>
    );
  };
  return (
    <nav className="drawer-queue" aria-label="Lead queue">
      {replyNow.length > 0 && (
        <div className="dq-subhead is-hot"><span>Reply now</span><span>{replyNow.length}</span></div>
      )}
      {replyNow.map(renderItem)}
      {followUps.length > 0 && (
        <div className="dq-subhead"><span>Follow ups</span><span>{followUps.length}</span></div>
      )}
      {followUps.map(renderItem)}
      {queue.length === 0 && <div className="dq-empty">Queue is clear.</div>}
      <div className="dq-hints">
        <span><kbd>J</kbd><kbd>K</kbd> move</span>
        <span><kbd>R</kbd> reply</span>
        <span><kbd>E</kbd> archive</span>
        <span><kbd>Esc</kbd> close</span>
      </div>
    </nav>
  );
}

function V3Drawer({ lead, user, queue = [], onNavigate, onClose }) {
  const { STAGE_BY_ID, USERS, ACTIVE_STAGE_IDS } = window.V3;
  // Open straight to the Brief tab when there's something requiring action,
  // otherwise lead with the real conversation
  const pickInitialTab = (l) => (l?.brief && (
    (user === 'asher' && l.brief.status === 'awaiting-approval') ||
    (user === 'robert' && l.brief.status === 'ready')
  )) ? 'brief' : 'thread';
  const [tab, setTab] = React.useState(() => pickInitialTab(lead));
  // Keep reading/triage first; reply is one click or R away.
  const [composeOpen, setComposeOpen] = React.useState(false);
  // Reset to the right defaults whenever the drawer switches to a different lead.
  React.useEffect(() => {
    setTab(pickInitialTab(lead));
    setComposeOpen(false);
  }, [lead?.id]);

  const queueIndex = queue.findIndex(l => String(l.id) === String(lead?.id));
  const goTo = React.useCallback((delta) => {
    if (!queue.length || !onNavigate) return;
    const idx = queue.findIndex(l => String(l.id) === String(lead?.id));
    const next = idx === -1 ? queue[0] : queue[Math.min(queue.length - 1, Math.max(0, idx + delta))];
    if (next && String(next.id) !== String(lead?.id)) onNavigate(next.id);
  }, [queue, lead?.id, onNavigate]);

  // E — archive the thread and advance, Superhuman style. The queue
  // recomputes from the leads-loaded event MoveLeadStage fires.
  const archiveAndAdvance = React.useCallback(() => {
    if (!lead) return;
    const idx = queue.findIndex(l => String(l.id) === String(lead.id));
    const next = idx === -1 ? queue[0] : (queue[idx + 1] || queue[idx - 1]);
    window.V3.MoveLeadStage(lead, 'trash');
    if (next && String(next.id) !== String(lead.id) && onNavigate) onNavigate(next.id);
    else onClose?.();
  }, [lead, queue, onNavigate, onClose]);

  // Superhuman keys: J/K walk the queue, R replies, E archives, Esc backs out.
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (composeOpen) setComposeOpen(false);
        else onClose?.();
        return;
      }
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'j' || e.key === 'J' || e.key === 'ArrowDown') { e.preventDefault(); goTo(1); }
      if (e.key === 'k' || e.key === 'K' || e.key === 'ArrowUp')   { e.preventDefault(); goTo(-1); }
      if (e.key === 'r' || e.key === 'R') { e.preventDefault(); setComposeOpen(true); }
      if (e.key === 'e' || e.key === 'E') { e.preventDefault(); archiveAndAdvance(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goTo, onClose, composeOpen, archiveAndAdvance]);

  if (!lead) return null;
  const stage = STAGE_BY_ID[lead.stage];
  const owner = lead.ownerId ? USERS[lead.ownerId] : null;
  const nextOwner = lead.nextMove.who ? USERS[lead.nextMove.who] : null;
  const isMine = window.V3.MoveIsMineForProfile(lead, user);
  const isThem = !lead.nextMove.who && !['paid-out'].includes(lead.stage);
  const replyAction = ['Reply', 'Send', 'Nudge'].includes(lead.nextMove.action);

  return (
    <>
      <div className="backdrop show" onClick={onClose} />
      <aside className={'drawer' + (queue.length ? ' drawer-split' : '')}>
        {queue.length > 0 && (
          <V3DrawerQueue queue={queue} currentId={lead.id} onNavigate={onNavigate} />
        )}
        <div className="drawer-main">
        <div className="drawer-hd">
          <button className="hd-icon-btn" onClick={onClose} aria-label="Close">
            <V3Icon name="x" w={15} />
          </button>
          <span className="drawer-hd-brand">{lead.brand}</span>
          {queue.length > 0 && (
            <span className="drawer-hd-nav">
              <span className="drawer-hd-pos">{queueIndex === -1 ? '—' : (queueIndex + 1) + ' of ' + queue.length}</span>
              <button className="hd-icon-btn" onClick={() => goTo(-1)} disabled={queueIndex <= 0} aria-label="Previous lead" title="Previous (K)">
                <V3Icon name="chev_d" w={13} style={{ transform: 'rotate(180deg)' }} />
              </button>
              <button className="hd-icon-btn" onClick={() => goTo(1)} disabled={queueIndex !== -1 && queueIndex >= queue.length - 1} aria-label="Next lead" title="Next (J)">
                <V3Icon name="chev_d" w={13} />
              </button>
            </span>
          )}
          <span className="drawer-hd-stage" style={{ color: stage.color }}>
            <span className="drawer-hd-stage-dot" style={{ background: stage.color }}></span>
            {stage.name}
          </span>
        </div>

        <div className="drawer-top">
          <V3Avatar name={lead.contactName} color={lead.color} size="lg" />
          <div className="drawer-top-text">
            {lead.category && <span className={'cat-tab cat-' + lead.category} style={{ marginBottom: 6 }}>{lead.category}</span>}
            <h2 className="drawer-top-name">{lead.contactName}</h2>
            <div className="drawer-top-co">
              {lead.contactRole} at <strong>{lead.brand}</strong>
            </div>
          </div>
        </div>

        {/* Next move banner */}
        <div className={'next-move ' + (isMine ? '' : 'them')}>
          <div className="next-move-icon">
            <V3Icon name={isMine
              ? (lead.nextMove.action === 'Post' ? 'video' : lead.nextMove.action === 'Send' ? 'send' : lead.nextMove.action === 'Invoice' ? 'invoice' : lead.nextMove.action === 'Nudge' ? 'bell' : 'reply')
              : 'clock'} w={18} />
          </div>
          <div className="next-move-text">
            <div className="next-move-eyebrow">
              Next move {isMine ? '· yours' : isThem ? `· waiting on ${lead.contactName.split(' ')[0]}` : nextOwner ? `· ${nextOwner.name}'s` : ''}
            </div>
            <div className="next-move-title">{lead.nextMove.text}</div>
          </div>
          {isMine && replyAction && (
            <div className="next-move-actions">
              <button className="btn btn-sm btn-accent" onClick={() => setComposeOpen(true)}>
                <V3Icon name="arrow_r" w={13} />
                {lead.nextMove.action}
              </button>
            </div>
          )}
        </div>

        {/* Key facts — one compact strip instead of a six-row grid */}
        <div className="drawer-facts">
          {lead.value ? <span className="drawer-fact mono">{v3Money(lead.value)}</span> : null}
          {owner && (
            <span className="drawer-fact">
              <V3Avatar name={owner.name} color={owner.color} size="xs" /> {owner.name}
            </span>
          )}
          <span className="drawer-fact mono">{lead.daysInStage}d in stage</span>
          <span className="drawer-fact">{lead.source}</span>
          {lead.deliverables ? <span className="drawer-fact drawer-fact-wide" title={lead.deliverables}>{lead.deliverables}</span> : null}
        </div>

        {/* Tabs */}
        <div className="drawer-tabs">
          <button className="dr-tab" aria-selected={tab === 'thread'} onClick={() => setTab('thread')}>
            Email thread <span className="cnt">{lead.thread.length}</span>
          </button>
          {lead.brief && (
            <button className="dr-tab" aria-selected={tab === 'brief'} onClick={() => setTab('brief')}>
              Brief
              {lead.brief.status === 'awaiting-approval' && user === 'asher' && (
                <span className="dr-tab-dot" title="Awaiting your approval"></span>
              )}
            </button>
          )}
          <button className="dr-tab" aria-selected={tab === 'stands'} onClick={() => setTab('stands')}>
            Where this stands
          </button>
        </div>

        {/* Body */}
        <div className="drawer-body">
          {tab === 'stands' && <V3Stands lead={lead} />}
          {tab === 'brief' && lead.brief && <V3BriefPanel lead={lead} user={user} />}
          {tab === 'thread' && <V3Thread lead={lead} />}
        </div>

        <div className="drawer-foot">
          {composeOpen ? (
            <V3InlineReply lead={lead} user={user} onCollapse={() => setComposeOpen(false)} />
          ) : (
            <button className="drawer-reply-bar" onClick={() => setComposeOpen(true)}>
              <V3Icon name="reply" w={14} />
              <span>Reply to {lead.contactName.split(' ')[0]}{lead.draftReply ? ' — draft ready' : ''}</span>
              <V3Icon name="chev_d" w={12} style={{ transform: 'rotate(180deg)' }} />
            </button>
          )}
        </div>
        </div>
      </aside>
    </>
  );
}

function V3InlineReply({ lead, user, onCollapse }) {
  const defaultSender = React.useMemo(() => {
    if (V4LeadSupportsRobertHandoff(lead) && String(lead?.draftReplyStatus || '').toLowerCase() === 'pending') return 'robert';
    return V3SenderForUser(user);
  }, [lead?.id, lead?.draftReplyStatus, user]);
  const [sender, setSender] = React.useState(() => defaultSender);
  const [internalOnly, setInternalOnly] = React.useState(false);
  const draft = React.useMemo(() => V3ComposeReplyDraft(lead, sender), [lead.id, lead.draftReply?.body, lead.draftReply?.subject, lead.thread.length, lead.lastTouchAt, sender]);
  const initialRecipients = React.useMemo(() => V3ReplyRecipients(lead, sender, internalOnly), [lead.id, sender, internalOnly]);
  const [to, setTo] = React.useState(initialRecipients.to);
  const [cc, setCc] = React.useState(initialRecipients.cc);
  const [toDraft, setToDraft] = React.useState('');
  const [ccDraft, setCcDraft] = React.useState('');
  const [body, setBody] = React.useState(draft.body);
  const [attachPdf, setAttachPdf] = React.useState(false);
  const [status, setStatus] = React.useState('draft');
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState('');
  const successTimer = React.useRef(null);
  const subject = V3SubjectForLead(lead);
  const toLine = to.join(',');
  const ccLine = cc.join(',');
  const isSelfRecipient = V3IsSelfRecipient(sender, toLine);

  const clearSuccessTimer = () => {
    if (successTimer.current) {
      clearTimeout(successTimer.current);
      successTimer.current = null;
    }
  };

  const showSuccess = (message) => {
    clearSuccessTimer();
    setSuccess(message);
    successTimer.current = setTimeout(() => {
      setSuccess('');
      setStatus('draft');
      successTimer.current = null;
    }, 2500);
  };

  React.useEffect(() => {
    const nextSender = V4LeadSupportsRobertHandoff(lead) && String(lead?.draftReplyStatus || '').toLowerCase() === 'pending'
      ? 'robert'
      : V3SenderForUser(user);
    const next = V3ReplyRecipients(lead, nextSender, false);
    const nextDraft = V3ComposeReplyDraft(lead, nextSender);
    setSender(nextSender);
    setInternalOnly(false);
    setTo(next.to);
    setCc(next.cc);
    setToDraft('');
    setCcDraft('');
    setBody(nextDraft.body);
    setAttachPdf(false);
    setStatus('draft');
    setError('');
    setSuccess('');
    clearSuccessTimer();
  }, [lead.id, lead.draftReply?.body, lead.draftReply?.subject, lead.thread.length, lead.lastTouchAt, user]);

  React.useEffect(() => {
    const next = V3ReplyRecipients(lead, sender, internalOnly);
    const nextDraft = V3ComposeReplyDraft(lead, sender);
    setTo(next.to);
    setCc(next.cc);
    setToDraft('');
    setCcDraft('');
    setBody(nextDraft.body);
    setError('');
    setSuccess('');
  }, [sender, internalOnly, lead.id, lead.draftReply?.body, lead.draftReply?.subject, lead.thread.length, lead.lastTouchAt]);

  React.useEffect(() => () => clearSuccessTimer(), []);

  const addRecipients = (field, value) => {
    const emails = V3SplitEmails(value);
    if (!emails.length) return;
    if (field === 'to') setTo(list => V3UniqueEmails([...list, ...emails]));
    if (field === 'cc') setCc(list => V3UniqueEmails([...list, ...emails]));
    if (field === 'to') setToDraft('');
    if (field === 'cc') setCcDraft('');
    if (error) setError('');
  };

  const removeRecipient = (field, email) => {
    if (field === 'to') setTo(list => list.filter(item => item !== email));
    if (field === 'cc') setCc(list => list.filter(item => item !== email));
    if (error) setError('');
  };

  const RecipientChips = ({ label, list, field, draft, setDraft }) => (
    <div className="mail-compose-recips">
      <span className="mail-compose-recips-label">{label}</span>
      <div className="mail-compose-recips-list">
        {list.length ? list.map(email => (
          <span key={field + email} className="mail-compose-chip">
            <span>{email}</span>
            <button type="button" disabled={status === 'sending'} onClick={() => removeRecipient(field, email)} aria-label={'Remove ' + email} title={'Remove ' + email}>
              <V3Icon name="x" w={11} />
            </button>
          </span>
        )) : (
          <span className="mail-compose-empty-recips">{field === 'to' ? 'No recipients selected' : 'No CCs'}</span>
        )}
        <input
          value={draft}
          disabled={status === 'sending'}
          onChange={e => setDraft(e.target.value)}
          onBlur={e => addRecipients(field, e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ',' || e.key === ';') {
              e.preventDefault();
              addRecipients(field, e.currentTarget.value);
            }
          }}
          placeholder={field === 'to' ? 'Add recipient' : 'Add cc'}
          className="mail-compose-recips-input"
        />
      </div>
    </div>
  );

  const send = async () => {
    const msg = V3EnsureSenderSignature(body.trim(), sender);
    const recipient = toLine.trim();
    if (!recipient || !msg) {
      setError(!to.length ? 'Add the outside lead email above, or choose Talk internally.' : 'Write a reply before sending.');
      return;
    }
    if (isSelfRecipient) {
      setError(V3SenderName(sender) + ' is also a recipient. Remove them before sending.');
      return;
    }
    setStatus('sending');
    setError('');
    try {
      if (sender === 'robert' && V4LeadSupportsRobertHandoff(lead) && String(lead?.draftReplyStatus || '').toLowerCase() === 'pending') {
        await V4SendRobertHandoffDraft(lead, { subject, body: msg, to_emails: to, cc_emails: cc });
      } else {
        await V3SendLeadEmail({ lead, sender, to: recipient, cc: ccLine, subject, body: msg, attachPdf });
      }
      fetch(V3_SUPABASE_URL + '/rest/v1/cards?id=eq.' + encodeURIComponent(lead.id), {
        method: 'PATCH',
        headers: {
          apikey: V3_SUPABASE_ANON_KEY,
          Authorization: 'Bearer ' + V3_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ draft_reply_status: 'sent', new_reply_at: null }),
      }).catch(err => console.warn('[ALIGNED v4] card status update failed:', err));
      window.dispatchEvent(new CustomEvent('v3:email-sent', { detail: { leadId: lead.id, sender, subject, body: msg, to: to.slice(), cc: cc.slice(), internalOnly } }));
      setBody('');
      setError('');
      setStatus('sent');
      showSuccess(`Sent to ${recipient}${ccLine ? ' · CC ' + ccLine : ''}`);
    } catch (err) {
      clearSuccessTimer();
      setStatus('error');
      setError(err.message || 'Send failed');
    }
  };

  return (
    <div className="mail-compose">
      <div className="mail-compose-topbar">
        <select className="mail-compose-sender" value={sender} disabled={status === 'sending'} onChange={e => setSender(e.target.value)} title="Sender">
          <option value="robert">Robert Scoble</option>
          <option value="sam">Sam Levin / UnalignedX</option>
          <option value="asher">Asher</option>
        </select>
        <button className={'mail-compose-mode ' + (internalOnly ? 'is-active' : '')} type="button" disabled={status === 'sending'} onClick={() => setInternalOnly(value => !value)} title="Send only to Robert, Sam, and Asher">
          <V3Icon name="mail" w={12} /> {internalOnly ? 'Internal email chain' : 'Talk internally'}
        </button>
        {onCollapse && (
          <button className="mail-compose-collapse" type="button" onClick={onCollapse} title="Hide composer" aria-label="Hide composer">
            <V3Icon name="chev_d" w={12} />
          </button>
        )}
      </div>
      <RecipientChips label="To" list={to} field="to" draft={toDraft} setDraft={setToDraft} />
      {!internalOnly && <RecipientChips label="Cc" list={cc} field="cc" draft={ccDraft} setDraft={setCcDraft} />}
      <div className="mail-compose-subject-row">
        <span>Subject</span>
        <input value={subject} readOnly disabled title="Subject" />
      </div>
      <div className="mail-compose-editor">
        <textarea
          value={body}
          disabled={status === 'sending'}
          onChange={e => setBody(e.target.value)}
          placeholder={`Reply to ${lead.contactName.split(' ')[0]}...`}
        />
      </div>
      <label className="mail-compose-attach">
        <input
          type="checkbox"
          checked={attachPdf}
          disabled={status === 'sending'}
          onChange={e => setAttachPdf(e.target.checked)}
        />
        Attach SINGLE TIER.pdf
      </label>
      <div className="mail-compose-footer">
        <div className={'mail-compose-status ' + (success ? 'is-success' : error || isSelfRecipient ? 'is-error' : '')}>
          {success || error || (isSelfRecipient ? `${V3SenderName(sender)} is also a recipient. Remove them before sending.` : status === 'sent' ? 'Sent.' : `Lead chain · sending as ${V3SenderName(sender)}${lead.gmailThreadId && sender === 'robert' ? ' in the Gmail thread' : ''}`)}
        </div>
        <button
          className={'mail-compose-send ' + (status === 'sent' ? 'is-sent' : '')}
          onClick={send}
          disabled={status === 'sending'}
          aria-live="polite"
        >
          <V3Icon name={status === 'sent' ? 'check' : 'send'} w={12} /> {status === 'sending' ? 'Sending…' : status === 'sent' ? 'Sent' : (sender === 'robert' && V4LeadSupportsRobertHandoff(lead) && String(lead?.draftReplyStatus || '').toLowerCase() === 'pending' ? 'Approve & send' : 'Send')}
        </button>
      </div>
    </div>
  );
}

function V3Stands({ lead }) {
  return (
    <>
      <div className="standstrip-hd">
        <div className="standstrip-title">Where this stands</div>
        <span className="standstrip-pulse">Step {lead.progress + 1} of {window.V3.ACTIVE_STAGE_IDS.length}</span>
      </div>

      <div className="steplist">
        {lead.timeline.map((step, i) => (
          <div key={i} className={'step ' + step.status}>
            <div className="step-dot">
              {step.status === 'done' && <V3Icon name="check" w={11} />}
              {step.status === 'current' && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'white' }}></span>}
            </div>
            <div>
              <div className="step-title">{step.name}</div>
              {step.note && <div className="step-meta">{step.note}</div>}
            </div>
            <div className="step-time">{step.when}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function V3Thread({ lead }) {
  const messages = React.useMemo(() => {
    const source = Array.isArray(lead?.thread) ? lead.thread : [];
    return [...source].sort((a, b) =>
      V3TimestampForUi(a.date || a.dateIso || a.timestamp || a.when) -
      V3TimestampForUi(b.date || b.dateIso || b.timestamp || b.when)
    );
  }, [lead?.id, lead?.thread]);
  return (
    <div className="act">
      <div className="act-thread-meta">
        <span>{messages.length} email{messages.length === 1 ? '' : 's'}</span>
        {lead.gmailThreadId && <span>Gmail thread {String(lead.gmailThreadId).slice(-8)}</span>}
        {messages[0] && <span>Started {window.V3.GmailTime.full(messages[0].date || messages[0].when) || messages[0].when}</span>}
      </div>
      {messages.map((m, i) => {
        const senderEmail = V3ExtractEmail(m.from) ||
          (m.from === 'Asher' ? 'asherunaligned@gmail.com' :
           m.from === 'Sammy' ? 'unalignedx@gmail.com' :
           m.from === 'Robert' ? 'scobleizer@gmail.com' : '');
        const dateValue = m.date || m.dateIso || m.timestamp || m.when;
        return (
          <div key={i} className="act-item">
            <div className="act-item-hd">
              <V3Avatar name={m.from} color={m.from === 'Sammy' ? '#16894a' : m.from === 'Asher' ? '#2f5fd6' : lead.color} size="xs" />
              <div className="act-item-sender">
                <div className="act-item-from-row">
                  <span className="from">{m.from || 'Unknown sender'}</span>
                  {senderEmail && <span className="from-email">&lt;{senderEmail}&gt;</span>}
                  {m.pending && <span className="act-item-pending">Pending sync</span>}
                </div>
                {m.subject && <div className="act-item-subject">{m.subject}</div>}
                {(m.to?.length || m.cc?.length || m.replyTo?.length) ? (
                  <div className="act-item-participants">
                    {m.to?.length ? <span><strong>To:</strong> {m.to.join(', ')}</span> : null}
                    {m.cc?.length ? <span><strong>Cc:</strong> {m.cc.join(', ')}</span> : null}
                    {m.replyTo?.length ? <span><strong>Reply-To:</strong> {m.replyTo.join(', ')}</span> : null}
                  </div>
                ) : null}
              </div>
              <div className="act-item-time-wrap">
                <span className="time" title={window.V3.GmailTime.tooltip(dateValue) || undefined}>
                  {window.V3.GmailTime.full(dateValue) || m.when || ''}
                </span>
                {window.V3.GmailTime.relative(dateValue) && <span className="time-rel">{window.V3.GmailTime.relative(dateValue)}</span>}
              </div>
            </div>
            <div className="act-item-body">{m.body}</div>
          </div>
        );
      })}
    </div>
  );
}

Object.assign(window, { V3Drawer });


// FLOW v4 — Today / Inbox / Leads views
// Today rebuilt as a tabbed work surface: NOW · NEXT · LATER · DONE.
// NOW = big action cards. NEXT/LATER = compact rows.

const V4_ROBERT_BRIEF_STORAGE_KEY = 'v4-robert-brief-complete';
const V4_ROBERT_BRIEF_TO = 'asherunaligned@gmail.com';

function V4RobertBriefReplyDraft(brief) {
  const first = 'Asher';
  const title = String(brief?.title || 'the brief');
  return [
    `Hi ${first},`,
    '',
    `Can you send a little more information on ${title}?`,
    '',
    'Specifically, I’d love:',
    '• the final posting direction',
    '• any hard do / do not notes',
    '• whether anything needs to be approved before I move',
    '',
    'Thanks,',
  ].join('\n');
}

function V4LeadToRobertBrief(lead) {
  if (!lead) return null;
  return {
    id: lead.briefId || lead.id,
    title: lead.briefTitle || lead.title || 'Robert brief',
    subtitle: lead.briefSubtitle || lead.subtitle || '',
    subject: lead.briefSubject || lead.subject || '',
    gmailThreadId: lead.gmailThreadId || lead.briefThreadId || '',
    sentAt: lead.briefSentAt || lead.sentAt || lead.date_received_iso || lead.lastTouchAt || '',
    from: lead.briefFrom || lead.from || '',
    to: Array.isArray(lead.briefTo) ? lead.briefTo : [],
    cc: Array.isArray(lead.briefCc) ? lead.briefCc : [],
    status: lead.briefStatus || lead.status || 'ready',
    partner: lead.briefPartner || lead.partner || lead.contactName || '',
    company: lead.briefCompany || lead.company || lead.brand || '',
    summary: lead.briefSummary || lead.summary || '',
    body: lead.briefBody || lead.body || '',
    action: lead.briefAction || lead.action || '',
    notes: Array.isArray(lead.briefNotes) ? lead.briefNotes : [],
    attachment: lead.briefAttachment || null,
    links: Array.isArray(lead.briefLinks) ? lead.briefLinks : [],
  };
}

function V4RobertBriefView({ leads = [], query = '' }) {
  const q = String(query || '').trim().toLowerCase();
  const briefs = React.useMemo(() => {
    const liveBriefs = (Array.isArray(leads) ? leads : [])
      .filter(item => item && item.isRobertBrief)
      .map(V4LeadToRobertBrief)
      .filter(Boolean);
    const sourceBriefs = liveBriefs.length ? liveBriefs : (window.V3.ROBERT_BRIEFS || []);
    return sourceBriefs.filter(b => !q || [
      b.title, b.subtitle, b.subject, b.partner, b.company, b.summary, b.body, b.action, (b.notes || []).join(' ')
    ].filter(Boolean).some(value => String(value).toLowerCase().includes(q)));
  }, [q, leads]);
  const [modalId, setModalId] = React.useState(null);
  const [completedIds, setCompletedIds] = React.useState(() => {
    try {
      return JSON.parse(window.localStorage.getItem(V4_ROBERT_BRIEF_STORAGE_KEY) || '[]') || [];
    } catch (e) {
      return [];
    }
  });
  const [replyOpen, setReplyOpen] = React.useState(false);
  const [replyBody, setReplyBody] = React.useState('');
  const [replyStatus, setReplyStatus] = React.useState('idle');
  const [replyError, setReplyError] = React.useState('');
  const [replySuccess, setReplySuccess] = React.useState('');
  const replyTimer = React.useRef(null);
  const modalBrief = briefs.find(b => String(b.id) === String(modalId)) || null;
  const completedSet = React.useMemo(() => new Set(completedIds.map(id => String(id))), [completedIds]);
  const orderedBriefs = React.useMemo(() => {
    return [...briefs].sort((a, b) => {
      const aDone = completedSet.has(String(a.id));
      const bDone = completedSet.has(String(b.id));
      if (aDone !== bDone) return aDone ? 1 : -1;
      return new Date(b.sentAt || 0) - new Date(a.sentAt || 0);
    });
  }, [briefs, completedSet]);

  React.useEffect(() => {
    try {
      window.localStorage.setItem(V4_ROBERT_BRIEF_STORAGE_KEY, JSON.stringify(completedIds));
    } catch (e) {}
  }, [completedIds]);

  React.useEffect(() => () => {
    if (replyTimer.current) clearTimeout(replyTimer.current);
  }, []);

  const counts = {
    total: briefs.length,
    urgent: briefs.filter(b => String(b.subtitle || '').toLowerCase().includes('time-sensitive') || String(b.summary || '').toLowerCase().includes('today')).length,
    ready: briefs.filter(b => b.status === 'ready').length,
    completed: completedIds.length,
  };

  const openBrief = (brief, openReply = false) => {
    setModalId(brief.id);
    setReplyOpen(openReply);
    setReplyBody(openReply ? V4RobertBriefReplyDraft(brief) : '');
    setReplyStatus('idle');
    setReplyError('');
    setReplySuccess('');
  };

  const toggleComplete = (brief) => {
    setCompletedIds(curr => {
      const id = String(brief.id);
      return curr.map(String).includes(id) ? curr.filter(item => String(item) !== id) : [...curr, brief.id];
    });
  };

  const sendReply = async () => {
    if (!modalBrief) return;
    const body = window.V3EnsureSenderSignature(String(replyBody || '').trim(), 'robert');
    if (!body) {
      setReplyError('Write a message before sending.');
      return;
    }
    setReplyStatus('sending');
    setReplyError('');
    setReplySuccess('');
    try {
      await window.V3SendLeadEmail({
        lead: { gmailThreadId: modalBrief.gmailThreadId || null },
        sender: 'robert',
        to: V4_ROBERT_BRIEF_TO,
        cc: '',
        subject: window.V3SubjectForLead({ thread: [{ subject: modalBrief.subject }] }),
        body,
        attachPdf: false,
      });
      window.dispatchEvent(new CustomEvent('v3:email-sent', {
        detail: {
          leadId: modalBrief.id,
          sender: 'robert',
          subject: modalBrief.subject,
          body,
          to: [V4_ROBERT_BRIEF_TO],
          cc: [],
          internalOnly: false,
        },
      }));
      setReplyStatus('sent');
      setReplySuccess('Sent to Asher.');
      if (replyTimer.current) clearTimeout(replyTimer.current);
      replyTimer.current = setTimeout(() => {
        setReplyStatus('idle');
        setReplySuccess('');
        replyTimer.current = null;
      }, 2500);
    } catch (err) {
      setReplyStatus('error');
      setReplyError(err.message || 'Send failed');
    }
  };

  return (
    <div className="page brief-page">
      <div className="page-hd">
        <div>
          <div className="page-eyebrow">Robert</div>
          <h1 className="page-title">Briefs</h1>
          <div className="page-sub">Official posting briefs Asher sent by email.</div>
        </div>
        <div className="invoice-stats">
          <span className="invoice-stat warn">{counts.urgent} urgent</span>
          <span className="invoice-stat good">{counts.ready} ready</span>
          <span className="invoice-stat total">{counts.completed} complete</span>
          <span className="invoice-stat total">{counts.total} total</span>
        </div>
      </div>

      <div className="body brief-body">
        <div className="brief-list">
          {orderedBriefs.map(brief => {
            const isComplete = completedSet.has(String(brief.id));
            return (
              <div
                key={brief.id}
                role="button"
                tabIndex={0}
                className={'brief-card' + (isComplete ? ' is-complete' : '')}
                onClick={() => openBrief(brief, false)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openBrief(brief, false);
                  }
                }}
              >
                <div className="brief-card-top">
                  <V3Avatar name={brief.partner} color={__v3Color(brief.partner)} size="xs" />
                  <div className="brief-card-top-text">
                    <div className="brief-card-partnership">{brief.title}</div>
                    <div className="brief-card-meta">{brief.subject}</div>
                  </div>
                  <span className="brief-card-stage">{isComplete ? 'COMPLETED' : (brief.status === 'ready' ? 'READY' : 'BRIEF')}</span>
                </div>
                <div className="brief-card-summary">{brief.summary}</div>
                <div className="brief-card-foot">
                  <span className="brief-card-note">Tap for details</span>
                  <span className="brief-card-mini">{window.V3.GmailTime.list(brief.sentAt) || brief.sentAt}</span>
                </div>
                <div className="brief-card-actions" onClick={e => e.stopPropagation()}>
                  <button
                    type="button"
                    className={'btn btn-sm brief-card-cta ' + (isComplete ? 'btn-success' : 'btn-accent')}
                    onClick={() => toggleComplete(brief)}
                  >
                    <V3Icon name={isComplete ? 'check' : 'spark'} w={12} />
                    {isComplete ? 'Completed' : 'Complete'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost brief-card-reply"
                    onClick={() => openBrief(brief, true)}
                  >
                    <V3Icon name="reply" w={12} />
                    Reply to Asher
                  </button>
                </div>
              </div>
            );
          })}
          {briefs.length === 0 && <V3Empty icon="doc" title="No official posting briefs found." sub="Try searching the email title or partner name." />}
        </div>
      </div>
      {modalBrief && (
        <div className="brief-modal-backdrop" onClick={() => { setModalId(null); setReplyOpen(false); }}>
          <div className="brief-modal-panel" onClick={e => e.stopPropagation()}>
            <div className="brief-modal-hd">
              <div>
                <div className="brief-modal-eyebrow">Official posting</div>
                <h2 className="brief-modal-title">{modalBrief.title}</h2>
              </div>
              <div className="brief-modal-hd-actions">
                <button
                  type="button"
                  className={'btn btn-sm ' + (completedSet.has(String(modalBrief.id)) ? 'btn-success' : 'btn-accent')}
                  onClick={() => toggleComplete(modalBrief)}
                >
                  <V3Icon name={completedSet.has(String(modalBrief.id)) ? 'check' : 'spark'} w={12} />
                  {completedSet.has(String(modalBrief.id)) ? 'Completed' : 'Complete'}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => openBrief(modalBrief, true)}
                >
                  <V3Icon name="reply" w={12} />
                  Reply to Asher
                </button>
                <button className="brief-modal-close" onClick={() => { setModalId(null); setReplyOpen(false); }} aria-label="Close brief">
                  <V3Icon name="x" w={14} />
                </button>
              </div>
            </div>
            <div className="brief-modal-body">
              <div className="brief-modal-row">
                <div className="brief-modal-label">Subject</div>
                <div className="brief-modal-copy">{modalBrief.subject}</div>
              </div>
              <div className="brief-modal-grid">
                <div>
                  <div className="brief-modal-label">From</div>
                  <div className="brief-modal-copy">{modalBrief.from}</div>
                </div>
                <div>
                  <div className="brief-modal-label">To</div>
                  <div className="brief-modal-copy">{modalBrief.to.join(', ')}</div>
                </div>
              </div>
              <div className="brief-modal-grid">
                <div>
                  <div className="brief-modal-label">Partner</div>
                  <div className="brief-modal-copy">{modalBrief.partner}</div>
                </div>
                <div>
                  <div className="brief-modal-label">Company</div>
                  <div className="brief-modal-copy">{modalBrief.company}</div>
                </div>
              </div>
              <div className="brief-modal-row">
                <div className="brief-modal-label">What Robert should do</div>
                <div className="brief-modal-copy">{modalBrief.action}</div>
              </div>
              <div className="brief-modal-row">
                <div className="brief-modal-label">Brief text</div>
                <div className="brief-modal-copy brief-modal-pre">{modalBrief.body}</div>
              </div>
              {modalBrief.attachment && (
                <div className="brief-modal-row">
                  <div className="brief-modal-label">Attachment</div>
                  <div className="brief-modal-copy">
                    {modalBrief.attachment.filename} · {modalBrief.attachment.type}
                  </div>
                </div>
              )}
              {(modalBrief.links || []).length > 0 && (
                <div className="brief-modal-row">
                  <div className="brief-modal-label">Links</div>
                  <div className="brief-modal-copy">
                    {modalBrief.links.map(link => (
                      <div key={link.href}><a href={link.href} target="_blank" rel="noreferrer">{link.label}</a></div>
                    ))}
                  </div>
                </div>
              )}
              {modalBrief.notes?.length > 0 && (
                <div className="brief-modal-row">
                  <div className="brief-modal-label">Notes</div>
                  <div className="brief-modal-copy">{modalBrief.notes.join(' · ')}</div>
                </div>
              )}
              <div className="brief-modal-row brief-reply-panel">
                <div className="brief-modal-label">Reply to Asher</div>
                <div className="brief-reply-hint">From Robert Scoble to {V4_ROBERT_BRIEF_TO}</div>
                {!replyOpen ? (
                  <div className="brief-reply-compact">
                    <button className="btn btn-sm btn-accent" type="button" onClick={() => openBrief(modalBrief, true)}>
                      <V3Icon name="reply" w={12} />
                      Open reply
                    </button>
                    <span className="brief-card-note">Send a quick question if Robert needs more detail.</span>
                  </div>
                ) : (
                  <>
                    <input
                      className="brief-input"
                      value={'Re: ' + modalBrief.subject.replace(/^re:\s*/i, '')}
                      readOnly
                      aria-label="Reply subject"
                    />
                    <textarea
                      className="brief-input"
                      style={{ minHeight: 118, resize: 'vertical' }}
                      value={replyBody}
                      disabled={replyStatus === 'sending'}
                      onChange={e => setReplyBody(e.target.value)}
                      placeholder="Ask Asher for any missing details..."
                    />
                    <div className="brief-reply-foot">
                      <div className="brief-reply-status">
                        {replySuccess || replyError || (replyStatus === 'sent' ? 'Sent.' : `Sending as Robert Scoble to Asher.`)}
                      </div>
                      <button
                        className={'btn btn-sm ' + (replyStatus === 'sent' ? 'btn-success' : 'btn-accent')}
                        type="button"
                        disabled={replyStatus === 'sending'}
                        onClick={sendReply}
                      >
                        <V3Icon name={replyStatus === 'sent' ? 'check' : 'send'} w={12} />
                        {replyStatus === 'sending' ? 'Sending…' : replyStatus === 'sent' ? 'Sent' : 'Send reply'}
                      </button>
                    </div>
                  </>
                )}
              </div>
              <div className="brief-modal-actions">
                <span className="brief-card-note">Sent {window.V3.GmailTime.full(modalBrief.sentAt) || modalBrief.sentAt}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const V4_INVOICE_GROUPS = [
  {
    id: 'outstanding',
    label: 'Outstanding',
    eyebrow: 'Awaiting payment or confirmation',
    note: 'These are still open and should stay visible until they are paid or explicitly closed.',
    tone: 'warn',
    buckets: [
      {
        label: 'Stripe',
        note: 'New Stripe invoices live here. Legacy manual invoices from your folders stay in their own buckets below.',
        items: [
          {
            id: 'stripe-in1tjsxfk0weauaymjjq6bosxf',
            title: 'Hockey Stick Growth LLC',
            company: 'billing@hockeystick.io',
            folder: 'STRIPE / OPEN',
            source: 'Stripe',
            sourceDir: 'STRIPE',
            file: 'F058AI3B-0001',
            href: 'https://dashboard.stripe.com/invoices/in_1TjsxfK0WeauAYMJJQ6boSxf',
            kind: 'STRIPE',
            stripeStatus: 'open',
            stripePaid: false,
            stripeAmountDue: 10000.0,
            stripeAmountPaid: 0.0,
            stripeCurrency: 'USD',
            stripeDashboardUrl: 'https://dashboard.stripe.com/invoices/in_1TjsxfK0WeauAYMJJQ6boSxf',
            stripeHostedInvoiceUrl: 'https://invoice.stripe.com/i/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VakxmcEt4UUNhbENUN1FBNnZsd0xZQzNOdVdPSm9jLDE3MjQ5NzcxOA0200K8PCMPP8?s=ap',
            stripeInvoicePdf: 'https://pay.stripe.com/invoice/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VakxmcEt4UUNhbENUN1FBNnZsd0xZQzNOdVdPSm9jLDE3MjQ5NzcxOA0200K8PCMPP8/pdf?s=ap',
          },
          {
            id: 'stripe-in1tic8ek0weauaymjz0v1f90g',
            title: 'Sean Kim x EASTWORLD',
            company: 'sean@virtuals.io',
            folder: 'STRIPE / OPEN',
            source: 'Stripe',
            sourceDir: 'STRIPE',
            file: 'WYB8J2D8-0001',
            href: 'https://dashboard.stripe.com/invoices/in_1Tic8eK0WeauAYMJZ0v1f90G',
            kind: 'STRIPE',
            stripeStatus: 'open',
            stripePaid: false,
            stripeAmountDue: 2055.0,
            stripeAmountPaid: 0.0,
            stripeCurrency: 'USD',
            stripeDashboardUrl: 'https://dashboard.stripe.com/invoices/in_1Tic8eK0WeauAYMJZ0v1f90G',
            stripeHostedInvoiceUrl: 'https://invoice.stripe.com/i/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VaTJEbTlWd3NYV3JMVGZzQ2s4OUFMM3dHM2RuVDR0LDE3MjQ5NzcxOA02006iP8AsoU?s=ap',
            stripeInvoicePdf: 'https://pay.stripe.com/invoice/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VaTJEbTlWd3NYV3JMVGZzQ2s4OUFMM3dHM2RuVDR0LDE3MjQ5NzcxOA02006iP8AsoU/pdf?s=ap',
          },
        ],
      },
      {
        label: 'Open outstanding',
        note: 'Active invoices still waiting on payment.',
        items: [
          {
            id: 'invoice-eastworlds-061926',
            title: 'Eastworlds',
            company: 'Eastworlds',
            folder: 'OUTSTANDING / OPEN OUTSTANDING',
            source: 'Manual',
            sourceDir: 'OUTSTANDING',
            file: 'invoice_Eastworlds_061926.pdf',
            href: 'flow-v4/assets/invoices/outstanding/invoice_Eastworlds_061926.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-echonlab-mainecoon-061626',
            title: 'EchonLab',
            company: 'MaineCoon',
            folder: 'OUTSTANDING / OPEN OUTSTANDING',
            source: 'Manual',
            sourceDir: 'OUTSTANDING',
            file: 'invoice_EchonLab_MaineCoon_061626.pdf',
            href: 'flow-v4/assets/invoices/outstanding/invoice_EchonLab_MaineCoon_061626.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-goldenegg-banking-sample',
            title: 'GoldenEgg',
            company: 'banking sample',
            folder: 'OUTSTANDING / OPEN OUTSTANDING',
            source: 'Manual',
            sourceDir: 'OUTSTANDING',
            file: 'invoice_GoldenEgg_banking_sample.pdf',
            href: 'flow-v4/assets/invoices/outstanding/invoice_GoldenEgg_banking_sample.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-goldeneggmedia-banking-sample',
            title: 'GoldenEggMedia',
            company: 'banking sample',
            folder: 'OUTSTANDING / OPEN OUTSTANDING',
            source: 'Manual',
            sourceDir: 'OUTSTANDING',
            file: 'invoice_GoldenEggMedia_banking_sample.pdf',
            href: 'flow-v4/assets/invoices/outstanding/invoice_GoldenEggMedia_banking_sample.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-hockeystickgrowth-acl2026-firstpayment-062026',
            title: 'HockeyStickGrowth',
            company: 'ACL2026 FirstPayment',
            folder: 'OUTSTANDING / OPEN OUTSTANDING',
            source: 'Manual',
            sourceDir: 'OUTSTANDING',
            file: 'invoice_HockeyStickGrowth_ACL2026_FirstPayment_062026.pdf',
            href: 'flow-v4/assets/invoices/outstanding/invoice_HockeyStickGrowth_ACL2026_FirstPayment_062026.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-jay-riversideinterview-061526',
            title: 'Jay',
            company: 'RiversideInterview',
            folder: 'OUTSTANDING / OPEN OUTSTANDING',
            source: 'Manual',
            sourceDir: 'OUTSTANDING',
            file: 'invoice_Jay_RiversideInterview_061526.pdf',
            href: 'flow-v4/assets/invoices/outstanding/invoice_Jay_RiversideInterview_061526.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-omane-nitrosend-061726',
            title: 'Omane',
            company: 'NitroSend',
            folder: 'OUTSTANDING / OPEN OUTSTANDING',
            source: 'Manual',
            sourceDir: 'OUTSTANDING',
            file: 'invoice_Omane_NitroSend_061726.pdf',
            href: 'flow-v4/assets/invoices/outstanding/invoice_Omane_NitroSend_061726.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-r3ach-061926',
            title: 'R3ach',
            company: 'R3ach',
            folder: 'OUTSTANDING / OPEN OUTSTANDING',
            source: 'Manual',
            sourceDir: 'OUTSTANDING',
            file: 'invoice_R3ach_061926.pdf',
            href: 'flow-v4/assets/invoices/outstanding/invoice_R3ach_061926.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
        ],
      },
      {
        label: 'Check Mailed',
        note: 'Synced from this invoice subfolder.',
        items: [
          {
            id: 'invoice-mayank-clinesdk-051326',
            title: 'Mayank',
            company: 'ClineSDK',
            folder: 'OUTSTANDING / CHECK MAILED',
            source: 'Manual',
            sourceDir: 'OUTSTANDING/CHECK MAILED',
            file: 'invoice_Mayank_ClineSDK_051326.pdf',
            href: 'flow-v4/assets/invoices/outstanding/check-mailed/invoice_Mayank_ClineSDK_051326.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
        ],
      },
    ],
  },
  {
    id: 'done',
    label: 'Done',
    eyebrow: 'Completed and closed',
    note: 'These invoices are finished and moved out of the active queue.',
    tone: 'good',
    buckets: [
      {
        label: 'Stripe',
        note: 'Closed Stripe invoices live here. Legacy manual invoices from your folders stay in their own buckets below.',
        items: [
          {
            id: 'stripe-in1timqck0weauaymjabporweh',
            title: 'Annika Wang',
            company: 'annika.wang@hockeystick.io',
            folder: 'STRIPE / CLOSED',
            source: 'Stripe',
            sourceDir: 'STRIPE',
            file: 'LIS6UY6W-0001',
            href: 'https://dashboard.stripe.com/invoices/in_1TimqCK0WeauAYMJABpOrweH',
            kind: 'STRIPE',
            stripeStatus: 'void',
            stripePaid: false,
            stripeAmountDue: 10000.0,
            stripeAmountPaid: 0.0,
            stripeCurrency: 'USD',
            stripeDashboardUrl: 'https://dashboard.stripe.com/invoices/in_1TimqCK0WeauAYMJABpOrweH',
            stripeHostedInvoiceUrl: 'https://invoice.stripe.com/i/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VaURHYmRwNmJuODJLem9yTUVWd3FOYnZHRGgwTzhmLDE3MjQ5NzcxOA0200A9Dabk0L?s=ap',
            stripeInvoicePdf: 'https://pay.stripe.com/invoice/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VaURHYmRwNmJuODJLem9yTUVWd3FOYnZHRGgwTzhmLDE3MjQ5NzcxOA0200A9Dabk0L/pdf?s=ap',
          },
          {
            id: 'stripe-in1thwn2k0weauaymjfm1x0dpg',
            title: 'Judy — Echon Labs',
            company: 'collab@echonlab.com',
            folder: 'STRIPE / CLOSED',
            source: 'Stripe',
            sourceDir: 'STRIPE',
            file: 'RYKHX5KX-0001',
            href: 'https://dashboard.stripe.com/invoices/in_1ThwN2K0WeauAYMJFm1x0dPG',
            kind: 'STRIPE',
            stripeStatus: 'void',
            stripePaid: false,
            stripeAmountDue: 1952.0,
            stripeAmountPaid: 0.0,
            stripeCurrency: 'USD',
            stripeDashboardUrl: 'https://dashboard.stripe.com/invoices/in_1ThwN2K0WeauAYMJFm1x0dPG',
            stripeHostedInvoiceUrl: 'https://invoice.stripe.com/i/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VaEwzOFNaOTJUS0swT3JMYm41NVlsMmtoNmNqcFJrLDE3MjQ5NzcxOA0200BAZsiUgV?s=ap',
            stripeInvoicePdf: 'https://pay.stripe.com/invoice/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VaEwzOFNaOTJUS0swT3JMYm41NVlsMmtoNmNqcFJrLDE3MjQ5NzcxOA0200BAZsiUgV/pdf?s=ap',
          },
        ],
      },
      {
        label: 'Done',
        note: 'Archived for reference.',
        items: [
          {
            id: 'invoice-arcgrowth-ahacreator-052126',
            title: 'ArcGrowth',
            company: 'AhaCreator',
            folder: 'DONE / ARCHIVED',
            source: 'Manual',
            sourceDir: 'DONE',
            file: 'invoice_ArcGrowth_AhaCreator_052126.pdf',
            href: 'flow-v4/assets/invoices/done/invoice_ArcGrowth_AhaCreator_052126.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-cutback-selects-061226',
            title: 'Cutback',
            company: 'Selects',
            folder: 'DONE / ARCHIVED',
            source: 'Manual',
            sourceDir: 'DONE',
            file: 'invoice_Cutback_Selects_061226.pdf',
            href: 'flow-v4/assets/invoices/done/invoice_Cutback_Selects_061226.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-eezycollab-team9-052226',
            title: 'EezyCollab',
            company: 'Team9',
            folder: 'DONE / ARCHIVED',
            source: 'Manual',
            sourceDir: 'DONE',
            file: 'invoice_EezyCollab_Team9_052226.pdf',
            href: 'flow-v4/assets/invoices/done/invoice_EezyCollab_Team9_052226.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-hockeystick-voxcpm2-051526',
            title: 'HockeyStick',
            company: 'VOXCPM2',
            folder: 'DONE / ARCHIVED',
            source: 'Manual',
            sourceDir: 'DONE',
            file: 'invoice_HockeyStick_VOXCPM2_051526.pdf',
            href: 'flow-v4/assets/invoices/done/invoice_HockeyStick_VOXCPM2_051526.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-jay-langchainai-051326',
            title: 'Jay',
            company: 'LangChainAI',
            folder: 'DONE / ARCHIVED',
            source: 'Manual',
            sourceDir: 'DONE',
            file: 'invoice_Jay_LangChainAI_051326.pdf',
            href: 'flow-v4/assets/invoices/done/invoice_Jay_LangChainAI_051326.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-lobehub-051626',
            title: 'LobeHub',
            company: 'LobeHub',
            folder: 'DONE / ARCHIVED',
            source: 'Manual',
            sourceDir: 'DONE',
            file: 'invoice_LobeHub_051626.pdf',
            href: 'flow-v4/assets/invoices/done/invoice_LobeHub_051626.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-marketingguys-kombai-qrt-060126',
            title: 'MarketingGuys',
            company: 'Kombai QRT',
            folder: 'DONE / ARCHIVED',
            source: 'Manual',
            sourceDir: 'DONE',
            file: 'invoice_MarketingGuys_Kombai_QRT_060126.pdf',
            href: 'flow-v4/assets/invoices/done/invoice_MarketingGuys_Kombai_QRT_060126.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-omane-060826',
            title: 'Omane',
            company: 'Omane',
            folder: 'DONE / ARCHIVED',
            source: 'Manual',
            sourceDir: 'DONE',
            file: 'invoice_Omane_060826.pdf',
            href: 'flow-v4/assets/invoices/done/invoice_Omane_060826.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-omane-ormannheim-051826',
            title: 'Omane',
            company: 'OrMannheim',
            folder: 'DONE / ARCHIVED',
            source: 'Manual',
            sourceDir: 'DONE',
            file: 'invoice_Omane_OrMannheim_051826.pdf',
            href: 'flow-v4/assets/invoices/done/invoice_Omane_OrMannheim_051826.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-omane-viktor-060826',
            title: 'Omane',
            company: 'Viktor',
            folder: 'DONE / ARCHIVED',
            source: 'Manual',
            sourceDir: 'DONE',
            file: 'invoice_Omane_Viktor_060826.pdf',
            href: 'flow-v4/assets/invoices/done/invoice_Omane_Viktor_060826.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-playos-sintra-tier5-052126',
            title: 'PlayOS',
            company: 'Sintra Tier5',
            folder: 'DONE / ARCHIVED',
            source: 'Manual',
            sourceDir: 'DONE',
            file: 'invoice_PlayOS_Sintra_Tier5_052126.pdf',
            href: 'flow-v4/assets/invoices/done/invoice_PlayOS_Sintra_Tier5_052126.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-polsia-sfphysicalcampaign-060426',
            title: 'Polsia',
            company: 'SFPhysicalCampaign',
            folder: 'DONE / ARCHIVED',
            source: 'Manual',
            sourceDir: 'DONE',
            file: 'invoice_Polsia_SFPhysicalCampaign_060426.pdf',
            href: 'flow-v4/assets/invoices/done/invoice_Polsia_SFPhysicalCampaign_060426.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-polsia-tier3-052126',
            title: 'Polsia',
            company: 'Tier3',
            folder: 'DONE / ARCHIVED',
            source: 'Manual',
            sourceDir: 'DONE',
            file: 'invoice_Polsia_Tier3_052126.pdf',
            href: 'flow-v4/assets/invoices/done/invoice_Polsia_Tier3_052126.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-polyai-04232026',
            title: 'PolyAI',
            company: 'PolyAI',
            folder: 'DONE / ARCHIVED',
            source: 'Manual',
            sourceDir: 'DONE',
            file: 'invoice_PolyAI_04232026.html',
            href: 'flow-v4/assets/invoices/done/invoice_PolyAI_04232026.html',
            kind: 'HTML',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-vivi-eezycollab-051426',
            title: 'Vivi',
            company: 'EezyCollab',
            folder: 'DONE / ARCHIVED',
            source: 'Manual',
            sourceDir: 'DONE',
            file: 'invoice_Vivi_EezyCollab_051426.pdf',
            href: 'flow-v4/assets/invoices/done/invoice_Vivi_EezyCollab_051426.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-stav-invoice',
            title: 'STAV',
            company: 'INVOICE',
            folder: 'DONE / ARCHIVED',
            source: 'Manual',
            sourceDir: 'DONE',
            file: 'STAV INVOICE.pdf',
            href: 'flow-v4/assets/invoices/done/STAV%20INVOICE.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
        ],
      },
    ],
  },
];

const V4_INVOICE_ACTION_URL = 'http://127.0.0.1:8765/complete-invoice';

function V4InvoiceMatchesQuery(item, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  return [item.title, item.company, item.folder, item.source, item.sourceDir, item.file, item.kind, item.href, item.stripeStatus, item.stripeCurrency]
    .filter(Boolean)
    .some(value => String(value).toLowerCase().includes(q));
}

function V4InvoiceMoney(amount, currency = 'USD') {
  if (amount == null || amount === '') return '';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: String(currency || 'USD').toUpperCase(),
      maximumFractionDigits: 2,
    }).format(Number(amount));
  } catch (e) {
    return '$' + Number(amount).toFixed(2);
  }
}

function V4InvoiceCard({ item, onComplete, completingId }) {
  const canComplete = String(item.sourceDir || '').startsWith('OUTSTANDING');
  const isCompleting = completingId === item.id;
  const stripeStatus = String(item.stripeStatus || '').trim();
  const openHref = item.stripeDashboardUrl || item.href || item.stripeHostedInvoiceUrl || item.stripeInvoicePdf || '';
  const stripeTone = item.stripePaid ? 'paid' : (
    stripeStatus === 'open' || stripeStatus === 'draft' ? 'open' : (
      stripeStatus === 'void' || stripeStatus === 'uncollectible' ? 'void' : 'neutral'
    )
  );
  const stripeAmount = item.stripePaid ? item.stripeAmountPaid : item.stripeAmountDue;
  const stripeAmountLabel = stripeAmount != null ? V4InvoiceMoney(stripeAmount, item.stripeCurrency) : '';
  return (
    <div className="invoice-card">
      <div className="invoice-card-top">
        <div className="invoice-card-icon">
          <V3Icon name="invoice" w={14} />
        </div>
        <div className="invoice-card-head">
          <div className="invoice-card-title-row">
            <strong>{item.title}</strong>
            <span className={'invoice-kind invoice-kind-' + item.kind.toLowerCase()}>{item.kind}</span>
            {item.source && (
              <span className="invoice-source-badge">{item.source}</span>
            )}
            {stripeStatus && (
              <span className={'invoice-stripe-badge is-' + stripeTone}>
                Stripe {item.stripePaid ? 'paid' : stripeStatus}
              </span>
            )}
          </div>
          <div className="invoice-card-company">{item.company}</div>
          <div className="invoice-card-folder">{item.folder}</div>
          {(stripeAmountLabel || item.stripeHostedInvoiceUrl) && (
            <div className="invoice-stripe-meta">
              {stripeAmountLabel && <span>{item.stripePaid ? 'Paid ' : 'Due '}{stripeAmountLabel}</span>}
              {item.stripeHostedInvoiceUrl && (
                <a className="invoice-stripe-link" href={item.stripeHostedInvoiceUrl} target="_blank" rel="noreferrer">
                  Customer invoice
                </a>
              )}
              {item.stripeInvoicePdf && (
                <a className="invoice-stripe-link" href={item.stripeInvoicePdf} target="_blank" rel="noreferrer">
                  Stripe PDF
                </a>
              )}
            </div>
          )}
        </div>
        {openHref ? (
          <a className="invoice-open" href={openHref} target="_blank" rel="noreferrer">Open</a>
        ) : (
          <span className="invoice-open is-disabled">No link</span>
        )}
      </div>
      <div className="invoice-card-file">{item.file}</div>
      {canComplete && (
        <button
          className="invoice-complete-btn"
          type="button"
          disabled={isCompleting}
          onClick={() => onComplete(item)}
        >
          <V3Icon name={isCompleting ? 'spark' : 'check'} w={13} />
          {isCompleting ? 'Completing...' : 'Complete'}
        </button>
      )}
    </div>
  );
}

function V4InvoicesView({ query = '' }) {
  const q = String(query || '').trim();
  const [groups, setGroups] = React.useState(V4_INVOICE_GROUPS);
  const [completingId, setCompletingId] = React.useState(null);
  const [notice, setNotice] = React.useState(null);

  const completeInvoice = async (item) => {
    setCompletingId(item.id);
    setNotice(null);
    try {
      const res = await fetch(V4_INVOICE_ACTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDir: item.sourceDir, file: item.file }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.ok) throw new Error(payload.error || 'Could not complete invoice.');

      setGroups(current => current.map(group => {
        if (group.id === 'outstanding') {
          return {
            ...group,
            buckets: group.buckets.map(bucket => ({
              ...bucket,
              items: bucket.items.filter(next => next.id !== item.id),
            })).filter(bucket => bucket.items.length > 0),
          };
        }
        if (group.id === 'done') {
          const doneItem = {
            ...item,
            sourceDir: 'DONE',
            folder: 'DONE / ARCHIVED',
            file: payload.file || item.file,
            href: 'flow-v4/assets/invoices/done/' + encodeURIComponent(payload.file || item.file),
          };
          const buckets = group.buckets.length ? [...group.buckets] : [{ label: 'Done', note: 'Archived for reference.', items: [] }];
          buckets[0] = { ...buckets[0], items: [doneItem, ...buckets[0].items] };
          return { ...group, buckets };
        }
        return group;
      }));
      setNotice({ tone: 'good', text: `${payload.file || item.file} moved to DONE.` });
    } catch (err) {
      setNotice({ tone: 'warn', text: `Start the local invoice helper, then try again. ${err.message || err}` });
    } finally {
      setCompletingId(null);
    }
  };

  const visibleGroups = groups.map(group => ({
    ...group,
    buckets: group.buckets
      .map(bucket => ({
        ...bucket,
        items: bucket.items.filter(item => V4InvoiceMatchesQuery(item, q)),
      }))
      .filter(bucket => bucket.items.length > 0),
  })).filter(group => group.buckets.length > 0);

  const outstandingCount = (groups.find(group => group.id === 'outstanding')?.buckets || []).reduce((sum, bucket) => sum + bucket.items.length, 0);
  const doneCount = (groups.find(group => group.id === 'done')?.buckets || []).reduce((sum, bucket) => sum + bucket.items.length, 0);
  const totalCount = outstandingCount + doneCount;
  const visibleCount = visibleGroups.reduce((sum, group) => sum + group.buckets.reduce((n, bucket) => n + bucket.items.length, 0), 0);

  return (
    <div className="page invoices-page">
      <div className="page-hd">
        <div>
          <div className="page-eyebrow">Invoices</div>
          <h1 className="page-title">Invoices</h1>
          <div className="page-sub">Outstanding and done invoices from your local folder tree, with Stripe payment status when connected.</div>
        </div>
        <div className="invoice-stats">
          <span className="invoice-stat warn">{outstandingCount} outstanding</span>
          <span className="invoice-stat good">{doneCount} done</span>
          <span className="invoice-stat total">{totalCount} total</span>
        </div>
      </div>

      <div className="body invoices-body">
        {notice && <div className={'invoice-notice invoice-notice-' + notice.tone}>{notice.text}</div>}
        {q && <div className="invoice-search-note">{visibleCount} result{visibleCount === 1 ? '' : 's'} for “{q}”</div>}
        {visibleGroups.length === 0 && <V3Empty icon="invoice" title="No invoices match that search." sub="Try a company name, file name, or folder." />}

        {visibleGroups.map(group => (
          <section key={group.id} className={'invoice-group invoice-group-' + group.tone}>
            <div className="invoice-group-hd">
              <div>
                <div className="invoice-group-eyebrow">{group.eyebrow}</div>
                <h2 className="invoice-group-title">{group.label}</h2>
                <div className="invoice-group-note">{group.note}</div>
              </div>
              <div className="invoice-group-count">
                {group.buckets.reduce((n, bucket) => n + bucket.items.length, 0)}
              </div>
            </div>

            <div className="invoice-buckets">
              {group.buckets.map(bucket => (
                <div key={bucket.label} className="invoice-bucket">
                  <div className="invoice-bucket-hd">
                    <div>
                      <div className="invoice-bucket-label">{bucket.label}</div>
                      <div className="invoice-bucket-note">{bucket.note}</div>
                    </div>
                    <div className="invoice-bucket-count">{bucket.items.length}</div>
                  </div>
                  <div className="invoice-grid">
                    {bucket.items.map(item => <V4InvoiceCard key={item.id} item={item} onComplete={completeInvoice} completingId={completingId} />)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

// ─── Today ──────────────────────────────────────────────────
function V4TodayView({ user, leads, onOpenLead, onGoInbox }) {
  const { USERS, TASK_TYPES, deriveTasks, bucketTasks, greeting } = window.V3;
  const me = USERS[user];

  const [tab, setTab] = React.useState('now');
  const [completed, setCompleted] = React.useState({});
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  const FADE_MS = 10000;

  const allTasks = React.useMemo(() => deriveTasks(user, leads), [user, leads]);
  const liveTasks = allTasks.filter(t => !completed[t.id] || (now - completed[t.id]) < FADE_MS);
  const doneTasks = allTasks.filter(t =>  completed[t.id] && (now - completed[t.id]) >= FADE_MS);
  const buckets   = bucketTasks(liveTasks);

  const toggleComplete = (task) => {
    setCompleted(c => {
      if (c[task.id]) { const next = { ...c }; delete next[task.id]; return next; }
      return { ...c, [task.id]: Date.now() };
    });
  };

  const STUCK_DAYS = 7;
  const ACTIVE_STAGES = ['new','first-touch','engaged','rates-sent','negotiating','invoice-sent'];
  const stuckLeads = React.useMemo(() =>
    leads
      .filter(l => ACTIVE_STAGES.includes(l.stage) && l.daysInStage >= STUCK_DAYS)
      .sort((a, b) => b.daysInStage - a.daysInStage),
    [leads]
  );

  const unreadCount = leads.filter(l => l.unread).length;
  const today = new Date();
  const dayLabel = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const pipeOpen = leads.filter(l => !['paid-out'].includes(l.stage)).reduce((s, l) => s + (l.value || 0), 0);

  const nowCount   = buckets.urgent.length + buckets.past.length + buckets.today.length;
  const nextCount  = buckets.tomorrow.length + buckets.thisWeek.length;
  const laterCount = buckets.upcoming.length;

  // Auto-flip to first non-empty tab on user change
  React.useEffect(() => {
    if (tab === 'now' && nowCount === 0 && nextCount > 0) setTab('next');
  }, [user]);

  const subline = nowCount === 0
    ? (nextCount > 0 ? `Clear for now · ${nextCount} coming up` : "You're all clear.")
    : (<><strong style={{ color: 'var(--text)' }}>{nowCount}</strong> thing{nowCount === 1 ? '' : 's'} on you right now</>);

  const ctx = { user, onOpenLead, onToggle: toggleComplete, completed, now, fadeMs: FADE_MS };

  return (
    <div className="page today-v4">
      <div className="page-hd">
        <div>
          <div className="page-eyebrow">{dayLabel}</div>
          <h1 className="page-title">{greeting()}, <span className="accent">{me.name}</span>.</h1>
          <div className="page-sub">{subline}</div>
        </div>
        <div className="page-actions">
          <button className="btn-inbox-cta" onClick={onGoInbox} title="Go to inbox">
            <V3Icon name="mail" w={13} />
            <span>Inbox</span>
            {unreadCount > 0 && <span className="btn-inbox-cta-cnt">{unreadCount}</span>}
          </button>
          <button className="btn btn-sm btn-accent"><V3Icon name="plus" /> New lead</button>
        </div>
      </div>

      <div className="today-tabs-bar">
        <div className="today-tabs">
          <TodayTab id="now"   label="Now"   count={nowCount}          tab={tab} setTab={setTab} tone="now" />
          <TodayTab id="next"  label="Next"  count={nextCount}         tab={tab} setTab={setTab} />
          <TodayTab id="later" label="Later" count={laterCount}        tab={tab} setTab={setTab} />
          <TodayTab id="stuck" label="Stuck" count={stuckLeads.length} tab={tab} setTab={setTab} tone="stuck" />
          <TodayTab id="done"  label="Done"  count={doneTasks.length}  tab={tab} setTab={setTab} tone="done" />
        </div>
        <div className="today-pipe-stat">
          <span className="today-pipe-lbl">Open pipeline</span>
          <span className="today-pipe-val">{v3Money(pipeOpen, { compact: true })}</span>
        </div>
      </div>

      <div className="body today-body">
        {tab === 'now'   && <NowZone   buckets={buckets} {...ctx} />}
        {tab === 'next'  && <NextZone  buckets={buckets} {...ctx} />}
        {tab === 'later' && <LaterZone buckets={buckets} {...ctx} />}
        {tab === 'stuck' && <StuckZone leads={stuckLeads} onOpenLead={onOpenLead} user={user} />}
        {tab === 'done'  && <DoneZone  items={doneTasks} {...ctx} />}
      </div>
    </div>
  );
}

function TodayTab({ id, label, count, tab, setTab, tone }) {
  const active = tab === id;
  return (
    <button className={'today-tab' + (active ? ' is-active' : '') + (tone ? ' today-tab-' + tone : '')}
            onClick={() => setTab(id)}>
      <span className="today-tab-lbl">{label}</span>
      <span className="today-tab-cnt">{count}</span>
    </button>
  );
}

// ─── STUCK zone ─────────────────────────────────────────────
function StuckZone({ leads, onOpenLead, user }) {
  const { STAGE_BY_ID, USERS } = window.V3;
  if (leads.length === 0) {
    return (
      <div className="card" style={{ padding: '40px 24px', textAlign: 'center' }}>
        <V3Empty icon="check" title="No stuck leads." sub="Everything is moving. Nice work." />
      </div>
    );
  }

  const buckets = [
    { label: '21+ days', tone: 'critical', items: leads.filter(l => l.daysInStage >= 21) },
    { label: '14–20 days', tone: 'warning', items: leads.filter(l => l.daysInStage >= 14 && l.daysInStage < 21) },
    { label: '7–13 days', tone: 'caution', items: leads.filter(l => l.daysInStage >= 7 && l.daysInStage < 14) },
  ].filter(b => b.items.length > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {buckets.map(b => (
        <div key={b.label} className="card" style={{ overflow: 'hidden' }}>
          <div className={'stuck-bucket-hd stuck-' + b.tone}>
            <span className="stuck-bucket-label">{b.label}</span>
            <span className="stuck-bucket-cnt">{b.items.length}</span>
          </div>
          {b.items.map(l => {
            const stage = STAGE_BY_ID[l.stage];
            const owner = l.ownerId ? USERS[l.ownerId] : null;
            const barPct = Math.min(100, Math.round((l.daysInStage / 30) * 100));
            return (
              <div key={l.id} className="stuck-row" onClick={() => onOpenLead(l.id)}>
                <div className="stuck-row-left">
                  <V3Avatar name={l.contactName} color={l.color} />
                  <div className="stuck-row-info">
                    <div className="stuck-row-name">{l.contactName}</div>
                    <div className="stuck-row-brand">{l.brand}</div>
                  </div>
                </div>
                <div className="stuck-row-stage" style={{ color: stage.color }}>
                  <span className="dot" style={{ background: stage.color }}></span>
                  {stage.short}
                </div>
                <div className="stuck-row-bar-wrap">
                  <div className="stuck-row-bar" style={{ width: barPct + '%', background: b.tone === 'critical' ? 'var(--red,#e03)' : b.tone === 'warning' ? 'var(--amber,#f90)' : 'var(--accent)' }} />
                </div>
                <div className="stuck-row-days">{l.daysInStage}d</div>
                <div className="stuck-row-owner">
                  {owner ? <V3Avatar name={owner.name} color={owner.color} size="xs" /> : null}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── Pipeline progress visual ───────────────────────────────
// pipeStep: 0-7 index in ACTIVE_STAGE_IDS. daysInStage for the stuck bar.
function V3PipeViz({ stageId, daysInStage, compact }) {
  const { ACTIVE_STAGE_IDS, STAGE_BY_ID } = window.V3;
  const PIPE_STAGES = ['new','first-touch','engaged','rates-sent','negotiating','invoice-sent','done','paid-out'];
  const step = PIPE_STAGES.indexOf(stageId);
  const stage = STAGE_BY_ID[stageId] || {};
  const stuckColor = daysInStage >= 21 ? '#dd0033' : daysInStage >= 14 ? '#e87800' : daysInStage >= 7 ? '#c9a000' : 'var(--accent)';
  const stuckPct   = Math.min(100, Math.round((daysInStage / 28) * 100));

  if (compact) {
    return (
      <div className="pv-compact">
        <div className="pv-compact-segs">
          {PIPE_STAGES.map((s, i) => (
            <div key={s} className={'pv-seg' + (i < step ? ' past' : i === step ? ' cur' : '')}
                 style={i === step ? { background: stage.color } : undefined} />
          ))}
        </div>
        <div className="pv-compact-bar-wrap">
          <div className="pv-compact-bar" style={{ width: stuckPct + '%', background: stuckColor }} />
        </div>
      </div>
    );
  }

  return (
    <div className="pv-full">
      <div className="pv-full-segs">
        {PIPE_STAGES.map((s, i) => (
          <div key={s} className={'pv-seg' + (i < step ? ' past' : i === step ? ' cur' : '')}
               style={i === step ? { background: stage.color } : undefined}>
            {i === step && <span className="pv-seg-label">{stage.short}</span>}
          </div>
        ))}
      </div>
      <div className="pv-full-foot">
        <div className="pv-full-bar-wrap">
          <div className="pv-full-bar" style={{ width: stuckPct + '%', background: stuckColor }} />
        </div>
        <span className="pv-full-days" style={{ color: stuckColor }}>{daysInStage}d in stage</span>
      </div>
    </div>
  );
}

// ─── NOW zone — big action cards, 3 sub-sections clearly differentiated
function NowZone({ buckets, ...ctx }) {
  const isEmpty = buckets.urgent.length === 0 && buckets.past.length === 0 && buckets.today.length === 0;
  if (isEmpty) {
    return (
      <div className="card" style={{ padding: '40px 24px', textAlign: 'center' }}>
        <V3Empty icon="check" title="Nothing on you right now." sub="Check Next to see what's coming up." />
      </div>
    );
  }
  return (
    <>
      {buckets.urgent.length > 0 && (
        <NowSection tone="priority" label="Priority" sublabel="They asked for a date in the email"
                    items={buckets.urgent} {...ctx} />
      )}
      {buckets.past.length > 0 && (
        <NowSection tone="late" label="Past due" sublabel="Should have been done by now"
                    items={buckets.past} {...ctx} />
      )}
      {buckets.today.length > 0 && (
        <NowSection tone="today" label="Due today" sublabel="Wrap by end of day"
                    items={buckets.today} {...ctx} />
      )}
    </>
  );
}

function NowSection({ tone, label, sublabel, items, ...ctx }) {
  return (
    <section className={'now-section now-' + tone}>
      <header className="now-section-hd">
        <div className="now-section-rail"></div>
        <h2 className="now-section-title">{label}</h2>
        <span className="now-section-count">{items.length}</span>
        <span className="now-section-sub">{sublabel}</span>
      </header>
      <div className="now-section-body">
        {items.map(t => <NowCard key={t.id} task={t} {...ctx} />)}
      </div>
    </section>
  );
}

// CTA verbs per task type — what does the button SAY
const CTA_VERB = {
  qualify:  'Reply',
  followup: 'Nudge',
  reply:    'Reply',
  rates:    'Send rates',
  nudge:    'Nudge',
  respond:  'Respond',
  invoice:  'Send invoice',
  payment:  'Check $',
  post:     'Post',
  live:     'Track',
  approve:  'Review',
};

function NowCard({ task, user, onOpenLead, onToggle, completed, now, fadeMs }) {
  const { TASK_TYPES, STAGE_BY_ID, USERS } = window.V3;
  const t = TASK_TYPES[task.type] || { label: task.type, icon: 'doc', tone: 'reply' };
  const lead = task.lead;
  const stage = STAGE_BY_ID[lead.stage];
  const isCompleted = !!completed[task.id];
  const ageMs = isCompleted ? (now - completed[task.id]) : 0;
  const fadeFrac = Math.min(1, ageMs / fadeMs);

  const SALES_TYPES = new Set(['qualify','followup','reply','rates','nudge','respond','invoice','payment']);
  let ownerId;
  if (task.type === 'approve') ownerId = 'asher';
  else if (task.type === 'post' || task.type === 'live') ownerId = 'robert';
  else if (SALES_TYPES.has(task.type)) ownerId = lead.ownerId || 'sammy';
  else ownerId = lead.ownerId;
  const owner = USERS[ownerId];
  const isMine = window.V3.LeadIsMineForProfile(lead, user, ownerId);

  const hasBriefAction = task.action === 'open-brief';
  const openBrief = (e) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('v3:open-brief', { detail: { leadId: task.leadId } }));
  };

  let due;
  if (task.dueIn < 0)        due = { label: Math.abs(task.dueIn) + 'd late', tone: 'late' };
  else if (task.dueIn === 0) due = { label: 'today', tone: 'today' };
  else if (task.dueIn === 1) due = { label: 'tomorrow', tone: 'soon' };
  else                       due = { label: 'in ' + task.dueIn + 'd', tone: 'soon' };

  const cta = CTA_VERB[task.type] || 'Open';

  return (
    <div className={'now-card' + (isCompleted ? ' is-completed' : '') + (isMine ? ' for-you' : ' for-other')}
         style={{ '--fade': fadeFrac }}
         onClick={() => onOpenLead(lead.id)}>
      <button className={'now-card-check' + (isCompleted ? ' on' : '')}
              onClick={(e) => { e.stopPropagation(); onToggle(task); }}
              aria-label={isCompleted ? 'Mark incomplete' : 'Mark complete'}>
        {isCompleted && <V3Icon name="check" w={11} />}
      </button>

      <V3Avatar name={lead.contactName} color={lead.color} size="lg" />

      <div className="now-card-body">
        <div className="now-card-top">
          <span className="now-card-lead">{lead.contactName}</span>
          <span className="now-card-brand">{lead.brand}</span>
          <span className={'now-card-due tk-due-' + due.tone}>{due.label}</span>
        </div>

        <div className="now-card-action">{task.title}</div>

        {/* Deal context — what is this lead actually about */}
        <div className="now-card-context">
          {lead.deliverables && lead.deliverables !== '—' && (
            <span className="now-card-deliv"><V3Icon name="doc" w={10} /> {lead.deliverables}</span>
          )}
          {(() => {
            const last = lead.thread && lead.thread[lead.thread.length - 1];
            const snippet = last && (last.body || last.subject || '');
            const clean = snippet.replace(/\s+/g, ' ').trim().slice(0, 90);
            const stamp = last && window.V3.GmailTime.list(last.date || last.when);
            const stampTip = last && window.V3.GmailTime.tooltip(last.date || last.when);
            if (!clean) return null;
            return (
              <span className="now-card-snippet">
                {stamp && <span className="now-card-snippet-time" title={stampTip}>{stamp}</span>}
                <span className="now-card-snippet-text">"{clean}{snippet.length > 90 ? '…' : ''}"</span>
              </span>
            );
          })()}
        </div>

        {task.urgent && task.emailDeadlineNote && (
          <div className="now-card-quote">
            <V3Icon name="bolt" w={10} />
            <span>"{task.emailDeadlineNote}"</span>
          </div>
        )}

        <div className="now-card-stage-row">
          <span className="now-card-stage-name" style={{ color: stage.color }}>{stage.short}</span>
          <div className="now-card-stage-track">
            <div className="now-card-stage-fill" style={{ width: (Math.min(lead.daysInStage, 14) / 14 * 100) + '%', background: stage.color }} />
          </div>
          <span className="now-card-stage-days" style={{ color: stage.color }}>{lead.daysInStage}d</span>
        </div>

        <div className="now-card-meta">
          {task.value != null && <span className="now-card-value">{v3Money(task.value, { compact: true })}</span>}
          {!isMine && owner && (
            <span className="now-card-owner">
              <V3Avatar name={owner.name} color={owner.color} className="now-card-owner-pip" />
              For {owner.name}
            </span>
          )}
          {isMine && <span className="now-card-foryou">YOU</span>}
        </div>
      </div>

      <div className="now-card-actions" onClick={(e) => e.stopPropagation()}>
        {hasBriefAction ? (
          <button className="btn btn-primary now-card-cta" onClick={openBrief}>
            <V3Icon name="doc" w={12} /> Open brief
          </button>
        ) : (
          <button className="btn btn-accent now-card-cta" onClick={() => onOpenLead(lead.id)}>
            <V3Icon name={t.icon} w={12} /> {cta}
          </button>
        )}
        <button className="btn btn-ghost btn-sm now-card-secondary" onClick={() => onOpenLead(lead.id)}>
          Open →
        </button>
      </div>
    </div>
  );
}

// ─── NEXT zone — compact rows, grouped by tomorrow / this week
function NextZone({ buckets, ...ctx }) {
  const isEmpty = buckets.tomorrow.length === 0 && buckets.thisWeek.length === 0;
  if (isEmpty) {
    return (
      <div className="card" style={{ padding: '40px 24px', textAlign: 'center' }}>
        <V3Empty icon="cal" title="Nothing scheduled for tomorrow or this week." />
      </div>
    );
  }
  return (
    <>
      {buckets.tomorrow.length > 0 && (
        <CompactSection label="Tomorrow" sublabel="Heads up" items={buckets.tomorrow} {...ctx} />
      )}
      {buckets.thisWeek.length > 0 && (
        <CompactSection label="Later this week" sublabel="Next 2–7 days" items={buckets.thisWeek} {...ctx} />
      )}
    </>
  );
}

// ─── LATER zone — even more compressed, single section
function LaterZone({ buckets, ...ctx }) {
  if (buckets.upcoming.length === 0) {
    return (
      <div className="card" style={{ padding: '40px 24px', textAlign: 'center' }}>
        <V3Empty icon="cal" title="Nothing booked for the next 4 weeks." />
      </div>
    );
  }
  return <CompactSection label="Next 4 weeks" sublabel="Coming up" items={buckets.upcoming} {...ctx} />;
}

// ─── DONE zone — completed today
function DoneZone({ items, ...ctx }) {
  if (items.length === 0) {
    return (
      <div className="card" style={{ padding: '40px 24px', textAlign: 'center' }}>
        <V3Empty icon="check" title="Nothing checked off yet today." sub="Knock something out, and it'll show up here." />
      </div>
    );
  }
  return <CompactSection label="Completed today" sublabel="Nice work" items={items} done {...ctx} />;
}

function CompactSection({ label, sublabel, items, done, ...ctx }) {
  return (
    <section className="compact-section">
      <header className="compact-section-hd">
        <h2 className="compact-section-title">{label}</h2>
        <span className="compact-section-sub">{sublabel}</span>
        <span className="compact-section-count">{items.length}</span>
      </header>
      <div className="compact-section-body">
        {items.map(t => <CompactRow key={t.id} task={t} isDonePile={!!done} {...ctx} />)}
      </div>
    </section>
  );
}

function CompactRow({ task, user, onOpenLead, onToggle, completed, now, fadeMs, isDonePile }) {
  const { TASK_TYPES, STAGE_BY_ID, USERS } = window.V3;
  const t = TASK_TYPES[task.type] || { label: task.type, icon: 'doc', tone: 'reply' };
  const lead = task.lead;
  const stage = STAGE_BY_ID[lead.stage];
  const isCompleted = !!completed[task.id] || isDonePile;
  const ageMs = isCompleted && !isDonePile ? (now - completed[task.id]) : 0;
  const fadeFrac = Math.min(1, ageMs / fadeMs);

  const SALES_TYPES = new Set(['qualify','followup','reply','rates','nudge','respond','invoice','payment']);
  let ownerId;
  if (task.type === 'approve') ownerId = 'asher';
  else if (task.type === 'post' || task.type === 'live') ownerId = 'robert';
  else if (SALES_TYPES.has(task.type)) ownerId = lead.ownerId || 'sammy';
  else ownerId = lead.ownerId;
  const owner = USERS[ownerId];
  const isMine = window.V3.LeadIsMineForProfile(lead, user, ownerId);

  let due;
  if (task.dueIn < 0)        due = { label: Math.abs(task.dueIn) + 'd late', tone: 'late' };
  else if (task.dueIn === 0) due = { label: 'today', tone: 'today' };
  else if (task.dueIn === 1) due = { label: 'tomorrow', tone: 'soon' };
  else                       due = { label: 'in ' + task.dueIn + 'd', tone: 'soon' };

  return (
    <div className={'cr' + (isCompleted ? ' is-completed' : '') + (isDonePile ? ' in-pile' : '')}
         style={{ '--fade': fadeFrac }}
         onClick={() => onOpenLead(lead.id)}>
      <button className={'tk-check' + (isCompleted ? ' on' : '')}
              onClick={(e) => { e.stopPropagation(); onToggle(task); }}
              aria-label={isCompleted ? 'Mark incomplete' : 'Mark complete'}>
        {isCompleted && <V3Icon name="check" w={10} />}
      </button>
      <V3Avatar name={lead.contactName} color={lead.color} size="xs" />
      <div className="cr-body">
        <div className="cr-title">{task.title}</div>
        <div className="cr-sub">
          <span className="cr-brand">{lead.brand}</span>
          {lead.deliverables && lead.deliverables !== '—' && <span className="cr-deliv"> · {lead.deliverables}</span>}
          {!isMine && owner && <span className="cr-owner"> · for {owner.name}</span>}
          {(() => {
            const last = lead.thread && lead.thread[lead.thread.length - 1];
            const stamp = last && window.V3.GmailTime.list(last.date || last.when);
            const stampTip = last && window.V3.GmailTime.tooltip(last.date || last.when);
            return stamp ? <span className="cr-time" title={stampTip}> · {stamp}</span> : null;
          })()}
        </div>
        <div className="cr-stage-row">
          <span className="cr-stage-name" style={{ color: stage.color }}>{stage.short}</span>
          <div className="cr-stage-track">
            <div className="cr-stage-fill" style={{ width: (Math.min(lead.daysInStage, 14) / 14 * 100) + '%', background: stage.color }} />
          </div>
          <span className="cr-stage-days">{lead.daysInStage}d</span>
        </div>
      </div>
      {task.value != null && <div className="cr-value">{v3Money(task.value, { compact: true })}</div>}
      <div className={'tk-due tk-due-' + due.tone}>{due.label}</div>
    </div>
  );
}

// ─── Inbox ────────────────────────────────────────────────
function V4InboxView({ leads, user }) {
  const { STAGE_BY_ID, USERS } = window.V3;
  const [folder, setFolder] = React.useState('mine');
  const [selectedId, setSelectedId] = React.useState(null);
  const isShared = user !== 'robert';
  const laneLabel = isShared ? 'Shared lane' : "Robert's";
  const isRobert = user === 'robert';

  const folders = [
    { id: 'mine',    label: 'Your move',    icon: 'bolt',    fn: l => l.stage !== 'trash' && window.V3.MoveIsMineForProfile(l, user) && !['paid-out'].includes(l.stage), section: 'Quick' },
    { id: 'all',     label: 'All threads',  icon: 'inbox',   fn: l => l.stage !== 'trash',         section: 'Quick' },
    { id: 'unread',  label: 'Unread',       icon: 'mail',    fn: l => l.stage !== 'trash' && l.unread, section: 'Quick' },
    { id: 'engaged', label: 'Engaged',      icon: 'spark',   fn: l => l.stage !== 'trash' && l.stage === 'engaged',       section: 'By stage' },
    { id: 'rates',   label: 'Rates sent',   icon: 'send',    fn: l => l.stage !== 'trash' && l.stage === 'rates-sent',    section: 'By stage' },
    { id: 'nego',    label: 'Negotiating',  icon: 'reply',   fn: l => l.stage !== 'trash' && l.stage === 'negotiating',   section: 'By stage' },
    { id: 'invoice', label: 'Invoice sent', icon: 'invoice', fn: l => l.stage !== 'trash' && l.stage === 'invoice-sent',  section: 'By stage' },
    { id: 'trash',   label: 'Trash',        icon: 'trash',   fn: l => l.stage === 'trash',         section: 'By stage' },
    { id: 'lane',    label: laneLabel,      icon: 'leads',   fn: l => l.stage !== 'trash' && window.V3.LeadLane(l) === window.V3.ProfileLane(user), section: 'By owner' },
  ];

  const cur = folders.find(f => f.id === folder);
  const filtered = leads
    .filter(cur.fn)
    .sort((a, b) => V3TimestampForUi(b.lastTouchAt) - V3TimestampForUi(a.lastTouchAt));
  const isMobile = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
  const openLead = leads.find(l => l.id === selectedId) || (!isMobile && !selectedId ? filtered[0] : null);
  const sections = [...new Set(folders.map(f => f.section))];
  const showReader = Boolean(isMobile && selectedId && openLead);
  const moveThread = (lead, nextStage) => {
    window.V3.MoveLeadStage(lead, nextStage, leads);
    if (nextStage === 'trash' && folder !== 'trash' && String(selectedId) === String(lead.id)) {
      setSelectedId(null);
    }
  };

  return (
    <div className={'page inbox-page' + (showReader ? ' inbox-reader-open' : '')} style={{ overflow: 'hidden' }}>
      {!(showReader) && (
        <div className="page-hd inbox-page-hd">
        <div>
          <div className="page-eyebrow">{isRobert ? 'Robert' : 'Inbox'}</div>
          <h1 className="page-title">{isRobert ? 'Briefing' : 'Mail'}</h1>
          <div className="page-sub">
            {isRobert
              ? `${filtered.length} collaboration${filtered.length === 1 ? '' : 's'} in ${cur.label.toLowerCase()}`
              : `${filtered.length} thread${filtered.length === 1 ? '' : 's'} in ${cur.label.toLowerCase()}`}
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-sm"><V3Icon name="filter" /> Filter</button>
          <button className="btn btn-sm btn-accent"><V3Icon name="plus" /> {isRobert ? 'New note' : 'Compose'}</button>
        </div>
        </div>
      )}

      <div className={'inbox' + (showReader ? ' is-open' : '')}>
        <div className="in-folders">
          {sections.map(sec => (
            <React.Fragment key={sec}>
              <div className="in-folder-section">{sec}</div>
              {folders.filter(f => f.section === sec).map(f => (
                <div key={f.id} className="in-folder" aria-current={folder === f.id ? 'true' : undefined} onClick={() => { setFolder(f.id); setSelectedId(null); }}>
                  <V3Icon name={f.icon} />
                  <span>{f.label}</span>
                  <span className="in-folder-cnt">{leads.filter(f.fn).length}</span>
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>

        <div className="in-list">
          <div className="in-list-hd">
            <div className="in-list-hd-title">{cur.label}</div>
            <div className="in-list-hd-meta">{filtered.length}</div>
          </div>
          {filtered.length === 0 && <V3Empty icon="inbox" title="Zero inbox." />}
          {filtered.map(l => {
            const last = l.thread[l.thread.length - 1];
            const stage = STAGE_BY_ID[l.stage];
            const yourMove = window.V3.MoveIsMineForProfile(l, user);
            return (
              <div key={l.id}
                   className={'thread' + (l.unread ? ' is-unread' : '') + (openLead?.id === l.id ? ' is-active' : '')}
                   onClick={() => setSelectedId(l.id)}>
                <div className="thread-top">
                  <V3Avatar name={l.contactName} color={l.color} size="xs" />
                  <div className="thread-from">{l.contactName} · {l.brand}</div>
                  <div className="thread-time" title={window.V3.GmailTime.tooltip(l.lastTouchAt || last?.date || l.lastTouch)}>
                    {window.V3.GmailTime.list(l.lastTouchAt || last?.date || l.lastTouch) || l.lastTouch}
                  </div>
                  <button
                    className={l.stage === 'trash' ? "thread-restore-btn" : "thread-trash-btn"}
                    title={l.stage === 'trash' ? "Restore to New" : "Move to trash"}
                    aria-label={(l.stage === 'trash' ? 'Restore ' : 'Move ') + l.contactName + (l.stage === 'trash' ? ' to New' : ' to trash')}
                    onClick={e => { e.stopPropagation(); moveThread(l, l.stage === 'trash' ? 'new' : 'trash'); }}
                  >
                    <V3Icon name={l.stage === 'trash' ? "reply" : "trash"} w={12} />
                  </button>
                </div>
                <div className="thread-subject">{last?.subject}</div>
                <div className="thread-snippet">{(last?.body || '').replace(/\s+/g, ' ').trim().slice(0, 280)}</div>
                <div className="thread-tags">
                  {last?.pending && <span className="thread-tag pending">Pending sync</span>}
                  {yourMove && <span className="thread-tag your-move">Your move</span>}
                  {l.unread && !yourMove && <span className="thread-tag unread">New</span>}
                  <span className="thread-tag stage" style={{ color: stage.color, borderColor: 'currentColor' }}>{stage.short}</span>
                </div>
              </div>
            );
          })}
        </div>

        {openLead ? (
          <V4Reader lead={openLead} user={user} onBack={showReader ? () => setSelectedId(null) : null} onMoveStage={(nextStage) => moveThread(openLead, nextStage)} />
        ) : !isMobile ? (
          <div style={{ display: 'grid', placeItems: 'center', padding: 40 }}>
            <V3Empty icon="mail" title="Pick a thread." />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function fmtMsgDate(msg) {
  const v = msg.date || msg.when;
  return window.V3.GmailTime.full(v) || msg.when || '';
}
function fmtMsgRelative(msg) {
  const v = msg.date || msg.when;
  return window.V3.GmailTime.relative(v) || '';
}
function fmtMsgTooltip(msg) {
  const v = msg.date || msg.when;
  return window.V3.GmailTime.tooltip(v) || '';
}

function V4Reader({ lead, user, onBack, onMoveStage }) {
  const { STAGE_BY_ID, USERS } = window.V3;
  const [replyOpen, setReplyOpen] = React.useState(false);
  const last = lead.thread[lead.thread.length - 1];
  const stage = STAGE_BY_ID[lead.stage];
  const nextOwnerName = lead.nextMove.who ? USERS[lead.nextMove.who].name : `Awaiting ${lead.contactName.split(' ')[0]}`;
  const isMine = window.V3.MoveIsMineForProfile(lead, user);
  React.useEffect(() => {
    setReplyOpen(false);
  }, [lead.id]);
  return (
    <div className="reader">
      <div className="reader-hd">
        {onBack && (
          <button className="reader-back" onClick={onBack} aria-label="Back to threads">
            <V3Icon name="chev_l" w={14} />
            Threads
          </button>
        )}
        <div className="reader-title-row">
          <h2 className="reader-subject">{last?.subject}</h2>
          <button
            className="reader-reply-btn"
            type="button"
            onClick={() => setReplyOpen(true)}
          >
            <V3Icon name="reply" w={13} />
            Reply
          </button>
          <button
            className={lead.stage === 'trash' ? "reader-restore-btn" : "reader-trash-btn"}
            title={lead.stage === 'trash' ? "Restore to New" : "Move to trash"}
            onClick={() => onMoveStage?.(lead.stage === 'trash' ? 'new' : 'trash')}
          >
            <V3Icon name={lead.stage === 'trash' ? "reply" : "trash"} w={13} />
            {lead.stage === 'trash' ? 'Restore' : 'Trash'}
          </button>
        </div>
        <div className="reader-meta">
          <V3Avatar name={lead.contactName} color={lead.color} size="xs" />
          <strong>{lead.contactName}</strong>
          <span>· {lead.contactRole} at {lead.brand}</span>
          <span className="reader-meta-email">{lead.email}</span>
        </div>
      </div>
      <div className="reader-context">
        <div className="reader-context-block">
          <div className="reader-context-lbl">Where this stands</div>
          <div className="reader-context-val">
            <strong style={{ color: stage.color }}>{stage.name}</strong>
            <span style={{ color: 'var(--text-3)' }}> · {lead.daysInStage}d in stage · {lead.deliverables}</span>
          </div>
          <div style={{ marginTop: 6 }}><V3StageProg stageId={lead.stage} /></div>
        </div>
        <div className="reader-context-divider"></div>
        <div className="reader-context-block" style={{ textAlign: 'right' }}>
          <div className="reader-context-lbl">Next move</div>
          <div className="reader-context-val"><strong>{lead.nextMove.text}</strong></div>
          <div style={{ marginTop: 4, fontSize: 10.5, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em', color: isMine ? 'var(--accent-deep)' : 'var(--text-3)' }}>
            {isMine ? 'YOUR MOVE' : nextOwnerName + (lead.nextMove.who ? "'s move" : '')}
          </div>
        </div>
      </div>
      <div className="reader-body">
        <div className="act">
          {lead.thread.map((m, i) => {
            const senderEmail = m.from === 'Asher' ? 'asherunaligned@gmail.com'
                              : m.from === 'Sammy' ? 'unalignedx@gmail.com'
                              : m.from === 'Robert' ? 'scobleizer@gmail.com'
                              : V3ExtractEmail(m.from) || lead.email;
            const isInbound = !['Asher','Sammy','Robert','UNALIGNED'].includes(m.from);
            const toLabel = isInbound ? 'to me' : 'to ' + lead.contactName.split(' ')[0];
            const toLine = Array.isArray(m.to) ? m.to.join(', ') : '';
            const ccLine = Array.isArray(m.cc) ? m.cc.join(', ') : '';
            return (
              <div key={i} className="act-item">
                <div className="act-item-hd">
                  <V3Avatar name={m.from} color={m.from === 'Sammy' ? '#1f8a5b' : m.from === 'Asher' ? '#15171c' : lead.color} size="xs" />
                  <div className="act-item-sender">
                    <div className="act-item-from-row">
                      <span className="from">{m.from}</span>
                      <span className="from-email">&lt;{senderEmail}&gt;</span>
                      {m.pending && <span className="act-item-pending">Pending sync</span>}
                    </div>
                    {(toLine || ccLine) && (
                      <div className="act-item-participants">
                        {toLine && <span><strong>To:</strong> {toLine}</span>}
                        {ccLine && <span><strong>Cc:</strong> {ccLine}</span>}
                      </div>
                    )}
                    <div className="act-item-to">{toLabel}</div>
                  </div>
                  <div className="act-item-time-wrap">
                    {fmtMsgDate(m) ? (
                      <>
                        <span className="time" title={fmtMsgTooltip(m)}>{fmtMsgDate(m)}</span>
                        {fmtMsgRelative(m) && <span className="time-rel">{fmtMsgRelative(m)}</span>}
                      </>
                    ) : m.when ? (
                      <span className="time">{m.when}</span>
                    ) : null}
                  </div>
                </div>
                <div className="act-item-body">{m.body}</div>
              </div>
            );
          })}
        </div>
      </div>
      {replyOpen ? (
        <div className="drawer-foot reader-reply-panel">
          <div className="reader-reply-panel-top">
            <strong>Reply to {lead.contactName.split(' ')[0]}</strong>
            <button className="btn btn-sm btn-ghost" type="button" onClick={() => setReplyOpen(false)}>
              <V3Icon name="x" w={12} />
              Hide
            </button>
          </div>
          <V3InlineReply lead={lead} user={user} />
        </div>
      ) : null}
    </div>
  );
}

// ─── Leads list ─────────────────────────────────────────────
function V4LeadsView({ leads, openId, onOpenLead, user }) {
  const { USERS, STAGE_BY_ID } = window.V3;
  const [tab, setTab] = React.useState('active');
  const tabs = [
    { id: 'active',  label: 'Active',   fn: l => !['paid-out','trash'].includes(l.stage) },
    { id: 'mine',    label: 'My move',  fn: l => window.V3.MoveIsMineForProfile(l, user) && !['paid-out','trash'].includes(l.stage) },
    { id: 'waiting', label: 'Waiting',  fn: l => !l.nextMove.who && !['paid-out','trash'].includes(l.stage) },
    { id: 'paid',    label: 'Paid out', fn: l => l.stage === 'paid-out' },
    { id: 'trash',   label: 'Trash',    fn: l => l.stage === 'trash' },
    { id: 'all',     label: 'All',      fn: () => true },
  ];
  const filtered = leads.filter(tabs.find(t => t.id === tab).fn);
  const moveLead = (lead, nextStage) => window.V3.MoveLeadStage(lead, nextStage, leads);

  return (
    <div className="page">
      <div className="page-hd">
        <div>
          <div className="page-eyebrow">Pipeline</div>
          <h1 className="page-title">Network</h1>
          <div className="page-sub">All your collaborations in one table.</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-sm"><V3Icon name="filter" /> Filter</button>
          <button className="btn btn-sm"><V3Icon name="sort" /> Sort</button>
          <button className="btn btn-sm btn-accent"><V3Icon name="plus" /> New lead</button>
        </div>
      </div>

      <div className="body" style={{ paddingTop: 8 }}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: '1px solid var(--line)' }}>
          {tabs.map(t => {
            const n = leads.filter(t.fn).length;
            const active = tab === t.id;
            return (
              <button key={t.id} className="hd-nav-btn" aria-current={active ? 'page' : undefined}
                      onClick={() => setTab(t.id)}
                      style={{ background: active ? 'transparent' : undefined, color: active ? 'var(--text)' : 'var(--text-3)', marginBottom: -1, borderBottom: active ? '2px solid var(--text)' : '2px solid transparent', borderRadius: 0 }}>
                {t.label} <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, marginLeft: 4, opacity: 0.6 }}>{n}</span>
              </button>
            );
          })}
        </div>

        <div className="card">
          <div className="lead-row hd-row">
            <div>Contact / Brand</div>
            <div>Next move</div>
            <div>Stage</div>
            <div>Owner</div>
            <div style={{ textAlign: 'right' }}>Value</div>
            <div style={{ textAlign: 'right' }}>Action</div>
          </div>
          {filtered.length === 0 && <V3Empty icon="leads" title="Nothing here." />}
          {filtered.map(l => {
            const owner = l.ownerId ? USERS[l.ownerId] : null;
            const isMine = window.V3.MoveIsMineForProfile(l, user);
            const stage = STAGE_BY_ID[l.stage];
            return (
              <div key={l.id} className={'lead-row' + (openId === l.id ? ' is-active' : '')} onClick={() => onOpenLead(l.id)}>
                <div className="lead-name">
                  <V3Avatar name={l.contactName} color={l.color} />
                  <div className="lead-name-txt">
                    <strong>{l.contactName}</strong>
                    <span>{l.brand} · {l.contactRole}</span>
                  </div>
                </div>
                <div>
                  <div className={'lead-next-txt' + (isMine ? ' you' : '')}>
                    <V3Icon name={isMine ? 'bolt' : 'clock'} w={11} className="ic" />
                    <span style={{ marginLeft: 5 }}>{l.nextMove.text}</span>
                  </div>
                  <div className="lead-next-meta">{isMine ? 'Your move' : l.nextMove.who ? `${window.V3.USERS[l.nextMove.who].name}'s move` : `Waiting on ${l.contactName.split(' ')[0]}`}</div>
                </div>
                <div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: stage.color, fontWeight: 500, fontSize: 12 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: stage.color }}></span>
                    {stage.name}
                  </div>
                  <div style={{ marginTop: 5 }}><V3StageProg stageId={l.stage} /></div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  {owner ? <><V3Avatar name={owner.name} color={owner.color} size="xs" /><span>{owner.name}</span></> : <span style={{ color: 'var(--text-3)' }}>—</span>}
                </div>
                <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 12.5 }}>
                  {l.value ? v3Money(l.value, { compact: true }) : '—'}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <button
                    className={l.stage === 'trash' ? "lead-restore-btn" : "lead-trash-btn"}
                    title={l.stage === 'trash' ? "Restore to New" : "Move to trash"}
                    onClick={e => { e.stopPropagation(); moveLead(l, l.stage === 'trash' ? 'new' : 'trash'); }}
                  >
                    <V3Icon name={l.stage === 'trash' ? "reply" : "trash"} w={12} />
                    {l.stage === 'trash' ? 'Restore' : 'Trash'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Calendar ────────────────────────────────────────────────
const CAL_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby7SNgq-2mlzm5JkVHkbo0fsa1fOHIh6KPFfKqvPPLoFYYUvYZv94z2-KMdweTbAYVw9A/exec';
const CAL_TZ = 'America/Los_Angeles';

const EMPTY_FORM = { title: '', date: '', startTime: '09:00', endTime: '10:00', location: '', allDay: false };

// Split a summary into a highlighted opening "gist" + the rest, skipping
// sentence breaks that are really abbreviations ("Mt.", "Inc.", "U.S.") or
// initials, so the gist is a clean first line rather than a mid-word cut.
const V4_GIST_ABBR = /\b(mt|st|inc|ltd|co|corp|dr|mr|mrs|ms|jr|sr|vs|etc|approx|no|fig|dept|gov|u\.s|a\.m|p\.m|e\.g|i\.e)\.$/i;
function V4SplitGist(text) {
  const s = String(text || '').trim();
  const re = /([.!?])\s+(?=[A-Z0-9"'“‘])/g;
  let m;
  while ((m = re.exec(s))) {
    const head = s.slice(0, m.index + 1);
    if (head.trim().length < 20) continue;
    if (m[1] === '.' && (V4_GIST_ABBR.test(head) || /\b[A-Z]\.$/.test(head))) continue;
    if (head.length <= 200) return { gist: head.trim(), detail: s.slice(m.index + 1).trim() };
    break; // first sentence is a long run-on — fall through to a word-boundary cut
  }
  // No usable sentence break (e.g. a run-on with a URL): cut at a word boundary
  // so the gist stays a short headline and the remainder becomes detail.
  if (s.length > 150) {
    let cut = s.slice(0, 140);
    const sp = cut.lastIndexOf(' ');
    if (sp > 90) cut = cut.slice(0, sp);
    return { gist: cut.trim(), detail: s.slice(cut.length).trim() };
  }
  return { gist: s, detail: '' };
}

function V4NewLeadHasPricingSignal(lead) {
  const text = [
    lead?.notes,
    lead?.evidence,
    lead?.deliverables,
    lead?.nextMove?.text,
    lead?.thread?.[0]?.subject,
    lead?.thread?.[0]?.body,
  ].filter(Boolean).join(' ');
  return /\b(rate|pricing|budget|quote|quoted|paid|payment|invoice|sponsor|sponsorship|deliverable|package|repost)\b/i.test(text);
}

function V4NewLeadWorkflowLabel(lead) {
  if (V4NewLeadHasPricingSignal(lead)) return 'Route to pricing';
  return 'Route to scope';
}

function V4NewLeadsView({ leads = [], query = '', onOpenLead }) {
  const q = String(query || '').trim();
  const [sourceTab, setSourceTab] = React.useState('gmail');
  // A lead belongs to the New Leads queue by its source, independent of stage —
  // reuse IsNewLeadReview with a forced 'new' stage so the same source rules
  // also identify trashed intake leads for the Trash bin.
  const isReviewSource = (lead) => window.V3.IsNewLeadReview ? window.V3.IsNewLeadReview({ ...lead, stage: 'new' }) : true;
  const sortByActivity = (a, b) => (window.V3SortLeadsByActivity ? window.V3SortLeadsByActivity(a, b) : V3TimestampForUi(b.lastTouchAt || b.receivedAt) - V3TimestampForUi(a.lastTouchAt || a.receivedAt));

  const reviewLeads = React.useMemo(() => {
    const source = (Array.isArray(leads) ? leads : []).filter(lead => {
      if (window.V3.IsNewLeadReview) return window.V3.IsNewLeadReview(lead);
      return lead && lead.stage === 'new';
    });
    return source
      .filter(lead => window.V3.LeadMatchesQuery ? window.V3.LeadMatchesQuery(lead, q) : true)
      .sort(sortByActivity);
  }, [leads, q]);

  const trashLeads = React.useMemo(() => {
    return (Array.isArray(leads) ? leads : [])
      .filter(lead => lead && lead.stage === 'trash' && isReviewSource(lead))
      .filter(lead => window.V3.LeadMatchesQuery ? window.V3.LeadMatchesQuery(lead, q) : true)
      .sort(sortByActivity);
  }, [leads, q]);

  const counts = {
    total: reviewLeads.length,
    needsReply: reviewLeads.filter(l => l.needsReply).length,
    pricing: reviewLeads.filter(l => /rate|pricing|paid|sponsor|quote|repost/i.test([l.notes, l.evidence, l.nextMove?.text].join(' '))).length,
    scope: reviewLeads.filter(l => !V4NewLeadHasPricingSignal(l)).length,
    gmail: reviewLeads.filter(l => (window.V3.NewLeadSourceKind ? window.V3.NewLeadSourceKind(l) : 'gmail') === 'gmail').length,
    x: reviewLeads.filter(l => (window.V3.NewLeadSourceKind ? window.V3.NewLeadSourceKind(l) : 'gmail') === 'x').length,
    trash: trashLeads.length,
  };

  const moveLead = (lead, nextStage) => {
    window.V3.MoveLeadStage(lead, nextStage, leads);
  };

  const isTrashTab = sourceTab === 'trash';
  const visibleLeads = React.useMemo(() => {
    if (isTrashTab) return trashLeads;
    return reviewLeads.filter(lead => {
      const kind = window.V3.NewLeadSourceKind ? window.V3.NewLeadSourceKind(lead) : 'gmail';
      return sourceTab === 'x' ? kind === 'x' : kind === 'gmail';
    });
  }, [reviewLeads, trashLeads, sourceTab, isTrashTab]);

  const groupedLeads = React.useMemo(() => {
    const groups = new Map();
    for (const lead of visibleLeads) {
      const stamp = window.V3LeadReceivedTimestamp ? window.V3LeadReceivedTimestamp(lead) : V3TimestampForUi(lead.receivedAt || lead.lastTouchAt);
      const date = stamp ? new Date(stamp) : null;
      const key = date ? date.toDateString() : 'No date';
      const label = date
        ? date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
        : 'No date';
      if (!groups.has(key)) groups.set(key, { key, label, items: [] });
      groups.get(key).items.push(lead);
    }
    return Array.from(groups.values());
  }, [visibleLeads]);

  return (
    <div className="page new-leads-page">
      <div className="page-hd">
        <div>
          <div className="page-eyebrow">Robert + Asher intake</div>
          <h1 className="page-title">New Leads</h1>
          <div className="page-sub">A clean intake queue for Robert Gmail and Robert X leads, sorted newest to oldest before they enter the active board.</div>
        </div>
        <div className="invoice-stats">
          <span className="invoice-stat warn">{counts.needsReply} need reply</span>
          <span className="invoice-stat good">{counts.scope} route to scope</span>
          <span className="invoice-stat total">{counts.pricing} route to pricing</span>
          <span className="invoice-stat total">{counts.gmail} gmail</span>
          <span className="invoice-stat total">{counts.x} x</span>
          <span className="invoice-stat total">{counts.total} total</span>
        </div>
      </div>

      <div className="new-leads-shell">
        <div className="new-leads-tabs" role="tablist" aria-label="New lead sources">
          {[
            { key: 'gmail', label: 'Gmail', count: counts.gmail },
            { key: 'x', label: 'X', count: counts.x },
            { key: 'trash', label: 'Trash', count: counts.trash },
          ].map(tab => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={sourceTab === tab.key}
              className={'new-leads-tab' + (sourceTab === tab.key ? ' is-active' : '')}
              onClick={() => setSourceTab(tab.key)}
            >
              <span>{tab.label}</span>
              <strong>{tab.count}</strong>
            </button>
          ))}
        </div>
        {groupedLeads.map(group => (
          <section key={group.key} className="new-lead-day">
            <div className="new-lead-day-hd">
              <span>{group.label}</span>
              <strong>{group.items.length}</strong>
            </div>
            {group.items.map(lead => {
              const latest = Array.isArray(lead.thread) && lead.thread.length ? lead.thread[lead.thread.length - 1] : null;
              const first = Array.isArray(lead.thread) && lead.thread.length ? lead.thread[0] : null;
              const kind = window.V3.NewLeadSourceKind ? window.V3.NewLeadSourceKind(lead) : 'gmail';
              const summary = window.V3.NewLeadSummary ? window.V3.NewLeadSummary(lead) : String(lead.notes || latest?.body || lead.nextMove?.text || '').replace(/\s+/g, ' ').trim();
              // Pull the opening sentence out as a highlighted "gist" so the
              // intent ("X is asking for an intro") pops on the list; the rest
              // of the message reads as lighter supporting detail beneath it.
              const { gist: summaryGist, detail: summaryDetail } = V4SplitGist(summary);
              const source = window.V3.NewLeadSourceLabel ? window.V3.NewLeadSourceLabel(lead) : 'Gmail';
              const handle = window.V3.NewLeadHandle ? window.V3.NewLeadHandle(lead) : '';
              const identity = window.V3.NewLeadPrimaryIdentity ? window.V3.NewLeadPrimaryIdentity(lead) : (lead.contactName || 'Unknown contact');
              const reason = window.V3NewLeadReason ? window.V3NewLeadReason(lead) : 'Needs review';
              const receivedStamp = window.V3.GmailTime.full(lead.receivedAt || first?.date || first?.when);
              const receivedListStamp = window.V3.GmailTime.list(lead.receivedAt || first?.date || first?.when) || lead.lastTouch || 'new';
              const brandRaw = String(lead.brand || '').trim();
              const isPlaceholderBrand = /^(gmail|x|x lead|unknown.*)$/i.test(brandRaw);
              const metaBrand = brandRaw && !isPlaceholderBrand && brandRaw.toLowerCase() !== String(identity || '').trim().toLowerCase() ? lead.brand : '';
              const hasPricingSignal = V4NewLeadHasPricingSignal(lead);
              const workflowLabel = V4NewLeadWorkflowLabel(lead);
              const xSecondary = [handle, lead.email || '', metaBrand].filter(Boolean);
              const gmailSecondary = [lead.email || '', metaBrand].filter(Boolean);
              return (
                <article key={lead.id} className="new-lead-card new-lead-row">
                  <div className="new-lead-main">
                    <div className="new-lead-avatar">
                      <V3Avatar name={lead.contactName} color={lead.color} size="sm" />
                    </div>
                    <div className="new-lead-content">
                      <div className="new-lead-topline">
                        <div className="new-lead-topline-main">
                          <span className={'new-lead-source-chip' + (kind === 'x' ? ' is-x' : '')}>{source}</span>
                          <h2>{identity}</h2>
                        </div>
                        <span title={receivedStamp || undefined}>{receivedListStamp}</span>
                      </div>
                      <div className="new-lead-meta">
                        {kind === 'x' ? (
                          <>
                            {xSecondary.map((item, index) => index === 0 ? <strong key={item}>{item}</strong> : <span key={item}>{item}</span>)}
                          </>
                        ) : (
                          <>
                            {gmailSecondary.map((item, index) => index === 0 ? <strong key={item}>{item}</strong> : <span key={item}>{item}</span>)}
                          </>
                        )}
                      </div>
                      <div className="new-lead-reason-row">
                        <span className="new-lead-reason">{reason}</span>
                        <span className={'new-lead-workflow-chip' + (hasPricingSignal ? ' is-pricing' : ' is-scope')}>{workflowLabel}</span>
                        {kind === 'x' && lead.xMessageCount ? <span>{lead.xMessageCount} messages</span> : null}
                      </div>
                      {summaryGist ? (
                        <div className="new-lead-gist">
                          <p className="new-lead-gist-line">{summaryGist}</p>
                          {summaryDetail && <p className="new-lead-summary">{summaryDetail}</p>}
                        </div>
                      ) : (
                        <p className="new-lead-summary">No summary available yet.</p>
                      )}
                    </div>
                  </div>
                  <div className="new-lead-actions">
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => onOpenLead?.(lead.id)}>
                      <V3Icon name="reply" w={12} />
                      {kind === 'x' ? 'Review lead' : 'Open & reply'}
                    </button>
                    {kind === 'x' && lead.xOpenDm ? (
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => window.open(lead.xOpenDm, '_blank', 'noopener')}>
                        <V3Icon name="network" w={12} />
                        Open DM
                      </button>
                    ) : null}
                    {kind === 'x' && lead.email ? (
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => onOpenLead?.(lead.id)}>
                        <V3Icon name="mail" w={12} />
                        Email lead
                      </button>
                    ) : null}
                    {isTrashTab ? (
                      <button type="button" className="btn btn-sm btn-accent" onClick={() => moveLead(lead, 'new')}>
                        <V3Icon name="reply" w={12} />
                        Restore
                      </button>
                    ) : (
                      <>
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => moveLead(lead, 'first-touch')}>
                          <V3Icon name="plus" w={12} />
                          Scope
                        </button>
                        <button type="button" className="btn btn-sm btn-accent" onClick={() => moveLead(lead, hasPricingSignal ? 'rates-sent' : 'engaged')}>
                          <V3Icon name="plus" w={12} />
                          {hasPricingSignal ? 'Pricing' : 'Qualify'}
                        </button>
                        <button type="button" className="btn btn-sm btn-danger" onClick={() => moveLead(lead, 'trash')}>
                          <V3Icon name="trash" w={12} />
                          Trash
                        </button>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        ))}
        {visibleLeads.length === 0 && (
          <V3Empty
            icon={isTrashTab ? 'trash' : 'leads'}
            title={isTrashTab ? 'Trash is empty.' : (sourceTab === 'x' ? 'No X leads synced yet.' : 'No Gmail leads waiting.')}
            sub={isTrashTab
              ? 'Leads you trash land here and stay out of the scrape. Restore one to send it back to its queue.'
              : (sourceTab === 'x'
                ? 'The X scraper lane is ready. New X leads will appear here as they sync in.'
                : 'Fresh Robert Gmail leads will appear here before they enter the board.')}
          />
        )}
      </div>
    </div>
  );
}

function V4CalendarView({ query = '' }) {
  const [events, setEvents]   = React.useState(null);
  const [err, setErr]         = React.useState(null);
  const [form, setForm]       = React.useState(null); // null = closed; { mode:'create'|'edit', ev, fields }
  const [saving, setSaving]   = React.useState(false);
  const q = String(query || '').trim().toLowerCase();
  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time';
  const tzLabel = localTz === CAL_TZ
    ? 'Pacific Time'
    : `Pacific Time · Your time (${localTz.replace(/_/g, ' ')})`;

  function load() {
    fetch(CAL_SCRIPT_URL)
      .then(r => r.json())
      .then(data => setEvents(data))
      .catch(e => setErr(String(e)));
  }

  React.useEffect(load, []);

  function dayKey(offset) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toLocaleDateString('en-CA', { timeZone: CAL_TZ });
  }

  function eventKey(ev) {
    return new Date(ev.start).toLocaleDateString('en-CA', { timeZone: CAL_TZ });
  }

  function fmtTime(iso, allDay) {
    if (allDay) return 'All day';
    const pt = new Date(iso).toLocaleTimeString('en-US', {
      timeZone: CAL_TZ,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    const et = new Date(iso).toLocaleTimeString('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    return `${pt} PT · ${et} ET`;
  }

  function fullDate(offset) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toLocaleDateString('en-US', { timeZone: CAL_TZ, weekday: 'long', month: 'long', day: 'numeric' });
  }

  function openCreate(dayOffset) {
    setForm({ mode: 'create', ev: null, fields: { ...EMPTY_FORM, date: dayKey(dayOffset) } });
  }

  function openEdit(ev) {
    const d = new Date(ev.start);
    const pad = n => String(n).padStart(2, '0');
    const localTime = t => {
      const dt = new Date(t);
      const h = pad(dt.toLocaleString('en-US', { timeZone: CAL_TZ, hour: '2-digit', hour12: false }).replace('24','00'));
      const m = pad(dt.toLocaleString('en-US', { timeZone: CAL_TZ, minute: '2-digit' }));
      return `${h}:${m}`;
    };
    setForm({
      mode: 'edit',
      ev,
      fields: {
        title:     ev.title,
        date:      eventKey(ev),
        startTime: ev.allDay ? '09:00' : localTime(ev.start),
        endTime:   ev.allDay ? '10:00' : localTime(ev.end),
        location:  ev.location || '',
        allDay:    ev.allDay,
      },
    });
  }

  function setField(k, v) {
    setForm(f => ({ ...f, fields: { ...f.fields, [k]: v } }));
  }

  function buildDatetime(date, time) {
    return new Date(`${date}T${time}:00`).toISOString();
  }

  async function handleSave() {
    const { mode, ev, fields } = form;
    setSaving(true);
    const body = mode === 'create'
      ? { action: 'create', title: fields.title, allDay: fields.allDay,
          start: buildDatetime(fields.date, fields.startTime),
          end:   buildDatetime(fields.date, fields.endTime),
          location: fields.location }
      : { action: 'update', id: ev.id,
          searchStart: new Date(ev.start).toISOString(),
          searchEnd:   new Date(ev.end).toISOString(),
          title: fields.title, allDay: fields.allDay,
          start: buildDatetime(fields.date, fields.startTime),
          end:   buildDatetime(fields.date, fields.endTime),
          location: fields.location };
    await fetch(CAL_SCRIPT_URL, { method: 'POST', body: JSON.stringify(body) });
    setSaving(false);
    setForm(null);
    setEvents(null);
    load();
  }

  async function handleDelete() {
    const { ev } = form;
    setSaving(true);
    await fetch(CAL_SCRIPT_URL, { method: 'POST', body: JSON.stringify({
      action: 'delete', id: ev.id,
      searchStart: new Date(ev.start).toISOString(),
      searchEnd:   new Date(ev.end).toISOString(),
    })});
    setSaving(false);
    setForm(null);
    setEvents(null);
    load();
  }

  const days = [-1, 0, 1].map(offset => ({
    offset,
    label: offset === -1 ? 'Yesterday' : offset === 0 ? 'Today' : 'Tomorrow',
    sub: fullDate(offset),
    key: dayKey(offset),
    items: (events || []).filter(ev => eventKey(ev) === dayKey(offset))
                         .filter(ev => !q || [ev.title, ev.location, ev.description].join(' ').toLowerCase().includes(q))
                         .sort((a, b) => new Date(a.start) - new Date(b.start)),
  }));

  return (
    <div className="page">
      <div className="page-hd">
        <div>
          <div className="page-eyebrow">Robert Scoble</div>
          <h1 className="page-title">Schedule</h1>
          <div className="page-sub">Yesterday · Today · Tomorrow · {tzLabel}</div>
        </div>
      </div>

      <div className="body" style={{ paddingTop: 8 }}>
        {err && (
          <div className="card" style={{ padding: 20, color: 'var(--text-3)', fontSize: 13 }}>
            Could not load calendar: {err}
          </div>
        )}
        {!err && !events && (
          <div className="card" style={{ padding: 24, color: 'var(--text-3)', fontSize: 13 }}>
            Loading Robert's schedule…
          </div>
        )}
        {!err && events && (
          <div className="cal-3col">
            {days.map(day => (
              <div key={day.key} className={'cal-day' + (day.offset === 0 ? ' cal-day-today' : '')}>
                <div className="cal-day-hd">
                  <span className="cal-day-label">{day.label}</span>
                  <span className="cal-day-date">{day.sub}</span>
                  <button className="cal-add-btn" onClick={() => openCreate(day.offset)} title="Add event">+</button>
                </div>
                <div className="cal-day-body">
                  {day.items.length === 0 && <div className="cal-empty">{q ? 'No matching events' : 'Nothing scheduled'}</div>}
                  {day.items.map((ev, i) => (
                    <div key={i} className={'cal-event' + (ev.allDay ? ' cal-event-allday' : '')} onClick={() => openEdit(ev)} style={{ cursor: 'pointer' }}>
                      <div className="cal-event-time">{fmtTime(ev.start, ev.allDay)}</div>
                      <div className="cal-event-title">{ev.title}</div>
                      {ev.location && <div className="cal-event-loc">{ev.location}</div>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Event form modal ─── */}
      {form && (
        <div className="cal-modal-overlay" onClick={() => setForm(null)}>
          <div className="cal-modal" onClick={e => e.stopPropagation()}>
            <div className="cal-modal-hd">
              <span>{form.mode === 'create' ? 'New Event' : 'Edit Event'}</span>
              <button className="cal-modal-close" onClick={() => setForm(null)}>✕</button>
            </div>

            <div className="cal-modal-body">
              <label className="cal-field">
                <span>Title</span>
                <input value={form.fields.title} onChange={e => setField('title', e.target.value)} placeholder="Event title" autoFocus />
              </label>
              <label className="cal-field">
                <span>Date</span>
                <input type="date" value={form.fields.date} onChange={e => setField('date', e.target.value)} />
              </label>
              <label className="cal-field cal-field-check">
                <input type="checkbox" checked={form.fields.allDay} onChange={e => setField('allDay', e.target.checked)} />
                <span>All day</span>
              </label>
              {!form.fields.allDay && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <label className="cal-field" style={{ flex: 1 }}>
                    <span>Start</span>
                    <input type="time" value={form.fields.startTime} onChange={e => setField('startTime', e.target.value)} />
                  </label>
                  <label className="cal-field" style={{ flex: 1 }}>
                    <span>End</span>
                    <input type="time" value={form.fields.endTime} onChange={e => setField('endTime', e.target.value)} />
                  </label>
                </div>
              )}
              <label className="cal-field">
                <span>Location</span>
                <input value={form.fields.location} onChange={e => setField('location', e.target.value)} placeholder="Optional" />
              </label>
            </div>

            <div className="cal-modal-foot">
              {form.mode === 'edit' && (
                <button className="cal-btn-delete" onClick={handleDelete} disabled={saving}>Delete</button>
              )}
              <button className="cal-btn-save" onClick={handleSave} disabled={saving || !form.fields.title}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { V4TodayView, V4RobertBriefView, V4InboxView, V4LeadsView, V4NewLeadsView, V4CalendarView });


// Company OS Beta — full port of the localhost Hermes Workspace UI.
// Built on the gh-pages flow-v4 stack (inline Babel JSX + vanilla CSS).

// ─────────────────────────────────────────────────────────────
// Static brief content — Daily Operating Brief lives here
// ─────────────────────────────────────────────────────────────

const V4_COMPANY_OS_PREP = [
  {
    title: 'iLands / Flot monthly package',
    tags: ['P0', 'copy overdue', 'June 26 target'],
    points: [
      'Zoe pushed again on June 22, 2026 because the draft deadline already passed and the sponsor still needs Robert copy before they can finish the video production.',
      'This is still package-fulfillment work, not a fresh invoice lane: Robert only owes copy, while the sponsor handles the video and images.',
      'The June 26 release target still stands, but the official source quote-post URL is still missing and Asher has not yet returned a clear delivery timing for the copy.',
      'Asher owns the reply, the shortest useful 60-second Robert brief, and the final go/no-go timing. Do not call this ready while the copy is still missing.',
    ],
  },
  {
    title: 'Riverside / launch-copy approval',
    tags: ['P0', 'draft owed', 'after June 24'],
    points: [
      'The interview is done, but Savion changed the next step on June 21, 2026: Riverside now wants draft X copy plus the Facebook cross-post for review before anything goes live.',
      'Savion said the post can run any time after June 24, 2026 once the messaging, tags, and launch framing are signed off, so the old "hold for launch" note is obsolete.',
      'Robert already asked for the official press-release language so he can align wording with the launch. That means the live blocker is no longer scheduling the interview; it is copy prep and approval.',
      'Asher owns one clean handoff: exact tags, approval path, draft copy, and final go-live window. Treat this as execution prep, not passive waiting.',
    ],
  },
  {
    title: 'Acti / June 30 QRT',
    tags: ['P0', 'paid', 'slot to hold'],
    points: [
      'AK wrote on June 22, 2026 with the exact launch timing: the official announcement tweet goes live on June 30 at 7:30 AM PT, and they want Robert queued right behind it.',
      'Payment is already confirmed on this thread, so the active work is no longer billing. The active work is draft prep, launch alignment, and protecting the time slot.',
      'AK also asked for draft quote copy in the next couple of days using the confidential launch video and the existing agentic-keyboard brief.',
      'Asher owns the Robert brief, the draft-review loop, and the final source-tweet handoff on launch morning. Do not reopen payment terms on a thread that is already paid.',
    ],
  },
  {
    title: 'Eastworlds / paid by wire',
    tags: ['P0', 'wire receipt', 'schedule pending'],
    points: [
      'Ong Xie sent the Eastworlds wire receipt on June 19, 2026, Asher turned the updated draft around the same day, and Sean replied on June 20, 2026 that next week works for posting.',
      'That moved Eastworlds forward, but it did not close it. There is still no bank settlement confirmation and no exact posting date.',
      'Asher owns the remaining cleanup: settled-payment confirmation, sponsor notes on the revised draft, and one real calendar day for launch.',
      'A wire receipt plus "next week" is enough to keep preparing, not enough to mark the item paid and ready.',
    ],
  },
  {
    title: 'ACL / Hockey Stick',
    tags: ['P0', 'past due', 'payment first'],
    points: [
      'Chang acknowledged the updated ACL invoice thread on June 19, 2026, but the June 20 due date is now past and no payment proof landed in-thread.',
      'The ticket reimbursement issue is still unresolved beyond Annika\'s note that Alibaba will not reimburse the purchased pass, which means the commercial mess is not cleaned up yet.',
      'Asher already has a follow-up draft asking whether the updated invoice and Stripe link came through. That is still draft-state, which means the payment chase is not actually finished.',
      'Keep Robert execution out of this until money, reimbursement exposure, and client timing are clean. A final brief is not clearance when the invoice is still unpaid.',
    ],
  },
  {
    title: 'Viture / July 1 retainer start',
    tags: ['P1', 'option A accepted', 'scope draft unsent'],
    points: [
      'Emily said on June 21, 2026 that Viture wants to move forward with Option A and start on July 1, carrying the first phase through CES.',
      'Asher already drafted the reply confirming the $5,995/month kickoff, but that message is still sitting in Drafts rather than closing the commercial scope in-thread.',
      'The remaining Asher work is straightforward: send the short scope, lock the approval workflow and payment timing, and schedule the first strategy sync.',
      'Treat this as commercial prep, not a Robert execution brief. First get the retainer scope over the line.',
    ],
  },
  {
    title: 'OMANE / Nitro proof + Viktor data',
    tags: ['P1', 'proof missing', 'data follow-up'],
    points: [
      'Ori\'s June 19, 2026 screenshot only proved the Nitrosend transfer was scheduled for Monday, June 22, 2026. It did not prove the money actually settled against invoice_Omane_NitroSend_061726.pdf.',
      'Separately, Ori asked on June 21, 2026 for the Viktor post views/data form so he could report back Monday morning Europe time.',
      'Asher still owns both cleanup tasks: capture real payment proof once the transfer lands and make sure the Robert-side Viktor metrics request is not dropped.',
      'Do not close OMANE just because the post went live. Proof trails and post-live data requests still count as active work.',
    ],
  },
];

const V4_COMPANY_OS_WAITING = [
  {
    title: 'Marketing Guys / RunLayer',
    tags: ['watch', 'brief promised Monday', 'not locked'],
    points: [
      'Phillip pitched the next QRT on June 19, 2026 for Wednesday at 7:30 AM PT and said the rest of the materials would likely arrive on Monday, June 22, 2026.',
      'Asher already answered with the correct guardrails: full brief, final target post, timing, billing/payment details, and quote guidance first.',
      'Until those materials actually land, this is still waiting rather than an execution brief.',
      'Do not build Robert prep from a company homepage and a launch teaser alone.',
    ],
  },
  {
    title: 'ZooClaw / EezyCollab intro',
    tags: ['watch', 'new lead', 'terms mismatch'],
    points: [
      'Robert forwarded ZooClaw into the management lane on June 21, 2026 with a $2,495 ask for one thread plus one quote repost in the June 30 to July 4 window.',
      'The thread says payment would happen within seven days after publishing via PayPal or bank transfer, which does not match the normal prepay rule for a fresh sponsor.',
      'This stays in waiting until Asher resets terms, confirms real availability, and gets a proper brief rather than just a cold rate ask.',
      'Do not quietly accept post-live payment on a brand-new deal.',
    ],
  },
  {
    title: 'iMerch / Peter three-campaign ask',
    tags: ['watch', 'no discount', 'real briefs needed'],
    points: [
      'Peter asked on June 20, 2026 for a cheaper X-only bundle across three campaigns, and Sam already gave the only decision that matters: no discounts.',
      'Asher has a draft response ready, but Peter still has not sent clean briefs and timing for each campaign, so the thread is not execution-ready.',
      'Keep this parked until the ask is concrete enough to answer from the standard rate card without improvising scope.',
      'Do not invent a volume concession because three campaigns sound attractive.',
    ],
  },
  {
    title: 'Golden Egg / creator roster',
    tags: ['watch', 'onboarded', 'future only'],
    points: [
      'Wesley confirmed on June 19, 2026 that Golden Egg received the documents and that Robert is fully onboarded in their creator roster.',
      'There is still no live campaign on this thread, so there is nothing for Robert or Asher to prep today.',
      'This is admin-complete and waiting for a real booked campaign.',
      'Do not confuse roster setup with revenue.',
    ],
  },
  {
    title: 'Base and Partner / exploratory AI tool',
    tags: ['watch', 'bumped June 19', 'scope missing'],
    points: [
      'Asher already sent the sponsorship package, asked for company, product, deliverable mix, and timing, and bumped Sahil again on June 19, 2026.',
      'There is still no reply naming the client, the exact scope, the budget, or the launch date.',
      'Keep it in waiting until the ask can be described in one sentence with company, deliverable, timing, and owner.',
      'Do not create a Robert brief from generic interest in AI tools.',
    ],
  },
];

const V4_COMPANY_OS_DONE = [
  {
    title: 'MaineCoon / EchoNLab',
    tags: ['June 16 live', 'receipt landed', 'closed'],
    points: [
      'Judy accepted the $1,895 quote repost, sent the official source post, and then delivered the payment receipt on June 17, 2026 after the June 16 launch.',
      'Robert\'s live QRT is captured in-thread at https://x.com/Scobleizer/status/2066954693579006223?s=20 and the receipt PDF is attached in the same chain.',
      'This is fully closed now because the source post, Robert post, and receipt all exist in one place.',
      'If EchoNLab wants the later custom post, treat it as a fresh campaign, not unfinished residue from this one.',
    ],
  },
  {
    title: 'Perceptron / Agentic Detection',
    tags: ['June 10 live', 'paid', 'proof trail complete'],
    points: [
      'Eric confirmed payment on June 9, 2026 and then sent the official launch link on June 10: https://x.com/perceptroninc/status/2064732691845824833?s=20.',
      'The first paid execution is now properly evidenced and closed, and the thread has already shifted to possible follow-on launches later in June.',
      'Archive the first campaign cleanly before treating the robotics or next-launch chatter as a new deal.',
      'A future QRT discussion is a new scope, not unfinished cleanup.',
    ],
  },
  {
    title: 'Flot / Airtap',
    tags: ['June 10 live', 'final link captured', 'closed'],
    points: [
      'The second Airtap post went live and Asher sent the final comment link in-thread on June 10, 2026: https://x.com/Scobleizer/status/2064788508401914209?s=20.',
      'Zoe\'s latest message was only a thank-you, which means the execution chase is over from the brand side.',
      'No extra Robert brief or scheduling work remains here.',
      'Keep the live link on the thread as the completion artifact.',
    ],
  },
  {
    title: 'Polsia / SF Posters',
    tags: ['June 6 live', 'paid', 'closed'],
    points: [
      'Robert\'s SF poster post is live at https://x.com/scobleizer/status/2063286745320600036?s=46.',
      'Jeddi replied "Paid!" on June 8, 2026 in the same invoice thread, which closes the payment chase for invoice_Polsia_SFPhysicalCampaign_060426.pdf.',
      'This is no longer an outstanding invoice or action item.',
      'Keep the live link and invoice as proof, then archive cleanly.',
    ],
  },
  {
    title: 'Marketing Guys / Kombai QRT',
    tags: ['June 2 live', 'paid'],
    points: [
      'Campaign execution is complete and Robert posted the final QRT on June 2.',
      'Invoice is in DONE: invoice_MarketingGuys_Kombai_QRT_060126.pdf.',
      'Payment is complete; no wire-watch or follow-up remains.',
      'Final link is captured: https://x.com/Scobleizer/status/2061829182154588383?s=20.',
    ],
  },
];

const V4_COMPANY_OS_SENDERS = [
  { id: 'asher', label: 'Asher', role: 'Relationship-aware replies' },
  { id: 'robert', label: 'Robert', role: 'Intro + execution' },
  { id: 'sam', label: 'Sammy', role: 'Oversight' },
];

const V4_COMPANY_OS_RULES = [
  'Asher owns replies, invoice links, payment-proof capture, final post links, reimbursement follow-up, scheduling cleanup, and Robert brief prep. Sammy escalates. Robert only handles testing, interviews, intros, and final execution.',
  'No paid post, travel spend, hotel, or extra pass cost happens before payment proof, written reimbursement, written budget approval, or clearly prepaid package coverage is visible in-thread.',
  'A live post is not a closed deal. If the receipt or bank proof is missing, the item stays in action until proof lands.',
  'A screenshot saying payment is scheduled is useful context, not closure. The deal stays open until the receipt, settled transfer, or bank proof is in-thread.',
  'A wire receipt from the sponsor proves intent to pay, not bank settlement. Keep the item open until the money or bank confirmation actually lands.',
  'If a campaign is already prepaid, stop re-litigating payment and focus only on the source post, draft approval, and exact launch timing.',
  'If payment proof lands outside the client thread, log it against the invoice before calling the deal done.',
  'If a sponsor switches from Stripe to bank transfer after the invoice is already live, settle the payment rail first and freeze drafting until that choice is explicit.',
  'If a sponsor changes story angle or technical framing after a slot is penciled in, freeze drafting until payment proof is in and the new framing is written down cleanly.',
  'Once an invoice link is already in-thread, stop re-explaining the package and chase only payment proof, live asset, and posting window.',
  'If an older package still has unused posts left, treat the remaining inventory as fulfillment work, not a chance to send a fresh invoice unless the thread itself says the old package is over.',
  'If a legacy package is still active, the chase is source post URL, timing, approval path, and the shortest useful Robert brief, not fresh pricing.',
  'If a sponsor asks for draft copy before a launch goes live, keep the work on Asher\'s side until tags, cross-post requirements, and sign-off are all explicit in-thread.',
  'If Sam already says no discount, answer from the standard rate card or pause the thread. Do not negotiate against yourself.',
  'If an agency cites an old bundle benchmark to force a cheaper single-post rate, treat it as a negotiation, not a precedent reset.',
  'If a brand passes on a slot for budget but asks for future pricing benchmarks, answer the future-rate question once without reopening the dead campaign.',
  'If an onboarding thread asks for tax or bank documents with no live campaign attached, send the packet once, confirm receipt, then move it to waiting.',
  'Banking sample PDFs and onboarding paperwork are admin artifacts, not revenue, until a real campaign is attached.',
  'If a client wants split payment, post-live payment, net terms, stealth posting, or no paid-promotion disclosure, the answer is no until the thread proves otherwise.',
  'If a fresh sponsor proposes payment after posting, treat it as a terms mismatch until prepay or an explicit exception is approved in writing.',
  'Pinned posts are separate inventory. If a client wants the top slot held, price the pin separately instead of quietly bundling it into the repost.',
  'If a client has paid but the launch URL or Robert repost URL is missing, chase the links before opening any next-campaign discussion.',
  'An interview is not scheduled when someone says a time might work. It is scheduled only when both sides say yes and the invite reflects the final duration.',
  'A note like "next week works" is not a calendar lock. Robert only gets a brief after there is one exact date or time window.',
  'Venice is on the new interview price of $2,495 plus Stripe. Riverside keeps the old $1,800 commitment unless the thread changes in writing.',
  'If a meeting duration changes after a slot is picked, update the invite itself. An email promise to adjust is not enough.',
  'A quote repost is not executable until the official source post, assigned posting window, talking points, and approval boundaries are in the thread.',
  'If a product requires testing, a login alone does not count. No execution brief exists until Robert can actually use the right environment and report something real back.',
  'Every Robert brief must fit inside 60 seconds and include scope, timing, deliverable, approval path, payment path, owner, and why Robert is the right fit now.',
  'Do not create a Robert brief for exploratory calls, vague intros, or proposal-only threads. Scope, budget, platform, timing, and owner must already be concrete.',
  'Keep new lead threads in email until company, product, deliverable, budget, timing, and payment path are real. Generic interest, onboarding asks, and story pitches are not Robert briefs.',
  'Robert will not promote crypto. AI and blockchain infrastructure may be acceptable, but token or coin promotion is out.',
  'If Sam calls it a hard pass or Robert drafts a decline, treat the thread as closed unless one of them explicitly reopens it.',
  'If the thread is about billing details, invoices, payment links, or scheduling cleanup, it stays on Asher\'s side until the commercial path is settled.',
  'Unread is not the same as actionable. Confirm the latest thread state before creating work.',
];

const V4_COMPANY_OS_STAGES = [
  { key: 'new', label: 'Lead in' },
  { key: 'scope', label: 'Scope' },
  { key: 'pricing', label: 'Pricing' },
  { key: 'terms', label: 'Terms / pay' },
  { key: 'brief', label: 'Brief / calendar' },
  { key: 'done', label: 'Closed' },
];

const V4_BRIEF_TAILSCALE_BASE_URL = 'https://mac-studio.tail50d3a2.ts.net';
const V4_BRIEF_LOCAL_BASE_URL = 'http://127.0.0.1:8767';
const V4_ROBERT_HANDOFF_STATIC_PREVIEW_URL = 'flow-v4/robert-handoff-preview.json?v=20260621-handoff-preview-3';
const V4_ROBERT_HANDOFF_CACHE_KEY = 'v4_robert_handoff_preview_cache';

function V4ShouldUseMachineHostedBriefFlow() {
  try {
    const ua = String(window.navigator?.userAgent || '');
    const vendor = String(window.navigator?.vendor || '');
    const isIOS = /iPhone|iPad|iPod/i.test(ua);
    const isSafariDesktop = /Safari/i.test(ua) && /Apple/i.test(vendor) && !/Chrome|CriOS|EdgiOS|Edg|OPR|Firefox/i.test(ua);
    return isIOS || isSafariDesktop;
  } catch (err) {
    return false;
  }
}

function V4IsGithubHostedPage() {
  try {
    return String(window.location?.hostname || '') === 'asherweisberger.github.io';
  } catch (err) {
    return false;
  }
}

function V4OpenMachineHostedBriefMaker() {
  try {
    const target = new URL(V4_BRIEF_TAILSCALE_BASE_URL + '/');
    target.searchParams.set('open', 'brief-maker');
    target.searchParams.set('from', 'github');
    window.location.assign(target.toString());
    return true;
  } catch (err) {
    return false;
  }
}

function V4MaybeRedirectToMachineHostedApp() {
  return false;
}

function V4IsLocalBriefPage() {
  try {
    const protocol = String(window.location?.protocol || '');
    const hostname = String(window.location?.hostname || '');
    return protocol === 'file:' || hostname === '127.0.0.1' || hostname === 'localhost';
  } catch (err) {
    return true;
  }
}

function V4BriefServiceCandidateUrls() {
  return V4IsLocalBriefPage()
    ? [V4_BRIEF_LOCAL_BASE_URL, V4_BRIEF_TAILSCALE_BASE_URL]
    : [V4_BRIEF_TAILSCALE_BASE_URL, V4_BRIEF_LOCAL_BASE_URL];
}

function V4BriefServiceHeaders(extra = {}) {
  const headers = { 'Content-Type': 'application/json', ...extra };
  try {
    const token = String(window.localStorage.getItem('v4_brief_api_token') || '').trim();
    if (token) headers.Authorization = 'Bearer ' + token;
  } catch (err) {}
  return headers;
}

function V4LoadBriefApiToken() {
  try {
    return String(window.localStorage.getItem('v4_brief_api_token') || '').trim();
  } catch (err) {
    return '';
  }
}

function V4StoreBriefApiToken(value) {
  const token = String(value || '').trim();
  try {
    if (token) window.localStorage.setItem('v4_brief_api_token', token);
    else window.localStorage.removeItem('v4_brief_api_token');
  } catch (err) {}
  return token;
}

async function V4BriefServiceFetch(path, options = {}) {
  const candidates = V4BriefServiceCandidateUrls();
  const tryRequest = async includeStoredToken => {
    let lastNetworkError = null;
    for (const baseUrl of candidates) {
      try {
        const res = await fetch(baseUrl + path, {
          ...options,
          headers: V4BriefServiceHeaders(options.headers || {}),
        });
        if (res.status === 401 && !includeStoredToken) return res;
        return res;
      } catch (err) {
        lastNetworkError = err;
      }
    }
    throw lastNetworkError || new Error('Could not reach your brief machine.');
  };

  let res;
  try {
    res = await tryRequest(false);
  } catch (err) {
    throw new Error('Could not reach your brief machine. Make sure the Mac service is running and Tailscale Funnel is on.');
  }
  if (res.status !== 401) return res;

  let token = '';
  try {
    token = String(window.localStorage.getItem('v4_brief_api_token') || '').trim();
  } catch (err) {}

  if (!token) {
    const prompted = window.prompt('Paste your Brief Maker access token');
    token = String(prompted || '').trim();
    if (token) {
      try { window.localStorage.setItem('v4_brief_api_token', token); } catch (err) {}
    }
  }

  if (!token) return res;
  try {
    res = await tryRequest(true);
  } catch (err) {
    throw new Error('Could not reach your brief machine. Make sure the Mac service is running and Tailscale Funnel is on.');
  }
  if (res.status === 401) {
    throw new Error('Brief Maker access was denied. Refresh the page and try again.');
  }
  return res;
}

function V4LoadCachedRobertHandoffPreview() {
  try {
    const raw = window.localStorage.getItem(V4_ROBERT_HANDOFF_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.ok ? parsed : null;
  } catch (err) {
    return null;
  }
}

function V4StoreCachedRobertHandoffPreview(data) {
  try {
    if (data && data.ok) {
      window.localStorage.setItem(V4_ROBERT_HANDOFF_CACHE_KEY, JSON.stringify(data));
    }
  } catch (err) {}
}

async function V4LoadRobertHandoffPreviewData() {
  try {
    const res = await V4BriefServiceFetch('/robert-handoff-preview', { method: 'GET' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || 'Could not load Robert handoff drafts.');
    V4StoreCachedRobertHandoffPreview(data);
    return data;
  } catch (machineErr) {
    try {
      const staticRes = await fetch(V4_ROBERT_HANDOFF_STATIC_PREVIEW_URL, { method: 'GET', cache: 'no-store' });
      const staticData = await staticRes.json().catch(() => ({}));
      if (staticRes.ok && staticData.ok) {
        V4StoreCachedRobertHandoffPreview(staticData);
        return staticData;
      }
    } catch (err) {}
    const cached = V4LoadCachedRobertHandoffPreview();
    if (cached) return cached;
    throw machineErr;
  }
}

function V4LeadSupportsRobertHandoff(lead) {
  if (!lead || lead.isRobertBrief) return false;
  const mailboxOrigin = V4CompanyOsMailboxOrigin(lead);
  if (mailboxOrigin !== 'x' && mailboxOrigin !== 'robert') return false;
  const emails = [
    lead.email,
    lead.xContactInfo,
    lead.replyTo,
    ...(Array.isArray(lead.thread) ? lead.thread.flatMap(msg => [msg?.from, msg?.to, msg?.cc, msg?.replyTo]) : []),
  ].flat().join(' ');
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(String(emails || ''));
}

async function V4GenerateRobertHandoffDraft(lead) {
  const res = await V4BriefServiceFetch('/draft-robert-handoff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lead }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok || !data.draft) throw new Error(data.error || 'Could not generate the Robert handoff draft.');
  return data.draft;
}

async function V4SendRobertHandoffDraft(lead, draft) {
  const res = await V4BriefServiceFetch('/send-robert-handoff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lead, draft }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || 'Could not send the Robert handoff draft.');
  return data;
}

const V4_BRIEF_ACTION_URL = 'http://127.0.0.1:8766/generate-brief';

const V4_COMPANY_OS_TOOLKIT = [
  {
    id: 'brief-maker',
    title: 'Brief Maker',
    status: 'Live',
    kind: 'Skill',
    useFor: 'Turn a sold deal into a clean one-page Robert brief PDF.',
    trigger: 'Make a brief. Create a campaign brief. Brief for Robert.',
    output: 'One-page PDF saved to Desktop/UNALIGNED',
    note: 'Best for sponsorship launches where Robert needs exact posting instructions, facts, and copy options in under 60 seconds.',
  },
  {
    id: 'x-intake',
    title: 'X Lead Intake',
    status: 'In progress',
    kind: 'Automation',
    useFor: 'Pull Robert X DM leads into New Leads without dragging old threads back in.',
    trigger: 'Run X scrape. Refresh X leads.',
    output: 'Newest-first X leads with handle, date, and summary',
    note: 'This is the live-DM intake path you wanted so X stays a source for fresh opportunities only.',
  },
  {
    id: 'gmail-intake',
    title: 'Robert Gmail Intake',
    status: 'Live',
    kind: 'Automation',
    useFor: 'Pull new Gmail opportunities from Robert into New Leads.',
    trigger: 'Run Gmail sync. Refresh Robert Gmail leads.',
    output: 'Newest-first Gmail leads with sender, email, date, and summary',
    note: 'Company OS remains Asher-first. Robert Gmail is only used for fresh lead intake.',
  },
  {
    id: 'robert-handoff',
    title: 'Robert Handoff Drafts',
    status: 'Live',
    kind: 'Operator',
    useFor: 'Review the intro emails Robert can send when a fresh lead should move to Asher and Sam.',
    trigger: 'Open Robert handoff drafts. Refresh Robert intros.',
    output: 'Context-aware draft emails with recipients, subject, and ready-to-review copy',
    note: 'This is the approval layer before Robert starts the thread and hands the lead to Asher and Sam.',
  },
  {
    id: 'company-operator',
    title: 'Company Operator',
    status: 'Live',
    kind: 'Workflow',
    useFor: 'Keep replies, follow ups, execution state, and quick actions in one operator view.',
    trigger: 'Open Company OS',
    output: 'Reply queue, execution block, stage actions, and operator readout',
    note: 'This is the main command surface. It is where the autonomous layer will eventually run from.',
  },
  {
    id: 'stripe-sync',
    title: 'Stripe Sync',
    status: 'Live',
    kind: 'Finance',
    useFor: 'Track new Stripe invoices while keeping legacy manual invoices in Company OS.',
    trigger: 'Open invoices. Open Stripe invoice.',
    output: 'Invoice rows that can jump into Stripe for payment status',
    note: 'New transactions should flow through Stripe. Older custom invoice history stays preserved locally.',
  },
  {
    id: 'calendar-brief-ops',
    title: 'Calendar and Brief Ops',
    status: 'Next',
    kind: 'Execution',
    useFor: 'Auto-create Robert brief docs and place them on Robert calendar as tasks.',
    trigger: 'When a deal is sold and ready for execution',
    output: 'Google Doc brief plus Robert calendar task with publishing window',
    note: 'This is the next autonomous layer to wire after the execution panel you just approved.',
  },
];

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function V4CompanyOsMoney(value) {
  if (!value) return '';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function V4CompanyOsStageIndex(lead) {
  const stage = lead?.stage || 'new';
  if (stage === 'paid-out') return 5;
  if (stage === 'done') return 4;
  if (stage === 'invoice-sent') return 3;
  if (stage === 'negotiating' || stage === 'rates-sent') return 2;
  if (stage === 'first-touch' || stage === 'engaged') return 1;
  return 0;
}

function V4CompanyOsWhy(lead) {
  if (!lead) return 'No active lead selected.';
  if (lead.needsReply) return 'New thread activity needs an Asher reply, not a Robert interruption.';
  if (lead.stage === 'invoice-sent') return 'Deal terms appear close enough to verify payment and invoice status.';
  if (lead.stage === 'rates-sent') return 'Pricing/package is in motion; keep the client work moving toward a clear scope.';
  if (lead.stage === 'negotiating') return 'Client and package details need to become a clean brief, invoice, or both.';
  if (lead.stage === 'done') return 'The deal is sold. Robert now needs a clean brief, a calendar slot, and execution details.';
  if (lead.stage === 'paid-out') return 'Execution appears complete; confirm payment and archive cleanly.';
  return 'Robert is the source of the lead and final executor. Asher handles the back-and-forth. Sammy is oversight.';
}

function V4CompanyOsJob(lead) {
  if (!lead) return 'Pick a lead from the queue.';
  if (lead.stage === 'invoice-sent') return 'Verify payment, invoice state, and what is blocking the post.';
  if (lead.stage === 'rates-sent') return 'Get budget, date, deliverables, and approval path into one clean answer.';
  if (lead.stage === 'negotiating') return 'Turn the back-and-forth into a deal shape Robert can execute.';
  if (lead.stage === 'done') return 'Confirm the brief, calendar slot, live instructions, and approval path.';
  if (lead.stage === 'paid-out') return 'Make sure the brief, payment, and archive are complete.';
  return 'Asher gets the deal facts before Robert sees anything.';
}

function V4CompanyOsDraft(lead, sender) {
  if (!lead) return '';
  if (window.V3ComposeReplyDraft) {
    const draft = window.V3ComposeReplyDraft(lead, sender);
    return [`Subject: ${draft.subject}`, '', draft.body].join('\n');
  }
  return '';
}

function V4CompanyOsFilterLead(lead, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  return [lead.title, lead.contactName, lead.brand, lead.email, lead.deliverables, lead.nextMove?.text]
    .filter(Boolean)
    .some(value => String(value).toLowerCase().includes(q));
}

function V4CompanyOsListSnippet(lead) {
  if (!lead) return 'Open thread';
  const latest = Array.isArray(lead.thread) && lead.thread.length ? lead.thread[lead.thread.length - 1] : null;
  const sourceKind = window.V3?.NewLeadSourceKind ? window.V3.NewLeadSourceKind(lead) : 'gmail';
  const summary = sourceKind === 'x' && window.V3?.NewLeadSummary
    ? window.V3.NewLeadSummary(lead)
    : String(
        lead.operatorSummary?.lead_summary ||
        latest?.body ||
        latest?.subject ||
        lead.notes ||
        lead.deliverables ||
        lead.nextMove?.text ||
        ''
      );
  return summary.replace(/\s+/g, ' ').trim() || lead.email || 'Open thread';
}

function V4CompanyOsPriority(lead) {
  if (!lead) return 'P1';
  if (lead.needsReply) return 'P0';
  if (lead.stage === 'invoice-sent') return 'P0';
  return 'P1';
}

function V4CompanyOsTier(lead) {
  if (!lead) return null;
  if (lead.brief?.tier) return Number(lead.brief.tier) || null;
  const text = [
    lead.deliverables,
    lead.notes,
    lead.evidence,
    lead.nextMove?.text,
    ...(Array.isArray(lead.thread) ? lead.thread.map(m => `${m.subject || ''} ${m.body || ''}`) : []),
  ].filter(Boolean).join(' ').toLowerCase();
  const explicit = text.match(/\btier\s*([1-7])\b/);
  if (explicit) return Number(explicit[1]);
  const value = Number(lead.value || 0);
  if (value >= 5800) return 7;
  if (value >= 3900) return 6;
  if (value >= 2900) return 5;
  if (value >= 2400) return 4;
  if (value >= 1950) return 3;
  if (value >= 1800) return 2;
  if (value > 0) return 1;
  return null;
}

function V4CompanyOsType(lead) {
  const text = [
    lead?.category,
    lead?.deliverables,
    lead?.notes,
    lead?.evidence,
    lead?.nextMove?.text,
    ...(Array.isArray(lead?.thread) ? lead.thread.map(m => `${m.subject || ''} ${m.body || ''}`) : []),
  ].filter(Boolean).join(' ').toLowerCase();
  if (/\b(interview|podcast|speaker|fireside|webinar|panel)\b/.test(text)) return 'interview';
  if (/\b(intro|introduction|connect|network)\b/.test(text)) return 'intro';
  if (/\b(partner|partnership|sponsor|sponsorship|paid)\b/.test(text)) return 'partnership';
  if (/\b(collab|collaboration|campaign|post|repost|thread|retweet|linkedin|newsletter)\b/.test(text)) return 'collaboration';
  return lead?.category || 'unscoped';
}

function V4CompanyOsPhase(lead) {
  const stage = lead?.stage || 'new';
  if (stage === 'invoice-sent') return 'Terms / Payment';
  if (stage === 'negotiating') return 'Negotiation';
  if (stage === 'rates-sent') return 'Pricing';
  if (stage === 'first-touch' || stage === 'engaged') return 'Scope';
  if (stage === 'done') return 'Brief / Calendar';
  if (stage === 'paid-out') return 'Closed';
  return 'Intake';
}

function V4CompanyOsPhaseTag(lead) {
  if (lead?.stage === 'invoice-sent') return 'verify first';
  if (lead?.stage === 'done') return 'robert ready';
  if (lead?.needsReply) return 'needs reply';
  return 'next move';
}

function V4XLeadContextRows(lead) {
  if (!lead) return [];
  const rows = [];
  if (lead.notes) rows.push({ label: 'Intake summary', value: lead.notes });
  if (lead.evidence && lead.evidence !== lead.notes) rows.push({ label: 'Latest DM', value: lead.evidence });
  if (lead.xBestNextStep) rows.push({ label: 'Best next step', value: lead.xBestNextStep });
  if (lead.xCurrentStatus) rows.push({ label: 'Scraper status', value: lead.xCurrentStatus });
  if (lead.xContactInfo) rows.push({ label: 'Contact info', value: lead.xContactInfo });
  return rows;
}

function V4CompanyOsMailboxOrigin(lead) {
  const source = String(lead?.source || '').toLowerCase();
  if (source.includes('x-dm-intake') || source.includes('twitter_dm') || source.includes('ingest-twitter_dm')) return 'x';
  if (source.includes('robert-gmail-new-lead') || source.includes('gmail-robert') || source.includes('robert gmail')) return 'robert';
  if (source.includes('asher-gmail') || source.includes('gmail-asher') || source.includes('asher candidate') || source.includes('asher gmail')) return 'asher';
  const participants = (window.V3ThreadParticipants ? window.V3ThreadParticipants(lead) : [])
    .map(email => String(email || '').toLowerCase());
  if (participants.includes('asherunaligned@gmail.com')) return 'asher';
  if (participants.includes('scobleizer@gmail.com')) return 'robert';
  return 'unknown';
}

function V4OperatorStatus(lead) {
  const status = String(lead?.draftReplyStatus || '').toLowerCase();
  if (status === 'escalated') return { label: 'Needs approval', tone: 'warn' };
  if (status === 'pending') return { label: 'Draft ready', tone: 'good' };
  if (status === 'sent') return { label: 'Auto-sent', tone: 'neutral' };
  if (lead?.operatorAnalysis?.needs_reply) return { label: 'Reply suggested', tone: 'soft' };
  return { label: 'Monitoring', tone: 'soft' };
}

function V4OperatorReplyTypeLabel(value) {
  return String(value || '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, ch => ch.toUpperCase());
}

function V4CompanyOsExecutionMeta(lead) {
  const tierId = V4CompanyOsTier(lead);
  const tier = tierId ? window.V3?.TIERS?.[tierId] : null;
  const brief = lead?.brief || null;
  const links = Array.isArray(brief?.links) ? brief.links.filter(Boolean) : [];
  const docLink = links.find(link => /docs\.google\.com|drive\.google\.com/i.test(String(link)));
  const calendarLink = links.find(link => /calendar\.google\.com/i.test(String(link)));
  const postingWindow = brief?.postingWindow || lead?.operatorSummary?.launch_timing || '';
  const executionOwner = lead?.stage === 'done' ? 'Robert' : 'Asher';

  let briefState = 'Not started';
  if (brief?.status === 'awaiting-approval') briefState = 'Awaiting Asher approval';
  else if (brief?.status === 'ready') briefState = 'Ready for Robert';
  else if (brief?.status === 'in-production') briefState = 'In production';
  else if (brief?.status === 'shipped') briefState = 'Shipped';
  else if (brief) briefState = 'Drafted';
  else if (lead?.stage === 'done') briefState = 'Needs brief';

  let docState = 'Not needed yet';
  if (docLink) docState = 'Linked';
  else if (brief || lead?.stage === 'done') docState = 'Create Google Doc';

  let calendarState = 'Not needed yet';
  if (calendarLink) calendarState = 'Placed on calendar';
  else if (lead?.stage === 'done') calendarState = 'Create Robert task';

  let pdfState = 'Not scoped yet';
  if (tier) pdfState = 'Ready to attach';
  if (lead?.stage === 'invoice-sent' || lead?.stage === 'done') pdfState = tier ? 'Use in pricing / execution thread' : pdfState;

  return {
    tier,
    tierLine: tier ? `Tier ${tier.id} · ${tier.name} · ${V4CompanyOsMoney(tier.price)}` : 'No tier locked yet',
    deliverableLine: tier?.items?.join(' · ') || lead?.deliverables || 'No deliverables named yet',
    briefState,
    docState,
    docLink: docLink || '',
    calendarState,
    calendarLink: calendarLink || '',
    pdfState,
    pdfLink: 'docs/SINGLE_TIER.pdf',
    postingWindow: postingWindow || 'No publish window locked yet',
    executionOwner,
  };
}

function V4QuickStageActions(lead) {
  if (!lead) return [];
  const actions = [
    { stage: 'first-touch', label: 'Scope' },
    { stage: 'rates-sent', label: 'Pricing' },
    { stage: 'negotiating', label: 'Negotiate' },
    { stage: 'invoice-sent', label: 'Terms' },
    { stage: 'done', label: 'Brief' },
    { stage: 'paid-out', label: 'Close' },
  ];
  return actions.filter(action => action.stage !== lead.stage);
}

function senderShortLabel(sender) {
  const map = { asher: 'Asher', robert: 'Robert', sam: 'Sammy' };
  return map[sender] || 'Asher';
}

function V4BriefMakerDefaultState() {
  return {
    title: '',
    subtitle: 'For Robert. Read in 60 seconds',
    filename: '',
    go_live: '',
    go_live_note: '',
    what_to_do_text: '',
    key_facts_text: '',
    tag: '',
    link: '',
    hashtags: '',
    draft_1_label: 'Option 1. The Angle. Recommended',
    draft_1_text: '',
    draft_2_label: 'Option 2. Enterprise angle',
    draft_2_text: '',
    draft_3_label: 'Option 3. Operator angle',
    draft_3_text: '',
    submit_url: '',
    source_url: '',
    notion_url: '',
    calendar_title: '',
    calendar_mode: 'all_day',
    calendar_date: '',
    calendar_start: '',
    calendar_end: '',
  };
}

function V4BriefMakerFilename(value) {
  const cleaned = String(value || '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned || 'Robert_Brief';
}

function V4BriefMakerConfig(form) {
  const steps = String(form.what_to_do_text || '')
    .split('\n')
    .map(item => item.trim())
    .filter(Boolean);
  const facts = String(form.key_facts_text || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const parts = line.split('|');
      if (parts.length >= 2) return [parts[0].trim(), parts.slice(1).join('|').trim()];
      return ['', line];
    })
    .filter(([left, right]) => left || right);
  const drafts = [1, 2, 3]
    .map(index => ({
      label: String(form[`draft_${index}_label`] || '').trim(),
      text: String(form[`draft_${index}_text`] || '').trim(),
    }))
    .filter(item => item.label || item.text);
  const mustInclude = {};
  if (form.tag) mustInclude.tag = String(form.tag).trim();
  if (form.link) mustInclude.link = String(form.link).trim();
  if (form.hashtags) mustInclude.hashtags = String(form.hashtags).trim();

  const payload = {
    title: String(form.title || '').trim(),
  };
  if (form.subtitle) payload.subtitle = String(form.subtitle).trim();
  payload.filename = String(form.filename || '').trim() || V4BriefMakerFilename(payload.title);
  if (form.go_live) payload.go_live = String(form.go_live).trim();
  if (form.go_live_note) payload.go_live_note = String(form.go_live_note).trim();
  if (steps.length) payload.what_to_do = steps;
  if (facts.length) payload.key_facts = facts;
  if (Object.keys(mustInclude).length) payload.must_include = mustInclude;
  if (drafts.length) payload.drafts = drafts;
  if (form.submit_url) payload.submit_url = String(form.submit_url).trim();
  if (form.source_url) payload.source_url = String(form.source_url).trim();
  if (form.notion_url) payload.notion_url = String(form.notion_url).trim();
  if (form.calendar_title) payload.calendar_title = String(form.calendar_title).trim();
  if (form.calendar_mode) payload.calendar_mode = String(form.calendar_mode).trim();
  if (form.calendar_date) payload.calendar_date = String(form.calendar_date).trim();
  if (form.calendar_start) payload.calendar_start = String(form.calendar_start).trim();
  if (form.calendar_end) payload.calendar_end = String(form.calendar_end).trim();
  return payload;
}

function V4NormalizeCalendarTime(date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function V4NormalizeCalendarDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function V4InferCalendarFieldsFromGoLive(goLiveText) {
  const raw = String(goLiveText || '').trim();
  if (!raw) return null;
  const normalized = raw
    .replace(/\bEST\b/gi, 'UTC-05:00')
    .replace(/\bEDT\b/gi, 'UTC-04:00')
    .replace(/\bCST\b/gi, 'UTC-06:00')
    .replace(/\bCDT\b/gi, 'UTC-05:00')
    .replace(/\bMST\b/gi, 'UTC-07:00')
    .replace(/\bMDT\b/gi, 'UTC-06:00')
    .replace(/\bPST\b/gi, 'UTC-08:00')
    .replace(/\bPDT\b/gi, 'UTC-07:00');
  const parsed = new Date(normalized);
  if (!Number.isFinite(parsed.getTime())) return null;
  const end = new Date(parsed.getTime() + (30 * 60 * 1000));
  return {
    calendar_date: V4NormalizeCalendarDate(parsed),
    calendar_start: V4NormalizeCalendarTime(parsed),
    calendar_end: V4NormalizeCalendarTime(end),
  };
}

function V4InferCalendarMode(payload) {
  const haystack = [
    payload?.title,
    payload?.subtitle,
    payload?.go_live,
    Array.isArray(payload?.what_to_do) ? payload.what_to_do.join(' ') : '',
  ].join(' ').toLowerCase();
  if (/\b(interview|meeting|call|zoom|podcast|spaces|livestream)\b/.test(haystack)) {
    return 'timed';
  }
  return 'all_day';
}

function V4RobertHandoffTimestamp(value) {
  if (!value) return 'Not generated yet';
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return String(value);
  return parsed.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function V4RobertHandoffRecipients(draft) {
  const list = Array.isArray(draft?.to_emails) ? draft.to_emails.filter(Boolean) : [];
  return list.length ? list.join(', ') : 'No recipient found';
}

function V4RobertHandoffContext(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// Team Pulse — per-person lanes computed from live leads
// ─────────────────────────────────────────────────────────────

function V4CompanyOsPulseItem({ lead, onOpenLead }) {
  return (
    <button type="button" className="cos-pulse-item" onClick={() => onOpenLead?.(lead.id)}>
      <span className="cos-pulse-top">
        <span className="cos-pulse-brand">{lead.brand}</span>
        <span className={'cos-pulse-age' + ((lead.daysInStage || 0) >= 10 ? ' is-late' : '')}>
          {lead.daysInStage || 0}d
        </span>
      </span>
      <span className="cos-pulse-move">{lead.nextMove?.text || 'Review thread'}</span>
    </button>
  );
}

function V4CompanyOsPulseLane({ lane, onOpenLead }) {
  const { items } = lane;
  const members = lane.members.map(id => window.V3.USERS[id]).filter(Boolean);
  // Only an actual new inbound message counts as reply-now; auto-drafted
  // replies exist on most rows and are routine follow-up work
  const replyNow = items.filter(l => l.unread);
  const followUps = items.filter(l => !replyNow.includes(l));
  const shownReply = replyNow.slice(0, 6);
  const shownFollow = followUps.slice(0, replyNow.length ? 4 : 6);
  const hiddenCount = items.length - shownReply.length - shownFollow.length;
  return (
    <section className="cos-pulse-lane">
      <div className="cos-pulse-head">
        <span className="cos-pulse-avatars">
          {members.map(m => <V3Avatar key={m.id} name={m.name} color={m.color} size="sm" />)}
        </span>
        <div className="cos-pulse-id">
          <strong>{lane.label}</strong>
          <span>{lane.sub}</span>
        </div>
        {replyNow.length > 0 && <span className="cos-pulse-count-hot">{replyNow.length} reply now</span>}
        <span className="cos-panel-count">{items.length}</span>
      </div>
      <div className="cos-pulse-body">
        {shownReply.length > 0 && (
          <div className="cos-pulse-subhead is-hot">
            <span>Reply now</span><span>{replyNow.length}</span>
          </div>
        )}
        {shownReply.map(lead => <V4CompanyOsPulseItem key={lead.id} lead={lead} onOpenLead={onOpenLead} />)}
        {shownReply.length > 0 && shownFollow.length > 0 && (
          <div className="cos-pulse-subhead">
            <span>Follow ups</span><span>{followUps.length}</span>
          </div>
        )}
        {shownFollow.map(lead => <V4CompanyOsPulseItem key={lead.id} lead={lead} onOpenLead={onOpenLead} />)}
        {items.length === 0 && (
          <div className="cos-pulse-empty">Clear. Nothing waiting on {lane.label}.</div>
        )}
        {hiddenCount > 0 && (
          <div className="cos-pulse-more">+{hiddenCount} more in queue</div>
        )}
      </div>
    </section>
  );
}

function V4CompanyOsBuildingIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="1.5" />
      <line x1="4" y1="9" x2="20" y2="9" />
      <line x1="4" y1="14" x2="20" y2="14" />
      <line x1="10" y1="9" x2="10" y2="21" />
      <line x1="14" y1="9" x2="14" y2="21" />
    </svg>
  );
}

function V4CompanyOsRocketIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 14l-2 5 5-2" />
      <path d="M12 4c5 0 8 3 8 8-3 0-5 2-6 4l-6-6c2-1 4-3 4-6z" />
      <circle cx="14" cy="10" r="1.5" />
    </svg>
  );
}

function V4CompanyOsActionItem({ item }) {
  return (
    <article className="cos-action-item">
      <div className="cos-action-head">
        <h3 className="cos-action-title">{item.title}</h3>
        {item.tags && (
          <div className="cos-chips">
            {item.tags.map(t => <span key={t} className="cos-chip">{t}</span>)}
          </div>
        )}
      </div>
      <ul className="cos-action-points">
        {item.points.map(p => <li key={p}>{p}</li>)}
      </ul>
    </article>
  );
}

function V4CompanyOsWatchItem({ item }) {
  return (
    <article className="cos-watch-item">
      <h3 className="cos-watch-title">{item.title}</h3>
      {item.tags && (
        <div className="cos-chips cos-chips-soft">
          {item.tags.map(t => <span key={t} className="cos-chip cos-chip-soft">{t}</span>)}
        </div>
      )}
      <ul className="cos-action-points">
        {item.points.map(p => <li key={p}>{p}</li>)}
      </ul>
    </article>
  );
}

function V4CompanyOsDoneItem({ item }) {
  return (
    <article className="cos-done-item">
      <div className="cos-done-head">
        <h3 className="cos-done-title">{item.title}</h3>
        {item.tags && (
          <div className="cos-chips cos-chips-soft">
            {item.tags.map(t => <span key={t} className="cos-chip cos-chip-soft">{t}</span>)}
          </div>
        )}
      </div>
      <ul className="cos-action-points">
        {item.points.map(p => <li key={p}>{p}</li>)}
      </ul>
    </article>
  );
}

function V4CompanyOsExecutionPanel({ lead, execution }) {
  if (!lead) return null;
  return (
    <section className="cos-execution-panel">
      <div className="cos-execution-head">
        <div>
          <div className="cos-operator-strip-eyebrow">Execution</div>
          <h3>Tier, brief, PDF, calendar</h3>
        </div>
        <span className="cos-panel-count">{execution.executionOwner}</span>
      </div>
      <div className="cos-execution-grid">
        <div className="cos-execution-card">
          <div className="cos-execution-label">Tier package</div>
          <div className="cos-execution-value">{execution.tierLine}</div>
          <div className="cos-execution-sub">{execution.deliverableLine}</div>
        </div>
        <div className="cos-execution-card">
          <div className="cos-execution-label">Sponsorship PDF</div>
          <div className="cos-execution-value">{execution.pdfState}</div>
          <div className="cos-execution-actions">
            <a className="cos-execution-link" href={execution.pdfLink} target="_blank" rel="noreferrer">Open PDF</a>
          </div>
        </div>
        <div className="cos-execution-card">
          <div className="cos-execution-label">Robert brief</div>
          <div className="cos-execution-value">{execution.briefState}</div>
          <div className="cos-execution-actions">
            {lead.brief && (
              <button
                type="button"
                className="cos-execution-link is-button"
                onClick={() => window.dispatchEvent(new CustomEvent('v3:open-brief', { detail: { leadId: lead.id } }))}
              >
                Open brief
              </button>
            )}
          </div>
        </div>
        <div className="cos-execution-card">
          <div className="cos-execution-label">Google Doc</div>
          <div className="cos-execution-value">{execution.docState}</div>
          {execution.docLink && (
            <div className="cos-execution-actions">
              <a className="cos-execution-link" href={execution.docLink} target="_blank" rel="noreferrer">Open doc</a>
            </div>
          )}
        </div>
        <div className="cos-execution-card">
          <div className="cos-execution-label">Calendar task</div>
          <div className="cos-execution-value">{execution.calendarState}</div>
          {execution.calendarLink && (
            <div className="cos-execution-actions">
              <a className="cos-execution-link" href={execution.calendarLink} target="_blank" rel="noreferrer">Open calendar</a>
            </div>
          )}
        </div>
        <div className="cos-execution-card">
          <div className="cos-execution-label">Publish window</div>
          <div className="cos-execution-value">{execution.postingWindow}</div>
          <div className="cos-execution-sub">This is what the autonomous layer should turn into a dated task.</div>
        </div>
      </div>
    </section>
  );
}

function V4CompanyOsDealPath({ stageIndex }) {
  return (
    <div className="cos-deal-path" aria-label="Deal path">
      {V4_COMPANY_OS_STAGES.map((stage, index) => {
        const isDone = index < stageIndex;
        const isCurrent = index === stageIndex;
        return (
          <div key={stage.key} className={[
            'cos-deal-path-step',
            isDone ? 'is-done' : '',
            isCurrent ? 'is-current' : '',
          ].filter(Boolean).join(' ')}>
            <span className="cos-deal-path-bar"></span>
            <small>{stage.label}</small>
          </div>
        );
      })}
    </div>
  );
}

function V4CompanyOsLeadCard({ lead, isActive, onClick }) {
  const priority = V4CompanyOsPriority(lead);
  const phase = V4CompanyOsPhase(lead);
  const tag = V4CompanyOsPhaseTag(lead);
  const stageIndex = V4CompanyOsStageIndex(lead);
  return (
    <button
      type="button"
      className={isActive ? 'cos-lead-card-new is-active' : 'cos-lead-card-new'}
      onClick={onClick}
    >
      <div className="cos-lead-card-row">
        <span className="cos-lead-card-title">{lead.title || lead.brand}</span>
        <span className={`cos-priority cos-priority-${priority.toLowerCase()}`}>{priority}</span>
      </div>
      <div className="cos-lead-card-eyebrow">{phase}</div>
      <div className="cos-lead-card-row">
        <span className="cos-chip cos-chip-tight">{tag}</span>
        <span className="cos-lead-card-progress">{stageIndex + 1}/6</span>
      </div>
    </button>
  );
}

function V4CompanyOsOperator({ activeLead, sender, setSender, recipients, draft, copied, copyDraft, sendDraft }) {
  const senderLabel = senderShortLabel(sender);
  const targetEmail = activeLead?.email || activeLead?.contactEmail || (recipients?.to?.[0] || '');
  return (
    <aside className="cos-operator">
      <div className="cos-eyebrow">Operator</div>

      <div className="cos-operator-roles">
        {V4_COMPANY_OS_SENDERS.map(option => (
          <div key={option.id} className="cos-operator-role">
            <div className="cos-operator-role-label">{option.label}</div>
            <div className="cos-operator-role-meta">{option.role}</div>
          </div>
        ))}
        <div className="cos-operator-role">
          <div className="cos-operator-role-label">Target</div>
          <div className="cos-operator-role-meta cos-operator-role-target">{targetEmail || '—'}</div>
        </div>
      </div>

      <div className="cos-operator-send-as">
        <div className="cos-eyebrow">Send as</div>
        <div className="cos-operator-send-buttons">
          {V4_COMPANY_OS_SENDERS.map(option => (
            <button
              key={option.id}
              type="button"
              className={sender === option.id ? 'cos-send-btn is-active' : 'cos-send-btn'}
              onClick={() => setSender(option.id)}
            >{option.label}</button>
          ))}
        </div>
        <p className="cos-operator-help">
          Default is Asher. Switch only when Robert or Sammy should be the visible sender.
        </p>
      </div>

      <div className="cos-operator-guardrail">
        <div className="cos-eyebrow">Guardrail</div>
        <p>Keep Robert out of the middle. Collect the facts first.</p>
      </div>

      <pre className="cos-draft">{draft || 'Pick a live lead to prepare a reply.'}</pre>

      <div className="cos-operator-actions">
        <button type="button" className="cos-send-primary" onClick={sendDraft}>
          {window.V3SendLeadEmail ? `Send as ${senderLabel}` : `Prepare as ${senderLabel}`}
        </button>
        <button type="button" className="cos-send-secondary" onClick={copyDraft}>
          {copied ? 'Copied' : 'Copy draft'}
        </button>
      </div>

      <div className="cos-operator-recips">
        <span>To {recipients?.to?.length || 0}</span>
        <span>Cc {recipients?.cc?.length || 0}</span>
      </div>
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────
// Main view
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// Superhuman workspace — splits rail + thread list + reader
// ─────────────────────────────────────────────────────────────

// PATCH a card in Supabase and update local state optimistically,
// same pattern as V3MoveLeadStage.
function V4CosPatchLead(lead, fields, localPatch) {
  const id = lead?.rowId || lead?.id;
  if (!id) return;
  fetch(V3_SUPABASE_URL + '/rest/v1/cards?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH',
    headers: {
      apikey: V3_SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + V3_SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(fields),
  }).catch(err => console.warn('[ALIGNED v4] lead patch failed:', err));
  const updated = (window.V3.LEADS || []).map(item =>
    String(item.id) === String(lead.id) ? { ...item, ...localPatch } : item);
  window.V3.LEADS = updated;
  window.dispatchEvent(new CustomEvent('v3:leads-loaded', { detail: { leads: updated } }));
}

// Overview — glanceable metrics, live activity, team status, priorities
function V4CosOverview({ leads, replyCount }) {
  const { USERS } = window.V3;
  const now = Date.now();
  const todayKey = new Date().toDateString();
  const newToday = leads.filter(l => l.receivedAt && new Date(l.receivedAt).toDateString() === todayKey).length;
  const doneWeek = leads.filter(l =>
    ['done', 'paid-out'].includes(l.stage) &&
    l.lastTouchAt && (now - Date.parse(l.lastTouchAt)) < 7 * 86400000).length;
  const pipeline = leads.filter(l => !['done', 'paid-out'].includes(l.stage)).reduce((s, l) => s + (l.value || 0), 0);

  const events = [];
  for (const l of leads) {
    if (l.unread && l.lastTouchAt) events.push({ t: Date.parse(l.lastTouchAt) || 0, type: 'reply', label: `${l.brand} — new message from ${l.contactName.split(' ')[0]}` });
    if (l.receivedAt && (now - Date.parse(l.receivedAt)) < 14 * 86400000) events.push({ t: Date.parse(l.receivedAt) || 0, type: 'new', label: `New lead — ${l.brand} (${l.source})` });
    if (['done', 'paid-out'].includes(l.stage) && l.lastTouchAt && (now - Date.parse(l.lastTouchAt)) < 14 * 86400000) events.push({ t: Date.parse(l.lastTouchAt) || 0, type: 'closed', label: `${l.brand} — ${l.stage === 'paid-out' ? 'paid out' : 'done'}` });
  }
  events.sort((a, b) => b.t - a.t);
  const feed = events.slice(0, 10);

  const STATUS_DEFAULTS = { robert: 'Creator work', asher: 'Working the inbox', sammy: 'Sales follow ups' };
  const [teamStatus, setTeamStatus] = React.useState(() => {
    try { return JSON.parse(window.localStorage.getItem('v4-team-status') || '{}'); } catch (e) { return {}; }
  });
  const setStatus = (id, text) => setTeamStatus(s => {
    const next = { ...s, [id]: text };
    try { window.localStorage.setItem('v4-team-status', JSON.stringify(next)); } catch (e) {}
    return next;
  });

  return (
    <div className="cosov">
      <div className="cosov-metrics">
        <div className="cosov-card"><strong>{newToday}</strong><span>New leads today</span></div>
        <div className="cosov-card cosov-card-hot"><strong>{replyCount}</strong><span>Need a reply</span></div>
        <div className="cosov-card"><strong>{doneWeek}</strong><span>Closed this week</span></div>
        <div className="cosov-card"><strong>{V4CompanyOsMoney(pipeline) || '$0'}</strong><span>Pipeline in play</span></div>
      </div>

      <div className="cosov-grid">
        <section className="cos-panel cosov-panel">
          <div className="cos-panel-head"><h3>Recent activity</h3><span className="cos-panel-count">{feed.length}</span></div>
          <div className="cosov-feed">
            {feed.map((e, i) => (
              <div key={i} className="cosov-event">
                <span className={'cosov-event-dot is-' + e.type}></span>
                <span className="cosov-event-label">{e.label}</span>
                <span className="cosov-event-when">{V3RelativeTime(new Date(e.t).toISOString())}</span>
              </div>
            ))}
            {feed.length === 0 && <div className="dq-empty">Quiet. No recent activity.</div>}
          </div>
        </section>

        <div className="cosov-side">
          <section className="cos-panel cosov-panel">
            <div className="cos-panel-head"><h3>Team</h3></div>
            <div className="cosov-team">
              {['robert', 'asher', 'sammy'].map(id => {
                const u = USERS[id];
                return (
                  <div key={id} className="cosov-member">
                    <V3Avatar name={u.name} color={u.color} size="sm" />
                    <div className="cosov-member-text">
                      <strong>{u.name}</strong>
                      <input className="cosov-status-input"
                             value={teamStatus[id] ?? STATUS_DEFAULTS[id]}
                             onChange={e => setStatus(id, e.target.value)}
                             placeholder="What are they on?" />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="cos-panel cosov-panel">
            <div className="cos-panel-head"><h3>Current priorities</h3><span className="cos-panel-count">{V4_COMPANY_OS_PREP.length}</span></div>
            <div className="cosov-priorities">
              {V4_COMPANY_OS_PREP.map(item => (
                <div key={item.title} className="cosov-priority">
                  <strong>{item.title}</strong>
                  <span className="cos-chips">
                    {item.tags.slice(0, 3).map(t => <span key={t} className="cos-chip cos-chip-tight">{t}</span>)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <V4CosBriefBoard />
    </div>
  );
}

function V4CosBriefBoard() {
  const todayLabel = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return (
    <section className="cos-section cos-brief" style={{ padding: '18px 22px 40px' }}>
      <div className="cos-brief-head">
        <div>
          <div className="cos-section-eyebrow-row">
            <span className="cos-eyebrow">Daily Operating Brief</span>
            <span className="cos-section-date">{todayLabel}</span>
          </div>
          <h2 className="cos-section-title">What needs action, what is waiting, and what must not be touched</h2>
        </div>
        <p className="cos-section-sub">
          Built from the latest Asher/Robert outreach cleanup so old threads do not get answered like first-touch leads.
        </p>
      </div>
      <div className="cos-brief-grid">
        <section className="cos-panel cos-panel-prep">
          <div className="cos-panel-head">
            <h3>Needs Prep / Action</h3>
            <span className="cos-panel-count">{V4_COMPANY_OS_PREP.length}</span>
          </div>
          <div className="cos-panel-body">
            {V4_COMPANY_OS_PREP.map(item => <V4CompanyOsActionItem key={item.title} item={item} />)}
          </div>
        </section>
        <section className="cos-panel cos-panel-watch">
          <div className="cos-panel-head">
            <h3>Watch / Waiting</h3>
            <span className="cos-panel-count">{V4_COMPANY_OS_WAITING.length}</span>
          </div>
          <div className="cos-panel-body">
            {V4_COMPANY_OS_WAITING.map(item => <V4CompanyOsWatchItem key={item.title} item={item} />)}
          </div>
        </section>
        <section className="cos-panel cos-rules">
          <div className="cos-panel-head">
            <h3>Operating Rules</h3>
            <span className="cos-panel-count">{V4_COMPANY_OS_RULES.length}</span>
          </div>
          <ul>
            {V4_COMPANY_OS_RULES.map(rule => <li key={rule}>{rule}</li>)}
          </ul>
        </section>
        <section className="cos-panel cos-panel-done">
          <div className="cos-panel-head">
            <h3>Completed Campaigns</h3>
            <span className="cos-panel-count">{V4_COMPANY_OS_DONE.length}</span>
          </div>
          <div className="cos-done-grid">
            {V4_COMPANY_OS_DONE.map(item => <V4CompanyOsDoneItem key={item.title} item={item} />)}
          </div>
        </section>
      </div>
    </section>
  );
}

function V4CosToolkit({ onNavigateView, onActivateSplit }) {
  const [briefMakerOpen, setBriefMakerOpen] = React.useState(false);
  const [handoffPreviewOpen, setHandoffPreviewOpen] = React.useState(false);
  const [handoffPreviewStatus, setHandoffPreviewStatus] = React.useState('idle');
  const [handoffPreviewError, setHandoffPreviewError] = React.useState('');
  const [handoffPreviewData, setHandoffPreviewData] = React.useState(null);
  const [handoffCopiedIndex, setHandoffCopiedIndex] = React.useState(-1);
  const [briefForm, setBriefForm] = React.useState(() => V4BriefMakerDefaultState());
  const [briefAdvancedOpen, setBriefAdvancedOpen] = React.useState(false);
  const [briefApiToken, setBriefApiToken] = React.useState(() => V4LoadBriefApiToken());
  const [briefMachineStatus, setBriefMachineStatus] = React.useState('checking');
  const [briefMachineNote, setBriefMachineNote] = React.useState('Checking your brief machine...');
  const [copied, setCopied] = React.useState(false);
  const [briefStatus, setBriefStatus] = React.useState('idle');
  const [briefError, setBriefError] = React.useState('');
  const [briefResult, setBriefResult] = React.useState(null);
  const [briefJobId, setBriefJobId] = React.useState('');
  const [briefJobStatus, setBriefJobStatus] = React.useState('idle');
  const [docStatus, setDocStatus] = React.useState('idle');
  const [docError, setDocError] = React.useState('');
  const [docResult, setDocResult] = React.useState(null);
  const [notionStatus, setNotionStatus] = React.useState('idle');
  const [notionError, setNotionError] = React.useState('');
  const [calendarStatus, setCalendarStatus] = React.useState('idle');
  const [calendarError, setCalendarError] = React.useState('');
  const [calendarResult, setCalendarResult] = React.useState(null);
  const briefConfig = React.useMemo(() => V4BriefMakerConfig(briefForm), [briefForm]);
  const briefJson = React.useMemo(() => JSON.stringify(briefConfig, null, 2), [briefConfig]);

  React.useEffect(() => {
    try {
      const protocol = String(window.location?.protocol || '');
      const hostname = String(window.location?.hostname || '');
      if (protocol === 'file:' || hostname === '127.0.0.1' || hostname === 'localhost') {
        window.localStorage.removeItem('v4_brief_service_base_url');
      }
    } catch (err) {}
  }, []);

  React.useEffect(() => {
    try {
      const current = new URL(String(window.location?.href || ''));
      if (current.searchParams.get('open') === 'brief-maker') {
        setBriefMakerOpen(true);
      }
      if (current.searchParams.get('open') === 'robert-handoff') {
        setHandoffPreviewOpen(true);
      }
    } catch (err) {}
  }, []);

  const loadRobertHandoffPreview = async () => {
    setHandoffPreviewStatus('loading');
    setHandoffPreviewError('');
    try {
      const data = await V4LoadRobertHandoffPreviewData();
      setHandoffPreviewData(data);
      setHandoffPreviewStatus('done');
    } catch (err) {
      setHandoffPreviewStatus('error');
      setHandoffPreviewError(err.message || 'Could not load Robert handoff drafts.');
    }
  };

  React.useEffect(() => {
    if (!handoffPreviewOpen) return;
    if (handoffPreviewStatus === 'idle') loadRobertHandoffPreview();
  }, [handoffPreviewOpen]);

  const updateBriefField = (key, value) => {
    const isCalendarField = String(key || '').startsWith('calendar_');
    setBriefForm(curr => ({ ...curr, [key]: value }));
    if (copied) setCopied(false);
    if (briefStatus !== 'idle') {
      setBriefStatus('idle');
      setBriefError('');
      setBriefResult(null);
    }
    if (briefJobId || briefJobStatus !== 'idle') {
      setBriefJobId('');
      setBriefJobStatus('idle');
    }
    if (!isCalendarField && docStatus !== 'idle') {
      setDocStatus('idle');
      setDocError('');
      setDocResult(null);
    }
    if (!isCalendarField && notionStatus !== 'idle') {
      setNotionStatus('idle');
      setNotionError('');
    }
    if (calendarStatus !== 'idle') {
      setCalendarStatus('idle');
      setCalendarError('');
      setCalendarResult(null);
    }
  };

  const saveBriefApiToken = value => {
    const next = V4StoreBriefApiToken(value);
    setBriefApiToken(next);
  };

  React.useEffect(() => {
    let active = true;

    const checkMachine = async () => {
      setBriefMachineStatus('checking');
      setBriefMachineNote('Checking your brief machine...');
      try {
        const res = await V4BriefServiceFetch('/health', { method: 'GET' });
        const data = await res.json().catch(() => ({}));
        if (!active) return;
        if (res.ok && data.ok) {
          setBriefMachineStatus('online');
          setBriefMachineNote('Machine online. Ready from anywhere while this Mac is awake.');
        } else {
          setBriefMachineStatus('offline');
          setBriefMachineNote('Machine reached, but the brief service did not answer cleanly.');
        }
      } catch (err) {
        if (!active) return;
        setBriefMachineStatus('offline');
        setBriefMachineNote('Machine is not reachable right now. Check that your Mac is awake, Tailscale is connected, and the brief service is running.');
      }
    };

    checkMachine();
    const timer = window.setInterval(checkMachine, 45000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const downloadBriefConfig = () => {
    const blob = new Blob([briefJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const filename = (briefConfig.filename || V4BriefMakerFilename(briefConfig.title || 'Robert_Brief')) + '.json';
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const copyBriefConfig = async () => {
    try {
      await navigator.clipboard.writeText(briefJson);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('brief config copy failed', err);
    }
  };

  const resetBriefForm = () => {
    setBriefForm(V4BriefMakerDefaultState());
    setBriefAdvancedOpen(false);
    setCopied(false);
    setBriefStatus('idle');
    setBriefError('');
    setBriefResult(null);
    setBriefJobId('');
    setBriefJobStatus('idle');
    setDocStatus('idle');
    setDocError('');
    setDocResult(null);
    setNotionStatus('idle');
    setNotionError('');
    setCalendarStatus('idle');
    setCalendarError('');
    setCalendarResult(null);
  };

  const loadBriefJobStatus = async jobId => {
    const res = await V4BriefServiceFetch('/brief-job-status?job_id=' + encodeURIComponent(jobId), {
      method: 'GET',
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Could not load brief job.');
    return data.job || null;
  };

  React.useEffect(() => {
    if (!briefJobId) return;
    let active = true;
    let timer = null;

    const poll = async () => {
      try {
        const job = await loadBriefJobStatus(briefJobId);
        if (!active || !job) return;
        setBriefJobStatus(job.status || 'idle');
        if (job.status === 'done') {
          const result = job.result || {};
          const payload = result.payload || {};
          const sourceUrl = payload.source_url || briefForm.source_url || briefForm.notion_url || job.source_url || '';
          if (payload && Object.keys(payload).length) applyImportedBriefPayload(payload, sourceUrl);
          setNotionStatus('done');
          setDocResult(result);
          setDocStatus('done');
          if (result.calendar) {
            setCalendarResult(result.calendar);
            setCalendarStatus('done');
          }
          setBriefJobId('');
          setBriefJobStatus('done');
          return;
        }
        if (job.status === 'error') {
          const message = job.error || 'Brief build failed.';
          setNotionStatus('error');
          setNotionError(message);
          setDocStatus('error');
          setDocError(message);
          setBriefJobId('');
          setBriefJobStatus('error');
          return;
        }
        timer = window.setTimeout(poll, 2500);
      } catch (err) {
        if (!active) return;
        timer = window.setTimeout(poll, 3500);
      }
    };

    poll();
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [briefJobId]);

  const copyHandoffDraft = async (draft, index) => {
    const lines = [
      `To: ${V4RobertHandoffRecipients(draft)}`,
      `Subject: ${String(draft?.subject || '').trim()}`,
      '',
      String(draft?.body || '').trim(),
    ].filter(Boolean);
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setHandoffCopiedIndex(index);
      window.setTimeout(() => setHandoffCopiedIndex(-1), 1800);
    } catch (err) {
      console.warn('handoff draft copy failed', err);
    }
  };

  const applyImportedBriefPayload = (payload, sourceUrl) => {
    const inferredCalendar = V4InferCalendarFieldsFromGoLive(payload.go_live);
    const inferredMode = payload.calendar_mode || V4InferCalendarMode(payload);
    setBriefForm(curr => ({
      ...curr,
      title: payload.title || curr.title,
      subtitle: payload.subtitle || curr.subtitle,
      filename: payload.filename || curr.filename,
      go_live: payload.go_live || curr.go_live,
      go_live_note: payload.go_live_note || curr.go_live_note,
      submit_url: payload.submit_url || curr.submit_url,
      source_url: sourceUrl || curr.source_url,
      notion_url: sourceUrl || curr.notion_url,
      calendar_title: payload.calendar_title || curr.calendar_title || payload.title || curr.title,
      calendar_mode: payload.calendar_mode || curr.calendar_mode || inferredMode,
      calendar_date: payload.calendar_date || curr.calendar_date || inferredCalendar?.calendar_date || '',
      calendar_start: payload.calendar_start || curr.calendar_start || inferredCalendar?.calendar_start || '',
      calendar_end: payload.calendar_end || curr.calendar_end || inferredCalendar?.calendar_end || '',
      what_to_do_text: Array.isArray(payload.what_to_do) ? payload.what_to_do.join('\n') : curr.what_to_do_text,
      key_facts_text: Array.isArray(payload.key_facts) ? payload.key_facts.map(item => item.join(' | ')).join('\n') : curr.key_facts_text,
      tag: payload.must_include?.tag || curr.tag,
      link: payload.must_include?.link || curr.link,
      hashtags: payload.must_include?.hashtags || curr.hashtags,
      draft_1_label: payload.drafts?.[0]?.label || curr.draft_1_label,
      draft_1_text: payload.drafts?.[0]?.text || curr.draft_1_text,
      draft_2_label: payload.drafts?.[1]?.label || curr.draft_2_label,
      draft_2_text: payload.drafts?.[1]?.text || curr.draft_2_text,
      draft_3_label: payload.drafts?.[2]?.label || curr.draft_3_label,
      draft_3_text: payload.drafts?.[2]?.text || curr.draft_3_text,
    }));
  };

  const createBriefDoc = async () => {
    if (!briefConfig.title && !briefConfig.source_url && !briefConfig.notion_url) {
      setDocStatus('error');
      setDocError('Add a title or paste a public source brief link first.');
      return;
    }
    setDocStatus('creating');
    setDocError('');
    setDocResult(null);
    try {
      const res = await V4BriefServiceFetch('/generate-brief-doc', {
        method: 'POST',
        body: JSON.stringify(briefConfig),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Google Doc creation failed.');
      setDocResult(data);
      setDocStatus('done');
    } catch (err) {
      setDocStatus('error');
      setDocError(err.message || 'Google Doc creation failed.');
    }
  };

  const importNotionBrief = async () => {
    const sourceUrl = briefConfig.source_url || briefConfig.notion_url;
    if (!sourceUrl) {
      setNotionStatus('error');
      setNotionError('Paste a public Notion page or Google Doc link first.');
      return;
    }
    setNotionStatus('importing');
    setNotionError('');
    try {
      const res = await V4BriefServiceFetch('/import-source-brief', {
        method: 'POST',
        body: JSON.stringify({ source_url: sourceUrl }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Notion import failed.');
      const payload = data.payload || {};
      applyImportedBriefPayload(payload, sourceUrl);
      setNotionStatus('done');
    } catch (err) {
      setNotionStatus('error');
      setNotionError(err.message || 'Source import failed.');
    }
  };

  const createCalendarHoldWithConfig = async (config, docUrl) => {
    const calendarTitle = config.calendar_title || config.title;
    const calendarMode = config.calendar_mode || 'all_day';
    if (!calendarTitle) {
      throw new Error('Add a title first.');
    }
    if (!config.calendar_date) {
      throw new Error('Add the calendar date.');
    }
    if (calendarMode === 'timed' && !config.calendar_start) {
      throw new Error('Add the calendar date and start time.');
    }
    const res = await V4BriefServiceFetch('/create-calendar-hold', {
      method: 'POST',
      body: JSON.stringify({
        ...config,
        calendar_title: calendarTitle,
        doc_url: docUrl || '',
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Calendar hold creation failed.');
    return data;
  };

  const buildBriefFromSource = async () => {
    const sourceUrl = String(briefForm.source_url || briefForm.notion_url || '').trim();
    if (!sourceUrl) {
      setNotionStatus('error');
      setNotionError('Paste a public Notion page or Google Doc link first.');
      return;
    }
    setNotionStatus('importing');
    setNotionError('');
    setDocStatus('idle');
    setDocError('');
    setDocResult(null);
    setCalendarStatus('idle');
    setCalendarError('');
    setCalendarResult(null);
    try {
      setDocStatus('creating');
      setBriefJobStatus('queued');
      const blankCalendar = V4InferCalendarFieldsFromGoLive('');
      const requestConfig = {
        source_url: sourceUrl,
        notion_url: sourceUrl,
        calendar_title: briefForm.calendar_title || '',
        calendar_mode: briefForm.calendar_mode || 'all_day',
        calendar_date: briefForm.calendar_date || blankCalendar?.calendar_date || '',
        calendar_start: briefForm.calendar_start || blankCalendar?.calendar_start || '',
        calendar_end: briefForm.calendar_end || blankCalendar?.calendar_end || '',
      };
      const jobRes = await V4BriefServiceFetch('/start-brief-job', {
        method: 'POST',
        body: JSON.stringify(requestConfig),
      });
      const jobData = await jobRes.json();
      if (!jobRes.ok || !jobData.ok) throw new Error(jobData.error || 'Brief build failed.');
      const job = jobData.job || {};
      setBriefJobId(job.id || '');
      setBriefJobStatus(job.status || 'queued');
    } catch (err) {
      const message = err.message || 'Brief build failed.';
      setNotionStatus('error');
      setNotionError(message);
      setDocStatus('error');
      setDocError(message);
      if (/calendar/i.test(message)) {
        setCalendarStatus('error');
        setCalendarError(message);
      }
      setBriefJobId('');
      setBriefJobStatus('error');
    }
  };

  const createCalendarHold = async () => {
    setCalendarStatus('creating');
    setCalendarError('');
    setCalendarResult(null);
    try {
      const data = await createCalendarHoldWithConfig(briefConfig, docResult?.url || '');
      setCalendarResult(data);
      setCalendarStatus('done');
    } catch (err) {
      setCalendarStatus('error');
      setCalendarError(err.message || 'Calendar hold creation failed.');
    }
  };

  const generateBriefPdf = async () => {
    if (!briefConfig.title) {
      setBriefStatus('error');
      setBriefError('Add a title first.');
      return;
    }
    setBriefStatus('generating');
    setBriefError('');
    setBriefResult(null);
    try {
      const res = await fetch(V4_BRIEF_ACTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(briefConfig),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Brief generation failed.');
      setBriefResult(data);
      setBriefStatus('done');
    } catch (err) {
      setBriefStatus('error');
      setBriefError(err.message || 'Brief generation failed.');
    }
  };

  const runAction = (action) => {
    if (!action) return;
    if (action.type === 'launch-brief-builder') {
      if (V4IsGithubHostedPage() && V4ShouldUseMachineHostedBriefFlow()) {
        V4OpenMachineHostedBriefMaker();
        return;
      }
      setBriefMakerOpen(true);
      return;
    }
    if (action.type === 'open-robert-handoff') {
      setHandoffPreviewOpen(true);
      loadRobertHandoffPreview();
      return;
    }
    if (action.type === 'view') {
      onNavigateView?.(action.view, action.openId || null);
      return;
    }
    if (action.type === 'split') {
      onActivateSplit?.(action.splitId);
      return;
    }
    if (action.type === 'brief') {
      window.dispatchEvent(new CustomEvent('v3:open-brief', { detail: { leadId: action.leadId } }));
    }
  };

  const toolkitCards = V4_COMPANY_OS_TOOLKIT.map(tool => {
    if (tool.id === 'brief-maker') {
      return {
        ...tool,
        primaryLabel: 'Open Brief Maker',
        primaryAction: { type: 'launch-brief-builder' },
        simpleCard: true,
      };
    }
    if (tool.id === 'x-intake') {
      return {
        ...tool,
        primaryLabel: 'Open New Leads',
        primaryAction: { type: 'view', view: 'new-leads' },
        secondaryLabel: 'Focus X queue',
        secondaryAction: { type: 'view', view: 'new-leads' },
      };
    }
    if (tool.id === 'gmail-intake') {
      return {
        ...tool,
        primaryLabel: 'Open New Leads',
        primaryAction: { type: 'view', view: 'new-leads' },
        secondaryLabel: 'Open reply queue',
        secondaryAction: { type: 'split', splitId: 'reply' },
      };
    }
    if (tool.id === 'robert-handoff') {
      return {
        ...tool,
        primaryLabel: 'Review drafts',
        primaryAction: { type: 'open-robert-handoff' },
        secondaryLabel: 'Open reply queue',
        secondaryAction: { type: 'split', splitId: 'reply' },
      };
    }
    if (tool.id === 'company-operator') {
      return {
        ...tool,
        primaryLabel: 'Open reply queue',
        primaryAction: { type: 'split', splitId: 'reply' },
        secondaryLabel: 'Open follow ups',
        secondaryAction: { type: 'split', splitId: 'followups' },
      };
    }
    if (tool.id === 'stripe-sync') {
      return {
        ...tool,
        primaryLabel: 'Open invoices',
        primaryAction: { type: 'view', view: 'invoices' },
        secondaryLabel: 'Open terms queue',
        secondaryAction: { type: 'split', splitId: 'payment' },
      };
    }
    if (tool.id === 'calendar-brief-ops') {
      return {
        ...tool,
        primaryLabel: 'Open calendar',
        primaryAction: { type: 'view', view: 'calendar' },
        secondaryLabel: 'Open execution queue',
        secondaryAction: { type: 'split', splitId: 'briefing' },
      };
    }
    return tool;
  });

  return (
    <div className="cosov">
      <div className="cos-section-eyebrow-row">
        <span className="cos-eyebrow">Toolkit</span>
        <span className="cos-section-date">{V4_COMPANY_OS_TOOLKIT.length} tools</span>
      </div>
      <h2 className="cos-section-title">The skills and systems behind Company OS</h2>
      <p className="cos-section-sub cos-section-sub-left">
        This is the operator stack. Lead intake, reply handling, briefs, invoicing, and execution tools live here so the system can become more autonomous without getting messy.
      </p>
      <div className="cos-toolkit-grid">
        {toolkitCards.map(tool => (
          <section key={tool.id} className={'cos-panel cos-toolkit-card' + (tool.simpleCard ? ' is-brief-maker' : '')}>
            <div className="cos-panel-head">
              <h3>{tool.title}</h3>
              <span className={'cos-toolkit-status is-' + String(tool.status || '').toLowerCase().replace(/\s+/g, '-')}>{tool.status}</span>
            </div>
            <div className="cos-toolkit-body">
              {tool.simpleCard ? (
                <div className="cos-toolkit-simple-copy">
                  Build a Google Doc brief for Robert from one source link.
                </div>
              ) : (
                <>
                  <div className="cos-toolkit-meta">
                    <span className="cos-chip cos-chip-tight">{tool.kind}</span>
                    <span className="cos-toolkit-output">{tool.output}</span>
                  </div>
                  <div className="cos-toolkit-row">
                    <div className="cos-toolkit-label">Use for</div>
                    <div className="cos-toolkit-value">{tool.useFor}</div>
                  </div>
                  <div className="cos-toolkit-row">
                    <div className="cos-toolkit-label">Trigger</div>
                    <div className="cos-toolkit-value">{tool.trigger}</div>
                  </div>
                </>
              )}
              <div className="cos-toolkit-actions">
                {tool.primaryHref ? (
                  <a className="cos-toolkit-btn is-primary" href={tool.primaryHref} target="_blank" rel="noreferrer">
                    {tool.primaryLabel}
                  </a>
                ) : tool.primaryAction ? (
                  <button type="button" className="cos-toolkit-btn is-primary" onClick={() => runAction(tool.primaryAction)}>
                    {tool.primaryLabel}
                  </button>
                ) : null}
                {tool.secondaryAction ? (
                  <button type="button" className="cos-toolkit-btn" onClick={() => runAction(tool.secondaryAction)}>
                    {tool.secondaryLabel}
                  </button>
                ) : tool.secondaryHref ? (
                  <a className="cos-toolkit-btn" href={tool.secondaryHref} target="_blank" rel="noreferrer">
                    {tool.secondaryLabel}
                  </a>
                ) : null}
              </div>
              {!tool.simpleCard && <div className="cos-toolkit-note">{tool.note}</div>}
            </div>
          </section>
        ))}
      </div>
      {briefMakerOpen && (
        <div className="brief-modal-backdrop" onClick={() => setBriefMakerOpen(false)}>
          <div className="brief-maker-panel" onClick={e => e.stopPropagation()}>
            <div className="brief-modal-hd">
              <div>
                <h2 className="brief-modal-title">Brief Maker</h2>
              </div>
              <div className="brief-modal-hd-actions">
                <button type="button" className="brief-modal-close" onClick={() => setBriefMakerOpen(false)} aria-label="Close brief maker">
                  <V3Icon name="x" w={14} />
                </button>
              </div>
            </div>
            <div className="brief-maker-body">
              <div className="brief-maker-form">
                <div className="brief-maker-source-panel">
                  <div className="brief-maker-hero">
                    <div className="brief-maker-hero-kicker">Robert brief</div>
                    <h3>Paste a source link and build the doc</h3>
                    <p>One clean input. One click. Brief Maker reads the source and creates the Google Doc on Robert&apos;s account.</p>
                  </div>
                  <label className="brief-maker-field brief-maker-field-wide">
                    <span>Paste source link</span>
                    <input
                      className="brief-maker-input"
                      value={briefForm.source_url || briefForm.notion_url}
                      onChange={e => {
                        updateBriefField('source_url', e.target.value);
                        updateBriefField('notion_url', e.target.value);
                      }}
                      placeholder="Paste a public Notion page or Google Doc link"
                    />
                  </label>
                  <div className="brief-maker-source-note">
                    Paste one link. Brief Maker will read it and build the Google Doc on Robert&apos;s account.
                  </div>
                  <div className="brief-maker-source-actions">
                    <button type="button" className="cos-toolkit-btn is-primary" onClick={buildBriefFromSource}>
                      {briefJobId || notionStatus === 'importing' || docStatus === 'creating' ? 'Building...' : 'Go'}
                    </button>
                  </div>
                </div>
              </div>
              <aside className="brief-maker-preview">
                <div className="brief-maker-server-status">
                  {notionStatus === 'idle' && docStatus === 'idle' && (
                    <div className="brief-maker-empty-state">
                      <strong>Ready</strong>
                      <span>Paste the link above, then press Go.</span>
                    </div>
                  )}
                  {notionStatus === 'error' && (
                    <span className="brief-maker-server-error">{notionError}</span>
                  )}
                  {notionStatus === 'importing' && (
                    <span className="brief-maker-server-note">
                      {briefJobStatus === 'queued'
                        ? 'Saved to your brief machine. Build is queued now.'
                        : 'Reading the link and building Robert&apos;s Google Doc in the background...'}
                    </span>
                  )}
                  {docStatus === 'error' && (
                    <span className="brief-maker-server-error">{docError}</span>
                  )}
                  {docStatus === 'creating' && (
                    <span className="brief-maker-server-note">
                      {briefJobStatus === 'queued'
                        ? 'Job queued. Your Mac is picking up the brief now.'
                        : briefJobStatus === 'running'
                          ? 'Job running on your Mac. You can leave this screen and come back.'
                          : 'Creating the Google Doc on Robert&apos;s account...'}
                    </span>
                  )}
                  {docStatus === 'done' && docResult && (
                    <div className="brief-maker-result-card">
                      <span className="brief-maker-server-ok">Succeeded. Robert&apos;s Google Doc is ready.</span>
                      <div className="brief-maker-field-grid">
                        <label className="brief-maker-field">
                          <span>Calendar task title</span>
                          <input
                            className="brief-maker-input"
                            value={briefForm.calendar_title}
                            onChange={e => updateBriefField('calendar_title', e.target.value)}
                            placeholder={briefForm.title || 'Robert brief task title'}
                          />
                        </label>
                        <label className="brief-maker-field">
                          <span>Calendar mode</span>
                          <div className="brief-maker-mode-toggle">
                            <button
                              type="button"
                              className={'cos-toolkit-btn' + ((briefForm.calendar_mode || 'all_day') === 'all_day' ? ' is-primary' : '')}
                              onClick={() => updateBriefField('calendar_mode', 'all_day')}
                            >
                              All-day task
                            </button>
                            <button
                              type="button"
                              className={'cos-toolkit-btn' + ((briefForm.calendar_mode || 'all_day') === 'timed' ? ' is-primary' : '')}
                              onClick={() => updateBriefField('calendar_mode', 'timed')}
                            >
                              Timed event
                            </button>
                          </div>
                        </label>
                        <label className="brief-maker-field">
                          <span>Date</span>
                          <input
                            className="brief-maker-input"
                            type="date"
                            value={briefForm.calendar_date || ''}
                            onChange={e => updateBriefField('calendar_date', e.target.value)}
                          />
                        </label>
                        <label className="brief-maker-field">
                          <span>Start</span>
                          <input
                            className="brief-maker-input"
                            type="time"
                            value={briefForm.calendar_start || ''}
                            onChange={e => updateBriefField('calendar_start', e.target.value)}
                          />
                        </label>
                        <label className="brief-maker-field">
                          <span>End</span>
                          <input
                            className="brief-maker-input"
                            type="time"
                            value={briefForm.calendar_end || ''}
                            onChange={e => updateBriefField('calendar_end', e.target.value)}
                          />
                        </label>
                      </div>
                      <span className="brief-maker-server-note">
                        {(briefForm.calendar_mode || 'all_day') === 'all_day'
                          ? 'All-day task keeps the brief pinned at the top of Robert’s calendar. The actual target time still stays in the description.'
                          : 'Timed event is best for interviews, meetings, calls, and anything Robert must attend at an exact hour.'}
                      </span>
                      <div className="brief-maker-result-actions">
                        <a className="cos-toolkit-btn is-primary" href={docResult.url} target="_blank" rel="noreferrer">Open Google Doc</a>
                        <button type="button" className="cos-toolkit-btn" onClick={createCalendarHold}>
                          {calendarStatus === 'creating' ? 'Adding to calendar...' : 'Add to Robert calendar'}
                        </button>
                      </div>
                      {calendarStatus === 'error' && (
                        <span className="brief-maker-server-error">{calendarError}</span>
                      )}
                      {calendarStatus === 'done' && calendarResult && (
                        <div className="brief-maker-result-actions">
                          <span className="brief-maker-server-ok">
                            {calendarResult.kind === 'task'
                              ? 'Added to Robert’s Google Tasks.'
                              : 'Placed on Robert’s calendar.'}
                          </span>
                          {calendarResult.htmlLink && (
                            <a className="cos-toolkit-btn" href={calendarResult.htmlLink} target="_blank" rel="noreferrer">
                              {calendarResult.kind === 'task' ? 'Open task' : 'Open calendar event'}
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="brief-maker-footer-actions">
                  <button type="button" className="cos-toolkit-btn" onClick={resetBriefForm}>Reset</button>
                </div>
              </aside>
            </div>
          </div>
        </div>
      )}
      {handoffPreviewOpen && (
        <div className="brief-modal-backdrop" onClick={() => setHandoffPreviewOpen(false)}>
          <div className="brief-maker-panel handoff-preview-panel" onClick={e => e.stopPropagation()}>
            <div className="brief-modal-hd">
              <div>
                <div className="brief-maker-hero-kicker">Robert operator</div>
                <h2 className="brief-modal-title">Handoff Drafts</h2>
              </div>
              <div className="brief-modal-hd-actions">
                <button type="button" className="cos-toolkit-btn" onClick={loadRobertHandoffPreview}>
                  {handoffPreviewStatus === 'loading' ? 'Refreshing...' : 'Refresh'}
                </button>
                <button type="button" className="brief-modal-close" onClick={() => setHandoffPreviewOpen(false)} aria-label="Close handoff drafts">
                  <V3Icon name="x" w={14} />
                </button>
              </div>
            </div>
            <div className="handoff-preview-body">
              <div className="handoff-preview-headline">
                <strong>{handoffPreviewData?.drafts?.length || 0} drafts ready</strong>
                <span>
                  {handoffPreviewData?.generated_at
                    ? `Updated ${V4RobertHandoffTimestamp(handoffPreviewData.generated_at)}`
                    : 'Preview file is waiting for the next operator run'}
                </span>
              </div>
              {handoffPreviewStatus === 'loading' && (
                <div className="brief-maker-empty-state">
                  <strong>Loading drafts</strong>
                  <span>Pulling the latest Robert handoff preview from your machine.</span>
                </div>
              )}
              {handoffPreviewStatus === 'error' && (
                <div className="brief-maker-empty-state">
                  <strong>Could not load drafts</strong>
                  <span className="brief-maker-server-error">{handoffPreviewError}</span>
                </div>
              )}
              {handoffPreviewStatus === 'done' && !(handoffPreviewData?.drafts || []).length && (
                <div className="brief-maker-empty-state">
                  <strong>No drafts yet</strong>
                  <span>Run the Robert handoff operator and the next preview set will show here.</span>
                </div>
              )}
              {handoffPreviewStatus === 'done' && (handoffPreviewData?.drafts || []).length > 0 && (
                <div className="handoff-preview-list">
                  {(handoffPreviewData?.drafts || []).map((draft, index) => (
                    <section key={`${draft.subject || 'draft'}-${index}`} className="handoff-preview-card">
                      <div className="handoff-preview-card-top">
                        <div className="handoff-preview-card-id">
                          <span className="cos-chip cos-chip-tight">{String(draft?.kind || 'email').toUpperCase()}</span>
                          <strong>{V4RobertHandoffRecipients(draft)}</strong>
                        </div>
                        <button type="button" className="cos-toolkit-btn" onClick={() => copyHandoffDraft(draft, index)}>
                          {handoffCopiedIndex === index ? 'Copied' : 'Copy draft'}
                        </button>
                      </div>
                      <div className="handoff-preview-row">
                        <div className="handoff-preview-label">Subject</div>
                        <div className="handoff-preview-value">{draft.subject || 'No subject'}</div>
                      </div>
                      <div className="handoff-preview-row">
                        <div className="handoff-preview-label">Draft</div>
                        <pre className="handoff-preview-copy">{String(draft.body || '').trim()}</pre>
                      </div>
                      <div className="handoff-preview-row is-context">
                        <div className="handoff-preview-label">Why this lead</div>
                        <div className="handoff-preview-context">{V4RobertHandoffContext(draft.context)}</div>
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function V4CosReader({ lead, user, composeOpen, setComposeOpen, onBack }) {
  const { STAGE_BY_ID, USERS } = window.V3;
  const [tab, setTab] = React.useState('thread');
  const [handoffDraftLoading, setHandoffDraftLoading] = React.useState(false);
  const [handoffDraftError, setHandoffDraftError] = React.useState('');
  React.useEffect(() => { setTab('thread'); }, [lead?.id]);
  React.useEffect(() => {
    setHandoffDraftLoading(false);
    setHandoffDraftError('');
  }, [lead?.id]);
  if (!lead) {
    return <div className="cos2-reader"><div className="cos2-reader-empty">Select a thread from the list.</div></div>;
  }
  const stage = STAGE_BY_ID[lead.stage];
  const nextOwner = lead.nextMove?.who ? USERS[lead.nextMove.who] : null;
  const isMine = window.V3.MoveIsMineForProfile(lead, user);
  const isThem = !lead.nextMove?.who && !['paid-out'].includes(lead.stage);
  const replyAction = ['Reply', 'Send', 'Nudge'].includes(lead.nextMove?.action);
  const owner = lead.ownerId ? USERS[lead.ownerId] : null;
  const operatorStatus = V4OperatorStatus(lead);
  const operatorSummary = lead.operatorSummary || {};
  const operatorAnalysis = lead.operatorAnalysis || {};
  const operatorEscalation = Array.isArray(lead.operatorEscalation) ? lead.operatorEscalation : [];
  const execution = V4CompanyOsExecutionMeta(lead);
  const quickStages = V4QuickStageActions(lead);
  const mailboxOrigin = V4CompanyOsMailboxOrigin(lead);
  const isXLead = mailboxOrigin === 'x';
  const compactMeta = [lead.contactRole, isXLead ? lead.xHandle : '', lead.email].filter(Boolean).join(' · ');
  const listSnippet = V4CompanyOsListSnippet(lead);
  const operatorBadgeVisible = operatorStatus.label !== 'Monitoring';
  const xContextRows = V4XLeadContextRows(lead);
  const supportsRobertHandoff = V4LeadSupportsRobertHandoff(lead);
  const hasPendingRobertDraft = supportsRobertHandoff && Boolean(lead.draftReply) && String(lead.draftReplyStatus || '').toLowerCase() === 'pending';
  const primaryLabel = supportsRobertHandoff
    ? (hasPendingRobertDraft ? 'Approve draft' : 'Load Robert draft')
    : (isXLead && !lead.email ? 'Prep email handoff' : (lead.draftReply ? 'Approve draft' : (replyAction ? lead.nextMove.action : 'Reply')));
  const moveLead = (nextStage) => window.V3.MoveLeadStage(lead, nextStage);
  const clearUnread = () => V4CosPatchLead(lead, { new_reply_at: null }, { unread: false });
  const loadRobertDraft = async () => {
    setHandoffDraftLoading(true);
    setHandoffDraftError('');
    try {
      const draft = await V4GenerateRobertHandoffDraft(lead);
      const patch = { draft_reply: draft, draft_reply_status: 'pending', new_reply_at: null };
      V4CosPatchLead(lead, patch, { draftReply: draft, draftReplyStatus: 'pending', unread: false });
      setComposeOpen(true);
    } catch (err) {
      setHandoffDraftError(err.message || 'Could not build the Robert draft.');
    } finally {
      setHandoffDraftLoading(false);
    }
  };
  const handlePrimaryAction = () => {
    if (supportsRobertHandoff && !hasPendingRobertDraft) {
      loadRobertDraft();
      return;
    }
    setComposeOpen(true);
  };
  const readerOps = (
    <>
      <div className="cos-quick-actions">
        <div className="cos-quick-actions-group">
          <span className="cos-quick-actions-label">Quick actions</span>
          <button className="cos-quick-btn is-primary" type="button" onClick={handlePrimaryAction} disabled={handoffDraftLoading}>
            {handoffDraftLoading ? 'Loading draft...' : primaryLabel}
          </button>
          {isXLead && lead.xOpenDm && (
            <button className="cos-quick-btn" type="button" onClick={() => window.open(lead.xOpenDm, '_blank', 'noopener')}>
              Open DM
            </button>
          )}
          {lead.unread && (
            <button className="cos-quick-btn" type="button" onClick={clearUnread}>
              Mark read
            </button>
          )}
          <button className="cos-quick-btn is-danger" type="button" onClick={() => moveLead('trash')}>
            Trash
          </button>
        </div>
        <div className="cos-quick-actions-group">
          <span className="cos-quick-actions-label">Move to</span>
          {quickStages.map(action => (
            <button
              key={action.stage}
              className="cos-quick-btn"
              type="button"
              onClick={() => moveLead(action.stage)}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
      {handoffDraftError && (
        <div className="brief-maker-empty-state" style={{ marginTop: 12 }}>
          <strong>Could not prepare the Robert draft</strong>
          <span className="brief-maker-server-error">{handoffDraftError}</span>
        </div>
      )}
      {(lead.operatorMemory || lead.draftReply) && (
        <section className="cos-operator-strip">
          <div className="cos-operator-strip-head">
            <div>
              <div className="cos-operator-strip-eyebrow">Operator</div>
              <h3>Lead operator readout</h3>
            </div>
            <span className={`cos-operator-status is-${operatorStatus.tone}`}>{operatorStatus.label}</span>
          </div>
          <div className="cos-operator-grid">
            <div className="cos-operator-card">
              <div className="cos-operator-card-label">Current read</div>
              <div className="cos-operator-card-value">
                {operatorSummary.current_status || operatorAnalysis.reason || 'Waiting for more thread context.'}
              </div>
            </div>
            <div className="cos-operator-card">
              <div className="cos-operator-card-label">Suggested next step</div>
              <div className="cos-operator-card-value">
                {operatorSummary.next_action || lead.nextMove?.text || 'Review thread'}
              </div>
            </div>
            <div className="cos-operator-card">
              <div className="cos-operator-card-label">Stage / reply type</div>
              <div className="cos-operator-card-value">
                {[operatorAnalysis.stage ? V4CompanyOsPhase({ stage: operatorAnalysis.stage }) : '', operatorAnalysis.reply_type ? V4OperatorReplyTypeLabel(operatorAnalysis.reply_type) : '']
                  .filter(Boolean)
                  .join(' · ') || 'No operator stage yet'}
              </div>
            </div>
            <div className="cos-operator-card">
              <div className="cos-operator-card-label">Rate / timing</div>
              <div className="cos-operator-card-value">
                {[operatorSummary.quoted_rate, operatorSummary.launch_timing].filter(Boolean).join(' · ') || 'No hard rate or date captured yet'}
              </div>
            </div>
          </div>
          {operatorSummary.lead_summary && (
            <div className="cos-operator-summary">
              <strong>Summary</strong>
              <p>{operatorSummary.lead_summary}</p>
            </div>
          )}
          {operatorEscalation.length > 0 && (
            <div className="cos-operator-escalation">
              <strong>Needs human eyes</strong>
              <div className="cos-operator-escalation-list">
                {operatorEscalation.map(item => <span key={item} className="cos-chip cos-chip-soft">{item.replace(/_/g, ' ')}</span>)}
              </div>
            </div>
          )}
        </section>
      )}
      <V4CompanyOsExecutionPanel lead={lead} execution={execution} />
    </>
  );
  return (
    <div className="cos2-reader">
      <div className="drawer-hd">
        <button className="hd-icon-btn cos2-back" onClick={onBack} aria-label="Back to list">
          <V3Icon name="chev_d" w={14} style={{ transform: 'rotate(90deg)' }} />
        </button>
        <span className="drawer-hd-brand">{lead.brand}</span>
        <span className="drawer-hd-stage" style={{ color: stage.color }}>
          <span className="drawer-hd-stage-dot" style={{ background: stage.color }}></span>
          {stage.name}
        </span>
      </div>
      <div className="cos-reader-hero">
        <div className="drawer-top">
          <V3Avatar name={lead.contactName} color={lead.color} size="lg" />
          <div className="drawer-top-text">
            <div className="drawer-top-meta">
              <span className="drawer-top-chip">{lead.source}</span>
              {mailboxOrigin === 'asher' && <span className="drawer-top-chip">Asher</span>}
              {mailboxOrigin === 'robert' && <span className="drawer-top-chip">Robert</span>}
              {mailboxOrigin === 'x' && <span className="drawer-top-chip">X</span>}
              {owner && <span className="drawer-top-chip">Owner · {owner.name}</span>}
              {lead.category && <span className={'cat-tab cat-' + lead.category}>{lead.category}</span>}
            </div>
            <h2 className="drawer-top-name">{lead.contactName}</h2>
            <div className="drawer-top-co">
              <strong>{lead.brand}</strong>
              {compactMeta ? <span> · {compactMeta}</span> : null}
            </div>
          </div>
        </div>
        <div className="drawer-facts">
          {lead.value ? <span className="drawer-fact mono">{v3Money(lead.value)}</span> : null}
          <span className="drawer-fact mono">{lead.daysInStage}d in stage</span>
          <span className="drawer-fact">{stage.name}</span>
          {isXLead && lead.xMessageCount ? <span className="drawer-fact">{lead.xMessageCount} DM{lead.xMessageCount === 1 ? '' : 's'}</span> : null}
          {lead.deliverables ? <span className="drawer-fact drawer-fact-wide" title={lead.deliverables}>{lead.deliverables}</span> : null}
          {operatorBadgeVisible ? <span className="drawer-fact">{operatorStatus.label}</span> : null}
        </div>
        <div className={'next-move next-move-compact ' + (isMine ? '' : 'them')}>
          <div className="next-move-icon">
            <V3Icon name={isMine ? 'reply' : 'clock'} w={16} />
          </div>
          <div className="next-move-text">
            <div className="next-move-eyebrow">
              {isMine ? 'Your move' : isThem ? `Waiting on ${lead.contactName.split(' ')[0]}` : nextOwner ? `${nextOwner.name}'s move` : 'Next move'}
            </div>
            <div className="next-move-title">{lead.nextMove?.text || listSnippet}</div>
          </div>
          {isMine && replyAction && (
            <div className="next-move-actions">
              <button className="btn btn-sm btn-accent" onClick={() => setComposeOpen(true)}>
                <V3Icon name="arrow_r" w={13} />
                {lead.nextMove.action}
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="drawer-tabs">
        <button className="dr-tab" aria-selected={tab === 'thread'} onClick={() => setTab('thread')}>
          {isXLead ? 'Lead context' : 'Email thread'} <span className="cnt">{lead.thread.length}</span>
        </button>
        <button className="dr-tab" aria-selected={tab === 'stands'} onClick={() => setTab('stands')}>
          Where this stands
        </button>
      </div>
      <div className="drawer-body">
        {tab === 'thread' && (
          isXLead ? (
            <div className="cos-reader-stands">
              <div className="cos-operator-strip">
                <div className="cos-operator-strip-head">
                  <div>
                    <div className="cos-operator-strip-eyebrow">X intake</div>
                    <h3>What came in from the DM scrape</h3>
                  </div>
                  {lead.xOpenDm ? (
                    <button className="cos-quick-btn" type="button" onClick={() => window.open(lead.xOpenDm, '_blank', 'noopener')}>
                      Open DM
                    </button>
                  ) : null}
                </div>
                <div className="cos-operator-grid">
                  <div className="cos-operator-card">
                    <div className="cos-operator-card-label">Source</div>
                    <div className="cos-operator-card-value">{lead.xHandle || lead.contactName}</div>
                  </div>
                  <div className="cos-operator-card">
                    <div className="cos-operator-card-label">Type</div>
                    <div className="cos-operator-card-value">{lead.deliverables || 'X DM lead'}</div>
                  </div>
                  <div className="cos-operator-card">
                    <div className="cos-operator-card-label">Message count</div>
                    <div className="cos-operator-card-value">{lead.xMessageCount || 1} DM{lead.xMessageCount === 1 ? '' : 's'}</div>
                  </div>
                  <div className="cos-operator-card">
                    <div className="cos-operator-card-label">Email captured</div>
                    <div className="cos-operator-card-value">{lead.email || 'No email captured yet'}</div>
                  </div>
                </div>
                <div className="cos-operator-summary">
                  {xContextRows.map(row => (
                    <div key={row.label} className="handoff-preview-row">
                      <div className="handoff-preview-label">{row.label}</div>
                      <div className="handoff-preview-context">{row.value}</div>
                    </div>
                  ))}
                  {!xContextRows.length && <p>No X intake context was saved for this lead yet.</p>}
                </div>
              </div>
            </div>
          ) : <V3Thread lead={lead} />
        )}
        {tab === 'stands' && (
          <div className="cos-reader-stands">
            {readerOps}
            <V3Stands lead={lead} />
          </div>
        )}
      </div>
      <div className="drawer-foot">
        {composeOpen ? (
          <V3InlineReply lead={lead} user={user} onCollapse={() => setComposeOpen(false)} />
        ) : (
          <button className="drawer-reply-bar" onClick={handlePrimaryAction}>
            <V3Icon name="reply" w={14} />
            <span>{supportsRobertHandoff ? `${hasPendingRobertDraft ? 'Approve Robert draft' : 'Load Robert draft'} for ${lead.contactName.split(' ')[0]}` : (isXLead && !lead.email ? `Prep handoff for ${lead.contactName.split(' ')[0]}` : `Reply to ${lead.contactName.split(' ')[0]}${lead.draftReply ? ' — draft ready' : ''}`)}</span>
            <V3Icon name="chev_d" w={12} style={{ transform: 'rotate(180deg)' }} />
          </button>
        )}
      </div>
    </div>
  );
}

function V4CompanyOsView({ leads = [], query = '', user = 'asher', onOpenLead, onNavigateView }) {
  React.useEffect(() => {
    V4MaybeRedirectToMachineHostedApp();
  }, []);

  const base = React.useMemo(() => leads
    .filter(l => !l.isRobertBrief)
    .filter(l => !(window.V3.IsNewLeadReview && window.V3.IsNewLeadReview(l)))
    .filter(l => V4CompanyOsFilterLead(l, query)), [leads, query]);
  const live = base.filter(l => !['trash', 'dead-leads'].includes(l.stage));
  const byStale = (a, b) => (b.daysInStage || 0) - (a.daysInStage || 0);
  const byRecent = (a, b) => V3TimestampForUi(b.lastTouchAt) - V3TimestampForUi(a.lastTouchAt);

  // Snooze, Superhuman style — H hides a thread until tomorrow 9am.
  // Stored per browser; snoozed threads live in their own split.
  const [snoozes, setSnoozes] = React.useState(() => {
    try { return JSON.parse(window.localStorage.getItem('v4-snoozes') || '{}'); } catch (e) { return {}; }
  });
  React.useEffect(() => {
    try { window.localStorage.setItem('v4-snoozes', JSON.stringify(snoozes)); } catch (e) {}
  }, [snoozes]);
  const nowTs = Date.now();
  const isSnoozed = (l) => snoozes[l.id] && Date.parse(snoozes[l.id]) > nowTs;
  const awake = live.filter(l => !isSnoozed(l));
  const followUpItems = awake.filter(l => l.followUpDue && !l.unread).sort(byStale);
  const activeItems = awake.filter(l => !['done', 'paid-out', 'trash', 'dead-leads'].includes(l.stage));
  const replyItems = activeItems.filter(l => l.unread && l.nextMove?.who).sort(byStale);
  const pricingItems = activeItems.filter(l => l.stage === 'rates-sent').sort(byStale);
  const negoItems = activeItems.filter(l => l.stage === 'negotiating').sort(byStale);
  const paymentItems = activeItems.filter(l => l.stage === 'invoice-sent').sort(byStale);
  const briefingItems = awake.filter(l => l.stage === 'done').sort(byRecent);
  const waitingItems = activeItems.filter(l => !l.unread && !l.nextMove?.who).sort(byRecent);
  const closedItems = awake.filter(l => ['done', 'paid-out'].includes(l.stage)).sort(byRecent);

  const splits = [
    { id: 'reply',    label: 'New activity',     section: 'Workflow', hot: true, items: replyItems },
    { id: 'followups',label: 'Follow ups',       section: 'Workflow', hot: followUpItems.length > 0, items: followUpItems },
    { id: 'pricing',  label: 'Pricing sent',     section: 'Workflow', items: pricingItems },
    { id: 'nego',     label: 'Negotiating',      section: 'Workflow', items: negoItems },
    { id: 'payment',  label: 'Payment / terms',  section: 'Workflow', items: paymentItems },
    { id: 'briefing', label: 'Brief / calendar', section: 'Workflow', items: briefingItems },
    { id: 'waiting',  label: 'Waiting on them',  section: 'Workflow', items: waitingItems },
    { id: 'snoozed', label: 'Snoozed',         section: 'System', items: live.filter(isSnoozed).sort((a, b) => Date.parse(snoozes[a.id]) - Date.parse(snoozes[b.id])) },
    { id: 'closed',  label: 'Done and paid',   section: 'System', items: closedItems },
    { id: 'trash',   label: 'Trash',           section: 'System', trash: true, items: base.filter(l => ['trash', 'dead-leads'].includes(l.stage)).sort(byRecent) },
    { id: 'brief',   label: 'Overview',        section: 'System', brief: true },
    { id: 'toolkit', label: 'Toolkit',         section: 'System', toolkit: true, items: V4_COMPANY_OS_TOOLKIT },
  ];

  const [splitId, setSplitId] = React.useState('reply');
  const [selId, setSelId] = React.useState(null);
  const [composeOpen, setComposeOpen] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const split = splits.find(s => s.id === splitId) || splits[0];
  const items = split.items || [];
  const selected = items.find(l => String(l.id) === String(selId)) || items[0] || null;

  React.useEffect(() => {
    try {
      const current = new URL(String(window.location?.href || ''));
      if (current.searchParams.get('open') === 'brief-maker') {
        setSplitId('toolkit');
      }
    } catch (err) {}
  }, []);

  React.useEffect(() => { setSelId(null); setMobileOpen(false); setComposeOpen(false); }, [splitId]);
  React.useEffect(() => { setComposeOpen(false); }, [selected?.id]);

  const moveSel = (delta) => {
    if (!items.length) return;
    const idx = items.findIndex(l => String(l.id) === String(selected?.id));
    const next = items[Math.min(items.length - 1, Math.max(0, (idx === -1 ? 0 : idx + delta)))];
    if (next) setSelId(next.id);
  };
  const advanceFrom = (lead) => {
    const idx = items.findIndex(l => String(l.id) === String(lead.id));
    const next = items[idx + 1] || items[idx - 1] || null;
    if (next) setSelId(next.id);
  };
  const archive = () => {
    if (!selected) return;
    advanceFrom(selected);
    window.V3.MoveLeadStage(selected, 'trash');
  };
  // H — snooze until tomorrow 9am (or wake it from the Snoozed split)
  const snoozeSelected = () => {
    if (!selected) return;
    advanceFrom(selected);
    if (split.id === 'snoozed') {
      setSnoozes(s => { const copy = { ...s }; delete copy[selected.id]; return copy; });
    } else {
      const until = new Date();
      until.setDate(until.getDate() + 1);
      until.setHours(9, 0, 0, 0);
      setSnoozes(s => ({ ...s, [selected.id]: until.toISOString() }));
    }
  };
  // U — toggle read state, backed by new_reply_at in Supabase
  const toggleRead = () => {
    if (!selected) return;
    if (selected.unread) {
      V4CosPatchLead(selected, { new_reply_at: null }, { unread: false });
    } else {
      const ts = new Date().toISOString();
      V4CosPatchLead(selected, { new_reply_at: ts }, { unread: true });
    }
  };

  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (composeOpen) setComposeOpen(false);
        else if (mobileOpen) setMobileOpen(false);
        return;
      }
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (split.brief || split.toolkit) return;
      if (e.key === 'j' || e.key === 'J' || e.key === 'ArrowDown') { e.preventDefault(); moveSel(1); }
      if (e.key === 'k' || e.key === 'K' || e.key === 'ArrowUp')   { e.preventDefault(); moveSel(-1); }
      if (e.key === 'r' || e.key === 'R') { e.preventDefault(); if (selected) setComposeOpen(true); }
      if (e.key === 'e' || e.key === 'E') { e.preventDefault(); archive(); }
      if (e.key === 'h' || e.key === 'H') { e.preventDefault(); snoozeSelected(); }
      if (e.key === 'u' || e.key === 'U') { e.preventDefault(); toggleRead(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const replyCount = splits.find(s => s.id === 'reply')?.items.length || 0;
  const followUpCount = splits.find(s => s.id === 'followups')?.items.length || 0;
  const p0Count = live.filter(l => l.unread || l.stage === 'invoice-sent').length;
  const invoicedOutstanding = live.filter(l => l.stage === 'invoice-sent').reduce((s, l) => s + (l.value || 0), 0);
  const openPipeline = live.filter(l => !['done', 'paid-out'].includes(l.stage)).reduce((s, l) => s + (l.value || 0), 0);

  return (
    <section className="page cos2-page">
      <header className="cos2-top">
        <span className="cos2-brand">
          <V4CompanyOsBuildingIcon size={18} />
          <strong>UnalignedOS</strong>
        </span>
        <span className="cos-kpi cos-kpi-tight"><strong>{p0Count}</strong> P0</span>
        <span className="cos-kpi cos-kpi-tight cos-kpi-accent"><strong>{replyCount}</strong> reply now</span>
        <span className="cos-kpi cos-kpi-tight"><strong>{followUpCount}</strong> 2d follow ups</span>
        <span className="cos-kpi cos-kpi-tight"><strong>{V4CompanyOsMoney(invoicedOutstanding) || '$0'}</strong> Terms / pay</span>
        <span className="cos-kpi cos-kpi-tight"><strong>{V4CompanyOsMoney(openPipeline) || '$0'}</strong> In play</span>
        <button type="button" className="cos-refresh-btn cos2-refresh" onClick={() => window.location.reload()}>↻ Refresh</button>
      </header>
      <div className={'cos2-body' + (mobileOpen ? ' is-mobile-open' : '')}>
        <nav className="cos2-rail" aria-label="Splits">
          {splits.map((s, idx) => (
            <React.Fragment key={s.id}>
              {(idx === 0 || splits[idx - 1].section !== s.section) && (
                <div className="cos2-split-section">{s.section}</div>
              )}
              <button type="button"
                      className={'cos2-split' + (s.id === split.id ? ' is-active' : '') + (s.hot ? ' is-hot' : '')}
                      onClick={() => setSplitId(s.id)}>
                <span className="cos2-split-label">{s.label}</span>
                {!s.brief && !s.toolkit && <span className="cos2-split-cnt">{s.items.length}</span>}
              </button>
            </React.Fragment>
          ))}
          <div className="dq-hints cos2-hints">
            <span><kbd>J</kbd><kbd>K</kbd> move</span>
            <span><kbd>R</kbd> reply</span>
            <span><kbd>E</kbd> archive</span>
            <span><kbd>H</kbd> snooze</span>
            <span><kbd>U</kbd> unread</span>
            <span><kbd>⌘K</kbd> commands</span>
            <span><kbd>?</kbd> help</span>
          </div>
        </nav>
        {split.brief ? (
          <div className="cos2-main-scroll"><V4CosOverview leads={live} replyCount={replyCount} /></div>
        ) : split.toolkit ? (
          <div className="cos2-main-scroll"><V4CosToolkit onNavigateView={onNavigateView} onActivateSplit={setSplitId} /></div>
        ) : (
          <>
            <div className="cos2-list">
              {items.map(l => (
                <div key={l.id} className={'cos2-row-wrap' + (String(l.id) === String(selected?.id) ? ' is-current' : '')}>
                  {(() => {
                    const rowOperator = V4OperatorStatus(l);
                    const showRowOperator = rowOperator.label !== 'Monitoring';
                    const rowSnippet = V4CompanyOsListSnippet(l);
                    return (
                  <button type="button"
                          className={'cos2-row' + (String(l.id) === String(selected?.id) ? ' is-current' : '')}
                          onClick={() => { setSelId(l.id); setMobileOpen(true); }}>
                    <span className="cos2-row-top">
                      <span className="cos2-row-brandline">
                        {l.unread && <span className="dq-dot" />}
                        <span className="cos2-row-brand">{l.brand}</span>
                        <span className={'cos2-row-source is-' + String(l.source || '').toLowerCase()}>{l.source || 'lead'}</span>
                      </span>
                      {showRowOperator && (l.draftReply || l.operatorMemory) && (
                        <span className={'cos2-row-operator is-' + rowOperator.tone}>{rowOperator.label}</span>
                      )}
                      <span className="cos2-row-when">{l.lastTouch}</span>
                    </span>
                    <span className="cos2-row-name">{l.contactName}</span>
                    <span className="cos2-row-snip">{rowSnippet}</span>
                  </button>
                    );
                  })()}
                  <button type="button"
                          className="cos2-row-act"
                          title={split.trash ? 'Restore to board' : 'Move to trash'}
                          aria-label={split.trash ? 'Restore lead' : 'Trash lead'}
                          onClick={(e) => { e.stopPropagation(); window.V3.MoveLeadStage(l, split.trash ? 'new' : 'trash'); }}>
                    <V3Icon name={split.trash ? 'reply' : 'trash'} w={13} />
                  </button>
                </div>
              ))}
              {items.length === 0 && (
                <div className="cos2-zero">
                  <span className="cos2-zero-mark">✓</span>
                  <strong>Inbox zero</strong>
                  <span>Nothing in {split.label.toLowerCase()}. Breathe.</span>
                </div>
              )}
            </div>
            <V4CosReader lead={selected} user={user}
                         composeOpen={composeOpen} setComposeOpen={setComposeOpen}
                         onBack={() => setMobileOpen(false)} />
          </>
        )}
      </div>
    </section>
  );
}

window.V4CompanyOsView = V4CompanyOsView;


// FLOW v4 — main app shell (refined top bar + view wiring)

const V4_TWEAKS = /*EDITMODE-BEGIN*/{
  "viewAs": "robert",
  "theme": "light",
  "view": "company-os"
}/*EDITMODE-END*/;

function V4DefaultViewForUser(user) {
  return 'company-os';
}

// ── Command palette (⌘K) — Superhuman style ────────────────
function V4CommandPalette({ open, onClose, commands, leads, onOpenLead }) {
  const [q, setQ] = React.useState('');
  const [idx, setIdx] = React.useState(0);
  const inputRef = React.useRef(null);
  React.useEffect(() => {
    if (open) { setQ(''); setIdx(0); setTimeout(() => inputRef.current?.focus(), 30); }
  }, [open]);
  if (!open) return null;
  const ql = q.trim().toLowerCase();
  const cmdResults = commands.filter(c => !ql || c.label.toLowerCase().includes(ql));
  const leadResults = ql.length >= 2
    ? leads.filter(l => (l.brand + ' ' + l.contactName + ' ' + (l.email || '')).toLowerCase().includes(ql)).slice(0, 6)
    : [];
  const rows = [
    ...cmdResults.map(c => ({ key: 'cmd-' + c.label, type: 'cmd', label: c.label, hint: c.hint, run: c.run })),
    ...leadResults.map(l => ({ key: 'lead-' + l.id, type: 'lead', label: l.brand, hint: l.contactName, run: () => onOpenLead(l.id) })),
  ];
  const active = Math.min(idx, Math.max(0, rows.length - 1));
  const run = (row) => { onClose(); row.run(); };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(rows.length - 1, i + 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setIdx(i => Math.max(0, i - 1)); }
    if (e.key === 'Enter' && rows[active]) { e.preventDefault(); run(rows[active]); }
  };
  return (
    <>
      <div className="backdrop show" style={{ zIndex: 40 }} onClick={onClose} />
      <div className="cmdk" role="dialog" aria-label="Command palette">
        <input ref={inputRef} className="cmdk-input" value={q}
               placeholder="Type a command or search leads…"
               onChange={e => { setQ(e.target.value); setIdx(0); }}
               onKeyDown={onKey} />
        <div className="cmdk-list">
          {rows.map((row, i) => (
            <button key={row.key}
                    className={'cmdk-row' + (i === active ? ' is-active' : '')}
                    onMouseEnter={() => setIdx(i)}
                    onClick={() => run(row)}>
              <span className="cmdk-row-label">{row.type === 'lead' ? '↗ ' : ''}{row.label}</span>
              {row.hint && <span className="cmdk-row-hint">{row.hint}</span>}
            </button>
          ))}
          {rows.length === 0 && <div className="cmdk-empty">No matches.</div>}
        </div>
      </div>
    </>
  );
}

// ── Shortcuts help (?) ──────────────────────────────────────
function V4HelpOverlay({ open, onClose }) {
  if (!open) return null;
  const rows = [
    ['J / K', 'Next / previous thread'],
    ['Enter / click', 'Open thread'],
    ['R', 'Reply (draft loads)'],
    ['E', 'Archive and advance'],
    ['H', 'Snooze until tomorrow 9am'],
    ['U', 'Toggle read / unread'],
    ['⌘K', 'Command palette'],
    ['/', 'Search'],
    ['Esc', 'Close composer, then back out'],
    ['?', 'This help'],
  ];
  return (
    <>
      <div className="backdrop show" style={{ zIndex: 40 }} onClick={onClose} />
      <div className="help-card" role="dialog" aria-label="Keyboard shortcuts">
        <div className="help-title">Keyboard shortcuts</div>
        {rows.map(([keys, what]) => (
          <div key={keys} className="help-row">
            <span className="help-keys">{keys}</span>
            <span>{what}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function V4App() {
  const [, setConfigVersion] = React.useState(0);
  const { USERS, LEADS, STAGE_BY_ID, ACTIVE_STAGE_IDS } = window.V3;
  const [t, setTweak] = useTweaks(V4_TWEAKS);
  const [view, setView] = React.useState(V4DefaultViewForUser(t.viewAs));
  const [openId, setOpenId] = React.useState(null);
  const [briefId, setBriefId] = React.useState(null);
  const [leads, setLeads] = React.useState(LEADS);
  const [ownerFilter, setOwnerFilter] = React.useState('all');
  const [searchByView, setSearchByView] = React.useState({
    today: '',
    invoices: '',
    board: '',
    'new-leads': '',
    inbox: '',
    leads: '',
    calendar: '',
    'company-os': '',
  });
  const [toast, setToast] = React.useState(null);
  const toastTimer = React.useRef(null);
  const searchRef = React.useRef(null);
  const [pendingReplies, setPendingReplies] = React.useState([]);

  React.useEffect(() => {
    const h = (e) => setBriefId(e.detail.leadId);
    window.addEventListener('v3:open-brief', h);
    return () => window.removeEventListener('v3:open-brief', h);
  }, []);

  React.useEffect(() => {
    const h = (e) => {
      setLeads(e.detail.leads);
      setPendingReplies(curr => {
        if (!window.V3.PrunePendingReplies) return curr;
        return window.V3.PrunePendingReplies(curr, e.detail.leads);
      });
    };
    window.addEventListener('v3:leads-loaded', h);
    return () => window.removeEventListener('v3:leads-loaded', h);
  }, []);

  React.useEffect(() => {
    const h = () => setConfigVersion(v => v + 1);
    window.addEventListener('v3:config-loaded', h);
    return () => window.removeEventListener('v3:config-loaded', h);
  }, []);

  React.useEffect(() => {
    const h = (e) => {
      const sender = window.V3SenderName ? window.V3SenderName(e.detail.sender) : e.detail.sender;
      const pending = {
        leadId: String(e.detail.leadId || ''),
        sender: e.detail.sender,
        subject: e.detail.subject || '',
        body: e.detail.body || '',
        to: Array.isArray(e.detail.to) ? e.detail.to : [],
        cc: Array.isArray(e.detail.cc) ? e.detail.cc : [],
        createdAt: new Date().toISOString(),
      };
      setPendingReplies(curr => {
        const key = window.V3PendingReplyKey ? window.V3PendingReplyKey(pending) : JSON.stringify(pending);
        const next = curr.filter(item => (window.V3PendingReplyKey ? window.V3PendingReplyKey(item) : JSON.stringify(item)) !== key);
        return [...next, pending];
      });
      setToast(`Email sent as ${sender}`);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => {
        setToast(null);
        toastTimer.current = null;
      }, 3000);
    };
    window.addEventListener('v3:email-sent', h);
    return () => {
      window.removeEventListener('v3:email-sent', h);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  React.useEffect(() => {
    document.body.setAttribute('data-theme', t.theme);
  }, [t.theme]);

  const user = t.viewAs;
  const search = searchByView[view] || '';
  const setSearch = React.useCallback((value) => {
    setSearchByView(curr => ({ ...curr, [view]: value }));
  }, [view]);
  const searchPlaceholder = React.useMemo(() => {
    if (view === 'today') return 'Search today…';
    if (view === 'inbox') return user === 'robert' ? 'Search briefs…' : 'Search inbox…';
    if (view === 'invoices') return 'Search invoices…';
    if (view === 'new-leads') return 'Search new leads…';
    if (view === 'leads') return 'Search network…';
    if (view === 'board') return 'Search pipeline…';
    if (view === 'company-os') return 'Search Company OS…';
    return 'Search calendar…';
  }, [view]);

  React.useEffect(() => {
    setOwnerFilter('all');
    setOpenId(null);
    setBriefId(null);
    setView(V4DefaultViewForUser(user));
  }, [user]);

  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [helpOpen, setHelpOpen] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setPaletteOpen(open => !open);
        return;
      }
      if (e.key === 'Escape') {
        setHelpOpen(false);
        if (document.activeElement === searchRef.current) searchRef.current?.blur();
        return;
      }
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === '?') { e.preventDefault(); setHelpOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const me = USERS[user];
  const mergedLeads = React.useMemo(() => {
    return window.V3.MergePendingReplies ? window.V3.MergePendingReplies(leads, pendingReplies) : leads;
  }, [leads, pendingReplies]);
  const visibleLeads = mergedLeads
    .filter(l => !l.isRobertBrief)
    .filter(l => window.V3.LeadVisibleToProfile(l, user))
    .filter(l => window.V3.LeadMatchesQuery ? window.V3.LeadMatchesQuery(l, search) : true);
  const operationalLeads = visibleLeads.filter(l => !(window.V3.IsNewLeadReview && window.V3.IsNewLeadReview(l)));
  const newLeadCount = mergedLeads.filter(l =>
    window.V3.IsNewLeadReview &&
    window.V3.IsNewLeadReview(l)
  ).length;
  // Look up against mergedLeads so the packet drawer opens for any lead
  // (e.g. Company OS shows leads outside the current profile's lane).
  const openLead = mergedLeads.find(l => l.id === openId) || null;
  const unreadCount = operationalLeads.filter(l => l.unread).length;
  // Triage queue for the split lead view: every actionable thread, urgent first.
  // Mirrors the Team Pulse ordering so J/K walks the same list you see there.
  const triageQueue = React.useMemo(() => {
    const eligible = mergedLeads
      .filter(l => !l.isRobertBrief)
      .filter(l => !['trash', 'dead-leads'].includes(l.stage))
      .filter(l => (l.daysInStage || 0) <= 21)
      .filter(l => !(window.V3.IsNewLeadReview && window.V3.IsNewLeadReview(l)))
      .filter(l => l.nextMove?.who);
    const byStale = (a, b) => (b.daysInStage || 0) - (a.daysInStage || 0);
    return [
      ...eligible.filter(l => l.unread).sort(byStale),
      ...eligible.filter(l => !l.unread).sort(byStale),
    ];
  }, [mergedLeads]);

  // Leads hidden from this profile's lane (so empty views can explain themselves)
  const laneHiddenActive = mergedLeads.filter(l =>
    !l.isRobertBrief &&
    !window.V3.LeadVisibleToProfile(l, user) &&
    !['done', 'paid-out', 'trash', 'dead-leads'].includes(l.stage)
  ).length;

  // Scope tag matching the Today scope card
  const SCOPE_TAG = {
    asher:  'Shared sales lane',
    sammy:  'Shared sales lane',
    robert: 'Creator lane',
  };

  const stats = {
    total: operationalLeads.length,
    assigned: operationalLeads.filter(l => window.V3.LeadIsMineForProfile(l, user)).length,
    hot: operationalLeads.filter(l => l.stage === 'rates-sent' && l.daysInStage >= 5).length,
    stuck: operationalLeads.filter(l => l.daysInStage >= 10 && !['paid-out'].includes(l.stage)).length,
    newToday: operationalLeads.filter(l => l.receivedAt && new Date(l.receivedAt).toDateString() === new Date().toDateString()).length,
    pipeline: operationalLeads.filter(l => !['paid-out'].includes(l.stage)).reduce((s, l) => s + (l.value || 0), 0),
  };
  const inboxLabel = user === 'robert' ? 'Brief' : 'Inbox';

  const paletteCommands = [
    { label: 'Go to Company OS', hint: 'workspace', run: () => { setView('company-os'); setOpenId(null); } },
    { label: 'Go to Today', run: () => { setView('today'); setOpenId(null); } },
    { label: 'Go to Calendar', run: () => { setView('calendar'); setOpenId(null); } },
    { label: 'Go to ' + inboxLabel, run: () => { setView('inbox'); } },
    { label: 'Go to Invoices', run: () => { setView('invoices'); setOpenId(null); } },
    { label: 'Go to New Leads', run: () => { setView('new-leads'); setOpenId(null); } },
    { label: 'Go to Network', run: () => { setView('leads'); } },
    { label: 'View as Asher', hint: 'shared lane', run: () => { setTweak('viewAs', 'asher'); setOpenId(null); } },
    { label: 'View as Sammy', hint: 'shared lane', run: () => { setTweak('viewAs', 'sammy'); setOpenId(null); } },
    { label: 'View as Robert', hint: 'creator lane', run: () => { setTweak('viewAs', 'robert'); setOpenId(null); } },
    { label: t.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode', run: () => setTweak('theme', t.theme === 'dark' ? 'light' : 'dark') },
    { label: 'Keyboard shortcuts', hint: '?', run: () => setHelpOpen(true) },
    { label: 'Refresh data', run: () => window.location.reload() },
  ];

  return (
    <div className="app" data-screen-label={`ALIGNED v4 — ${view}`}>
      {/* ─── Top bar ─── */}
      <header className="hd">
        <div className="hd-brand">
          <span className="hd-brand-name">ALIGNED</span>
          <span className="hd-brand-tag">v4</span>
        </div>

        <div className="hd-nav">
          <button className="hd-nav-btn" aria-current={view === 'today' ? 'page' : undefined} onClick={() => { setView('today'); setOpenId(null); }}>Today</button>
          <button className="hd-nav-btn" aria-current={view === 'calendar' ? 'page' : undefined} onClick={() => { setView('calendar'); setOpenId(null); }}>
            <V3Icon name="cal" w={13} style={{ marginRight: 4 }} /> Calendar
          </button>
          <button className="hd-nav-btn" aria-current={view === 'inbox' ? 'page' : undefined} onClick={() => { setView('inbox'); }}>
            {inboxLabel}
            {unreadCount > 0 && <span className="cnt">{unreadCount}</span>}
          </button>
          <button className="hd-nav-btn" aria-current={view === 'invoices' ? 'page' : undefined} onClick={() => { setView('invoices'); setOpenId(null); }}>
            Invoices
          </button>
          <button className="hd-nav-btn" aria-current={view === 'new-leads' ? 'page' : undefined} onClick={() => { setView('new-leads'); setOpenId(null); }}>
            New Leads
            {newLeadCount > 0 && <span className="cnt">{newLeadCount}</span>}
          </button>
          <button className="hd-nav-btn" aria-current={view === 'leads' ? 'page' : undefined} onClick={() => { setView('leads'); }}>Network</button>
          <button className="hd-nav-btn" aria-current={view === 'company-os' ? 'page' : undefined} onClick={() => { setView('company-os'); setOpenId(null); }}>Company OS</button>
        </div>

        <div className="hd-search">
          <V3Icon name="search" w={12} />
          <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)} placeholder={searchPlaceholder} />
          <kbd>⌘K</kbd>
        </div>

        {/* The transparency signal */}
        <div className="hd-context" title={`Viewing as ${me.name} — ${me.role}`}>
          <V3Avatar name={me.name} color={me.color} size="xs" className="hd-context-pip" />
          <span>{me.name}</span>
          <span className="hd-context-scope">· {SCOPE_TAG[user]}</span>
        </div>

        <div className="hd-sync" title="Real-time Gmail sync">
          <span className="dot"></span>
          Synced
        </div>

        <div className="hd-right">
          <div className="hd-user-switch" title="Switch viewer">
            {Object.values(USERS).map(u => (
              <button key={u.id} className="hd-user-pip"
                      aria-pressed={user === u.id}
                      onClick={() => {
                        setTweak('viewAs', u.id);
                        setView(V4DefaultViewForUser(u.id));
                        setOpenId(null);
                        setBriefId(null);
                      }}
                      title={`${u.name} · ${u.role}`}>
                <V3Avatar name={u.name} color={u.color} size="xs" />
              </button>
            ))}
          </div>
          <button className="hd-icon-btn" title="Notifications"><V3Icon name="bell" /></button>
        </div>
      </header>

      {/* ─── Main area ─── */}
      <main className="main">
        {/* Filter strip — only on Pipeline/Network */}
        {(view === 'board' || view === 'leads') && (
          <div className="filter-strip">
            <span className="fs-today">
              <V3Icon name="diamond" w={12} />
              SNAPSHOT
            </span>
            <span className="fs-pill hot">
              <V3Icon name="fire" w={11} />
              <span className="count">{stats.hot}</span> hot leads gone cold
            </span>
            <span className="fs-pill stale">
              <V3Icon name="clock" w={11} />
              <span className="count">{stats.stuck}</span> stuck 10+ days
            </span>
            <span className="fs-pill new">
              <V3Icon name="plus" w={11} />
              <span className="count">{stats.newToday}</span> new today
            </span>
            <div className="fs-divider"></div>
            <span className="fs-total">TOTAL <strong>{stats.total}</strong></span>
            <span className={'fs-chip' + (ownerFilter === 'all' ? ' active' : '')} onClick={() => setOwnerFilter('all')}>
              All <span className="fs-chip-cnt">{operationalLeads.length}</span>
            </span>
            {Object.values(USERS).map(u => {
              const n = operationalLeads.filter(l => l.ownerId === u.id).length;
              return (
                <span key={u.id} className={'fs-chip' + (ownerFilter === u.id ? ' active' : '')} onClick={() => setOwnerFilter(u.id)}>
                  {u.name} <span className="fs-chip-cnt">{n}</span>
                </span>
              );
            })}
          </div>
        )}

        {/* Lane note — shown when this profile's lane hides active leads */}
        {user === 'robert' && laneHiddenActive > 0 && ['today', 'board', 'leads'].includes(view) && (
          <div className="lane-note">
            <V3Icon name="leads" w={12} />
            <span>
              You are viewing the <strong>{SCOPE_TAG[user]}</strong>. {laneHiddenActive} active leads
              live in the shared sales lane and are not shown here.
            </span>
            <button className="lane-note-btn" onClick={() => { setTweak('viewAs', 'asher'); setOpenId(null); }}>
              View shared lane
            </button>
          </div>
        )}

        {view === 'today' && (
          <V4TodayView user={user} leads={operationalLeads} query={search} onOpenLead={setOpenId} onGoInbox={() => setView('inbox')} />
        )}
        {view === 'board' && (
          <V3BoardView leads={operationalLeads} query={search} openId={openId} onOpen={setOpenId} user={user}
                       ownerFilter={ownerFilter} setOwnerFilter={setOwnerFilter} />
        )}
        {view === 'inbox' && (user === 'robert'
          ? <V4RobertBriefView leads={mergedLeads} query={search} user={user} onOpenLead={setOpenId} />
          : <V4InboxView leads={operationalLeads} query={search} user={user} />
        )}
        {view === 'invoices' && (
          <V4InvoicesView query={search} />
        )}
        {view === 'new-leads' && (
          <V4NewLeadsView leads={mergedLeads} query={search} onOpenLead={setOpenId} />
        )}
        {view === 'leads' && (
          <V4LeadsView leads={operationalLeads} query={search} openId={openId} onOpenLead={setOpenId} user={user} />
        )}
        {view === 'calendar' && (
          <V4CalendarView query={search} />
        )}
        {view === 'company-os' && (
          <V4CompanyOsView
            leads={mergedLeads}
            query={search}
            user={user}
            onOpenLead={setOpenId}
            onNavigateView={(nextView, nextOpenId = null) => {
              setView(nextView);
              setOpenId(nextOpenId);
            }}
          />
        )}
      </main>

      {/* ─── Footer ─── */}
      <footer className="ft">
        <span className="dot"></span>
        <span>Synced · {operationalLeads.length} cards · {operationalLeads.filter(l => !['paid-out'].includes(l.stage)).length} active · {newLeadCount} new leads</span>
        <span className="right">v4.0 · {me.name} ({me.role}) · ALIGNED</span>
        <button className="ft-tab" aria-current={view === 'today' ? 'page' : undefined}
                onClick={() => { setView('today'); setOpenId(null); }}>
          <V3Icon name="diamond" w={18} />
          Today
        </button>
        <button className="ft-tab" aria-current={view === 'calendar' ? 'page' : undefined}
                onClick={() => { setView('calendar'); setOpenId(null); }}>
          <V3Icon name="cal" w={18} />
          Calendar
        </button>
        <button className="ft-tab" aria-current={view === 'inbox' ? 'page' : undefined}
                onClick={() => { setView('inbox'); }}>
          <V3Icon name="inbox" w={18} />
          {inboxLabel}
          {unreadCount > 0 && <span className="ft-tab-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
        </button>
        <button className="ft-tab" aria-current={view === 'invoices' ? 'page' : undefined}
                onClick={() => { setView('invoices'); setOpenId(null); }}>
          <V3Icon name="invoice" w={18} />
          Invoices
        </button>
        <button className="ft-tab" aria-current={view === 'new-leads' ? 'page' : undefined}
                onClick={() => { setView('new-leads'); setOpenId(null); }}>
          <V3Icon name="plus" w={18} />
          Leads
          {newLeadCount > 0 && <span className="ft-tab-badge">{newLeadCount > 99 ? '99+' : newLeadCount}</span>}
        </button>
        <button className="ft-tab" aria-current={view === 'leads' ? 'page' : undefined}
                onClick={() => { setView('leads'); }}>
          <V3Icon name="leads" w={18} />
          Network
        </button>
        <button className="ft-tab" aria-current={view === 'company-os' ? 'page' : undefined}
                onClick={() => { setView('company-os'); setOpenId(null); }}>
          <V3Icon name="diamond" w={18} />
          OS
        </button>
      </footer>

      {/* Detail drawer — suppressed in Inbox; the inbox's right pane is its own reader */}
      {openLead && view !== 'inbox' && (
        <V3Drawer lead={openLead} user={user} queue={triageQueue} onNavigate={setOpenId} onClose={() => setOpenId(null)} />
      )}

      <V4CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)}
                        commands={paletteCommands}
                        leads={mergedLeads.filter(l => !l.isRobertBrief)}
                        onOpenLead={(id) => setOpenId(id)} />
      <V4HelpOverlay open={helpOpen} onClose={() => setHelpOpen(false)} />

      {/* Brief viewer modal */}
      {briefId && (
        <V3BriefViewer
          lead={leads.find(l => l.id === briefId)}
          user={user}
          onClose={() => setBriefId(null)}
          onAllShipped={() => { setToast('All deliverables shipped — invoice queued.'); setTimeout(() => setToast(null), 3500); }}
        />
      )}

      {toast && (
        <div className="toast-wrap"><div className="toast"><V3Icon name="check" w={13} /> {toast}</div></div>
      )}

      <TweaksPanel>
        <TweakSection label="View as" />
        <TweakRadio label="User" value={t.viewAs}
                    options={['asher','sammy','robert']}
                    onChange={v => setTweak('viewAs', v)} />
        <TweakSection label="View" />
        <TweakSelect label="Page" value={view}
                    options={['today','board','new-leads','company-os','leads','inbox','invoices','calendar']}
                    onChange={v => { setView(v); setOpenId(null); }} />
        <TweakSection label="Appearance" />
        <TweakRadio label="Theme" value={t.theme}
                    options={['light','dark']}
                    onChange={v => setTweak('theme', v)} />
        <TweakSection label="Demo" />
        <TweakButton label="Open a negotiating deal"
                     onClick={() => setOpenId(leads.find(l => l.stage === 'negotiating')?.id)} />
        <TweakButton label="Jump to Robert's post queue"
                     onClick={() => { setTweak('viewAs', 'robert'); setView(V4DefaultViewForUser('robert')); }} />
        <TweakButton label="Asher's brief approval"
                     onClick={() => { setTweak('viewAs', 'asher'); setView(V4DefaultViewForUser('asher')); setOpenId(leads.find(l => l.brief?.status === 'awaiting-approval')?.id); }} />
      </TweaksPanel>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<V4App />);
if (window.__alignedBootMarkReady) window.__alignedBootMarkReady();
