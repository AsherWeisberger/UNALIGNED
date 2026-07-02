
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
  moon:     "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z",
  sun:      "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
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

function V6UnalignedMark({ size = 30, className = '' }) {
  const px = Math.max(20, Number(size) || 30);
  return (
    <span
      className={'v6-mark-monogram ' + className}
      style={{ width: px, height: px, fontSize: Math.round(px * 0.54) }}
      aria-hidden="true"
    >
      U
    </span>
  );
}

function V6CompanyOsLogo({ compact = false, className = '' }) {
  if (compact) {
    return (
      <span className={'v6-mark-monogram v6-mark-monogram--nav ' + className} aria-label="Company OS">
        U
      </span>
    );
  }
  return (
    <span className={'v6-company-os-brand ' + className} role="img" aria-label="Company OS">
      <span className="v6-mark-monogram v6-mark-monogram--nav" aria-hidden="true">U</span>
      <span className="v6-company-os-wordmark" aria-hidden="true">
        Company <em>OS</em>
      </span>
    </span>
  );
}

function V6CompanyOsMark(props) {
  return <V6CompanyOsLogo {...props} />;
}

/** Cinematic startup — Model Y-style fade into dashboard */
function V6CompanyOsBoot({ onDone }) {
  const [phase, setPhase] = React.useState('intro');

  React.useEffect(() => {
    document.body.classList.add('v6-booting');
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      document.body.classList.remove('v6-booting');
      onDone();
      return undefined;
    }
    const tReveal = setTimeout(() => setPhase('reveal'), 80);
    const tHold = setTimeout(() => setPhase('hold'), 900);
    // Single completion path: the cube boot reveal (when present) owns the finish;
    // otherwise fall back to the exit phase + an 800ms close. (Replaces the old
    // fixed 3200ms tDone, which would have cut a longer cube reveal off early.)
    const tExit = setTimeout(() => {
      var finish = function () { document.body.classList.remove('v6-booting'); onDone(); };
      if (window.cubeBootReveal) window.cubeBootReveal(finish);
      else { setPhase('exit'); setTimeout(finish, 800); }
    }, 2400);
    return () => {
      clearTimeout(tReveal);
      clearTimeout(tHold);
      clearTimeout(tExit);
      document.body.classList.remove('v6-booting');
    };
  }, [onDone]);

  if (phase === 'done') return null;

  return (
    <div className={'v6-boot' + (phase !== 'intro' ? ' is-active' : '') + (phase === 'exit' ? ' is-exit' : '')} aria-hidden="true">
      <div className="v6-boot-vignette" />
      <div className="v6-boot-glow" />
      <div className="v6-boot-core">
        <div className="v6-boot-monogram" aria-hidden="true">U</div>
        <div className="v6-boot-wordmark">Company <em>OS</em></div>
        <div className="v6-boot-tagline">run the company from one place</div>
      </div>
      <div className="v6-boot-progress" aria-hidden="true"><span /></div>
    </div>
  );
}

function V4AppRoot() {
  const skipBoot = React.useMemo(() => /[?&]nosplash(?:=1)?(?:&|$)/.test(window.location.search), []);
  const [ready, setReady] = React.useState(skipBoot);

  const finishBoot = React.useCallback(() => setReady(true), []);

  return (
    <>
      {!ready && <V6CompanyOsBoot onDone={finishBoot} />}
      <div className={'v6-app-shell' + (ready ? ' is-ready' : '')}>
        <V4App />
      </div>
    </>
  );
}

Object.assign(window, {
  V3Icon,
  V3Avatar,
  V3StageProg,
  V3Empty,
  V6CompanyOsLogo,
  V6CompanyOsMark,
  V6UnalignedMark,
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
const V3_API_TOKEN_KEY = 'v4_api_token';

function V3ApiToken() {
  try {
    return String(window.localStorage.getItem(V3_API_TOKEN_KEY) || window.localStorage.getItem('v4_brief_api_token') || '').trim();
  } catch (e) {
    return '';
  }
}

async function V3BootstrapApiToken() {
  const existing = V3ApiToken();
  if (existing) return existing;
  const bases = [];
  const host = String(window.location?.hostname || '').toLowerCase();
  const fromHelper = typeof V4BriefServiceCandidateUrls === 'function'
    ? V4BriefServiceCandidateUrls()
    : ['https://mac-studio.tail50d3a2.ts.net', 'http://127.0.0.1:8767'];
  if (host.includes('mac-studio.tail50d3a2.ts.net')) {
    fromHelper.forEach((b) => {
      const clean = String(b || '').replace(/\/$/, '');
      if (clean && !bases.includes(clean)) bases.push(clean);
    });
  }
  try {
    const origin = String(window.location?.origin || '').replace(/\/$/, '');
    if (origin && !bases.includes(origin)) bases.push(origin);
  } catch (e) {}
  fromHelper.forEach((b) => {
    const clean = String(b || '').replace(/\/$/, '');
    if (clean && !bases.includes(clean)) bases.push(clean);
  });
  const briefToken = typeof V4LoadBriefApiToken === 'function' ? V4LoadBriefApiToken() : '';
  for (const base of bases) {
    try {
      const headers = {};
      if (briefToken) headers.Authorization = 'Bearer ' + briefToken;
      const res = await fetch(base + '/send-email-token', {
        method: 'GET',
        headers,
        cache: 'no-store',
      });
      if (!res.ok) continue;
      const data = await res.json();
      const token = String(data?.token || '').trim();
      if (token) {
        try { window.localStorage.setItem(V3_API_TOKEN_KEY, token); } catch (e) {}
        return token;
      }
    } catch (e) {}
  }
  return '';
}

let V3_X_GATE_RULES = null;

async function V3EnsureXGateRules(cacheBust) {
  if (V3_X_GATE_RULES) return V3_X_GATE_RULES;
  try {
    const res = await fetch('flow-v4/assets/x_gate_rules.json?v=' + (cacheBust || Date.now()));
    if (!res.ok) throw new Error('x_gate_rules ' + res.status);
    const rules = await res.json();
    if (rules?.spam_regex) {
      V3_X_GATE_RULES = {
        spam: new RegExp(rules.spam_regex, 'i'),
        noise: new RegExp(rules.noise_regex, 'i'),
        partnership: new RegExp(rules.partnership_regex, 'i'),
        product: new RegExp(rules.product_regex, 'i'),
      };
    }
  } catch (e) {
    console.warn('[ALIGNED v4] X gate rules load failed — using embedded fallback', e);
  }
  return V3_X_GATE_RULES;
}

function V3SpamRe() {
  return V3_X_GATE_RULES?.spam || V3_X_SPAM_RE;
}

function V3NoiseRe() {
  return V3_X_GATE_RULES?.noise || V3_X_NOISE_RE;
}

function V3PartnershipRe() {
  return V3_X_GATE_RULES?.partnership || V3_X_PARTNERSHIP_RE;
}

function V3ProductRe() {
  return V3_X_GATE_RULES?.product || V3_X_PRODUCT_RE;
}

async function V3LoadXDmIntakeRows(cacheBust) {
  try {
    const version = cacheBust || Date.now();
    const res = await fetch('flow-v4/assets/x_dm_daily_intake.json?v=' + version);
    if (!res.ok) throw new Error('X intake ' + res.status);
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    console.warn('Failed to load X DM intake', e);
    return [];
  }
}

async function V3LoadXDmThreadContexts(cacheBust) {
  try {
    const version = cacheBust || Date.now();
    const res = await fetch('flow-v4/assets/x_dm_thread_contexts.json?v=' + version);
    if (!res.ok) throw new Error('X thread contexts ' + res.status);
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    console.warn('Failed to load X DM thread contexts', e);
    return [];
  }
}

function V3IndexXDmThreadContexts(rows) {
  const byDm = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const messages = Array.isArray(row?.dmMessages) ? row.dmMessages : [];
    if (!messages.length) continue;
    const payload = {
      dmMessages: messages,
      xName: row.xName || '',
      messageCount: row.messageCount || messages.length,
      newestDmDate: row.newestDmDate || '',
    };
    const keys = [row.openDm, row.chatUrl].map(V3NormalizeOpenDmUrl).filter(Boolean);
    for (const key of keys) byDm.set(key, payload);
  }
  return byDm;
}

function V3ApplyXDmThreadContext(lead, threadByDm) {
  if (!lead || !V3IsXLeadRecord(lead) || !threadByDm || !threadByDm.size) return lead;
  const key = V3NormalizeOpenDmUrl(lead.xOpenDm);
  const ctx = key ? threadByDm.get(key) : null;
  if (!ctx || !Array.isArray(ctx.dmMessages) || !ctx.dmMessages.length) return lead;
  const merged = {
    ...lead,
    xDmMessages: ctx.dmMessages,
    xMessageCount: lead.xMessageCount || ctx.messageCount || ctx.dmMessages.length,
    contactName: V3XLeadDisplayName(lead.contactName, ctx.xName || ''),
    brand: V3XLeadDisplayName(lead.brand, ctx.xName || lead.contactName || ''),
  };
  const threadHasBody = Array.isArray(merged.thread) && merged.thread.some(msg => String(msg?.body || '').trim());
  if (!threadHasBody) merged.thread = V3BuildXThreadFromLead(merged);
  return merged;
}

function V3MergeXDmThreadContextsIntoLeads(leads, threadRows) {
  const threadByDm = V3IndexXDmThreadContexts(threadRows);
  if (!threadByDm.size) return leads;
  return (Array.isArray(leads) ? leads : []).map(lead => V3ApplyXDmThreadContext(lead, threadByDm));
}

async function V3LoadSupabaseLeads(opts = {}) {
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
    if (String(row.list_id || '').toLowerCase() === 'trash') score -= 1e12;
    if (['dead-leads', 'done', 'paid-out'].includes(String(row.list_id || '').toLowerCase())) score -= 5e11;
    return score;
  };

  for (const row of rows) {
    const key = row.x_open_dm
      ? `xdm:${V3NormalizeOpenDmUrl(row.x_open_dm)}`
      : (row.gmail_thread_id ? `thread:${row.gmail_thread_id}` : `row:${row.id}`);
    const prev = canonical.get(key);
    if (!prev || scoreRow(row) > scoreRow(prev)) canonical.set(key, row);
  }

  await V3EnsureXGateRules(opts?.cacheBust);
  const xRows = await V3LoadXDmIntakeRows(opts?.cacheBust);
  const threadRows = await V3LoadXDmThreadContexts(opts?.cacheBust);
  let leads = V3FilterVisibleLeads(
    V3MergeXIntakeIntoLeads([...canonical.values()].map(V3NormalizeSupabaseLead), xRows)
  );
  leads = V3MergeXDmThreadContextsIntoLeads(leads, threadRows);
  // Phantom xdm-* rows disabled — x_bridge + x_spam_cleanup own the X queue on Supabase.
  if (!leads.some(lead => String(lead.email || '').trim().toLowerCase() === 'jocelyn.cruz@hockeystick.io')) {
    leads.push(V3HockeystickFallbackLead());
  }
  leads = V3ApplyTrashedCardTombstones(V3FilterVisibleLeads(leads));
  V3PruneConfirmedTrashedTombstones(leads);
  return leads;
}

async function V3ReloadLeads(opts = {}) {
  window.dispatchEvent(new CustomEvent('v3:leads-loading'));
  const leads = await V3LoadSupabaseLeads({ cacheBust: opts.cacheBust || Date.now() });
  window.V3.LEADS = leads;
  window.dispatchEvent(new CustomEvent('v3:leads-loaded', { detail: { leads } }));
  return leads;
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

function V3ParseXDescriptionContext(value) {
  const payload = V3ParseBriefDescription(value);
  if (!payload || typeof payload !== 'object') return {};
  return {
    xSummary: payload.x_summary || '',
    lastMessage: payload.last_message || '',
    lastRobertMessage: payload.last_robert_message || '',
    lastSender: payload.last_sender || '',
    repliedViaX: Boolean(payload.replied_via_x),
    xCurrentStatus: payload.x_current_status || '',
    xReplyMarkedAt: payload.x_reply_marked_at || '',
    bestNextStep: payload.best_next_step || '',
    xUsername: payload.x_username || '',
    openDm: payload.open_dm || '',
    leadScore: payload.lead_score,
    dmMessages: Array.isArray(payload.dm_messages)
      ? payload.dm_messages
      : (Array.isArray(payload.x_dm_messages) ? payload.x_dm_messages : []),
  };
}

function V3XLeadDisplayName(value, fallback) {
  const text = String(value || '').trim();
  if (!text) return fallback || '';
  if (/^(unknown x lead|untitled lead|x lead|unknown company)$/i.test(text)) return fallback || text;
  return text;
}

function V3XLeadHasUsableContext(lead) {
  if (!lead) return false;
  const ctx = V3ParseXDescriptionContext(lead.rawDescription);
  const text = [
    lead.notes,
    lead.evidence,
    lead.xLastLeadMessage,
    lead.xLastRobertMessage,
    ctx.xSummary,
    ctx.lastMessage,
    ...(Array.isArray(lead.thread) ? lead.thread.map(msg => msg?.body) : []),
  ].filter(Boolean).join(' ').trim();
  return text.length >= 40;
}

function V3ApplyXContextFields(lead) {
  if (!lead || !V3IsXLeadRecord(lead)) return lead;
  const ctx = V3ParseXDescriptionContext(lead.rawDescription);
  const hasCtx = Boolean(ctx.xSummary || ctx.lastMessage || ctx.lastRobertMessage);
  if (!hasCtx) return lead;
  const merged = {
    ...lead,
    notes: lead.notes || ctx.xSummary || '',
    evidence: lead.evidence || ctx.lastMessage || lead.xLastLeadMessage || '',
    xLastLeadMessage: lead.xLastLeadMessage || ctx.lastMessage || '',
    xLastRobertMessage: lead.xLastRobertMessage || ctx.lastRobertMessage || '',
    xDmMessages: Array.isArray(lead.xDmMessages) && lead.xDmMessages.length
      ? lead.xDmMessages
      : (Array.isArray(ctx.dmMessages) ? ctx.dmMessages : []),
    xLastSender: lead.xLastSender || ctx.lastSender || '',
    xCurrentStatus: lead.xCurrentStatus || ctx.xCurrentStatus || '',
    xBestNextStep: lead.xBestNextStep || ctx.bestNextStep || '',
    xHandle: lead.xHandle || ctx.xUsername || '',
    xLeadScore: lead.xLeadScore || ctx.leadScore || lead.xLeadScore,
    xOpenDm: lead.xOpenDm || ctx.openDm || lead.xOpenDm,
    contactName: V3XLeadDisplayName(lead.contactName, ctx.xUsername || ''),
    brand: V3XLeadDisplayName(lead.brand, lead.contactName || ctx.xUsername || ''),
  };
  const threadHasBody = Array.isArray(merged.thread) && merged.thread.some(msg => String(msg?.body || '').trim());
  if (!threadHasBody) merged.thread = V3BuildXThreadFromLead(merged);
  return V3ApplyXReplyState(merged);
}

function V3EnrichLeadFromXIntakeRow(lead, intakeRow) {
  const intake = V3NormalizeXDmLeadRow(intakeRow);
  const merged = { ...lead };
  merged.contactName = V3XLeadDisplayName(lead.contactName, intake.contactName);
  merged.brand = V3XLeadDisplayName(lead.brand, intake.brand);
  merged.notes = String(lead.notes || intake.notes || '').trim() || intake.notes;
  merged.evidence = String(lead.evidence || intake.evidence || lead.xLastLeadMessage || intake.xLastLeadMessage || '').trim();
  merged.xHandle = lead.xHandle || intake.xHandle;
  merged.xBestNextStep = lead.xBestNextStep || intake.xBestNextStep;
  merged.xCurrentStatus = lead.xCurrentStatus || intake.xCurrentStatus;
  merged.xLastSender = lead.xLastSender || intake.xLastSender;
  merged.xLastRobertMessage = lead.xLastRobertMessage || intake.xLastRobertMessage;
  merged.xLastLeadMessage = lead.xLastLeadMessage || intake.xLastLeadMessage;
  merged.xDmMessages = Array.isArray(lead.xDmMessages) && lead.xDmMessages.length
    ? lead.xDmMessages
    : (Array.isArray(intake.xDmMessages) ? intake.xDmMessages : []);
  merged.xMessageCount = lead.xMessageCount || intake.xMessageCount;
  merged.xContactInfo = lead.xContactInfo || intake.xContactInfo;
  merged.xLeadScore = lead.xLeadScore || intake.xLeadScore;
    merged.email = V3LeadExternalEmail(lead) || V3LeadExternalEmail(intake) || '';
  merged.xOpenDm = lead.xOpenDm || intake.xOpenDm;
  if (!merged.deliverables || merged.deliverables === 'X' || merged.deliverables === 'Manual') {
    merged.deliverables = intake.deliverables || merged.deliverables;
  }
  const threadHasBody = Array.isArray(merged.thread) && merged.thread.some(msg => String(msg?.body || '').trim());
  if (!threadHasBody) merged.thread = intake.thread;
  return V3ApplyXReplyState(merged);
}

function V3MergeXIntakeIntoLeads(leads, xRows) {
  const intakeByDm = new Map();
  for (const row of Array.isArray(xRows) ? xRows : []) {
    if (V3IntakeRowIsBlocked(row)) continue;
    const key = V3NormalizeOpenDmUrl(row.openDm);
    if (key) intakeByDm.set(key, row);
  }
  return (Array.isArray(leads) ? leads : []).map(lead => {
    if (!V3IsXLeadRecord(lead)) return lead;
    const key = V3NormalizeOpenDmUrl(lead.xOpenDm);
    const intake = key ? intakeByDm.get(key) : null;
    if (intake && V3IntakeRowIsBlocked(intake)) return lead;
    if (intake) return V3EnrichLeadFromXIntakeRow(lead, intake);
    return V3ApplyXContextFields(lead);
  });
}

function V3ExtractRobertPositionFromSummary(summary) {
  const text = String(summary || '');
  const match = text.match(/Robert['’]s latest position:\s*(.+?)(?:\s+Contact captured:|$)/i);
  return match ? match[1].trim() : '';
}

function V3IsXLeadRecord(lead) {
  if (!lead) return false;
  const source = String(lead.source || '').toLowerCase();
  if (source === 'x' || source.includes('x-dm') || source.includes('twitter_dm') || source.includes('ingest-twitter_dm')) return true;
  return Boolean(lead.xOpenDm);
}

function V3InferXReplyState(lead) {
  if (!lead) return { repliedViaX: false, needsXReply: true, xLastRobertMessage: '', xLastSender: '', xReplyMarkedAt: '' };
  const status = String(lead.xCurrentStatus || '').toLowerCase();
  const ctx = V3ParseXDescriptionContext(lead.rawDescription);
  const xLastSender = String(lead.xLastSender || ctx.lastSender || '').trim();
  const xLastRobertMessage = String(
    lead.xLastRobertMessage || ctx.lastRobertMessage || V3ExtractRobertPositionFromSummary(lead.notes || lead.rawDescription || ctx.xSummary) || ''
  ).trim();
  const xReplyMarkedAt = String(lead.xReplyMarkedAt || ctx.xReplyMarkedAt || '').trim();
  let repliedViaX = lead.xRepliedViaX === true || ctx.repliedViaX || Boolean(xReplyMarkedAt);
  if (status.includes('robert was last')) repliedViaX = true;
  if (xLastSender.toLowerCase() === 'robert') repliedViaX = true;
  if (status.includes('lead waiting') || status.includes('send - lead')) repliedViaX = false;
  const needsXReply = !repliedViaX || status.includes('lead waiting') || xLastSender.toLowerCase() === 'lead';
  return { repliedViaX, needsXReply, xLastRobertMessage, xLastSender, xReplyMarkedAt };
}

function V3XLeadRepliedViaX(lead) {
  return V3InferXReplyState(lead).repliedViaX;
}

function V3ApplyXReplyState(lead) {
  if (!lead || !V3IsXLeadRecord(lead)) return lead;
  const state = V3InferXReplyState(lead);
  const first = String(lead.contactName || 'them').split(' ')[0];
  const next = {
    ...lead,
    xRepliedViaX: state.repliedViaX,
    xLastRobertMessage: state.xLastRobertMessage || lead.xLastRobertMessage || '',
    xLastSender: state.xLastSender || lead.xLastSender || '',
    xReplyMarkedAt: state.xReplyMarkedAt || lead.xReplyMarkedAt || '',
    needsReply: state.needsXReply,
    unread: state.needsXReply,
  };
  if (state.repliedViaX && !state.needsXReply) {
    next.nextMove = {
      who: null,
      text: `Replied via X — waiting on ${first}`,
      action: '',
    };
  }
  return next;
}

function V4XLeadPitchText(lead) {
  return [
    lead?.evidence,
    lead?.xLastLeadMessage,
    lead?.notes,
    lead?.rawDescription,
    lead?.summaryForTeam,
    lead?.deliverables,
  ].filter(Boolean).join(' ');
}

function V4XLeadNameLooksLikePerson(value, contactName = '') {
  const v = String(value || '').trim();
  if (!v) return true;
  const contact = String(contactName || '').trim().toLowerCase();
  if (contact && v.toLowerCase() === contact) return true;
  if (/^@[A-Za-z0-9_]{2,}$/.test(v)) return true;
  if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}$/.test(v)) return true;
  return false;
}

function V4XLeadPitchRef(lead) {
  const contact = String(lead?.contactName || '').trim();
  const brand = String(lead?.brand || '').trim();
  const text = V4XLeadPitchText(lead);

  if (/chinese robotics company/i.test(text) && /shenzhen|factory visit/i.test(text)) {
    return 'the Shenzhen factory visit sponsorship';
  }
  const factory = text.match(/visit their ([^.!?\n]{3,48}?)(?:\s+factory|factory)/i);
  if (factory) return `the ${factory[1].trim()} factory visit`;

  const sponsorPitch = text.match(/a ([^.!?\n]{8,90}?) wants to sponsor/i);
  if (sponsorPitch) {
    const raw = sponsorPitch[1].trim();
    if (!V4XLeadNameLooksLikePerson(raw, contact) && !/^(chinese|robotics|tech|ai)\b/i.test(raw)) return raw;
  }

  const behalf = text.match(/on behalf of ([^.!?\n,]{2,60})/i);
  if (behalf) return behalf[1].trim();

  const fromCo = text.match(/(?:I am|I'm|I’m|This is)\s+[^.!?\n]{0,40}\s+from\s+([A-Z][A-Za-z0-9&.\s]{2,40})/i);
  if (fromCo) return fromCo[1].trim();

  const campaign = text.match(/campaign:?\s*([A-Za-z0-9.&\s]{2,40})/i);
  if (campaign) return campaign[1].trim();

  const reaching = text.match(/reaching out (?:from|on behalf of)\s+([^.!?\n,]{2,60})/i);
  if (reaching) return reaching[1].trim();

  const teamAt = text.match(/from the team at ([^.!?\n@]{2,50})/i);
  if (teamAt) return teamAt[1].trim();

  const reachTeam = text.match(/reaching out(?:\s+to you)?\s+from (?:the team at )?([A-Z][^.!?\n@]{2,50})/i);
  if (reachTeam) return reachTeam[1].trim();

  if (brand && !V4XLeadNameLooksLikePerson(brand, contact)) return brand;

  if (/sponsor/i.test(text)) return 'the sponsorship opportunity';
  if (/collab/i.test(text)) return 'the collaboration opportunity';
  return '';
}

function V4LeadIsTravelLead(lead) {
  if (!lead) return false;
  if (lead.travelOpportunity || lead.category === 'travel') return true;
  const text = V4XLeadPitchText(lead).toLowerCase();
  if (!text.trim()) return false;
  const signals = [
    /factory visit/,
    /visit their/,
    /cover(?:ing)? all expenses/,
    /(?:pay|paid) extra compensation/,
    /long way to travel/,
    /sponsor(?:ing)? (?:you |robert )?to visit/,
    /(?:invite|inviting) (?:you |robert )?to (?:visit |our |the )/,
    /on[- ]site (?:visit|event)/,
    /(?:fly|flying) (?:you |robert )?to/,
    /travel to\b/,
    /all[- ]expenses[- ]paid/,
    /visit (?:the |their )?(?:factory|office|hq|headquarters|lab)/,
    /(?:keynote|speaking) (?:at|in) .{0,48}(?:summit|conference|expo)/,
  ];
  if (signals.some(rx => rx.test(text))) return true;
  const cities = /shenzhen|tokyo|singapore|london|paris|berlin|taipei|seoul|beijing|shanghai|hong kong|barcelona|munich|las vegas/;
  return cities.test(text) && /visit|travel|fly|factory|summit|conference/.test(text);
}

function V4LeadTravelLabel(lead) {
  const ref = V4XLeadPitchRef(lead);
  if (ref) return ref.replace(/^the /i, '').replace(/^a /i, '');
  const text = V4XLeadPitchText(lead);
  const city = text.match(/(?:visit|travel to|fly to)\s+(?:their\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
  if (city) return `${city[1]} visit`;
  return 'Travel opportunity';
}

function V3ApplyTravelLeadMeta(lead) {
  if (!lead || !V4LeadIsTravelLead(lead)) return lead;
  const travelLabel = V4LeadTravelLabel(lead);
  const deliverables = String(lead.deliverables || '').trim();
  return {
    ...lead,
    category: 'travel',
    travelOpportunity: true,
    travelLabel,
    deliverables: deliverables && deliverables !== 'X DM lead'
      ? `Travel · ${deliverables}`
      : `Travel · ${travelLabel}`,
  };
}

function V4XNormalizeDmSender(value) {
  const sender = String(value || '').trim().toLowerCase();
  if (!sender) return '';
  if (sender === 'robert' || sender.includes('robert') || sender.includes('scoble')) return 'robert';
  return 'lead';
}

function V4XParseDmMessagesFromLead(lead) {
  const ctx = V3ParseXDescriptionContext(lead?.rawDescription);
  const raw = lead?.xDmMessages || ctx.dmMessages || [];
  if (!Array.isArray(raw) || !raw.length) return [];
  return raw.map(msg => ({
    sender: V4XNormalizeDmSender(msg?.sender || msg?.from),
    text: V4XIntakeCleanDm(msg?.text || msg?.body || ''),
  })).filter(msg => msg.text);
}

function V4XThreadMessagesFromLead(lead) {
  const parsed = V4XParseDmMessagesFromLead(lead);
  if (parsed.length) return parsed;

  const fromThread = (Array.isArray(lead?.thread) ? lead.thread : [])
    .map(msg => ({
      sender: V4XNormalizeDmSender(msg?.from),
      text: V4XIntakeCleanDm(msg?.body || ''),
    }))
    .filter(msg => msg.text);
  if (fromThread.length > 1) return fromThread;

  const ctx = V3ParseXDescriptionContext(lead?.rawDescription);
  const inbound = V4XIntakeCleanDm(lead?.evidence || lead?.xLastLeadMessage || ctx.lastMessage || '');
  const robert = V4XIntakeCleanDm(
    lead?.xLastRobertMessage
    || ctx.lastRobertMessage
    || V3ExtractRobertPositionFromSummary(lead?.notes || lead?.rawDescription || '')
    || ''
  );
  const lastSender = V4XNormalizeDmSender(lead?.xLastSender || V3InferXReplyState(lead).xLastSender);
  const fallback = [];
  if (lastSender === 'robert') {
    if (inbound) fallback.push({ sender: 'lead', text: inbound });
    if (robert) fallback.push({ sender: 'robert', text: robert });
  } else {
    if (robert) fallback.push({ sender: 'robert', text: robert });
    if (inbound) fallback.push({ sender: 'lead', text: inbound });
  }
  if (!fallback.length && inbound) fallback.push({ sender: 'lead', text: inbound });
  return fallback;
}

function V4XLatestMessageBySender(lead, sender) {
  const want = sender === 'robert' ? 'robert' : 'lead';
  const messages = V4XThreadMessagesFromLead(lead);
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].sender === want) return messages[i].text;
  }
  return '';
}

function V4XFindLeadMessageMatching(lead, pattern) {
  const messages = V4XThreadMessagesFromLead(lead);
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg.sender !== 'lead') continue;
    if (pattern.test(msg.text)) return msg.text;
  }
  return '';
}

function V4XFindLeadSchedulingAck(lead) {
  return V4XFindLeadMessageMatching(
    lead,
    /when things ease|drop me a (?:quick )?message|lock in a quick call|timing(?:'s| is) right|no worries at all|looking forward to chatting when/i
  );
}

function V4XConversationThreadBlob(lead) {
  return V4XThreadMessagesFromLead(lead).map(msg => msg.text).join(' ');
}

function V4XLatestInboundText(lead) {
  const schedulingAck = V4XFindLeadSchedulingAck(lead);
  if (schedulingAck) return schedulingAck;
  const fromThread = V4XLatestMessageBySender(lead, 'lead');
  if (fromThread) return fromThread;
  const ctx = V3ParseXDescriptionContext(lead?.rawDescription);
  return V4XIntakeCleanDm(lead?.evidence || lead?.xLastLeadMessage || ctx.lastMessage || '');
}

function V4XLatestRobertText(lead) {
  const fromThread = V4XLatestMessageBySender(lead, 'robert');
  if (fromThread) return fromThread;
  const ctx = V3ParseXDescriptionContext(lead?.rawDescription);
  return V4XIntakeCleanDm(
    lead?.xLastRobertMessage
    || ctx.lastRobertMessage
    || V3ExtractRobertPositionFromSummary(lead?.notes || lead?.rawDescription || '')
    || ''
  );
}

function V4XConversationSnapshot(lead) {
  const inbound = V4XLatestInboundText(lead);
  const robert = V4XLatestRobertText(lead);
  const state = V3InferXReplyState(lead);
  const messages = V4XThreadMessagesFromLead(lead);
  const latestSender = messages.length
    ? messages[messages.length - 1].sender
    : V4XNormalizeDmSender(lead?.xLastSender || state.xLastSender);
  const schedulingAck = V4XFindLeadSchedulingAck(lead);
  const lastSender = latestSender || String(lead?.xLastSender || state.xLastSender || '').trim().toLowerCase();
  const leadSpokeLast = lastSender === 'lead'
    || Boolean(schedulingAck && /when things ease|drop me a (?:quick )?message|lock in a quick call/i.test(schedulingAck))
    || (lastSender !== 'robert' && Boolean(inbound) && !robert);
  return { inbound, robert, leadSpokeLast, lastSender, schedulingAck };
}

function V4XLeadAskKindFromText(text) {
  const blob = String(text || '').toLowerCase();
  if (/factory|shenzhen|visit their|fly (?:you|robert)|all expenses|travel to|on[- ]site/i.test(text)) return 'travel';
  if (/best email|email to reach|what(?:'s| is) your email|reach you (?:at|via) email/i.test(text)) return 'email_request';
  if (/rates|pricing|budget|\$\d|how much|your fee|standard rate/i.test(text)) return 'rates';
  if (/paid|sponsor|brand deal|ambassador|collab/i.test(text)) return 'paid_collab';
  if (/demo|product|launch|platform|\btool\b|trial|saas/i.test(blob)) return 'product';
  return 'general';
}

function V4XLeadInboundText(lead) {
  return V4XLatestInboundText(lead) || V4XIntakeCleanDm(V4XLeadPitchText(lead));
}

function V4XLeadAskKind(lead) {
  return V4XLeadAskKindFromText(V4XLatestInboundText(lead) || V4XLeadInboundText(lead));
}

function V4XConversationMode(lead) {
  const { inbound, robert, schedulingAck } = V4XConversationSnapshot(lead);
  const blob = `${V4XConversationThreadBlob(lead)} ${inbound} ${robert}`.toLowerCase();
  const robertBusy = /booked|san jose|calendar|three weeks|busy|slammed|so booked/i.test(`${robert} ${blob}`);
  const schedulingSignals = /meet up|meetup|quick call|lock in|where you(?:'re| are) located|suggest a few.*times|discuss this further/i.test(blob);

  if (
    schedulingAck
    || (
      /when things ease|drop me a (?:quick )?message|lock in a quick call|timing(?:'s| is) right|looking forward to chatting when/i.test(inbound)
      && robertBusy
    )
  ) return 'scheduling_ack';

  if (schedulingSignals || robertBusy) {
    return 'scheduling';
  }

  if (/sounds cool|will have to try|glad you think so/i.test(blob) && !/sponsor|paid collab|budget|70%|500k/i.test(inbound)) {
    return 'casual';
  }

  if (V4XLeadAskKindFromText(inbound) === 'travel') return 'travel';
  return 'sponsorship_handoff';
}

function V4XThreadHasCommercialSignals(lead) {
  const blob = `${V4XConversationThreadBlob(lead)} ${V4XLeadPitchText(lead)}`.toLowerCase();
  return /sponsor|sponsorship|paid collab|brand deal|collaborat|partnership|\bplatform\b|\bproduct\b|\bdemo\b|\blaunch\b|your rate|\brates\b|\bpricing\b|\bbudget\b|deliverable|70%|500k|subscribers pay|ambassador|\bcampaign\b|post or demo|creative partnership/.test(blob);
}

function V4XShouldEmailHandoff(lead) {
  const mode = V4XConversationMode(lead);
  const commercial = V4XThreadHasCommercialSignals(lead);
  if (mode === 'scheduling' || mode === 'scheduling_ack') return commercial;
  if (mode === 'casual') return commercial;
  return true;
}

function V4XRobertWarmReply(text) {
  const line = V4XIntakeCleanDm(text).split(/[.!?\n]/)[0].trim();
  return /^(awesome|great|yes|sounds good|love it|interested|perfect|amazing|wow|cool|nice|ok|okay|sure|let's|lets)\b/i.test(line);
}

function V4XHookIsUsable(hook, contact = '') {
  const h = String(hook || '').trim();
  if (!h || h.length < 4) return false;
  if (/^(us|you|me|them|our|your)\b/i.test(h)) return false;
  if (/^(a|an|the)\s+(remote|convenient|regular|paid)\b/i.test(h)) return false;
  if (/^(us|you|them|our|your) on\b/i.test(h)) return false;
  if (/\b(work schedule|regular pay|remote basis)\b/i.test(h)) return false;
  if (V4XLeadNameLooksLikePerson(h.replace(/^the /i, ''), contact) && h.length < 24) return false;
  return true;
}

function V4XLeadConversationHook(lead) {
  const msg = V4XLatestInboundText(lead) || V4XLeadInboundText(lead);
  const contact = String(lead?.contactName || '').trim();
  if (!msg) return '';

  const patterns = [
    { re: /chinese robotics company[^.!?]*/i, pick: () => 'the Shenzhen factory visit' },
    { re: /visit their ([^.!?]{3,48})/i, pick: (m) => `the ${m[1].trim()} visit` },
    { re: /sponsor(?:ed)? (?:you )?to visit[^.!?]*/i, pick: () => 'the sponsored visit' },
    { re: /(?:paid|sponsored) (?:post|collab|partnership|video)[^.!?]*/i, pick: () => 'the paid collaboration' },
    { re: /from the team at ([^.!?\n@]{2,50})/i, pick: (m) => m[1].trim() },
    { re: /reaching out(?:\s+to you)?\s+from (?:the team at )?([A-Z][^.!?\n@]{2,50})/i, pick: (m) => m[1].trim() },
    { re: /on behalf of ([^.!?,]{2,55})/i, pick: (m) => m[1].trim() },
    { re: /(?:from|at)\s+([A-Z][A-Za-z0-9&.\s-]{2,35})(?:\s+regarding|\s+about|,|\.|\s+and)/i, pick: (m) => m[1].trim() },
    { re: /collaborat(?:e|ion) (?:on|for|around)\s+([^.!?]{4,55})/i, pick: (m) => m[1].trim() },
    { re: /(?:launch(?:ing)?|releasing)\s+([^.!?]{4,45})/i, pick: (m) => `the ${m[1].trim()} launch` },
    { re: /campaign (?:for|around)\s+([^.!?]{4,45})/i, pick: (m) => `the ${m[1].trim()} campaign` },
  ];

  for (const { re, pick } of patterns) {
    const match = msg.match(re);
    if (!match) continue;
    const hook = String(pick(match) || '').trim();
    if (hook && V4XHookIsUsable(hook, contact)) return hook;
  }

  const ref = V4XLeadPitchRef(lead);
  if (ref && V4XHookIsUsable(ref, contact)) return ref;
  return '';
}

function V4XLeadMessageBite(lead) {
  const msg = V4XLeadInboundText(lead);
  if (!msg) return '';
  let text = msg
    .replace(/^(?:hi|hey|hello|dear|yo)\s+(?:robert|scoble|there)[!,.\s]*/i, '')
    .replace(/^robert\s+scoble\s*[,，]\s*/i, '')
    .trim();
  const sentence = (text.split(/(?<=[.!?])\s+/).find(s => s.trim().length >= 24) || text).trim();
  if (sentence.length < 24) return '';
  const bite = sentence.length > 96 ? `${sentence.slice(0, 93).trim()}…` : sentence;
  return bite.charAt(0).toLowerCase() + bite.slice(1);
}

function V4XHandoffLine(lead) {
  const ask = V4XLeadAskKind(lead);
  if (ask === 'travel') {
    return 'Email Scobleizer@gmail.com and CC AsherUnaligned@gmail.com with dates, coverage, and budget — Asher handles trip terms at UNALIGNED.';
  }
  if (ask === 'email_request' || ask === 'rates') {
    return 'Scobleizer@gmail.com with AsherUnaligned@gmail.com CC is best — Asher runs client business at UNALIGNED.';
  }
  if (ask === 'product') {
    return 'Happy to review properly over email: Scobleizer@gmail.com with AsherUnaligned@gmail.com CC. Asher handles client business at UNALIGNED.';
  }
  return 'For sponsorship details, email Scobleizer@gmail.com and CC AsherUnaligned@gmail.com — Asher handles client business at UNALIGNED.';
}

function V4XHandoffClose(lead) {
  const ask = V4XLeadAskKind(lead);
  if (ask === 'travel') return 'Send timing, location, and what you need from Robert when you can.';
  if (ask === 'rates') return 'Send scope, deliverables, and budget when you can.';
  if (ask === 'product') return 'Send a quick overview and what kind of post or demo you had in mind.';
  return 'Send scope, timing, and budget when you can.';
}

function V4XLeadDmOpener(lead, opts = {}) {
  const snap = V4XConversationSnapshot(lead);
  const mode = opts.mode || V4XConversationMode(lead);
  const { inbound, robert, leadSpokeLast } = snap;

  if (mode === 'scheduling_ack' && leadSpokeLast) {
    return 'Sounds good. I\'ll message you here when my calendar opens up and we can lock in that call.';
  }
  if (mode === 'scheduling_ack') {
    return 'Perfect. Ping me when you\'re ready and we\'ll find a time.';
  }
  if (mode === 'scheduling') {
    if (/booked|three weeks|slammed|so booked/i.test(robert) && /san jose/i.test(robert)) {
      return 'Will do. I\'ll message you here when my calendar opens up and we can lock in that call.';
    }
    if (/where you(?:'re| are) located/i.test(inbound) && /san jose/i.test(robert)) {
      return 'Still in South San Jose. Slammed the next few weeks, but happy to find time after that.';
    }
    if (leadSpokeLast && /meet up|quick call|discuss this further/i.test(inbound)) {
      return 'A call could work. I\'m booked solid for a few weeks, then let\'s line something up.';
    }
    if (/when things ease|drop me a message/i.test(inbound)) {
      return 'Will do. I\'ll reach out here when things calm down.';
    }
  }
  if (mode === 'casual') {
    if (/when things ease|drop me a message/i.test(inbound)) {
      return 'Will do. I\'ll message you here when things calm down a bit.';
    }
    return 'Appreciate you keeping this going.';
  }

  const hook = V4XLeadConversationHook(lead);
  const ask = V4XLeadAskKind(lead);
  const lastRobert = robert;
  const replied = !!opts.replied || V3XLeadRepliedViaX(lead);
  const robertWarm = V4XRobertWarmReply(lastRobert);

  if (replied && robertWarm) {
    if (ask === 'travel' && hook) return `Still interested in ${hook} — let's line up details on email.`;
    if (ask === 'email_request') return 'Yes — email is the easiest way to line this up.';
    if (hook) return `Following up on ${hook} — email is the best next step on our side.`;
    return 'Following up here — email is the best next step on our side.';
  }

  if (replied && lastRobert) {
    return hook ? `Thanks for keeping this going — re ${hook}.` : 'Thanks for following up on X.';
  }

  if (ask === 'travel' && hook) return `Thanks for reaching out — ${hook} sounds interesting.`;
  if (ask === 'paid_collab' && hook) return `Thanks for reaching out about ${hook}.`;
  if (ask === 'product' && hook) return `Thanks for sharing ${hook} — happy to take a closer look.`;
  if (ask === 'rates' && hook) return `Thanks for the note on ${hook}.`;
  if (ask === 'email_request') return hook
    ? `Thanks for reaching out about ${hook} — yes, email works best.`
    : 'Thanks for the DM — yes, email works best on our side.';
  if (hook) return `Thanks for reaching out about ${hook}.`;

  const bite = V4XLeadMessageBite(lead);
  if (bite && !/^(us|you|them|our|your) on\b/i.test(bite) && !/\b(remote basis|regular pay|work schedule)\b/i.test(bite)) {
    return `Thanks for the DM — ${bite}`;
  }

  return 'Thanks for reaching out on X.';
}

function V3BuildXThreadFromLead(lead) {
  if (!lead) return [];
  const dmMessages = V4XThreadMessagesFromLead(lead);
  if (dmMessages.length > 1) {
    const received = V3NormalizeDateForUi(lead.receivedAt || lead.lastTouchAt);
    return dmMessages.map((msg, index) => ({
      from: msg.sender === 'robert' ? 'Robert Scoble' : (lead.xHandle || lead.contactName || 'Lead'),
      when: V3RelativeTime(index === dmMessages.length - 1 ? (lead.lastTouchAt || received) : received),
      date: V3NormalizeDateForUi(index === dmMessages.length - 1 ? (lead.lastTouchAt || received) : received),
      subject: msg.sender === 'robert' ? 'Reply via X' : (lead.deliverables || 'X DM lead'),
      body: msg.text,
      to: [],
      cc: [],
      replyTo: [],
    }));
  }
  const received = V3NormalizeDateForUi(lead.receivedAt || lead.lastTouchAt);
  const leadBody = String(lead.evidence || lead.xLastLeadMessage || '').trim();
  const summary = String(lead.notes || lead.rawDescription || '').trim();
  const robertBody = String(lead.xLastRobertMessage || V3ExtractRobertPositionFromSummary(summary) || '').trim();
  const robertLast = V4XNormalizeDmSender(lead?.xLastSender || V3InferXReplyState(lead).xLastSender) === 'robert';
  const thread = [];
  const leadMsg = {
    from: lead.xHandle || lead.contactName || 'Lead',
    when: V3RelativeTime(received),
    date: received || null,
    subject: lead.deliverables || 'X DM lead',
    body: leadBody || summary,
    to: [],
    cc: [],
    replyTo: [],
  };
  const robertMsg = {
    from: 'Robert Scoble',
    when: V3RelativeTime(lead.xReplyMarkedAt || lead.lastTouchAt || received),
    date: V3NormalizeDateForUi(lead.xReplyMarkedAt || lead.lastTouchAt || received),
    subject: 'Reply via X',
    body: robertBody,
    to: [],
    cc: [],
    replyTo: [],
  };
  if (robertLast) {
    if (leadBody || summary) thread.push(leadMsg);
    if (robertBody) thread.push(robertMsg);
  } else {
    if (robertBody) thread.push(robertMsg);
    if (leadBody || summary) thread.push(leadMsg);
  }
  return thread;
}

function V3MarkRepliedViaX(lead) {
  if (!lead) return;
  const ctx = V3ParseXDescriptionContext(lead.rawDescription);
  const merged = {
    ...V3ParseBriefDescription(lead.rawDescription),
    x_summary: ctx.xSummary || lead.notes || '',
    last_message: ctx.lastMessage || lead.evidence || '',
    last_robert_message: ctx.lastRobertMessage || lead.xLastRobertMessage || 'Marked as replied on X.',
    last_sender: 'Robert',
    replied_via_x: true,
    x_current_status: lead.xCurrentStatus || 'WAIT - Robert was last',
    x_reply_marked_at: new Date().toISOString(),
    open_dm: lead.xOpenDm || ctx.open_dm || '',
  };
  const localPatch = {
    xRepliedViaX: true,
    xLastSender: 'Robert',
    xReplyMarkedAt: merged.x_reply_marked_at,
    xCurrentStatus: merged.x_current_status,
    needsReply: false,
    unread: false,
    nextMove: {
      who: null,
      text: `Replied via X — waiting on ${String(lead.contactName || 'them').split(' ')[0]}`,
      action: '',
    },
    thread: V3BuildXThreadFromLead({ ...lead, ...merged, xLastRobertMessage: merged.last_robert_message }),
  };
  if (typeof V4CosPatchLead === 'function') {
    V4CosPatchLead(lead, { description: JSON.stringify(merged) }, localPatch);
    return;
  }
  const updated = (window.V3.LEADS || []).map(item => String(item.id) === String(lead.id) ? { ...item, ...localPatch, rawDescription: JSON.stringify(merged) } : item);
  window.V3.LEADS = updated;
  window.dispatchEvent(new CustomEvent('v3:leads-loaded', { detail: { leads: updated } }));
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
  const newReplyAt = V3NormalizeDateForUi(row.new_reply_at);
  const lastTouchAt = V3MaxTouchAt(latestThreadDate, row.new_reply_at, row.moved_at, received);
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
  const xContext = V3ParseXDescriptionContext(row.description);
  const operatorMemory = V3ParseOperatorMemory(row.description);
  const isRobertBrief = V3IsRobertBriefRow(row) || briefPayload.kind === 'official-posting' || briefPayload.type === 'official-posting';
  const leadSource = row.lead_source || (row.gmail_thread_id ? 'Gmail' : 'Manual');
  const xOpenDm = V3NormalizeOpenDmUrl(row.x_open_dm || (String(row.website || '').includes('x.com/') ? row.website : ''));
  const isXCard = Boolean(xOpenDm) || String(leadSource || '').toLowerCase() === 'x';
  const normalized = {
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
    newReplyAt: newReplyAt || null,
    needsReply,
    approve: row.draft_reply ? ownerId : null,
    color: __v3Color(name + brand),
    email: row.email || '',
    gmailThreadId: row.gmail_thread_id || '',
    draftReply: V3ParseDraftReply(row.draft_reply),
    draftReplyStatus: row.draft_reply_status || '',
    agentAssessment: row.agent_assessment || '',
    recommendedAction: row.recommended_action || '',
    agentTier: row.agent_tier || '',
    dealState: row.deal_state || '',
    dealConfidence: row.deal_confidence || '',
    dealAwaiting: row.deal_awaiting || '',
    dealEvidence: row.deal_evidence || '',
    dealNextAction: row.deal_next_action || '',
    needsHumanRead: Boolean(row.needs_human_read),
    readyToInvoice: Boolean(row.ready_to_invoice),
    dealAgreement: Boolean(row.agreement),
    operatorMemory,
    operatorSummary: operatorMemory?.summary || null,
    operatorAnalysis: operatorMemory?.analysis || null,
    operatorEscalation: Array.isArray(operatorMemory?.escalation) ? operatorMemory.escalation : [],
    operatorUpdatedAt: operatorMemory?.updated_at || null,
    rowId: row.id,
    source: leadSource,
    rawDescription: row.description || '',
    notes: xContext.xSummary || briefPayload.rich_description || briefPayload.notes || row.notes || '',
    evidence: xContext.lastMessage || briefPayload.evidence || '',
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
    thread: isXCard && !(Array.isArray(thread) && thread.length) ? V3BuildXThreadFromLead({
      contactName: name,
      brand,
      deliverables: row.intent || row.lead_source || '',
      receivedAt: received,
      lastTouchAt: lastTouchAt || received,
      evidence: xContext.lastMessage || '',
      notes: xContext.xSummary || row.description || '',
      rawDescription: row.description || '',
      xHandle: String(row.x_username || xContext.x_username || '').trim(),
      xLastRobertMessage: xContext.lastRobertMessage || '',
      xReplyMarkedAt: xContext.xReplyMarkedAt || '',
    }) : thread,
    progress: Math.max(0, V3_ACTIVE_STAGE_IDS.indexOf(stage)),
    unread: Boolean(row.new_reply_at),
    xOpenDm,
    xHandle: String(row.x_username || xContext.x_username || '').trim(),
    xCurrentStatus: xContext.xCurrentStatus || '',
    xLastSender: xContext.lastSender || '',
    xLastRobertMessage: xContext.lastRobertMessage || '',
    xLastLeadMessage: xContext.lastMessage || '',
    xReplyMarkedAt: xContext.xReplyMarkedAt || '',
    xRepliedViaX: xContext.repliedViaX || false,
    xBestNextStep: xContext.bestNextStep || '',
    xLeadScore: xContext.leadScore != null ? Number(xContext.leadScore) : null,
  };
  const withTravel = V3ApplyTravelLeadMeta(normalized);
  return isXCard ? V3ApplyXReplyState(withTravel) : withTravel;
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

const V3_BLOCKED_CONTACTS = new Set(['boardy@boardy.ai']);
const V3_BLOCKED_DOMAINS = new Set(['boardy.ai']);
const V3_BLOCKED_X_HANDLES = new Set(['boardy', 'boardyai', 'boardy_ai']);
const V3_BLOCKED_IDENTITY_RE = /(^boardy\b|\bboardy\s*ai\b|\bboardy\s*boardman\b)/i;
const V3_X_NOISE_RE = /huge fan|thanks for following|good morning|good night|how are you|any rts|retweet|impressions would be great|quote tweet while tagging|sent a post|reacted |calendar invite|linkedin|podcast guest only|just saying hi|love your work|big fan/i;
const V3_X_PARTNERSHIP_RE = /collab|collaboration|sponsor|sponsorship|partnership|\bpartner\b|campaign|paid post|paid collab|budget|rates|pricing|brand deal|ambassador|affiliate|quote|repost|promote|promotion package/i;
const V3_X_PRODUCT_RE = /product|platform|startup|\bdemo\b|launch|\btool\b|\bagent\b|\brobot\b|framework|software|\bapp\b|saas|\bapi\b|\bbeta\b|\btrial\b|\bpilot\b|integrat|use case|customer/i;
const V3_X_SPAM_RE = /trading signal|profit potential|limited elite invitation|last chance:\s*\[|exclusive pass|confidential trading|elite trades daily|strategic trades daily|exact entry and exit|us\/eu traders|secure your elite status|bet[- ]channel|insider advantage|hidden trading|unlock (?:hidden|confidential) trading|only 150 spots|first 150 (?:us|spots|traders)|crypto signal|forex signal|binary option|whatsapp|contact me via whatsapp|portfolio goals|risk tolerance|one[- ]on[- ]one guidance|find stocks|traders are chasing|market is constantly changing|financial guidance|investment guidance|trading strategy|crypto trading|forex trading|onlyfans|only fans|fansly|fanvue|manyvids|chaturbate|custom vid(?:eo)?|filthiest fantasy|talk dirty|subscribe to my|preview link|nsfw|cam ?girl|adult content|explicit content|blowjob|throbbing cock|thick cum|学生妹|约炮|上门|母狗|claim your prize|maga team|maga sponsorship|your account was selected|selected to participate|randomly selected|brand new tesla car|send a dm now|tesla\/\s*maga|prize of \$\d|won a prize|you(?:'ve| have) won|lottery winner|giveaway winner|remote basis with regular pay|convenient work schedule|complete a short form|funding of \$50k|funding of \$100k|sonance:\s*calls|room:\s*wintrack|install the app from the app store|remote job opportunity|daily remuneration|remuneration:\s*\$|tiktok cross[- ]border|cross[- ]border e[- ]commerce merchants|positive review rates|enhancing the reputation and positive review|advertisement is sent by x ai|remote work available via mobile|official amazon brand|exclusive community of reviewers|brand product experience officers|free product trials and meet|click the link to join the group/i;

function V3XLeadDmBodyText(row) {
  const lastMessage = String(
    row?.lastLeadMessage
    || row?.evidence
    || row?.xLastLeadMessage
    || ''
  ).trim();
  if (lastMessage) return lastMessage;
  return String(row?.summaryForTeam || row?.rawDescription || row?.notes || '').trim();
}

function V3XLeadHasCommercialSignals(text) {
  const body = String(text || '').toLowerCase();
  if (!body) return false;
  return V3PartnershipRe().test(body) || V3ProductRe().test(body);
}

function V3XLeadIsNoiseOnly(text) {
  const body = String(text || '').toLowerCase();
  if (!body) return false;
  return V3NoiseRe().test(body) && !V3XLeadHasCommercialSignals(body);
}

function V3IsXSpamText(...parts) {
  const blob = parts.map(p => String(p || '')).join(' ').toLowerCase();
  if (!blob.trim()) return false;
  return V3SpamRe().test(blob);
}

function V3LeadAsXIntakeRow(lead) {
  if (!lead) return null;
  return {
    lastLeadMessage: lead.evidence || lead.xLastLeadMessage || '',
    summaryForTeam: lead.notes || lead.rawDescription || '',
    xName: lead.contactName || lead.brand || '',
    xUsername: lead.xHandle || '',
    openDm: lead.xOpenDm || '',
    xHandle: lead.xHandle || '',
    contactName: lead.contactName || '',
    brand: lead.brand || '',
  };
}

function V4LeadLooksLikeSpam(lead) {
  if (!lead || ['trash', 'dead-leads', 'paid-out', 'done'].includes(String(lead.stage || '').toLowerCase())) return false;
  if (V3IsBlockedLead(lead)) return true;
  if (!V3IsXLeadRecord(lead)) return false;
  const row = V3LeadAsXIntakeRow(lead);
  if (V3IsXSpamRow(row)) return true;
  const body = V3XLeadDmBodyText(row);
  if (!body) return false;
  if (V3XLeadIsNoiseOnly(body)) return true;
  if (V3IsNewLeadReview(lead) && !V3XLeadHasCommercialSignals(body)) return true;
  return false;
}

async function V4PurgeSpamQueue(leads = window.V3?.LEADS || []) {
  const targets = (Array.isArray(leads) ? leads : []).filter(V4LeadLooksLikeSpam);
  for (const lead of targets) {
    window.V3.MoveLeadStage(lead, 'trash');
  }
  let server = null;
  if (typeof V4BriefServiceFetch === 'function') {
    try {
      const res = await V4BriefServiceFetch('/run-x-spam-cleanup', { method: 'POST', body: JSON.stringify({}) });
      server = await res.json().catch(() => ({}));
    } catch (err) {
      console.warn('[ALIGNED v4] run-x-spam-cleanup failed:', err);
    }
  }
  if (window.V3?.ReloadLeads) await window.V3.ReloadLeads({ cacheBust: Date.now() });
  return { trashed: targets.length, server };
}

function V3IsXSpamRow(row) {
  if (!row) return false;
  const body = V3XLeadDmBodyText(row);
  const blob = [body, row.summaryForTeam, row.xName, row.contactName, row.xHandle, row.brand].filter(Boolean).join(' ');
  return V3IsXSpamText(blob);
}

function V3IntakeRowIsBlocked(row) {
  if (!row) return true;
  return !!(row.spamBlocked || row.qualifyBlocked || row.userTrashed);
}

function V3IsBlockedLead(lead) {
  if (!lead) return false;
  const email = String(lead.email || '').trim().toLowerCase();
  if (email && V3_BLOCKED_CONTACTS.has(email)) return true;
  const domain = email.includes('@') ? email.split('@')[1] : '';
  if (domain && V3_BLOCKED_DOMAINS.has(domain)) return true;
  const handle = String(lead.xHandle || lead.xUsername || '').replace(/^@/, '').trim().toLowerCase();
  if (handle && V3_BLOCKED_X_HANDLES.has(handle)) return true;
  const blob = [
    lead.brand,
    lead.contactName,
    lead.contactRole,
    lead.email,
    lead.xHandle,
    lead.source,
    ...(Array.isArray(lead.thread) ? lead.thread.flatMap(m => [m?.from, m?.subject, m?.body]) : []),
  ].filter(Boolean).join(' ');
  if (V3_BLOCKED_IDENTITY_RE.test(blob)) return true;
  if (/@boardy\.ai\b/i.test(blob) || /\bboardy@boardy\.ai\b/i.test(blob)) return true;
  const dmBodies = Array.isArray(lead.xDmMessages)
    ? lead.xDmMessages.map(msg => msg?.text || msg?.body || '').filter(Boolean)
    : [];
  if (V3IsXSpamText(blob, lead.notes, lead.evidence, lead.xLastLeadMessage, ...dmBodies)) return true;
  return false;
}

function V3FilterVisibleLeads(leads) {
  return (Array.isArray(leads) ? leads : [])
    .map(V3PruneLeadForVisibleRange)
    .filter(Boolean)
    .filter(lead => !V3IsBlockedLead(lead));
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
  const trashedSets = V3TrashedIntakeSets();
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
  const existingOpenDms = new Set(
    existingLeads.map(lead => V3NormalizeOpenDmUrl(lead?.xOpenDm)).filter(Boolean)
  );
  const qualifiedLeadType = (row) => {
    if (V3IsXSpamRow(row)) return false;
    const type = String(row?.leadType || '').trim().toLowerCase();
    const body = V3XLeadDmBodyText(row);
    if (!body) return false;
    if (V3XLeadIsNoiseOnly(body)) return false;
    const commercial = V3XLeadHasCommercialSignals(body);
    if (type === 'paid / sponsorship' || type === 'product / demo') return commercial;
    if (type === 'general outreach' || type === 'intro / network' || type === 'payment / admin') return commercial;
    if (type === 'event / media') return commercial;
    return commercial;
  };
  return list
    .filter(row => row && row.newLead !== false && !row.spamBlocked && !row.qualifyBlocked && !row.userTrashed)
    .filter(row => !V3IntakeRowIsUserTrashed(row, trashedSets))
    .filter(row => !V3IsXSpamRow(row))
    .filter(row => qualifiedLeadType(row))
    .filter(row => !row.alreadyEmailedInRobertGmail)
    .filter(row => {
      const xUser = String(row.xUsername || '').replace(/^@/, '').trim().toLowerCase();
      const xName = String(row.xName || '').trim();
      if (xUser && V3_BLOCKED_X_HANDLES.has(xUser)) return false;
      if (V3_BLOCKED_IDENTITY_RE.test(xName)) return false;
      const emails = String(row.contactEmails || '')
        .split(/[,\s|]+/)
        .map(item => item.trim().toLowerCase())
        .filter(item => /@/.test(item));
      if (emails.some(email => V3_BLOCKED_CONTACTS.has(email) || V3_BLOCKED_DOMAINS.has(email.split('@')[1] || ''))) return false;
      return true;
    })
    .filter(row => {
      const openDm = V3NormalizeOpenDmUrl(row.openDm);
      if (openDm && existingOpenDms.has(openDm)) return false;
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
  const internal = V3XInternalEmailSet();
  const emails = String(row.contactEmails || '')
    .split(/[,\s|]+/)
    .map(item => item.trim().toLowerCase())
    .filter(item => /@/.test(item) && !internal.has(item));
  const email = emails[0] || '';
  const latestLeadMessage = String(row.lastLeadMessage || '').trim();
  const summary = String(row.summaryForTeam || row.lastLeadMessage || '').trim();
  const brand = V4XLeadPitchRef({
    contactName: name,
    brand: String(row.xName || '').replace(/^@/, '').trim(),
    evidence: latestLeadMessage,
    notes: summary,
    rawDescription: summary,
  }) || String(row.xName || '').replace(/^@/, '').trim() || V3DomainBrand(email) || 'X lead';
  const received = V3NormalizeDateForUi(row.newestDmDate || '');
  const dmLink = String(row.openDm || '').trim();
  const handle = String(row.xUsername || '').trim();
  const nextStep = String(row.bestNextStep || '').trim();
  const currentStatus = String(row.currentStatus || '').trim();
  const lastSender = String(row.lastSender || '').trim();
  const lastRobertMessage = String(row.lastRobertMessage || V3ExtractRobertPositionFromSummary(summary) || '').trim();
  const repliedViaX = row.repliedViaX === true || String(row.repliedViaX || '').toLowerCase() === 'true';
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
  const base = {
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
    thread: V3BuildXThreadFromLead({
      contactName: name,
      brand,
      deliverables: String(row.leadType || 'X DM lead'),
      receivedAt: received,
      lastTouchAt: received,
      evidence: latestLeadMessage,
      notes: summary,
      rawDescription: summary,
      xHandle: handle,
      xLastRobertMessage: lastRobertMessage,
      xLastLeadMessage: latestLeadMessage,
    }),
    progress: Math.max(0, V3_ACTIVE_STAGE_IDS.indexOf('new')),
    unread: true,
    xHandle: handle,
    xOpenDm: dmLink,
    xLeadScore: Number(row.leadScore || 0),
    xContactInfo: String(row.contactInfo || ''),
    xBestNextStep: nextStep,
    xMessageCount: Number(row.messageCount || 0),
    xCurrentStatus: currentStatus,
    xLastSender: lastSender,
    xLastRobertMessage: lastRobertMessage,
    xLastLeadMessage: latestLeadMessage,
    xRepliedViaX: repliedViaX,
    xEmailDraft: String(row.emailDraft || ''),
    xQuickNote: quickNote,
    xDmMessages: Array.isArray(row.dmMessages) ? row.dmMessages : [],
  };
  return V3ApplyXReplyState(V3ApplyTravelLeadMeta(base));
}

function V3TimestampForUi(value) {
  const normalized = V3NormalizeDateForUi(value);
  const t = normalized ? Date.parse(normalized) : NaN;
  return Number.isFinite(t) ? t : 0;
}

function V3MaxTouchAt(...values) {
  let best = 0;
  let bestValue = null;
  for (const value of values) {
    const normalized = V3NormalizeDateForUi(value);
    const t = V3TimestampForUi(normalized);
    if (t >= best) {
      best = t;
      bestValue = normalized;
    }
  }
  return bestValue;
}

function V3LeadActivityTimestamp(lead) {
  if (!lead) return 0;
  return Math.max(
    V3TimestampForUi(lead.lastTouchAt),
    V3TimestampForUi(lead.receivedAt),
    V3TimestampForUi(lead.newReplyAt),
    V3TimestampForUi(lead.briefSentAt),
    V3TimestampForUi(lead.briefApprovedAt),
    V3TimestampForUi(lead.operatorUpdatedAt),
    ...(Array.isArray(lead.thread) ? lead.thread.map(msg => V3TimestampForUi(msg.date || msg.dateIso || msg.timestamp || msg.when)) : [0])
  );
}

function V3LeadActivityLabel(lead) {
  const ts = V3LeadActivityTimestamp(lead);
  if (!ts) return lead?.lastTouch || '';
  const iso = new Date(ts).toISOString();
  return V3GmailTime.list(iso);
}

function V3LeadActivityFull(lead) {
  const ts = V3LeadActivityTimestamp(lead);
  if (!ts) return '';
  return V3GmailTime.full(new Date(ts).toISOString());
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
  let text = String(body || '').trim();
  text = text.replace(/(unaligned\.io\s*\|\s*x\.com\/unalignedx)\S*/gi, '$1');
  const signature = V3SenderSignature(sender);
  if (!signature) return text;
  const normText = V3NormalizeThreadText(text);
  const normSig = V3NormalizeThreadText(signature);
  if (!text) return signature;
  if (normText.includes(normSig)) return text;
  return text + '\n\n' + signature;
}

const V3_LONG_STANDING_PARTNERS = [
  'omane', 'echonlab', 'echon lab', 'polyai', 'poly ai',
  'ahacreator', 'aha creator', 'eezycollab', 'arcgrowth', 'arc growth',
];

function V3NoDashes(text) {
  if (!text) return text;
  return String(text)
    .replace(/—/g, '. ')
    .replace(/–/g, '. ')
    .replace(/\s+-\s+/g, '. ');
}

function V3ResolveReplyTone(lead) {
  const fromAnalysis = String(lead?.operatorAnalysis?.tone || lead?.operatorMemory?.analysis?.tone || '')
    .toLowerCase()
    .replace(/_/g, '-');
  if (['direct', 'friendship', 'long-standing'].includes(fromAnalysis)) return fromAnalysis;
  const name = [lead?.brand, lead?.contactName, lead?.email].filter(Boolean).join(' ').toLowerCase();
  for (const partner of V3_LONG_STANDING_PARTNERS) {
    if (name.includes(partner)) return 'long-standing';
  }
  const thread = Array.isArray(lead?.thread) ? lead.thread : [];
  const ours = ['unalignedx@', 'samlevin@', 'scobleizer@', 'asherweisberger@', 'robert scoble', 'sam levin'];
  const ourMsgs = thread.filter(m => m && ours.some(s => String(m.from || '').toLowerCase().includes(s))).length;
  if (ourMsgs >= 1 && thread.length >= 3) return 'friendship';
  return 'direct';
}

function V3ReplyToneLabel(tone) {
  if (tone === 'long-standing') return 'Long standing partner';
  if (tone === 'friendship') return 'Warm rapport';
  return 'Direct / new contact';
}

function V3ExternalThreadFirstName(lead) {
  const contactFirst = String(lead?.contactName || '').trim().split(/\s+/)[0];
  if (contactFirst) return contactFirst;
  const thread = Array.isArray(lead?.thread) ? lead.thread : [];
  for (let i = thread.length - 1; i >= 0; i -= 1) {
    const from = String(thread[i]?.from || '');
    if (V3IsTeamParticipant(from)) continue;
    const match = from.match(/^([^<,@]+)/);
    if (match) {
      const first = match[1].trim().split(/\s+/)[0];
      if (first) return first;
    }
  }
  return 'there';
}

function V3StripExistingSignatures(body) {
  let text = String(body || '').trim();
  const markers = [
    'Robert Scoble', 'Sam Levin', 'Asher Weisberger', 'Partnerships, UNALIGNED',
    'Client Services Manager', 'Founder, Unaligned', 'Mobile: +1-425',
  ];
  for (const marker of markers) {
    const idx = text.toLowerCase().lastIndexOf(marker.toLowerCase());
    if (idx > 40) text = text.slice(0, idx).trim();
  }
  return text;
}

function V3FixDraftGreeting(body, firstName) {
  const lines = String(body || '').split('\n');
  const first = firstName || 'there';
  if (lines.length && /^hi\s+/i.test(lines[0].trim())) {
    lines[0] = `Hi ${first},`;
    return lines.join('\n');
  }
  return body;
}

function V3AdaptDraftSubject(storedSubject, lead) {
  const expected = V3SubjectForLead(lead);
  const stored = String(storedSubject || '').trim();
  if (!stored) return expected;
  const first = V3ExternalThreadFirstName(lead).toLowerCase();
  const brand = String(lead?.brand || '').toLowerCase();
  const subj = stored.toLowerCase();
  const mentionsLead = (first !== 'there' && subj.includes(first))
    || (brand.length > 2 && subj.includes(brand));
  const last = lead?.thread?.[lead.thread.length - 1] || {};
  if (last.subject && !mentionsLead) return expected;
  return stored;
}

function V3HasStoredReplyDraft(lead) {
  return String(lead?.draftReply?.body || '').trim().length > 0;
}

function V3FinalizeApprovedDraftBody(body, lead, sender) {
  const first = V3ExternalThreadFirstName(lead);
  let text = V3StripExistingSignatures(String(body || '').trim());
  text = V3FixDraftGreeting(text, first);
  text = V3NoDashes(text);
  const tone = V3ResolveReplyTone(lead);
  if (tone === 'direct' && sender !== 'robert') {
    text = text
      .replace(/\bI'm looking forward to\b/gi, 'Happy to')
      .replace(/\blooking forward to\b/gi, 'happy to');
  }
  if (sender === 'robert' && !/robert/i.test(text.slice(0, 120)) && tone === 'direct') {
    text = text.replace(/\bThanks for confirming\b/gi, 'Thanks for the note');
  }
  return text.trim();
}

function V3AdaptDraftBodyForLead(body, lead, sender) {
  const first = V3ExternalThreadFirstName(lead);
  const brand = String(lead?.brand || '').toLowerCase();
  const raw = String(body || '').trim();
  const hasStoredDraft = V3HasStoredReplyDraft(lead);
  if (hasStoredDraft) {
    return V3FinalizeApprovedDraftBody(raw, lead, sender);
  }
  const greetingLine = raw.split('\n')[0]?.trim() || '';
  const greetingWrong = /^hi\s+/i.test(greetingLine)
    && !greetingLine.toLowerCase().includes(first.toLowerCase())
    && first !== 'there';
  const head = raw.slice(0, 280).toLowerCase();
  const seemsOffThread = greetingWrong || (brand.length > 2 && raw.length > 40 && !head.includes(brand));
  const nextAction = String(lead?.operatorSummary?.next_action || lead?.nextMove?.text || '').trim();
  if (seemsOffThread && nextAction.length > 20) {
    body = V3FallbackDraftBody(lead, sender);
  }
  let text = V3StripExistingSignatures(String(body || '').trim());
  text = V3FixDraftGreeting(text, first);
  text = V3NoDashes(text);
  const tone = V3ResolveReplyTone(lead);
  const summary = String(lead?.operatorSummary?.next_action || lead?.nextMove?.text || '').trim();
  if (summary && text.length < 48 && !/^hi\s+/i.test(text)) {
    text = [`Hi ${first},`, '', summary, '', 'Best,'].join('\n');
  }
  if (tone === 'direct' && sender !== 'robert') {
    text = text
      .replace(/\bI'm looking forward to\b/gi, 'Happy to')
      .replace(/\blooking forward to\b/gi, 'happy to');
  }
  if (sender === 'robert' && !/robert/i.test(text.slice(0, 120)) && tone === 'direct') {
    text = text.replace(/\bThanks for confirming\b/gi, 'Thanks for the note');
  }
  return text.trim();
}

function V3FallbackDraftBody(lead, sender) {
  const first = V3ExternalThreadFirstName(lead);
  const brand = String(lead?.brand || 'your company');
  const tone = V3ResolveReplyTone(lead);
  const nextAction = String(lead?.operatorSummary?.next_action || lead?.nextMove?.text || '').trim();
  const stage = String(lead?.stage || '');

  if (nextAction && nextAction.length > 12) {
    return V3NoDashes([
      `Hi ${first},`,
      '',
      nextAction,
      '',
      'Best,',
    ].join('\n'));
  }

  if (sender === 'robert') {
    return V3NoDashes([
      `Hi ${first},`,
      '',
      tone === 'long-standing'
        ? `Thanks for keeping ${brand} moving. I saw the latest note and want to answer it cleanly.`
        : `Thanks for reaching out about ${brand}. I saw the latest note and want to keep this moving cleanly.`,
      '',
      'Best,',
    ].join('\n'));
  }
  if (sender === 'sam') {
    const opener = stage === 'rates-sent' || stage === 'negotiating' || stage === 'invoice-sent'
      ? 'I saw the latest note and I am keeping this moving on the partnership side.'
      : tone === 'friendship' || tone === 'long-standing'
        ? 'Jumping back in on the partnership side.'
        : 'I am jumping in to keep the thread moving on the partnership side.';
    return V3NoDashes([
      `Hi ${first},`,
      '',
      opener,
      'We will keep the thread aligned with the latest details before sending anything else.',
      '',
      'Best,',
    ].join('\n'));
  }
  return V3NoDashes([
    `Hi ${first},`,
    '',
    'I am jumping in to keep the chain organized and reply to the latest information in the thread.',
    '',
    'Best,',
  ].join('\n'));
}

function V3ComposeReplyDraft(lead, sender, opts = {}) {
  const draft = lead?.draftReply && typeof lead.draftReply === 'object' ? lead.draftReply : null;
  const subject = V3AdaptDraftSubject(draft?.subject, lead);
  const storedBody = String(draft?.body || '').trim();
  const approvedSend = !!opts.approvedSend;
  if (approvedSend && !storedBody) {
    throw new Error('No draft body to send. Open edit and write the reply first.');
  }
  const rawBody = storedBody || V3FallbackDraftBody(lead, sender);
  const adapted = (storedBody || approvedSend)
    ? V3FinalizeApprovedDraftBody(rawBody, lead, sender)
    : V3AdaptDraftBodyForLead(rawBody, lead, sender);
  return {
    subject,
    body: V3EnsureSenderSignature(adapted, sender),
    tone: V3ResolveReplyTone(lead),
  };
}

function V3SubjectForLead(lead) {
  const last = lead?.thread?.[lead.thread.length - 1] || {};
  const base = last.subject || ((lead?.brand || 'Lead') + ' conversation');
  return /^re:/i.test(base) ? base : 'Re: ' + base;
}

function V3DefaultCc(sender) {
  return V3InternalEmails(sender)
    .join(',');
}

function V3XInternalEmailSet() {
  return new Set([
    'scobleizer@gmail.com',
    'unalignedx@gmail.com',
    'asherunaligned@gmail.com',
    'samlevin@mac.com',
    'asherweisberger@gmail.com',
  ]);
}

function V3LeadExternalEmail(lead) {
  const internal = V3XInternalEmailSet();
  const candidates = [
    lead?.email,
    ...(String(lead?.xContactInfo || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []),
    ...String(lead?.contactEmails || lead?.xContactEmails || '').split(/[,\s|]+/),
  ]
    .map(item => String(item || '').trim().toLowerCase())
    .filter(item => /@/.test(item));
  return candidates.find(email => !internal.has(email)) || '';
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

function V3NormalizeOpenDmUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.split('#')[0].replace(/\/+$/, '');
}

const V3_TRASHED_INTAKE_KEY = 'v3-trashed-x-intake';
const V3_TRASHED_CARDS_KEY = 'v3-trashed-card-ids';

function V3TrashedCardIdSet() {
  try {
    const raw = localStorage.getItem(V3_TRASHED_CARDS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return new Set((Array.isArray(list) ? list : []).map(item => String(item)).filter(Boolean));
  } catch (e) {
    return new Set();
  }
}

function V3RememberTrashedCard(lead) {
  const id = V3SupabaseCardId(lead);
  if (!id) return;
  const next = [...new Set([...V3TrashedCardIdSet(), id])];
  try { localStorage.setItem(V3_TRASHED_CARDS_KEY, JSON.stringify(next)); } catch (e) {}
}

function V3ForgetTrashedCard(lead) {
  const id = V3SupabaseCardId(lead);
  if (!id) return;
  const next = [...V3TrashedCardIdSet()].filter(item => item !== id);
  try { localStorage.setItem(V3_TRASHED_CARDS_KEY, JSON.stringify(next)); } catch (e) {}
}

function V3ApplyTrashedCardTombstones(leads) {
  const tombstones = V3TrashedCardIdSet();
  if (!tombstones.size) return leads;
  return (Array.isArray(leads) ? leads : []).map(lead => {
    const id = V3SupabaseCardId(lead);
    if (!id || !tombstones.has(id)) return lead;
    if (['trash', 'dead-leads'].includes(String(lead.stage || '').toLowerCase())) return lead;
    return { ...lead, stage: 'trash' };
  });
}

function V3PruneConfirmedTrashedTombstones(leads) {
  const tombstones = V3TrashedCardIdSet();
  if (!tombstones.size) return;
  const confirmed = new Set(
    (Array.isArray(leads) ? leads : [])
      .filter(lead => ['trash', 'dead-leads'].includes(String(lead.stage || '').toLowerCase()))
      .map(lead => V3SupabaseCardId(lead))
      .filter(Boolean)
  );
  const next = [...tombstones].filter(id => !confirmed.has(id));
  if (next.length === tombstones.size) return;
  try { localStorage.setItem(V3_TRASHED_CARDS_KEY, JSON.stringify(next)); } catch (e) {}
}

function V3TrashedIntakeStore() {
  try {
    const raw = localStorage.getItem(V3_TRASHED_INTAKE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      openDms: Array.isArray(parsed.openDms) ? parsed.openDms : [],
      handles: Array.isArray(parsed.handles) ? parsed.handles : [],
      ranks: Array.isArray(parsed.ranks) ? parsed.ranks : [],
    };
  } catch (e) {
    return { openDms: [], handles: [], ranks: [] };
  }
}

function V3TrashedIntakeSets() {
  const store = V3TrashedIntakeStore();
  return {
    openDms: new Set(store.openDms.map(V3NormalizeOpenDmUrl).filter(Boolean)),
    handles: new Set(store.handles.map(item => String(item).replace(/^@/, '').trim().toLowerCase()).filter(Boolean)),
    ranks: new Set(store.ranks.map(item => String(item).trim()).filter(Boolean)),
  };
}

function V3IntakeRowDismissKeys(row) {
  const keys = { openDms: [], handles: [], ranks: [] };
  const openDm = V3NormalizeOpenDmUrl(row?.openDm || row?.xOpenDm);
  if (openDm) keys.openDms.push(openDm);
  const handle = String(row?.xUsername || row?.xHandle || '').replace(/^@/, '').trim().toLowerCase();
  if (handle) keys.handles.push(handle);
  const rank = String(row?.rank || '').trim();
  if (rank) keys.ranks.push(rank);
  return keys;
}

function V3LeadDismissKeys(lead) {
  const keys = V3IntakeRowDismissKeys(lead);
  const id = String(lead?.id || '');
  if (id.startsWith('xdm-')) {
    const tail = id.slice(4).trim();
    if (tail) keys.ranks.push(tail);
  }
  return keys;
}

function V3PersistTrashedIntakeKeys(keys) {
  const store = V3TrashedIntakeStore();
  const mergeUnique = (base, extra) => [...new Set([...(base || []), ...(extra || [])].map(item => String(item).trim()).filter(Boolean))];
  const next = {
    openDms: mergeUnique(store.openDms, keys.openDms),
    handles: mergeUnique(store.handles, keys.handles),
    ranks: mergeUnique(store.ranks, keys.ranks),
  };
  try {
    localStorage.setItem(V3_TRASHED_INTAKE_KEY, JSON.stringify(next));
  } catch (e) {
    console.warn('[ALIGNED v4] could not persist trashed intake keys:', e);
  }
}

function V3ForgetTrashedIntakeKeys(keys) {
  const store = V3TrashedIntakeStore();
  const drop = (base, extra) => {
    const remove = new Set((extra || []).map(item => String(item).trim()).filter(Boolean));
    return (base || []).filter(item => !remove.has(String(item).trim()));
  };
  const next = {
    openDms: drop(store.openDms, keys.openDms),
    handles: drop(store.handles, keys.handles),
    ranks: drop(store.ranks, keys.ranks),
  };
  try {
    localStorage.setItem(V3_TRASHED_INTAKE_KEY, JSON.stringify(next));
  } catch (e) {
    console.warn('[ALIGNED v4] could not clear trashed intake keys:', e);
  }
}

function V3DismissXIntakeForLead(lead) {
  const keys = V3LeadDismissKeys(lead);
  if (!keys.openDms.length && !keys.handles.length && !keys.ranks.length) return;
  V3PersistTrashedIntakeKeys(keys);
  if (typeof V4BriefServiceFetch !== 'function') return;
  V4BriefServiceFetch('/dismiss-x-intake', {
    method: 'POST',
    body: JSON.stringify({
      open_dm: keys.openDms[0] || '',
      x_handle: keys.handles[0] || '',
      rank: keys.ranks[0] || '',
      contact_name: lead?.contactName || '',
    }),
  }).catch(err => console.warn('[ALIGNED v4] dismiss-x-intake failed:', err));
}

function V3RestoreXIntakeForLead(lead) {
  const keys = V3LeadDismissKeys(lead);
  if (!keys.openDms.length && !keys.handles.length && !keys.ranks.length) return;
  V3ForgetTrashedIntakeKeys(keys);
  if (typeof V4BriefServiceFetch !== 'function') return;
  V4BriefServiceFetch('/restore-x-intake', {
    method: 'POST',
    body: JSON.stringify({
      open_dm: keys.openDms[0] || '',
      x_handle: keys.handles[0] || '',
      rank: keys.ranks[0] || '',
    }),
  }).catch(err => console.warn('[ALIGNED v4] restore-x-intake failed:', err));
}

function V3SupabaseCardId(lead) {
  const candidates = [lead?.rowId, lead?.id];
  for (const raw of candidates) {
    if (raw == null || raw === '') continue;
    const text = String(raw).trim();
    if (!/^\d+$/.test(text)) continue;
    return text;
  }
  return null;
}

function V3IntakeRowIsUserTrashed(row, trashedSets) {
  if (!row || row.userTrashed === true) return true;
  const openDm = V3NormalizeOpenDmUrl(row.openDm);
  if (openDm && trashedSets.openDms.has(openDm)) return true;
  const handle = String(row.xUsername || '').replace(/^@/, '').trim().toLowerCase();
  if (handle && trashedSets.handles.has(handle)) return true;
  const rank = String(row.rank || '').trim();
  if (rank && trashedSets.ranks.has(rank)) return true;
  return false;
}

function V3FindExistingXCard(leads, openDm, intakeId) {
  const key = V3NormalizeOpenDmUrl(openDm);
  if (!key) return null;
  return (Array.isArray(leads) ? leads : []).find(item => {
    if (String(item.id) === String(intakeId)) return false;
    if (String(item.id || '').startsWith('xdm-')) return false;
    return V3NormalizeOpenDmUrl(item.xOpenDm) === key;
  }) || null;
}

function V3IsNewLeadReview(lead) {
  if (!lead || lead.isRobertBrief) return false;
  const sourceKind = V3NewLeadSourceKind(lead);
  const mailbox = V3LeadMailboxOrigin(lead);
  const stage = String(lead.stage || '').toLowerCase();
  if (sourceKind === 'x' && stage !== 'new') return false;
  if (mailbox === 'asher') return false;
  if (sourceKind === 'x' || mailbox === 'robert') return !V3CompanyOsQualifiedLead(lead);
  return false;
}

function V3NewLeadSourceKind(lead) {
  const source = String(lead?.source || '').toLowerCase();
  if (source === 'x' || source.includes('x-dm') || source.includes('twitter_dm') || source.includes('ingest-twitter_dm')) return 'x';
  return 'gmail';
}

function V3LeadMailboxOrigin(lead) {
  const source = String(lead?.source || '').toLowerCase();
  if (source === 'x' || source.includes('x-dm') || source.includes('twitter_dm') || source.includes('ingest-twitter_dm')) return 'x';
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
    if (V3XLeadRepliedViaX(lead)) return 'Replied via X';
    const status = String(lead?.xCurrentStatus || lead?.xBestNextStep || '').toLowerCase();
    if (status.includes('needs live check')) return 'Needs live check';
    if (status.includes('already routed')) return 'Already routed';
    if (status.includes('robert was last')) return 'Replied via X';
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
  let token = V3ApiToken();
  if (!token) token = await V3BootstrapApiToken();
  if (!token) {
    throw new Error('Send token could not load from your Mac. Hard refresh (Cmd+Shift+R), wait for Medic to clear "Loading send token…", then Approve & send again.');
  }
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };
  const resp = await fetch('https://us-central1-unaligned-fc556.cloudfunctions.net/sendEmail', {
    method: 'POST',
    headers,
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

Object.assign(window, { V3SenderForUser, V3SenderName, V3SenderSignature, V3EnsureSenderSignature, V3ComposeReplyDraft, V3ResolveReplyTone, V3ReplyToneLabel, V3SubjectForLead, V3DefaultCc, V3InternalEmails, V3SenderEmails, V3IsSelfRecipient, V3SplitEmails, V3EmailsFromValue, V3ExtractEmail, V3LeadReplyToEmail, V3ThreadParticipants, V3LeadMatchesQuery, V3UniqueEmails, V3ReplyRecipients, V3ThreadMessageKey, V3PendingReplyKey, V3PendingReplyMatchesLead, V3PrunePendingReplies, V3MergePendingReplies, V3SendLeadEmail, V3LeadActivityTimestamp, V3LeadReceivedTimestamp, V3SortLeadsByActivity, V3NewLeadReason });


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
const V3_TRASH_STAGE_IDS = ['trash', 'dead-leads'];

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
      // Honest: real per-stage history is not tracked, so do NOT fabricate "Xd ago"
      // timestamps or event narratives for past stages. Only the current stage shows
      // its real time-in-stage. Prior stages render as reached, without invented dates.
      when: i === idx && days ? `${days}d in stage` : '',
      note: i === idx ? __v3StageNote(s, contact, brand) : '',
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

async function V3PatchSupabaseCardStage(cardId, listId, extraFields) {
  const res = await fetch(V3_SUPABASE_URL + '/rest/v1/cards?id=eq.' + encodeURIComponent(cardId), {
    method: 'PATCH',
    headers: { ...V3_SUPABASE_HEADERS, Prefer: 'return=representation' },
    body: JSON.stringify({ list_id: listId, ...(extraFields || {}) }),
  });
  if (!res.ok) throw new Error('Supabase stage patch failed (' + res.status + '): ' + (await res.text()));
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) && rows[0] ? rows[0] : { id: cardId, list_id: listId };
}

async function V3PersistLeadStageRemote(lead, normalizedStage) {
  const openDm = V3NormalizeOpenDmUrl(lead?.xOpenDm);
  const cardId = V3SupabaseCardId(lead);
  if (typeof V4BriefServiceFetch === 'function') {
    try {
      const res = await V4BriefServiceFetch('/move-lead-stage', {
        method: 'POST',
        body: JSON.stringify({
          card_id: cardId || '',
          list_id: normalizedStage,
          open_dm: openDm || '',
          contact_name: lead?.contactName || '',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok !== false) return data;
    } catch (err) {
      console.warn('[ALIGNED v4] move-lead-stage server failed, falling back:', err);
    }
  }
  if (cardId) {
    await V3PatchSupabaseCardStage(cardId, normalizedStage);
    return { ok: true, card_id: cardId, source: 'supabase-direct' };
  }
  const existing = V3FindExistingXCard(window.V3?.LEADS || [], openDm, lead?.id);
  const existingId = existing ? V3SupabaseCardId(existing) : null;
  if (existingId) {
    await V3PatchSupabaseCardStage(existingId, normalizedStage);
    return { ok: true, card_id: existingId, source: 'supabase-existing' };
  }
  if (!openDm) throw new Error('No Supabase card id or X openDm to persist stage.');
  const cardPayload = {
    list_id: normalizedStage,
    title: lead.contactName || lead.brand || 'X lead',
    contact_name: lead.contactName || '',
    business_name: lead.brand || lead.contactName || '',
    lead_source: 'X',
    x_open_dm: openDm,
    email: lead.email || '',
    intent: lead.deliverables || '',
    description: JSON.stringify({
      x_summary: lead.notes || '',
      last_message: lead.evidence || lead.xLastLeadMessage || '',
      last_robert_message: lead.xLastRobertMessage || V3ExtractRobertPositionFromSummary(lead.notes || '') || '',
      last_sender: lead.xLastSender || (V3XLeadRepliedViaX(lead) ? 'Robert' : 'Lead'),
      replied_via_x: V3XLeadRepliedViaX(lead),
      x_current_status: lead.xCurrentStatus || '',
      x_username: lead.xHandle || '',
      open_dm: openDm,
      x_reply_marked_at: lead.xReplyMarkedAt || '',
    }),
  };
  const res = await fetch(V3_SUPABASE_URL + '/rest/v1/cards', {
    method: 'POST',
    headers: { ...V3_SUPABASE_HEADERS, Prefer: 'return=representation' },
    body: JSON.stringify(cardPayload),
  });
  if (!res.ok) throw new Error('Supabase card insert failed (' + res.status + '): ' + (await res.text()));
  const rows = await res.json();
  const newId = Array.isArray(rows) && rows[0] ? rows[0].id : null;
  if (!newId) throw new Error('Supabase card insert returned no id.');
  return { ok: true, card_id: newId, source: 'supabase-insert' };
}

function V3MoveLeadStage(lead, nextStage, leads = window.V3?.LEADS || V3_LEADS) {
  const normalizedStage = V3NormalizeStage(nextStage);
  const wasTrash = ['trash', 'dead-leads'].includes(String(lead?.stage || '').toLowerCase());
  const isTrash = ['trash', 'dead-leads'].includes(normalizedStage);
  if (isTrash && !wasTrash) {
    V3DismissXIntakeForLead(lead);
    V3RememberTrashedCard(lead);
  }
  if (!isTrash && wasTrash) {
    V3RestoreXIntakeForLead(lead);
    V3ForgetTrashedCard(lead);
  }

  const updated = leads.map(item => String(item.id) === String(lead.id) ? { ...item, stage: normalizedStage } : item);
  window.V3.LEADS = updated;
  window.dispatchEvent(new CustomEvent('v3:leads-loaded', { detail: { leads: updated } }));

  V3PersistLeadStageRemote(lead, normalizedStage)
    .then(result => {
      const cardId = String(result?.card_id || V3SupabaseCardId(lead) || '');
      if (!cardId) return;
      const merged = (window.V3.LEADS || updated).map(item => {
        if (String(item.id) === String(lead.id)) {
          if (String(item.id) !== cardId) return null;
          return { ...item, stage: normalizedStage, id: cardId, rowId: cardId };
        }
        if (String(item.id) === cardId) return { ...item, stage: normalizedStage };
        return item;
      }).filter(Boolean);
      window.V3.LEADS = merged;
      window.dispatchEvent(new CustomEvent('v3:leads-loaded', { detail: { leads: merged } }));
      if (isTrash) V3RememberTrashedCard({ ...lead, id: cardId, rowId: cardId });
    })
    .catch(err => {
      console.error('[ALIGNED v4] stage persist failed:', err);
      const reverted = (window.V3.LEADS || updated).map(item =>
        String(item.id) === String(lead.id) ? { ...item, stage: lead.stage } : item);
      window.V3.LEADS = reverted;
      window.dispatchEvent(new CustomEvent('v3:leads-loaded', { detail: { leads: reverted } }));
      if (isTrash && !wasTrash) V3ForgetTrashedCard(lead);
      window.dispatchEvent(new CustomEvent('v3:stage-persist-failed', {
        detail: { leadId: lead?.id, error: err?.message || String(err) },
      }));
    });
}

window.V3 = { USERS: V3_USERS, STAGES: V3_STAGES, STAGE_BY_ID: V3_STAGE_BY_ID, ACTIVE_STAGE_IDS: V3_ACTIVE_STAGE_IDS, BOARD_STAGE_IDS: V3_BOARD_STAGE_IDS, TRASH_STAGE_IDS: V3_TRASH_STAGE_IDS, LEADS: V3_VISIBLE_LEADS, TIERS: V3_TIERS, DELIV_TYPES: V3_DELIV_TYPES, BRIEF_STATUSES: V3_BRIEF_STATUSES, ROBERT_BRIEFS: V3_VISIBLE_ROBERT_BRIEFS, TASK_TYPES: V3_TASK_TYPES, GmailTime: V3GmailTime, flowCounts: v3FlowCounts, greeting: v3Greeting, deriveTasks: v3DeriveTasks, bucketTasks: v3BucketTasks, ProfileTeam: V3ProfileTeam, ProfileLane: V3ProfileLane, LeadLane: V3LeadLane, LeadVisibleToProfile: V3LeadVisibleToProfile, LeadIsMineForProfile: V3MoveIsMineForProfile, MoveIsMineForProfile: V3MoveIsMineForProfile, MoveLeadStage: V3MoveLeadStage, IsNewLeadReview: V3IsNewLeadReview, CompanyOsQualifiedLead: V3CompanyOsQualifiedLead, LeadActivityTimestamp: V3LeadActivityTimestamp, LeadReceivedTimestamp: V3LeadReceivedTimestamp, SortLeadsByActivity: V3SortLeadsByActivity, NewLeadReason: V3NewLeadReason, ResolveReplyTone: V3ResolveReplyTone, ReplyToneLabel: V3ReplyToneLabel, NewLeadSourceKind: V3NewLeadSourceKind, NewLeadSourceLabel: V3NewLeadSourceLabel, NewLeadHandle: V3NewLeadHandle, NewLeadSummary: V3NewLeadSummary, NewLeadPrimaryIdentity: V3NewLeadPrimaryIdentity, LeadMatchesQuery: V3LeadMatchesQuery, PrunePendingReplies: V3PrunePendingReplies, MergePendingReplies: V3MergePendingReplies, ReloadLeads: V3ReloadLeads, XLeadRepliedViaX: V3XLeadRepliedViaX, MarkRepliedViaX: V3MarkRepliedViaX };

V3LoadPricingTiers();
V3LoadTeamUsers();

window.dispatchEvent(new CustomEvent('v3:leads-loading'));
V3LoadSupabaseLeads().then(leads => {
  window.V3.LEADS = leads;
  window.dispatchEvent(new CustomEvent('v3:leads-loaded', { detail: { leads, ok: true } }));
}).catch(err => {
  console.error('Supabase load failed:', err);
  window.dispatchEvent(new CustomEvent('v3:leads-error', { detail: { error: err?.message || 'Load failed' } }));
});
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
      {V3XLeadRepliedViaX(lead) && (
        <div className="b-card-x-replied">
          <V3Icon name="network" w={12} />
          <span>Replied via X</span>
        </div>
      )}

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

  // AI drafting via local Qwen bridge (window.claude.complete)
  const aiDraft = async () => {
    if (!window.claude?.complete) {
      setDraftError('Local LLM bridge not loaded. Start scripts/active/local_llm_bridge.py on this Mac.');
      return;
    }
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

function V3InlineReply({ lead, user, onCollapse, layout = 'default' }) {
  const isGmail = layout === 'gmail';
  const isInline = isGmail || layout === 'inline' || layout === 'dock';
  const [sender, setSender] = React.useState(() => V3SenderForUser(user));
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
  const [aiDrafting, setAiDrafting] = React.useState(false);
  const [aiDraftError, setAiDraftError] = React.useState('');
  const [aiBridgeLabel, setAiBridgeLabel] = React.useState(() => (window.claude?.label ? window.claude.label() : 'Mac Studio'));
  const successTimer = React.useRef(null);
  const subject = V3SubjectForLead(lead);
  const draftTone = draft.tone || (window.V3ResolveReplyTone ? window.V3ResolveReplyTone(lead) : 'direct');
  const draftToneLabel = window.V3ReplyToneLabel ? window.V3ReplyToneLabel(draftTone) : draftTone;
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
    const nextSender = V3SenderForUser(user);
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

  React.useEffect(() => {
    if (!window.claude?.health) return;
    window.claude.health().then((data) => {
      if (data && window.claude?.label) setAiBridgeLabel(window.claude.label());
    }).catch(() => {});
  }, [lead.id]);

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

  const aiRedraft = async () => {
    if (!window.claude?.complete) {
      setAiDraftError('Local LLM bridge offline. Start scripts/active/local_llm_bridge.py on this Mac.');
      return;
    }
    setAiDrafting(true);
    setAiDraftError('');
    setError('');
    if (window.claude?.label) setAiBridgeLabel(window.claude.label());
    try {
      const tone = draftTone || (window.V3?.ResolveReplyTone ? window.V3.ResolveReplyTone(lead) : 'direct');
      const first = String(lead.contactName || 'there').split(/\s+/)[0] || 'there';
      const brand = lead.brand || 'the company';
      const nextAction = String(lead.operatorSummary?.next_action || lead.nextMove?.text || '').trim();
      const thread = (lead.thread || []).slice(-6).map(m => (
        `[${m.from || '?'}] ${m.subject || ''}\n${String(m.body || '').slice(0, 900)}`
      )).join('\n\n---\n\n');
      const senderName = V3SenderName(sender);
      const prompt = `Write an email reply for UNALIGNED sponsorship partnerships.

VOICE RULES:
- Never use hyphens or em dashes as punctuation. Use periods or commas instead.
- Sound like a real person. No AI filler, no corporate template voice.
- TONE: ${tone} (direct = brief business; friendship = warm rapport; long_standing = trust-based, skip cold intro)

Sender: ${senderName}
Contact first name: ${first}
Company: ${brand}
Subject: ${subject}
${nextAction ? `Operator next action: ${nextAction}` : ''}

Recent thread:
${thread.slice(0, 4200)}

Write ONLY the email body. Start with "Hi ${first},". Keep it concise. End with "Best," on its own line. Do not add a signature block.`;
      const out = await window.claude.complete(prompt, { max_tokens: 700 });
      setBody(V3EnsureSenderSignature(String(out || '').trim(), sender));
      if (window.claude?.label) setAiBridgeLabel(window.claude.label());
    } catch (err) {
      setAiDraftError(err.message || 'AI draft failed');
    } finally {
      setAiDrafting(false);
    }
  };

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
      await V3SendLeadEmail({ lead, sender, to: recipient, cc: ccLine, subject, body: msg, attachPdf });
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

  const bodyRef = React.useRef(null);
  const fitInlineBody = React.useCallback(() => {
    const el = bodyRef.current;
    if (!el || !isInline) return;
    el.style.height = 'auto';
    el.style.height = Math.max(240, el.scrollHeight) + 'px';
  }, [isInline]);

  React.useLayoutEffect(() => {
    fitInlineBody();
  }, [body, fitInlineBody, isInline]);

  const statusText = success || error || aiDraftError || (isSelfRecipient
    ? `${V3SenderName(sender)} is also a recipient. Remove them before sending.`
    : status === 'sent' ? 'Sent.'
      : (isInline ? '' : `Lead chain · sending as ${V3SenderName(sender)}${lead.gmailThreadId && sender === 'robert' ? ' in the Gmail thread' : ''}`));

  if (isGmail) {
    return (
      <div className="gmail-reply-box">
        <div className="gmail-reply-head">
          <span className="gmail-reply-icon" aria-hidden="true">
            <V3Icon name="reply" w={18} />
          </span>
          <div className="gmail-reply-meta">
            <div className="gmail-reply-to-line">
              <span className="gmail-reply-label">To</span>
              <span className="gmail-reply-value" title={toLine}>{toLine || 'Add recipient'}</span>
            </div>
            <select className="gmail-reply-from" value={sender} disabled={status === 'sending'} onChange={e => setSender(e.target.value)} title="Send as">
              <option value="robert">Robert Scoble</option>
              <option value="sam">Sam Levin</option>
              <option value="asher">Asher</option>
            </select>
          </div>
          {onCollapse && (
            <button className="gmail-reply-close" type="button" onClick={onCollapse} title="Discard reply" aria-label="Discard reply">
              <V3Icon name="x" w={14} />
            </button>
          )}
        </div>
        <textarea
          ref={bodyRef}
          className="gmail-reply-body"
          value={body}
          disabled={status === 'sending'}
          onChange={e => { setBody(e.target.value); fitInlineBody(); }}
          placeholder=""
          rows={8}
        />
        <div className="gmail-reply-bar">
          <button
            className={'gmail-reply-send ' + (status === 'sent' ? 'is-sent' : '')}
            type="button"
            onClick={send}
            disabled={status === 'sending'}
            aria-live="polite"
          >
            {status === 'sending' ? 'Sending…' : status === 'sent' ? 'Sent' : 'Send'}
          </button>
          <div className="gmail-reply-tools">
            <button className="gmail-reply-tool" type="button" disabled={status === 'sending' || aiDrafting} onClick={aiRedraft} title={'Draft with AI via ' + aiBridgeLabel}>
              <V3Icon name="spark" w={14} /> {aiDrafting ? 'Drafting…' : 'Draft with AI'}
            </button>
            <button className={'gmail-reply-tool ' + (internalOnly ? 'is-on' : '')} type="button" disabled={status === 'sending'} onClick={() => setInternalOnly(value => !value)} title="Talk internally only">
              Internal
            </button>
            <label className="gmail-reply-tool gmail-reply-tool-check">
              <input type="checkbox" checked={attachPdf} disabled={status === 'sending'} onChange={e => setAttachPdf(e.target.checked)} />
              PDF
            </label>
          </div>
          {statusText ? (
            <div className={'gmail-reply-status ' + (success ? 'is-success' : error || aiDraftError || isSelfRecipient ? 'is-error' : '')}>
              {statusText}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (isInline) {
    return (
      <div className="mail-compose mail-compose--gmail mail-compose--inline">
        <div className="mail-compose-inline-meta">
          <select className="mail-compose-sender" value={sender} disabled={status === 'sending'} onChange={e => setSender(e.target.value)} title="Sender">
            <option value="robert">Robert Scoble</option>
            <option value="sam">Sam Levin / UnalignedX</option>
            <option value="asher">Asher</option>
          </select>
          <div className="mail-compose-inline-to">
            <span className="mail-compose-inline-label">To</span>
            <span className="mail-compose-inline-value">{toLine || 'Add recipient'}</span>
          </div>
          {onCollapse && (
            <button className="mail-compose-collapse" type="button" onClick={onCollapse} title="Hide composer" aria-label="Hide composer">
              <V3Icon name="x" w={12} />
            </button>
          )}
        </div>
        <div className="mail-compose-editor mail-compose-editor--grow">
          <textarea
            ref={bodyRef}
            value={body}
            disabled={status === 'sending'}
            onChange={e => { setBody(e.target.value); fitInlineBody(); }}
            placeholder={`Reply to ${lead.contactName.split(' ')[0]}...`}
            rows={10}
          />
        </div>
        <div className="mail-compose-footer mail-compose-toolbar mail-compose-toolbar--gmail">
          <button
            className={'mail-compose-send ' + (status === 'sent' ? 'is-sent' : '')}
            onClick={send}
            disabled={status === 'sending'}
            aria-live="polite"
          >
            <V3Icon name={status === 'sent' ? 'check' : 'send'} w={12} /> {status === 'sending' ? 'Sending…' : status === 'sent' ? 'Sent' : 'Send'}
          </button>
          <div className="mail-compose-toolbar-tools">
            <button className="mail-compose-ai" type="button" disabled={status === 'sending' || aiDrafting} onClick={aiRedraft} title={'Draft with AI via ' + aiBridgeLabel}>
              <V3Icon name="spark" w={12} /> {aiDrafting ? 'Drafting…' : 'Draft with AI'}
            </button>
            <button className={'mail-compose-mode ' + (internalOnly ? 'is-active' : '')} type="button" disabled={status === 'sending'} onClick={() => setInternalOnly(value => !value)} title="Talk internally only">
              <V3Icon name="mail" w={12} /> Internal
            </button>
            <label className="mail-compose-attach">
              <input type="checkbox" checked={attachPdf} disabled={status === 'sending'} onChange={e => setAttachPdf(e.target.checked)} />
              PDF
            </label>
          </div>
          {statusText ? (
            <div className={'mail-compose-status ' + (success ? 'is-success' : error || aiDraftError || isSelfRecipient ? 'is-error' : '')}>
              {statusText}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="mail-compose">
      <div className="mail-compose-topbar">
        <select className="mail-compose-sender" value={sender} disabled={status === 'sending'} onChange={e => setSender(e.target.value)} title="Sender">
          <option value="robert">Robert Scoble</option>
          <option value="sam">Sam Levin / UnalignedX</option>
          <option value="asher">Asher</option>
        </select>
        <span className="mail-compose-tone" title="Operator tone for this thread">{draftToneLabel}</span>
        <button className="mail-compose-ai" type="button" disabled={status === 'sending' || aiDrafting} onClick={aiRedraft} title={'Regenerate via ' + aiBridgeLabel + ' (Qwen, ~15s)'}>
          <V3Icon name="spark" w={12} /> {aiDrafting ? ('Drafting on ' + aiBridgeLabel + '…') : ('Draft with AI · ' + aiBridgeLabel)}
        </button>
        <button className={'mail-compose-mode ' + (internalOnly ? 'is-active' : '')} type="button" disabled={status === 'sending'} onClick={() => setInternalOnly(value => !value)} title="Send only to Robert, Sam, and Asher">
          <V3Icon name="mail" w={12} /> {internalOnly ? 'Internal email chain' : 'Talk internally'}
        </button>
        {onCollapse && (
          <button className="mail-compose-collapse" type="button" onClick={onCollapse} title="Hide composer" aria-label="Hide composer">
            <V3Icon name="chev_d" w={12} />
          </button>
        )}
      </div>
      <div className="mail-compose-fields">
        <RecipientChips label="To" list={to} field="to" draft={toDraft} setDraft={setToDraft} />
        {!internalOnly && <RecipientChips label="Cc" list={cc} field="cc" draft={ccDraft} setDraft={setCcDraft} />}
        <div className="mail-compose-subject-row">
          <span>Subject</span>
          <input value={subject} readOnly disabled title="Subject" />
        </div>
      </div>
      <div className="mail-compose-editor">
        <textarea
          value={body}
          disabled={status === 'sending'}
          onChange={e => setBody(e.target.value)}
          placeholder={`Reply to ${lead.contactName.split(' ')[0]}...`}
        />
      </div>
      <div className="mail-compose-footer mail-compose-toolbar">
        <button
          className={'mail-compose-send ' + (status === 'sent' ? 'is-sent' : '')}
          onClick={send}
          disabled={status === 'sending'}
          aria-live="polite"
        >
          <V3Icon name={status === 'sent' ? 'check' : 'send'} w={12} /> {status === 'sending' ? 'Sending…' : status === 'sent' ? 'Sent' : 'Send'}
        </button>
        <label className="mail-compose-attach">
          <input
            type="checkbox"
            checked={attachPdf}
            disabled={status === 'sending'}
            onChange={e => setAttachPdf(e.target.checked)}
          />
          Attach SINGLE TIER.pdf
        </label>
        {statusText ? (
          <div className={'mail-compose-status ' + (success ? 'is-success' : error || aiDraftError || isSelfRecipient ? 'is-error' : '')}>
            {statusText}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function V3Stands({ lead }) {
  const hasDealRead = !!(lead.dealState || lead.dealEvidence || lead.dealNextAction || lead.needsHumanRead);
  return (
    <>
      <div className="standstrip-hd">
        <div className="standstrip-title">Where this stands</div>
        <span className="standstrip-pulse">Step {lead.progress + 1} of {window.V3.ACTIVE_STAGE_IDS.length}</span>
      </div>

      {hasDealRead && (
        <div className="deal-tracker-read" style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 6 }}>Deal Tracker read</div>
          {lead.dealState && <div><strong>State:</strong> {lead.dealState}{lead.dealConfidence ? ` · ${lead.dealConfidence} confidence` : ''}</div>}
          {lead.dealAwaiting && <div><strong>Awaiting:</strong> {lead.dealAwaiting}</div>}
          {lead.dealNextAction && <div><strong>Next:</strong> {lead.dealNextAction}</div>}
          {lead.dealEvidence && <div style={{ marginTop: 6, fontStyle: 'italic', color: 'var(--text-secondary)' }}>"{lead.dealEvidence}"</div>}
          {lead.needsHumanRead && <div style={{ marginTop: 6, color: 'var(--accent)' }}>Needs your read before auto-draft</div>}
          {lead.readyToInvoice && <div style={{ marginTop: 4 }}>Ready to invoice</div>}
        </div>
      )}

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

function V3GmailThread({ lead }) {
  const messages = React.useMemo(() => {
    const source = Array.isArray(lead?.thread) ? lead.thread : [];
    return [...source].sort((a, b) =>
      V3TimestampForUi(a.date || a.dateIso || a.timestamp || a.when) -
      V3TimestampForUi(b.date || b.dateIso || b.timestamp || b.when)
    );
  }, [lead?.id, lead?.thread]);
  const lastIdx = Math.max(0, messages.length - 1);
  const [expanded, setExpanded] = React.useState(() => new Set([lastIdx]));
  React.useEffect(() => {
    setExpanded(new Set([Math.max(0, messages.length - 1)]));
  }, [lead?.id, messages.length]);

  const toggle = (idx) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  if (!messages.length) {
    return <div className="gmail-thread-empty">No messages in this thread yet.</div>;
  }

  return (
    <div className="gmail-thread">
      {messages.map((m, i) => {
        const senderEmail = V3ExtractEmail(m.from) ||
          (m.from === 'Asher' ? 'asherunaligned@gmail.com' :
           m.from === 'Sammy' ? 'unalignedx@gmail.com' :
           m.from === 'Robert' ? 'scobleizer@gmail.com' : '');
        const dateValue = m.date || m.dateIso || m.timestamp || m.when;
        const isOpen = expanded.has(i);
        const preview = String(m.body || '').replace(/\s+/g, ' ').trim().slice(0, 120);
        return (
          <article key={i} className={'gmail-msg' + (isOpen ? ' is-open' : ' is-collapsed')}>
            <button type="button" className="gmail-msg-hd" onClick={() => toggle(i)} aria-expanded={isOpen}>
              <V3Avatar name={m.from} color={m.from === 'Sammy' ? '#16894a' : m.from === 'Asher' ? '#2f5fd6' : lead.color} size="sm" />
              <div className="gmail-msg-who">
                <span className="gmail-msg-name">{m.from || 'Unknown'}</span>
                {!isOpen && preview ? <span className="gmail-msg-snippet">{preview}</span> : null}
                {isOpen && senderEmail ? <span className="gmail-msg-email">&lt;{senderEmail}&gt;</span> : null}
              </div>
              <div className="gmail-msg-when">
                <span className="gmail-msg-date">{window.V3.GmailTime.full(dateValue) || m.when || ''}</span>
                {window.V3.GmailTime.relative(dateValue) ? <span className="gmail-msg-rel">{window.V3.GmailTime.relative(dateValue)}</span> : null}
              </div>
              <span className="gmail-msg-chev" aria-hidden="true">
                <V3Icon name="chev_d" w={14} style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }} />
              </span>
            </button>
            {isOpen ? (
              <div className="gmail-msg-body">
                {(m.to?.length || m.cc?.length) ? (
                  <div className="gmail-msg-rcpts">
                    {m.to?.length ? <span>to {m.to.join(', ')}</span> : null}
                    {m.cc?.length ? <span>cc {m.cc.join(', ')}</span> : null}
                  </div>
                ) : null}
                <div className="gmail-msg-text">{m.body}</div>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
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

function V4AgentTone(active, blocked) {
  if (blocked) return 'blocked';
  if (active > 0) return 'active';
  return 'clear';
}

function V4AgentViewItems(leads, fn, limit = 4) {
  return leads.filter(fn).slice(0, limit);
}

function V4AgentCapsuleSummary(lead) {
  if (!lead) return 'Review thread';
  const primary = String(
    lead.nextMove?.text ||
    lead.deliverables ||
    lead.operatorSummary?.next_action ||
    lead.operatorSummary?.lead_summary ||
    lead.notes ||
    lead.evidence ||
    lead.summary ||
    ''
  ).replace(/\s+/g, ' ').trim();
  if (!primary) return 'Review thread';
  if (primary.length <= 88) return primary;
  return primary.slice(0, 85).trim() + '...';
}

function V4AgentCapsuleMeta(lead) {
  const stage = String(lead?.stage || '').toLowerCase();
  if (lead?.unread || lead?.needsReply) return 'Needs reply';
  if (lead?.followUpDue) return 'Follow up due';
  if (stage === 'invoice-sent') return 'Payment check';
  if (stage === 'done') return 'Brief ready';
  if (stage === 'negotiating') return 'Negotiation';
  if (stage === 'rates-sent') return 'Pricing';
  if (String(lead?.source || '').toLowerCase().includes('x')) return 'X lead';
  return 'Live thread';
}

function V4WorkerPortrait({ worker, compact = false }) {
  const size = compact ? 52 : 74;
  const eyeY = compact ? 21 : 29;
  const bodyY = compact ? 28 : 38;
  const mouthY = compact ? 32 : 43;
  const variant = worker.id;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className="worker-portrait" aria-hidden="true">
      <defs>
        <radialGradient id={`glow-${variant}`} cx="28%" cy="22%" r="76%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.9)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>
      <rect x="10" y="12" width="80" height="76" rx="24" className="worker-portrait-body" />
      <ellipse cx="39" cy={eyeY} rx="4.5" ry="6.5" className="worker-portrait-eye" />
      <ellipse cx="61" cy={eyeY} rx="4.5" ry="6.5" className="worker-portrait-eye" />
      <path d={`M39 ${mouthY} C45 ${mouthY + 5}, 55 ${mouthY + 5}, 61 ${mouthY}`} className="worker-portrait-mouth" />
      <rect x="22" y={bodyY} width="56" height="18" rx="9" className="worker-portrait-belly" />
      {worker.id === 'pricing' && <path d="M24 17 L50 8 L76 17 L68 26 L32 26 Z" className="worker-portrait-crown" />}
      {worker.id === 'brief' && <path d="M26 18 C34 8, 66 8, 74 18 L74 26 L26 26 Z" className="worker-portrait-hair" />}
      {worker.id === 'xwatch' && <path d="M22 24 C30 10, 70 10, 78 24" className="worker-portrait-wave" />}
      {worker.id === 'finance' && <path d="M26 16 L74 16 L64 28 L36 28 Z" className="worker-portrait-alert" />}
      {worker.id === 'calendar' && <rect x="30" y="10" width="40" height="14" rx="7" className="worker-portrait-cap" />}
      {worker.id === 'handoff' && <path d="M24 18 C38 12, 62 12, 76 18" className="worker-portrait-brow" />}
      <circle cx="34" cy="66" r="4" className="worker-portrait-dot" />
      <circle cx="50" cy="66" r="4" className="worker-portrait-dot" />
      <circle cx="66" cy="66" r="4" className="worker-portrait-dot" />
      <circle cx="32" cy="24" r="30" fill={`url(#glow-${variant})`} opacity="0.55" />
    </svg>
  );
}

function V4WorkerActionLabel(worker) {
  const map = {
    intake: 'Routing new lead',
    reply: 'Drafting reply',
    pricing: 'Pricing thread',
    brief: 'Building Robert brief',
    calendar: 'Locking go-live date',
    finance: 'Chasing payment proof',
    followup: 'Follow-up nudge',
    xwatch: 'X intake watch',
    network: 'Relationship upkeep',
    handoff: 'Robert/Sam handoff',
  };
  return map[worker.id] || worker.subtitle || 'Working queue';
}

function V4LiveTaskFloor({ groupedWorkers, totalActive, liveWorkers, onOpenLead }) {
  const liveTasks = React.useMemo(() => {
    const rows = [];
    groupedWorkers.forEach((group) => {
      group.workers.forEach((worker) => {
        worker.items.forEach((item) => {
          rows.push({
            id: `${worker.id}-${item.id}`,
            leadId: item.id,
            workerId: worker.id,
            workerName: worker.name,
            workerGlyph: worker.glyph,
            zone: group.zone,
            zoneLabel: group.label,
            accent: worker.accent,
            tone: worker.tone,
            brand: item.brand || item.contactName || 'Unknown lead',
            contact: item.contactName || item.email || '',
            action: V4AgentCapsuleSummary(item),
            meta: V4AgentCapsuleMeta(item),
            blocked: worker.blocked > 0,
          });
        });
      });
    });
    return rows;
  }, [groupedWorkers]);

  const [focusIdx, setFocusIdx] = React.useState(0);
  React.useEffect(() => {
    if (!liveTasks.length) {
      setFocusIdx(0);
      return undefined;
    }
    const timer = setInterval(() => {
      setFocusIdx((i) => (i + 1) % liveTasks.length);
    }, 3200);
    return () => clearInterval(timer);
  }, [liveTasks.length]);

  const focusTask = liveTasks[focusIdx] || null;

  return (
    <div className="live-task-floor">
      <div className="live-task-floor-head">
        <div>
          <div className="live-task-floor-eyebrow">Live queue</div>
          <div className="live-task-floor-title">
            {liveTasks.length
              ? `${liveTasks.length} real tasks assigned across ${liveWorkers} workers`
              : 'All lanes clear — no live queue pressure'}
          </div>
        </div>
        <div className="live-task-floor-stats">
          <span className="live-task-stat">{totalActive} in motion</span>
          <span className="live-task-stat is-live">{liveWorkers} workers on duty</span>
        </div>
      </div>

      {focusTask && (
        <button
          type="button"
          className={`live-task-spotlight accent-${focusTask.accent} is-${focusTask.tone}`}
          onClick={() => onOpenLead?.(focusTask.leadId)}
        >
          <span className="live-task-spotlight-kicker">Now handling</span>
          <strong>{focusTask.workerName}</strong>
          <span className="live-task-spotlight-arrow">→</span>
          <strong>{focusTask.brand}</strong>
          <span className="live-task-spotlight-action">{focusTask.action}</span>
          <span className="live-task-spotlight-meta">{focusTask.meta} · {focusTask.zoneLabel}</span>
        </button>
      )}

      <div className="live-task-zones">
        {groupedWorkers.map((group) => (
          <section key={group.zone} className={`live-task-zone zone-${group.zone}`}>
            <header className="live-task-zone-head">
              <span>{group.label}</span>
              <b>{group.workers.reduce((sum, w) => sum + w.active, 0)}</b>
            </header>
            <div className="live-task-zone-body">
              {group.workers.map((worker) => (
                <article
                  key={worker.id}
                  className={`live-task-station accent-${worker.accent} is-${worker.tone} ${worker.active > 0 ? 'has-work' : ''}`}
                >
                  <div className="live-task-station-head">
                    <span className="live-task-station-glyph">{worker.glyph}</span>
                    <div>
                      <div className="live-task-station-name">{worker.name}</div>
                      <div className="live-task-station-verb">{V4WorkerActionLabel(worker)}</div>
                    </div>
                    <span className={`live-task-station-badge is-${worker.tone}`}>
                      {worker.blocked > 0 ? 'blocked' : worker.active > 0 ? 'working' : 'idle'}
                    </span>
                  </div>
                  {worker.items.length ? (
                    <div className="live-task-station-queue">
                      {worker.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="live-task-chip"
                          onClick={() => onOpenLead?.(item.id)}
                        >
                          <span className="live-task-chip-brand">{item.brand || item.contactName}</span>
                          <span className="live-task-chip-action">{V4AgentCapsuleSummary(item)}</span>
                          <span className="live-task-chip-meta">{V4AgentCapsuleMeta(item)}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="live-task-station-empty">{worker.note}</div>
                  )}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      {liveTasks.length > 0 && (
        <div className="live-task-feed" aria-live="polite">
          <div className="live-task-feed-label">Task rotation</div>
          <div className="live-task-feed-track">
            {liveTasks.map((task, index) => (
              <button
                key={task.id}
                type="button"
                className={`live-task-feed-item accent-${task.accent} ${index === focusIdx ? 'is-focus' : ''}`}
                onClick={() => { setFocusIdx(index); onOpenLead?.(task.leadId); }}
              >
                <span className="live-task-feed-worker">{task.workerName}</span>
                <span className="live-task-feed-brand">{task.brand}</span>
                <span className="live-task-feed-action">{task.action}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Machine Room — approval console. Consolidated queue of everything
// waiting on a human, grouped by gate. Built on the apr-* shell in
// styles.css. Binds the status light / counters / halt bar to the
// ops_health row. Approve marks ready; it never sends.
// ─────────────────────────────────────────────────────────────
function V4AprMoney(v) {
  if (v == null || v === '') return '';
  if (typeof V4CompanyOsMoney === 'function' && typeof v === 'number') return V4CompanyOsMoney(v);
  return String(v);
}
function V4AprNum(n) {
  const x = Number(n || 0);
  return x ? x.toLocaleString('en-US') : '0';
}
const V4_APR_AGENT = { replies: 'Deal Desk', payments: 'Finance', briefs: 'Brief Maker', posts: 'Calendar' };

async function V4CopyRobertReviewLink() {
  const token = String(window.localStorage.getItem('v4_brief_api_token') || '').trim();
  const url = 'https://mac-studio.tail50d3a2.ts.net/robert-review.html' + (token ? ('?token=' + encodeURIComponent(token)) : '');
  try {
    await navigator.clipboard.writeText(url);
  } catch (err) {
    window.prompt('Copy Robert review link:', url);
  }
  return url;
}

// ── Shared approval logic (used by BOTH the Machine Room console and the Organs view) ──
// The four gates, computed from the live board. One source of truth; Organs and the
// console both render from this, so the queues never drift.
function V4TeamRepliedLast(lead) {
  const thread = Array.isArray(lead?.thread) ? lead.thread : [];
  if (!thread.length) return false;
  const latest = thread[thread.length - 1] || {};
  if (V3IsTeamParticipant(latest.from)) return true;
  const body = String(latest.body || latest.snippet || '').toLowerCase();
  return /\b(all the best,\s*asher|best,\s*asher|thanks robert for looping me in|robert has looped me in|i handle the business side)\b/.test(body);
}

function V4AprComputeGates(leads, query) {
  const q = String(query || '').trim().toLowerCase();
  const live = (Array.isArray(leads) ? leads : []).filter(l =>
    l && !['trash', 'dead-leads'].includes(String(l.stage || '').toLowerCase()));
  const matchesQ = (l) => !q || [l.brand, l.contactName, l.deliverables, l.agentTier]
    .some(s => String(s || '').toLowerCase().includes(q));
  const replies = live.filter(l =>
    String(l.draftReplyStatus || '').toLowerCase() === 'pending' &&
    l.draftReply && String(l.draftReply.body || '').trim() &&
    !V4TeamRepliedLast(l) &&
    !l.newReplyAt &&
    !(V3IsXLeadRecord(l) && !V3XLeadHasUsableContext(l))).filter(matchesQ);
  const payments = live.filter(l => String(l.stage || '').toLowerCase() === 'invoice-sent').filter(matchesQ);
  const briefs = live.filter(l =>
    String(l.briefStatus || '').toLowerCase().replace(/_/g, '-') === 'awaiting-robert').filter(matchesQ);
  const posts = live.filter(l => String(l.stage || '').toLowerCase() === 'done').filter(matchesQ);
  const sortRecent = (items) => [...items].sort(V3SortLeadsByActivity);
  return [
    { id: 'replies', label: 'Replies', items: sortRecent(replies), tag: '' },
    { id: 'payments', label: 'Payments', items: sortRecent(payments), tag: 'pay' },
    { id: 'briefs', label: 'Briefs', items: sortRecent(briefs), tag: 'brief' },
    { id: 'posts', label: 'Posts', items: sortRecent(posts), tag: '' },
  ];
}

function V4CosQueueForGate(gateId) {
  if (gateId === 'replies') return 'send';
  if (gateId === 'payments' || gateId === 'briefs' || gateId === 'posts') return 'chase';
  return 'watch';
}

function V4OpenLeadInCompanyOs(leadId, queueId, opts) {
  const q = queueId || 'send';
  try {
    window.sessionStorage.setItem('cos-queue', q);
    window.sessionStorage.setItem('cos-lead-id', String(leadId));
    if (opts && opts.compose) window.sessionStorage.setItem('cos-compose', '1');
    else window.sessionStorage.removeItem('cos-compose');
  } catch (e) {}
}
if (typeof window !== 'undefined') {
  window.V4CosQueueForGate = V4CosQueueForGate;
  window.V4OpenLeadInCompanyOs = V4OpenLeadInCompanyOs;
}

// The board write each gate's Approve/Deny performs. Reply approvals use
// V4SendApprovedReply so the button really sends from Asher.
function V4AprGateAction(g) {
  if (g === 'replies') return {
    approve: { fields: { draft_reply_status: 'approved' }, local: { draftReplyStatus: 'approved' } },
    deny: { fields: { draft_reply_status: '', draft_reply: null }, local: { draftReplyStatus: '', draftReply: null } },
  };
  if (g === 'payments') return {
    approve: { fields: { list_id: 'paid-out' }, local: { stage: 'paid-out' } },
    deny: { fields: {}, local: {} },
  };
  if (g === 'briefs') return {
    approve: { fields: { brief_status: 'approved' }, local: { briefStatus: 'approved' } },
    deny: { fields: { brief_status: 'edits_requested' }, local: { briefStatus: 'edits_requested' } },
  };
  return {
    approve: { fields: { list_id: 'paid-out' }, local: { stage: 'paid-out' } },
    deny: { fields: {}, local: {} },
  };
}

async function V4PatchLeadAsync(lead, fields, localPatch) {
  const id = lead?.rowId || lead?.id;
  if (!id) return;
  const res = await fetch(V3_SUPABASE_URL + '/rest/v1/cards?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH',
    headers: {
      apikey: V3_SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + V3_SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error('Board update failed: ' + await res.text());
  const updated = (window.V3.LEADS || []).map(item =>
    String(item.id) === String(lead.id) ? { ...item, ...localPatch } : item);
  window.V3.LEADS = updated;
  window.dispatchEvent(new CustomEvent('v3:leads-loaded', { detail: { leads: updated } }));
}

function V4IsRobertHandoffApproval(lead) {
  const source = String(lead?.source || '').toLowerCase();
  const draft = lead?.draftReply || {};
  return source.includes('robert imessage') || String(draft.kind || '').toLowerCase() === 'manual';
}

async function V4SendApprovedReply(lead, overrides = {}) {
  if (!lead) throw new Error('No lead selected.');
  if (V4IsRobertHandoffApproval(lead)) {
    const draft = overrides.body || overrides.subject
      ? { ...(lead.draftReply || {}), subject: overrides.subject || lead?.draftReply?.subject || '', body: overrides.body || lead?.draftReply?.body || '' }
      : (lead.draftReply || {});
    const res = await V4BriefServiceFetch('/send-robert-handoff', {
      method: 'POST',
      body: JSON.stringify({ lead, draft }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.error || 'Robert handoff send failed.');
    await V4PatchLeadAsync(lead,
      { draft_reply_status: 'sent', new_reply_at: null },
      { draftReplyStatus: 'sent', unread: false, needsReply: false });
    window.dispatchEvent(new CustomEvent('v3:email-sent', {
      detail: { leadId: lead.id, sender: 'robert', subject: data.draft?.subject || draft.subject || '', body: data.draft?.body || draft.body || '', to: data.draft?.to_emails || [], cc: data.draft?.cc_emails || [] },
    }));
    return { to: data.draft?.to_emails || [], cc: data.draft?.cc_emails || [], subject: data.draft?.subject || draft.subject || '' };
  }
  const sender = 'asher';
  const draftLead = overrides.body || overrides.subject
    ? { ...lead, draftReply: { subject: overrides.subject || lead?.draftReply?.subject || '', body: overrides.body || lead?.draftReply?.body || '' } }
    : lead;
  const draft = V3ComposeReplyDraft(draftLead, sender, { approvedSend: true });
  const recips = V3ReplyRecipients(lead, sender, false);
  const to = V3UniqueEmails(recips.to || []);
  if (!to.length) throw new Error('No outside recipient found. Open edit and add the lead email before sending.');
  const cc = V3UniqueEmails([...(recips.cc || []), ...V3InternalEmails(sender)])
    .filter(email => email.toLowerCase() !== to[0].toLowerCase())
    .filter(email => !V3SenderEmails(sender).map(x => x.toLowerCase()).includes(email.toLowerCase()));
  await V3SendLeadEmail({
    lead,
    sender,
    to: to[0],
    cc: cc.join(','),
    subject: draft.subject,
    body: draft.body,
    attachPdf: false,
  });
  await V4PatchLeadAsync(lead,
    { draft_reply_status: 'sent', new_reply_at: null },
    { draftReplyStatus: 'sent', unread: false, needsReply: false });
  window.dispatchEvent(new CustomEvent('v3:email-sent', {
    detail: { leadId: lead.id, sender, subject: draft.subject, body: draft.body, to, cc },
  }));
  return { to, cc, subject: draft.subject };
}

// Shared ops_health binding: polls the singleton row, exposes resume() + halt().
function V4UseOpsHealth() {
  const [health, setHealth] = React.useState(null);
  const reloadRef = React.useRef(() => {});
  React.useEffect(() => {
    let alive = true;
    const load = () => {
      fetch(V3_SUPABASE_URL + '/rest/v1/ops_health?id=eq.1&limit=1', {
        headers: { apikey: V3_SUPABASE_ANON_KEY, Authorization: 'Bearer ' + V3_SUPABASE_ANON_KEY },
      }).then(r => r.ok ? r.json() : []).then(rows => { if (alive) setHealth((rows && rows[0]) || null); })
        .catch(() => {});
    };
    reloadRef.current = load;
    load();
    const t = setInterval(load, 30000);
    const onRefresh = () => load();
    window.addEventListener('v4:refresh-complete', onRefresh);
    return () => { alive = false; clearInterval(t); window.removeEventListener('v4:refresh-complete', onRefresh); };
  }, []);
  const write = (fields, optimistic) => {
    fetch(V3_SUPABASE_URL + '/rest/v1/ops_health?id=eq.1', {
      method: 'PATCH',
      headers: { apikey: V3_SUPABASE_ANON_KEY, Authorization: 'Bearer ' + V3_SUPABASE_ANON_KEY,
        'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(fields),
    }).then(() => setHealth(h => ({ ...(h || {}), ...optimistic }))).catch(() => {});
  };
  const resume = () => write({ status: 'ok', halt_reason: '' }, { status: 'ok', halt_reason: '' });
  const halt = () => write({ status: 'halted', halt_reason: 'Halted from the dashboard' },
    { status: 'halted', halt_reason: 'Halted from the dashboard' });
  const reload = () => reloadRef.current();
  return { health, setHealth, resume, halt, reload };
}

function V4MachineRoomConsole({ leads = [], query = '', onOpenLead }) {
  const GATES = V4AprComputeGates(leads, query);
  const flat = GATES.flatMap(g => g.items.map(l => ({ gate: g.id, lead: l })));

  const [selKey, setSelKey] = React.useState(null);
  const [editing, setEditing] = React.useState(false);
  const [editBody, setEditBody] = React.useState('');
  const [editSubject, setEditSubject] = React.useState('');
  const [sendState, setSendState] = React.useState({ key: '', status: '', error: '' });
  const { health, resume } = V4UseOpsHealth();

  const current = flat.find(f => (f.gate + ':' + f.lead.id) === selKey) || flat[0] || null;
  const lead = current ? current.lead : null;
  const gate = current ? current.gate : null;
  const select = (g, l) => { setSelKey(g + ':' + l.id); setEditing(false); };

  const halted = !!(health && String(health.status || 'ok') !== 'ok');
  const haltReason = (health && health.halt_reason) || 'The operator is paused. Drafts are held until you resume.';

  const advance = () => {
    const idx = flat.findIndex(f => (f.gate + ':' + f.lead.id) === selKey);
    const next = flat[idx + 1] || flat[idx - 1] || null;
    setSelKey(next ? next.gate + ':' + next.lead.id : null);
  };

  const onApprove = async () => {
    if (!lead || !gate) return;
    const key = gate + ':' + lead.id;
    if (gate === 'replies') {
      setSendState({ key, status: 'sending', error: '' });
      try {
        await V4SendApprovedReply(lead);
        setSendState({ key, status: 'sent', error: '' });
        advance();
      } catch (err) {
        setSendState({ key, status: 'error', error: err.message || 'Send failed' });
      }
      return;
    }
    const a = V4AprGateAction(gate); V4CosPatchLead(lead, a.approve.fields, a.approve.local); advance();
  };
  const onDeny = () => { const a = V4AprGateAction(gate); V4CosPatchLead(lead, a.deny.fields, a.deny.local); advance(); };
  const startEdit = () => {
    const dr = lead.draftReply || {};
    setEditSubject(dr.subject || ''); setEditBody(dr.body || ''); setEditing(true);
  };
  const saveApprove = () => {
    const key = gate + ':' + lead.id;
    setSendState({ key, status: 'sending', error: '' });
    V4SendApprovedReply(lead, { subject: editSubject, body: editBody })
      .then(() => {
        setSendState({ key, status: 'sent', error: '' });
        setEditing(false);
        advance();
      })
      .catch(err => setSendState({ key, status: 'error', error: err.message || 'Send failed' }));
  };

  const oneLine = (l) => l.recommendedAction ||
    (l.agentAssessment ? String(l.agentAssessment).split(/(?<=[.!?])\s/)[0] : '') ||
    l.deliverables || l.stage || '';

  function whatBody(g, l) {
    if (g === 'replies') return (l.draftReply && l.draftReply.body) || '';
    if (g === 'briefs') return l.briefBody || l.briefSummary || (l.nextMove && l.nextMove.text) || '';
    if (g === 'payments') return 'Invoice is out for ' + (l.brand || 'this lead') + '. Confirm payment received, then mark paid.';
    return 'Approved post scheduled for ' + (l.brand || 'this lead') + '. Mark posted once it is live.';
  }

  return (
    <div className={'apr-console' + (halted ? ' is-halted' : '')} style={{ display: 'grid', gridTemplateRows: 'auto auto minmax(0,1fr)', flex: '1 1 0', minHeight: 0, height: '100%', overflow: 'hidden' }}>
      <div className="apr-top">
        <div>
          <div className="apr-eye">Machine Room</div>
          <h1 className="apr-title">Approvals <i>everything waiting on you</i></h1>
        </div>
        <div className="apr-counts">
          {GATES.map(g => <span className="apr-cpill" key={g.id}>{g.label} <b>{g.items.length}</b></span>)}
        </div>
        <div className="apr-sys">
          <div className="apr-light" title="Operator status">
            <span className="d"></span><span>{halted ? 'Halted' : 'Running'}</span>
          </div>
          <div className="apr-ctr">
            <span className="ck">Local · Qwen today</span>
            <span className="cv local">{health ? V4AprNum(health.local_tokens_today) : '—'}</span>
          </div>
          <div className="apr-ctr">
            <span className="ck">Claude 10% today</span>
            <span className="cv money">{health ? '$' + Number(health.claude_spend_today || 0).toFixed(2) : '—'}</span>
          </div>
        </div>
      </div>

      <div className="apr-haltbar">
        <span className="hi">⚠</span>
        <span className="ht"><b>Operator halted</b>{haltReason}</span>
        <button className="apr-resume" onClick={resume}>Resume</button>
      </div>

      <div className="apr-main" style={{ gridTemplateRows: 'minmax(0,1fr)', minHeight: 0 }}>
        <div className="apr-queue" style={{ minHeight: 0 }}>
          {GATES.map(g => (
            <React.Fragment key={g.id}>
              <div className="apr-grp">{g.label}<span className="gc">{g.items.length}</span></div>
              {g.items.map(l => {
                const key = g.id + ':' + l.id;
                const isOn = current && current.gate === g.id && String(current.lead.id) === String(l.id);
                return (
                  <button key={key} className={'apr-item' + (isOn ? ' is-on' : '')} onClick={() => select(g.id, l)}>
                    <div className="apr-r1">
                      <span className="apr-co">{l.brand || l.contactName || 'Lead'}</span>
                      {l.value ? <span className="apr-val">{V4AprMoney(l.value)}</span> : null}
                    </div>
                    <div className="apr-ln">{oneLine(l)}</div>
                    <span className={'apr-tag' + (g.tag ? ' ' + g.tag : '')}>◆ {V4_APR_AGENT[g.id]}</span>
                  </button>
                );
              })}
            </React.Fragment>
          ))}
          {flat.length === 0 && <div className="apr-grp">Queue clear<span className="gc">0</span></div>}
        </div>

        {lead && (
          <div className="apr-detail">
            <div className="apr-dh">
              <div className="apr-eye2">Approval / <b>{gate}</b></div>
              <h2>{lead.brand || lead.contactName}</h2>
              <div className="apr-chips">
                <span className="apr-chip">{lead.contactName || lead.email || '—'}</span>
                {lead.agentTier ? <span className="apr-chip t">{lead.agentTier}</span> : null}
                {lead.value ? <span className="apr-chip v">{V4AprMoney(lead.value)}</span> : null}
              </div>
            </div>

            <div className="apr-body">
              <div className="apr-blk">
                <div className="apr-lbl"><span className="apr-aib">◆ {V4_APR_AGENT[gate]}</span> What you're approving</div>
                {editing ? (
                  <div className="apr-what">
                    <input className="apr-sj" value={editSubject} onChange={e => setEditSubject(e.target.value)}
                      placeholder="Subject" style={{ width: '100%', font: 'inherit', border: '0', background: 'transparent', color: 'inherit', outline: 'none' }} />
                    <textarea value={editBody} onChange={e => setEditBody(e.target.value)} rows={14}
                      style={{ width: '100%', font: 'inherit', border: '0', background: 'transparent', color: 'inherit', outline: 'none', resize: 'vertical' }} />
                  </div>
                ) : (
                  <div className="apr-what">
                    {gate === 'replies' && lead.draftReply && lead.draftReply.subject &&
                      <div className="apr-sj">{lead.draftReply.subject}</div>}
                    {whatBody(gate, lead)}
                  </div>
                )}
              </div>

              {lead.agentAssessment && (
                <div className="apr-blk">
                  <div className="apr-lbl">Why it makes sense</div>
                  <div className="apr-why">{lead.agentAssessment}
                    {lead.recommendedAction && <span className="apr-ser"> — recommended: {lead.recommendedAction}.</span>}
                  </div>
                </div>
              )}

              <div className="apr-blk">
                <div className="apr-lbl">Tied to this</div>
                <div className="apr-rel">
                  <div><div className="k">Lead</div><div className="vv">{lead.brand || lead.contactName}</div></div>
                  <div><div className="k">Tier</div><div className="vv">{lead.agentTier || '—'}</div></div>
                  <div><div className="k">Value</div><div className="vv">{lead.value ? V4AprMoney(lead.value) : '—'}</div></div>
                  <div><div className="k">Stage</div><div className="vv">{lead.stage}</div></div>
                </div>
              </div>

              {gate === 'replies' && (
                <div className="apr-deny show">
                  <div className="apr-lbl">If you deny</div>
                  <p>The draft is cleared and {lead.brand || 'the lead'} stays at its current stage. Nothing is sent. The operator will not auto re-draft a card you have handled.</p>
                </div>
              )}
            </div>

            <div className="apr-bar">
              {sendState.error && (sendState.key === (gate + ':' + lead.id)) ? <span className="apr-sp err">{sendState.error}</span> : null}
              {editing ? (
                <React.Fragment>
                  <button className="apr-btn ap" onClick={saveApprove} disabled={sendState.status === 'sending'}>✓ Save &amp; send</button>
                  <button className="apr-btn ed" onClick={() => setEditing(false)}>Cancel</button>
                </React.Fragment>
              ) : (
                <React.Fragment>
                  <button className="apr-btn ap" onClick={onApprove} disabled={sendState.status === 'sending'}>✓ {gate === 'replies' ? 'Approve & send' : 'Approve'}</button>
                  {gate === 'replies' && <button className="apr-btn ed" onClick={startEdit}>✎ Edit &amp; approve</button>}
                  <button className="apr-btn dn" onClick={onDeny}>Deny</button>
                </React.Fragment>
              )}
              <span className="apr-sp">{gate === 'replies' ? (V4IsRobertHandoffApproval(lead) ? 'sends from Robert and CCs Asher and Sam' : 'sends from Asher and CCs Robert and Sam') : 'approval only for this gate'}</span>
            </div>
          </div>
        )}
        {!lead && (
          <div className="apr-detail">
            <div className="apr-body"><div className="apr-blk"><div className="apr-lbl">Queue clear</div>
              <div className="apr-why">Nothing is waiting on your approval right now.</div></div></div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Organs — the living pipeline. A second, prettier view over the SAME
// approval data + ops_health row the console uses (shared helpers, no
// duplicated logic). Built on the org-* shell in styles.css.
// ─────────────────────────────────────────────────────────────
const V4_ORG_ORDER = ['triage', 'deal_desk', 'tracker', 'brief_maker', 'qa'];
const V4_ORG_DEF = {
  triage: { name: 'Triage', glyph: '🔍', desc: 'Classify the lead, run the scam gate.', token: null },
  deal_desk: { name: 'Deal Desk', glyph: '◆', desc: 'Draft the reply at the live rate.', token: 'Reply Engines' },
  tracker: { name: 'Tracker', glyph: '📊', desc: 'Follow ups and payment chase.', token: null },
  brief_maker: { name: 'Brief Maker', glyph: '📝', desc: "Build Robert's brief.", token: null },
  qa: { name: 'QA', glyph: '✓', desc: 'Sold vs delivered, on go live.', token: null },
};

function V4OrgTimeAgo(value) {
  if (!value) return 'never';
  const ms = Date.now() - Date.parse(value);
  if (!Number.isFinite(ms)) return 'unknown';
  if (ms < 60000) return 'just now';
  if (ms < 3600000) return Math.max(1, Math.round(ms / 60000)) + 'm ago';
  if (ms < 86400000) return Math.max(1, Math.round(ms / 3600000)) + 'h ago';
  return Math.max(1, Math.round(ms / 86400000)) + 'd ago';
}

function V4OrgIsStale(value, minutes) {
  if (!value) return true;
  const ms = Date.now() - Date.parse(value);
  return !Number.isFinite(ms) || ms > minutes * 60000;
}

function V4OrgLeadLine(lead) {
  if (!lead) return 'Nothing selected';
  const who = lead.contactName || lead.sender || lead.email || lead.handle || '';
  const source = lead.source || lead.channel || '';
  return [lead.brand || lead.name || 'Lead', who, source].filter(Boolean).join(' · ');
}

function V4OrgApprovalBody(gate, lead) {
  if (!lead) return '';
  if (gate === 'replies') {
    const dr = lead.draftReply || {};
    const stored = String(dr.body || '').trim();
    if (stored) return V3FinalizeApprovedDraftBody(stored, lead, 'asher');
    return dr.subject || lead.lastMessage || lead.summary || '';
  }
  if (gate === 'payments') return 'Invoice is out. Confirm payment proof before the work moves into the live posting lane.';
  if (gate === 'briefs') return lead.briefBody || lead.briefSummary || 'Brief is waiting for Robert sign off before this can be scheduled.';
  if (gate === 'posts') return 'Marked done. Confirm it is actually paid and posted before closing the loop.';
  return lead.summary || lead.lastMessage || '';
}

function V4OrgApprovalWhy(gate, lead) {
  if (!lead) return 'No approval selected.';
  if (gate === 'replies') return 'Reply draft is ready, but it needs your approval before anything leaves Robert.';
  if (gate === 'payments') return 'Finance loop needs a human check so unpaid work does not get posted by mistake.';
  if (gate === 'briefs') return 'Brief Maker finished the prep. Robert needs the clean doc before go live.';
  if (gate === 'posts') return 'QA is asking for final confirmation that sold, paid, and delivered all match.';
  return 'This item is waiting because an agent could not safely move it alone.';
}

function V4OrgLatestInbound(lead) {
  const thread = Array.isArray(lead?.thread) ? lead.thread : [];
  for (let i = thread.length - 1; i >= 0; i -= 1) {
    const msg = thread[i] || {};
    if (!V4OrgLooksLikeTeamMessage(msg)) return msg;
  }
  return null;
}

function V4OrgLatestTeamTouch(lead) {
  const thread = Array.isArray(lead?.thread) ? lead.thread : [];
  for (let i = thread.length - 1; i >= 0; i -= 1) {
    const msg = thread[i] || {};
    if (V4OrgLooksLikeTeamMessage(msg)) return msg;
  }
  return null;
}

function V4OrgLooksLikeTeamMessage(msg) {
  const from = String(msg?.from || '').toLowerCase();
  const body = String(msg?.body || msg?.snippet || '').toLowerCase();
  if (V3IsTeamParticipant(from)) return true;
  if (/\b(asherunaligned@gmail\.com|scobleizer@gmail\.com|unalignedx@gmail\.com|samlevin@mac\.com)\b/.test(from)) return true;
  if (/\b(all the best,\s*asher|best,\s*asher|thanks robert for looping me in|robert has looped me in|i handle the business side)\b/.test(body)) return true;
  return false;
}

function V4OrgShortEmail(value) {
  const text = String(value || '').replace(/"/g, '').trim();
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (email) return email[0];
  return text.replace(/\s*<[^>]+>\s*/g, '').trim() || 'Unknown sender';
}

function V4OrgApprovalContext(lead) {
  const inbound = V4OrgLatestInbound(lead);
  const team = V4OrgLatestTeamTouch(lead);
  const threadBody = inbound ? String(inbound.body || inbound.snippet || '').trim() : '';
  if (V3IsXLeadRecord(lead)) {
    const xBody = String(
      lead.evidence || lead.xLastLeadMessage || lead.notes || lead.xLastRobertMessage || ''
    ).trim();
    const handle = String(lead.xHandle || '').replace(/^@/, '').trim();
    return {
      inbound,
      team,
      body: threadBody || xBody || lead?.operatorSummary?.asked_for || '',
      sender: handle ? ('@' + handle) : (V3XLeadDisplayName(lead.contactName, '') || lead?.email || 'X DM lead'),
      subject: lead.deliverables || lead.brand || 'X DM',
      when: lead.lastTouch || inbound?.when || (inbound?.date ? V3RelativeTime(inbound.date) : ''),
      teamWhen: team?.when || (team?.date ? V3RelativeTime(team.date) : ''),
    };
  }
  return {
    inbound,
    team,
    body: threadBody || lead?.operatorSummary?.asked_for || lead?.notes || lead?.deliverables || '',
    sender: inbound ? V4OrgShortEmail(inbound.from) : (lead?.contactName || lead?.email || 'Unknown sender'),
    subject: inbound?.subject || lead?.draftReply?.subject || lead?.briefSubject || lead?.brand || 'Conversation',
    when: inbound?.when || (inbound?.date ? V3RelativeTime(inbound.date) : ''),
    teamWhen: team?.when || (team?.date ? V3RelativeTime(team.date) : ''),
  };
}

function V4PlaintextForCopilot(text) {
  return V4CleanDisplayText(String(text || '').replace(/<[^>]+>/g, ' '));
}

function V4BuildCopilotFocusFromOrgans(gateId, lead) {
  if (!lead || !gateId) return null;
  const GATE_TITLE = { replies: 'Reply gate', payments: 'Payment gate', briefs: 'Brief gate', posts: 'Post gate' };
  const context = gateId === 'replies' ? V4OrgApprovalContext(lead) : null;
  const conflict = gateId === 'replies' ? V4OrgApprovalConflict(lead, context) : '';
  const draftBody = gateId === 'replies'
    ? V4PlaintextForCopilot(lead.draftReply?.body || V4OrgApprovalBody(gateId, lead) || '')
    : V4PlaintextForCopilot(V4OrgApprovalBody(gateId, lead) || '');
  return {
    surface: 'organs',
    view: 'organs',
    gate: gateId,
    gateLabel: GATE_TITLE[gateId] || gateId,
    leadId: lead.id,
    brand: lead.brand || lead.contactName || 'Lead',
    contactName: lead.contactName || '',
    stage: lead.stage || '',
    email: lead.email || '',
    source: lead.source || '',
    xOpenDm: lead.xOpenDm || '',
    repliedViaX: typeof V3XLeadRepliedViaX === 'function' ? V3XLeadRepliedViaX(lead) : false,
    why: V4OrgApprovalWhy(gateId, lead),
    conflict: conflict || null,
    inbound: context ? {
      from: context.sender,
      subject: V4PlaintextForCopilot(context.subject),
      when: context.when || '',
      body: V4PlaintextForCopilot(context.body).slice(0, 2200),
    } : null,
    draft: gateId === 'replies' ? {
      subject: V4PlaintextForCopilot(lead.draftReply?.subject || ''),
      body: draftBody.slice(0, 2800),
      status: lead.draftReplyStatus || '',
    } : { body: draftBody.slice(0, 2800), status: lead.draftReplyStatus || '' },
    agentAssessment: lead.agentAssessment || '',
    recommendedAction: lead.recommendedAction || '',
    nextMove: (lead.nextMove && lead.nextMove.text) || '',
    value: lead.value || null,
    thread: Array.isArray(lead.thread) ? lead.thread.slice(-5).map(m => ({
      from: V4PlaintextForCopilot(m.from),
      subject: V4PlaintextForCopilot(m.subject),
      body: V4PlaintextForCopilot(m.body).slice(0, 700),
    })) : [],
    notes: V4PlaintextForCopilot(lead.notes || lead.operatorSummary?.lead_summary || '').slice(0, 1200),
  };
}

function V4SetCopilotFocus(payload) {
  window.__v4CopilotFocus = payload || null;
  window.dispatchEvent(new CustomEvent('v4:copilot-focus', { detail: payload || null }));
}

function V4ClearCopilotFocus(surface) {
  const current = window.__v4CopilotFocus;
  if (surface && current && current.surface !== surface) return;
  window.__v4CopilotFocus = null;
  window.dispatchEvent(new CustomEvent('v4:copilot-focus', { detail: null }));
}

function V4OrgApprovalConflict(lead, context) {
  const draft = String(lead?.draftReply?.body || '').toLowerCase();
  const inbound = String(context?.body || '').toLowerCase();
  const pricingDraft = /\b(rate|pricing|payment terms|send the invoice|send over the invoice|move forward|quote)\b/.test(draft);
  const paymentChaseDraft = /\b(not received payment|have not received payment|haven't received payment|payment.*not.*received|invoice.*not.*paid|issues holding this up|holding this up)\b/.test(draft);
  const paidOrExecution = /\b(payment has been processed|payment processed|payment'?s already cleared|payment has cleared|payment cleared|receipt tomorrow|send the receipt|paid|should reach you|brief with more details|launch is on|launch date|go live|posting window|already paid|live link|wrong tag|correct tag|no worries, thanks for the post)\b/.test(inbound);
  if (pricingDraft && paidOrExecution) {
    return 'Possible stale draft. The inbound message already talks about payment, timing, or brief details, but the proposed reply still sounds like fresh pricing.';
  }
  if (paymentChaseDraft && paidOrExecution) {
    return 'Possible stale draft. The inbound message says payment cleared, receipt is coming, or execution already moved forward, but the proposed reply still chases unpaid invoice status.';
  }
  const existingPackage = /\b(monthly package|four posts|4 posts|[1-4]\s*\/\s*4|not been completed|continue the collaboration|originally part of the agreement)\b/.test(inbound);
  if (pricingDraft && existingPackage) {
    return 'Possible stale draft. This looks like existing package execution, not a new rate request.';
  }
  return '';
}

const V4_ORG_GATE_PRIORITY = { replies: 0, payments: 1, briefs: 2, posts: 3 };
const V4_ORG_GATE_HANDOFF_AGENT = { replies: 'Reply Operator', payments: 'Finance Loop', briefs: 'Brief Maker', posts: 'QA Runner' };

function V4OrgUnifiedLine(lead, gateId) {
  const raw = lead?.operatorSummary?.next_action
    || lead?.recommendedAction
    || (lead?.agentAssessment ? String(lead.agentAssessment).split(/(?<=[.!?])\s/)[0] : '')
    || lead?.nextMove?.text
    || '';
  const cleaned = V4CleanDisplayText(String(raw).replace(/\s+/g, ' ').trim());
  if (cleaned) return cleaned.length <= 120 ? cleaned : cleaned.slice(0, 117).trim() + '…';
  return V4OrgApprovalWhy(gateId, lead);
}

function V4OrgDecisionScore(gateId, lead) {
  let score = (4 - (V4_ORG_GATE_PRIORITY[gateId] ?? 9)) * 1000;
  if (String(lead?.draftReplyStatus || '').toLowerCase() === 'review') score += 500;
  if (lead?.unread || lead?.needsReply) score += 220;
  score += Math.min(lead?.daysInStage || 0, 30) * 6;
  score += Math.min((lead?.value || 0) / 80, 60);
  if (gateId === 'payments') score += 180;
  if (gateId === 'briefs' && String(lead?.briefStatus || '').includes('robert')) score += 120;
  return score;
}

function V4OrgBuildTodayDecisions(gates) {
  const items = [];
  (gates || []).forEach((g) => {
    (g.items || []).forEach((lead) => {
      items.push({
        gateId: g.id,
        gateLabel: g.label,
        lead,
        score: V4OrgDecisionScore(g.id, lead),
      });
    });
  });
  return items.sort((a, b) => b.score - a.score);
}

function V4OrgPostApproveHandoff(lead, gateId) {
  const agent = V4_ORG_GATE_HANDOFF_AGENT[gateId] || 'Operator';
  let message = '';
  const stage = String(lead?.stage || '').toLowerCase();

  if (gateId === 'replies') {
    if (['new', 'first-touch'].includes(stage) && window.V3?.MoveLeadStage) {
      window.V3.MoveLeadStage(lead, 'engaged');
      message = 'Sent · moved to engaged · ' + agent + ' watching for reply';
    } else if (['rates-sent', 'negotiating', 'invoice-sent'].includes(stage)) {
      message = 'Sent · ' + agent + ' will nudge if they go quiet';
    } else {
      message = 'Sent · handed back to ' + agent;
    }
  } else if (gateId === 'payments') {
    message = 'Marked paid · Finance Loop closed this lane';
  } else if (gateId === 'briefs') {
    message = 'Brief approved · Brief Maker queued Robert handoff';
  } else if (gateId === 'posts') {
    message = 'Post cleared · QA Runner archived payout';
  } else {
    message = 'Approved · ' + agent + ' has the lane';
  }

  try {
    window.dispatchEvent(new CustomEvent('v4:org-handoff', {
      detail: { leadId: lead?.id, gateId, message, agent, brand: lead?.brand || 'Lead' },
    }));
  } catch (e) {}
  return message;
}

function V4OrgEditModal({ gate, lead, onClose }) {
  const { useState, useEffect } = React;
  const dr = (lead && lead.draftReply) || {};
  const editable = gate === 'replies' || gate === 'briefs';
  const initialBody = gate === 'replies' ? (dr.body || '')
    : gate === 'briefs' ? (lead.briefBody || lead.briefSummary || '') : '';
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(initialBody);
  const [subject, setSubject] = useState(dr.subject || '');
  const [sendState, setSendState] = useState({ status: '', error: '' });

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose && onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const GATE_NAME = { replies: 'Reply', payments: 'Payment', briefs: 'Brief', posts: 'Post' };
  const close = () => onClose && onClose();
  const approve = async () => {
    const context = gate === 'replies' ? V4OrgApprovalContext(lead) : null;
    const conflict = gate === 'replies' ? V4OrgApprovalConflict(lead, context) : '';
    if (conflict) {
      setSendState({ status: 'error', error: conflict });
      return;
    }
    setSendState({ status: 'sending', error: '' });
    try {
      if (gate === 'replies') {
        await V4SendApprovedReply(lead);
      } else {
        const a = V4AprGateAction(gate);
        await V4PatchLeadAsync(lead, a.approve.fields, a.approve.local);
      }
      V4OrgPostApproveHandoff(lead, gate);
      setSendState({ status: 'sent', error: '' });
      close();
    } catch (err) {
      setSendState({ status: 'error', error: err.message || 'Send failed' });
    }
  };
  const deny = () => { const a = V4AprGateAction(gate); V4CosPatchLead(lead, a.deny.fields, a.deny.local); close(); };
  const saveApprove = () => {
    if (gate === 'replies') {
      setSendState({ status: 'sending', error: '' });
      V4SendApprovedReply(lead, { subject, body })
        .then(() => { setSendState({ status: 'sent', error: '' }); close(); })
        .catch(err => setSendState({ status: 'error', error: err.message || 'Send failed' }));
      return;
    } else if (gate === 'briefs') {
      V4CosPatchLead(lead, { brief_body: body, brief_status: 'approved' }, { briefBody: body, briefStatus: 'approved' });
    }
    close();
  };

  const whatRead = gate === 'replies' ? (dr.body || 'Drafted reply ready for review.')
    : gate === 'briefs' ? (lead.briefBody || lead.briefSummary || 'Brief ready for Robert sign off.')
    : gate === 'payments' ? ('Invoice is out for ' + (lead.brand || 'this lead') + '. Confirm payment landed, then mark paid.')
    : ('Approved post for ' + (lead.brand || 'this lead') + '. Mark posted once it is live.');
  const why = lead.recommendedAction || (lead.agentAssessment ? String(lead.agentAssessment).split(/(?<=[.!?])\s/)[0] : '') || '';
  const money = (lead.value && typeof V4AprMoney === 'function') ? V4AprMoney(lead.value) : (lead.value ? '$' + lead.value : '');

  return (
    <div className="orgx-modal-back" onClick={close}>
      <div className="orgx-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="orgx-modal-hd">
          <div>
            <div className="orgx-modal-eye">{GATE_NAME[gate]} gate &middot; approval</div>
            <h2 className="orgx-modal-ti">{lead.brand || lead.contactName || 'Lead'}</h2>
          </div>
          <button className="orgx-modal-x" onClick={close} aria-label="Close">&#10005;</button>
        </div>
        <div className="orgx-modal-chips">
          {lead.stage ? <span className="orgx-stage">{lead.stage}</span> : null}
          {lead.contactName ? <span className="orgx-mchip">{lead.contactName}</span> : null}
          {money ? <span className="orgx-mchip v">{money}</span> : null}
        </div>
        <div className="orgx-modal-body">
          <div className="orgx-modal-lbl">What you are approving</div>
          {editing && editable ? (
            <div className="orgx-edit">
              {gate === 'replies' ? <input className="orgx-subj" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" /> : null}
              <textarea className="orgx-ta" value={body} onChange={(e) => setBody(e.target.value)} rows={12} />
            </div>
          ) : (
            <div className="orgx-read">
              {gate === 'replies' && dr.subject ? <div className="orgx-subj-read">{dr.subject}</div> : null}
              <div className="orgx-read-body">{whatRead}</div>
            </div>
          )}
          {why ? <div className="orgx-modal-lbl">Why</div> : null}
          {why ? <div className="orgx-why">{why}</div> : null}
        </div>
        <div className="orgx-modal-ft">
          {sendState.error ? <span className="orgx-send-error">{sendState.error}</span> : null}
          {editing ? (
            <React.Fragment>
              <button className="orgx-b ap" onClick={saveApprove} disabled={sendState.status === 'sending'}>{gate === 'replies' ? 'Save & send' : 'Save & approve'}</button>
              <button className="orgx-b ed" onClick={() => setEditing(false)}>Cancel</button>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <button className="orgx-b ap" onClick={approve} disabled={sendState.status === 'sending'}>{gate === 'replies' ? 'Approve & send' : 'Approve'}</button>
              {editable ? <button className="orgx-b ed" onClick={() => setEditing(true)}>Edit draft</button> : null}
              <button className="orgx-b dn" onClick={deny}>Deny</button>
            </React.Fragment>
          )}
        </div>
      </div>
    </div>
  );
}

function V4OrgansView({ leads = [], query = '', onOpenInCompanyOs }) {
  const { health, resume, halt } = V4UseOpsHealth();
  const [modal, setModal] = React.useState(null);
  const [selectedGate, setSelectedGate] = React.useState('');
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [xHealth, setXHealth] = React.useState(null);
  const [xHealthLoaded, setXHealthLoaded] = React.useState(false);
  const [refreshState, setRefreshState] = React.useState({ status: 'idle', note: '', at: 0 });
  const [sendState, setSendState] = React.useState({ key: '', status: '', error: '' });
  const [handoffToast, setHandoffToast] = React.useState(null);
  const [sendTokenReady, setSendTokenReady] = React.useState(!!V3ApiToken());
  const [leadSyncState, setLeadSyncState] = React.useState({ key: '', status: '', note: '' });
  const gates = V4AprComputeGates(leads, query);

  const refreshSendToken = React.useCallback(() => {
    return V3BootstrapApiToken()
      .then((t) => { setSendTokenReady(!!t); return t; })
      .catch(() => { setSendTokenReady(false); return ''; });
  }, []);

  React.useEffect(() => {
    let alive = true;
    refreshSendToken().then(() => { if (!alive) return; });
    return () => { alive = false; };
  }, [refreshSendToken]);
  const gmap = {}; gates.forEach(g => { gmap[g.id] = g; });

  const halted = !!(health && String(health.status || 'ok') !== 'ok');
  const haltReason = (health && health.halt_reason) || 'Operator paused. Drafts are held until you resume.';

  const reported = String((health && health.now_handling) || '').split(/[\s→>]+/)[0].trim().toLowerCase();
  let activeKey = V4_ORG_ORDER.includes(reported) ? reported : '';
  if (!activeKey && gmap.replies && gmap.replies.items.length) activeKey = 'deal_desk';
  const organState = (key) => (key === activeKey ? 'work' : '');

  const ORG_GATE = { deal_desk: 'replies', tracker: 'payments', brief_maker: 'briefs', qa: 'posts' };
  const GATE_TITLE = { replies: 'Reply gate', payments: 'Payment gate', briefs: 'Brief gate', posts: 'Post gate' };
  const GATE_DESC = { replies: 'Drafts waiting on your approval.', payments: 'Invoice out, confirm paid.', briefs: 'Awaiting Robert sign off.', posts: 'Approved and paid, ready to post.' };
  const GATE_AGENT = { replies: 'Reply Operator', payments: 'Finance Loop', briefs: 'Brief Maker', posts: 'QA Runner' };
  const GATE_TONE = { replies: 'blue', payments: 'gold', briefs: 'purple', posts: 'green' };

  const loadXHealth = React.useCallback(() => {
    fetch('flow-v4/assets/x_scraper_health.json?v=' + Date.now())
      .then(r => r.ok ? r.json() : null)
      .then(data => { setXHealth(data || null); setXHealthLoaded(true); })
      .catch(() => { setXHealth(null); setXHealthLoaded(true); });
  }, []);

  React.useEffect(() => {
    loadXHealth();
    const timer = window.setInterval(loadXHealth, 5 * 60 * 1000);
    const onRefresh = () => loadXHealth();
    window.addEventListener('v4:refresh-complete', onRefresh);
    return () => { window.clearInterval(timer); window.removeEventListener('v4:refresh-complete', onRefresh); };
  }, [loadXHealth]);

  const runRefresh = React.useCallback(async (includeXScrape) => {
    setRefreshState({ status: 'syncing', note: includeXScrape ? 'Gmail + X scrape + board…' : 'Gmail + board…', at: Date.now() });
    try {
      const result = await V4RefreshAllData({ includeXScrape });
      const patched = Number(result?.gmail?.cards_updated ?? result?.gmail?.threads_patched ?? 0);
      const created = Number(result?.gmail?.new_cards_written || 0);
      const xBridgeOk = result?.xBridge?.ok !== false;
      const parts = ['Board reloaded'];
      if (created) parts.push(created + ' new');
      if (patched) parts.push(patched + ' updated');
      if (includeXScrape && result?.xScrape?.ok) parts.push('X scraped');
      if (xBridgeOk) parts.push('X bridge synced');
      setRefreshState({ status: 'ok', note: parts.join(' · '), at: Date.now() });
    } catch (err) {
      setRefreshState({ status: 'error', note: err?.message || 'Refresh failed', at: Date.now() });
    } finally {
      window.setTimeout(() => setRefreshState(s => (s.status === 'idle' ? s : { ...s, status: 'idle', note: '' })), 5000);
    }
  }, []);

  const totalWaiting = gates.reduce((s, g) => s + g.items.length, 0);
  const todayDecisions = React.useMemo(() => V4OrgBuildTodayDecisions(gates), [gates, totalWaiting]);
  const todayValue = todayDecisions.reduce((s, d) => s + (d.lead.value || 0), 0);
  const pendingGate = gates.find(g => g.items.length);

  const selectDecision = React.useCallback((item) => {
    if (!item) return;
    const g = gmap[item.gateId];
    const idx = g ? g.items.findIndex((l) => String(l.id) === String(item.lead.id)) : -1;
    setSelectedGate(item.gateId);
    setSelectedIndex(idx >= 0 ? idx : 0);
  }, [gmap]);

  const advanceToNextDecision = React.useCallback((afterLead, afterGateId) => {
    const flat = V4OrgBuildTodayDecisions(gates);
    const curKey = (afterGateId || '') + ':' + String(afterLead?.id || '');
    const idx = flat.findIndex((d) => (d.gateId + ':' + d.lead.id) === curKey);
    const next = flat[idx + 1] || flat[idx - 1] || null;
    if (next) selectDecision(next);
    else setSelectedIndex(0);
  }, [gates, selectDecision]);

  React.useEffect(() => {
    const onHandoff = (e) => setHandoffToast(e?.detail || null);
    window.addEventListener('v4:org-handoff', onHandoff);
    return () => window.removeEventListener('v4:org-handoff', onHandoff);
  }, []);

  React.useEffect(() => {
    if (!handoffToast) return undefined;
    const t = window.setTimeout(() => setHandoffToast(null), 5200);
    return () => window.clearTimeout(t);
  }, [handoffToast]);

  React.useEffect(() => {
    if (!selectedGate || !(gmap[selectedGate] && gmap[selectedGate].items.length)) {
      setSelectedGate(pendingGate ? pendingGate.id : '');
      setSelectedIndex(0);
    } else if (selectedIndex >= gmap[selectedGate].items.length) {
      setSelectedIndex(0);
    }
  }, [totalWaiting, selectedGate, selectedIndex]);

  const gate = selectedGate ? (gmap[selectedGate] || { items: [] }) : (pendingGate || { id: '', items: [] });
  const selectedLead = gate.items[selectedIndex] || null;
  const selectedAction = gate.id ? V4AprGateAction(gate.id) : null;
  const approveSelected = async () => {
    if (!selectedLead || !selectedAction) return;
    const key = gate.id + ':' + selectedLead.id;
    if (gate.id === 'replies') {
      if (selectedConflict) {
        setSendState({ key, status: 'error', error: selectedConflict });
        return;
      }
      setSendState({ key, status: 'sending', error: '' });
      try {
        const token = await V3BootstrapApiToken();
        if (!token) {
          setSendTokenReady(false);
          throw new Error('Send token could not load from your Mac. Click Retry below or hard refresh (Cmd+Shift+R).');
        }
        setSendTokenReady(true);
        await V4SendApprovedReply(selectedLead);
        V4OrgPostApproveHandoff(selectedLead, gate.id);
        setSendState({ key, status: 'sent', error: '' });
        advanceToNextDecision(selectedLead, gate.id);
      } catch (err) {
        setSendState({ key, status: 'error', error: err.message || 'Send failed' });
      }
      return;
    }
    V4CosPatchLead(selectedLead, selectedAction.approve.fields, selectedAction.approve.local);
    V4OrgPostApproveHandoff(selectedLead, gate.id);
    advanceToNextDecision(selectedLead, gate.id);
  };
  const denySelected = () => {
    if (!selectedLead || !selectedAction) return;
    V4CosPatchLead(selectedLead, selectedAction.deny.fields, selectedAction.deny.local);
    advanceToNextDecision(selectedLead, gate.id);
  };
  const selectedContext = selectedLead ? V4OrgApprovalContext(selectedLead) : null;
  const selectedConflict = selectedLead ? V4OrgApprovalConflict(selectedLead, selectedContext) : '';
  const selectedSendKey = selectedLead && gate.id ? (gate.id + ':' + selectedLead.id) : '';
  const selectedSending = sendState.key === selectedSendKey && sendState.status === 'sending';
  const selectedSendError = sendState.key === selectedSendKey ? sendState.error : '';
  const decisionIndex = selectedLead && gate.id
    ? todayDecisions.findIndex((d) => d.gateId === gate.id && String(d.lead.id) === String(selectedLead.id))
    : -1;

  React.useEffect(() => {
    if (!todayDecisions.length) return;
    const curOk = selectedLead && todayDecisions.some(
      (d) => d.gateId === gate.id && String(d.lead.id) === String(selectedLead.id)
    );
    if (!curOk) selectDecision(todayDecisions[0]);
  }, [todayDecisions, selectedLead?.id, gate.id, selectDecision]);

  React.useEffect(() => {
    if (selectedLead && gate.id) {
      V4SetCopilotFocus(V4BuildCopilotFocusFromOrgans(gate.id, selectedLead));
    } else {
      V4ClearCopilotFocus('organs');
    }
    return () => V4ClearCopilotFocus('organs');
  }, [selectedLead?.id, gate?.id, selectedIndex, leads]);

  const opsHeartbeat = (health && (health.heartbeat || health.updated_at || health.last_seen_at)) || '';
  const qwenSpend = health ? V4AprNum(health.local_tokens_today) : '—';
  const claudeSpend = health ? '$' + Number(health.claude_spend_today || 0).toFixed(2) : '—';
  const xRanAt = xHealth && (xHealth.ran_at || xHealth.last_checked_at || xHealth.updated_at);
  const xStale = xHealthLoaded && (!xHealth || V4OrgIsStale(xRanAt, 26 * 60));
  const xBroken = xHealth && (
    Number(xHealth.inspected || xHealth.visible_threads || 0) === 0 ||
    String(xHealth.stop_reason || '').includes('stalled')
  );
  const incidents = [];
  if (halted) incidents.push({ tone: 'red', label: 'Halted', text: haltReason });
  if (!health || V4OrgIsStale(opsHeartbeat, 20)) incidents.push({ tone: 'gold', label: 'Ops heartbeat', text: 'Local operator health is stale or unavailable.' });
  if (xStale) incidents.push({ tone: 'gold', label: 'X watcher', text: 'No fresh X scrape health. Check the Chrome session.' });
  if (xBroken) incidents.push({ tone: 'red', label: 'X watcher', text: 'Last scrape looked stuck or inspected zero threads.' });
  if (!incidents.length && totalWaiting) incidents.push({ tone: 'blue', label: 'Approvals', text: totalWaiting + ' items are waiting for your click.' });
  if (!incidents.length) incidents.push({ tone: 'green', label: 'Clear', text: 'No blockers detected. The machine is moving.' });

  const medic = halted ? haltReason
    : incidents[0] ? incidents[0].text
      : activeKey ? (V4_ORG_DEF[activeKey].name + ' is working a lead right now.')
        : totalWaiting ? (todayDecisions.length + ' decision' + (todayDecisions.length === 1 ? '' : 's') + ' left · clear the strip above')
          : 'All clear. Nothing waiting, nothing in flight.';

  const cardState = (key) => {
    const gid = ORG_GATE[key];
    const g = gid ? gmap[gid] : null;
    if (g && g.items.length) return 'waiting';
    return organState(key) === 'work' ? 'work' : 'idle';
  };

  const organCard = (key) => {
    const o = V4_ORG_DEF[key];
    const gid = ORG_GATE[key];
    const g = gid ? (gmap[gid] || { items: [] }) : null;
    const n = g ? g.items.length : 0;
    const st = cardState(key);
    const stLabel = st === 'work' ? 'Active' : st === 'waiting' ? 'Waiting' : 'Idle';
    const first = g && g.items[0];
    const current = gid && gate.id === gid;
    return (
      <button type="button" className={'orgx-card orgx-' + st + (current ? ' is-selected' : '')} key={key}
        onClick={() => { if (gid) { setSelectedGate(gid); setSelectedIndex(0); } }}>
        <div className="orgx-head">
          <div className="orgx-ic">{o.glyph}</div>
          <div className="orgx-id"><div className="orgx-nm">{o.name}</div><div className="orgx-ds">{o.desc}</div></div>
          <span className={'orgx-pill ' + st}><span className="dot"></span>{stLabel}</span>
        </div>
        {o.token && <div className="orgx-tok">&rarr; {o.token}</div>}
        {n > 0 ? (
          <div className="orgx-gate">
            <div className="orgx-gt">{GATE_TITLE[gid]} &middot; {n} waiting</div>
            <div className="orgx-gd">{GATE_DESC[gid]}</div>
            <div className="orgx-lead">{(first && first.brand) || 'Lead'}{first && first.stage ? <span className="orgx-stage">{first.stage}</span> : null}</div>
          </div>
        ) : (
          <div className="orgx-quiet">{st === 'work' ? 'Working a lead now.' : 'Nothing queued.'}</div>
        )}
      </button>
    );
  };

  const railItem = (key) => {
    const o = V4_ORG_DEF[key];
    const gid = ORG_GATE[key];
    const g = gid ? (gmap[gid] || { items: [] }) : null;
    const n = g ? g.items.length : 0;
    const st = cardState(key);
    return (
      <div className="orgx-rail-row" key={key}>
        <span className="orgx-ric">{o.glyph}</span>
        <span className="orgx-rnm">{o.name}</span>
        {n > 0 ? <span className="orgx-rgate">{n}</span> : <span className={'orgx-rdot ' + st}></span>}
      </div>
    );
  };

  return (
    <div className={'orgx-wrap' + (halted ? ' is-halted' : '')}>
      <div className="orgx-top">
        <div>
          <div className="orgx-eye">Operator brain</div>
          <h1 className="orgx-title">ORGANS <i>approval command center</i></h1>
        </div>
        <div className="orgx-gauges">
          <div className={'orgx-run' + (halted ? ' off' : '')}><span className="d"></span>{halted ? 'Halted' : 'Running'}</div>
          <div className="orgx-ctr"><span className="k">Approvals</span><span className="v">{totalWaiting}</span></div>
          <div className="orgx-ctr"><span className="k">Local Qwen</span><span className="v">{qwenSpend}</span></div>
          <div className="orgx-ctr"><span className="k">Claude guard</span><span className="v m">{claudeSpend}</span></div>
          <button
            type="button"
            className={'orgx-refresh' + (refreshState.status === 'syncing' ? ' is-syncing' : '') + (refreshState.status === 'error' ? ' is-error' : '')}
            title="Refresh Gmail, board, and X intake. Shift+click also runs live X scrape (Chrome must be open)."
            onClick={(e) => runRefresh(e.shiftKey)}
            disabled={refreshState.status === 'syncing'}
          >
            {refreshState.status === 'syncing' ? 'Syncing…' : 'Sync Gmail'}
          </button>
          <button className="orgx-halt" onClick={halted ? resume : halt}>{halted ? 'Resume' : 'Halt'}</button>
        </div>
        {refreshState.note ? <div className={'orgx-refresh-note is-' + refreshState.status}>{refreshState.note}</div> : null}
      </div>

      <div className="orgx-medic">
        <span className="mi"><span className="pp"></span>&#9670; Medic</span>
        <span className="mw">{medic}</span>
        {!sendTokenReady ? (
          <span className="orgx-send-prep">
            Loading send token from Mac…
            <button type="button" className="orgx-send-retry" onClick={() => refreshSendToken()}>Retry</button>
          </span>
        ) : null}
      </div>

      {todayDecisions.length > 0 ? (
        <section className="orgx-today" aria-label="Today's decisions">
          <div className="orgx-today-head">
            <div>
              <div className="orgx-today-eyebrow">Today&apos;s decisions</div>
              <h2 className="orgx-today-title">{todayDecisions.length} left · clear these and you&apos;re done</h2>
            </div>
            {todayValue > 0 ? (
              <span className="orgx-today-total">{V4AprMoney(todayValue)} in play</span>
            ) : null}
          </div>
          <div className="orgx-today-list">
            {todayDecisions.map((item, i) => {
              const isCurrent = gate.id === item.gateId && String(selectedLead?.id) === String(item.lead.id);
              return (
                <button
                  key={item.gateId + ':' + item.lead.id}
                  type="button"
                  className={'orgx-today-row' + (isCurrent ? ' is-current' : '')}
                  onClick={() => selectDecision(item)}
                >
                  <span className="orgx-today-rank">{i + 1}</span>
                  <span className={'orgx-today-gate is-' + item.gateId}>{item.gateLabel}</span>
                  <span className="orgx-today-brand">{item.lead.brand || item.lead.contactName || 'Lead'}</span>
                  {item.lead.value ? <span className="orgx-today-val">{V4AprMoney(item.lead.value)}</span> : null}
                  <span className="orgx-today-line">{V4OrgUnifiedLine(item.lead, item.gateId)}</span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="orgx-command-grid">
        <section className="orgx-command">
          <div className="orgx-section-top">
            <div>
              <div className="orgx-section-eyebrow">
                {decisionIndex >= 0
                  ? ('Decision ' + (decisionIndex + 1) + ' of ' + todayDecisions.length)
                  : 'Waiting on Asher'}
              </div>
              <h2>{selectedLead ? ((selectedLead.brand || 'Lead') + ' · ' + (GATE_TITLE[gate.id] || 'Approval')) : 'Nothing needs approval'}</h2>
            </div>
            <div className={'orgx-agent-chip ' + (GATE_TONE[gate.id] || '')}>{gate.id ? GATE_AGENT[gate.id] : 'Clear lane'}</div>
          </div>
          {selectedLead ? (
            <React.Fragment>
              <div className="orgx-approval-meta">
                <span>{V4OrgLeadLine(selectedLead)}</span>
                {selectedLead.stage ? <span>{selectedLead.stage}</span> : null}
                {selectedLead.value ? <span>{V4AprMoney(selectedLead.value)}</span> : null}
              </div>
              <div className="orgx-review-stack">
                <section className="orgx-context-card">
                  <div className="orgx-mini-head">
                    <span>What you are replying to</span>
                    {selectedContext?.when ? <b>{selectedContext.when}</b> : null}
                  </div>
                  <div className="orgx-context-from">
                    <strong>{selectedContext?.sender || 'Unknown sender'}</strong>
                    <em>{selectedContext?.subject || 'Conversation'}</em>
                  </div>
                  <div className="orgx-context-body">
                    {selectedContext?.body || (
                      V3IsXLeadRecord(selectedLead) && !V3XLeadHasUsableContext(selectedLead)
                        ? 'No X DM context on this card — the scraper context was never saved or merged. Pull X context before approving.'
                        : 'No inbound message was captured for this approval. Open the lead before approving.'
                    )}
                  </div>
                </section>

                <section className="orgx-reason-card">
                  <div className="orgx-mini-head"><span>Why this needs you</span><b>{GATE_AGENT[gate.id] || 'Agent'}</b></div>
                  {selectedConflict ? <div className="orgx-conflict">{selectedConflict}</div> : null}
                  <div className="orgx-reason-main">{V4OrgUnifiedLine(selectedLead, gate.id)}</div>
                  {(selectedLead.agentAssessment || selectedLead.recommendedAction) ? (
                    <div className="orgx-agent-note">
                      {selectedLead.agentAssessment || ''}
                      {selectedLead.recommendedAction ? <span> Recommended: {selectedLead.recommendedAction}.</span> : null}
                    </div>
                  ) : null}
                </section>

                <section className="orgx-reply-card">
                  <div className="orgx-mini-head">
                    <span>{gate.id === 'replies' ? 'Proposed reply' : 'Approval item'}</span>
                    {selectedContext?.teamWhen ? <b>last team touch {selectedContext.teamWhen}</b> : null}
                  </div>
                  {gate.id === 'replies' && selectedLead.draftReply?.subject ? (
                    <div className="orgx-reply-subject">{selectedLead.draftReply.subject}</div>
                  ) : null}
                  <div className="orgx-approval-body">{V4OrgApprovalBody(gate.id, selectedLead) || 'No body available. Open edit before approving.'}</div>
                </section>
              </div>
              <div className="orgx-approval-actions">
                {leadSyncState.note && leadSyncState.key === (gate.id + ':' + selectedLead?.id) ? (
                  <div className={'orgx-send-error wide' + (leadSyncState.status === 'ok' ? ' is-ok' : '')}>{leadSyncState.note}</div>
                ) : null}
                {selectedSendError ? (
                  <div className="orgx-send-error wide">
                    {selectedSendError}
                    {/send token/i.test(selectedSendError) ? (
                      <button type="button" className="orgx-send-retry" onClick={() => refreshSendToken().then((t) => { if (!t) setSendState(s => ({ ...s, error: 'Still could not reach your Mac. Hard refresh (Cmd+Shift+R).' })); })}>Retry token</button>
                    ) : null}
                  </div>
                ) : null}
                <button className="orgx-b ap" onClick={approveSelected} disabled={selectedSending || (gate.id === 'replies' && !!selectedConflict)}>{selectedSending ? 'Sending...' : (gate.id === 'replies' && selectedConflict ? 'Fix draft first' : (gate.id === 'replies' ? 'Approve & send' : 'Approve'))}</button>
                <button className="orgx-b ed" onClick={() => setModal({ gate: gate.id, lead: selectedLead })}>Edit and inspect</button>
                {onOpenInCompanyOs && selectedLead ? (
                  <button className="orgx-b ed" type="button" onClick={() => onOpenInCompanyOs(selectedLead.id)}>Open thread</button>
                ) : null}
                {selectedLead && gate.id === 'replies' ? (
                  <button
                    className="orgx-b ed"
                    type="button"
                    disabled={leadSyncState.status === 'syncing' && leadSyncState.key === (gate.id + ':' + selectedLead.id)}
                    onClick={async () => {
                      const key = gate.id + ':' + selectedLead.id;
                      const isX = V3IsXLeadRecord(selectedLead);
                      setLeadSyncState({ key, status: 'syncing', note: '' });
                      try {
                        if (isX) await V4RefreshLeadFromX(selectedLead);
                        else await V4RefreshLeadFromGmail(selectedLead);
                        setLeadSyncState({
                          key,
                          status: 'ok',
                          note: isX ? 'X context pulled' : 'Gmail refreshed',
                        });
                      } catch (err) {
                        setLeadSyncState({ key, status: 'error', note: err?.message || 'Refresh failed' });
                      }
                      window.setTimeout(() => setLeadSyncState({ key: '', status: '', note: '' }), 4500);
                    }}
                  >
                    {leadSyncState.key === (gate.id + ':' + selectedLead.id) && leadSyncState.status === 'syncing'
                      ? 'Refreshing…'
                      : (V3IsXLeadRecord(selectedLead) ? '↻ Pull X context' : '↻ Refresh thread')}
                  </button>
                ) : null}
                <button className="orgx-b dn" onClick={denySelected}>Deny</button>
                {todayDecisions.length > 1 ? (
                  <button
                    className="orgx-b ed"
                    onClick={() => {
                      const next = todayDecisions[(decisionIndex + 1) % todayDecisions.length];
                      if (next) selectDecision(next);
                    }}
                  >
                    Next decision
                  </button>
                ) : null}
              </div>
            </React.Fragment>
          ) : (
            <div className="orgx-empty-state">
              <div className="orgx-empty-big">No human clicks needed.</div>
              <div>The agents can keep moving until a reply, payment, brief, or post needs approval.</div>
            </div>
          )}
        </section>

        <aside className="orgx-health">
          <div className="orgx-section-eyebrow">Machine health</div>
          <div className="orgx-health-row"><span>Operator</span><b>{halted ? 'Halted' : 'Running'}</b><em>{V4OrgTimeAgo(opsHeartbeat)}</em></div>
          <div className={'orgx-health-row ' + (xBroken || xStale ? 'warn' : '')}><span>X watcher</span><b>{xBroken ? 'Needs attention' : xStale ? 'Stale' : 'Ready'}</b><em>{V4OrgTimeAgo(xRanAt)}</em></div>
          <div className="orgx-health-row"><span>Gmail handoff</span><b>{gmap.replies.items.length ? gmap.replies.items.length + ' drafts' : 'Clear'}</b><em>approval gated</em></div>
          <div className="orgx-health-row"><span>Brief maker</span><b>{gmap.briefs.items.length ? gmap.briefs.items.length + ' waiting' : 'Clear'}</b><em>Robert docs</em></div>
          {gmap.briefs.items.length ? (
            <button type="button" className="orgx-b ed" style={{ marginTop: 10, width: '100%' }} onClick={() => V4CopyRobertReviewLink()}>
              Copy Robert review link
            </button>
          ) : null}
        </aside>
      </div>

      <div className="orgx-incident-row">
        {incidents.map((it, idx) => (
          <div className={'orgx-incident ' + it.tone} key={idx}>
            <span>{it.label}</span>
            <b>{it.text}</b>
          </div>
        ))}
      </div>

      <div className="orgx-body">
        <aside className="orgx-rail">
          <div className="orgx-rail-h">Organs</div>
          <div className="orgx-rail-row orgx-src"><span className="orgx-ric">&#9993;</span><span className="orgx-rnm">Intake</span><span className="orgx-rsub">scrapers</span></div>
          {V4_ORG_ORDER.map(railItem)}
          <div className="orgx-rail-foot">{totalWaiting} at the gates &middot; {V4_ORG_ORDER.length} organs</div>
        </aside>
        <div className="orgx-grid">
          {V4_ORG_ORDER.map(organCard)}
        </div>
      </div>
      {modal ? <V4OrgEditModal gate={modal.gate} lead={modal.lead} onClose={() => setModal(null)} /> : null}
      {handoffToast ? (
        <div className="orgx-handoff-toast" role="status">
          <span className="orgx-handoff-brand">{handoffToast.brand}</span>
          <span className="orgx-handoff-msg">{handoffToast.message}</span>
        </div>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ORGANS-B FLOOR VIEW — the god's-eye command floor (drop-in for the
// Organs tab). Same props, same data source, same board writes as
// V4OrgansView; rendered as the night-floor art with click-to-pop
// approval bubbles. Depends on the shared V4Apr*/V4CosPatchLead/
// V4UseOpsHealth helpers defined above. Pairs with the ORGANS FLOOR (B)
// shell CSS (org-floor / org-hud / org-beacon / org-bubble / .ig).
// ─────────────────────────────────────────────────────────────
/* ============================================================================
   UNALIGNED COPILOT — "the voice of all truth". A floating chat dock (bottom
   right) wired to the SAME local LLM bridge as Draft with AI
   (window.claude.complete). It answers anything about the desk using the live
   board as context: leads, stages, pending approvals, ops_health, values, next
   moves. No new backend — it reuses window.claude + the data already in memory.

   DEPENDS ON bundle helpers: window.claude.complete, V4UseOpsHealth,
   V4AprComputeGates, V4AprNum. Concatenated/pasted into app-bundle.jsx.

   MOUNT (one render, app-level so it shows on every view): in V4App's return,
   near the <V4CommandPalette .../> mount, add:
       <UnalignedCopilot leads={mergedLeads} />
   Pairs with the `.uac-*` CSS block in styles.css.
   ============================================================================ */
/* ============================================================================
   UNALIGNED COPILOT — "the voice of all truth". Floating chat dock (bottom
   right) on the SAME local LLM bridge as Draft with AI (window.claude.complete).

   AGENTIC: it doesn't just get a snapshot — it runs a ReAct loop with READ-ONLY
   lookup tools over the full in-memory board (every lead, thread, gate, ops_health),
   calling them until it can answer. Ask it anything; if it doesn't know, it digs.

   HARD SAFETY (enforced two ways — prompt rule + the only tools that exist are
   read-only in-memory lookups): it NEVER touches the Mac filesystem, runs shell,
   or modifies / creates / deletes / sends anything. There is no tool that can.

   DEPENDS ON bundle helpers: window.claude.complete, V4UseOpsHealth,
   V4AprComputeGates, V4AprNum. Mount once in V4App: <UnalignedCopilot leads={mergedLeads} />
   Pairs with the `.uac-*` CSS block in styles.css.
   ============================================================================ */
/* ============================================================================
   UNALIGNED COPILOT — "the voice of all truth". Floating chat dock (bottom
   right) on the SAME local LLM bridge as Draft with AI (window.claude.complete).

   AGENTIC: it doesn't just get a snapshot — it runs a ReAct loop with READ-ONLY
   lookup tools over the full in-memory board (every lead, thread, gate, ops_health),
   calling them until it can answer. Ask it anything; if it doesn't know, it digs.

   HARD SAFETY (enforced two ways — prompt rule + the only tools that exist are
   read-only in-memory lookups): it NEVER touches the Mac filesystem, runs shell,
   or modifies / creates / deletes / sends anything. There is no tool that can.

   DEPENDS ON bundle helpers: window.claude.complete, V4UseOpsHealth,
   V4AprComputeGates, V4AprNum. Mount once in V4App: <UnalignedCopilot leads={mergedLeads} />
   Pairs with the `.uac-*` CSS block in styles.css.
   ============================================================================ */
function UnalignedCopilot({ leads = [] }) {
  const { useState, useRef, useEffect } = React;
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState('');
  const [focus, setFocus] = useState(() => (typeof window !== 'undefined' ? window.__v4CopilotFocus : null) || null);
  const [msgs, setMsgs] = useState([
    { role: 'ai', text: "I'm your line to the whole desk. Ask me anything: who's waiting on a reply, what's unpaid, which leads are hot, what a brand last said, how much is in the pipeline. I'll dig through the live board to answer." },
  ]);
  const { health } = (typeof V4UseOpsHealth === 'function') ? V4UseOpsHealth() : { health: null };
  const bridge = typeof window !== 'undefined' && window.claude && window.claude.complete;
  const label = (typeof window !== 'undefined' && window.claude && window.claude.label) ? window.claude.label() : 'Mac Studio';
  const scrollRef = useRef(null);
  const focusKey = focus ? `${focus.surface}:${focus.leadId}:${focus.gate}` : '';

  useEffect(() => {
    const onFocus = (e) => setFocus(e?.detail || window.__v4CopilotFocus || null);
    window.addEventListener('v4:copilot-focus', onFocus);
    return () => window.removeEventListener('v4:copilot-focus', onFocus);
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, open, busy, step]);

  const live = (Array.isArray(leads) ? leads : []).filter(l => l && !['trash', 'dead-leads'].includes(String(l.stage || '').toLowerCase()));
  const brief = (l) => ({
    brand: l.brand || l.contactName || 'Lead', stage: l.stage || '?',
    value: l.value || null, tier: l.agentTier || null,
    pendingDraft: String(l.draftReplyStatus || '').toLowerCase() === 'pending',
    next: (l.nextMove && l.nextMove.text) ? String(l.nextMove.text).slice(0, 120) : null,
  });

  // ---- READ-ONLY tools over the live board (no writes, no files, no shell) ----
  const TOOLS = {
    board_summary: () => {
      const byStage = {};
      live.forEach(l => { const s = l.stage || '?'; byStage[s] = (byStage[s] || 0) + 1; });
      const gates = (typeof V4AprComputeGates === 'function') ? V4AprComputeGates(leads, '') : [];
      const totalValue = live.reduce((s, l) => s + (Number(l.value) || 0), 0);
      return { activeLeads: live.length, byStage, totalPipelineValue: totalValue,
        pending: gates.map(g => ({ gate: g.label, count: g.items.length })) };
    },
    search_leads: (a) => {
      const q = String((a && a.query) || '').toLowerCase();
      const hits = live.filter(l => [l.brand, l.contactName, l.deliverables, l.stage, l.agentTier,
        l.nextMove && l.nextMove.text, l.recommendedAction].some(s => String(s || '').toLowerCase().includes(q)));
      return { count: hits.length, results: hits.slice(0, 15).map(brief) };
    },
    get_lead: (a) => {
      const key = String((a && (a.brand || a.id || a.query)) || '').toLowerCase();
      const l = live.find(x => String(x.brand || '').toLowerCase().includes(key) ||
        String(x.contactName || '').toLowerCase().includes(key) || String(x.id) === key);
      if (!l) return { found: false };
      return { found: true, brand: l.brand, contact: l.contactName, stage: l.stage, value: l.value || null,
        tier: l.agentTier || null, draftPending: String(l.draftReplyStatus || '').toLowerCase() === 'pending',
        draft: l.draftReply && l.draftReply.body ? String(l.draftReply.body).slice(0, 700) : null,
        assessment: l.agentAssessment || l.recommendedAction || null,
        nextMove: (l.nextMove && l.nextMove.text) || null,
        thread: Array.isArray(l.thread) ? l.thread.slice(-6).map(m => ({
          from: m.from || '?', subject: m.subject || '', body: String(m.body || '').slice(0, 500) })) : [] };
    },
    list_pending: () => {
      const gates = (typeof V4AprComputeGates === 'function') ? V4AprComputeGates(leads, '') : [];
      return gates.map(g => ({ gate: g.label, items: g.items.slice(0, 20).map(l => ({
        brand: l.brand || l.contactName, value: l.value || null,
        draft: l.draftReply && l.draftReply.body ? String(l.draftReply.body).slice(0, 200) : null })) }));
    },
    ops_health: () => health ? { status: health.status || 'ok', halt_reason: health.halt_reason || '',
      local_tokens_today: health.local_tokens_today || 0, claude_spend_today: health.claude_spend_today || 0 } : { available: false },
    current_focus: () => {
      const f = (typeof window !== 'undefined' && window.__v4CopilotFocus) || focus || null;
      if (!f) return { focused: false };
      return { focused: true, ...f };
    },
    calendar: async (a) => {
      // Robert's live schedule — same feed the Calendar view uses (Pacific time).
      const TZ = 'America/Los_Angeles';
      const dayKey = (off) => { const d = new Date(); d.setDate(d.getDate() + off); return d.toLocaleDateString('en-CA', { timeZone: TZ }); };
      const evKey = (ev) => { try { return new Date(ev.start).toLocaleDateString('en-CA', { timeZone: TZ }); } catch (e) { return ''; } };
      const span = (a && a.range === 'week') ? [0,1,2,3,4,5,6] : (a && a.range === 'today') ? [0] : [-1,0,1];
      try {
        const res = await fetch('https://script.google.com/macros/s/AKfycby7SNgq-2mlzm5JkVHkbo0fsa1fOHIh6KPFfKqvPPLoFYYUvYZv94z2-KMdweTbAYVw9A/exec');
        const all = await res.json();
        const keys = span.map(dayKey);
        const items = (Array.isArray(all) ? all : []).filter(ev => keys.includes(evKey(ev)))
          .map(ev => ({ date: evKey(ev), time: ev.allDay ? 'all day' : ev.start, title: ev.title, location: ev.location || '' }))
          .sort((x, y) => new Date(x.time) - new Date(y.time));
        return { timezone: 'Pacific', events: items, count: items.length };
      } catch (e) { return { error: 'calendar fetch failed: ' + String(e && e.message || e) }; }
    },
  };
  const TOOL_LABEL = { board_summary: 'reading the board', search_leads: 'searching leads',
    get_lead: 'pulling the lead', list_pending: 'checking approvals', ops_health: 'checking ops',
    current_focus: 'reading the card on screen', calendar: "checking Robert's schedule" };

  const SYSTEM =
    "You are the UNALIGNED operator brain, Asher's voice of truth AND his all-around assistant. " +
    "Answer ANYTHING he asks. For questions about the desk, the leads, approvals, ops, or Robert's schedule, use the tools below to look up live data first. " +
    "For everything else — math, general knowledge, writing, reasoning, explanations — just answer directly from your own knowledge. Do not refuse a question because it isn't about the board.\n\n" +
    "HARD RULES (never break):\n" +
    "- You are strictly read-only. You never modify, create, delete, send, or schedule anything. You never touch the Mac's files, run shell commands, or change the system. If a request needs that, say plainly you can't and what would be needed.\n" +
    "- Never use hyphens or em dashes. Be direct, concrete, and useful.\n" +
    "- Your world knowledge has a training cutoff and you cannot browse the live web. For breaking news or very recent events, answer what you know and note you can't see live updates. For math, logic, and general knowledge, answer fully and confidently.\n\n" +
    "SCREEN FOCUS: When CURRENT SCREEN FOCUS is attached, the user is actively reviewing that approval card (often in Organs). Treat it as the primary subject. Help them decide approve vs edit vs deny, critique the draft reply, suggest better wording or structure for Robert/Asher voice, flag stale drafts, and explain the best next step. Call current_focus if you need the full inbound + draft payload.\n\n" +
    "TOOLS — use ONLY when the question needs live UNALIGNED data. To call one, output ONE line that is exactly a JSON object, nothing else:\n" +
    '{"tool":"board_summary"}\n' +
    '{"tool":"search_leads","args":{"query":"heygen"}}\n' +
    '{"tool":"get_lead","args":{"brand":"heygen"}}\n' +
    '{"tool":"list_pending"}\n' +
    '{"tool":"ops_health"}\n' +
    '{"tool":"current_focus"}\n' +
    '{"tool":"calendar","args":{"range":"today"}}   (range: today | week | omit for yesterday+today+tomorrow)\n\n' +
    "When you can answer (from a tool result OR your own knowledge), reply with: FINAL: <answer>\n" +
    "Only call a tool when it genuinely helps. A general question (math, a definition, advice) should go straight to FINAL.";

  function focusPromptBlock(activeFocus) {
    if (!activeFocus) return '';
    let blob = '';
    try { blob = JSON.stringify(activeFocus); } catch (e) { blob = String(activeFocus); }
    if (blob.length > 4500) blob = blob.slice(0, 4500) + '…';
    return '\n\nCURRENT SCREEN FOCUS (user is looking at this card right now):\n' + blob;
  }

  function parseTool(out) {
    if (/FINAL:/i.test(out)) return null;
    const m = out.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { const o = JSON.parse(m[0]); return o && o.tool ? o : null; } catch (e) { return null; }
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setMsgs(m => [...m, { role: 'user', text }]);
    if (!bridge) {
      setMsgs(m => [...m, { role: 'ai', text: 'Local LLM bridge offline. Start scripts/active/local_llm_bridge.py on the Mac, then ask again.' }]);
      return;
    }
    setBusy(true); setStep('thinking');
    const activeFocus = (typeof window !== 'undefined' && window.__v4CopilotFocus) || focus || null;
    let transcript = '';
    let answer = '';
    try {
      for (let i = 0; i < 6; i++) {
        const prompt = SYSTEM + focusPromptBlock(activeFocus) + '\n\nQUESTION: ' + text + '\n' + transcript +
          '\nYour next step (a single tool JSON line, or "FINAL: answer"):';
        const out = String(await window.claude.complete(prompt, { max_tokens: 800 }) || '').trim();
        const call = parseTool(out);
        if (!call) { answer = out.replace(/^[\s\S]*?FINAL:\s*/i, '').trim() || out; break; }
        const fn = TOOLS[call.tool];
        setStep(TOOL_LABEL[call.tool] || ('running ' + call.tool));
        let obs;
        try { obs = fn ? await fn(call.args || {}) : { error: 'unknown tool' }; }
        catch (e) { obs = { error: String(e && e.message || e) }; }
        let obsStr = JSON.stringify(obs);
        if (obsStr.length > 2200) obsStr = obsStr.slice(0, 2200) + '…';
        transcript += '\n' + out + '\nOBSERVATION: ' + obsStr;
        if (i === 5) {
          const fin = SYSTEM + focusPromptBlock(activeFocus) + '\n\nQUESTION: ' + text + '\n' + transcript + '\nNow give: FINAL: <answer>';
          answer = String(await window.claude.complete(fin, { max_tokens: 800 }) || '').replace(/^[\s\S]*?FINAL:\s*/i, '').trim();
        }
      }
      setMsgs(m => [...m, { role: 'ai', text: answer || 'No answer came back.' }]);
    } catch (err) {
      setMsgs(m => [...m, { role: 'ai', text: 'That failed: ' + (err && err.message ? err.message : 'bridge error') }]);
    } finally {
      setBusy(false); setStep('');
    }
  }

  return (
    <div className={'uac' + (open ? ' is-open' : '')}>
      {open && (
        <div className="uac-panel">
          <div className="uac-hd">
            <span className="uac-dot" />
            <div className="uac-ti">Ask UNALIGNED <i>voice of all truth</i></div>
            <span className="uac-src">{bridge ? label : 'offline'}</span>
            <button className="uac-x" onClick={() => setOpen(false)}>✕</button>
          </div>
          {focus ? (
            <div className="uac-focus" key={focusKey}>
              <span className="uac-focus-label">Focused</span>
              <strong>{focus.brand}</strong>
              <span className="uac-focus-meta">{focus.gateLabel}{focus.stage ? ` · ${focus.stage}` : ''}</span>
              {focus.conflict ? <span className="uac-focus-warn" title={focus.conflict}>Stale draft risk</span> : null}
            </div>
          ) : null}
          <div className="uac-log" ref={scrollRef}>
            {msgs.map((m, i) => <div key={i} className={'uac-msg uac-' + m.role}>{m.text}</div>)}
            {busy && <div className="uac-msg uac-ai uac-think">{step ? (step + '…') : 'thinking…'}</div>}
          </div>
          <div className="uac-in">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={focus
                ? 'Ask about this draft, formatting, approve or edit…'
                : 'Ask about any lead, payment, or move…'}
              rows={1}
            />
            <button className="uac-send" disabled={busy || !input.trim()} onClick={send}>↑</button>
          </div>
        </div>
      )}
      <button className="uac-fab" onClick={() => setOpen(o => !o)} title="Ask UNALIGNED">
        {open ? '✕' : '◆'}
      </button>
    </div>
  );
}
if (typeof window !== 'undefined') window.UnalignedCopilot = UnalignedCopilot;

function OrgansFloorView({ leads = [], query = '', onOpenConsole, onOpenInCompanyOs }) {
  const { useState } = React;
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(max-width: 720px)').matches : false);
  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    var mq = window.matchMedia('(max-width: 720px)');
    var on = function(){ setIsMobile(mq.matches); };
    mq.addEventListener ? mq.addEventListener('change', on) : mq.addListener(on);
    return function(){ mq.removeEventListener ? mq.removeEventListener('change', on) : mq.removeListener(on); };
  }, []);
  const { health, resume, halt } = V4UseOpsHealth();
  const [open, setOpen] = useState(null);   // gate id whose bubble is open
  const [idx, setIdx] = useState(0);        // which item within that gate
  const [tick, setTick] = useState(0);      // bump to re-render after a board write

  const gates = V4AprComputeGates(leads, query);
  const gmap = {}; gates.forEach(g => { gmap[g.id] = g; });

  // desk anchor (% of stage) per gate — tune against organs-floor.jpg
  const GATE_DESK = {
    replies:  { left: 40, top: 45 },   // Deal Desk
    posts:    { left: 66, top: 39 },   // Calendar / Post
    briefs:   { left: 80, top: 60 },   // Brief Maker
    payments: { left: 57, top: 73 },   // Finance
  };

  const halted = !!(health && String(health.status || 'ok') !== 'ok');
  const localTok = health ? Number(health.local_tokens_today || 0).toLocaleString('en-US') : '—';
  const claudeSpend = health ? '$' + Number(health.claude_spend_today || 0).toFixed(2) : '—';

  const openGate = (id) => { setOpen(id); setIdx(0); };
  const closeAll = () => setOpen(null);

  const whatBody = (g, l) => {
    if (g === 'replies') return (l.draftReply && l.draftReply.body) || 'Drafted reply ready for review.';
    if (g === 'briefs') return l.briefBody || l.briefSummary || (l.nextMove && l.nextMove.text) || 'Brief ready for Robert sign off.';
    if (g === 'payments') return 'Invoice is out for ' + (l.brand || 'this lead') + '. Confirm payment received, then mark paid.';
    return 'Approved post scheduled for ' + (l.brand || 'this lead') + '. Mark posted once it is live.';
  };
  const whyLine = (l) => l.recommendedAction
    || (l.agentAssessment ? String(l.agentAssessment).split(/(?<=[.!?])\s/)[0] : '')
    || l.deliverables || l.stage || '';

  const denyGate = (g, lead) => {
    const a = V4AprGateAction(g);
    if (lead && a) V4CosPatchLead(lead, a.deny.fields, a.deny.local);
    setTick(t => t + 1);
  };
  const routeToCos = (g, lead) => {
    if (!lead || !onOpenInCompanyOs) return;
    onOpenInCompanyOs(lead.id, g);
    closeAll();
  };
  const ignore = (lead) => {
    // Not a system task: flag human_only (pulls it from the replies gate) and hand to Robert.
    if (lead) V4CosPatchLead(lead, { draft_reply_status: 'human_only' }, { draftReplyStatus: 'human_only' });
    setTick(t => t + 1);
  };

  const totalWaiting = gates.reduce((s, g) => s + g.items.length, 0);

  const bubble = (g) => {
    const gate = gmap[g];
    if (!gate || !gate.items.length) return null;
    const i = Math.min(idx, gate.items.length - 1);
    const lead = gate.items[i];
    const pos = GATE_DESK[g] || { left: 50, top: 50 };
    const agent = (V4_APR_AGENT && V4_APR_AGENT[g]) || 'Agent';
    const n = gate.items.length;
    return (
      <div className="org-bubble"
        style={{ left: 'calc(' + pos.left + '% + 26px)', top: Math.max(pos.top - 8, 4) + '%' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="bh">
          <span className="aib">◆ {agent}</span>
          <span className="bt">Route to Company OS</span>
          {n > 1 && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: '#9a8f7e', marginLeft: '6px' }}>
              <span style={{ cursor: 'pointer' }} onClick={() => setIdx((i - 1 + n) % n)}>‹</span> {i + 1}/{n} <span style={{ cursor: 'pointer' }} onClick={() => setIdx((i + 1) % n)}>›</span>
            </span>
          )}
          <span className="bx" onClick={closeAll}>✕</span>
        </div>
        <h3>{lead.brand || 'Lead'}</h3>
        <div className="chips">
          {lead.agentTier && <span className="chip">{lead.agentTier}</span>}
          {lead.value ? <span className="chip v">{V4AprMoney(lead.value)}</span> : null}
        </div>
        <div className="lbl">What needs handling</div>
        <div className="what">{whatBody(g, lead)}</div>
        {whyLine(lead) && (<React.Fragment><div className="lbl">Why</div><div className="why">{whyLine(lead)}</div></React.Fragment>)}
        <div className="btns">
          <span className="b ap" onClick={() => routeToCos(g, lead)}>→ Company OS</span>
          {g !== 'replies' ? <span className="b gh" onClick={() => denyGate(g, lead)}>Deny</span> : null}
        </div>
        {g === 'replies' && (
          <button className="ig" onClick={() => ignore(lead)}>⊘ Not a system task — <b>hand to Robert</b></button>
        )}
      </div>
    );
  };

  if (isMobile) return <V4OrgansView leads={leads} query={query} onOpenConsole={onOpenConsole} onOpenInCompanyOs={onOpenInCompanyOs} />;

  return (
    <div className={'org-floor' + (halted ? ' is-halted' : '')} style={{ flex: '1 1 0', minHeight: 0 }} onClick={closeAll}>
      <div className="org-scrim"></div>

      <div className="org-hud">
        <div>
          <div className="eye">Machine Room</div>
          <h1>Organs <i>routing floor — handle in Company OS</i></h1>
        </div>
        <div className="gauges">
          <div className="lt"><span className="d"></span>{halted ? 'Halted' : 'Running'}</div>
          <div className="ctr"><span className="ck">Local · Qwen today</span><span className="cv">{localTok}</span></div>
          <div className="ctr"><span className="ck">Claude 10% today</span><span className="cv m">{claudeSpend}</span></div>
          <button className="halt" onClick={(e) => { e.stopPropagation(); halted ? resume() : halt(); }}>{halted ? '▶ Resume' : '⛔ Halt all'}</button>
        </div>
      </div>

      {gates.filter(g => g.items.length).map(g => {
        const pos = GATE_DESK[g.id] || { left: 50, top: 50 };
        const agent = (V4_APR_AGENT && V4_APR_AGENT[g.id]) || g.label;
        return (
          <button key={g.id} className="org-beacon" style={{ left: pos.left + '%', top: pos.top + '%' }}
            onClick={(e) => { e.stopPropagation(); open === g.id ? closeAll() : openGate(g.id); }}>
            <span className="ring"></span><span className="core"></span>
            <span className="lab">{agent} · {g.items[0].brand}{g.items.length > 1 ? ' +' + (g.items.length - 1) : ''}</span>
          </button>
        );
      })}

      {open && bubble(open)}

      {totalWaiting === 0 && (
        <div className="org-bubble" style={{ left: '50%', top: '42%' }} onClick={(e) => e.stopPropagation()}>
          <div className="bh"><span className="bt">All clear</span></div>
          <h3>Nothing waiting on you</h3>
          <div className="why">No gates lit. A beacon appears when an agent parks something — click it to open Company OS.</div>
        </div>
      )}
    </div>
  );
}

function V4AgentsView({ leads = [], query = '', onOpenLead }) {
  const q = String(query || '').trim().toLowerCase();
  const liveLeads = (Array.isArray(leads) ? leads : []).filter(l => l && !l.isRobertBrief && !['trash', 'dead-leads'].includes(String(l.stage || '').toLowerCase()));

  const newLeads = V4AgentViewItems(liveLeads, l =>
    (window.V3.IsNewLeadReview && window.V3.IsNewLeadReview(l)) ||
    ['new', 'first-touch', 'engaged'].includes(String(l.stage || '').toLowerCase())
  );
  const replyLeads = V4AgentViewItems(liveLeads, l => Boolean(l.unread || l.needsReply));
  const pricingLeads = V4AgentViewItems(liveLeads, l => ['rates-sent', 'negotiating'].includes(String(l.stage || '').toLowerCase()));
  const briefLeads = V4AgentViewItems(liveLeads, l => String(l.stage || '').toLowerCase() === 'done');
  const financeLeads = V4AgentViewItems(liveLeads, l => String(l.stage || '').toLowerCase() === 'invoice-sent');
  const followUps = V4AgentViewItems(liveLeads, l => Boolean(l.followUpDue));
  const xLeads = V4AgentViewItems(liveLeads, l => String(l.source || '').toLowerCase().includes('x') || String(l.source || '').toLowerCase().includes('twitter'));
  const calendarLeads = V4AgentViewItems(liveLeads, l => Boolean(l.goLiveDate || l.calendarDate || l.postingDate || l.dueDate));
  const networkLeads = V4AgentViewItems(liveLeads, l => ['follow-up', 'waiting-on-them', 'waiting', 'pitched'].includes(String(l.stage || '').toLowerCase()));
  const handoffLeads = V4AgentViewItems(liveLeads, l => Boolean(l.nextMove?.who) && /robert|sam/i.test(String(l.nextMove.who || '')));

  const workers = [
    {
      id: 'intake',
      name: 'Lead Intake',
      glyph: 'IN',
      accent: 'blue',
      habitat: 'north-west',
      zone: 'intake',
      subtitle: 'Cleans and routes new opportunities',
      owner: 'Asher',
      tone: V4AgentTone(newLeads.length, 0),
      active: newLeads.length,
      waiting: 0,
      blocked: 0,
      note: newLeads.length ? 'Fresh leads are waiting to be judged and routed.' : 'No new lead pile right now.',
      items: newLeads,
    },
    {
      id: 'reply',
      name: 'Reply Operator',
      glyph: 'RP',
      accent: 'violet',
      habitat: 'north-mid',
      zone: 'conversion',
      subtitle: 'Keeps hot threads moving',
      owner: 'Asher',
      tone: V4AgentTone(replyLeads.length, 0),
      active: replyLeads.length,
      waiting: 0,
      blocked: 0,
      note: replyLeads.length ? 'Unread or reply-now threads need fast action.' : 'No urgent reply lane right now.',
      items: replyLeads,
    },
    {
      id: 'pricing',
      name: 'Pricing Desk',
      glyph: 'PR',
      accent: 'gold',
      habitat: 'north-east',
      zone: 'conversion',
      subtitle: 'Handles packages, rates, and negotiation',
      owner: 'Asher + Sam',
      tone: V4AgentTone(pricingLeads.length, 0),
      active: pricingLeads.length,
      waiting: 0,
      blocked: 0,
      note: pricingLeads.length ? 'Pricing conversations are active and need clean package control.' : 'No live pricing back-and-forth at the moment.',
      items: pricingLeads,
    },
    {
      id: 'calendar',
      name: 'Calendar Runner',
      glyph: 'CL',
      accent: 'mint',
      habitat: 'east-high',
      zone: 'execution',
      subtitle: 'Turns timing into tasks, events, and go-live holds',
      owner: 'Asher',
      tone: V4AgentTone(calendarLeads.length, 0),
      active: calendarLeads.length,
      waiting: 0,
      blocked: 0,
      note: calendarLeads.length ? 'These deals have real dates attached and should stay visible on Robert’s calendar.' : 'No scheduled drops or meetings need calendar work right now.',
      items: calendarLeads,
    },
    {
      id: 'brief',
      name: 'Brief Maker',
      glyph: 'BF',
      accent: 'coral',
      habitat: 'east-low',
      zone: 'execution',
      subtitle: 'Turns sold deals into execution docs',
      owner: 'Asher',
      tone: V4AgentTone(briefLeads.length, 0),
      active: briefLeads.length,
      waiting: 0,
      blocked: 0,
      note: briefLeads.length ? 'These deals are sold and need clean Robert execution prep.' : 'No brief queue right now.',
      items: briefLeads,
    },
    {
      id: 'finance',
      name: 'Finance Loop',
      glyph: 'FN',
      accent: 'red',
      habitat: 'south-east',
      zone: 'retention',
      subtitle: 'Locks payment proof before live posting',
      owner: 'Asher',
      tone: V4AgentTone(financeLeads.length, financeLeads.length),
      active: financeLeads.length,
      waiting: financeLeads.length,
      blocked: financeLeads.length,
      note: financeLeads.length ? 'Money is still unresolved on these threads. No post should outrun proof.' : 'No payment blockers live right now.',
      items: financeLeads,
    },
    {
      id: 'followup',
      name: 'Follow Up Loop',
      glyph: 'FU',
      accent: 'amber',
      habitat: 'south-mid',
      zone: 'retention',
      subtitle: 'Revives threads after 2 days of silence',
      owner: 'Asher',
      tone: V4AgentTone(followUps.length, 0),
      active: followUps.length,
      waiting: followUps.length,
      blocked: 0,
      note: followUps.length ? 'These threads need nudges before they go stale.' : 'Silence queue is clear.',
      items: followUps,
    },
    {
      id: 'xwatch',
      name: 'X Watcher',
      glyph: 'XW',
      accent: 'sky',
      habitat: 'south-west',
      zone: 'intake',
      subtitle: 'Monitors X leads and routes real opportunities',
      owner: 'Robert source → Asher desk',
      tone: V4AgentTone(xLeads.length, 0),
      active: xLeads.length,
      waiting: 0,
      blocked: 0,
      note: xLeads.length ? 'X leads are in motion and should be turned into clean email threads.' : 'No live X intake pressure right now.',
      items: xLeads,
    },
    {
      id: 'network',
      name: 'Network Keeper',
      glyph: 'NW',
      accent: 'plum',
      habitat: 'west-low',
      zone: 'intake',
      subtitle: 'Keeps warm relationships from disappearing into clutter',
      owner: 'Asher',
      tone: V4AgentTone(networkLeads.length, 0),
      active: networkLeads.length,
      waiting: networkLeads.length,
      blocked: 0,
      note: networkLeads.length ? 'Warm contacts need context and gentle upkeep so they can be reactivated fast.' : 'The relationship layer is quiet right now.',
      items: networkLeads,
    },
    {
      id: 'handoff',
      name: 'Robert Handoff',
      glyph: 'RH',
      accent: 'slate',
      habitat: 'west-high',
      zone: 'conversion',
      subtitle: 'Flags what needs Robert or Sam to step in',
      owner: 'Robert + Sam',
      tone: V4AgentTone(handoffLeads.length, 0),
      active: handoffLeads.length,
      waiting: handoffLeads.length,
      blocked: 0,
      note: handoffLeads.length ? 'These threads need founder voice, approval, or a direct handoff to close the loop.' : 'No executive handoff pressure at the moment.',
      items: handoffLeads,
    },
  ];

  const filteredWorkers = workers.filter(worker => {
    if (!q) return true;
    return [
      worker.name,
      worker.subtitle,
      worker.owner,
      worker.note,
      ...worker.items.map(item => `${item.brand} ${item.contactName} ${item.nextMove?.text || ''}`),
    ].join(' ').toLowerCase().includes(q);
  });

  const totalActive = workers.reduce((sum, worker) => sum + worker.active, 0);
  const totalBlocked = workers.reduce((sum, worker) => sum + worker.blocked, 0);
  const totalWaiting = workers.reduce((sum, worker) => sum + worker.waiting, 0);
  const liveWorkers = workers.filter(worker => worker.active > 0).length;
  const zoneMeta = {
    intake: { label: 'Intake', color: '#3b82f6' },
    conversion: { label: 'Conversion', color: '#8b5cf6' },
    execution: { label: 'Execution', color: '#14b8a6' },
    retention: { label: 'Retention', color: '#f59e0b' },
  };
  const zoneOrder = ['intake', 'conversion', 'execution', 'retention'];
  const groupedWorkers = zoneOrder.map(zone => ({
    zone,
    ...zoneMeta[zone],
    workers: filteredWorkers.filter(worker => worker.zone === zone),
  }));

  const [selectedWorkerId, setSelectedWorkerId] = React.useState(null);

  const handleWorkerClick = (worker) => {
    setSelectedWorkerId(worker.id === selectedWorkerId ? null : worker.id);
  };

  return (
    <div className="page workers-page">
      <div className="page-hd">
        <div>
          <div className="page-eyebrow">Autonomy</div>
          <h1 className="page-title">Machine Room</h1>
          <div className="page-sub">Every worker lane below is wired to live board data — brands, next moves, and queue pressure.</div>
        </div>
        <div className="invoice-stats">
          <span className="invoice-stat total">{liveWorkers} workers live</span>
          <span className="invoice-stat good">{totalActive} active</span>
          <span className="invoice-stat warn">{totalWaiting} waiting</span>
          <span className="invoice-stat bad">{totalBlocked} blocked</span>
        </div>
      </div>

      <div className="machine-theater machine-theater--live">
        <div className="theater-header">
          <div>
            <div className="theater-eyebrow">Live system</div>
            <div className="theater-title">Task Floor</div>
            <div className="theater-tagline">Real queue items, real worker lanes, real next moves from your board.</div>
          </div>
          <div className="theater-legend">
            <div><span className="dot"></span> Working lane</div>
            <div><span className="dot" style={{ background: '#f59e0b' }}></span> Waiting / blocked</div>
          </div>
        </div>

        <V4LiveTaskFloor
          groupedWorkers={groupedWorkers}
          totalActive={totalActive}
          liveWorkers={liveWorkers}
          onOpenLead={onOpenLead}
        />
      </div>

      <div className="machine-panels">
        {filteredWorkers.map((worker) => (
          <div
            key={worker.id}
            className={`machine-panel accent-${worker.accent} ${selectedWorkerId === worker.id ? 'is-selected' : ''} ${worker.active > 0 ? 'has-pressure' : ''}`}
            onClick={() => handleWorkerClick(worker)}
          >
            <div className="panel-head">
              <V4WorkerPortrait worker={worker} compact isActive={worker.tone === 'active'} />
              <div>
                <div className="panel-name">{worker.name}</div>
                <div className="panel-sub">{worker.subtitle}</div>
              </div>
              <div className={`panel-status is-${worker.tone}`}>
                {worker.active}
              </div>
            </div>

            <div className="panel-metrics">
              <div><span>Active</span><strong>{worker.active}</strong></div>
              <div><span>Waiting</span><strong>{worker.waiting}</strong></div>
              <div><span>Blocked</span><strong>{worker.blocked}</strong></div>
            </div>

            <div className="panel-note">{worker.note}</div>

            {worker.items.length > 0 && (
              <div className="panel-queue">
                <div className="queue-label">Live items</div>
                {worker.items.slice(0, 3).map(item => (
                  <div
                    key={item.id}
                    className="queue-item"
                    onClick={(e) => { e.stopPropagation(); onOpenLead?.(item.id); }}
                  >
                    <strong>{item.brand}</strong>
                    <span>{item.contactName} — {item.nextMove?.text?.slice(0, 60) || 'Open thread'}</span>
                  </div>
                ))}
                {worker.items.length > 3 && <div className="queue-more">+{worker.items.length - 3} more</div>}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="machine-footer-note">
        Every chip above is a live card from your board. Click a task to open the thread.
      </div>
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
            id: 'stripe-in1tnb7mk0weauaymjhjytgwgu',
            title: 'eugenia x HASH MATRIX',
            company: 'eugenia@hashmatrix.xyz',
            folder: 'STRIPE / OPEN',
            source: 'Stripe',
            sourceDir: 'STRIPE',
            file: 'QDMSHZYY-0001',
            href: 'https://dashboard.stripe.com/invoices/in_1TnB7MK0WeauAYMJHjYTGWgU',
            kind: 'STRIPE',
            stripeStatus: 'open',
            stripePaid: false,
            stripeAmountDue: 2000.0,
            stripeAmountPaid: 0.0,
            stripeCurrency: 'USD',
            stripeDashboardUrl: 'https://dashboard.stripe.com/invoices/in_1TnB7MK0WeauAYMJHjYTGWgU',
            stripeHostedInvoiceUrl: 'https://invoice.stripe.com/i/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VbWtjYlFUM2taakpZa29iM0RJY2RWRWZ0WUd4c3hBLDE3MzIwNjMwOA0200wkqytFFO?s=ap',
            stripeInvoicePdf: 'https://pay.stripe.com/invoice/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VbWtjYlFUM2taakpZa29iM0RJY2RWRWZ0WUd4c3hBLDE3MzIwNjMwOA0200wkqytFFO/pdf?s=ap',
          },
          {
            id: 'stripe-in1tm0isk0weauaymjqeotw904',
            title: 'Vihaan Khanna, Atomik Growth,',
            company: 'vihaan@atomikgrowth.com',
            folder: 'STRIPE / OPEN',
            source: 'Stripe',
            sourceDir: 'STRIPE',
            file: 'TRBOL3JV-0001',
            href: 'https://dashboard.stripe.com/invoices/in_1Tm0ISK0WeauAYMJqeoTw904',
            kind: 'STRIPE',
            stripeStatus: 'open',
            stripePaid: false,
            stripeAmountDue: 1900.0,
            stripeAmountPaid: 0.0,
            stripeCurrency: 'USD',
            stripeDashboardUrl: 'https://dashboard.stripe.com/invoices/in_1Tm0ISK0WeauAYMJqeoTw904',
            stripeHostedInvoiceUrl: 'https://invoice.stripe.com/i/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VbFhOSDRVSWd4dVNDVDJuTTNhYm1ITHZZQlg0eER3LDE3MzIwNjMwOA0200w7IYHasF?s=ap',
            stripeInvoicePdf: 'https://pay.stripe.com/invoice/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VbFhOSDRVSWd4dVNDVDJuTTNhYm1ITHZZQlg0eER3LDE3MzIwNjMwOA0200w7IYHasF/pdf?s=ap',
          },
          {
            id: 'stripe-in1tlrt7k0weauaymj4ogww4mg',
            title: 'Peter Zheng',
            company: 'peterzheng@imerch.ai',
            folder: 'STRIPE / OPEN',
            source: 'Stripe',
            sourceDir: 'STRIPE',
            file: 'CYD6SSVP-0001',
            href: 'https://dashboard.stripe.com/invoices/in_1TlrT7K0WeauAYMJ4OgWW4mg',
            kind: 'STRIPE',
            stripeStatus: 'open',
            stripePaid: false,
            stripeAmountDue: 2575.0,
            stripeAmountPaid: 0.0,
            stripeCurrency: 'USD',
            stripeDashboardUrl: 'https://dashboard.stripe.com/invoices/in_1TlrT7K0WeauAYMJ4OgWW4mg',
            stripeHostedInvoiceUrl: 'https://invoice.stripe.com/i/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VbE9GanBDWHY1TG9CMUVYcVVuekZNYVoyR3VjVGs3LDE3MzIwNjMwOA0200Nl8IabTM?s=ap',
            stripeInvoicePdf: 'https://pay.stripe.com/invoice/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VbE9GanBDWHY1TG9CMUVYcVVuekZNYVoyR3VjVGs3LDE3MzIwNjMwOA0200Nl8IabTM/pdf?s=ap',
          },
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
            stripeHostedInvoiceUrl: 'https://invoice.stripe.com/i/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VakxmcEt4UUNhbENUN1FBNnZsd0xZQzNOdVdPSm9jLDE3MzIwNjMwOA0200K920TxRk?s=ap',
            stripeInvoicePdf: 'https://pay.stripe.com/invoice/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VakxmcEt4UUNhbENUN1FBNnZsd0xZQzNOdVdPSm9jLDE3MzIwNjMwOA0200K920TxRk/pdf?s=ap',
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
            stripeHostedInvoiceUrl: 'https://invoice.stripe.com/i/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VaTJEbTlWd3NYV3JMVGZzQ2s4OUFMM3dHM2RuVDR0LDE3MzIwNjMwOA02004SJriRxk?s=ap',
            stripeInvoicePdf: 'https://pay.stripe.com/invoice/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VaTJEbTlWd3NYV3JMVGZzQ2s4OUFMM3dHM2RuVDR0LDE3MzIwNjMwOA02004SJriRxk/pdf?s=ap',
          },
        ],
      },
      {
        label: 'Open outstanding',
        note: 'Active invoices still waiting on payment.',
        items: [
          {
            id: 'invoice-ad-og-062226',
            title: 'AD-OG',
            company: 'AD-OG',
            folder: 'OUTSTANDING / OPEN OUTSTANDING',
            source: 'Manual',
            sourceDir: 'OUTSTANDING',
            file: 'invoice_AD-OG_062226.pdf',
            href: 'flow-v4/assets/invoices/outstanding/invoice_AD-OG_062226.pdf',
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
            id: 'invoice-omane-viktor-payment2-062226',
            title: 'Omane',
            company: 'Viktor Payment2',
            folder: 'OUTSTANDING / OPEN OUTSTANDING',
            source: 'Manual',
            sourceDir: 'OUTSTANDING',
            file: 'invoice_Omane_Viktor_Payment2_062226.pdf',
            href: 'flow-v4/assets/invoices/outstanding/invoice_Omane_Viktor_Payment2_062226.pdf',
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
            stripeHostedInvoiceUrl: 'https://invoice.stripe.com/i/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VaURHYmRwNmJuODJLem9yTUVWd3FOYnZHRGgwTzhmLDE3MzIwNjMwOA0200vWSVykuM?s=ap',
            stripeInvoicePdf: 'https://pay.stripe.com/invoice/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VaURHYmRwNmJuODJLem9yTUVWd3FOYnZHRGgwTzhmLDE3MzIwNjMwOA0200vWSVykuM/pdf?s=ap',
          },
          {
            id: 'stripe-in1tmyx4k0weauaymjblyis6ms',
            title: 'YIKI EEZYCOLLAB',
            company: 'yiki@eezycollab.com',
            folder: 'STRIPE / CLOSED',
            source: 'Stripe',
            sourceDir: 'STRIPE',
            file: '5X8TBWYT-0002',
            href: 'https://dashboard.stripe.com/invoices/in_1TmYx4K0WeauAYMJbLYIs6ms',
            kind: 'STRIPE',
            stripeStatus: 'paid',
            stripePaid: false,
            stripeAmountDue: 1950.0,
            stripeAmountPaid: 1950.0,
            stripeCurrency: 'USD',
            stripeDashboardUrl: 'https://dashboard.stripe.com/invoices/in_1TmYx4K0WeauAYMJbLYIs6ms',
            stripeHostedInvoiceUrl: 'https://invoice.stripe.com/i/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VbTdCbmJnS2ZTdE5scTdYbHlDWnpuMVBMWmhqMHY5LDE3MzIwNjMwOA0200XzNQZqOx?s=ap',
            stripeInvoicePdf: 'https://pay.stripe.com/invoice/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VbTdCbmJnS2ZTdE5scTdYbHlDWnpuMVBMWmhqMHY5LDE3MzIwNjMwOA0200XzNQZqOx/pdf?s=ap',
          },
          {
            id: 'stripe-in1tmpx5k0weauaymj6b8cnxkk',
            title: 'YIKI EEZYCOLLAB',
            company: 'yiki@eezycollab.com',
            folder: 'STRIPE / CLOSED',
            source: 'Stripe',
            sourceDir: 'STRIPE',
            file: '5X8TBWYT-0001',
            href: 'https://dashboard.stripe.com/invoices/in_1TmPx5K0WeauAYMJ6b8CNXKk',
            kind: 'STRIPE',
            stripeStatus: 'void',
            stripePaid: false,
            stripeAmountDue: 1900.0,
            stripeAmountPaid: 0.0,
            stripeCurrency: 'USD',
            stripeDashboardUrl: 'https://dashboard.stripe.com/invoices/in_1TmPx5K0WeauAYMJ6b8CNXKk',
            stripeHostedInvoiceUrl: 'https://invoice.stripe.com/i/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VbHhzMFQwRmRNSjFLRnNyUGJMR3NzcjNXSVRoQlZwLDE3MzIwNjMwOA02005hi436pM?s=ap',
            stripeInvoicePdf: 'https://pay.stripe.com/invoice/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VbHhzMFQwRmRNSjFLRnNyUGJMR3NzcjNXSVRoQlZwLDE3MzIwNjMwOA02005hi436pM/pdf?s=ap',
          },
          {
            id: 'stripe-in1tlrwgk0weauaymjyas2fino',
            title: 'Peter Zheng',
            company: 'peterzheng@imerch.ai',
            folder: 'STRIPE / CLOSED',
            source: 'Stripe',
            sourceDir: 'STRIPE',
            file: 'CYD6SSVP-0002',
            href: 'https://dashboard.stripe.com/invoices/in_1TlrWgK0WeauAYMJyas2fInO',
            kind: 'STRIPE',
            stripeStatus: 'paid',
            stripePaid: false,
            stripeAmountDue: 2158.0,
            stripeAmountPaid: 2158.0,
            stripeCurrency: 'USD',
            stripeDashboardUrl: 'https://dashboard.stripe.com/invoices/in_1TlrWgK0WeauAYMJyas2fInO',
            stripeHostedInvoiceUrl: 'https://invoice.stripe.com/i/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VbE9KRVBiRkgzTUE0ZTZ1eGZBRnRVa3drVkZpR3ZRLDE3MzIwNjMwOA0200AQQTp7Xd?s=ap',
            stripeInvoicePdf: 'https://pay.stripe.com/invoice/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VbE9KRVBiRkgzTUE0ZTZ1eGZBRnRVa3drVkZpR3ZRLDE3MzIwNjMwOA0200AQQTp7Xd/pdf?s=ap',
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
            stripeHostedInvoiceUrl: 'https://invoice.stripe.com/i/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VaEwzOFNaOTJUS0swT3JMYm41NVlsMmtoNmNqcFJrLDE3MzIwNjMwOA0200uGsHhu2y?s=ap',
            stripeInvoicePdf: 'https://pay.stripe.com/invoice/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VaEwzOFNaOTJUS0swT3JMYm41NVlsMmtoNmNqcFJrLDE3MzIwNjMwOA0200uGsHhu2y/pdf?s=ap',
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
  if (V3XLeadRepliedViaX(lead)) return 'Replied via X';
  if (V4NewLeadHasPricingSignal(lead)) return 'Route to pricing';
  return 'Route to scope';
}

function V4NewLeadsView({ leads = [], query = '', onOpenLead }) {
  const q = String(query || '').trim();
  const [sourceTab, setSourceTab] = React.useState('gmail');
  const [copiedDmId, setCopiedDmId] = React.useState('');
  const copyDmDraft = async (lead, e) => {
    e?.stopPropagation?.();
    const text = String(V4BuildXDmReplyDraft(lead) || '').trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedDmId(String(lead.id));
      window.setTimeout(() => setCopiedDmId(''), 2200);
    } catch (err) {
      window.prompt('Copy this X DM draft:', text);
    }
  };
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
    travel: reviewLeads.filter(V4LeadIsTravelLead).length,
    trash: trashLeads.length,
  };

  const moveLead = (lead, nextStage) => {
    window.V3.MoveLeadStage(lead, nextStage, leads);
  };

  const isTrashTab = sourceTab === 'trash';
  const visibleLeads = React.useMemo(() => {
    if (isTrashTab) return trashLeads;
    return reviewLeads.filter(lead => {
      if (sourceTab === 'travel') return V4LeadIsTravelLead(lead);
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
          {counts.travel > 0 ? <span className="invoice-stat warn">{counts.travel} travel</span> : null}
          <span className="invoice-stat total">{counts.total} total</span>
        </div>
      </div>

      <div className="new-leads-shell">
        <div className="new-leads-tabs" role="tablist" aria-label="New lead sources">
          {[
            { key: 'travel', label: 'Travel', count: counts.travel },
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
                        <span className={'new-lead-workflow-chip' + (V3XLeadRepliedViaX(lead) ? ' is-x-replied' : (hasPricingSignal ? ' is-pricing' : ' is-scope'))}>{workflowLabel}</span>
                        {kind === 'x' && V3XLeadRepliedViaX(lead) ? <span className="new-lead-x-replied-note">No email — reply was on X</span> : null}
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
                    {kind === 'x' && V4XLeadNeedsDmReply(lead) ? (
                      <button
                        type="button"
                        className={'btn btn-sm btn-accent' + (copiedDmId === String(lead.id) ? ' is-copied' : '')}
                        onClick={(e) => copyDmDraft(lead, e)}
                      >
                        <V3Icon name="reply" w={12} />
                        {copiedDmId === String(lead.id) ? 'Copied' : 'Copy DM draft'}
                      </button>
                    ) : null}
                    {kind === 'x' && lead.xOpenDm ? (
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => window.open(lead.xOpenDm, '_blank', 'noopener')}>
                        <V3Icon name="network" w={12} />
                        Open DM
                      </button>
                    ) : null}
                    {kind === 'x' && V3LeadExternalEmail(lead) ? (
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
    title: 'ACL / July 5 scope hold plus 8 outlines',
    tags: ['P0', 'outlines now', 'no July 6-7'],
    points: [
      'Annika asked on June 30 for 8 script outlines the next day and tried to move the Qoder interview to July 6 or 7 because that lead cannot do July 5.',
      'Asher already held the line that July 5 stays the only covered day: paper authors at 1:00-1:30 PM PDT, Qoder Work at 1:30-2:00 PM PDT, and Qoder either fits July 5 or drops to written Q&A.',
      'Asher owns the 8-outline batch, the Qwen Cloud based Robert prep, and all ticket or reimbursement cleanup in the same email chain.',
      'Do not let late client logistics reopen scope. July 6 or 7 is not included unless the deal changes first.',
    ],
  },
  {
    title: 'AZ8 / Payoneer invoice needed before any post',
    tags: ['P0', 'invoice now', 'payment first'],
    points: [
      'Kevin accepted the $1,200 courtesy rate and on July 1 asked for a Payoneer invoice with the Payoneer email and agreed amount.',
      'The same thread also tried to move payment to after the post, and Asher correctly reset policy that payment proof lands before Robert posts.',
      'Asher owns the Payoneer invoice, payment-proof chase, and the brief request before Robert time is scheduled.',
      'Alternative payment methods are not a reason to weaken prepaid terms. No receipt, no execution.',
    ],
  },
  {
    title: 'AD&OG / screenshot received, verify then schedule',
    tags: ['P0', 'verify payment', 'brief next'],
    points: [
      'Evie sent a payment screenshot on June 30 after accepting the 100 percent upfront policy for the $1,995 custom X post.',
      'Asher already replied asking for the new calendar date because the original June 24 window passed, so the lane is now payment verification plus rescheduling.',
      'Asher owns finance confirmation, the 60-second Robert brief, and the ask for must-use assets or talking points once funds are real.',
      'A screenshot saying paid is still provisional until the finance trail matches it.',
    ],
  },
  {
    title: 'OJO / brief is live, script and login check due',
    tags: ['P0', 'brief live', 'robert prep'],
    points: [
      'EezyCollab reopened the OJO lane on July 1, shared the product link, invitation code, and live brief, and asked for a shooting idea or script today plus confirmation that login works.',
      'This is Robert-prep work, not passive watch. Someone has to verify access, pull the usable angle, and answer in the same thread fast.',
      'Asher owns the brief digestion, login-status confirmation, and a tight Robert-ready script ask or first-angle response.',
      'A fresh brief is not enough by itself. Confirm access and the exact deliverable before Robert records anything.',
    ],
  },
  {
    title: 'Cline / accepted at $2,195 but still not booked cleanly',
    tags: ['P1', 'invoice missing', 'launch slipped'],
    points: [
      'Pratham accepted the revised $2,195 quote-post package with engagement and sent billing details plus the creator brief.',
      'The requested June 29 launch window already slipped and the thread still does not show a sent invoice, payment proof, or a canonical live source post.',
      'Asher owns the invoice trail, payment capture, and the reset on timing before Robert touches execution.',
      'A yes plus billing details is still not a booked collaboration until payment and source-link proof exist in-thread.',
    ],
  },
];

const V4_COMPANY_OS_WAITING = [
  {
    title: 'Riverside / hold until official press release or final live URL',
    tags: ['watch', 'client hold', 'approval path'],
    points: [
      'Savion said on June 30 to hold publishing until the PMM team sends the official press release so the wording lines up.',
      'The referral link and code are in hand, but that is still prep material until the final approval path or live source lands.',
      'Keep this warm and ready, but do not call it clear until Robert\'s live post link goes back into the thread.',
      'Client hold beats calendar urgency every time.',
    ],
  },
  {
    title: 'Viture / payment initiated, receipt and kickoff pack still missing',
    tags: ['watch', 'payment initiated', 'retainer start'],
    points: [
      'Leo said on June 28 that Viture finance had initiated payment and would keep the team updated.',
      'What is still missing is the actual receipt plus the initial campaign priorities, key dates, and launch roadmap for month one.',
      'Do not allocate Robert time yet. Keep the lane warm until it is both paid and briefed.',
      'Finance in process is not the same as a funded retainer start.',
    ],
  },
  {
    title: 'FORKOFF / moved to WhatsApp, but email trail is not clean',
    tags: ['watch', 'schedule noise', 'payment unclear'],
    points: [
      'JK said to lock tomorrow\'s schedule and shared campaign details on WhatsApp, but the email thread still does not show a clean timing or payment summary.',
      'Asher replied that there was a misunderstanding and pushed back to WhatsApp, which means the email record is now incomplete.',
      'Keep this on watch until the real schedule, deliverable, and payment path are restated somewhere canonical.',
      'Off-thread coordination is useful, but the board should not treat it as settled until the core facts are captured cleanly.',
    ],
  },
  {
    title: 'ACTI / only the canonical live source post clears execution',
    tags: ['watch', 'source link', 'launch control'],
    points: [
      'The launch thread is live-context work, so draft copy and confidential assets still do not replace the final official post Robert is meant to quote.',
      'Keep this waiting until the canonical source post and any final quote guidance are explicitly in-thread.',
      'Do not let prep material masquerade as launch clearance.',
      'The real post URL is the trigger, not the preview copy.',
    ],
  },
  {
    title: 'iMerch / paid but still waiting for a real go signal',
    tags: ['watch', 'paid', 'client hold'],
    points: [
      'Peter already sent receipts and backup creative, but the team still wants to wait for the right Elon rocket post before choosing the live path.',
      'Nothing should publish until Peter sends an explicit go or stand-down message.',
      'Keep it warm, but do not let a paid hold outrank lanes that still need payment proof or a launch reset.',
      'Paid does not mean publish-approved.',
    ],
  },
];

const V4_COMPANY_OS_DONE = [
  {
    title: 'AhaCreator / W-9 closed',
    tags: ['June 24 admin', 'live link logged', 'closed'],
    points: [
      'Lumina asked for the W-9 after confirming payment, and Asher sent the W-9 PDF on June 24, 2026.',
      'The Robert live link had already been delivered on June 15, 2026, so the last open admin item is now cleared.',
      'This lane is closed on both the content and paperwork side.',
      'Keep the live link and W-9 in-thread as the completion trail.',
    ],
  },
  {
    title: 'RunLayer / June 25 QRT',
    tags: ['June 25 live', 'wire note landed', 'closed enough'],
    points: [
      'Marketing Guys sent the live source link on June 25, 2026 and Asher returned Robert\'s final live QRT link in-thread the same morning.',
      'They also attached the wire confirmation and then confirmed the link cleanup was fine.',
      'This lane is no longer waiting on a brief, schedule, or live asset.',
      'The only thing that matters now is keeping the live link and wire note together as proof.',
    ],
  },
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
  'Asher owns replies, invoice links, payment-proof capture, final live links, scheduling cleanup, tax-doc follow-through, product retests, and every 60-second Robert brief. Sam escalates. Robert executes only after the lane is clean.',
  'A client saying payment is initiated, cleared, or coming tomorrow is not finance done. Keep chasing until the receipt, wire proof, or settled invoice trail is visible in-thread.',
  'A screenshot that says payment was sent is still provisional. Treat it as pending until the actual finance trail or bank confirmation matches.',
  'An invoice request, a sent invoice, or an open Stripe invoice is not execution clearance. Scope, payment proof, timing, and the final source post still have to line up in the same thread.',
  'If a client asks to pay after posting, restate prepaid policy immediately and do not let alt rails like Payoneer, PayPal, or wire bypass that rule.',
  'If Asher promises an exact launch time externally, the lane stays open until the actual Robert live URL is returned to the client in email.',
  'Confidential launch copy, draft videos, and pre-release docs are prep material only. Robert should never post from those assets without the canonical live source link.',
  'If the client says hold for a press release, approval pass, launch wording, or exact date, that hold beats the calendar every time.',
  'Keep all ACL / conference coordination in the active email chain so travel, scripts, reimbursement, interviews, and approvals do not split across side channels.',
  'If details move to WhatsApp, Discord, or X DMs, pull the non-negotiables back into email before calling the lane scheduled, paid, or execution-ready.',
  'Bundle asks, consecutive-post plans, and retainer chatter do not remove paid-collab discipline. Lock cadence, formats, dates, owner, and story before pricing custom packaging.',
  'Do-not-touch means no proactive poke unless the client reopens the lane or an already-promised finance / live-link artifact is still missing.',
  'Every Robert brief must fit inside 60 seconds and include company, deliverable, timing, source link, approval path, payment state, owner, and why Robert is the right fit now.',
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
  try {
    if (!V4IsGithubHostedPage()) return false;
    if (/[?&]stay=github(?:&|$)/.test(String(window.location.search || ''))) return false;
    const path = String(window.location.pathname || '/').replace(/^\/UNALIGNED\/?/, '/') || '/';
    window.location.replace(V4_BRIEF_TAILSCALE_BASE_URL + path + window.location.search + window.location.hash);
    return true;
  } catch (err) {
    return false;
  }
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
    id: 'x-signal',
    title: 'X Signal',
    status: 'New',
    kind: 'Signal',
    useFor: 'Score post drafts against the live X conversation before Robert posts.',
    trigger: 'Run reach signal. Score these drafts. Find the strongest X angle.',
    output: 'Relative reach score, live terms, anchor thread, and ranked draft guidance',
    note: 'This is a wave-stack tool. It helps pick the strongest option right now. It is not an impressions guarantee.',
  },
  {
    id: 'manual-lead',
    title: 'Manual Lead Intake',
    status: 'New',
    kind: 'Operator',
    useFor: 'Turn Robert iMessage screenshots or pasted lead text into a clean New Lead.',
    trigger: 'Paste a lead. Drop screenshot. Build Robert handoff.',
    output: 'New Lead card plus Robert intro draft for Asher and Sam approval',
    note: 'This fills the gap when Robert sends screenshots that Gmail and X cannot scrape.',
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
  if (typeof V3LeadMatchesQuery === 'function') return V3LeadMatchesQuery(lead, query);
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

function V4XLeadNeedsDmReply(lead) {
  if (!V3IsXLeadRecord(lead)) return false;
  if (V3LeadExternalEmail(lead)) return false;
  const state = V3InferXReplyState(lead);
  if (state.needsXReply) return true;
  const nextStep = String(lead?.xBestNextStep || lead?.nextMove?.text || '').toLowerCase();
  if (
    nextStep.includes('reply in x')
    || nextStep.includes('review thread')
    || nextStep.includes('move them to email')
    || nextStep.includes('move the deal off x')
  ) return true;
  // No email on card yet — keep DM draft available (handoff / follow-up on X).
  return true;
}

function V4BuildXDmReplyDraft(lead) {
  const saved = String(lead?.xDmDraft || lead?.xQuickNote || '').trim();
  if (saved.length > 24) return V3NoDashes(saved);

  const first = V3ExternalThreadFirstName(lead);
  const nextStep = String(lead?.xBestNextStep || lead?.nextMove?.text || '').trim().toLowerCase();
  const replied = V3XLeadRepliedViaX(lead);
  const externalEmail = V3LeadExternalEmail(lead);
  const mode = V4XConversationMode(lead);
  const needsHandoff = V4XShouldEmailHandoff(lead) && (
    !externalEmail
    || nextStep.includes('reply in x')
    || nextStep.includes('move them to email')
    || nextStep.includes('move the deal off x')
  );
  const greeting = first && first !== 'there' ? `Hi ${first}!` : 'Hi!';

  if (!V4XShouldEmailHandoff(lead)) {
    return V3NoDashes([
      greeting,
      '',
      V4XLeadDmOpener(lead, { mode, replied }),
    ].join('\n'));
  }

  if (replied && !externalEmail) {
    return V3NoDashes([
      greeting,
      '',
      V4XLeadDmOpener(lead, { mode, replied: true }),
      '',
      V4XHandoffLine(lead),
      '',
      V4XHandoffClose(lead),
    ].join('\n'));
  }

  if (needsHandoff) {
    return V3NoDashes([
      greeting,
      '',
      V4XLeadDmOpener(lead, { mode, replied }),
      '',
      V4XHandoffLine(lead),
      '',
      V4XHandoffClose(lead),
    ].join('\n'));
  }

  const operatorNext = String(lead?.operatorSummary?.next_action || '').trim();
  if (operatorNext && operatorNext.length < 320) {
    return V3NoDashes([
      first && first !== 'there' ? `Hi ${first},` : 'Hi,',
      '',
      operatorNext,
    ].join('\n'));
  }

  return V3NoDashes([
    first && first !== 'there' ? `Hi ${first},` : 'Hi,',
    '',
    nextStep ? String(lead?.xBestNextStep || lead?.nextMove?.text || '').trim() : 'Thanks for reaching out on X.',
  ].join('\n')).trim();
}

function V4XLeadContextRows(lead) {
  if (!lead) return [];
  const ctx = V3ParseXDescriptionContext(lead.rawDescription);
  const rows = [];
  if (V3XLeadRepliedViaX(lead)) {
    rows.push({
      label: 'Team reply',
      value: lead.xLastRobertMessage || ctx.lastRobertMessage || 'Robert replied on X — waiting on them.',
    });
  }
  const summary = lead.notes || ctx.xSummary || '';
  const latestDm = lead.evidence || lead.xLastLeadMessage || ctx.lastMessage || '';
  if (summary) rows.push({ label: 'Intake summary', value: summary });
  if (latestDm && latestDm !== summary) rows.push({ label: 'Latest DM', value: latestDm });
  const nextStep = lead.xBestNextStep || ctx.bestNextStep || lead.nextMove?.text || '';
  if (nextStep) rows.push({ label: 'Best next step', value: nextStep });
  const status = lead.xCurrentStatus || ctx.xCurrentStatus || '';
  if (status) rows.push({ label: 'Scraper status', value: status });
  if (lead.xContactInfo) rows.push({ label: 'Contact info', value: lead.xContactInfo });
  return rows;
}

function V4XIntakeCleanDm(text) {
  return V4CleanDisplayText(text)
    .replace(/\b\d{1,2}:\d{2}\s*(?:AM|PM)(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM))*\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function V4XIntakeDmBody(lead) {
  if (!lead) return '';
  const ctx = V3ParseXDescriptionContext(lead.rawDescription);
  let body = V4XIntakeCleanDm(lead.evidence || lead.xLastLeadMessage || ctx.lastMessage || '');
  if (body) return body;
  const summary = String(lead.notes || ctx.xSummary || '');
  const fromSummary = summary.match(/Latest lead message:\s*(.+?)(?:\s+Robert['’]s latest|$)/i);
  if (fromSummary) return V4XIntakeCleanDm(fromSummary[1]);
  return V4XIntakeCleanDm(summary);
}

function V4XIntakeGist(lead) {
  const pitch = V4XLeadPitchRef(lead);
  if (pitch) {
    const line = pitch.charAt(0).toUpperCase() + pitch.slice(1);
    return line.endsWith('.') ? line : `${line}.`;
  }
  const body = V4XIntakeDmBody(lead);
  if (!body) return '';
  if (body.length <= 140) return body;
  return `${body.slice(0, 137).trim()}…`;
}

function V4XIntakeNextStepShort(lead) {
  const step = String(lead?.xBestNextStep || lead?.nextMove?.text || '').trim();
  if (!step) return '';
  if (/reply in x/i.test(step) && /email/i.test(step)) return 'Reply on X, then move to email';
  if (step.length <= 56) return step;
  return `${step.slice(0, 53).trim()}…`;
}

function V4XIntakeHandle(lead) {
  const handle = String(lead?.xHandle || '').trim();
  if (handle) return handle.replace(/^@/, '');
  const info = String(lead?.xContactInfo || '').trim();
  const match = info.match(/@([A-Za-z0-9_]{1,30})/);
  return match ? match[1] : '';
}

function V4XIntakePanel({ lead }) {
  const [dmOpen, setDmOpen] = React.useState(false);
  if (!lead) return null;
  const gist = V4XIntakeGist(lead);
  const dm = V4XIntakeDmBody(lead);
  const handle = V4XIntakeHandle(lead);
  const email = V3LeadExternalEmail(lead);
  const next = V4XIntakeNextStepShort(lead);
  const status = String(lead.xCurrentStatus || '').trim();
  const robertReply = V3XLeadRepliedViaX(lead)
    ? V4XIntakeCleanDm(lead.xLastRobertMessage || '')
    : '';
  const dmLong = dm.length > 300;
  const dmShow = dmOpen || !dmLong ? dm : `${dm.slice(0, 297).trim()}…`;
  const typeLabel = V4CleanDisplayText(lead.deliverables || 'X DM');

  return (
    <div className="cos-x-intake">
      <div className="cos-x-intake-top">
        <div className="cos-x-intake-copy">
          <div className="cos-x-intake-eyebrow">X intake</div>
          <h3 className="cos-x-intake-title">{V4CleanDisplayText(lead.contactName || lead.brand || 'X lead')}</h3>
          {gist ? <p className="cos-x-intake-gist">{gist}</p> : null}
        </div>
        {lead.xOpenDm ? (
          <button className="cos-quick-btn" type="button" onClick={() => window.open(lead.xOpenDm, '_blank', 'noopener')}>
            Open DM
          </button>
        ) : null}
      </div>
      <div className="cos-x-intake-chips">
        {handle ? <span className="cos-x-intake-chip">@{handle}</span> : null}
        <span className="cos-x-intake-chip">{typeLabel}</span>
        <span className="cos-x-intake-chip">{lead.xMessageCount || 1} DM{(lead.xMessageCount || 1) === 1 ? '' : 's'}</span>
        <span className={'cos-x-intake-chip' + (email ? ' is-good' : ' is-muted')}>{email || 'No email yet'}</span>
      </div>
      {dm ? (
        <div className="cos-x-intake-quote">
          <div className="cos-x-intake-quote-label">They said</div>
          <p>{dmShow}</p>
          {dmLong ? (
            <button type="button" className="cos-x-intake-toggle" onClick={() => setDmOpen(open => !open)}>
              {dmOpen ? 'Show less' : 'Show full message'}
            </button>
          ) : null}
        </div>
      ) : (
        <p className="cos-x-intake-empty">No DM text saved yet. Click <strong>↻ Pull X context</strong> above.</p>
      )}
      {robertReply ? (
        <div className="cos-x-intake-robert">
          <span className="cos-x-intake-robert-label">Robert replied</span>
          <p>{robertReply}</p>
        </div>
      ) : null}
      {next ? (
        <div className="cos-x-intake-next">
          <span className="cos-x-intake-next-label">Next</span>
          <span>{next}</span>
        </div>
      ) : null}
      {status ? (
        <details className="cos-x-intake-details">
          <summary>Scraper details</summary>
          <span>{status}</span>
        </details>
      ) : null}
    </div>
  );
}

function V4CompanyOsLeadSourceChannel(lead) {
  if (V3IsXLeadRecord(lead)) return 'x';
  if (window.V3?.NewLeadSourceKind) return window.V3.NewLeadSourceKind(lead);
  const source = String(lead?.source || '').toLowerCase();
  if (source === 'x' || source.includes('x-dm') || source.includes('twitter_dm') || lead?.xOpenDm) return 'x';
  return 'gmail';
}

function V4CompanyOsMatchesSourceFilter(lead, filter) {
  const mode = String(filter || 'all').toLowerCase();
  if (!mode || mode === 'all') return true;
  return V4CompanyOsLeadSourceChannel(lead) === mode;
}

function V4CompanyOsMailboxOrigin(lead) {
  const source = String(lead?.source || '').toLowerCase();
  if (source === 'x' || lead?.xOpenDm) return 'x';
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
  if (status === 'review') return { label: 'Needs review', tone: 'warn' };
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
    email_context: '',
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
  if (form.email_context) payload.email_context = String(form.email_context).trim();
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
// Pull fresh Gmail + X bridge data from the Mac, then reload Supabase + intake JSON into memory.
// Shift+click (includeXScrape) also runs the live X Chrome scrape (~2–5 min, Chrome must be open).
async function V4RefreshAllData(opts = {}) {
  const quiet = !!opts.quiet;
  const includeXScrape = !!opts.includeXScrape;
  if (window.__v4RefreshRunning) {
    if (!quiet) return { ok: false, skipped: true, reason: 'refresh already running' };
    return { ok: false, skipped: true };
  }
  window.__v4RefreshRunning = true;
  if (!quiet) window.dispatchEvent(new CustomEvent('v4:refresh-started', { detail: { includeXScrape } }));
  const summary = { includeXScrape, gmail: null, xBridge: null, xScrape: null, boardReloaded: false };
  try {
    try {
      const res = await V4BriefServiceFetch('/refresh-dashboard', {
        method: 'POST',
        body: JSON.stringify({ include_x_scrape: includeXScrape }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || ('Refresh service failed (' + res.status + ')'));
      }
      summary.gmail = data.gmail_delta || null;
      summary.xBridge = data.x_bridge || null;
      summary.xScrape = data.x_scrape || null;
    } catch (err) {
      if (!quiet) console.warn('[ALIGNED v4] Mac refresh unavailable, reloading board only:', err?.message || err);
    }
    await V3ReloadLeads({ cacheBust: Date.now() });
    summary.boardReloaded = true;
    window.dispatchEvent(new CustomEvent('v4:refresh-complete', { detail: summary }));
    return { ok: true, ...summary };
  } catch (err) {
    window.dispatchEvent(new CustomEvent('v4:refresh-error', { detail: { error: err?.message || String(err) } }));
    throw err;
  } finally {
    window.__v4RefreshRunning = false;
  }
}

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

  // Live daily brief computation (ported for the working bundle)
  function buildBriefPoints(lead) {
    const points = [];
    const phase = (typeof V4CompanyOsPhase === 'function' && V4CompanyOsPhase(lead)) || lead.stage || 'intake';
    if (lead.nextMove && lead.nextMove.text) points.push(lead.nextMove.text);
    if (lead.operatorSummary && lead.operatorSummary.lead_summary) points.push(lead.operatorSummary.lead_summary);
    if (lead.unread || lead.needsReply) points.push('New reply in thread — handle before anything else.');
    if (lead.stage === 'invoice-sent') points.push('Invoice out. Get payment proof + timing locked.');
    if ((lead.daysInStage || 0) >= 8) points.push(`${lead.daysInStage}d with no movement.`);
    if (lead.value) points.push(`${(typeof V4CompanyOsMoney === 'function' ? V4CompanyOsMoney(lead.value) : '$' + lead.value)} at ${String(phase).toLowerCase()}.`);
    if (lead.briefTitle || lead.briefBody) points.push('Brief material exists.');
    if (points.length === 0) points.push('Review thread and advance the lane.');
    return points.slice(0, 4);
  }

  const brief = React.useMemo(() => {
    const active = (leads || []).filter(l => !['trash', 'dead-leads', 'paid-out'].includes(l.stage));
    const actionLeads = active.filter(V4IsActionNowLead)
      .sort(V4SortActionLeads).slice(0, 5);
    const watchLeads = active.filter(l => !l.needsReply && ['rates-sent', 'negotiating', 'first-touch', 'engaged'].includes(l.stage))
      .sort((a, b) => (b.lastTouchAt ? Date.parse(b.lastTouchAt) : 0) - (a.lastTouchAt ? Date.parse(a.lastTouchAt) : 0)).slice(0, 5);
    const closedLeads = (leads || []).filter(l => ['done', 'paid-out'].includes(l.stage))
      .sort((a, b) => (b.lastTouchAt ? Date.parse(b.lastTouchAt) : 0) - (a.lastTouchAt ? Date.parse(a.lastTouchAt) : 0)).slice(0, 4);

    const toItem = (lead) => ({
      id: lead.id,
      title: `${lead.brand} — ${ (typeof V4CompanyOsPhase === 'function' ? V4CompanyOsPhase(lead) : lead.stage) }`,
      tags: [ (typeof V4CompanyOsPriority === 'function' ? V4CompanyOsPriority(lead) : 'P1'), lead.stage ].filter(Boolean),
      points: buildBriefPoints(lead)
    });
    return { action: actionLeads.map(toItem), watch: watchLeads.map(toItem), closed: closedLeads.map(toItem) };
  }, [leads]);

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
            <div className="cos-panel-head"><h3>Current priorities</h3><span className="cos-panel-count">{(brief.action || []).length}</span></div>
            <div className="cosov-priorities">
              {(brief.action || []).slice(0, 4).map(item => (
                <div key={item.id || item.title} className="cosov-priority">
                  <strong>{item.title}</strong>
                  <span className="cos-chips">
                    {item.tags.slice(0, 3).map(t => <span key={t} className="cos-chip cos-chip-tight">{t}</span>)}
                  </span>
                </div>
              ))}
              {(brief.action || []).length === 0 && <div className="dq-empty">Nothing urgent right now.</div>}
            </div>
          </section>
        </div>
      </div>

      <V4CosBriefBoard leads={leads} />
    </div>
  );
}

function V4CosBriefBoard({ leads = [] }) {
  const todayLabel = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const briefData = React.useMemo(() => {
    // Reuse the brief computed in parent scope if possible, else recompute
    if (typeof brief !== 'undefined' && brief) return brief;
    const active = (leads || []).filter(l => !['trash', 'dead-leads', 'paid-out'].includes(l.stage));
    const actionLeads = active.filter(V4IsActionNowLead)
      .sort(V4SortActionLeads).slice(0, 5);
    const watchLeads = active.filter(l => !l.needsReply && ['rates-sent','negotiating','first-touch','engaged'].includes(l.stage))
      .sort((a,b)=>(b.lastTouchAt?Date.parse(b.lastTouchAt):0)-(a.lastTouchAt?Date.parse(a.lastTouchAt):0)).slice(0,5);
    const closedLeads = (leads||[]).filter(l=>['done','paid-out'].includes(l.stage))
      .sort((a,b)=>(b.lastTouchAt?Date.parse(b.lastTouchAt):0)-(a.lastTouchAt?Date.parse(a.lastTouchAt):0)).slice(0,4);
    const toItem = (lead) => ({
      id: lead.id,
      title: `${lead.brand} — ${ (typeof V4CompanyOsPhase==='function'?V4CompanyOsPhase(lead):lead.stage) }`,
      tags: [(typeof V4CompanyOsPriority==='function'?V4CompanyOsPriority(lead):'P1'), lead.stage].filter(Boolean),
      points: (typeof buildBriefPoints === 'function' ? buildBriefPoints(lead) : ['Review thread'])
    });
    return { action: actionLeads.map(toItem), watch: watchLeads.map(toItem), closed: closedLeads.map(toItem) };
  }, [leads]);

  const lastTs = (leads || []).reduce((max, l) => {
    const t = l.lastTouchAt ? Date.parse(l.lastTouchAt) : 0; return t > max ? t : max;
  }, 0);
  const refreshed = lastTs ? (typeof V3RelativeTime === 'function' ? V3RelativeTime(new Date(lastTs).toISOString()) : 'recently') : '—';

  return (
    <section className="cos-section cos-brief" style={{ padding: '18px 22px 40px' }}>
      <div className="cos-brief-head">
        <div>
          <div className="cos-section-eyebrow-row">
            <span className="cos-eyebrow">Daily Operating Brief</span>
            <span className="cos-section-date">{todayLabel}</span>
            <span className="cos-live-badge">live · {refreshed}</span>
          </div>
          <h2 className="cos-section-title">Action needed, what we are waiting on, and recent wins</h2>
        </div>
        <p className="cos-section-sub">
          Computed live from Supabase + activity data.
        </p>
      </div>
      <div className="cos-brief-grid">
        <section className="cos-panel cos-panel-prep">
          <div className="cos-panel-head">
            <h3>Needs Prep / Action</h3>
            <span className="cos-panel-count">{(briefData.action || []).length}</span>
          </div>
          <div className="cos-panel-body">
            {(briefData.action || []).length > 0
              ? (briefData.action || []).map(item => <V4CompanyOsActionItem key={item.id} item={item} />)
              : <div className="cos-empty">No urgent action items.</div>}
          </div>
        </section>
        <section className="cos-panel cos-panel-watch">
          <div className="cos-panel-head">
            <h3>Watch / Waiting</h3>
            <span className="cos-panel-count">{(briefData.watch || []).length}</span>
          </div>
          <div className="cos-panel-body">
            {(briefData.watch || []).length > 0
              ? (briefData.watch || []).map(item => <V4CompanyOsWatchItem key={item.id} item={item} />)
              : <div className="cos-empty">Nothing in watch right now.</div>}
          </div>
        </section>
        <section className="cos-panel cos-rules">
          <div className="cos-panel-head">
            <h3>Operating Rules</h3>
            <span className="cos-panel-count">{(typeof V4_COMPANY_OS_RULES !== 'undefined' ? V4_COMPANY_OS_RULES.length : 0)}</span>
          </div>
          <ul>
            {(typeof V4_COMPANY_OS_RULES !== 'undefined' ? V4_COMPANY_OS_RULES : []).map(rule => <li key={rule}>{rule}</li>)}
          </ul>
        </section>
        <section className="cos-panel cos-panel-done">
          <div className="cos-panel-head">
            <h3>Recently closed</h3>
            <span className="cos-panel-count">{(briefData.closed || []).length}</span>
          </div>
          <div className="cos-done-grid">
            {(briefData.closed || []).length > 0
              ? (briefData.closed || []).map(item => <V4CompanyOsDoneItem key={item.id} item={item} />)
              : <div className="cos-empty">No recent closes.</div>}
          </div>
        </section>
      </div>
    </section>
  );
}

function V4CosToolkit({ onNavigateView, onActivateSplit }) {
  const [briefMakerOpen, setBriefMakerOpen] = React.useState(false);
  const [xSignalOpen, setXSignalOpen] = React.useState(false);
  const [xSignalForm, setXSignalForm] = React.useState({
    brand: '',
    topic: '',
    handle: '',
    tag: '',
    link: '',
    hashtags: '',
    drafts_text: '',
  });
  const [xSignalStatus, setXSignalStatus] = React.useState('idle');
  const [xSignalError, setXSignalError] = React.useState('');
  const [xSignalResult, setXSignalResult] = React.useState(null);
  const [handoffPreviewOpen, setHandoffPreviewOpen] = React.useState(false);
  const [handoffPreviewStatus, setHandoffPreviewStatus] = React.useState('idle');
  const [handoffPreviewError, setHandoffPreviewError] = React.useState('');
  const [handoffPreviewData, setHandoffPreviewData] = React.useState(null);
  const [handoffCopiedIndex, setHandoffCopiedIndex] = React.useState(-1);
  const [manualLeadOpen, setManualLeadOpen] = React.useState(false);
  const [manualLeadText, setManualLeadText] = React.useState('');
  const [manualLeadImage, setManualLeadImage] = React.useState('');
  const [manualLeadImageName, setManualLeadImageName] = React.useState('');
  const [manualLeadStatus, setManualLeadStatus] = React.useState('idle');
  const [manualLeadError, setManualLeadError] = React.useState('');
  const [manualLeadResult, setManualLeadResult] = React.useState(null);
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
  const [briefJobStage, setBriefJobStage] = React.useState('');
  const [briefJobStageDetail, setBriefJobStageDetail] = React.useState('');
  const [docStatus, setDocStatus] = React.useState('idle');
  const [docError, setDocError] = React.useState('');
  const [docResult, setDocResult] = React.useState(null);
  const [notionStatus, setNotionStatus] = React.useState('idle');
  const [notionError, setNotionError] = React.useState('');
  const [calendarStatus, setCalendarStatus] = React.useState('idle');
  const [calendarError, setCalendarError] = React.useState('');
  const [calendarResult, setCalendarResult] = React.useState(null);
  const briefDebugStage = React.useMemo(() => {
    try {
      const current = new URL(String(window.location?.href || ''));
      return String(current.searchParams.get('debugBriefStage') || '').trim();
    } catch (err) {
      return '';
    }
  }, []);
  const briefConfig = React.useMemo(() => V4BriefMakerConfig(briefForm), [briefForm]);
  const briefJson = React.useMemo(() => JSON.stringify(briefConfig, null, 2), [briefConfig]);
  const briefWorkflowSteps = React.useMemo(() => [
    { key: 'reading_source', label: 'Source' },
    { key: 'extracting_facts', label: 'Facts' },
    { key: 'writing_drafts', label: 'Drafts' },
    { key: 'creating_doc', label: 'Doc' },
    { key: 'creating_calendar', label: 'Calendar' },
  ], []);
  const effectiveBriefJobStatus = briefDebugStage ? 'running' : briefJobStatus;
  const effectiveBriefJobStage = briefDebugStage || briefJobStage;
  const effectiveBriefJobStageDetail = React.useMemo(() => {
    if (!briefDebugStage) return briefJobStageDetail;
    const labels = {
      reading_source: 'Reading source brief',
      extracting_facts: 'Extracting campaign facts',
      writing_drafts: 'Writing draft options',
      creating_doc: 'Creating Google Doc',
      creating_calendar: 'Creating calendar item',
    };
    return labels[briefDebugStage] || 'Running brief build';
  }, [briefDebugStage, briefJobStageDetail]);
  const effectiveNotionStatus = briefDebugStage ? 'importing' : notionStatus;
  const effectiveDocStatus = briefDebugStage ? 'creating' : docStatus;
  const briefLoadingActive = (effectiveNotionStatus === 'importing' || effectiveDocStatus === 'creating') && effectiveNotionStatus !== 'error' && effectiveDocStatus !== 'error';
  const briefWorkflowIndex = React.useMemo(() => {
    if (effectiveBriefJobStatus === 'queued') return 0;
    if (effectiveBriefJobStage === 'reading_source') return 0;
    if (effectiveBriefJobStage === 'extracting_facts') return 1;
    if (effectiveBriefJobStage === 'writing_drafts') return 2;
    if (effectiveBriefJobStage === 'creating_doc' || effectiveBriefJobStage === 'writing_doc' || effectiveBriefJobStage === 'building_doc') return 3;
    if (effectiveBriefJobStage === 'inferring_calendar' || effectiveBriefJobStage === 'creating_calendar') return 4;
    if (effectiveBriefJobStage === 'done') return briefWorkflowSteps.length - 1;
    return 0;
  }, [effectiveBriefJobStage, effectiveBriefJobStatus, briefWorkflowSteps.length]);
  const briefProgressNote = React.useMemo(() => {
    if (effectiveBriefJobStatus === 'queued') return 'Saved to your brief machine. Build is queued now.';
    if (effectiveBriefJobStageDetail) return effectiveBriefJobStageDetail;
    if (effectiveBriefJobStage === 'reading_source') return 'Reading source brief';
    if (effectiveBriefJobStage === 'extracting_facts') return 'Extracting campaign facts';
    if (effectiveBriefJobStage === 'writing_drafts') return 'Writing draft options';
    if (effectiveBriefJobStage === 'creating_doc') return "Creating Robert's Google Doc";
    if (effectiveBriefJobStage === 'writing_doc') return 'Writing Google Doc content';
    if (effectiveBriefJobStage === 'inferring_calendar') return 'Reading posting date';
    if (effectiveBriefJobStage === 'creating_calendar') return 'Creating calendar item';
    if (effectiveBriefJobStatus === 'running') return 'Job running on your Mac. You can leave this screen and come back.';
    return "Reading the link and building Robert's Google Doc in the background...";
  }, [effectiveBriefJobStage, effectiveBriefJobStageDetail, effectiveBriefJobStatus]);

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
      if (current.searchParams.get('open') === 'x-signal') {
        setXSignalOpen(true);
      }
      if (current.searchParams.get('open') === 'robert-handoff') {
        setHandoffPreviewOpen(true);
      }
      if (current.searchParams.get('open') === 'manual-lead') {
        setManualLeadOpen(true);
      }
    } catch (err) {}
  }, []);

  React.useEffect(() => {
    if (briefDebugStage) {
      setBriefMakerOpen(true);
    }
  }, [briefDebugStage]);

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
      setBriefJobStage('');
      setBriefJobStageDetail('');
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
    setBriefJobStage('');
    setBriefJobStageDetail('');
    setDocStatus('idle');
    setDocError('');
    setDocResult(null);
    setNotionStatus('idle');
    setNotionError('');
    setCalendarStatus('idle');
    setCalendarError('');
    setCalendarResult(null);
  };

  const loadBriefJobStatus = async (jobId) => {
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
        setBriefJobStage(job.stage || '');
        setBriefJobStageDetail(job.stage_detail || '');
        if (job.status === 'done') {
          const result = job.result || {};
          const payload = result.payload || {};
          const sourceUrl = payload.source_url || briefForm.source_url || briefForm.notion_url || job.source_url || '';
          if (payload && Object.keys(payload).length) {
            applyImportedBriefPayload(payload, sourceUrl);
          }
          setNotionStatus('done');
          setDocResult(result);
          setDocStatus('done');
          if (result.calendar) {
            setCalendarResult(result.calendar);
            setCalendarStatus('done');
          }
          setBriefJobId('');
          setBriefJobStatus('done');
          setBriefJobStage('done');
          setBriefJobStageDetail('Done');
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
          setBriefJobStage('error');
          setBriefJobStageDetail(message);
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

  const resetManualLead = () => {
    setManualLeadText('');
    setManualLeadImage('');
    setManualLeadImageName('');
    setManualLeadStatus('idle');
    setManualLeadError('');
    setManualLeadResult(null);
  };

  const resetXSignal = () => {
    setXSignalForm({ brand: '', topic: '', handle: '', tag: '', link: '', hashtags: '', drafts_text: '' });
    setXSignalStatus('idle');
    setXSignalError('');
    setXSignalResult(null);
  };

  const updateXSignalField = (key, value) => {
    setXSignalForm(curr => ({ ...curr, [key]: value }));
    if (xSignalStatus !== 'idle') {
      setXSignalStatus('idle');
      setXSignalError('');
      setXSignalResult(null);
    }
  };

  const parseXSignalDrafts = () => {
    const text = String(xSignalForm.drafts_text || '').trim();
    if (!text) return [];
    const chunks = text
      .split(/\n\s*\n(?=(?:Option|Draft)\s*\d|(?:Option|Draft)\s+[A-Z]|$)/i)
      .map(item => item.trim())
      .filter(Boolean);
    return (chunks.length ? chunks : [text]).map((chunk, idx) => {
      const lines = chunk.split('\n');
      const first = String(lines[0] || '').trim();
      const looksLikeLabel = /^(Option|Draft)\s+/i.test(first) && lines.length > 1;
      return {
        label: looksLikeLabel ? first.replace(/[:.]\s*$/, '') : `Draft ${idx + 1}`,
        text: looksLikeLabel ? lines.slice(1).join('\n').trim() : chunk,
      };
    });
  };

  const runXSignal = async () => {
    if (!String(xSignalForm.brand || '').trim()) {
      setXSignalStatus('error');
      setXSignalError('Add the company or product name first.');
      return;
    }
    setXSignalStatus('running');
    setXSignalError('');
    setXSignalResult(null);
    try {
      const res = await V4BriefServiceFetch('/x-signal-analyze', {
        method: 'POST',
        body: JSON.stringify({
          ...xSignalForm,
          drafts: parseXSignalDrafts(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) throw new Error(data.error || 'X Signal failed.');
      setXSignalResult(data);
      setXSignalStatus('done');
    } catch (err) {
      setXSignalStatus('error');
      setXSignalError(err.message || 'X Signal failed.');
    }
  };

  const handleManualLeadFile = file => {
    if (!file) return;
    if (!String(file.type || '').startsWith('image/')) {
      setManualLeadStatus('error');
      setManualLeadError('Drop a screenshot image, or paste the text instead.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setManualLeadImage(String(reader.result || ''));
      setManualLeadImageName(file.name || 'screenshot');
      setManualLeadStatus('idle');
      setManualLeadError('');
    };
    reader.onerror = () => {
      setManualLeadStatus('error');
      setManualLeadError('Could not read that screenshot.');
    };
    reader.readAsDataURL(file);
  };

  const buildManualLead = async () => {
    if (!manualLeadText.trim() && !manualLeadImage) {
      setManualLeadStatus('error');
      setManualLeadError('Paste the lead text or drop a screenshot first.');
      return;
    }
    setManualLeadStatus('building');
    setManualLeadError('');
    setManualLeadResult(null);
    try {
      const res = await V4BriefServiceFetch('/manual-lead-intake', {
        method: 'POST',
        body: JSON.stringify({
          text: manualLeadText,
          image_data: manualLeadImage,
          source_label: 'Robert iMessage',
          create_card: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) throw new Error(data.error || 'Manual lead build failed.');
      setManualLeadResult(data);
      setManualLeadStatus('done');
      if (window.V3?.ReloadLeads) await window.V3.ReloadLeads();
    } catch (err) {
      setManualLeadStatus('error');
      setManualLeadError(err.message || 'Manual lead build failed.');
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
      email_context: payload.email_context || curr.email_context,
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
        body: JSON.stringify({ source_url: sourceUrl, email_context: briefForm.email_context || '' }),
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
      setBriefJobStage('queued');
      setBriefJobStageDetail('Saved to your brief machine. Build is queued now.');
      const blankCalendar = V4InferCalendarFieldsFromGoLive('');
      const requestConfig = {
        source_url: sourceUrl,
        notion_url: sourceUrl,
        email_context: briefForm.email_context || '',
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
    if (action.type === 'open-x-signal') {
      setXSignalOpen(true);
      return;
    }
    if (action.type === 'open-robert-handoff') {
      setHandoffPreviewOpen(true);
      loadRobertHandoffPreview();
      return;
    }
    if (action.type === 'open-manual-lead') {
      setManualLeadOpen(true);
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
    if (tool.id === 'manual-lead') {
      return {
        ...tool,
        primaryLabel: 'Build Lead',
        primaryAction: { type: 'open-manual-lead' },
        secondaryLabel: 'Open New Leads',
        secondaryAction: { type: 'view', view: 'new-leads' },
        simpleCard: true,
      };
    }
    if (tool.id === 'x-signal') {
      return {
        ...tool,
        primaryLabel: 'Run X Signal',
        primaryAction: { type: 'open-x-signal' },
        secondaryLabel: 'Open Brief Maker',
        secondaryAction: { type: 'launch-brief-builder' },
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
                  {tool.id === 'brief-maker'
                    ? 'Build a Google Doc brief for Robert from one source link.'
                    : tool.id === 'x-signal'
                      ? 'Score drafts against live X momentum before Robert posts.'
                      : tool.id === 'manual-lead'
                        ? 'Create a New Lead from pasted text or an iMessage screenshot.'
                        : tool.useFor}
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
                    <p>One clean input. One click. Brief Maker reads the source and creates the Google Doc on Robert's account.</p>
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
                  <label className="brief-maker-field brief-maker-field-wide">
                    <span>Last sender email context (optional)</span>
                    <textarea
                      className="brief-maker-input"
                      value={briefForm.email_context || ''}
                      onChange={e => updateBriefField('email_context', e.target.value)}
                      placeholder="Paste the last email from the person sending the brief so Brief Maker can pick up tone, asks, timing, and constraints"
                      rows={6}
                    />
                  </label>
                  <div className="brief-maker-source-note">
                    Paste one link. Add the last sender email if you want extra context. Brief Maker will read it and build the Google Doc on Robert's account.
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
                  {effectiveNotionStatus === 'idle' && effectiveDocStatus === 'idle' && (
                    <div className="brief-maker-empty-state">
                      <strong>Ready</strong>
                      <span>Paste the link above, then press Go.</span>
                    </div>
                  )}
                  {effectiveNotionStatus === 'error' && (
                    <span className="brief-maker-server-error">{notionError}</span>
                  )}
                  {briefLoadingActive && (
                    <div className="brief-maker-loading-card">
                      <div className="brief-maker-loading-top">
                        <strong>Brief machine</strong>
                        <span>{effectiveBriefJobStatus === 'queued' ? 'Queued' : 'Running'}</span>
                      </div>
                      <div className="brief-maker-snake-rail" style={{ '--snake-step-count': briefWorkflowSteps.length, '--snake-step-index': briefWorkflowIndex }}>
                        <div className="brief-maker-snake-line" />
                        <div className="brief-maker-snake-head" />
                        {briefWorkflowSteps.map((step, idx) => (
                          <div
                            key={step.key}
                            className={
                              'brief-maker-snake-stop'
                              + (idx < briefWorkflowIndex ? ' is-done' : '')
                              + (idx === briefWorkflowIndex ? ' is-live' : '')
                            }
                          >
                            <span className="brief-maker-snake-dot" />
                            <span className="brief-maker-snake-label">{step.label}</span>
                          </div>
                        ))}
                      </div>
                      <span className="brief-maker-server-note">{briefProgressNote}</span>
                    </div>
                  )}
                  {effectiveDocStatus === 'error' && (
                    <span className="brief-maker-server-error">{docError}</span>
                  )}
                  {effectiveDocStatus === 'done' && docResult && (
                    <div className="brief-maker-result-card">
                      <span className="brief-maker-server-ok">Succeeded. Robert's Google Doc is ready.</span>
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
      {xSignalOpen && (
        <div className="brief-modal-backdrop" onClick={() => setXSignalOpen(false)}>
          <div className="brief-maker-panel x-signal-panel" onClick={e => e.stopPropagation()}>
            <div className="brief-modal-hd">
              <div>
                <div className="brief-maker-hero-kicker">X Signal</div>
                <h2 className="brief-modal-title">Reach Signal</h2>
              </div>
              <div className="brief-modal-hd-actions">
                <button type="button" className="cos-toolkit-btn" onClick={resetXSignal}>Reset</button>
                <button type="button" className="brief-modal-close" onClick={() => setXSignalOpen(false)} aria-label="Close X Signal">
                  <V3Icon name="x" w={14} />
                </button>
              </div>
            </div>
            <div className="brief-maker-body">
              <div className="brief-maker-form">
                <div className="brief-maker-source-panel">
                  <div className="brief-maker-hero">
                    <div className="brief-maker-hero-kicker">Wave stack</div>
                    <h3>Score the post before Robert publishes</h3>
                    <p>Pull live X conversation data, rank the draft options, and show the strongest current angle.</p>
                  </div>
                  <div className="brief-maker-field-grid">
                    <label className="brief-maker-field">
                      <span>Company or product</span>
                      <input className="brief-maker-input" value={xSignalForm.brand} onChange={e => updateXSignalField('brand', e.target.value)} placeholder="Latitude" />
                    </label>
                    <label className="brief-maker-field">
                      <span>X handle</span>
                      <input className="brief-maker-input" value={xSignalForm.handle} onChange={e => updateXSignalField('handle', e.target.value)} placeholder="@trylatitude" />
                    </label>
                  </div>
                  <label className="brief-maker-field brief-maker-field-wide">
                    <span>Campaign topic</span>
                    <input className="brief-maker-input" value={xSignalForm.topic} onChange={e => updateXSignalField('topic', e.target.value)} placeholder="V2 open source launch, agent observability, QRT on X" />
                  </label>
                  <div className="brief-maker-field-grid">
                    <label className="brief-maker-field">
                      <span>Required tag</span>
                      <input className="brief-maker-input" value={xSignalForm.tag} onChange={e => updateXSignalField('tag', e.target.value)} placeholder="@trylatitude" />
                    </label>
                    <label className="brief-maker-field">
                      <span>Link</span>
                      <input className="brief-maker-input" value={xSignalForm.link} onChange={e => updateXSignalField('link', e.target.value)} placeholder="https://latitude.so" />
                    </label>
                  </div>
                  <label className="brief-maker-field brief-maker-field-wide">
                    <span>Drafts to score (optional)</span>
                    <textarea
                      className="brief-maker-input"
                      value={xSignalForm.drafts_text}
                      onChange={e => updateXSignalField('drafts_text', e.target.value)}
                      placeholder={'Option 1. Recommended\\nPaste draft copy here\\n\\nOption 2. Technical angle\\nPaste draft copy here'}
                      rows={8}
                    />
                  </label>
                  <div className="brief-maker-source-note">
                    The score is relative. It ranks draft fit against the current X wave. It is not an impression forecast.
                  </div>
                  <div className="brief-maker-source-actions">
                    <button type="button" className="cos-toolkit-btn is-primary" onClick={runXSignal} disabled={xSignalStatus === 'running'}>
                      {xSignalStatus === 'running' ? 'Reading X...' : 'Run Signal'}
                    </button>
                  </div>
                </div>
              </div>
              <aside className="brief-maker-preview">
                <div className="brief-maker-server-status">
                  {xSignalStatus === 'idle' && (
                    <div className="brief-maker-empty-state">
                      <strong>Ready</strong>
                      <span>Add the campaign and drafts. The machine will pull live X context and rank the angles.</span>
                    </div>
                  )}
                  {xSignalStatus === 'running' && (
                    <div className="brief-maker-loading-card x-signal-loading">
                      <div className="brief-maker-loading-top">
                        <strong>Scanning X</strong>
                        <span>Live signal</span>
                      </div>
                      <span className="brief-maker-server-note">Finding live terms, anchor threads, and relative draft strength.</span>
                    </div>
                  )}
                  {xSignalStatus === 'error' && (
                    <span className="brief-maker-server-error">{xSignalError}</span>
                  )}
                  {xSignalStatus === 'done' && xSignalResult && (
                    <div className="x-signal-result-card">
                      <div className="x-signal-result-top">
                        <span className="brief-maker-server-ok">Signal ready.</span>
                        <span>{xSignalResult.scoring_note}</span>
                      </div>
                      {xSignalResult.signal?.headline && (
                        <div className="x-signal-headline">{xSignalResult.signal.headline}</div>
                      )}
                      {(xSignalResult.signal?.scored_existing_drafts || []).length > 0 && (
                        <div className="x-signal-ranked-list">
                          <div className="handoff-preview-label">Ranked drafts</div>
                          {[...(xSignalResult.signal.scored_existing_drafts || [])]
                            .sort((a, b) => Number(b.reach_score || 0) - Number(a.reach_score || 0))
                            .map((draft, idx) => (
                              <section key={`${draft.label || 'draft'}-${idx}`} className="x-signal-ranked-card">
                                <div className="x-signal-score">
                                  <strong>{draft.reach_score || 0}</strong>
                                  <span>{draft.reach_tier || 'Signal'}</span>
                                </div>
                                <div>
                                  <strong>{draft.label || `Draft ${idx + 1}`}</strong>
                                  <p>{draft.reach_reason || 'No signal reason captured.'}</p>
                                  {draft.anchor && <a href={draft.anchor} target="_blank" rel="noreferrer">Open anchor thread</a>}
                                </div>
                              </section>
                            ))}
                        </div>
                      )}
                      {(xSignalResult.signal?.keywords?.suggested_keywords || []).length > 0 && (
                        <div className="handoff-preview-row is-context">
                          <div className="handoff-preview-label">Live terms</div>
                          <div className="handoff-preview-context">{xSignalResult.signal.keywords.suggested_keywords.slice(0, 8).join(', ')}</div>
                        </div>
                      )}
                      {(xSignalResult.signal?.top_conversation || []).length > 0 && (
                        <div className="x-signal-ranked-list">
                          <div className="handoff-preview-label">Top waves</div>
                          {(xSignalResult.signal.top_conversation || []).slice(0, 3).map((post, idx) => (
                            <section key={`${post.url || idx}`} className="x-signal-wave-card">
                              <strong>{post.engagement || 0} eng · @{post.username || 'unknown'}</strong>
                              <p>{post.text}</p>
                              {post.url && <a href={post.url} target="_blank" rel="noreferrer">Open post</a>}
                            </section>
                          ))}
                        </div>
                      )}
                      {(xSignalResult.signal?.draft_posts || []).length > 0 && (
                        <details className="x-signal-details">
                          <summary>Generated signal options</summary>
                          {(xSignalResult.signal.draft_posts || []).slice(0, 3).map((draft, idx) => (
                            <pre key={`${draft.label || 'signal'}-${idx}`} className="handoff-preview-copy">{`${draft.label || `Option ${idx + 1}`}\\nReach ${draft.reach_score || 0}/100 · ${draft.reach_reason || ''}\\n\\n${draft.text || ''}`}</pre>
                          ))}
                        </details>
                      )}
                    </div>
                  )}
                </div>
              </aside>
            </div>
          </div>
        </div>
      )}
      {manualLeadOpen && (
        <div className="brief-modal-backdrop" onClick={() => setManualLeadOpen(false)}>
          <div className="brief-maker-panel handoff-preview-panel" onClick={e => e.stopPropagation()}>
            <div className="brief-modal-hd">
              <div>
                <div className="brief-maker-hero-kicker">Manual intake</div>
                <h2 className="brief-modal-title">Manual Lead</h2>
              </div>
              <div className="brief-modal-hd-actions">
                <button type="button" className="cos-toolkit-btn" onClick={resetManualLead}>Reset</button>
                <button type="button" className="brief-modal-close" onClick={() => setManualLeadOpen(false)} aria-label="Close manual lead">
                  <V3Icon name="x" w={14} />
                </button>
              </div>
            </div>
            <div className="brief-maker-body">
              <div className="brief-maker-form">
                <div className="brief-maker-source-panel">
                  <div className="brief-maker-hero">
                    <div className="brief-maker-hero-kicker">Robert iMessage</div>
                    <h3>Paste text or drop a screenshot</h3>
                    <p>The machine extracts the lead, creates a New Lead card, and drafts Robert's intro to Asher and Sam.</p>
                  </div>
                  <label className="brief-maker-field brief-maker-field-wide">
                    <span>Lead text</span>
                    <textarea
                      className="brief-maker-input"
                      value={manualLeadText}
                      onChange={e => setManualLeadText(e.target.value)}
                      placeholder="Paste Robert's iMessage text, copied screenshot text, email, X handle, or anything visible from the lead."
                      rows={8}
                    />
                  </label>
                  <label
                    className="brief-maker-field brief-maker-field-wide manual-lead-drop"
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => {
                      e.preventDefault();
                      handleManualLeadFile(e.dataTransfer?.files?.[0]);
                    }}
                  >
                    <span>Screenshot</span>
                    <input
                      className="brief-maker-input"
                      type="file"
                      accept="image/*"
                      onChange={e => handleManualLeadFile(e.target.files?.[0])}
                    />
                    <em>{manualLeadImageName || 'Drop an iMessage screenshot here if the text is not copyable.'}</em>
                  </label>
                  <div className="brief-maker-source-actions">
                    <button type="button" className="cos-toolkit-btn is-primary" onClick={buildManualLead} disabled={manualLeadStatus === 'building'}>
                      {manualLeadStatus === 'building' ? 'Building lead...' : 'Build Lead'}
                    </button>
                  </div>
                </div>
              </div>
              <aside className="brief-maker-preview">
                <div className="brief-maker-server-status">
                  {manualLeadStatus === 'idle' && (
                    <div className="brief-maker-empty-state">
                      <strong>Ready</strong>
                      <span>Manual leads stay approval-gated. Nothing sends from Robert until you approve.</span>
                    </div>
                  )}
                  {manualLeadStatus === 'building' && (
                    <div className="brief-maker-empty-state">
                      <strong>Reading lead</strong>
                      <span>OCR runs locally when you upload a screenshot. Hermes/Qwen then extracts the lead.</span>
                    </div>
                  )}
                  {manualLeadStatus === 'error' && (
                    <span className="brief-maker-server-error">{manualLeadError}</span>
                  )}
                  {manualLeadStatus === 'done' && manualLeadResult && (
                    <div className="brief-maker-result-card">
                      <span className="brief-maker-server-ok">Lead created in New Leads.</span>
                      <div className="handoff-preview-row">
                        <div className="handoff-preview-label">Lead</div>
                        <div className="handoff-preview-value">
                          {manualLeadResult.extracted?.company || 'Unknown company'}
                          {manualLeadResult.extracted?.person ? ` · ${manualLeadResult.extracted.person}` : ''}
                        </div>
                      </div>
                      <div className="handoff-preview-row">
                        <div className="handoff-preview-label">Contact</div>
                        <div className="handoff-preview-value">
                          {manualLeadResult.extracted?.email || manualLeadResult.extracted?.x_handle || 'No contact found yet'}
                        </div>
                      </div>
                      <div className="handoff-preview-row is-context">
                        <div className="handoff-preview-label">What they want</div>
                        <div className="handoff-preview-context">{manualLeadResult.extracted?.summary || manualLeadResult.extracted?.what_they_want || 'No summary captured.'}</div>
                      </div>
                      <div className="handoff-preview-row">
                        <div className="handoff-preview-label">Robert draft</div>
                        <pre className="handoff-preview-copy">{String(manualLeadResult.draft?.body || '').trim()}</pre>
                      </div>
                      {manualLeadResult.ocr_text ? (
                        <div className="handoff-preview-row is-context">
                          <div className="handoff-preview-label">OCR text</div>
                          <div className="handoff-preview-context">{manualLeadResult.ocr_text}</div>
                        </div>
                      ) : null}
                      <div className="brief-maker-result-actions">
                        <button type="button" className="cos-toolkit-btn is-primary" onClick={() => { try { window.sessionStorage.setItem('cos-queue', 'send'); } catch (e) {} onNavigateView?.('company-os', null); onActivateSplit?.('send'); }}>Open Intake</button>
                      </div>
                    </div>
                  )}
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

function V4CleanDisplayText(t) {
  if (!t) return '';
  return String(t)
    .replace(/&gt;/gi, '>')
    .replace(/&lt;/gi, '<')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const V4_ACTION_RECENT_MS = 45 * 24 * 60 * 60 * 1000;

function V4IsActionNowLead(lead) {
  if (!lead) return false;
  if (lead.stage === 'invoice-sent') return true;
  if (lead.unread || lead.followUpDue) return true;
  if (lead.needsReply) {
    const touched = V3TimestampForUi(lead.lastTouchAt);
    if (!touched || (Date.now() - touched) <= V4_ACTION_RECENT_MS) return true;
  }
  if ((lead.daysInStage || 0) >= 6 && (lead.value || 0) > 1500 && lead.followUpDue) return true;
  return false;
}

function V4SortActionLeads(a, b) {
  const activityDelta = V3LeadActivityTimestamp(b) - V3LeadActivityTimestamp(a);
  if (activityDelta) return activityDelta;
  const hot = (lead) => (lead.unread || lead.needsReply || lead.followUpDue) ? 1 : 0;
  const hotDelta = hot(b) - hot(a);
  if (hotDelta) return hotDelta;
  return (b.value || 0) - (a.value || 0);
}

function V4BuildBriefPoints(lead) {
  const points = [];
  const phase = V4CompanyOsPhase(lead);
  const why = V4CompanyOsWhy(lead);

  if (lead.nextMove && lead.nextMove.text) {
    points.push(lead.nextMove.text);
  }
  if (lead.operatorSummary && lead.operatorSummary.lead_summary) {
    points.push(lead.operatorSummary.lead_summary);
  }
  if (lead.unread || lead.needsReply) {
    points.push('New reply in thread — handle before anything else.');
  }
  if (lead.stage === 'invoice-sent') {
    points.push('Invoice out. Get payment proof + timing locked before Robert executes.');
  }
  if ((lead.daysInStage || 0) >= 8) {
    points.push(`${lead.daysInStage}d with no movement — decide or archive.`);
  }
  if (lead.value) {
    points.push(`${V4CompanyOsMoney(lead.value)} at ${phase.toLowerCase()}.`);
  }
  if (lead.briefTitle || lead.briefBody) {
    points.push('Brief material exists.');
  }
  if (points.length === 0) {
    points.push(why);
  }
  return points.slice(0, 4);
}

function V4ComputeDailyBrief(leads = []) {
  const active = leads.filter(l => !['trash', 'dead-leads', 'paid-out', 'done'].includes(l.stage));

  const actionLeads = active
    .filter(V4IsActionNowLead)
    .sort(V4SortActionLeads)
    .slice(0, 5);

  const ts = (d) => (d ? Date.parse(d) : 0);
  const watchLeads = active
    .filter(l => !l.needsReply && ['rates-sent', 'negotiating', 'first-touch', 'engaged'].includes(l.stage))
    .sort((a, b) => ts(b.lastTouchAt) - ts(a.lastTouchAt))
    .slice(0, 5);

  const closedLeads = leads
    .filter(l => ['done', 'paid-out'].includes(l.stage))
    .sort((a, b) => ts(b.lastTouchAt) - ts(a.lastTouchAt))
    .slice(0, 4);

  const toItem = (lead, isClosed = false) => ({
    id: lead.id,
    title: `${lead.brand} — ${V4CompanyOsPhase(lead)}`,
    tags: [
      V4CompanyOsPriority(lead),
      V4CompanyOsPhaseTag(lead),
      (lead.stage === 'done' || isClosed) ? 'closed' : null,
    ].filter(Boolean),
    points: V4BuildBriefPoints(lead),
  });

  return {
    action: actionLeads.map(l => toItem(l)),
    watch: watchLeads.map(l => toItem(l)),
    closed: closedLeads.map(l => toItem(l, true)),
  };
}

function V6SourceClass(source) {
  const s = String(source || '').toLowerCase();
  if (s.includes('gmail') || s === 'email') return 'gmail';
  if (s.includes('x') || s.includes('twitter')) return 'x';
  return 'lead';
}

function V4CosAgentLine(lead) {
  const raw = lead?.operatorSummary?.next_action
    || lead?.agentAssessment
    || lead?.operatorSummary?.lead_summary
    || lead?.nextMove?.text
    || (window.V3.NewLeadSummary ? window.V3.NewLeadSummary(lead) : '')
    || V4CompanyOsListSnippet(lead)
    || '';
  const cleaned = V4CleanDisplayText(String(raw).replace(/\s+/g, ' ').trim());
  if (cleaned.length <= 110) return cleaned;
  return cleaned.slice(0, 107).trim() + '…';
}

function V4CosIsTravelLead(lead) {
  return V4LeadIsTravelLead(lead) && !['trash', 'dead-leads', 'paid-out'].includes(lead?.stage);
}

function V4CosIsSendLead(lead) {
  if (!lead) return false;
  if (V4CosIsTravelLead(lead)) return false;
  if (window.V3.IsNewLeadReview && window.V3.IsNewLeadReview(lead)) return false;
  const st = String(lead.draftReplyStatus || '').toLowerCase();
  if (lead.draftReply?.body && (st === 'review' || st === 'pending')) return true;
  if (lead.draftReply?.body && (lead.unread || lead.needsReply)) return true;
  if ((lead.unread || lead.needsReply) && lead.nextMove?.who) return true;
  return false;
}

function V4CosIsChaseLead(lead) {
  if (!lead) return false;
  if (window.V3.IsNewLeadReview && window.V3.IsNewLeadReview(lead)) return false;
  if (V4CosIsSendLead(lead)) return false;
  if (lead.followUpDue) return true;
  if (String(lead.briefStatus || '').toLowerCase().replace(/_/g, '-') === 'awaiting-robert') return true;
  if (['rates-sent', 'negotiating', 'invoice-sent', 'first-touch', 'engaged'].includes(lead.stage)) return true;
  if (lead.stage === 'done') return true;
  return false;
}

function V4CosIsWatchLead(lead) {
  if (!lead) return false;
  if (window.V3.IsNewLeadReview && window.V3.IsNewLeadReview(lead)) return false;
  if (V4CosIsSendLead(lead) || V4CosIsChaseLead(lead)) return false;
  if (['done', 'paid-out'].includes(lead.stage)) return false;
  return true;
}

function V4CosQueueActionLabel(lead, queueId) {
  if (window.V3.IsNewLeadReview && window.V3.IsNewLeadReview(lead)) return 'Triage';
  if (queueId === 'travel') return lead?.needsReply ? 'Reply' : 'Pursue';
  if (queueId === 'send') {
    if (String(lead.draftReplyStatus || '').toLowerCase() === 'review') return 'Review';
    if (lead.draftReply?.body) return 'Send';
    return 'Reply';
  }
  if (queueId === 'chase') {
    if (lead.stage === 'invoice-sent') return 'Pay';
    if (lead.stage === 'done') return 'Brief';
    if (lead.followUpDue) return 'Nudge';
    return 'Chase';
  }
  return null;
}

function V4QueueRow({ lead, queueId, isCurrent, onClick, style }) {
  const brand = V4CleanDisplayText(lead?.brand || lead?.contactName || 'Lead');
  const line = V4CosAgentLine(lead);
  const action = V4CosQueueActionLabel(lead, queueId);
  const value = lead?.value ? (typeof v3Money === 'function' ? v3Money(lead.value) : '$' + lead.value) : '';
  const age = V3LeadActivityLabel(lead) || '';
  const isIntake = window.V3.IsNewLeadReview && window.V3.IsNewLeadReview(lead);
  const needsDm = V4XLeadNeedsDmReply(lead);
  const isTravel = V4LeadIsTravelLead(lead);
  return (
    <button
      type="button"
      className={'cos-queue-row' + (isCurrent ? ' is-current' : '') + (isIntake ? ' is-intake' : '') + (needsDm ? ' is-x-dm' : '') + (isTravel ? ' is-travel' : '')}
      style={style}
      onClick={onClick}
    >
      <div className="cos-queue-row-top">
        <span className={'cos-queue-dot' + (lead?.unread ? '' : ' off')} />
        <span className="cos-queue-brand">{brand}</span>
        {value ? <span className="cos-queue-value">{value}</span> : null}
        {isTravel ? <span className="cos-queue-action is-travel">Travel</span> : null}
        {needsDm ? <span className="cos-queue-action is-x-dm">X DM</span> : null}
        {action ? <span className={'cos-queue-action is-' + queueId}>{action}</span> : null}
        {age ? <span className="cos-queue-age">{age}</span> : null}
      </div>
      <p className="cos-queue-line">{line}</p>
    </button>
  );
}

function V6RowFact(lead, item) {
  const cleaned = V4CosAgentLine(lead) || V4CleanDisplayText((item?.points && item.points[0]) || '');
  if (cleaned.length <= 88) return cleaned;
  return cleaned.slice(0, 85).trim() + '…';
}

function V6ListRowStatus(lead) {
  const status = String(lead?.draftReplyStatus || '').toLowerCase();
  if (status === 'review' && lead?.draftReply?.body) return { label: 'Review', tone: 'warn' };
  if ((status === 'pending' || lead?.draftReply?.body) && lead?.draftReply?.body) return { label: 'Draft', tone: 'good' };
  if (lead?.unread || lead?.needsReply) return { label: 'Reply', tone: 'hot' };
  if ((lead?.daysInStage || 0) >= 8) return { label: 'Stale', tone: 'soft' };
  return null;
}

function V6ListRow({ lead, title, isCurrent, onClick, style }) {
  const brand = V4CleanDisplayText(title || lead?.brand || 'Lead');
  const source = lead?.source || 'lead';
  const age = V3LeadActivityLabel(lead) || (lead?.daysInStage ? `${lead.daysInStage}d in stage` : '');
  const ageTitle = V3LeadActivityFull(lead) || '';
  const fact = V6RowFact(lead);
  const badge = V6ListRowStatus(lead);
  return (
    <button
      type="button"
      className={`v6-row${isCurrent ? ' cur' : ''}${badge ? ' has-badge' : ''}`}
      style={style}
      onClick={onClick}
      title={ageTitle || undefined}
    >
      <span className={`v6-dot${lead?.unread ? '' : ' off'}`} />
      <span className="v6-brand-t">{brand}</span>
      {badge ? <span className={`v6-row-badge is-${badge.tone}`}>{badge.label}</span> : null}
      {V3XLeadRepliedViaX(lead) ? <span className="v6-x-replied">X replied</span> : null}
      <span className={`v6-src ${V6SourceClass(source)}`}>{source}</span>
      <span className="v6-age" title={ageTitle || undefined}>{age}</span>
      <span className="v6-fact">{fact}</span>
    </button>
  );
}

function V4BuildCopilotFocusFromLead(lead) {
  if (!lead) return null;
  const context = typeof V4OrgApprovalContext === 'function' ? V4OrgApprovalContext(lead) : null;
  const conflict = typeof V4OrgApprovalConflict === 'function' && context ? V4OrgApprovalConflict(lead, context) : '';
  const draftBody = V4PlaintextForCopilot(lead.draftReply?.body || '');
  return {
    surface: 'company-os',
    view: 'company-os',
    gate: 'negotiate',
    gateLabel: 'Lead co-pilot',
    leadId: lead.id,
    brand: lead.brand || lead.contactName || 'Lead',
    contactName: lead.contactName || '',
    stage: lead.stage || '',
    email: lead.email || '',
    source: lead.source || '',
    xOpenDm: lead.xOpenDm || '',
    repliedViaX: typeof V3XLeadRepliedViaX === 'function' ? V3XLeadRepliedViaX(lead) : false,
    why: lead.agentAssessment || lead.operatorSummary?.next_action || lead.nextMove?.text || '',
    conflict: conflict || null,
    inbound: context ? {
      from: context.sender,
      subject: V4PlaintextForCopilot(context.subject),
      when: context.when || '',
      body: V4PlaintextForCopilot(context.body).slice(0, 2200),
    } : null,
    draft: {
      subject: V4PlaintextForCopilot(lead.draftReply?.subject || ''),
      body: draftBody.slice(0, 2800),
      status: lead.draftReplyStatus || '',
    },
    agentAssessment: lead.agentAssessment || '',
    recommendedAction: lead.recommendedAction || '',
    nextMove: (lead.nextMove && lead.nextMove.text) || '',
    operatorSummary: lead.operatorSummary || null,
    value: lead.value || null,
    thread: Array.isArray(lead.thread) ? lead.thread.slice(-5).map(m => ({
      from: V4PlaintextForCopilot(m.from),
      subject: V4PlaintextForCopilot(m.subject),
      body: V4PlaintextForCopilot(m.body).slice(0, 700),
    })) : [],
    notes: V4PlaintextForCopilot(lead.notes || lead.operatorSummary?.lead_summary || '').slice(0, 1200),
  };
}

function V4CosSimilarDeals(lead, allLeads, limit = 4) {
  if (!lead) return [];
  const pool = (Array.isArray(allLeads) ? allLeads : [])
    .filter(l => l && String(l.id) !== String(lead.id) && !['trash', 'dead-leads'].includes(l.stage));
  const stage = lead.stage || '';
  const value = Number(lead.value) || 0;
  const scored = pool.map(l => {
    let score = 0;
    if (l.stage === stage) score += 3;
    const lv = Number(l.value) || 0;
    if (value && lv && Math.abs(lv - value) / Math.max(value, lv) <= 0.5) score += 2;
    if (l.agentTier && l.agentTier === lead.agentTier) score += 1;
    if (l.category && l.category === lead.category) score += 1;
    return { lead: l, score };
  });
  return scored.sort((a, b) => b.score - a.score || (b.lead.value || 0) - (a.lead.value || 0))
    .slice(0, limit)
    .map(x => x.lead);
}

function V4CosLeadIntel(lead) {
  const summary = lead?.operatorSummary || {};
  const analysis = lead?.operatorAnalysis || {};
  const escalations = Array.isArray(lead?.operatorEscalation) ? lead.operatorEscalation : [];
  const status = String(lead?.draftReplyStatus || '').toLowerCase();
  let confidence = 35;
  if (lead?.draftReply?.body) confidence += 22;
  if (lead?.agentAssessment) confidence += 18;
  if (summary.next_action) confidence += 12;
  if (summary.quoted_rate) confidence += 8;
  if ((lead?.thread || []).length >= 2) confidence += 8;
  if (!escalations.length && status !== 'review') confidence += 7;
  if (analysis.reply_type) confidence += 5;
  confidence = Math.min(96, Math.max(18, confidence));
  if (status === 'review') confidence = Math.min(confidence, 42);
  if (escalations.length) confidence = Math.min(confidence, 55);

  const risks = [];
  if (status === 'review') risks.push('Scam gate flagged this thread for human review before send.');
  escalations.forEach(item => risks.push(String(item).replace(/_/g, ' ')));
  if ((lead?.daysInStage || 0) >= 8) risks.push(`${lead.daysInStage} days in stage with no movement.`);
  const ctx = typeof V4OrgApprovalContext === 'function' ? V4OrgApprovalContext(lead) : null;
  const conflict = typeof V4OrgApprovalConflict === 'function' && ctx ? V4OrgApprovalConflict(lead, ctx) : '';
  if (conflict) risks.push(conflict);
  if (!lead?.email && lead?.source?.toLowerCase?.().includes('x')) risks.push('No email captured yet. Confirm contact path before committing.');

  const opportunities = [];
  if (lead?.value >= 2500) opportunities.push(`Strong deal size at ${typeof v3Money === 'function' ? v3Money(lead.value) : '$' + lead.value}.`);
  if (summary.quoted_rate) opportunities.push(`Rate on the table: ${summary.quoted_rate}.`);
  if (summary.launch_timing) opportunities.push(`Launch window: ${summary.launch_timing}.`);
  if (lead?.stage === 'negotiating' && lead?.draftReply) opportunities.push('Draft is ready. A clean approve and send can close the loop.');
  if (analysis.stage === 'pricing' && !summary.quoted_rate) opportunities.push('Good moment to anchor tier and payment terms.');

  return {
    confidence,
    risks: risks.slice(0, 5),
    opportunities: opportunities.slice(0, 4),
    nextStep: summary.next_action || lead?.nextMove?.text || 'Review thread and decide the next move.',
  };
}

function V4CosWordDiff(baseline, current) {
  const base = String(baseline || '').trim().split(/\s+/).filter(Boolean);
  const cur = String(current || '').trim().split(/\s+/).filter(Boolean);
  const parts = [];
  let i = 0;
  let j = 0;
  while (i < base.length || j < cur.length) {
    if (i < base.length && j < cur.length && base[i] === cur[j]) {
      parts.push({ type: 'same', text: base[i] });
      i += 1;
      j += 1;
      continue;
    }
    const nextInBase = j < cur.length ? base.indexOf(cur[j], i) : -1;
    if (j < cur.length && (i >= base.length || nextInBase === -1)) {
      parts.push({ type: 'add', text: cur[j] });
      j += 1;
      continue;
    }
    if (i < base.length) {
      parts.push({ type: 'del', text: base[i] });
      i += 1;
    }
  }
  return parts;
}

function V4CosDiffView({ baseline, current }) {
  const parts = React.useMemo(() => V4CosWordDiff(baseline, current), [baseline, current]);
  const changed = parts.some(p => p.type !== 'same');
  if (!changed) return <div className="cos-negotiate-diff cos-negotiate-diff--clean">Matches AI draft</div>;
  return (
    <div className="cos-negotiate-diff" aria-label="Edits vs AI draft">
      {parts.map((p, idx) => (
        <span key={idx} className={'cos-negotiate-diff-' + p.type}>{p.text}{' '}</span>
      ))}
    </div>
  );
}

function V4LeadCopilotSidebar({ lead, leads, intel, collapsed, onToggle, onEscalate, onApprove, overlay = false }) {
  const [chatInput, setChatInput] = React.useState('');
  const [chatBusy, setChatBusy] = React.useState(false);
  const [chatMsgs, setChatMsgs] = React.useState([]);
  const scrollRef = React.useRef(null);
  const similar = React.useMemo(() => V4CosSimilarDeals(lead, leads, 4), [lead?.id, leads]);
  const bridge = typeof window !== 'undefined' && window.claude && window.claude.complete;
  const label = (window.claude?.label) ? window.claude.label() : 'Mac Studio';

  React.useEffect(() => {
    setChatMsgs([]);
    setChatInput('');
  }, [lead?.id]);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [chatMsgs, chatBusy]);

  const askCopilot = async () => {
    const text = chatInput.trim();
    if (!text || chatBusy) return;
    setChatInput('');
    setChatMsgs(m => [...m, { role: 'user', text }]);
    if (!bridge) {
      setChatMsgs(m => [...m, { role: 'ai', text: 'Local LLM offline. Start local_llm_bridge.py on this Mac.' }]);
      return;
    }
    setChatBusy(true);
    try {
      const focus = V4BuildCopilotFocusFromLead(lead);
      let blob = '';
      try { blob = JSON.stringify(focus); } catch (e) { blob = String(focus); }
      const prompt =
        "You are the UNALIGNED lead co-pilot for Asher. Answer ONLY about this lead. Read-only. Never use hyphens or em dashes.\n\n" +
        'LEAD CONTEXT:\n' + blob.slice(0, 4200) + '\n\n' +
        'QUESTION: ' + text + '\n\nGive a short, concrete answer:';
      const out = String(await window.claude.complete(prompt, { max_tokens: 500 }) || '').trim();
      setChatMsgs(m => [...m, { role: 'ai', text: out || 'No answer.' }]);
    } catch (err) {
      setChatMsgs(m => [...m, { role: 'ai', text: 'Failed: ' + (err?.message || 'bridge error') }]);
    } finally {
      setChatBusy(false);
    }
  };

  if (collapsed && !overlay) {
    return (
      <aside className="cos-copilot-sidebar cos-copilot-sidebar--collapsed">
        <button type="button" className="cos-copilot-expand" onClick={onToggle} title="Open co-pilot">
          <V3Icon name="spark" w={16} />
        </button>
      </aside>
    );
  }

  return (
    <aside className={'cos-copilot-sidebar' + (overlay ? ' cos-copilot-sidebar--overlay' : '')}>
      <header className="cos-copilot-hd">
        <div>
          <div className="cos-copilot-eyebrow">Co-pilot</div>
          <strong>{lead.brand}</strong>
        </div>
        <button type="button" className="hd-icon-btn" onClick={onToggle} aria-label="Collapse co-pilot">
          <V3Icon name="chev_d" w={14} style={{ transform: 'rotate(-90deg)' }} />
        </button>
      </header>
      <div className="cos-copilot-scroll" ref={scrollRef}>
        <section className="cos-copilot-block">
          <div className="cos-copilot-block-hd">
            <span>Confidence</span>
            <span className={'cos-copilot-conf is-' + (intel.confidence >= 70 ? 'high' : intel.confidence >= 45 ? 'mid' : 'low')}>{intel.confidence}%</span>
          </div>
          <div className="cos-copilot-conf-bar"><span style={{ width: intel.confidence + '%' }} /></div>
        </section>
        <section className="cos-copilot-block">
          <div className="cos-copilot-block-hd"><span>Next step</span></div>
          <p className="cos-copilot-copy">{intel.nextStep}</p>
        </section>
        {intel.risks.length > 0 && (
          <section className="cos-copilot-block is-risk">
            <div className="cos-copilot-block-hd"><span>Risks</span></div>
            <ul className="cos-copilot-list">{intel.risks.map((r, i) => <li key={i}>{r}</li>)}</ul>
          </section>
        )}
        {intel.opportunities.length > 0 && (
          <section className="cos-copilot-block is-opp">
            <div className="cos-copilot-block-hd"><span>Opportunities</span></div>
            <ul className="cos-copilot-list">{intel.opportunities.map((o, i) => <li key={i}>{o}</li>)}</ul>
          </section>
        )}
        {similar.length > 0 && (
          <section className="cos-copilot-block">
            <div className="cos-copilot-block-hd"><span>Similar deals</span></div>
            <div className="cos-copilot-similar">
              {similar.map(s => (
                <div key={s.id} className="cos-copilot-similar-row">
                  <strong>{s.brand}</strong>
                  <span>{s.stage}{s.value ? ` · ${typeof v3Money === 'function' ? v3Money(s.value) : '$' + s.value}` : ''}</span>
                </div>
              ))}
            </div>
          </section>
        )}
        <section className="cos-copilot-block cos-copilot-chat">
          <div className="cos-copilot-block-hd">
            <span>Ask this lead</span>
            <span className="cos-copilot-src">{bridge ? label : 'offline'}</span>
          </div>
          <div className="cos-copilot-chat-log">
            {!chatMsgs.length && <p className="cos-copilot-chat-hint">Ask about tone, risks, or what to say next.</p>}
            {chatMsgs.map((m, i) => <div key={i} className={'cos-copilot-chat-msg is-' + m.role}>{m.text}</div>)}
            {chatBusy && <div className="cos-copilot-chat-msg is-ai">Thinking…</div>}
          </div>
          <div className="cos-copilot-chat-in">
            <textarea
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askCopilot(); } }}
              placeholder="Ask about this thread…"
              rows={2}
            />
            <button type="button" onClick={askCopilot} disabled={chatBusy || !chatInput.trim()}>Ask</button>
          </div>
        </section>
      </div>
      <footer className="cos-copilot-ft">
        <button type="button" className="cos-copilot-act" onClick={onApprove}>Approve &amp; send</button>
        <button type="button" className="cos-copilot-act is-soft" onClick={onEscalate}>Escalate to Sam</button>
      </footer>
    </aside>
  );
}

function V4LeadNegotiateWorkspace({
  lead, user, leads, stage, isReview, reviewReason, isXLead, xContextRows,
  operatorSummary, operatorAnalysis, operatorStatus, gmailSubject,
  onBack, onOpenSplits, onCollapse, setTab, onAfterSend,
}) {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [pane, setPane] = React.useState('draft');
  const [sender, setSender] = React.useState(() => V3SenderForUser(user));
  const [userBody, setUserBody] = React.useState('');
  const [aiBaseline, setAiBaseline] = React.useState('');
  const [status, setStatus] = React.useState('draft');
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState('');
  const intel = React.useMemo(() => V4CosLeadIntel(lead), [lead]);
  const subject = V3SubjectForLead(lead);
  const draft = React.useMemo(() => V3ComposeReplyDraft(lead, sender), [lead.id, lead.draftReply?.body, lead.draftReply?.subject, lead.thread?.length, lead.lastTouchAt, sender]);
  const recipients = React.useMemo(() => V3ReplyRecipients(lead, sender, false), [lead.id, sender]);
  const toLine = recipients.to.join(',');
  const ccLine = recipients.cc.join(',');

  React.useEffect(() => {
    const nextSender = V3SenderForUser(user);
    const nextDraft = V3ComposeReplyDraft(lead, nextSender);
    setSender(nextSender);
    setAiBaseline(nextDraft.body);
    setUserBody(nextDraft.body);
    setStatus('draft');
    setError('');
    setSuccess('');
    setPane('draft');
    setSidebarOpen(false);
  }, [lead.id, lead.draftReply?.body, lead.draftReply?.subject, lead.thread?.length, lead.lastTouchAt, user]);

  const contextChips = [
    operatorSummary.quoted_rate && { label: 'Rate', value: operatorSummary.quoted_rate },
    operatorSummary.launch_timing && { label: 'Timing', value: operatorSummary.launch_timing },
    operatorAnalysis.reply_type && { label: 'Reply type', value: V4OperatorReplyTypeLabel(operatorAnalysis.reply_type) },
    lead.value && { label: 'Deal', value: typeof v3Money === 'function' ? v3Money(lead.value) : '$' + lead.value },
    operatorSummary.asked_for && { label: 'They want', value: operatorSummary.asked_for },
  ].filter(Boolean);

  const reasoning = lead.agentAssessment
    || operatorSummary.lead_summary
    || operatorAnalysis.reason
    || 'No operator reasoning saved yet. Use the draft as a starting point and edit before send.';

  const sendReply = async () => {
    const msg = V3EnsureSenderSignature(userBody.trim(), sender);
    if (!toLine.trim() || !msg) {
      setError(!recipients.to.length ? 'Add a recipient before sending.' : 'Write a reply before sending.');
      return;
    }
    setStatus('sending');
    setError('');
    try {
      await V3SendLeadEmail({ lead, sender, to: toLine, cc: ccLine, subject, body: msg, attachPdf: false });
      fetch(V3_SUPABASE_URL + '/rest/v1/cards?id=eq.' + encodeURIComponent(lead.id), {
        method: 'PATCH',
        headers: {
          apikey: V3_SUPABASE_ANON_KEY,
          Authorization: 'Bearer ' + V3_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ draft_reply_status: 'sent', new_reply_at: null }),
      }).catch(() => {});
      window.dispatchEvent(new CustomEvent('v3:email-sent', { detail: { leadId: lead.id, sender, subject, body: msg, to: recipients.to, cc: recipients.cc } }));
      setSuccess('Sent to ' + toLine);
      setStatus('sent');
      if (typeof onAfterSend === 'function') {
        window.setTimeout(() => onAfterSend(lead), 900);
      }
    } catch (err) {
      setStatus('error');
      setError(err?.message || 'Send failed');
    }
  };

  const escalate = () => {
    V4CosPatchLead(lead, { assignee: 'sam', draft_reply_status: 'escalated' }, {
      ownerId: 'sammy',
      draftReplyStatus: 'escalated',
      nextMove: { who: 'sammy', text: 'Sam reviewing escalated thread', action: 'Review' },
    });
    setSuccess('Escalated to Sam');
  };

  const threadMessageCount = Array.isArray(lead.thread) ? lead.thread.length : 0;

  const threadPane = (
    <div className="cos-negotiate-pane cos-negotiate-pane--thread">
      {contextChips.length > 0 && (
        <div className="cos-negotiate-chips">
          {contextChips.map(chip => (
            <div key={chip.label} className="cos-negotiate-chip">
              <span className="cos-negotiate-chip-lbl">{chip.label}</span>
              <span className="cos-negotiate-chip-val">{chip.value}</span>
            </div>
          ))}
        </div>
      )}
      <div className="cos-negotiate-thread-scroll">
        {isXLead ? (
          <div className="cos-reader-stands gmail-read-x-context">
            <div className="cos-operator-summary">
              {xContextRows.map(row => (
                <div key={row.label} className="handoff-preview-row">
                  <div className="handoff-preview-label">{row.label}</div>
                  <div className="handoff-preview-context">{row.value}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <V3GmailThread lead={lead} />
        )}
      </div>
    </div>
  );

  const draftPane = (
    <div className="cos-negotiate-pane cos-negotiate-pane--draft">
      <div className="cos-negotiate-draft-meta">
        <select className="cos-negotiate-from" value={sender} disabled={status === 'sending'} onChange={e => {
          const next = e.target.value;
          setSender(next);
          const nextDraft = V3ComposeReplyDraft(lead, next);
          setAiBaseline(nextDraft.body);
          setUserBody(nextDraft.body);
        }}>
          <option value="robert">Robert Scoble</option>
          <option value="sam">Sam Levin</option>
          <option value="asher">Asher</option>
        </select>
        <span className="cos-negotiate-recip">To {toLine || 'add recipient'}</span>
      </div>
      <textarea
        className="cos-negotiate-edit-body"
        value={userBody}
        disabled={status === 'sending'}
        onChange={e => setUserBody(e.target.value)}
        rows={16}
      />
      <div className="cos-negotiate-diff-wrap">
        <div className="cos-negotiate-diff-lbl">Edits vs AI</div>
        <V4CosDiffView baseline={aiBaseline} current={userBody} />
      </div>
      <div className="cos-negotiate-actions">
        <button type="button" className="cos-negotiate-send" onClick={sendReply} disabled={status === 'sending'}>
          {status === 'sending' ? 'Sending…' : status === 'sent' ? 'Sent' : 'Approve & send'}
        </button>
        <button type="button" className="cos-negotiate-reset" onClick={() => setUserBody(aiBaseline)} disabled={status === 'sending'}>
          Reset to AI
        </button>
        <button type="button" className="cos-negotiate-reset" onClick={() => setPane('ai')}>
          View AI draft
        </button>
      </div>
      {(error || success) && (
        <div className={'cos-negotiate-status ' + (error ? 'is-error' : 'is-success')}>{error || success}</div>
      )}
    </div>
  );

  const aiPane = (
    <div className="cos-negotiate-pane cos-negotiate-pane--ai">
      <pre className="cos-negotiate-ai-body">{draft.body}</pre>
      <div className="cos-negotiate-reason">
        <div className="cos-negotiate-reason-lbl">Why it makes sense</div>
        <p>{reasoning}</p>
      </div>
      <button type="button" className="cos-negotiate-insert" onClick={() => { setUserBody(aiBaseline); setPane('draft'); }}>
        Pull AI into your draft
      </button>
    </div>
  );

  return (
    <div className="cos-negotiate-shell cos-negotiate-shell--focused">
      <header className="gmail-read-hd cos-negotiate-hd cos-negotiate-hd--slim">
        <button className="gmail-read-back hd-icon-btn" onClick={onBack} aria-label="Back to list" type="button">
          <V3Icon name="chev_d" w={16} style={{ transform: 'rotate(90deg)' }} />
        </button>
        <div className="gmail-read-hd-main">
          <h1 className="gmail-read-subject">{V4CleanDisplayText(lead.brand || gmailSubject)}</h1>
          <div className="gmail-read-submeta cos-negotiate-submeta">
            <span>{lead.contactName}</span>
            <span className="gmail-read-sep">·</span>
            <span style={{ color: stage.color }}>{stage.name}</span>
            <span className={`cos-operator-status is-${operatorStatus.tone}`}>{operatorStatus.label}</span>
          </div>
        </div>
        <button type="button" className="cos-negotiate-exit" onClick={onCollapse}>Exit co-pilot</button>
        <button type="button" className={'cos-negotiate-sidebar-toggle hd-icon-btn' + (sidebarOpen ? ' is-on' : '')} onClick={() => setSidebarOpen(v => !v)} aria-label="Lead intel">
          <V3Icon name="spark" w={16} />
        </button>
      </header>
      {isReview && (
        <div className="cos2-review-banner gmail-read-review">
          <div className="cos2-review-banner-msg">
            <strong>Scam gate flagged this for review</strong>
            <span>{reviewReason}</span>
          </div>
        </div>
      )}
      <div className="cos-negotiate-tabs">
        <button type="button" className={'cos-negotiate-tab' + (pane === 'draft' ? ' is-active' : '')} onClick={() => setPane('draft')}>Your draft</button>
        <button type="button" className={'cos-negotiate-tab' + (pane === 'thread' ? ' is-active' : '')} onClick={() => setPane('thread')}>
          Thread <span className="cos-negotiate-tab-cnt">{threadMessageCount}</span>
        </button>
        <button type="button" className={'cos-negotiate-tab' + (pane === 'ai' ? ' is-active' : '')} onClick={() => setPane('ai')}>AI reference</button>
        <span className="cos-negotiate-tab-hint">{intel.nextStep}</span>
      </div>
      <div className="cos-negotiate-main">
        {pane === 'draft' ? draftPane : null}
        {pane === 'thread' ? threadPane : null}
        {pane === 'ai' ? aiPane : null}
      </div>
      {sidebarOpen && (
        <div className="cos-copilot-portal" role="presentation">
          <button type="button" className="cos-copilot-scrim" aria-label="Close lead intel" onClick={() => setSidebarOpen(false)} />
          <V4LeadCopilotSidebar
            lead={lead}
            leads={leads}
            intel={intel}
            collapsed={false}
            overlay
            onToggle={() => setSidebarOpen(false)}
            onEscalate={escalate}
            onApprove={sendReply}
          />
        </div>
      )}
    </div>
  );
}

function V4CosReader({ lead, user, composeOpen, setComposeOpen, onBack, isBrief, briefItem, onOpenSplits, leads = [], onAfterSend }) {
  const { STAGE_BY_ID, USERS } = window.V3;
  const [tab, setTab] = React.useState('thread');
  const [threadSync, setThreadSync] = React.useState({ status: 'idle', note: '' });
  const [quickSend, setQuickSend] = React.useState({ status: '', error: '' });
  const [xDmReplyOpen, setXDmReplyOpen] = React.useState(false);
  const [xDmDraft, setXDmDraft] = React.useState('');
  const [xDmCopied, setXDmCopied] = React.useState(false);
  React.useEffect(() => { setTab('thread'); }, [lead?.id]);
  React.useEffect(() => {
    setThreadSync({ status: 'idle', note: '' });
    setQuickSend({ status: '', error: '' });
    setXDmReplyOpen(false);
    setXDmDraft('');
    setXDmCopied(false);
  }, [lead?.id]);
  const isIntake = window.V3.IsNewLeadReview && window.V3.IsNewLeadReview(lead);
  const agentLine = V4CosAgentLine(lead);
  React.useEffect(() => {
    if (!lead) {
      if (typeof V4ClearCopilotFocus === 'function') V4ClearCopilotFocus('company-os');
      return;
    }
    if (typeof V4SetCopilotFocus === 'function') V4SetCopilotFocus(V4BuildCopilotFocusFromLead(lead));
    return () => { if (typeof V4ClearCopilotFocus === 'function') V4ClearCopilotFocus('company-os'); };
  }, [lead?.id]);
  React.useEffect(() => {
    if (!onAfterSend || !lead) return;
    const onSent = (e) => {
      if (String(e?.detail?.leadId) === String(lead.id)) {
        setComposeOpen(false);
        onAfterSend(lead);
      }
    };
    window.addEventListener('v3:email-sent', onSent);
    return () => window.removeEventListener('v3:email-sent', onSent);
  }, [lead?.id, onAfterSend, setComposeOpen]);
  if (!lead) {
    return <div className="cos2-reader"><div className="cos2-reader-empty">Select a thread from the list.</div></div>;
  }

  const isBriefSelected = isBrief && briefItem;
  const stage = STAGE_BY_ID[lead.stage];
  const nextOwner = lead.nextMove?.who ? USERS[lead.nextMove.who] : null;
  const isMine = window.V3.MoveIsMineForProfile(lead, user);
  const isThem = !lead.nextMove?.who && !['paid-out'].includes(lead.stage);
  const replyAction = ['Reply', 'Send', 'Nudge'].includes(lead.nextMove?.action);
  const owner = lead.ownerId ? USERS[lead.ownerId] : null;
  const operatorStatus = V4OperatorStatus(lead);
  const isReview = String(lead.draftReplyStatus || '').toLowerCase() === 'review';
  const reviewReason = (Array.isArray(lead.activity)
    ? (lead.activity.filter(a => String(a.user || '') === 'Scam gate').slice(-1)[0] || {}).action
    : '') || 'Verify the sender and what they are proposing before committing.';
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
  const needsXDmReply = V4XLeadNeedsDmReply(lead);
  const openXDmReply = () => {
    setComposeOpen(false);
    setXDmDraft(V4BuildXDmReplyDraft(lead));
    setXDmReplyOpen(true);
    setXDmCopied(false);
  };
  React.useEffect(() => {
    if (!lead?.id || !needsXDmReply) return;
    setXDmDraft(V4BuildXDmReplyDraft(lead));
    setXDmReplyOpen(true);
    setXDmCopied(false);
  }, [lead?.id, needsXDmReply]);
  React.useEffect(() => {
    if (!lead || !composeOpen || !needsXDmReply) return;
    openXDmReply();
  }, [lead?.id, composeOpen, needsXDmReply]);
  const copyXDmDraft = async () => {
    const text = String(xDmDraft || '').trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setXDmCopied(true);
      window.setTimeout(() => setXDmCopied(false), 2200);
    } catch (err) {
      window.prompt('Copy this X DM draft:', text);
    }
  };
  const xDmReplySheet = needsXDmReply ? (
    <div className="cos-x-reply-draft is-sheet">
      <div className="cos-x-reply-draft-head">
        <div>
          <div className="cos-operator-strip-eyebrow">X reply</div>
          <strong>DM draft — copy into X</strong>
        </div>
        <div className="cos-x-reply-draft-actions">
          <button type="button" className="cos-quick-btn is-primary" onClick={copyXDmDraft}>
            {xDmCopied ? 'Copied' : 'Copy draft'}
          </button>
          {lead.xOpenDm ? (
            <button type="button" className="cos-quick-btn" onClick={() => window.open(lead.xOpenDm, '_blank', 'noopener')}>
              Open DM
            </button>
          ) : null}
          {xDmReplyOpen ? (
            <button type="button" className="cos-quick-btn" onClick={() => setXDmReplyOpen(false)}>Minimize</button>
          ) : (
            <button type="button" className="cos-quick-btn" onClick={openXDmReply}>Expand</button>
          )}
        </div>
      </div>
      {xDmReplyOpen ? (
        <React.Fragment>
          <textarea
            className="cos-x-reply-draft-body"
            value={xDmDraft}
            rows={7}
            onChange={e => setXDmDraft(e.target.value)}
            spellCheck
          />
          <p className="cos-x-reply-draft-hint">
            Paste as Robert in the X DM thread. When sent, click <strong>Mark replied on X</strong> so the board stays accurate.
          </p>
        </React.Fragment>
      ) : (
        <button type="button" className="cos-x-reply-draft-collapsed" onClick={openXDmReply}>
          Draft ready — click to expand and edit before copying
        </button>
      )}
    </div>
  ) : null;
  const moveLead = (nextStage) => window.V3.MoveLeadStage(lead, nextStage);
  const clearUnread = () => V4CosPatchLead(lead, { new_reply_at: null }, { unread: false });
  const threadFreshness = V4LeadThreadFreshness(lead);
  const pendingOperatorDraft = String(lead.draftReplyStatus || '').toLowerCase() === 'pending' && String(lead.draftReply?.body || '').trim();
  const refreshThread = async () => {
    if (!lead) return;
    setThreadSync({
      status: 'syncing',
      note: isXLead ? 'Pulling DM context from X intake…' : 'Pulling this thread from Gmail…',
    });
    try {
      if (isXLead) await V4RefreshLeadFromX(lead);
      else await V4RefreshLeadFromGmail(lead);
      setThreadSync({
        status: 'ok',
        note: isXLead ? 'X DM context refreshed' : 'Thread refreshed from Gmail',
      });
    } catch (err) {
      setThreadSync({ status: 'error', note: err?.message || 'Refresh failed' });
    }
    window.setTimeout(() => setThreadSync({ status: 'idle', note: '' }), 4500);
  };
  const quickApproveSend = async () => {
    setQuickSend({ status: 'sending', error: '' });
    try {
      await V4SendApprovedReply(lead);
      setQuickSend({ status: 'sent', error: '' });
      if (typeof onAfterSend === 'function') onAfterSend(lead);
    } catch (err) {
      setQuickSend({ status: 'error', error: err?.message || 'Send failed' });
    }
  };

  const briefSummary = isBriefSelected ? (
    <div className="brief-detail-summary">
      <h4>Brief Summary</h4>
      <ul className="brief-points">
        {briefItem.points.map((p, i) => <li key={i}>{V4CleanDisplayText(p)}</li>)}
      </ul>
    </div>
  ) : null;

  const readerOps = (
    <>
      <div className="cos-quick-actions">
        <div className="cos-quick-actions-group">
          <span className="cos-quick-actions-label">Quick actions</span>
          <button className="cos-quick-btn is-primary" type="button" onClick={() => (needsXDmReply ? openXDmReply() : setComposeOpen(true))}>
            {needsXDmReply ? (xDmReplyOpen ? 'DM draft open' : 'Reply on X') : (lead.draftReply ? 'Approve draft' : (replyAction ? lead.nextMove.action : 'Reply'))}
          </button>
          {isXLead && lead.xOpenDm && (
            <button className="cos-quick-btn" type="button" onClick={() => window.open(lead.xOpenDm, '_blank', 'noopener')}>
              Open DM
            </button>
          )}
          {isXLead && !V3XLeadRepliedViaX(lead) && (
            <button className="cos-quick-btn" type="button" onClick={() => window.V3.MarkRepliedViaX?.(lead)}>
              Mark replied on X
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
  const moveEyebrow = isMine ? "ASHER'S MOVE" : isThem ? `WAITING ON ${String(lead.contactName || '').split(' ')[0].toUpperCase()}` : nextOwner ? `${nextOwner.name.toUpperCase()}'S MOVE` : 'NEXT MOVE';
  const threadId = lead.gmailThreadId || lead.id || '';
  const threadIdShort = String(threadId).slice(-8).toUpperCase();

  const hasDraftReady = Boolean(lead.draftReply?.body);
  const isThreadTab = tab === 'thread';
  const gmailSubject = window.V3?.V3SubjectForLead ? window.V3.V3SubjectForLead(lead) : (lead.thread?.[0]?.subject || lead.brand);
  const threadMessageCount = Array.isArray(lead.thread) ? lead.thread.length : 0;
  const agentReason = lead.agentAssessment || operatorSummary.lead_summary || operatorAnalysis.reason || '';

  return (
    <div className={'cos2-reader v6-reader cos2-reader--split cos2-reader--gmail' + (composeOpen ? ' cos2-reader--compose-open' : '') + (isThreadTab ? ' cos2-reader--gmail-native' : '')}>
      {isThreadTab ? (
        <div className="gmail-read-pane">
          <header className="gmail-read-hd">
            <button className="gmail-read-back hd-icon-btn" onClick={onBack} aria-label="Back to list" type="button">
              <V3Icon name="chev_d" w={16} style={{ transform: 'rotate(90deg)' }} />
            </button>
            {onOpenSplits && (
              <button type="button" className="gmail-read-splits hd-icon-btn" onClick={onOpenSplits} aria-label="Open workflows">
                <V3Icon name="compact" w={18} />
              </button>
            )}
            <div className="gmail-read-hd-main">
              <h1 className="gmail-read-subject">{V4CleanDisplayText(gmailSubject)}</h1>
              <div className="gmail-read-submeta">
                <span className="gmail-read-contact">{lead.contactName}{lead.email ? ` · ${lead.email}` : ''}</span>
                <span className="gmail-read-sep">·</span>
                <span>{threadMessageCount} {threadMessageCount === 1 ? 'message' : 'messages'}</span>
                <span className="gmail-read-sep">·</span>
                <span className={'gmail-read-fresh' + (threadFreshness.stale ? ' is-stale' : '')}>{threadFreshness.label}</span>
                <span className="gmail-read-sep">·</span>
                <span className="gmail-read-stage" style={{ color: stage.color }}>{stage.name}</span>
                {(lead.unread || lead.needsReply) && <span className="gmail-read-action">Needs reply</span>}
                <span className="gmail-read-links">
                  <button type="button" className="gmail-read-link" onClick={refreshThread} disabled={threadSync.status === 'syncing'}>
                    {threadSync.status === 'syncing'
                      ? 'Refreshing…'
                      : (isXLead ? '↻ Pull X context' : '↻ Refresh thread')}
                  </button>
                  <button type="button" className="gmail-read-link" onClick={() => setTab('stands')}>Where this stands</button>
                  {lead.brief && <button type="button" className="gmail-read-link" onClick={() => setTab('brief')}>Brief</button>}
                </span>
              </div>
              {threadSync.note ? <div className={'gmail-read-sync-note is-' + threadSync.status}>{threadSync.note}</div> : null}
            </div>
          </header>
          {pendingOperatorDraft && !composeOpen && !isReview && (
            <div className="cos2-review-banner gmail-read-approve">
              <div className="cos2-review-banner-msg">
                <strong>Operator draft ready</strong>
                <span>One click sends exactly what&apos;s in the draft — or open compose to edit first.</span>
              </div>
              <div className="cos2-review-banner-btns">
                <button type="button" className="cos2-review-approve" onClick={quickApproveSend} disabled={quickSend.status === 'sending'}>
                  {quickSend.status === 'sending' ? 'Sending…' : quickSend.status === 'sent' ? 'Sent' : 'Approve & send'}
                </button>
                <button type="button" className="cos2-review-dismiss" onClick={() => setComposeOpen(true)}>Edit first</button>
              </div>
              {quickSend.error ? <div className="gmail-read-sync-note is-error">{quickSend.error}</div> : null}
            </div>
          )}
          {isIntake && (
            <div className="cos-intake-bar">
              <span>New intake from Robert pipeline</span>
              <button type="button" className="cos-intake-accept" onClick={() => window.V3.MoveLeadStage(lead, 'first-touch')}>Accept to board</button>
              <button type="button" className="cos-intake-trash" onClick={() => window.V3.MoveLeadStage(lead, 'trash')}>Trash</button>
            </div>
          )}
          {(hasDraftReady || agentLine) && !composeOpen && (
            <details className="cos-agent-strip">
              <summary><span className="cos-agent-strip-lbl">Agent</span> {agentLine}</summary>
              {agentReason && agentReason !== agentLine ? <p>{agentReason}</p> : null}
            </details>
          )}
          {isReview && (
            <div className="cos2-review-banner gmail-read-review">
              <div className="cos2-review-banner-msg">
                <strong>Scam gate flagged this for review</strong>
                <span>{reviewReason}</span>
              </div>
              <div className="cos2-review-banner-btns">
                {lead.draftReply && <button type="button" className="cos2-review-approve" onClick={() => setComposeOpen(true)}>Approve &amp; send</button>}
                <button type="button" className="cos2-review-dismiss" onClick={() => { if (window.confirm('Dismiss as scam and move to Trash?')) window.V3.MoveLeadStage(lead, 'trash'); }}>Dismiss (scam)</button>
              </div>
            </div>
          )}
          <div className="gmail-read-scroll">
            {isXLead ? (
              <div className="cos-reader-stands gmail-read-x-context">
                {V4LeadIsTravelLead(lead) && (
                  <div className="cos-travel-banner">
                    <V3Icon name="cal" w={14} />
                    <div>
                      <strong>Travel opportunity</strong>
                      <span>{lead.travelLabel || V4LeadTravelLabel(lead)} — move this to email and scope trip terms fast.</span>
                    </div>
                  </div>
                )}
                {V3XLeadRepliedViaX(lead) && (
                  <div className="cos-x-replied-banner">
                    <V3Icon name="network" w={14} />
                    <div>
                      <strong>Replied via X</strong>
                      <span>{lead.xLastRobertMessage || 'Robert already replied in the DM thread. No email thread exists for this lead yet.'}</span>
                    </div>
                  </div>
                )}
                <V4XIntakePanel lead={lead} />
              </div>
            ) : (
              <V3GmailThread lead={lead} />
            )}
          </div>
          <div className={'gmail-reply-sheet' + (composeOpen || needsXDmReply ? ' is-open is-x-dm-open' : '')}>
            {composeOpen && agentLine && (
              <div className="cos-agent-oneline"><strong>Agent:</strong> {agentLine}</div>
            )}
            {composeOpen ? (
              <V3InlineReply lead={lead} user={user} layout="gmail" onCollapse={() => setComposeOpen(false)} />
            ) : needsXDmReply ? (
              xDmReplySheet
            ) : (
              <button type="button" className={'gmail-reply-trigger' + (hasDraftReady ? ' is-draft-ready' : '')} onClick={() => setComposeOpen(true)}>
                <V3Icon name="reply" w={16} />
                <span>
                  {hasDraftReady
                    ? `Reply${isReview ? ' — review draft' : ' — draft ready'}`
                    : 'Reply'}
                </span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
      <button className="hd-icon-btn cos2-back v6-back-mobile" onClick={onBack} aria-label="Back to list" type="button">
        <V3Icon name="chev_d" w={14} style={{ transform: 'rotate(90deg)' }} />
      </button>
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
      <div className="cos2-gmail-shell">
        <div className="cos2-gmail-column">
            <>
              <div className="v6-rhead fadein">
                <div className="v6-tags">
                  {(lead.unread || lead.needsReply) && <span className="v6-tag hot">Action now</span>}
                  {V3XLeadRepliedViaX(lead) && <span className="v6-tag is-x-replied">Replied via X</span>}
                  <span className="v6-tag">{lead.source || 'Lead'}</span>
                  {lead.category && <span className="v6-tag">{lead.category}</span>}
                  {owner && <span className="v6-tag">Owner · {owner.name}</span>}
                  <span className="v6-tag">{lead.daysInStage || 0}d in stage</span>
                </div>
                <h1>{V4CleanDisplayText(lead.brand)}</h1>
                <div className="v6-sub">
                  {lead.contactName}
                  {lead.email ? ` · ${lead.email}` : ''}
                  {threadIdShort ? ` · thread ${threadIdShort}` : ''}
                </div>
              </div>
              {isBriefSelected && briefItem && (
                <div className="brief-detail-summary">
                  <h4>Brief Summary</h4>
                  <ul className="brief-points">
                    {briefItem.points.map((p, i) => <li key={i}>{V4CleanDisplayText(p)}</li>)}
                  </ul>
                </div>
              )}
              <div className="cos-reader-hero fadein" style={{ animationDelay: '.06s' }}>
                <div className={'next-move next-move-compact v6-move ' + (isMine ? '' : 'them')}>
                  <div className="next-move-icon" aria-hidden="true">→</div>
                  <div className="next-move-text">
                    <div className="next-move-eyebrow">{moveEyebrow}</div>
                    <div className="next-move-title">{lead.nextMove?.text || listSnippet}</div>
                  </div>
                </div>
              </div>
              <div className="v6-metrics v6-metrics-compact fadein" style={{ animationDelay: '.12s' }}>
                <span><b>{lead.value ? v3Money(lead.value) : '—'}</b> deal</span>
                <span><b>{lead.daysInStage || 0}</b> days in stage</span>
                <span><b>{Array.isArray(lead.thread) ? lead.thread.length : 0}</b> emails</span>
              </div>
            </>
          {isReview && (
            <div className="cos2-review-banner">
              <div className="cos2-review-banner-msg">
                <strong>Scam gate flagged this for review</strong>
                <span>{reviewReason}</span>
              </div>
              <div className="cos2-review-banner-btns">
                {lead.draftReply && <button type="button" className="cos2-review-approve" onClick={() => setComposeOpen(true)}>Approve &amp; send</button>}
                <button type="button" className="cos2-review-dismiss" onClick={() => { if (window.confirm('Dismiss as scam and move to Trash?')) window.V3.MoveLeadStage(lead, 'trash'); }}>Dismiss (scam)</button>
              </div>
            </div>
          )}
          <div className="cos2-reader-workspace cos2-reader-workspace--gmail">
            <div className="cos2-reader-pane cos2-reader-pane--thread">
              <div className="drawer-tabs">
                <button className="dr-tab" aria-selected={tab === 'thread'} onClick={() => setTab('thread')}>
                  {isXLead ? 'Lead context' : 'Email thread'} <span className="cnt">{lead.thread.length}</span>
                </button>
                <button className="dr-tab" aria-selected={tab === 'stands'} onClick={() => setTab('stands')}>
                  Where this stands
                </button>
                {lead.brief && (
                  <button className="dr-tab" aria-selected={tab === 'brief'} onClick={() => setTab('brief')}>
                    Content brief
                  </button>
                )}
              </div>
              <div className="cos2-thread-scroll">
                <div className="drawer-body drawer-body--thread">
                  {tab === 'stands' && (
                    <div className="cos-reader-stands">
                      {readerOps}
                      <V3Stands lead={lead} />
                    </div>
                  )}
                  {tab === 'brief' && lead.brief && window.V3BriefPanel && (
                    <div className="cos-reader-stands cos-reader-brief">
                      {React.createElement(window.V3BriefPanel, { lead, user })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
        </>
      )}
    </div>
  );
}

// Small premium animated counter for "alive" metrics
function AnimatedCounter({ value, className = '', format }) {
  const [display, setDisplay] = React.useState(value);
  const prevRef = React.useRef(value);

  React.useEffect(() => {
    if (prevRef.current === value) return;
    const start = prevRef.current;
    const end = value;
    const duration = 420;
    const startTime = performance.now();

    const animate = (now) => {
      const progress = Math.min((now - startTime) / duration, 1);
      // ease out
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + (end - start) * eased);
      setDisplay(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setDisplay(end);
        prevRef.current = end;
      }
    };

    requestAnimationFrame(animate);
  }, [value]);

  return <span className={className} data-changing={prevRef.current !== value}>{format ? format(display) : display}</span>;
}

function V4CompanyOsView({ leads = [], query = '', onQueryChange, listSearchRef, user = 'asher', onOpenLead, onNavigateView, initialQueue = '' }) {
  React.useEffect(() => {
    V4MaybeRedirectToMachineHostedApp();
  }, []);

  const [sourceFilter, setSourceFilter] = React.useState(() => {
    try { return window.localStorage.getItem('cos-source-filter') || 'all'; } catch (e) { return 'all'; }
  });
  React.useEffect(() => {
    try { window.localStorage.setItem('cos-source-filter', sourceFilter); } catch (e) {}
  }, [sourceFilter]);

  const cosBase = React.useMemo(() => leads
    .filter(l => !l.isRobertBrief)
    .filter(l => V4CompanyOsFilterLead(l, query)), [leads, query]);

  const sourceCounts = React.useMemo(() => ({
    all: cosBase.filter(l => !['trash', 'dead-leads'].includes(l.stage)).length,
    x: cosBase.filter(l => !['trash', 'dead-leads'].includes(l.stage) && V4CompanyOsLeadSourceChannel(l) === 'x').length,
    gmail: cosBase.filter(l => !['trash', 'dead-leads'].includes(l.stage) && V4CompanyOsLeadSourceChannel(l) === 'gmail').length,
  }), [cosBase]);

  const allCos = React.useMemo(() => cosBase
    .filter(l => V4CompanyOsMatchesSourceFilter(l, sourceFilter)), [cosBase, sourceFilter]);
  const byRecent = (a, b) => V3LeadActivityTimestamp(b) - V3LeadActivityTimestamp(a);
  const liveAll = allCos.filter(l => !['trash', 'dead-leads'].includes(l.stage));

  const [snoozes, setSnoozes] = React.useState(() => {
    try { return JSON.parse(window.localStorage.getItem('v4-snoozes') || '{}'); } catch (e) { return {}; }
  });
  React.useEffect(() => {
    try { window.localStorage.setItem('v4-snoozes', JSON.stringify(snoozes)); } catch (e) {}
  }, [snoozes]);
  const nowTs = Date.now();
  const isSnoozed = (l) => snoozes[l.id] && Date.parse(snoozes[l.id]) > nowTs;
  const awakeAll = liveAll.filter(l => !isSnoozed(l));

  const intakeItems = awakeAll
    .filter(l => window.V3.IsNewLeadReview && window.V3.IsNewLeadReview(l))
    .sort(byRecent);
  const live = awakeAll.filter(l => !(window.V3.IsNewLeadReview && window.V3.IsNewLeadReview(l)));
  const activeItems = live.filter(l => !['done', 'paid-out'].includes(l.stage));
  const travelItems = [...intakeItems, ...activeItems]
    .filter(V4CosIsTravelLead)
    .sort((a, b) => V4SortActionLeads(a, b) || byRecent(a, b));
  const intakeNonTravel = intakeItems.filter(l => !V4CosIsTravelLead(l));
  const sendItems = activeItems.filter(V4CosIsSendLead).sort(V4SortActionLeads);
  const sendQueue = [...intakeNonTravel, ...sendItems];
  const chaseItems = activeItems.filter(l => !V4CosIsTravelLead(l) && V4CosIsChaseLead(l)).sort((a, b) => (b.daysInStage || 0) - (a.daysInStage || 0) || byRecent(a, b));
  const watchItems = activeItems.filter(l => !V4CosIsTravelLead(l) && V4CosIsWatchLead(l)).sort(byRecent);
  const closedItems = live.filter(l => ['done', 'paid-out'].includes(l.stage)).sort(byRecent);
  const base = allCos;

  const splits = [
    { id: 'travel', label: 'Travel', hint: 'Sponsored trips, factory visits, on-site events — highest value', queue: true, hot: travelItems.length > 0, items: travelItems },
    { id: 'send', label: 'Send', hint: 'Drafts to approve, replies owed, new intake', queue: true, hot: sendQueue.length > 0, items: sendQueue },
    { id: 'chase', label: 'Chase', hint: 'Negotiating, payment, follow ups, brief Robert', queue: true, hot: chaseItems.length > 0, items: chaseItems },
    { id: 'watch', label: 'Watch', hint: 'Nothing urgent from our side right now', queue: true, items: watchItems },
    { id: 'snoozed', label: 'Snoozed', section: 'More', items: liveAll.filter(isSnoozed).sort((a, b) => Date.parse(snoozes[a.id]) - Date.parse(snoozes[b.id])) },
    { id: 'closed', label: 'Done and paid', section: 'More', items: closedItems },
    { id: 'trash', label: 'Trash', section: 'More', trash: true, items: base.filter(l => ['trash', 'dead-leads'].includes(l.stage)).sort(byRecent) },
    { id: 'toolkit', label: 'Toolkit', section: 'More', toolkit: true, items: V4_COMPANY_OS_TOOLKIT },
  ];

  const [splitId, setSplitId] = React.useState(() => {
    if (initialQueue) return initialQueue;
    return travelItems.length > 0 ? 'travel' : 'send';
  });
  const [selId, setSelId] = React.useState(null);
  const [composeOpen, setComposeOpen] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const deepLinkLeadRef = React.useRef(null);
  const deepLinkComposeRef = React.useRef(false);
  const skipSplitResetRef = React.useRef(false);
  const [splitsOpen, setSplitsOpen] = React.useState(false);
  const moreMenuRef = React.useRef(null);
  const moreSplits = React.useMemo(() => splits.filter(s => !s.queue), [splits]);

  React.useEffect(() => {
    if (!splitsOpen) return;
    const onPointerDown = (e) => {
      if (moreMenuRef.current && moreMenuRef.current.contains(e.target)) return;
      setSplitsOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setSplitsOpen(false); };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [splitsOpen]);
  const [syncStatus, setSyncStatus] = React.useState('idle');
  const [purgeStatus, setPurgeStatus] = React.useState('idle');
  const spamCandidates = React.useMemo(() => liveAll.filter(V4LeadLooksLikeSpam), [liveAll]);
  const [syncNote, setSyncNote] = React.useState('');
  const [copiedDmId, setCopiedDmId] = React.useState('');
  const copyCosDmDraft = async (lead, e) => {
    e?.stopPropagation?.();
    const text = String(V4BuildXDmReplyDraft(lead) || '').trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedDmId(String(lead.id));
      window.setTimeout(() => setCopiedDmId(''), 2200);
    } catch (err) {
      window.prompt('Copy this X DM draft:', text);
    }
  };
  const gmailDeltaRef = React.useRef({ running: false, last: 0 });
  const [isMobile, setIsMobile] = React.useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches
  );

  const purgeSpamQueue = React.useCallback(async () => {
    if (!spamCandidates.length) return;
    if (!window.confirm('Trash ' + spamCandidates.length + ' spam/noise lead(s) and run server cleanup?')) return;
    setPurgeStatus('running');
    try {
      const result = await V4PurgeSpamQueue(leads);
      setSyncNote('Trashed ' + (result.trashed || 0) + ' spam lead(s)');
      setSyncStatus('ok');
    } catch (err) {
      setSyncNote(err?.message || 'Spam purge failed');
      setSyncStatus('error');
    } finally {
      setPurgeStatus('idle');
      window.setTimeout(() => { setSyncStatus('idle'); setSyncNote(''); }, 4000);
    }
  }, [leads, spamCandidates.length]);

  const refreshFromGmail = React.useCallback(async (opts = {}) => {
    if (gmailDeltaRef.current.running) return;
    const quiet = !!opts.quiet;
    const minGap = quiet ? 10000 : 0;
    const now = Date.now();
    if (minGap && now - gmailDeltaRef.current.last < minGap) return;
    gmailDeltaRef.current.running = true;
    gmailDeltaRef.current.last = now;
    if (!quiet) {
      setSyncStatus('syncing');
      setSyncNote('Checking Gmail changes…');
    }
    try {
      let res = await V4BriefServiceFetch('/sync-asher-gmail-delta', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      let data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || ('Sync failed (' + res.status + ')'));
      }
      if (data.checkpoint_expired) {
        if (!quiet) setSyncNote('Gmail checkpoint expired. Running full catch-up…');
        res = await V4BriefServiceFetch('/sync-asher-gmail', {
          method: 'POST',
          body: JSON.stringify({}),
        });
        data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false) {
          throw new Error(data.error || ('Full sync failed (' + res.status + ')'));
        }
      }
      if (window.V3?.ReloadLeads) await window.V3.ReloadLeads();
      const patched = Number(data.cards_updated ?? data.threads_patched ?? 0);
      const created = Number(data.new_cards_written || 0);
      const operatorQueued = !!data.operator_queued;
      if (!quiet || patched || created || operatorQueued) {
        const parts = [];
        if (created) parts.push(created + ' new');
        if (patched) parts.push(patched + ' updated');
        if (operatorQueued) parts.push('operator drafting');
        setSyncNote(
          parts.length
            ? ('Synced · ' + parts.join(' · '))
            : 'Synced · up to date'
        );
        setSyncStatus('ok');
      }
    } catch (err) {
      if (!quiet) {
        try {
          if (window.V3?.ReloadLeads) await window.V3.ReloadLeads();
          setSyncNote('Reloaded board · Gmail sync unavailable');
          setSyncStatus('ok');
        } catch (reloadErr) {
          setSyncNote(err?.message || 'Sync failed');
          setSyncStatus('error');
        }
      }
    } finally {
      gmailDeltaRef.current.running = false;
      if (!quiet) {
        window.setTimeout(() => {
          setSyncStatus('idle');
          setSyncNote('');
        }, 3500);
      }
    }
  }, []);

  React.useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') refreshFromGmail({ quiet: true });
    };
    const first = window.setTimeout(tick, 2500);
    const interval = window.setInterval(tick, 15000);
    const onFocus = () => tick();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [refreshFromGmail]);

  const split = splits.find(s => s.id === splitId) || splits[0];
  const items = split.items || [];
  let selected = null;
  if (selId != null) {
    selected = items.find(l => String(l.id) === String(selId)) || null;
    if (!selected) selected = liveAll.find(l => String(l.id) === String(selId)) || null;
  } else if (!isMobile) {
    selected = items[0] || null;
  }

  React.useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem('cos-queue');
      if (stored && splits.some(s => s.id === stored)) {
        setSplitId(stored);
        window.sessionStorage.removeItem('cos-queue');
      }
      const leadId = window.sessionStorage.getItem('cos-lead-id');
      if (leadId) {
        deepLinkLeadRef.current = leadId;
        skipSplitResetRef.current = true;
        window.sessionStorage.removeItem('cos-lead-id');
      }
      if (window.sessionStorage.getItem('cos-compose') === '1') {
        deepLinkComposeRef.current = true;
        window.sessionStorage.removeItem('cos-compose');
      }
      const current = new URL(String(window.location?.href || ''));
      const openTarget = current.searchParams.get('open');
      if (['brief-maker', 'x-signal', 'manual-lead', 'robert-handoff', 'toolkit'].includes(openTarget)) {
        setSplitId('toolkit');
      }
    } catch (err) {}
  }, []);

  React.useEffect(() => {
    if (deepLinkLeadRef.current) {
      const id = deepLinkLeadRef.current;
      deepLinkLeadRef.current = null;
      const wantCompose = deepLinkComposeRef.current;
      deepLinkComposeRef.current = false;
      setSelId(id);
      if (typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches) {
        setMobileOpen(true);
      }
      if (wantCompose) setComposeOpen(true);
      return;
    }
    if (skipSplitResetRef.current) {
      skipSplitResetRef.current = false;
      return;
    }
    setSelId(null);
    setMobileOpen(false);
    setComposeOpen(false);
  }, [splitId]);

  React.useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  React.useEffect(() => {
    if (!selected) setComposeOpen(false);
  }, [selected?.id]);

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
      if (split.toolkit) return;
      if (split.queue) {
        if (e.key === 'j' || e.key === 'J' || e.key === 'ArrowDown') { e.preventDefault(); moveSel(1); }
        if (e.key === 'k' || e.key === 'K' || e.key === 'ArrowUp')   { e.preventDefault(); moveSel(-1); }
        if (e.key === 'e' || e.key === 'E') { e.preventDefault(); archive(); }
        if (e.key === 'h' || e.key === 'H') { e.preventDefault(); snoozeSelected(); }
        if (e.key === 'u' || e.key === 'U') { e.preventDefault(); toggleRead(); }
      }
      if (e.key === 'r' || e.key === 'R') { e.preventDefault(); if (selected) setComposeOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const travelCount = travelItems.length;
  const sendCount = sendQueue.length;
  const chasePayTotal = chaseItems.filter(l => l.stage === 'invoice-sent').reduce((s, l) => s + (l.value || 0), 0);
  const briefRobertCount = chaseItems.filter(l => l.stage === 'done').length;
  const intakeCount = intakeNonTravel.length;
  const reviewCount = live.filter(l => String(l.draftReplyStatus || '').toLowerCase() === 'review').length;
  const openPipeline = activeItems.reduce((s, l) => s + (l.value || 0), 0);

  const pulseParts = [
    travelCount ? { text: `${travelCount} travel`, onClick: () => setSplitId('travel') } : null,
    sendCount ? { text: `${sendCount} to send`, onClick: () => setSplitId('send') } : null,
    chasePayTotal ? { text: `${V4CompanyOsMoney(chasePayTotal)} waiting on payment`, onClick: () => setSplitId('chase') } : null,
    briefRobertCount ? { text: `${briefRobertCount} brief${briefRobertCount === 1 ? '' : 's'} for Robert`, onClick: () => setSplitId('chase') } : null,
    intakeCount ? { text: `${intakeCount} new intake`, onClick: () => setSplitId('send') } : null,
  ].filter(Boolean);

  const { USERS } = window.V3;

  const queueHints = {
    travel: 'Sponsored travel, factory visits, and on-site opportunities. Move these first.',
    send: 'Agent drafts and replies you owe. Read thread, edit if needed, send.',
    chase: 'Deals in motion. Nudge, chase payment, or brief Robert.',
    watch: 'Quiet for now. Check back when something moves.',
  };
  const [hintDismissed, setHintDismissed] = React.useState(() => {
    try { return JSON.parse(window.localStorage.getItem('cos-queue-hints') || '{}'); } catch (e) { return {}; }
  });
  const dismissHint = (id) => {
    const next = { ...hintDismissed, [id]: true };
    setHintDismissed(next);
    try { window.localStorage.setItem('cos-queue-hints', JSON.stringify(next)); } catch (e) {}
  };

  const splitCountLabel = (s) => {
    if (s.toolkit) return null;
    return s.items.length || 0;
  };

  const pickSplit = (id) => {
    setSplitId(id);
    setSplitsOpen(false);
    setMobileOpen(false);
  };

  const renderSplitButtons = (onPick) => splits.map((s, idx) => (
    <React.Fragment key={s.id}>
      {(idx === 0 || splits[idx - 1].section !== s.section) && (
        <div className="cos2-split-section">{s.section}</div>
      )}
      <button type="button"
              className={'cos2-split' + (s.id === split.id ? ' is-active' : '') + (s.hot ? ' is-hot' : '')}
              onClick={() => onPick(s.id)}
              title={s.hint || ''}>
        <span className="cos2-split-label">{s.label}</span>
        {splitCountLabel(s) != null && (
          <span className="cos2-split-cnt">
            {s.brief
              ? <AnimatedCounter value={splitCountLabel(s)} />
              : splitCountLabel(s)}
          </span>
        )}
      </button>
    </React.Fragment>
  ));

  const mainQueues = splits.filter(s => s.queue);

  return (
    <section className={'page cos2-page cos2-page--queue' + (mobileOpen ? ' is-mobile-reader-open' : '') + (splitsOpen ? ' is-splits-open' : '')}>
      <header className="cos2-top cos2-top--stats">
        <div className="v6-client-brand" aria-label="UNALIGNED active workspace">
          <V6UnalignedMark size={28} />
          <div className="v6-wm">UNALIGNED<small>ACTIVE WORKSPACE</small></div>
        </div>
        <div className="cos2-stats">
          {reviewCount > 0 && (
            <button type="button" className="cos2-stat cos2-stat-review" onClick={() => setSplitId('send')} title="Scam gate flagged these">
              <span className="cos2-stat-lbl">To review</span>
              <span className="cos2-stat-num"><AnimatedCounter value={reviewCount} /></span>
            </button>
          )}
          {travelCount > 0 && (
            <button type="button" className="cos2-stat cos2-stat-travel" onClick={() => setSplitId('travel')} title="Travel opportunities">
              <span className="cos2-stat-lbl">Travel</span>
              <span className="cos2-stat-num"><AnimatedCounter value={travelCount} /></span>
            </button>
          )}
          <button type="button" className="cos2-stat cos2-stat-accent" onClick={() => setSplitId('send')} title="Send queue">
            <span className="cos2-stat-lbl">To send</span>
            <span className="cos2-stat-num"><AnimatedCounter value={sendCount} /></span>
          </button>
          <button type="button" className="cos2-stat" onClick={() => setSplitId('chase')} title="Chase queue">
            <span className="cos2-stat-lbl">Chase</span>
            <span className="cos2-stat-num"><AnimatedCounter value={chaseItems.length} /></span>
          </button>
          {chasePayTotal > 0 && (
            <button type="button" className="cos2-stat" onClick={() => setSplitId('chase')} title="Outstanding invoices">
              <span className="cos2-stat-lbl">Terms / pay</span>
              <span className="cos2-stat-num cos2-stat-money"><AnimatedCounter value={chasePayTotal} format={v => V4CompanyOsMoney(v)} /></span>
            </button>
          )}
          <button type="button" className="cos2-stat" onClick={() => setSplitId('watch')} title="Active pipeline value">
            <span className="cos2-stat-lbl">In play</span>
            <span className="cos2-stat-num cos2-stat-money"><AnimatedCounter value={openPipeline} format={v => V4CompanyOsMoney(v)} /></span>
          </button>
        </div>
        {pulseParts.length > 0 && (
          <div className="cos2-pulse cos2-pulse--inline">
            {pulseParts.map((p, i) => (
              <React.Fragment key={p.text}>
                {i > 0 && <span className="cos2-pulse-sep">·</span>}
                <button type="button" className="cos2-pulse-part" onClick={p.onClick}>{p.text}</button>
              </React.Fragment>
            ))}
          </div>
        )}
        <div className="v6-spacer" />
        <div className="v6-avatars" aria-label="Team">
          {['robert', 'sammy', 'asher'].map((id) => {
            const u = USERS[id];
            if (!u) return null;
            return (
              <div key={id} title={u.name}>
                <V3Avatar name={u.name} color={u.color} size="xs" />
              </div>
            );
          })}
        </div>
        {spamCandidates.length > 0 ? (
          <button
            type="button"
            className={'cos-refresh-btn cos2-purge-spam' + (purgeStatus === 'running' ? ' is-syncing' : '')}
            onClick={purgeSpamQueue}
            disabled={purgeStatus === 'running' || syncStatus === 'syncing'}
            title="Trash all detected spam/noise in the current queue and sync intake cleanup"
          >
            {purgeStatus === 'running' ? 'Clearing…' : '🗑 Clear spam (' + spamCandidates.length + ')'}
          </button>
        ) : null}
        <button
          type="button"
          className={'cos-refresh-btn cos2-refresh' + (syncStatus === 'syncing' ? ' is-syncing' : '') + (syncStatus === 'error' ? ' is-error' : '')}
          onClick={refreshFromGmail}
          disabled={syncStatus === 'syncing' || purgeStatus === 'running'}
          title="Sync all Gmail changes (every lead). Shift+click for full refresh."
        >
          {syncStatus === 'syncing' ? 'Syncing…' : syncStatus === 'error' ? 'Sync failed' : '↻ Sync Gmail'}
        </button>
        {syncNote ? <span className="cos2-sync-note">{syncNote}</span> : null}
      </header>
      <div className={'cos2-body cos2-body--queue' + (mobileOpen ? ' is-mobile-open' : '')}>
        {split.toolkit ? (
          <div className="cos2-main-scroll"><V4CosToolkit onNavigateView={onNavigateView} onActivateSplit={setSplitId} /></div>
        ) : (
          <>
            <div className="cos2-list">
              <div className="cos-source-bar" role="tablist" aria-label="Lead source">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'x', label: 'X' },
                  { id: 'gmail', label: 'Gmail' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={sourceFilter === tab.id}
                    className={'cos-source-pill' + (sourceFilter === tab.id ? ' is-active' : '') + (tab.id === 'x' ? ' is-x' : '') + (tab.id === 'gmail' ? ' is-gmail' : '')}
                    onClick={() => setSourceFilter(tab.id)}
                  >
                    <span>{tab.label}</span>
                    <span className="cos-source-pill-cnt">{sourceCounts[tab.id] ?? 0}</span>
                  </button>
                ))}
              </div>
              <nav className="cos-queue-bar" aria-label="Queues">
                {mainQueues.map(q => (
                  <button
                    key={q.id}
                    type="button"
                    className={'cos-queue-pill' + (split.id === q.id ? ' is-active' : '') + (q.hot ? ' is-hot' : '')}
                    onClick={() => pickSplit(q.id)}
                    title={q.hint}
                  >
                    {q.label}
                    <span className="cos-queue-pill-cnt">{q.items.length}</span>
                  </button>
                ))}
                <div className={'cos-more-wrap' + (splitsOpen ? ' is-open' : '')} ref={moreMenuRef}>
                  <button
                    type="button"
                    className={'cos-queue-pill cos-queue-pill--more' + (moreSplits.some(s => s.id === split.id) ? ' is-active' : '')}
                    onClick={() => setSplitsOpen(open => !open)}
                    aria-expanded={splitsOpen}
                    aria-haspopup="menu"
                    title="Snoozed, done, trash, toolkit"
                  >
                    More
                  </button>
                  {splitsOpen ? (
                    <div className="cos-more-dropdown" role="menu" aria-label="More queues">
                      {moreSplits.map(s => (
                        <button
                          key={s.id}
                          type="button"
                          role="menuitem"
                          className={'cos-more-item' + (s.id === split.id ? ' is-active' : '') + (s.hot ? ' is-hot' : '') + (s.toolkit ? ' is-toolkit' : '')}
                          onClick={() => pickSplit(s.id)}
                          title={s.hint || s.label}
                        >
                          <span>{s.label}</span>
                          {s.toolkit ? (
                            <span className="cos-more-item-meta">Tools</span>
                          ) : (
                            <span className="cos-more-item-cnt">{s.items?.length || 0}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </nav>
              {split.queue && !hintDismissed[split.id] && queueHints[split.id] && (
                <div className="cos-queue-hint">
                  <span>{queueHints[split.id]}</span>
                  <button type="button" onClick={() => dismissHint(split.id)} aria-label="Dismiss">✕</button>
                </div>
              )}
              {!split.toolkit ? (
                <div className="cos2-list-search">
                  <V3Icon name="search" w={12} />
                  <input
                    ref={listSearchRef}
                    type="search"
                    value={query}
                    onChange={(e) => onQueryChange && onQueryChange(e.target.value)}
                    placeholder={'Search ' + split.label.toLowerCase() + '…'}
                    aria-label={'Search leads in ' + split.label}
                  />
                  {query ? (
                    <button
                      type="button"
                      className="cos2-list-search-clear"
                      onClick={() => onQueryChange && onQueryChange('')}
                      aria-label="Clear search"
                    >
                      ✕
                    </button>
                  ) : (
                    <kbd className="cos2-list-search-kbd">/</kbd>
                  )}
                </div>
              ) : null}
              <div className="cos2-list-scroll v6-list-scroll">
              {split.queue ? (
                items.map((l, index) => (
                  <div key={l.id} className={'cos2-row-wrap' + (String(l.id) === String(selected?.id) ? ' is-current' : '')}>
                    <V4QueueRow
                      lead={l}
                      queueId={split.id}
                      isCurrent={String(l.id) === String(selected?.id)}
                      style={{ animationDelay: `${0.03 + index * 0.02}s` }}
                      onClick={() => { setSelId(l.id); setMobileOpen(true); }}
                    />
                    {V4XLeadNeedsDmReply(l) ? (
                      <button
                        type="button"
                        className={'cos2-row-act cos2-row-act--copy is-visible' + (copiedDmId === String(l.id) ? ' is-copied' : '')}
                        title="Copy X DM draft"
                        onClick={(e) => copyCosDmDraft(l, e)}
                      >
                        {copiedDmId === String(l.id) ? '✓' : '⎘'}
                      </button>
                    ) : null}
                    <button type="button"
                            className="cos2-row-act"
                            title="Move to trash"
                            onClick={(e) => { e.stopPropagation(); window.V3.MoveLeadStage(l, 'trash'); }}>
                      <V3Icon name="trash" w={13} />
                    </button>
                  </div>
                ))
              ) : (
                items.map((l, index) => (
                  <div key={l.id} className={'cos2-row-wrap' + (String(l.id) === String(selected?.id) ? ' is-current' : '')}>
                    <V6ListRow
                      lead={l}
                      isCurrent={String(l.id) === String(selected?.id)}
                      style={{ animationDelay: `${0.05 + index * 0.03}s` }}
                      onClick={() => { setSelId(l.id); setMobileOpen(true); }}
                    />
                    <button type="button"
                            className="cos2-row-act"
                            title={split.trash ? 'Restore' : 'Trash'}
                            onClick={(e) => { e.stopPropagation(); window.V3.MoveLeadStage(l, split.trash ? 'new' : 'trash'); }}>
                      <V3Icon name={split.trash ? 'reply' : 'trash'} w={13} />
                    </button>
                  </div>
                ))
              )}
              {items.length === 0 && (
                <div className="cos2-zero">
                  {query ? (
                    <React.Fragment>
                      <span className="cos2-zero-mark">⌕</span>
                      <strong>No matches</strong>
                      <span>Nothing in {split.label.toLowerCase()} for &ldquo;{query}&rdquo;.</span>
                      <button type="button" className="cos2-list-search-clear-btn" onClick={() => onQueryChange && onQueryChange('')}>Clear search</button>
                    </React.Fragment>
                  ) : (
                    <React.Fragment>
                      <span className="cos2-zero-mark">✓</span>
                      <strong>Inbox zero</strong>
                      <span>Nothing in {split.label.toLowerCase()}.</span>
                    </React.Fragment>
                  )}
                </div>
              )}
              </div>
            </div>
            <V4CosReader 
              key={selected ? selected.id : 'no-lead'} 
              lead={selected} 
              user={user}
              leads={liveAll}
              composeOpen={composeOpen} 
              setComposeOpen={setComposeOpen}
              onBack={() => setMobileOpen(false)}
              onOpenSplits={isMobile ? () => setSplitsOpen(true) : null}
              onAfterSend={(lead) => {
                setComposeOpen(false);
                advanceFrom(lead);
              }}
            />
          </>
        )}
      </div>

      {splitsOpen && (
        <div className="cos2-splits-portal" role="presentation">
          <button type="button" className="cos2-splits-scrim" aria-label="Close workflows" onClick={() => setSplitsOpen(false)} />
          <aside className="cos2-splits-drawer" aria-label="Workflow menu">
            <header className="cos2-splits-drawer-hd">
              <div>
                <div className="cos2-splits-drawer-eyebrow">Company OS</div>
                <h2>Workflows</h2>
              </div>
              <button type="button" className="hd-icon-btn" aria-label="Close" onClick={() => setSplitsOpen(false)}>
                <V3Icon name="x" w={16} />
              </button>
            </header>
            <nav className="cos2-splits-drawer-nav">
              {renderSplitButtons(pickSplit)}
            </nav>
          </aside>
        </div>
      )}
    </section>
  );
}

window.V4CompanyOsView = V4CompanyOsView;
function V4LeadThreadFreshness(lead) {
  if (!lead) return { stale: false, label: '', touch: '' };
  if (V3IsXLeadRecord(lead)) {
    const hasCtx = V3XLeadHasUsableContext(lead);
    const touch = lead.lastTouch || '';
    if (!hasCtx) return { stale: true, label: 'No X DM context saved · pull from scrape', touch };
    return { stale: false, label: touch ? `X scrape · ${touch}` : 'X intake loaded', touch };
  }
  const ts = V3LeadActivityTimestamp(lead);
  if (!ts) return { stale: true, label: 'No Gmail thread synced yet', touch: '' };
  const touch = lead.lastTouch || V3RelativeTime(new Date(ts).toISOString());
  const ageMs = Date.now() - ts;
  if (ageMs > 48 * 60 * 60 * 1000) {
    return { stale: true, label: `Thread may be stale · last activity ${touch}`, touch };
  }
  return { stale: false, label: `Updated ${touch}`, touch };
}

async function V4RefreshLeadFromX(lead) {
  const cardId = lead?.rowId || lead?.id;
  if (!cardId) throw new Error('No lead id to refresh.');
  const key = V3NormalizeOpenDmUrl(lead?.xOpenDm);
  const xRows = await V3LoadXDmIntakeRows(Date.now());
  const intake = xRows.find(row => V3NormalizeOpenDmUrl(row.openDm) === key);
  if (intake) {
    const enriched = V3EnrichLeadFromXIntakeRow(lead, intake);
    const desc = JSON.stringify({
      x_summary: enriched.notes || '',
      last_message: enriched.evidence || enriched.xLastLeadMessage || '',
      last_robert_message: enriched.xLastRobertMessage || '',
      last_sender: enriched.xLastSender || '',
      replied_via_x: V3XLeadRepliedViaX(enriched),
      x_current_status: enriched.xCurrentStatus || '',
      best_next_step: enriched.xBestNextStep || '',
      x_username: enriched.xHandle || '',
      open_dm: key || '',
      lead_score: enriched.xLeadScore || null,
      dm_messages: Array.isArray(enriched.xDmMessages) ? enriched.xDmMessages : [],
    });
    if (!String(cardId).startsWith('xdm-')) {
      const res = await fetch(V3_SUPABASE_URL + '/rest/v1/cards?id=eq.' + encodeURIComponent(cardId), {
        method: 'PATCH',
        headers: { ...V3_SUPABASE_HEADERS, Prefer: 'return=minimal' },
        body: JSON.stringify({
          description: desc,
          contact_name: enriched.contactName,
          business_name: enriched.brand,
        }),
      });
      if (!res.ok) throw new Error('Could not save X context to board: ' + await res.text());
    }
    const updated = (window.V3.LEADS || []).map(item =>
      String(item.id) === String(lead.id) ? { ...enriched, rawDescription: desc } : item);
    window.V3.LEADS = updated;
    window.dispatchEvent(new CustomEvent('v3:leads-loaded', { detail: { leads: updated } }));
    window.dispatchEvent(new CustomEvent('v4:refresh-complete', { detail: { leadRefresh: true, cardId: String(cardId), source: 'x-intake' } }));
    return { ok: true, source: 'x-intake' };
  }
  await V4RefreshAllData({ quiet: true });
  return { ok: true, source: 'x-bridge' };
}

async function V4RefreshLeadFromGmail(lead) {
  const cardId = lead?.rowId || lead?.id;
  if (!cardId) throw new Error('No lead id to refresh.');
  const res = await V4BriefServiceFetch('/sync-lead-thread', {
    method: 'POST',
    body: JSON.stringify({ card_id: String(cardId) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || 'Gmail refresh failed');
  await V3ReloadLeads({ cacheBust: Date.now() });
  window.dispatchEvent(new CustomEvent('v4:refresh-complete', { detail: { leadRefresh: true, cardId: String(cardId) } }));
  return data;
}

window.V4RefreshAllData = V4RefreshAllData;
window.V4PurgeSpamQueue = V4PurgeSpamQueue;
window.V4LeadLooksLikeSpam = V4LeadLooksLikeSpam;
window.V4RefreshLeadFromGmail = V4RefreshLeadFromGmail;
window.V4RefreshLeadFromX = V4RefreshLeadFromX;
window.V4LeadThreadFreshness = V4LeadThreadFreshness;
window.V4BuildXDmReplyDraft = V4BuildXDmReplyDraft;
window.V4XLeadNeedsDmReply = V4XLeadNeedsDmReply;
window.V4LeadIsTravelLead = V4LeadIsTravelLead;
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

function V4SyncStatusBadge() {
  const { health } = V4UseOpsHealth();
  const [busy, setBusy] = React.useState(false);
  const scraper = String(health?.scraper_last_status || '').toLowerCase();
  const delta = String(health?.gmail_delta_status || '').toLowerCase();
  const hb = health?.heartbeat || health?.scraper_last_run || health?.gmail_delta_at;
  const ago = hb ? V3RelativeTime(hb) : '';
  let tone = 'ok';
  let label = 'Board live';
  if (busy) { tone = 'busy'; label = 'Syncing Gmail…'; }
  else if (scraper === 'failed') { tone = 'err'; label = 'Gmail sync failed'; }
  else if (scraper === 'degraded') { tone = 'warn'; label = 'Partial Gmail sync'; }
  else if (scraper === 'running') { tone = 'busy'; label = 'Syncing Gmail…'; }
  else if (delta === 'failed') { tone = 'warn'; label = 'Delta sync issue'; }
  if (ago && tone === 'ok') label = `Gmail · ${ago}`;
  const runSync = () => {
    if (busy || typeof V4RefreshAllData !== 'function') return;
    setBusy(true);
    V4RefreshAllData().catch(() => {}).finally(() => setBusy(false));
  };
  return (
    <button
      type="button"
      className={'hd-sync hd-sync--' + tone + ' hd-sync-btn'}
      title="Click to sync Gmail for all leads"
      onClick={runSync}
      disabled={busy}
    >
      <span className="dot"></span>
      {label}
    </button>
  );
}

function V4Onboarding({ onDismiss }) {
  const seen = (() => { try { return localStorage.getItem('v4_onboarding_done') === '1'; } catch (e) { return true; } })();
  const [open, setOpen] = React.useState(!seen);
  if (!open) return null;
  const close = () => {
    try { localStorage.setItem('v4_onboarding_done', '1'); } catch (e) {}
    setOpen(false);
    onDismiss?.();
  };
  return (
    <div className="v4-onboard-scrim" style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={close}>
      <div className="v4-onboard-card" style={{ maxWidth: 420, background: 'var(--surface)', borderRadius: 16, padding: 24, border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>Company OS is home</h2>
        <p style={{ margin: '0 0 12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>Reply to active deals here — not the Gmail app. Use <strong>↻ Refresh thread</strong> on any lead, or click the header Gmail badge to sync everything.</p>
        <ul style={{ margin: '0 0 16px', paddingLeft: 18, lineHeight: 1.6 }}>
          <li><strong>Company OS</strong> — read threads, refresh one lead, approve drafts</li>
          <li><strong>Organs</strong> — today&apos;s decisions, one-click Approve &amp; send</li>
          <li><strong>Sync Gmail</strong> — Organs top bar or header badge (all leads)</li>
        </ul>
        <button type="button" className="hd-nav-btn" onClick={close}>Got it — open Company OS</button>
      </div>
    </div>
  );
}

function V4App() {
  const [, setConfigVersion] = React.useState(0);
  const { USERS, LEADS, STAGE_BY_ID, ACTIVE_STAGE_IDS } = window.V3;
  const [boardState, setBoardState] = React.useState('loading');
  const [boardError, setBoardError] = React.useState('');
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

    organs: '',
  });
  const [toast, setToast] = React.useState(null);
  const toastTimer = React.useRef(null);
  const searchRef = React.useRef(null);
  const cosListSearchRef = React.useRef(null);
  const organsMenuRef = React.useRef(null);
  const [organsMenuOpen, setOrgansMenuOpen] = React.useState(false);
  const [pendingReplies, setPendingReplies] = React.useState([]);

  React.useEffect(() => {
    const onDown = (event) => {
      if (!organsMenuRef.current || organsMenuRef.current.contains(event.target)) return;
      setOrgansMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  React.useEffect(() => {
    V3BootstrapApiToken().catch(() => {});
  }, []);

  React.useEffect(() => {
    setOrgansMenuOpen(false);
  }, [view]);

  React.useEffect(() => {
    const h = (e) => setBriefId(e.detail.leadId);
    window.addEventListener('v3:open-brief', h);
    return () => window.removeEventListener('v3:open-brief', h);
  }, []);

  React.useEffect(() => {
    const onLoad = (e) => {
      setBoardState('ready');
      setBoardError('');
      setLeads(e.detail.leads);
      setPendingReplies(curr => {
        if (!window.V3.PrunePendingReplies) return curr;
        return window.V3.PrunePendingReplies(curr, e.detail.leads);
      });
    };
    const onLoading = () => { setBoardState('loading'); };
    const onError = (e) => {
      setBoardState('error');
      setBoardError(e.detail?.error || 'Could not load board');
    };
    window.addEventListener('v3:leads-loaded', onLoad);
    window.addEventListener('v3:leads-loading', onLoading);
    window.addEventListener('v3:leads-error', onError);
    return () => {
      window.removeEventListener('v3:leads-loaded', onLoad);
      window.removeEventListener('v3:leads-loading', onLoading);
      window.removeEventListener('v3:leads-error', onError);
    };
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
    const showToast = (message) => {
      setToast(message);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => {
        setToast(null);
        toastTimer.current = null;
      }, 5000);
    };
    const onStageFailed = (e) => {
      const err = e.detail?.error || 'Could not save';
      showToast('Trash/move failed — ' + err);
    };
    window.addEventListener('v3:stage-persist-failed', onStageFailed);
    return () => window.removeEventListener('v3:stage-persist-failed', onStageFailed);
  }, []);

  React.useEffect(() => {
    var apply = function () { document.body.setAttribute('data-theme', t.theme); };
    if (window.cubeThemeTransition) window.cubeThemeTransition(apply);
    else apply();
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

  React.useEffect(() => {
    if (view === 'machine-room') setView('organs');
  }, [view]);

  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const [userMenuOpen, setUserMenuOpen] = React.useState(false);
  const userMenuRef = React.useRef(null);

  const switchUser = React.useCallback((id) => {
    setTweak('viewAs', id);
    setView(V4DefaultViewForUser(id));
    setOpenId(null);
    setBriefId(null);
    setUserMenuOpen(false);
  }, []);

  React.useEffect(() => {
    if (!userMenuOpen) return undefined;
    const onDoc = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setUserMenuOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setUserMenuOpen(false); };
    const timer = window.setTimeout(() => {
      document.addEventListener('pointerdown', onDoc, true);
      document.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerdown', onDoc, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [userMenuOpen]);

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
      if (e.key === '/') {
        e.preventDefault();
        if (view === 'company-os' || view === 'new-leads') cosListSearchRef.current?.focus();
        else searchRef.current?.focus();
      }
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
    const byActivity = (a, b) => V3LeadActivityTimestamp(b) - V3LeadActivityTimestamp(a);
    return [
      ...eligible.filter(l => l.unread).sort(byActivity),
      ...eligible.filter(l => !l.unread).sort(byActivity),
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
  const goView = (id) => {
    setView(id);
    if (id !== 'inbox' && id !== 'leads') setOpenId(null);
    setOrgansMenuOpen(false);
  };
  const organsToolViews = ['organs', 'inbox', 'invoices', 'new-leads', 'leads'];
  const organsMenuActive = organsToolViews.includes(view);

  const paletteCommands = [
    { label: 'Go to Company OS', hint: 'workspace', run: () => goView('company-os') },
    { label: 'Go to Organs', hint: 'command center', run: () => goView('organs') },
    { label: 'Go to Today', run: () => goView('today') },
    { label: 'Go to Calendar', run: () => goView('calendar') },
    { label: 'Go to Briefs', run: () => goView('inbox') },
    { label: 'Go to Invoices', run: () => goView('invoices') },
    { label: 'Go to Intake', run: () => { try { window.sessionStorage.setItem('cos-queue', 'send'); } catch (e) {} goView('company-os'); } },
    { label: 'Go to Network', run: () => goView('leads') },
    { label: 'View as Asher', hint: 'shared lane', run: () => { setTweak('viewAs', 'asher'); setOpenId(null); } },
    { label: 'View as Sammy', hint: 'shared lane', run: () => { setTweak('viewAs', 'sammy'); setOpenId(null); } },
    { label: 'View as Robert', hint: 'creator lane', run: () => { setTweak('viewAs', 'robert'); setOpenId(null); } },
    { label: t.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode', run: () => setTweak('theme', t.theme === 'dark' ? 'light' : 'dark') },
    { label: 'Keyboard shortcuts', hint: '?', run: () => setHelpOpen(true) },
    { label: 'Refresh all data', hint: 'Gmail + board + X intake', run: () => V4RefreshAllData().catch(() => {}) },
    { label: 'Refresh all + X scrape', hint: 'Shift+Refresh in Organs', run: () => V4RefreshAllData({ includeXScrape: true }).catch(() => {}) },
  ];

  return (
    <div className="app" data-screen-label={`UNALIGNED — ${view}`}>
      {/* ─── Top bar ─── */}
      <header className="hd v6-gnav">
        <div className="hd-brand v6-gbrand">
          <V6CompanyOsLogo className="v6-logo-full" />
          <V6CompanyOsLogo compact className="v6-logo-compact" />
        </div>

        <div className="hd-nav">
          <button className="hd-nav-btn" aria-current={view === 'today' ? 'page' : undefined} onClick={() => goView('today')}>Today</button>
          <button className="hd-nav-btn" aria-current={view === 'calendar' ? 'page' : undefined} onClick={() => goView('calendar')}>
            <V3Icon name="cal" w={13} style={{ marginRight: 4 }} /> Calendar
          </button>
          <button className="hd-nav-btn" aria-current={view === 'company-os' ? 'page' : undefined} onClick={() => goView('company-os')}>Company OS</button>
          <div className="hd-nav-menu" ref={organsMenuRef}>
            <button
              className="hd-nav-btn hd-nav-menu-btn"
              aria-current={organsMenuActive ? 'page' : undefined}
              aria-haspopup="menu"
              aria-expanded={organsMenuOpen}
              onClick={() => setOrgansMenuOpen(open => !open)}
            >
              Organs <span className="hd-nav-caret">⌄</span>
            </button>
            {organsMenuOpen && (
              <div className="hd-nav-dropdown" role="menu" aria-label="Organs tools">
                <button role="menuitem" className="hd-nav-drop-item" aria-current={view === 'organs' ? 'page' : undefined} onClick={() => goView('organs')}>Organs command</button>
                <button role="menuitem" className="hd-nav-drop-item" aria-current={view === 'inbox' ? 'page' : undefined} onClick={() => goView('inbox')}>
                  Briefs {unreadCount > 0 && <span>{unreadCount}</span>}
                </button>
                <button role="menuitem" className="hd-nav-drop-item" aria-current={view === 'invoices' ? 'page' : undefined} onClick={() => goView('invoices')}>Invoices</button>
                <button role="menuitem" className="hd-nav-drop-item" onClick={() => { try { window.sessionStorage.setItem('cos-queue', 'send'); } catch (e) {} goView('company-os'); }}>
                  New Leads {newLeadCount > 0 && <span>{newLeadCount}</span>}
                </button>
                <button role="menuitem" className="hd-nav-drop-item" aria-current={view === 'leads' ? 'page' : undefined} onClick={() => goView('leads')}>Network</button>
              </div>
            )}
          </div>
        </div>

        <div className="hd-search">
          <V3Icon name="search" w={12} />
          <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)} placeholder={searchPlaceholder} />
          <kbd>⌘K</kbd>
        </div>

        <div className="hd-context-wrap" ref={userMenuRef}>
          <button
            type="button"
            className="hd-context v6-glane hd-context-btn"
            aria-expanded={userMenuOpen}
            aria-haspopup="listbox"
            title={`Viewing as ${me.name} — tap to switch`}
            onClick={() => setUserMenuOpen((open) => !open)}
          >
            <V3Avatar name={me.name} color={me.color} size="xs" className="hd-context-pip" />
            <span>{me.name}</span>
            <span className="hd-context-scope">{SCOPE_TAG[user]}</span>
            <V3Icon name="chev_d" w={12} className="hd-context-chev" />
          </button>
          {userMenuOpen && (
            <div className="hd-user-menu" role="listbox" aria-label="Switch viewer">
              {Object.values(USERS).map((u) => (
                <button
                  key={u.id}
                  type="button"
                  role="option"
                  aria-selected={user === u.id}
                  className={'hd-user-menu-item' + (user === u.id ? ' is-active' : '')}
                  onClick={() => switchUser(u.id)}
                >
                  <V3Avatar name={u.name} color={u.color} size="xs" />
                  <span className="hd-user-menu-label">
                    <strong>{u.name}</strong>
                    <em>{SCOPE_TAG[u.id]}</em>
                  </span>
                  {user === u.id && <V3Icon name="check" w={14} />}
                </button>
              ))}
            </div>
          )}
        </div>

        <V4SyncStatusBadge />
        {boardState === 'loading' && <span className="hd-board-state">Loading board…</span>}
        {boardState === 'error' && (
          <button type="button" className="hd-board-state hd-board-state--err" onClick={() => window.V3?.ReloadLeads?.()}>
            Board error — retry
          </button>
        )}

        <button
          className="hd-theme-toggle"
          title={t.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label="Toggle theme"
          onClick={() => setTweak('theme', t.theme === 'dark' ? 'light' : 'dark')}
        >
          <V3Icon name={t.theme === 'dark' ? 'sun' : 'moon'} />
        </button>

        <div className="hd-right">
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
          <V4CompanyOsView
            leads={mergedLeads}
            query={search}
            onQueryChange={setSearch}
            listSearchRef={cosListSearchRef}
            user={user}
            initialQueue="send"
            onOpenLead={setOpenId}
            onNavigateView={(nextView, nextOpenId = null) => {
              setView(nextView);
              setOpenId(nextOpenId);
            }}
          />
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
            onQueryChange={setSearch}
            listSearchRef={cosListSearchRef}
            user={user}
            onOpenLead={setOpenId}
            onNavigateView={(nextView, nextOpenId = null) => {
              setView(nextView);
              setOpenId(nextOpenId);
            }}
          />
        )}
        {view === 'organs' && (
          <div className="body body-organs" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
            <V4OrgansView
              leads={mergedLeads}
              query={search}
              onOpenInCompanyOs={(leadId) => {
                try {
                  window.sessionStorage.setItem('cos-queue', 'send');
                  window.sessionStorage.setItem('cos-lead-id', String(leadId));
                } catch (e) {}
                setView('company-os');
                setOpenId(null);
              }}
            />
          </div>
        )}
      </main>

      {/* ─── Footer ─── */}
      <footer className="ft">
        <span className="dot"></span>
        <span>Synced · {operationalLeads.length} cards · {operationalLeads.filter(l => !['paid-out'].includes(l.stage)).length} active · {newLeadCount} new leads</span>
        <span className="right">{me.name} ({me.role}) · UNALIGNED Ops</span>
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
        <button className="ft-tab" aria-current={view === 'company-os' ? 'page' : undefined}
                onClick={() => { setView('company-os'); setOpenId(null); }}>
          <V3Icon name="diamond" w={18} />
          OS
        </button>
        <button className="ft-tab" aria-current={organsMenuActive ? 'page' : undefined}
                onClick={() => { setView('organs'); setOpenId(null); }}>
          <V3Icon name="network" w={18} />
          Organs
          {(unreadCount + newLeadCount) > 0 && <span className="ft-tab-badge">{(unreadCount + newLeadCount) > 99 ? '99+' : (unreadCount + newLeadCount)}</span>}
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
      <V4Onboarding onDismiss={() => setView('company-os')} />
      <UnalignedCopilot leads={mergedLeads} />

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
                    options={['today','board','new-leads','company-os','organs','leads','inbox','invoices','calendar']}
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

try {
  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(<V4AppRoot />);
  if (window.__alignedBootMarkReady) window.__alignedBootMarkReady();
} catch (e) {
  console.error('[UNALIGNED] initial render error', e);
  if (window.__alignedBootMarkReady) window.__alignedBootMarkReady();
  // Still show something
  const bootEl = document.getElementById('boot-status');
  if (bootEl) {
    bootEl.style.display = 'block';
    bootEl.textContent = 'Render error: ' + (e && e.message || e);
  }
  throw e;
}
