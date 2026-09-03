/**
 * God Mode Mobile -- shared UNIFY / Aligned News phone globe (one codebase).
 * Browser IIFE. Exposes window.V4GodModeEarth with props
 * { open, layer, viewer, onClose, onLayerChange }.
 * React is a global. Phone HUD + Cesium camera/photoreal (globe.gl fallback).
 * Desktop Cesium stays on its own module.
 */
(function (global) {
  'use strict';

  let React = global.React;
  function bindReact() {
    const R = global.React;
    if (R && R.createElement && R.useRef) {
      React = R;
      return true;
    }
    return false;
  }
  bindReact();

  // WebKit/Safari returns null from several WebGL queries; Three.js assumes strings/arrays.
  const WEBGL_PRECISION_FALLBACK = { rangeMin: 127, rangeMax: 127, precision: 23 };
  const WEBGL_CONTEXT_DEFAULTS = {
    alpha: true,
    antialias: false,
    depth: true,
    failIfMajorPerformanceCaveat: false,
    powerPreference: 'default',
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    stencil: false,
  };

  function isWebKitBrowser() {
    const ua = String(global.navigator?.userAgent || '');
    return /AppleWebKit/i.test(ua) && !/Chrome|Chromium|Edg\//i.test(ua);
  }

  function patchWebGLForThree() {
    [global.WebGLRenderingContext, global.WebGL2RenderingContext].filter(Boolean).forEach((Ctx) => {
      const proto = Ctx && Ctx.prototype;
      if (!proto) return;

      const origPrecision = proto.getShaderPrecisionFormat;
      if (origPrecision && !origPrecision.__godModePatched) {
        proto.getShaderPrecisionFormat = function godModeGetShaderPrecisionFormat(shaderType, precisionType) {
          return origPrecision.call(this, shaderType, precisionType) || WEBGL_PRECISION_FALLBACK;
        };
        proto.getShaderPrecisionFormat.__godModePatched = true;
      }

      const origParam = proto.getParameter;
      if (origParam && !origParam.__godModeParamPatched) {
        proto.getParameter = function godModeGetParameter(pname) {
          const val = origParam.call(this, pname);
          if (val != null) return val;
          if (pname === this.VERSION) return 'WebGL 1.0';
          if (pname === this.SHADING_LANGUAGE_VERSION) return 'WebGL GLSL ES 1.0';
          if (pname === this.RENDERER) return 'WebKit WebGL';
          if (pname === this.VENDOR) return 'WebKit';
          if (pname === this.MAX_COMBINED_TEXTURE_IMAGE_UNITS) return 8;
          if (pname === this.MAX_TEXTURE_IMAGE_UNITS) return 8;
          if (pname === this.MAX_TEXTURE_SIZE) return 4096;
          if (pname === this.MAX_CUBE_MAP_TEXTURE_SIZE) return 4096;
          if (pname === this.MAX_VERTEX_ATTRIBS) return 16;
          return val;
        };
        proto.getParameter.__godModeParamPatched = true;
      }

      const origExt = proto.getSupportedExtensions;
      if (origExt && !origExt.__godModeExtPatched) {
        proto.getSupportedExtensions = function godModeGetSupportedExtensions() {
          return origExt.call(this) || [];
        };
        proto.getSupportedExtensions.__godModeExtPatched = true;
      }

      const origAttrs = proto.getContextAttributes;
      if (origAttrs && !origAttrs.__godModeAttrPatched) {
        proto.getContextAttributes = function godModeGetContextAttributes() {
          return origAttrs.call(this) || WEBGL_CONTEXT_DEFAULTS;
        };
        proto.getContextAttributes.__godModeAttrPatched = true;
      }
    });

    const canvasProto = global.HTMLCanvasElement && global.HTMLCanvasElement.prototype;
    const origGetContext = canvasProto && canvasProto.getContext;
    if (origGetContext && !origGetContext.__godModeCtxPatched && isWebKitBrowser()) {
      canvasProto.getContext = function godModeGetContext(type, attrs) {
        if (type === 'webgl2') {
          // Modern Safari has real WebGL2 — use it. Forcing WebGL1 here (the old
          // workaround) made three.js call WebGL2-only APIs like texImage3D on a
          // WebGL1 context, which crashed the globe. Only downgrade when WebGL2
          // is genuinely unavailable.
          const gl2 = origGetContext.call(this, 'webgl2', attrs);
          if (gl2) return gl2;
          return origGetContext.call(this, 'webgl', attrs)
            || origGetContext.call(this, 'experimental-webgl', attrs);
        }
        return origGetContext.call(this, type, attrs);
      };
      canvasProto.getContext.__godModeCtxPatched = true;
    }
  }
  patchWebGLForThree();

  function probeWebGLSupport() {
    try {
      const canvas = document.createElement('canvas');
      const attrs = { antialias: false, failIfMajorPerformanceCaveat: false, powerPreference: 'default' };
      const gl = canvas.getContext('webgl2', attrs)
        || canvas.getContext('webgl', attrs)
        || canvas.getContext('experimental-webgl', attrs);
      if (!gl) return { ok: false, reason: 'WebGL is off or unavailable in this browser.' };
      const fmt = gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.HIGH_FLOAT);
      if (!fmt || !Number.isFinite(fmt.precision)) {
        return { ok: false, reason: 'This browser WebGL shader precision is unsupported.' };
      }
      return { ok: true, canvas, gl, attrs };
    } catch (e) {
      return { ok: false, reason: e?.message || 'WebGL probe failed' };
    }
  }
  function globeScriptCandidates() {
    const from = function (rel) { return function () { return new URL(rel, global.location.href).href; }; };
    const localMin = from('flow-v4/vendor/globe.gl.min.js');
    const localSafari = from('flow-v4/vendor/globe.gl.safari.min.js');
    const gmMin = from('god-mode/globe.gl.min.js');
    const gmSafari = from('god-mode/globe.gl.safari.min.js');
    const cdn = 'https://cdn.jsdelivr.net/npm/globe.gl@2.35.0/dist/globe.gl.min.js';
    if (isWebKitBrowser()) return [localMin, localSafari, gmMin, gmSafari, cdn];
    return [localMin, gmMin, cdn];
  }

  let globeLibPromise = null;
  const EARTH_IMG = 'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg';
  const GLOBE_SCRIPT_CANDIDATES = globeScriptCandidates();
  const SKY_IMG = 'https://unpkg.com/three-globe/example/img/night-sky.png';
  const SAT_LIB_URL = 'https://unpkg.com/satellite.js@5.0.0/dist/satellite.min.js';
  const FETCH_TIMEOUT_MS = 18000;
  const WEATHER_PROXY_TIMEOUT_MS = 8000;
  const LAUNCH_CACHE_KEY = 'v4-godmode-launch-cache-v1';
  const EONET_CACHE_KEY = 'v4-godmode-eonet-cache-v1';
  const STARLINK_TLE_CACHE_KEY = 'v4-godmode-starlink-tle-v1';
  const SHIP_META_CACHE_KEY = 'v4-godmode-ais-meta-v1';
  const LAUNCH_CACHE_TTL_MS = 25 * 60 * 1000;
  const EONET_CACHE_TTL_MS = 10 * 60 * 1000;
  const STARLINK_TLE_TTL_MS = 6 * 60 * 60 * 1000;
  const SHIP_META_TTL_MS = 12 * 60 * 1000;
  const KM_PER_GLOBE_RADIUS = 6371;
  const STARLINK_POINT_SIZE = 0.014;
  const MAX_FLIGHT_POINTS = 80;
  const MAX_FLIGHTS = 80;
  const MAX_STARLINK = 180;
  const STARLINK_MAX_POINTS_ALL = 180;
  const STARLINK_MAX_POINTS_FOCUS = 180;
  const MAX_SHIP_POINTS = 120;
  const MAX_SHIPS = 480;
  const MAX_WEATHER = 24;
  const MAX_EVENTS = 20;
  const MAX_LAUNCHES = 12;
  const STARLINK_TLE_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle';
  const USGS_QUAKES_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson';
  const FLIGHT_HUBS = [[40.71,-74.01],[34.05,-118.24],[51.51,-0.13],[35.68,139.69],[-33.87,151.21],[25.20,55.27]];
  const WEATHER_CITIES = [
    ['New York', 40.71, -74.01],
    ['Los Angeles', 34.05, -118.24],
    ['Chicago', 41.88, -87.63],
    ['London', 51.51, -0.13],
    ['Paris', 48.86, 2.35],
    ['Berlin', 52.52, 13.41],
    ['Moscow', 55.76, 37.62],
    ['Dubai', 25.2, 55.27],
    ['Mumbai', 19.08, 72.88],
    ['Singapore', 1.35, 103.82],
    ['Tokyo', 35.68, 139.69],
    ['Seoul', 37.57, 126.98],
    ['Sydney', -33.87, 151.21],
    ['Sao Paulo', -23.55, -46.63],
    ['Mexico City', 19.43, -99.13],
    ['Toronto', 43.65, -79.38],
    ['Cairo', 30.04, 31.24],
    ['Lagos', 6.52, 3.38],
    ['Johannesburg', -26.2, 28.04],
    ['Nairobi', -1.29, 36.82],
    ['Beijing', 39.9, 116.41],
    ['Shanghai', 31.23, 121.47],
    ['Hong Kong', 22.32, 114.17],
    ['Bangkok', 13.76, 100.5],
    ['Stockholm', 59.33, 18.07],
  ];
  const LAYERS = [
    { id: 'all', label: 'All' },
    { id: 'weather', label: 'Wx' },
    { id: 'flights', label: 'Flights' },
    { id: 'satellites', label: 'Sats' },
    { id: 'ships', label: 'Ships' },
    { id: 'events', label: 'Events' },
  ];
  const EXTRA_LAYER_CHIPS = [
    { id: 'deals', label: 'Deals' },
    { id: 'launches', label: 'Launches' },
    { id: 'gpsjam', label: 'GPS jam' },
  ];
  const SETTINGS_LAYERS = [
    { id: 'all', label: 'All' },
    { id: 'deals', label: 'Deals' },
    { id: 'weather', label: 'Weather' },
    { id: 'events', label: 'Events' },
    { id: 'flights', label: 'Flights' },
    { id: 'satellites', label: 'Satellites' },
    { id: 'launches', label: 'Launches' },
    { id: 'ships', label: 'Ships' },
    { id: 'gpsjam', label: 'GPS jam' },
  ];
  const LAYER_TYPES = {
    all: null,
    weather: ['weather', 'storm'],
    flights: ['flight'],
    satellites: ['satellite', 'starlink'],
    ships: ['ship'],
    events: ['event', 'launch'],
    launches: ['launch'],
    deals: ['deal'],
    gpsjam: ['gpsjam'],
  };
  const DEAL_STAGE_COLORS = {
    'first-touch': '#8e9dff', engaged: '#5ac8fa', 'rates-sent': '#ffd60a',
    negotiating: '#ff9f0a', 'invoice-sent': '#ff5e6c', done: '#34c759', 'paid-out': '#f5c518',
  };
  const DEAL_ACTIVE_STAGES = Object.keys(DEAL_STAGE_COLORS);
  const DEAL_GEO_CACHE_KEY = 'v4-godmode-dealgeo-v1';
  const H3_JS_URLS = [
    'https://cdn.jsdelivr.net/npm/h3-js@4.2.1/dist/h3-js.umd.js',
    'https://unpkg.com/h3-js@3.7.2/dist/h3-js.js',
  ];

  const GPSJAM_PHONE_CAP = 80;
  let h3LibPromise = null;

  let satLibPromise = null;
  let starlinkSatrecs = null;
  function loadExternalScript(src, key) {

    const id = 'godmode-script-' + key;

    const existing = document.getElementById(id);

    if (existing) {

      return existing.dataset.loaded === '1'

        ? Promise.resolve()

        : new Promise((resolve, reject) => {

            existing.addEventListener('load', () => resolve());

            existing.addEventListener('error', () => reject(new Error('Script failed: ' + src)));

          });

    }

    return new Promise((resolve, reject) => {

      const s = document.createElement('script');

      s.id = id;

      s.src = src;

      s.async = true;

      s.crossOrigin = 'anonymous';

      s.onload = () => {

        s.dataset.loaded = '1';

        resolve();

      };

      s.onerror = () => reject(new Error('Script failed: ' + src));

      document.head.appendChild(s);

    });

  }

  function h3CellToLatLngFn(mod) {
    if (!mod || (typeof mod !== "object" && typeof mod !== "function")) return null;
    try { if (typeof mod.cellToLatLng === "function") return function (cell) { return mod.cellToLatLng(cell); }; } catch (e) {}
    try { if (typeof mod.h3ToGeo === "function") return function (cell) { return mod.h3ToGeo(cell); }; } catch (e) {}
    try { if (typeof mod.cellToLatLngs === "function") return function (cell) { return mod.cellToLatLngs(cell); }; } catch (e) {}
    try { if (mod.default && mod.default !== mod) return h3CellToLatLngFn(mod.default); } catch (e) {}
    return null;
  }
  function resolveH3Module() {
    const bag = [global.h3, global.h3js, global.H3];
    for (let i = 0; i < bag.length; i++) {
      if (h3CellToLatLngFn(bag[i])) return bag[i];
    }
    return null;
  }
  function loadH3Lib() {
    const have = resolveH3Module();
    if (have) return Promise.resolve(have);
    if (h3LibPromise) return h3LibPromise;
    h3LibPromise = (async function () {
      for (let i = 0; i < H3_JS_URLS.length; i++) {
        try {
          await loadExternalScript(H3_JS_URLS[i], "h3-js-" + i);
          const h3 = resolveH3Module();
          if (h3 && h3CellToLatLngFn(h3)) return h3;
        } catch (e) {}
      }
      return null;
    })();
    return h3LibPromise;
  }
  function jamBand(pct) {
    const p = Number(pct);
    if (!Number.isFinite(p) || p < 2) return 'low';
    if (p <= 10) return 'med';
    return 'high';
  }
  function jamColor(pct) {
    const b = jamBand(pct);
    if (b === 'high') return '#ff453a';
    if (b === 'med') return '#ffd60a';
    return '#34c759';
  }


  function resolveGlobeFactory() {

    const g = global.Globe || global.window?.Globe;

    if (typeof g === 'function') return g;

    if (g && typeof g.default === 'function') return g.default;

    return null;

  }

  function waitForGlobeContainer(el, timeoutMs) {

    const limit = Number(timeoutMs) || 4000;

    const start = Date.now();

    return new Promise((resolve, reject) => {

      const tick = () => {

        if (!el || !el.isConnected) {

          if (Date.now() - start > limit) reject(new Error('Globe mount element detached'));

          else global.requestAnimationFrame(tick);

          return;

        }

        const w = Math.max(el.clientWidth || 0, el.offsetWidth || 0);

        const h = Math.max(el.clientHeight || 0, el.offsetHeight || 0);

        if (w >= 120 && h >= 120) return resolve({ w, h });

        if (Date.now() - start > limit) reject(new Error('Globe container has no size yet'));

        else global.requestAnimationFrame(tick);

      };

      tick();

    });

  }

  async function ensureGlobeLibrary() {

    patchWebGLForThree();

    const ready = resolveGlobeFactory();

    if (ready) return ready;

    if (!globeLibPromise) {

      globeLibPromise = (async () => {

        patchWebGLForThree();

        const errors = [];

        for (let i = 0; i < GLOBE_SCRIPT_CANDIDATES.length; i++) {

          const candidate = GLOBE_SCRIPT_CANDIDATES[i];

          const src = typeof candidate === 'function' ? candidate() : candidate;

          try {

            await loadExternalScript(src, 'globe-' + i);

            const factory = resolveGlobeFactory();

            if (factory) return factory;

            errors.push(src + ' loaded but window.Globe missing');

          } catch (e) {

            errors.push(String(e?.message || e));

          }

        }

        throw new Error(errors.join(' · ') || 'globe.gl unavailable');

      })();

    }

    return globeLibPromise;

  }

  function initGlobeInstance(GlobeFactory, el) {

    if (el) el.innerHTML = '';

    const rendererConfig = {

      antialias: false,

      alpha: true,

      powerPreference: 'default',

      failIfMajorPerformanceCaveat: false,

    };

    const attempts = [

      { label: 'curried-default', run: () => GlobeFactory()(el) },

      { label: 'ctor-default', run: () => new GlobeFactory(el) },

      {

        label: 'ctor-safe-renderer',

        run: () => new GlobeFactory(el, { rendererConfig, animateIn: false, waitForGlobeReady: true }),

      },

      {

        label: 'curried-safe-renderer',

        run: () => GlobeFactory({ rendererConfig, animateIn: false, waitForGlobeReady: true })(el),

      },

    ];

    let lastErr = null;

    for (let i = 0; i < attempts.length; i++) {

      try {

        if (el) el.innerHTML = '';

        const inst = attempts[i].run();

        if (inst) return inst;

      } catch (e) {

        lastErr = e;

        console.warn('[god-mode] globe init ' + attempts[i].label + ' failed', e);

      }

    }

    const msg = lastErr?.message || 'globe.gl init failed';

    throw new Error(msg);

  }

  function losePhoneGlobeCanvases(root) {
    try {
      const host = root || document.querySelector('.v4-gm-phone-globe');
      if (!host) return;
      const canvases = host.querySelectorAll('canvas');
      for (let i = 0; i < canvases.length; i++) {
        const c = canvases[i];
        try {
          const gl = c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl');
          const ext = gl && gl.getExtension('WEBGL_lose_context');
          if (ext) ext.loseContext();
        } catch (eGl) {}
        try { if (c.parentNode) c.parentNode.removeChild(c); } catch (eRm) {}
      }
      try { host.innerHTML = ''; } catch (eH) {}
    } catch (e) {}
  }
  function disposeGlobeInstance(globe) {
    if (globe && globe.__cesium) {
      try {
        const v = globe._viewer;
        if (v && !(v.isDestroyed && v.isDestroyed())) v.destroy();
      } catch (eC) {}
      try { globe._viewer = null; } catch (eV) {}
    }
    if (globe) {
      try { globe.pauseAnimation?.(); } catch (e) {}
      try {
        const renderer = globe.renderer?.();
        if (renderer) {
          renderer.dispose?.();
          renderer.forceContextLoss?.();
        }
      } catch (eR) {}
      try { globe._destructor?.(); } catch (eD) {}
    }
    losePhoneGlobeCanvases(document.querySelector('.v4-gm-phone-globe'));
  }


  const SAT_TILE_MAX_LEVEL = 19;
  const EARTH_RADIUS_M = 6371000;
  const MIN_CAMERA_ALT_M = 80;
  const STREET_CAMERA_ALT_M = 160;
  const SEARCH_CAMERA_ALT_M = 12000;
  const SEARCH_ADDRESS_ALT_M = 900;
  const MIN_ALT_RADII = MIN_CAMERA_ALT_M / EARTH_RADIUS_M;
  const STREET_ALT_RADII = STREET_CAMERA_ALT_M / EARTH_RADIUS_M;
  const SEARCH_ALT_RADII = SEARCH_CAMERA_ALT_M / EARTH_RADIUS_M;
  const CESIUM_VERSION = '1.125';
  const CESIUM_BASE = 'https://cesium.com/downloads/cesiumjs/releases/' + CESIUM_VERSION + '/Build/Cesium/';
  const CESIUM_JS = CESIUM_BASE + 'Cesium.js';
  const DEFAULT_GOOGLE_TILES_KEY = 'AIzaSyAdikDP3IFcWhm-p-FVq49GHUoLqg18s64';
  const OPENSKY_STATES_URL = 'https://opensky-network.org/api/states/all';
  const RAINVIEWER_META_URL = 'https://api.rainviewer.com/public/weather-maps.json';
  function satTileUrl(x, y, l) {
    const z = Math.max(0, Math.min(SAT_TILE_MAX_LEVEL, Number(l) || 0));
    return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/' + z + '/' + y + '/' + x;
  }
  function corsProxyUrls(url) {
    return [
      'https://corsproxy.io/?' + encodeURIComponent(url),
      'https://api.allorigins.win/raw?url=' + encodeURIComponent(url),
    ];
  }
  async function fetchCorsFirst(url, options, ms) {
    const timeout = Number(ms) || FETCH_TIMEOUT_MS;
    try {
      const res = await fetchWithTimeout(url, options, timeout);
      if (res && res.ok) return res;
    } catch (e) {}
    const proxies = corsProxyUrls(url);
    for (let i = 0; i < proxies.length; i++) {
      try {
        const res = await fetchWithTimeout(proxies[i], options || {}, timeout);
        if (res && res.ok) return res;
      } catch (e) {}
    }
    throw new Error('cors fetch failed');
  }
  function globeRadiusOf(g) {
    try {
      if (g && typeof g.getGlobeRadius === 'function') {
        const r = Number(g.getGlobeRadius());
        if (Number.isFinite(r) && r > 10) return r;
      }
    } catch (e) {}
    return 100;
  }
  function applySatelliteTiles(g) {
    try { g.showAtmosphere(false); } catch (e) {}
    try { g.atmosphereAltitude(0); } catch (e) {}
    const hasTiles = !!(g && typeof g.globeTileEngineUrl === 'function');
    if (hasTiles) {
      // Slippy tiles replace the baked marble mesh. Do NOT set globeImageUrl
      // afterward — that paints earth-blue-marble.jpg and zoom looks like a blob.
      try { g.globeImageUrl(null); } catch (e) {}
      try { g.globeTileEngineUrl(satTileUrl); } catch (e) {}
      try { g.globeTileEngineMaxLevel(SAT_TILE_MAX_LEVEL); } catch (e2) {}
      try {
        const cam = g.camera && g.camera();
        if (cam && typeof g.updatePov === 'function') g.updatePov(cam);
      } catch (e3) {}
    } else {
      try { g.globeImageUrl(EARTH_IMG); } catch (e) {}
    }
  }

  let cesiumLibPromise = null;
  function loadCss(href, id) {
    return new Promise(function (resolve) {
      if (id && document.getElementById(id)) return resolve();
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = href;
      if (id) l.id = id;
      l.onload = function () { resolve(); };
      l.onerror = function () { resolve(); };
      document.head.appendChild(l);
    });
  }
  function readGoogleTilesKey() {
    try {
      const w = global.UNALIGNED_GOOGLE_MAPS_TILES_KEY;
      if (w && String(w).trim()) return String(w).trim();
    } catch (e) {}
    try {
      const ls = global.localStorage && global.localStorage.getItem('UNALIGNED_GOOGLE_MAPS_TILES_KEY');
      if (ls && String(ls).trim()) return String(ls).trim();
    } catch (e) {}
    return DEFAULT_GOOGLE_TILES_KEY;
  }
  async function ensureCesiumPhone() {
    if (global.Cesium && global.Cesium.Viewer) return global.Cesium;
    if (!cesiumLibPromise) {
      cesiumLibPromise = (async function () {
        await loadCss(CESIUM_BASE + 'Widgets/widgets.css', 'cesium-widgets-css');
        if (!global.CESIUM_BASE_URL) global.CESIUM_BASE_URL = CESIUM_BASE;
        await loadExternalScript(CESIUM_JS, 'cesium-' + CESIUM_VERSION);
        if (!global.Cesium || !global.Cesium.Viewer) throw new Error('Cesium Viewer missing');
        return global.Cesium;
      })();
    }
    return cesiumLibPromise;
  }

  var IDLE_SPIN_ORBIT_M = 2.0e6;
  var IDLE_SPIN_STREET_M = 2500;
  var IDLE_SPIN_RESUME_MS = 4000;
  var IDLE_SPIN_RAD_PER_S = 0.058;

  function pauseIdleSpinState(state) {
    try { if (state && typeof state.pauseIdleSpin === 'function') state.pauseIdleSpin(); } catch (e) {}
  }

  function installIdleOrbitSpin(Cesium, viewer, state) {
    if (!Cesium || !viewer || !state) return;
    try { if (viewer.clock) viewer.clock.shouldAnimate = true; } catch (e) {}
    try { if (viewer.scene && viewer.scene.requestRenderMode) viewer.scene.requestRender(); } catch (e) {}
    state._idleSpinHeld = 0;
    state._idleSpinPaused = false;
    state._idleSpinLastTs = 0;
    var resumeTimer = 0;
    var canvas = null;
    try { canvas = viewer.scene && viewer.scene.canvas; } catch (eC) {}
    var clearResume = function () {
      if (resumeTimer) {
        try { global.clearTimeout(resumeTimer); } catch (e) {}
        resumeTimer = 0;
      }
    };
    var scheduleResume = function () {
      clearResume();
      resumeTimer = global.setTimeout(function () {
        resumeTimer = 0;
        state._idleSpinPaused = false;
        state._idleSpinLastTs = 0;
      }, IDLE_SPIN_RESUME_MS);
    };
    var pause = function () {
      state._idleSpinPaused = true;
      state._idleSpinLastTs = 0;
      if (state._idleSpinHeld > 0) {
        clearResume();
        return;
      }
      scheduleResume();
    };
    state.pauseIdleSpin = pause;
    var onDown = function () {
      state._idleSpinHeld = (state._idleSpinHeld || 0) + 1;
      pause();
    };
    var onUp = function () {
      state._idleSpinHeld = Math.max(0, (state._idleSpinHeld || 0) - 1);
      pause();
    };
    var onWheel = function () { pause(); };
    var listeners = [];
    var add = function (target, type, fn, opts) {
      if (!target || !target.addEventListener) return;
      try {
        target.addEventListener(type, fn, opts);
        listeners.push([target, type, fn, opts]);
      } catch (e) {}
    };
    if (canvas) {
      add(canvas, 'pointerdown', onDown, true);
      add(canvas, 'pointerup', onUp, true);
      add(canvas, 'pointercancel', onUp, true);
      add(canvas, 'wheel', onWheel, { capture: true, passive: true });
      add(canvas, 'gesturestart', onWheel, true);
    }
    var onTick = function () {
      if (state.destroyed) return;
      try { if (viewer.isDestroyed && viewer.isDestroyed()) return; } catch (eD) { return; }
      if (state._streetMode || state._streetFlying) {
        state._idleSpinLastTs = 0;
        return;
      }
      if (state.follow || viewer.trackedEntity) {
        state._idleSpinLastTs = 0;
        return;
      }
      var h = 0;
      try {
        h = viewer.camera.positionCartographic && viewer.camera.positionCartographic.height;
      } catch (eH) { h = 0; }
      if (!(h > IDLE_SPIN_ORBIT_M) || h < IDLE_SPIN_STREET_M) {
        state._idleSpinLastTs = 0;
        return;
      }
      if (state._idleSpinPaused || (state._idleSpinHeld || 0) > 0) {
        state._idleSpinLastTs = 0;
        return;
      }
      var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      var last = state._idleSpinLastTs;
      if (last && now === last) return;
      if (!last) last = now;
      var dt = (now - last) / 1000;
      state._idleSpinLastTs = now;
      if (!(dt > 0) || dt > 0.25) dt = 1 / 60;
      try {
        viewer.camera.rotate(Cesium.Cartesian3.UNIT_Z, -dt * IDLE_SPIN_RAD_PER_S);
      } catch (eR) { return; }
      try { if (viewer.scene && viewer.scene.requestRender) viewer.scene.requestRender(); } catch (eRend) {}
    };
    var spinInterval = 0;
    try { spinInterval = global.setInterval(onTick, 150); } catch (eI) { spinInterval = 0; }
    state._idleSpinTick = onTick;
    state._idleSpinInterval = spinInterval;
    state.stopIdleOrbitSpin = function () {
      clearResume();
      if (spinInterval) {
        try { global.clearInterval(spinInterval); } catch (e) {}
        spinInterval = 0;
      }
      try { state._idleSpinInterval = null; } catch (e) {}
      listeners.forEach(function (row) {
        try { row[0].removeEventListener(row[1], row[2], row[3]); } catch (e2) {}
      });
      listeners.length = 0;
      state.pauseIdleSpin = null;
      state._idleSpinTick = null;
      state.stopIdleOrbitSpin = null;
    };
  }

  function isSafariWebKit() {
    try {
      var ua = String((global.navigator && global.navigator.userAgent) || '');
      return /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR/i.test(ua);
    } catch (e) {
      return false;
    }
  }

  function killPhoneAtmosphere(viewer) {
    try {
      const scene = viewer && viewer.scene;
      if (!scene) return;
      try { if (scene.skyAtmosphere) scene.skyAtmosphere.show = false; } catch (e) {}
      if (isSafariWebKit()) {
        try {
          if (scene.globe) {
            scene.globe.showGroundAtmosphere = false;
            scene.globe.atmosphereLightIntensity = 0;
          }
        } catch (e) {}
      }
      try { if (scene.fog) { scene.fog.enabled = false; scene.fog.density = 0; } } catch (e) {}
    } catch (e) {}
  }

  function configurePhoneAtmosphere(Cesium, viewer) {
    try {
      const scene = viewer && viewer.scene;
      if (!scene || !scene.globe) return;
      const globe = scene.globe;
      const safari = isSafariWebKit();
      try { if (scene.skyAtmosphere) scene.skyAtmosphere.show = false; } catch (e) {}
      globe.enableLighting = true;
      try { globe.dynamicAtmosphereLighting = true; } catch (e) {}
      try { globe.dynamicAtmosphereLightingFromSun = true; } catch (e) {}
      if (safari) {
        try { globe.showGroundAtmosphere = false; } catch (e) {}
        try { globe.atmosphereLightIntensity = 0; } catch (e) {}
        try { globe.lambertDiffuseMultiplier = 2.0; } catch (e) {}
      } else {
        try { globe.showGroundAtmosphere = true; } catch (e) {}
        try { globe.atmosphereLightIntensity = 10; } catch (e) {}
        try { globe.lambertDiffuseMultiplier = 1.75; } catch (e) {}
      }
      try { globe.lightingFadeOutDistance = 6.0e7; } catch (e) {}
      try { globe.lightingFadeInDistance = 9.0e7; } catch (e) {}
      try { globe.nightFadeOutDistance = 8.0e6; } catch (e) {}
      try { globe.nightFadeInDistance = 5.5e7; } catch (e) {}
      try { globe.vertexShadowDarkness = 0.08; } catch (e) {}
      try {
        if (Cesium && Cesium.SunLight) scene.light = new Cesium.SunLight({ intensity: 1.75 });
      } catch (e) {}
      try { if (scene.sun) scene.sun.show = true; } catch (e) {}
    } catch (e) {}
  }
  const PHOTOREAL_PREFETCH_M = 80000;
  const PHOTOREAL_SHOW_M = 1200;
  const PHOTOREAL_HIDE_M = 2200;
  const GOOGLE_TILES_SSE = 2;
  function googleTilesetUrlOf(tileset) {
    try {
      const r = tileset && (tileset.resource || tileset._resource);
      if (r) {
        if (typeof r.getUrlComponent === 'function') {
          const u = r.getUrlComponent(true);
          if (u) return String(u);
        }
        if (r.url) return String(r.url);
        if (r._url) return String(r._url);
      }
      if (tileset && tileset.url) return String(tileset.url);
      if (tileset && tileset._url) return String(tileset._url);
    } catch (e) {}
    return '';
  }
  function isGooglePhotorealUrl(url) {
    return /tile\.googleapis\.com/i.test(String(url || ''));
  }
  const PHONE_PHOTOREAL_CACHE_BYTES = 64 * 1024 * 1024;
  function tunePhoneTileset(tileset, heightM) {
    if (!tileset) return;
    const street = Number.isFinite(Number(heightM)) && Number(heightM) < 2500;
    try { tileset.maximumScreenSpaceError = street ? 0.8 : (Number(GOOGLE_TILES_SSE) || 1.0); } catch (e) {}
    try { if ('skipLevelOfDetail' in tileset) tileset.skipLevelOfDetail = false; } catch (e) {}
    try { tileset.immediatelyLoadDesiredLevelOfDetail = false; } catch (e) {}
    try { tileset.dynamicScreenSpaceError = false; } catch (e) {}
    try { tileset.loadSiblings = false; } catch (e) {}
    try { tileset.preloadWhenHidden = false; } catch (e) {}
    try { tileset.cullRequestsWhileMoving = true; } catch (e) {}
    try { tileset.enableCollision = false; } catch (e) {}
    try { tileset.cacheBytes = PHONE_PHOTOREAL_CACHE_BYTES; } catch (e) {}
    try { tileset.maximumCacheOverflowBytes = PHONE_PHOTOREAL_CACHE_BYTES; } catch (e) {}
  }
  function destroyPhonePhotoreal(Cesium, viewer, state) {
    if (state) state._photorealGen = (state._photorealGen || 0) + 1;
    try {
      const tileset = state && state.googleTileset;
      if (tileset && !(tileset.isDestroyed && tileset.isDestroyed())) {
        try { tileset.show = false; } catch (e) {}
        try {
          if (viewer && viewer.scene && viewer.scene.primitives) viewer.scene.primitives.remove(tileset);
        } catch (eR) {}
        try { if (typeof tileset.destroy === 'function') tileset.destroy(); } catch (eD) {}
      }
    } catch (e) {}
    if (state) {
      state.googleTileset = null;
      state._photorealShown = false;
      state._googleTilesPending = null;
    }
    try { if (viewer && viewer.scene && viewer.scene.globe) viewer.scene.globe.show = true; } catch (eG) {}
    try { if (viewer && viewer.scene && viewer.scene.fog) { viewer.scene.fog.enabled = false; viewer.scene.fog.density = 0; } } catch (eF) {}
    try { if (viewer && viewer.scene && viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false; } catch (eA) {}
  }
  function applyPhoneStreetClarity(viewer) {
    try {
      const scene = viewer && viewer.scene;
      if (!scene) return;
      try { if (scene.fog) { scene.fog.enabled = false; scene.fog.density = 0; } } catch (e) {}
      try { if (scene.skyAtmosphere) scene.skyAtmosphere.show = false; } catch (e) {}
      try {
        if (scene.globe) {
          scene.globe.show = false;
          scene.globe.showGroundAtmosphere = false;
          scene.globe.atmosphereLightIntensity = 0;
          scene.globe.depthTestAgainstTerrain = false;
          scene.globe.maximumScreenSpaceError = 1.0;
        }
      } catch (e) {}
      try {
        const stages = scene.postProcessStages;
        if (stages && stages.bloom) stages.bloom.enabled = false;
        if (stages && stages.fxaa) stages.fxaa.enabled = true;
      } catch (e) {}
    } catch (e) {}
  }
  async function enablePhonePhotoreal(Cesium, viewer, state, opts) {
    opts = opts || {};
    const h = (function () {
      try { return viewer && viewer.camera && viewer.camera.positionCartographic && viewer.camera.positionCartographic.height; }
      catch (e) { return NaN; }
    })();
    const shown = !!(state && state._photorealShown);
    const wantShow = (opts.show !== undefined) ? !!opts.show : (Number.isFinite(h) && h < (shown ? PHOTOREAL_HIDE_M : PHOTOREAL_SHOW_M));
    const wantPrefetch = wantShow || (Number.isFinite(h) && h < PHOTOREAL_PREFETCH_M) || !!opts.force;
    const key = readGoogleTilesKey();
    if (!key || !Cesium || !viewer) return false;
    try {
      const globe = viewer.scene && viewer.scene.globe;
      if (globe && Number.isFinite(h) && h < 2500) globe.maximumScreenSpaceError = 1.0;
    } catch (eStreet) {}
    if ((Number.isFinite(h) && h > PHOTOREAL_HIDE_M && opts.show !== true) || !wantPrefetch) {
      destroyPhonePhotoreal(Cesium, viewer, state);
      return false;
    }
    if (wantShow) applyPhoneStreetClarity(viewer);
    try {
      if (state && state.googleTileset && !(state.googleTileset.isDestroyed && state.googleTileset.isDestroyed())) {
        if (!isGooglePhotorealUrl(googleTilesetUrlOf(state.googleTileset))) {
          try { viewer.scene.primitives.remove(state.googleTileset); } catch (eR) {}
          try { state.googleTileset.destroy(); } catch (eD) {}
          state.googleTileset = null;
        } else {
          tunePhoneTileset(state.googleTileset, h);
          try { state.googleTileset.show = !!wantShow; } catch (eT) {}
          if (state) state._photorealShown = !!wantShow;
          try { if (viewer.scene && viewer.scene.globe) viewer.scene.globe.show = !wantShow; } catch (eG) {}
          return true;
        }
      }
    } catch (e) {}
    if (state && state._googleTilesPending) {
      try { await state._googleTilesPending; } catch (eP) {}
      if (state.googleTileset && !(state.googleTileset.isDestroyed && state.googleTileset.isDestroyed())) {
        tunePhoneTileset(state.googleTileset, h);
        try { state.googleTileset.show = !!wantShow; } catch (eT) {}
        state._photorealShown = !!wantShow;
        return true;
      }
    }
    const pendingGen = (state && state._photorealGen) || 0;
    const pending = (async function () {
      try { if (Cesium.GoogleMaps) Cesium.GoogleMaps.defaultApiKey = key; } catch (e) {}
      let tileset = null;
      const tileOpts = {
        maximumScreenSpaceError: GOOGLE_TILES_SSE,
        skipLevelOfDetail: false,
        immediatelyLoadDesiredLevelOfDetail: false,
        dynamicScreenSpaceError: false,
        loadSiblings: false,
        preloadWhenHidden: false,
        cullRequestsWhileMoving: true,
        enableCollision: false,
        cacheBytes: PHONE_PHOTOREAL_CACHE_BYTES,
        maximumCacheOverflowBytes: PHONE_PHOTOREAL_CACHE_BYTES,
        showCreditsOnScreen: true,
      };
      const apiOpts = { key: key, onlyUsingWithGoogleGeocoder: true };
      if (typeof Cesium.createGooglePhotorealistic3DTileset === 'function') {
        try { tileset = await Cesium.createGooglePhotorealistic3DTileset(apiOpts, tileOpts); }
        catch (e1) {
          try { tileset = await Cesium.createGooglePhotorealistic3DTileset({ key: key, onlyUsingWithGoogleGeocoder: true }, tileOpts); }
          catch (e1b) { tileset = null; }
        }
      }
      if (!tileset && Cesium.Cesium3DTileset && Cesium.Cesium3DTileset.fromUrl) {
        tileset = await Cesium.Cesium3DTileset.fromUrl(
          'https://tile.googleapis.com/v1/3dtiles/root.json?key=' + encodeURIComponent(key),
          tileOpts
        );
      }
      if (!tileset) return false;
      if (state && state._photorealGen && pendingGen !== state._photorealGen) {
        try { tileset.destroy && tileset.destroy(); } catch (e) {}
        return false;
      }
      if (!isGooglePhotorealUrl(googleTilesetUrlOf(tileset))) {
        try { tileset.destroy && tileset.destroy(); } catch (e) {}
        console.warn('[god-mode-phone] photoreal tileset was not Google; keeping Esri ground');
        return false;
      }
      tunePhoneTileset(tileset, h);
      const stillShow = (opts.show !== undefined) ? !!opts.show : (function () {
        try {
          const hh = viewer.camera.positionCartographic && viewer.camera.positionCartographic.height;
          return Number.isFinite(hh) && hh < PHOTOREAL_SHOW_M;
        } catch (eH) { return !!wantShow; }
      })();
      try { if (viewer.scene && viewer.scene.globe) viewer.scene.globe.show = !stillShow; } catch (e) {}
      try { tileset.preloadWhenHidden = false; } catch (e) {}
      try { tileset.show = !!stillShow; } catch (e) {}
      if (stillShow) applyPhoneStreetClarity(viewer);
      viewer.scene.primitives.add(tileset);
      if (state) {
        state.googleTileset = tileset;
        state._photorealShown = !!stillShow;
      }
      return true;
    })();
    if (state) state._googleTilesPending = pending;
    try {
      return await pending;
    } catch (e) {
      console.warn('[god-mode-phone] photoreal tiles failed', e);
      try { if (viewer.scene && viewer.scene.globe) viewer.scene.globe.show = true; } catch (eG) {}
      return false;
    } finally {
      if (state && state._googleTilesPending === pending) state._googleTilesPending = null;
    }
  }

  var phoneCraftIconCache = Object.create(null);
  function getPhoneCraftIcon(kind) {
    var key = kind === 'ship' ? 'ship' : 'plane';
    if (phoneCraftIconCache[key]) return phoneCraftIconCache[key];
    try {
      var c = document.createElement('canvas');
      var g = c.getContext('2d');
      g.fillStyle = '#ffffff';
      if (kind === 'ship') {
        c.width = 40; c.height = 56;
        g.beginPath(); g.moveTo(20, 3); g.lineTo(33, 48); g.lineTo(20, 40); g.lineTo(7, 48); g.closePath(); g.fill();
      } else {
        c.width = 56; c.height = 56;
        g.beginPath();
        g.moveTo(28, 4); g.lineTo(31, 24); g.lineTo(50, 30); g.lineTo(31, 29);
        g.lineTo(31, 42); g.lineTo(38, 50); g.lineTo(28, 44); g.lineTo(18, 50);
        g.lineTo(25, 42); g.lineTo(25, 29); g.lineTo(6, 30); g.lineTo(25, 24);
        g.closePath(); g.fill();
      }
      phoneCraftIconCache[key] = c.toDataURL();
    } catch (e) { phoneCraftIconCache[key] = ''; }
    return phoneCraftIconCache[key];
  }

  function phoneCameraHeightM(viewer) {
    try {
      const h = Number(viewer && viewer.camera && viewer.camera.positionCartographic && viewer.camera.positionCartographic.height);
      return Number.isFinite(h) ? h : NaN;
    } catch (e) { return NaN; }
  }

  function phoneCameraOccluder(Cesium, viewer, state) {
    try {
      const cam = viewer.camera.positionWC;
      if (state._occluder && state._occCam && Cesium.Cartesian3.equalsEpsilon(cam, state._occCam, 1.0, 1.0)) {
        return state._occluder;
      }
      state._occCam = Cesium.Cartesian3.clone(cam);
      state._occluder = new Cesium.EllipsoidalOccluder(Cesium.Ellipsoid.WGS84, cam);
      return state._occluder;
    } catch (e) { return null; }
  }

  function phoneIsPointFacing(Cesium, viewer, state, pos) {
    if (!pos) return true;
    try {
      const h = phoneCameraHeightM(viewer);
      if (Number.isFinite(h) && h > 9e5) {
        const cam = viewer.camera.positionWC;
        if (!cam) return true;
        const nPos = Cesium.Cartesian3.normalize(pos, new Cesium.Cartesian3());
        const nCam = Cesium.Cartesian3.normalize(cam, new Cesium.Cartesian3());
        return Cesium.Cartesian3.dot(nPos, nCam) > 0.08;
      }
      const occ = phoneCameraOccluder(Cesium, viewer, state);
      if (!occ) return true;
      if (occ.isPointVisible(pos)) return true;
      const mag = Cesium.Cartesian3.magnitude(pos);
      const n = Cesium.Cartesian3.normalize(pos, new Cesium.Cartesian3());
      const raised = Cesium.Cartesian3.multiplyByScalar(n, mag + 80000, new Cesium.Cartesian3());
      return occ.isPointVisible(raised);
    } catch (e) { return true; }
  }

  function makeCesiumPhoneAdapter(Cesium, viewer, state) {
    const pointEntities = [];
    const runHorizonCull = function () {
      try {
        for (let i = 0; i < pointEntities.length; i++) {
          const ent = pointEntities[i];
          if (!ent) continue;
          try { if (ent.isDestroyed && ent.isDestroyed()) continue; } catch (eD) {}
          if (ent.__gm2Decor) continue;
          if (ent.id === 'gm2-search-pin') continue;
          let pos = null;
          try { pos = ent.position && ent.position.getValue(viewer.clock.currentTime); } catch (eP) {}
          if (!pos) { try { ent.show = true; } catch (eS) {} continue; }
          if (!(Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.z))) {
            try { ent.show = false; } catch (eS2) {}
            continue;
          }
          try { ent.show = phoneIsPointFacing(Cesium, viewer, state, pos); } catch (eF) {}
        }
      } catch (e) {}
    };
    if (state && !state.horizonCullRemove) {
      let timer = null;
      const schedule = function () {
        if (timer) return;
        timer = global.setTimeout(function () {
          timer = null;
          runHorizonCull();
        }, 250);
      };
      try { viewer.camera.moveEnd.addEventListener(runHorizonCull); } catch (e) {}
      try { viewer.camera.changed.addEventListener(schedule); } catch (e) {}
      state.runHorizonCull = runHorizonCull;
      state.horizonCullRemove = function () {
        try { viewer.camera.moveEnd.removeEventListener(runHorizonCull); } catch (e) {}
        try { viewer.camera.changed.removeEventListener(schedule); } catch (e) {}
        if (timer) { global.clearTimeout(timer); timer = null; }
        state.horizonCullRemove = null;
        state.runHorizonCull = null;
      };
      runHorizonCull();
    } else if (state) {
      state.runHorizonCull = runHorizonCull;
    }
    const fakeControls = {
      autoRotate: false,
      addEventListener: function () {},
      removeEventListener: function () {},
    };
    const adapter = {
      __cesium: true,
      _cesium: Cesium,
      _viewer: viewer,
      _state: state,
      _onPointClick: null,
      _streetPrev: null,
      renderer: function () {
        try { return { domElement: viewer.scene.canvas, setPixelRatio: function () {} }; }
        catch (e) { return { setPixelRatio: function () {} }; }
      },
      controls: function () { return fakeControls; },
      camera: function () { return null; },
      width: function () { try { viewer.resize(); } catch (e) {} return adapter; },
      height: function () { try { viewer.resize(); } catch (e) {} return adapter; },
      showAtmosphere: function () { killPhoneAtmosphere(viewer); configurePhoneAtmosphere(Cesium, viewer); return adapter; },
      atmosphereAltitude: function () { return adapter; },
      globeTileEngineUrl: function () { return adapter; },
      globeTileEngineMaxLevel: function () { return adapter; },
      globeImageUrl: function () { return adapter; },
      backgroundImageUrl: function () { return adapter; },
      pauseAnimation: function () {},
      getGlobeRadius: function () { return EARTH_RADIUS_M; },
      pauseIdleSpin: function () { try { if (state && state.pauseIdleSpin) state.pauseIdleSpin(); } catch (e) {} },
      _destructor: function () {
        try { if (state && state.stopIdleOrbitSpin) state.stopIdleOrbitSpin(); } catch (e) {}
        try { if (state && state.horizonCullRemove) state.horizonCullRemove(); } catch (e) {}
        try { if (state && state.handler && state.handler.destroy) state.handler.destroy(); } catch (e) {}
        try { destroyPhonePhotoreal(Cesium, viewer, state); } catch (e) {}
        try { if (viewer && !(viewer.isDestroyed && viewer.isDestroyed())) viewer.destroy(); } catch (e) {}
      },
      pointOfView: function (pov, ms) {
        if (!pov) {
          try {
            const c = viewer.camera.positionCartographic;
            return {
              lat: Cesium.Math.toDegrees(c.latitude),
              lng: Cesium.Math.toDegrees(c.longitude),
              altitude: Math.max(MIN_ALT_RADII, c.height / EARTH_RADIUS_M),
            };
          } catch (e) { return { lat: 28, lng: -20, altitude: 2.15 }; }
        }
        const lat = Number(pov.lat);
        const lng = Number(pov.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return adapter;
        let altM = Number(pov.altitude);
        if (Number.isFinite(altM) && altM > 0 && altM < 50) altM = altM * EARTH_RADIUS_M;
        if (!Number.isFinite(altM)) altM = SEARCH_CAMERA_ALT_M;
        altM = Math.max(MIN_CAMERA_ALT_M, Math.min(4.5e7, altM));
        const dest = Cesium.Cartesian3.fromDegrees(lng, lat, altM);
        const dur = (Number(ms) || 0) / 1000;
        try { if (dur > 0.05 && state && state.pauseIdleSpin) state.pauseIdleSpin(); } catch (eP) {}
        try {
          if (dur > 0.05) viewer.camera.flyTo({ destination: dest, duration: dur, complete: function () { try { if (state && state.pauseIdleSpin) state.pauseIdleSpin(); } catch (eC) {} } });
          else viewer.camera.setView({ destination: dest });
        } catch (e) {}
        return adapter;
      },
      pointsData: function (rows) {
        for (let i = 0; i < pointEntities.length; i++) {
          try { viewer.entities.remove(pointEntities[i]); } catch (e) {}
        }
        pointEntities.length = 0;
        const labeledPads = {};
        (rows || []).forEach(function (row) {
          const lat = Number(row.lat);
          const lng = Number(row.lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
          const kind = String(row.type || '');
          const craft = kind === 'flight' || kind === 'military' || kind === 'ship';
          let height = Number(row.altM);
          if (!Number.isFinite(height)) {
            const alt = Number(row.alt);
            if (Number.isFinite(alt) && alt > 0 && alt < 50) height = alt * EARTH_RADIUS_M;
            else if (Number.isFinite(alt) && alt >= 50) height = alt;
            else height = 0;
          }
          if (kind === 'ship') height = 0;
          if ((kind === 'flight' || kind === 'military') && (!Number.isFinite(height) || height > 20000 || height < 0)) {
            const ft = Number(row.altitudeFt);
            height = Number.isFinite(ft) ? Math.max(0, ft * 0.3048) : 10000;
          }
          if (!Number.isFinite(height) || height < 0) height = 0;
          if (height > 2.0e5) height = 2.0e5;
          let color = Cesium.Color.WHITE;
          try { color = Cesium.Color.fromCssColorString(String(row.color || '#d0d6e0')); } catch (e) {}
          let heading = Number(row.heading);
          if (!Number.isFinite(heading)) heading = Number(row.cog);
          if (!Number.isFinite(heading)) heading = 0;
          const rot = -(((heading % 360) + 360) % 360) * Math.PI / 180;
          const def = { position: Cesium.Cartesian3.fromDegrees(lng, lat, height) };
          if (craft) {
            def.point = {
              pixelSize: kind === 'ship' ? 7 : 2.6, color: color,
              outlineWidth: kind === 'ship' ? 1 : 0,
              disableDepthTestDistance: 0,
              heightReference: kind === 'ship' ? Cesium.HeightReference.CLAMP_TO_GROUND : Cesium.HeightReference.NONE,
              scaleByDistance: new Cesium.NearFarScalar(8.0e5, 0.95, 2.8e7, 1.35)
            };
            const icon = getPhoneCraftIcon(kind === 'ship' ? 'ship' : 'plane');
            if (icon) {
              def.billboard = {
                image: icon, width: kind === 'ship' ? 14 : 15, height: kind === 'ship' ? 20 : 15,
                color: color, rotation: rot, alignedAxis: Cesium.Cartesian3.UNIT_Z,
                disableDepthTestDistance: 0, sizeInMeters: false,
                scaleByDistance: new Cesium.NearFarScalar(8.0e4, 1.25, 2.8e7, 0.95),
                heightReference: kind === 'ship' ? Cesium.HeightReference.CLAMP_TO_GROUND : Cesium.HeightReference.NONE
              };
            }
          } else {
            const ground = kind === 'deal' || kind === 'launch' || kind === 'event' || kind === 'gpsjam' || kind === 'weather' || kind === 'place' || kind === 'storm';
            let px = 6;
            if (kind === 'starlink') px = 3;
            else if (kind === 'launch') px = 18;
            else if (kind === 'storm') px = 16;
            else if (kind === 'deal') px = 10;
            else if (kind === 'event') px = 10;
            else if (kind === 'gpsjam') px = 8;
            else if (kind === 'weather') px = 8;
            def.point = {
              pixelSize: px, color: color,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: ground ? 1 : 0,
              disableDepthTestDistance: 0,
              heightReference: ground ? Cesium.HeightReference.CLAMP_TO_GROUND : Cesium.HeightReference.NONE,
              scaleByDistance: new Cesium.NearFarScalar(8.0e5, 1.15, 2.2e7, ground ? 0.6 : 0.28)
            };
            if (kind === 'storm') {
              const nm = String(row.label || ('STORM · ' + (row.name || 'Storm'))).trim().slice(0, 28);
              if (nm) {
                def.label = {
                  text: nm,
                  font: 'bold 13px sans-serif',
                  fillColor: Cesium.Color.fromCssColorString('#64d2ff'),
                  outlineColor: Cesium.Color.BLACK,
                  outlineWidth: 2,
                  style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                  verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                  pixelOffset: new Cesium.Cartesian2(0, -16),
                  disableDepthTestDistance: 0,
                  scaleByDistance: new Cesium.NearFarScalar(4.0e5, 1.5, 2.2e7, 1.1)
                };
              }
            }
            if (kind === 'launch') {
              const padKey = lat.toFixed(1) + ',' + lng.toFixed(1);
              if (!labeledPads[padKey]) {
                labeledPads[padKey] = 1;
                let nm = String(row.name || row.label || '').trim();
                const pipe = nm.indexOf('|');
                if (pipe > 4) nm = nm.slice(0, pipe).trim();
                nm = nm.slice(0, 22);
                if (nm) {
                  def.label = {
                    text: nm,
                    font: 'bold 13px sans-serif',
                    fillColor: Cesium.Color.fromCssColorString('#fff6d8'),
                    outlineColor: Cesium.Color.BLACK,
                    outlineWidth: 2,
                    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                    pixelOffset: new Cesium.Cartesian2(0, -14),
                    disableDepthTestDistance: 0,
                    scaleByDistance: new Cesium.NearFarScalar(4.0e5, 1.45, 1.2e7, 1.05)
                  };
                }
              }
            }
          }
          const ent = viewer.entities.add(def);
          ent.__gmPhone = row;
          pointEntities.push(ent);
        });
        try { runHorizonCull(); } catch (eCull) {}
        return adapter;
      },
      pointLat: function () { return adapter; },
      pointLng: function () { return adapter; },
      pointAltitude: function () { return adapter; },
      pointRadius: function () { return adapter; },
      pointColor: function () { return adapter; },
      pointResolution: function () { return adapter; },
      pointsMerge: function () { return adapter; },
      pointsTransitionDuration: function () { return adapter; },
      pointLabel: function () { return adapter; },
      onPointClick: function (fn) { adapter._onPointClick = fn; return adapter; },
      showRadar: function (meta) {
        if (!meta || !viewer || !viewer.imageryLayers) return adapter;
        const host = normalizeRainViewerHost(meta.host);
        let path = String(meta.path || '').trim();
        if (!path && meta.frames && meta.frames.length) {
          const last = meta.frames[meta.frames.length - 1] || {};
          path = String(last.path || '').trim();
        }
        if (!host || !path) return adapter;
        const url = host + path + '/256/{z}/{x}/{y}/2/1_0.png';
        try {
          state.radarMeta = meta;
          if (state.radarUrl === url && state.radarLayer) {
            try { state.radarLayer.alpha = 0.62; } catch (eA) {}
            state.radarLayer.show = true;
            try { if (viewer.imageryLayers.raiseToTop) viewer.imageryLayers.raiseToTop(state.radarLayer); } catch (eT) {}
            return adapter;
          }
          const provider = new Cesium.UrlTemplateImageryProvider({ url: url, maximumLevel: 7, credit: 'RainViewer' });
          const layer = viewer.imageryLayers.addImageryProvider(provider);
          try { layer.alpha = 0.62; } catch (eA) {}
          layer.show = true;
          try { if (viewer.imageryLayers.raiseToTop) viewer.imageryLayers.raiseToTop(layer); } catch (eT) {}
          const prev = state.radarLayer;
          state.radarLayer = layer;
          state.radarUrl = url;
          if (prev) { try { viewer.imageryLayers.remove(prev, true); } catch (eR) {} }
        } catch (e) {}
        return adapter;
      },
    };
    try {
      const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      const nearestPhoneRow = function (pos) {
        if (!pos) return null;
        try {
          const picked = viewer.scene.pick(pos);
          if (Cesium.defined(picked) && picked.id && picked.id.__gmPhone) return picked.id.__gmPhone;
        } catch (eP) {}
        let best = null;
        let bestD = 120 * 120;
        const now = viewer.clock && viewer.clock.currentTime;
        for (let i = 0; i < pointEntities.length; i++) {
          const ent = pointEntities[i];
          const row = ent && ent.__gmPhone;
          if (!row) continue;
          let cart = null;
          try { cart = ent.position && ent.position.getValue(now); } catch (eC) {}
          if (!cart) continue;
          const win = Cesium.SceneTransforms.wgs84ToWindowCoordinates(viewer.scene, cart);
          if (!win) continue;
          const dx = win.x - pos.x;
          const dy = win.y - pos.y;
          const d = dx * dx + dy * dy;
          if (d < bestD) { bestD = d; best = row; }
        }
        return best;
      };
      const firePhonePick = function (row) {
        if (!row || !adapter._onPointClick) return;
        try { if (state && state.pauseIdleSpin) state.pauseIdleSpin(); } catch (e) {}
        try { adapter._onPointClick(row); } catch (e2) {}
      };
      const canvas = viewer.scene.canvas;
      const eventPos = function (e) {
        const r = canvas.getBoundingClientRect();
        return new Cesium.Cartesian2(e.clientX - r.left, e.clientY - r.top);
      };
      let tapStart = null;
      const hudSkip = '.v4-gm-phone-search, .v4-gm-phone-chip, .v4-gm-phone-dock, .v4-gm-phone-card, .v4-gm-phone-close, .v4-gm-phone-top, .v4-gm-phone-settings';
      const onTapDown = function (e) {
        tapStart = null;
        if (e.button != null && e.button !== 0) return;
        try {
          if (e.target && e.target.closest && e.target.closest(hudSkip)) return;
        } catch (eC) {}
        tapStart = { x: e.clientX, y: e.clientY, row: nearestPhoneRow(eventPos(e)) };
      };
      const onTapUp = function (e) {
        const start = tapStart;
        tapStart = null;
        if (!start || !start.row) return;
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if ((dx * dx + dy * dy) > 22 * 22) return;
        firePhonePick(start.row);
      };
      document.addEventListener('pointerdown', onTapDown, true);
      document.addEventListener('mousedown', onTapDown, true);
      document.addEventListener('pointerup', onTapUp, true);
      document.addEventListener('mouseup', onTapUp, true);
      state.handler = handler;
      state._onTapDown = onTapDown;
      state._onTapUp = onTapUp;
    } catch (e) {}
    return adapter;
  }
  async function mountPhoneCesium(el, viewerProp) {
    if (!el) return null;
    try {
      if (!global.UNALIGNED_GOOGLE_MAPS_TILES_KEY) {
        global.UNALIGNED_GOOGLE_MAPS_TILES_KEY = DEFAULT_GOOGLE_TILES_KEY;
      }
    } catch (e) {}
    const Cesium = await ensureCesiumPhone();
    el.innerHTML = '';
    const host = document.createElement('div');
    host.className = 'v4-gm-phone-cesium';
    host.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
    el.appendChild(host);
    let esriBase = false;
    try {
      const esriProvider = new Cesium.UrlTemplateImageryProvider({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        maximumLevel: 19,
        enablePickFeatures: false,
        credit: 'Esri World Imagery',
      });
      esriBase = new Cesium.ImageryLayer(esriProvider);
    } catch (e) { esriBase = false; }
    const viewerOpts = {
      animation: false, timeline: false, baseLayerPicker: false,
      fullscreenButton: false, vrButton: false, geocoder: false,
      homeButton: false, infoBox: false, sceneModePicker: false,
      selectionIndicator: false, navigationHelpButton: false,
      creditContainer: document.createElement('div'),
      terrainProvider: new Cesium.EllipsoidTerrainProvider(),
      shouldAnimate: true,
      scene3DOnly: true,
      skyAtmosphere: false,
      useDefaultRenderLoop: true,
    };
    if (esriBase) viewerOpts.baseLayer = esriBase;
    let viewer;
    try { viewer = new Cesium.Viewer(host, viewerOpts); }
    catch (e) {
      delete viewerOpts.baseLayer;
      viewer = new Cesium.Viewer(host, viewerOpts);
    }
    try {
      if (viewer.imageryLayers) {
        try { viewer.imageryLayers.removeAll(true); } catch (e0) {}
        viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
          url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          maximumLevel: 19,
          enablePickFeatures: false,
          credit: 'Esri World Imagery',
        }));
      }
    } catch (eImg) {}
    killPhoneAtmosphere(viewer);
    try { if (viewer.scene) viewer.scene.rethrowRenderErrors = false; } catch (eRethrow) {}
    try { configurePhoneAtmosphere(Cesium, viewer); } catch (eAtm) {}
    try {
      const globe = viewer.scene.globe;
      globe.depthTestAgainstTerrain = false;
    } catch (e) {}
    try { viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#000000'); } catch (eBg) {}
    try {
      const ssc = viewer.scene.screenSpaceCameraController;
      ssc.enableInputs = true;
      ssc.enableZoom = true;
      ssc.enableRotate = true;
      ssc.enableTilt = true;
      ssc.enableLook = false;
      ssc.enableTranslate = false;
      ssc.minimumZoomDistance = MIN_CAMERA_ALT_M;
      ssc.maximumZoomDistance = 4.5e7;
      ssc.inertiaZoom = 0.4;
      try {
        const CET = Cesium.CameraEventType;
        ssc.zoomEventTypes = [CET.PINCH, CET.WHEEL];
        ssc.rotateEventTypes = CET.LEFT_DRAG;
        ssc.tiltEventTypes = CET.PINCH;
        ssc.translateEventTypes = [];
      } catch (eZ) {}
    } catch (e) {}
    try {
      const canvas = viewer.scene.canvas;
      canvas.style.touchAction = 'none';
      canvas.style.pointerEvents = 'auto';
      canvas.tabIndex = -1;
      canvas.setAttribute('tabindex', '-1');
      canvas.addEventListener('wheel', function (e) {
        try { e.preventDefault(); e.stopPropagation(); } catch (e0) {}
        let h = 1.37e7;
        try { h = viewer.camera.positionCartographic.height; } catch (eH) {}
        if (!(h > 0)) h = 1.37e7;
        const factor = e.deltaY > 0 ? 1.16 : 0.86;
        const next = Math.max(MIN_CAMERA_ALT_M, Math.min(4.5e7, h * factor));
        try {
          const c = viewer.camera.positionCartographic;
          viewer.camera.setView({
            destination: Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, next)
          });
        } catch (eZ) {}
      }, { passive: false, capture: true });
    } catch (e) {}
    const v = viewerProp || {};
    const lat = Number(v.lat);
    const lng = Number(v.lng != null ? v.lng : v.lon);
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(
        Number.isFinite(lng) ? lng : -20,
        Number.isFinite(lat) ? lat : 28,
        1.37e7
      ),
    });
    const state = { googleTileset: null, handler: null };
    const onMoveEnd = function () {
      try {
        const h = viewer.camera.positionCartographic && viewer.camera.positionCartographic.height;
        if (Number.isFinite(h) && h > PHOTOREAL_HIDE_M && state && state.googleTileset) destroyPhonePhotoreal(Cesium, viewer, state);
      } catch (e) {}
      try { if (state && state.runHorizonCull) state.runHorizonCull(); } catch (eH) {}
    };
    try { viewer.camera.moveEnd.addEventListener(onMoveEnd); } catch (e) {}
    try {
      viewer.camera.percentageChanged = 0.02;
      const onCamChanged = function () {
        if (state._photorealSyncTimer) return;
        state._photorealSyncTimer = global.setTimeout(function () {
          state._photorealSyncTimer = null;
          try {
            const hh = viewer.camera.positionCartographic && viewer.camera.positionCartographic.height;
            if (Number.isFinite(hh) && hh > PHOTOREAL_HIDE_M && state && state.googleTileset) destroyPhonePhotoreal(Cesium, viewer, state);
          } catch (eC) {}
          try { if (state && state.runHorizonCull) state.runHorizonCull(); } catch (eH) {}
        }, 140);
      };
      viewer.camera.changed.addEventListener(onCamChanged);
      state._onCamChanged = onCamChanged;
    } catch (e) {}
    try { viewer.resize(); } catch (e) {}
    try {
      global.setTimeout(function () {
        try { viewer.resize(); } catch (eR) {}
      }, 0);
      global.setTimeout(function () {
        try { viewer.resize(); } catch (eR) {}
      }, 300);
    } catch (eT) {}
    try { installIdleOrbitSpin(Cesium, viewer, state); } catch (eSpin) {}
    return makeCesiumPhoneAdapter(Cesium, viewer, state);
  }
  function syncGlobeCameraNear(g) {
    if (!g || g.__cesium) return;
    try {
      const cam = g.camera && g.camera();
      if (!cam) return;
      const radius = globeRadiusOf(g);
      const dist = cam.position ? Math.hypot(cam.position.x, cam.position.y, cam.position.z) : (radius * 2.15);
      const alt = Math.max(1e-6, dist - radius);
      cam.near = Math.max(0.00001, alt * 0.08);
      cam.far = Math.max(dist + radius * 4, 8000);
      if (typeof cam.updateProjectionMatrix === 'function') cam.updateProjectionMatrix();
      const controls = g.controls && g.controls();
      if (controls) controls.minDistance = radius * (1 + MIN_ALT_RADII);
    } catch (e) {}
  }

  function configurePhoneControls(g) {
    if (!g || g.__cesium) return null;
    const controls = g.controls();
    if (!controls) throw new Error('Globe controls unavailable');
    const radius = globeRadiusOf(g);
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.28;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enableRotate = true;
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.zoomSpeed = 1.4;
    controls.rotateSpeed = 0.7;
    controls.minDistance = radius * (1 + MIN_ALT_RADII);
    controls.maxDistance = radius * 10;
    try {
      const T = global.THREE;
      if (T && T.TOUCH && controls.touches) {
        controls.touches.ONE = T.TOUCH.ROTATE;
        controls.touches.TWO = T.TOUCH.DOLLY_ROTATE;
      }
    } catch (e) {}
    try {
      const canvas = g.renderer && g.renderer() && g.renderer().domElement;
      if (canvas) {
        canvas.style.touchAction = 'none';
        canvas.style.msTouchAction = 'none';
        canvas.style.webkitUserSelect = 'none';
        canvas.style.userSelect = 'none';
        canvas.style.webkitTransform = 'none';
        canvas.style.transform = 'none';
      }
    } catch (e) {}
    return controls;
  }
  function clampAltitude(alt) {
    const n = Number(alt);
    if (!Number.isFinite(n)) return 2.15;
    return Math.min(8.5, Math.max(MIN_ALT_RADII, n));
  }
  function cameraDistance(globe) {
    try {
      const cam = globe && globe.camera && globe.camera();
      if (!cam || !cam.position) return 0;
      const p = cam.position;
      return Math.hypot(p.x, p.y, p.z);
    } catch (e) { return 0; }
  }
  function setCameraDistance(globe, dist) {
    try {
      const cam = globe && globe.camera && globe.camera();
      if (!cam || !cam.position) return;
      const radius = globeRadiusOf(globe);
      const minD = radius * (1 + MIN_ALT_RADII);
      const maxD = radius * 10;
      const d = Math.min(maxD, Math.max(minD, Number(dist) || minD));
      const p = cam.position;
      const len = Math.hypot(p.x, p.y, p.z) || 1;
      const s = d / len;
      p.x *= s;
      p.y *= s;
      p.z *= s;
      try {
        cam.near = Math.max(0.00001, (d - radius) * 0.08);
        cam.far = Math.max(d + radius * 4, 8000);
        if (typeof cam.updateProjectionMatrix === 'function') cam.updateProjectionMatrix();
      } catch (eNear) {}
      try {
        const controls = globe.controls && globe.controls();
        if (controls) {
          controls.minDistance = minD;
          controls.maxDistance = maxD;
          if (typeof controls.update === 'function') controls.update();
        }
      } catch (e2) {}
      try {
        if (typeof globe.updatePov === 'function') globe.updatePov(cam);
      } catch (e3) {}
    } catch (e) {}
  }
  function bindPhoneGlobeGestures(globe, rootEl) {
    if (globe && (globe.__cesium || globe._viewer || globe.viewer)) return function () {};
    const el = rootEl || null;
    if (!el || el.__godModeGestures) return function () {};
    el.__godModeGestures = true;
    let pinchStartDist = 0;
    let pinchStartCamDist = 0;
    const pinchDist = function (e) {
      if (!e.touches || e.touches.length < 2) return 0;
      const a = e.touches[0];
      const b = e.touches[1];
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    };
    const stopPageZoom = function (e) {
      if (e && e.cancelable) e.preventDefault();
    };
    const onStart = function (e) {
      if (!e.touches || e.touches.length !== 2) return;
      pinchStartDist = pinchDist(e);
      pinchStartCamDist = cameraDistance(globe) || (globeRadiusOf(globe) * 3.15);
      try {
        const c = globe.controls();
        if (c) {
          c.autoRotate = false;
          c.enableDamping = false;
        }
      } catch (err) {}
    };
    const onMove = function (e) {
      if (!e.touches || e.touches.length !== 2 || !(pinchStartDist > 0)) return;
      stopPageZoom(e);
      try { e.stopPropagation(); } catch (err) {}
      const d = pinchDist(e);
      if (!(d > 0)) return;
      setCameraDistance(globe, pinchStartCamDist * (pinchStartDist / d));
    };
    const onEnd = function (e) {
      if (!e.touches || e.touches.length < 2) {
        pinchStartDist = 0;
        try {
          const c = globe.controls();
          if (c) c.enableDamping = true;
        } catch (err) {}
      }
    };
    const onWheel = function (e) {
      stopPageZoom(e);
      try { e.stopPropagation(); } catch (err) {}
      const dist = cameraDistance(globe) || (globeRadiusOf(globe) * 3.15);
      setCameraDistance(globe, dist * (e.deltaY > 0 ? 1.12 : 0.88));
      try { const c = globe.controls(); if (c) c.autoRotate = false; } catch (err) {}
    };
    const opts = { passive: false, capture: true };
    const targets = [el];
    const overlay = el.closest ? el.closest('.v4-gm-phone') : null;
    if (overlay && overlay !== el) targets.push(overlay);
    if (typeof document !== 'undefined') targets.push(document);
    targets.forEach(function (node) {
      if (!node || !node.addEventListener) return;
      node.addEventListener('touchstart', onStart, opts);
      node.addEventListener('touchmove', onMove, opts);
      node.addEventListener('touchend', onEnd, opts);
      node.addEventListener('touchcancel', onEnd, opts);
      ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (type) {
        node.addEventListener(type, stopPageZoom, opts);
      });
    });
    el.addEventListener('wheel', onWheel, opts);
    return function () {
      el.__godModeGestures = false;
      targets.forEach(function (node) {
        if (!node || !node.removeEventListener) return;
        node.removeEventListener('touchstart', onStart, opts);
        node.removeEventListener('touchmove', onMove, opts);
        node.removeEventListener('touchend', onEnd, opts);
        node.removeEventListener('touchcancel', onEnd, opts);
        ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (type) {
          node.removeEventListener(type, stopPageZoom, opts);
        });
      });
      el.removeEventListener('wheel', onWheel, opts);
    };
  }
  async function fetchOpenSkyDirect() {
    const res = await fetchCorsFirst(OPENSKY_STATES_URL, { headers: { Accept: 'application/json' } }, 14000);
    const data = await res.json();
    const rows = parseFlightStates(data && data.states);
    if (!rows.length) throw new Error('opensky empty');
    rows.forEach(function (r) { if (!r.source) r.source = 'OpenSky'; });
    return rows;
  }
  function normalizeRainViewerHost(host) {
    let h = String(host || '').trim();
    if (!h) return '';
    if (h.indexOf('//') === 0) h = 'https:' + h;
    else if (!/^https?:\/\//i.test(h)) h = 'https://' + h;
    return h.replace(/\/$/, '');
  }
  async function fetchRainViewerMetaOnce() {
    const res = await fetchWithTimeout(RAINVIEWER_META_URL, { headers: { Accept: 'application/json' } }, 8000);
    if (!res || !res.ok) return null;
    const data = await res.json();
    const host = normalizeRainViewerHost((data && data.host) || 'https://tilecache.rainviewer.com');
    const past = Array.isArray(data && data.radar && data.radar.past) ? data.radar.past : [];
    const nowcast = Array.isArray(data && data.radar && data.radar.nowcast) ? data.radar.nowcast : [];
    const frames = past.length ? past : nowcast;
    if (!frames.length) return null;
    const last = frames[frames.length - 1] || {};
    const path = String(last.path || '').trim();
    if (!host || !path) return null;
    return { host: host, path: path, time: last.time, frames: frames };
  }
  async function fetchRainViewerMeta() {
    try {
      const first = await fetchRainViewerMetaOnce();
      if (first) return first;
    } catch (e) {}
    try {
      return await fetchRainViewerMetaOnce();
    } catch (e2) {
      return null;
    }
  }
  async function fetchPhoneStorms() {
    try {
      let data = null;
      try { data = await fetchGodModeProxy('/god-mode/storms', 12000); } catch (eP) { return []; }
      if (!data) return [];
      const storms = Array.isArray(data.activeStorms) ? data.activeStorms : [];
      if (!storms.length) return [];
      const out = [];
      for (let i = 0; i < storms.length; i++) {
        const s = storms[i] || {};
        const lat = Number(
          s.latitudeNumeric != null ? s.latitudeNumeric
            : (s.lat != null ? s.lat
              : (s.latitude != null ? s.latitude : s.centerLat))
        );
        const lng = Number(
          s.longitudeNumeric != null ? s.longitudeNumeric
            : (s.lng != null ? s.lng
              : (s.lon != null ? s.lon
                : (s.longitude != null ? s.longitude : s.centerLon)))
        );
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
        const name = String(s.name || s.stormName || s.id || ('Storm ' + (i + 1))).trim();
        out.push({
          lat: lat, lng: lng, altM: 0, type: 'storm', size: 0.22,
          name: name, label: 'STORM · ' + name, color: '#64d2ff',
          id: 'storm-' + name, source: (data && data.source) || 'NHC'
        });
      }
      return out;
    } catch (e) { return []; }
  }

  function tempColor(f) {

    const t = Number(f);

    if (!Number.isFinite(t)) return 'rgba(140,140,140,0.55)';

    if (t >= 95) return '#ff3b30';

    if (t >= 82) return '#ff9500';

    if (t >= 68) return '#ffd60a';

    if (t >= 50) return '#34c759';

    if (t >= 32) return '#5ac8fa';

    return '#5e5ce6';

  }

  function weatherGlyph(code) {

    const c = Number(code);

    if (c === 113) return '☀';

    if (c === 116 || c === 119) return '⛅';

    if (c === 122 || c === 143 || c === 248 || c === 260) return '☁';

    if ([176, 263, 266, 281, 284, 293, 296, 299, 302, 305, 308, 311, 314, 353, 356, 359].includes(c)) return '🌧';

    if ([179, 182, 185, 227, 230, 323, 326, 329, 332, 335, 338, 350, 362, 365, 368, 371, 374, 377].includes(c)) return '❄';

    if ([200, 386, 389].includes(c)) return '⛈';

    if (c === 185 || c === 284) return '🌨';

    return '◌';

  }

  function weatherConditionLabel(code, fallback) {

    const labels = {

      113: 'Clear', 116: 'Partly cloudy', 119: 'Cloudy', 122: 'Overcast',

      143: 'Mist', 176: 'Patchy rain', 200: 'Thunderstorm', 227: 'Blowing snow',

      230: 'Blizzard', 248: 'Fog', 260: 'Freezing fog', 263: 'Light drizzle',

      266: 'Drizzle', 281: 'Freezing drizzle', 284: 'Heavy drizzle', 293: 'Light rain',

      296: 'Rain', 299: 'Moderate rain', 302: 'Heavy rain', 305: 'Heavy rain',

      308: 'Heavy rain', 311: 'Freezing rain', 314: 'Heavy freezing rain',

      323: 'Light snow', 326: 'Snow', 329: 'Heavy snow', 332: 'Light snow showers',

      335: 'Snow showers', 338: 'Heavy snow showers', 350: 'Hail', 353: 'Light showers',

      356: 'Showers', 359: 'Heavy showers', 362: 'Sleet showers', 365: 'Sleet showers',

      368: 'Sleet', 371: 'Heavy sleet showers', 374: 'Sleet showers', 377: 'Heavy sleet',

      386: 'Thunder showers', 389: 'Heavy thunder showers',

    };

    return labels[Number(code)] || String(fallback || 'Weather').trim() || 'Weather';

  }

  function wmoGlyph(code) {

    const c = Number(code);

    if (c === 0) return '☀';

    if (c === 1 || c === 2) return '⛅';

    if (c === 3) return '☁';

    if (c === 45 || c === 48) return '☁';

    if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return '🌧';

    if ((c >= 71 && c <= 77) || c === 85 || c === 86) return '❄';

    if (c >= 95) return '⛈';

    return '◌';

  }

  function wmoLabel(code) {

    const c = Number(code);

    const labels = {

      0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',

      45: 'Fog', 48: 'Freezing fog', 51: 'Light drizzle', 53: 'Drizzle',

      55: 'Heavy drizzle', 56: 'Freezing drizzle', 57: 'Freezing drizzle',

      61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain',

      67: 'Freezing rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow',

      77: 'Snow grains', 80: 'Light showers', 81: 'Showers', 82: 'Heavy showers',

      85: 'Snow showers', 86: 'Snow showers', 95: 'Thunderstorm',

      96: 'Thunderstorm + hail', 99: 'Thunderstorm + hail',

    };

    return labels[c] || 'Weather';

  }

  function flightAltColor(altitudeFt) {

    const ft = Number(altitudeFt);

    if (!Number.isFinite(ft)) return 'rgba(255,214,10,0.92)';

    if (ft >= 30000) return 'rgba(100,210,255,0.92)';

    if (ft >= 15000) return 'rgba(255,214,10,0.92)';

    return 'rgba(255,159,10,0.92)';

  }

  function windCompass(deg) {

    const d = Number(deg);

    if (!Number.isFinite(d)) return '';

    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

    return dirs[Math.round(d / 45) % 8];

  }

  function fmtLaunchWhen(iso) {

    try {

      const d = new Date(iso);

      if (!Number.isFinite(d.getTime())) return 'TBD';

      return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

    } catch (e) {

      return 'TBD';

    }

  }

  function providerName(launch) {

    return String(launch?.launch_service_provider?.name || launch?.rocket?.configuration?.launch_service_provider?.name || 'Unknown').trim();

  }

  async function fetchWithTimeout(url, options, ms) {

    const timeout = Number(ms) || FETCH_TIMEOUT_MS;

    const ctrl = new AbortController();

    const timer = window.setTimeout(() => ctrl.abort(), timeout);

    try {

      const res = await fetch(url, { ...(options || {}), signal: ctrl.signal, cache: 'no-store' });

      return res;

    } finally {

      window.clearTimeout(timer);

    }

  }

  function godModeServiceBases() {
    const bases = [];
    const loc = global.location || window.location;
    const host = String(loc && loc.hostname || '').toLowerCase();
    const onPublic = /github\.io$/.test(host);
    try {
      const origin = String(loc && loc.origin || '').replace(/\/$/, '');
      if (origin && !onPublic && !host.includes('127.0.0.1') && !host.includes('localhost')) bases.push(origin);
    } catch (e) {}
    if (!onPublic && !host.includes('127.0.0.1') && !host.includes('localhost')) {
      bases.push('https://mac-studio.tail50d3a2.ts.net');
    }
    if (host.includes('127.0.0.1') || host.includes('localhost')) {
      bases.push('http://127.0.0.1:8767');
    }
    return [...new Set(bases.filter(Boolean))];
  }

  async function fetchGodModeProxy(path, ms) {

    const bases = godModeServiceBases();

    let lastErr = null;

    for (const base of bases) {

      try {

        const res = await fetchWithTimeout(base + path, {}, ms || FETCH_TIMEOUT_MS);

        if (!res.ok) {

          lastErr = new Error('proxy ' + res.status);

          continue;

        }

        return await res.json();

      } catch (e) {

        lastErr = e;

      }

    }

    throw lastErr || new Error('Mac god-mode proxy unreachable');

  }

  function mapWeatherRow(row) {

    const temp = Number(row?.temp);

    const wind = Number(row?.wind);

    const code = Number(row?.code);

    const windDeg = Number(row?.wind_deg);

    const name = String(row?.name || '').trim();

    const lat = Number(row?.lat);

    const lng = Number(row?.lng);

    const condition = String(row?.conditionLabel || '').trim() || weatherConditionLabel(code, row?.condition);

    const glyph = String(row?.glyphOverride || '').trim() || weatherGlyph(code);

    const tempRounded = Number.isFinite(temp) ? Math.round(temp) : null;

    return {

      name,

      lat,

      lng,

      temp: tempRounded,
      precip: Number.isFinite(Number(row?.precip)) ? Number(row.precip) : 0,

      wind: Number.isFinite(wind) ? Math.round(wind) : null,

      windDeg: Number.isFinite(windDeg) ? windDeg : null,

      windCompass: windCompass(windDeg) || String(row?.wind_dir || '').trim(),

      code,

      condition,

      glyph,

      color: tempColor(temp),

      // Globe labels are numeric only — the 3D text font has no emoji glyphs

      // (they render as "?"). Glyphs stay in the HTML side panel.

      text: tempRounded != null ? `${tempRounded}°` : name,

      label: `${name} · ${condition}${tempRounded != null ? ` · ${tempRounded}°F` : ''}`,

      labelSize: 0.58,

      alt: 0.012,

      weight: Number.isFinite(temp) ? temp : 50,

      type: 'weather',

    };

  }

  async function fetchOpenMeteoGrid() {

    const lats = WEATHER_CITIES.map((c) => c[1]).join(',');

    const lngs = WEATHER_CITIES.map((c) => c[2]).join(',');

    const url = 'https://api.open-meteo.com/v1/forecast'

      + `?latitude=${lats}&longitude=${lngs}`

      + '&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,precipitation'

      + '&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=UTC';

    const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 12000);

    if (!res.ok) throw new Error('open-meteo ' + res.status);

    const data = await res.json();

    const rows = Array.isArray(data) ? data : [data];

    const out = [];

    rows.forEach((row, i) => {

      const city = WEATHER_CITIES[i];

      if (!city) return;

      const cur = row?.current || {};

      const code = Number(cur.weather_code);

      out.push(mapWeatherRow({

        name: city[0],

        lat: city[1],

        lng: city[2],

        temp: cur.temperature_2m,
        precip: cur.precipitation,

        wind: cur.wind_speed_10m,

        wind_deg: cur.wind_direction_10m,

        code,

        conditionLabel: wmoLabel(code),

        glyphOverride: wmoGlyph(code),

      }));

    });

    if (!out.length) throw new Error('open-meteo empty');

    return out;

  }

  async function fetchWeatherGrid() {
    let cities = null;
    try {
      cities = await fetchOpenMeteoGrid();
    } catch (e) {
      console.warn('[god-mode] open-meteo failed, trying Mac proxy', e);
    }
    if (!cities || !cities.length) {
      const data = await fetchGodModeProxy('/god-mode/weather', WEATHER_PROXY_TIMEOUT_MS);
      if (data?.ok && Array.isArray(data.cities) && data.cities.length) {
        cities = data.cities.map(mapWeatherRow).filter((row) => row.name && Number.isFinite(row.lat));
      }
    }
    if (!cities || !cities.length) throw new Error('weather grid failed');
    try {
      const radar = await fetchRainViewerMeta();
      if (radar) {
        cities.forEach(function (row) {
          row.radar = radar.path || '';
          if (!row.source) row.source = 'Open-Meteo + RainViewer';
        });
      }
    } catch (e) {}
    return cities;
  }

  function flightRowFromCoords(lat, lng, altM, vel, heading, callsign, country, key) {

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

    const altMSafe = Number.isFinite(altM) ? Math.max(0, altM) : 10000;
    const altKm = Math.min(0.0022, Math.max(0.0004, altMSafe / 6371000));

    const cs = String(callsign || '').trim();

    const cc = String(country || '').trim();

    return {

      lat,

      lng,

      alt: altKm,
      altM: altMSafe,
      color: (typeof flightAltColor === 'function') ? flightAltColor(Number.isFinite(altMSafe) ? altMSafe * 3.281 : null) : '#ffd60a',

      heading: Number.isFinite(heading) ? heading : 0,

      label: cs || cc || 'Flight',

      callsign: cs,

      country: cc,

      type: 'flight',

      key: String(key || cs || `${lat},${lng}`),

      altitudeFt: Number.isFinite(altM) ? Math.round(altM * 3.281) : null,

      speedKts: Number.isFinite(vel) ? Math.round(vel * 1.944) : null,

    };

  }

  function parseFlightStates(states) {

    const out = [];

    const rows = Array.isArray(states) ? states : [];

    for (let i = 0; i < rows.length && out.length < 1400; i++) {

      const s = rows[i];

      if (!Array.isArray(s) || s.length < 11) continue;

      const row = flightRowFromCoords(

        Number(s[6]),

        Number(s[5]),

        Number(s[7]),

        Number(s[9]),

        Number(s[10]),

        s[1],

        s[2],

        s[0]

      );

      if (row) out.push(row);

    }

    return out;

  }

    function parseAdsbAircraft(rows) {
    const out = [];
    const seen = new Set();
    const list = Array.isArray(rows) ? rows : [];
    for (let i = 0; i < list.length && out.length < 1400; i++) {
      const ac = list[i];
      if (!ac || typeof ac !== "object") continue;
      const last = ac.lastPosition && typeof ac.lastPosition === "object" ? ac.lastPosition : null;
      const lat = Number(ac.lat != null ? ac.lat : (ac.latitude != null ? ac.latitude : last && last.lat));
      const lng = Number(ac.lon != null ? ac.lon : (ac.lng != null ? ac.lng : (ac.longitude != null ? ac.longitude : last && (last.lon != null ? last.lon : last.lng))));
      const rawAlt = ac.alt_baro != null ? ac.alt_baro : (ac.alt_geom != null ? ac.alt_geom : ac.baro_altitude);
      let altM = null;
      if (rawAlt === "ground" || rawAlt === "GROUND") altM = 0;
      else {
        const altNum = Number(rawAlt);
        if (Number.isFinite(altNum)) altM = altNum * 0.3048;
      }
      const gs = Number(ac.gs != null ? ac.gs : ac.ground_speed);
      const vel = Number.isFinite(gs) ? gs * 0.514444 : null;
      const key = String(ac.hex || ac.icao || ac.flight || "").trim();
      if (key && seen.has(key)) continue;
      const row = flightRowFromCoords(lat, lng, altM, vel, Number(ac.track), ac.flight, "", key);
      if (row) {
        if (key) seen.add(key);
        out.push(row);
      }
    }
    return out;
  }

    function parseFlightsPayload(data) {
    if (!data) return [];
    const tryStates = (list) => {
      if (!Array.isArray(list) || !list.length) return [];
      if (Array.isArray(list[0])) return parseFlightStates(list);
      return parseAdsbAircraft(list);
    };
    let rows = tryStates(data.states);
    if (rows.length) return rows;
    rows = tryStates(data.ac || data.aircraft || data.locations || data.rows);
    if (rows.length) return rows;
    if (Array.isArray(data) && data.length) return tryStates(data);
    return [];
  }

  async function fetchAdsbHubFlights(lat, lng) {
    const urls = [
      "https://api.airplanes.live/v2/point/" + lat + "/" + lng + "/200",
      "https://opendata.adsb.fi/api/v2/lat/" + lat + "/lon/" + lng + "/dist/200",
    ];
    for (let u = 0; u < urls.length; u++) {
      try {
        const res = await fetchWithTimeout(urls[u], { headers: { Accept: "application/json" } }, 16000);
        if (!res.ok) continue;
        const data = await res.json();
        const rows = parseAdsbAircraft(data && (data.ac || data.aircraft));
        if (rows.length) return rows;
      } catch (e) {}
    }
    return [];
  }

  async function fetchAdsbFlightsMerged() {

    const merged = [];

    const seen = new Set();

    for (let i = 0; i < FLIGHT_HUBS.length; i++) {

      const [lat, lng] = FLIGHT_HUBS[i];

      try {

        const rows = await fetchAdsbHubFlights(lat, lng);

        rows.forEach((row) => {

          const key = row.key || row.callsign || `${row.lat},${row.lng}`;

          if (seen.has(key)) return;

          seen.add(key);

          merged.push(row);

        });

      } catch (e) {}

      if (i < FLIGHT_HUBS.length - 1) await new Promise((r) => setTimeout(r, 350));

    }

    return merged;

  }

    async function fetchFlights() {
    try {
      const data = await fetchGodModeProxy("/god-mode/flights", 8000);
      const rows = parseFlightsPayload(data);
      if (rows.length) {
        rows.forEach((r) => { if (!r.source) r.source = "OpenSky proxy"; });
        return rows;
      }
    } catch (e) {
      console.warn("[god-mode-phone] Mac flight proxy failed, trying OpenSky", e);
    }
    try {
      const rows = await fetchOpenSkyDirect();
      if (rows.length) return rows;
    } catch (e) {
      console.warn("[god-mode-phone] OpenSky failed, trying ADS-B", e);
    }
    try {
      const rows = await fetchAdsbFlightsMerged();
      if (rows.length) {
        rows.forEach((r) => { if (!r.source) r.source = "airplanes.live"; });
        return rows;
      }
    } catch (e) {
      console.warn("[god-mode-phone] live ADS-B failed", e);
    }
    return [];
  }

  async function fetchIss() {

    try {

      const res = await fetchWithTimeout('https://api.wheretheiss.at/v1/satellites/25544');

      if (res.ok) {

        const data = await res.json();

        const lat = Number(data?.latitude);

        const lng = Number(data?.longitude);

        if (Number.isFinite(lat) && Number.isFinite(lng)) {

          return [{

            lat,

            lng,

            alt: 0.065,

            name: 'International Space Station',

            label: 'ISS · live',

            type: 'satellite',

            craft: 'iss',

          }];

        }

      }

    } catch (e) {}

    const data = await fetchGodModeProxy('/god-mode/satellites');

    if (!data?.ok) throw new Error(data?.error || 'satellite proxy failed');

    const rows = Array.isArray(data.satellites) ? data.satellites : [];

    return rows.map((row) => {

      const lat = Number(row.lat);

      const lng = Number(row.lng);

      return {

        lat,

        lng,

        alt: 0.065,

        name: String(row.name || 'ISS'),

        label: String(row.name || 'ISS'),

        type: 'satellite',

        craft: 'iss',

      };

    }).filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lng));

  }

  function loadSatelliteLib() {

    if (global.satellite?.twoline2satrec) return Promise.resolve(global.satellite);

    if (satLibPromise) return satLibPromise;

    satLibPromise = new Promise((resolve, reject) => {

      const s = document.createElement('script');

      s.src = SAT_LIB_URL;

      s.async = true;

      s.onload = () => (global.satellite?.twoline2satrec

        ? resolve(global.satellite)

        : reject(new Error('satellite.js loaded but missing API')));

      s.onerror = () => reject(new Error('satellite.js failed to load'));

      document.head.appendChild(s);

    });

    return satLibPromise;

  }

  async function fetchStarlinkTleText() {

    try {

      const raw = JSON.parse(window.localStorage.getItem(STARLINK_TLE_CACHE_KEY) || 'null');

      if (raw?.text && Date.now() - Number(raw.savedAt || 0) < STARLINK_TLE_TTL_MS) return raw.text;

    } catch (e) {}

    let text = '';

    // Mac proxy first: Celestrak 403s requests coming from a browser Origin,

    // but server-side fetches are fine (and the proxy caches for 6h).

    try {

      const data = await fetchGodModeProxy('/god-mode/starlink-tle', 45000);

      if (data?.ok && data.tle) text = String(data.tle);

    } catch (e) {}

    if (!text) {
      try {
        const res = await fetchCorsFirst(STARLINK_TLE_URL, {}, 30000);
        if (res && res.ok) text = await res.text();
      } catch (e) {}
    }
    if (!text) {
      const res = await fetchWithTimeout(STARLINK_TLE_URL, {}, 30000);
      if (!res.ok) throw new Error('starlink TLE feed ' + res.status);
      text = await res.text();
    }

    if (!/^1 /m.test(text)) throw new Error('starlink TLE feed malformed');

    try {

      window.localStorage.setItem(STARLINK_TLE_CACHE_KEY, JSON.stringify({ text, savedAt: Date.now() }));

    } catch (e) {} // ~1.8MB — caching is best-effort, quota errors are fine

    return text;

  }

  async function ensureStarlinkSatrecs() {

    if (starlinkSatrecs?.length) return starlinkSatrecs;

    const sat = await loadSatelliteLib();

    const text = await fetchStarlinkTleText();

    const lines = text.split(/\r?\n/);

    const recs = [];

    for (let i = 1; i < lines.length; i++) {

      const l1 = lines[i];

      const l2 = lines[i + 1] || '';

      if (!l1 || l1.charCodeAt(0) !== 49 /* '1' */ || !l1.startsWith('1 ') || !l2.startsWith('2 ')) continue;

      const name = String(lines[i - 1] || '').trim() || 'STARLINK';

      try {

        const rec = sat.twoline2satrec(l1, l2);

        if (rec) recs.push({ name, rec });

      } catch (e) {}

      i += 1;

    }

    if (!recs.length) throw new Error('no starlink TLEs parsed');

    starlinkSatrecs = recs;

    return recs;

  }

  function propagateStarlinkPoints() {

    const sat = global.satellite;

    if (!sat || !starlinkSatrecs?.length) return [];

    const now = new Date();

    const gmst = sat.gstime(now);

    const points = [];

    for (let i = 0; i < starlinkSatrecs.length; i++) {

      const { name, rec } = starlinkSatrecs[i];

      let geo = null;

      try {

        const pv = sat.propagate(rec, now);

        if (!pv?.position) continue;

        geo = sat.eciToGeodetic(pv.position, gmst);

      } catch (e) { continue; }

      const lat = sat.degreesLat(geo.latitude);

      const lng = sat.degreesLong(geo.longitude);

      const altKm = Number(geo.height);

      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(altKm)) continue;

      if (altKm < 100 || altKm > 2500) continue; // drop decayed/garbage propagations

      // Tiny points only — large pointRadius + low resolution looked like blue cylinders.

      points.push({

        lat,

        lng,

        alt: Math.min(0.12, Math.max(0.035, altKm / KM_PER_GLOBE_RADIUS)),

        size: STARLINK_POINT_SIZE,

        color: 'rgba(210, 220, 230, 0.42)',

        label: name,

        name,

        type: 'starlink',

      });

    }

    return points;

  }

  async function fetchStarlink() {

    await ensureStarlinkSatrecs();

    const points = propagateStarlinkPoints();

    if (!points.length) throw new Error('starlink propagation produced no positions');

    return { points, count: points.length, updatedAt: Date.now() };

  }

  function thinStarlinkPoints(points, maxKeep) {

    const list = Array.isArray(points) ? points : [];

    const cap = Math.max(80, Number(maxKeep) || STARLINK_MAX_POINTS_ALL);

    if (list.length <= cap) return list;

    const step = list.length / cap;

    const out = [];

    for (let i = 0; i < cap; i++) {

      const row = list[Math.floor(i * step)];

      if (row) out.push(row);

    }

    return out;

  }

  function readLaunchCache() {

    try {

      const raw = JSON.parse(window.localStorage.getItem(LAUNCH_CACHE_KEY) || 'null');

      if (raw && Array.isArray(raw.markers) && Array.isArray(raw.list)) return raw;

    } catch (e) {}

    return null;

  }

  function writeLaunchCache(payload) {

    try {

      window.localStorage.setItem(LAUNCH_CACHE_KEY, JSON.stringify({ ...payload, savedAt: Date.now() }));

    } catch (e) {}

  }

  function launchColor(provider, rocket) {
    const hay = String(provider || '') + ' ' + String(rocket || '');
    if (/SpaceX|Falcon|Starship/i.test(hay)) return '#e8e8e8';
    if (/ULA|Atlas|Vulcan|Delta/i.test(hay)) return '#5ac8fa';
    if (/Rocket Lab|Electron/i.test(hay)) return '#ff375f';
    if (/Arianespace|Ariane|Vega/i.test(hay)) return '#64d2ff';
    if (/CASC|Long March|China/i.test(hay)) return '#ff9f0a';
    if (/Roscosmos|Soyuz/i.test(hay)) return '#bf5af2';
    if (/ISRO/i.test(hay)) return '#ffd60a';
    return '#ffd60a';
  }

  function mapLaunchRows(rows, source) {
    const markers = [];
    const list = [];
    (Array.isArray(rows) ? rows : []).forEach(function (launch) {
      if (!launch) return;
      const pad = launch.pad || {};
      const lat = Number(launch.lat != null ? launch.lat : pad.latitude);
      const lng = Number(launch.lng != null ? launch.lng : (launch.lon != null ? launch.lon : pad.longitude));
      const name = String(launch.name || 'Launch').trim();
      const provider = providerName(launch);
      const when = String(launch.net || launch.when || '');
      const status = String((launch.status && launch.status.name) || launch.status || 'Scheduled');
      const rocket = String((launch.rocket && launch.rocket.configuration && (launch.rocket.configuration.full_name || launch.rocket.configuration.name)) || launch.rocket || '').trim();
      const loc = String((pad.location && pad.location.name) || pad.name || launch.loc || '').trim();
      const color = launch.color || launchColor(provider, rocket);
      list.push({ id: launch.id, name: name, provider: provider, when: when, status: status, rocket: rocket, loc: loc, lat: lat, lng: lng });
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        markers.push({
          lat: lat, lng: lng, altM: 0, alt: 0.008, size: 0.16,
          label: provider + ' · ' + name, name: name, provider: provider, when: when,
          type: 'launch', id: 'lnch-' + String(launch.id || name),
          color: color, source: source || 'Launch Library 2', rocket: rocket, loc: loc, status: status
        });
      }
    });
    return { markers: markers, list: list };
  }

  async function fetchLaunches() {
    const cached = readLaunchCache();
    if (cached && Date.now() - Number(cached.savedAt || 0) < LAUNCH_CACHE_TTL_MS) {
      return { markers: cached.markers || [], list: cached.list || [] };
    }
    try {
      const fresh = await fetchLaunchesLive();
      if (fresh && (fresh.markers || []).length) writeLaunchCache(fresh);
      if (fresh && ((fresh.markers || []).length || (fresh.list || []).length)) return fresh;
    } catch (e) {}
    if (cached) return { markers: cached.markers || [], list: cached.list || [] };
    return { markers: [], list: [] };
  }

  async function fetchLaunchesLive() {
    try {
      const proxied = await fetchGodModeProxy('/god-mode/launches', 8000);
      if (proxied && proxied.ok !== false) {
        if (Array.isArray(proxied.markers) && proxied.markers.length && proxied.markers[0] && Number.isFinite(Number(proxied.markers[0].lat))) {
          const markers = proxied.markers.map(function (m) {
            return Object.assign({ type: 'launch', altM: 0, size: 0.16, color: m.color || '#ffd60a' }, m, { type: 'launch' });
          });
          return { markers: markers, list: proxied.list || markers };
        }
        const rows = proxied.results || proxied.launches || proxied.rows || [];
        const mapped = mapLaunchRows(rows, 'god-mode launches');
        if (mapped.markers.length) return mapped;
      }
    } catch (eP) {}
    const url = 'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=12&mode=detailed';
    const res = await fetchCorsFirst(url, {}, 12000);
    if (!res || !res.ok) throw new Error('launches ' + ((res && res.status) || 'fail'));
    const data = await res.json();
    return mapLaunchRows(data && data.results, 'Launch Library 2');
  }

  function readEventCache() {

    try {

      const raw = JSON.parse(window.localStorage.getItem(EONET_CACHE_KEY) || 'null');

      if (raw && Array.isArray(raw.events)) return raw;

    } catch (e) {}

    return null;

  }

  function writeEventCache(payload) {

    try {

      window.localStorage.setItem(EONET_CACHE_KEY, JSON.stringify({ ...payload, savedAt: Date.now() }));

    } catch (e) {}

  }

  function eventGlyph(category) {

    const c = String(category || '').toLowerCase();

    if (c.includes('wildfire') || c.includes('fire')) return 'FIRE';

    if (c.includes('earthquake')) return 'QUAKE';

    if (c.includes('storm') || c.includes('cyclone')) return 'STORM';

    if (c.includes('volcano')) return 'VOLC';

    if (c.includes('ice')) return 'ICE';

    if (c.includes('dust') || c.includes('haze')) return 'DUST';

    if (c.includes('flood')) return 'FLOOD';

    if (c.includes('landslide')) return 'SLIDE';

    return 'EVENT';

  }

  function eventColor(category) {

    const c = String(category || '').toLowerCase();

    if (c.includes('wildfire') || c.includes('fire')) return '#ff453a';

    if (c.includes('earthquake')) return '#bf5af2';

    if (c.includes('storm') || c.includes('cyclone')) return '#64d2ff';

    if (c.includes('volcano')) return '#ff9f0a';

    if (c.includes('ice')) return '#5ac8fa';

    if (c.includes('dust') || c.includes('haze')) return '#ffd60a';

    if (c.includes('flood')) return '#30d158';

    return '#bf5af2';

  }

  function eventCoordFromGeometry(geometry) {

    const g = Array.isArray(geometry) && geometry.length ? geometry[geometry.length - 1] : null;

    const coords = g?.coordinates;

    if (!Array.isArray(coords)) return null;

    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {

      return { lng: Number(coords[0]), lat: Number(coords[1]), date: g.date };

    }

    const walk = (node) => {

      if (!Array.isArray(node)) return null;

      if (typeof node[0] === 'number' && typeof node[1] === 'number') return node;

      for (const child of node) {

        const found = walk(child);

        if (found) return found;

      }

      return null;

    };

    const first = walk(coords);

    return first ? { lng: Number(first[0]), lat: Number(first[1]), date: g.date } : null;

  }

  function parseEonetEvents(rows) {

    const list = Array.isArray(rows) ? rows : [];

    return list.map((ev) => {

      const coord = eventCoordFromGeometry(ev?.geometry);

      if (!coord || !Number.isFinite(coord.lat) || !Number.isFinite(coord.lng)) return null;

      const category = String((ev?.categories || [])[0]?.title || 'Natural event');

      const title = String(ev?.title || 'Earth event').trim();

      const source = String((ev?.sources || [])[0]?.id || (ev?.sources || [])[0]?.title || 'NASA EONET').trim();

      return {

        id: String(ev?.id || title),

        name: title,

        label: `${category} · ${title}`,

        category,

        source,

        lat: coord.lat,

        lng: coord.lng,

        date: coord.date || ev?.updated || ev?.closed || '',

        color: eventColor(category),

        text: eventGlyph(category),

        labelSize: 0.42,

        alt: 0.014,

        type: 'event',

      };

    }).filter(Boolean).slice(0, 70);

  }

  function parseGdacsEvents(features) {

    const categoryMap = {

      EQ: 'Earthquakes',

      TC: 'Severe Storms',

      FL: 'Floods',

      VO: 'Volcanoes',

      WF: 'Wildfires',

      DR: 'Drought',

    };

    const list = Array.isArray(features) ? features : [];

    return list.map((feat) => {

      const props = feat?.properties || {};

      const coords = Array.isArray(feat?.geometry?.coordinates)

        ? feat.geometry.coordinates

        : (Array.isArray(feat?.bbox) ? feat.bbox.slice(0, 2) : null);

      if (!Array.isArray(coords) || coords.length < 2) return null;

      const lng = Number(coords[0]);

      const lat = Number(coords[1]);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

      const eventType = String(props.eventtype || 'Event').trim();

      const category = categoryMap[eventType] || eventType;

      const name = String(props.name || props.description || 'GDACS event').trim();

      return {

        id: `gdacs-${eventType}-${props.eventid || name}-${props.episodeid || ''}`,

        name,

        label: `${category} · ${name}`,

        category,

        source: 'GDACS',

        lat,

        lng,

        date: props.fromdate || props.datemodified || '',

        color: eventColor(category),

        text: eventGlyph(category),

        labelSize: 0.42,

        alt: 0.014,

        type: 'event',

      };

    }).filter(Boolean).slice(0, 70);

  }

  async function fetchEarthEvents() {

    const cached = readEventCache();

    if (cached && Date.now() - Number(cached.savedAt || 0) < EONET_CACHE_TTL_MS) {

      return cached.events;

    }

    try {

      const res = await fetchWithTimeout('https://www.gdacs.org/gdacsapi/api/Events/geteventlist/EVENTS4APP', {}, 12000);

      if (res.ok) {

        const data = await res.json();

        const events = parseGdacsEvents(data?.features);

        if (events.length) {

          writeEventCache({ events });

          return events;

        }

      }

    } catch (gdacsErr) {}

    try {

      const res = await fetchWithTimeout('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=70&days=30', {}, 12000);

      if (!res.ok) throw new Error('eonet ' + res.status);

      const data = await res.json();

      const events = parseEonetEvents(data?.events);

      if (!events.length) throw new Error('eonet empty');

      writeEventCache({ events });

      return events;

    } catch (e) {

      try {

        const data = await fetchGodModeProxy('/god-mode/events', 12000);

        const events = parseEonetEvents(data?.events);

        if (events.length) {

          writeEventCache({ events });

          return events;

        }

      } catch (proxyErr) {}

      if (cached?.events?.length) return cached.events;

      throw e;

    }

  }

  function shipTypeColor(shipType, sog) {

    const t = Number(shipType);

    let hex = '#64d2ff';

    if (Number.isFinite(t)) {

      if (t === 35) hex = '#ff9f0a';

      else if (t >= 80 && t < 90) hex = '#ff453a';

      else if (t >= 70 && t < 80) hex = '#ffd60a';

      else if (t >= 60 && t < 70) hex = '#64d2ff';

      else if (t >= 50 && t < 60) hex = '#bf5af2';

      else if (t >= 40 && t < 50) hex = '#ff5e6c';

      else if (t >= 30 && t < 40) hex = '#34c759';

      else hex = '#8b96a8';

    }

    const speed = Number(sog);

    if (Number.isFinite(speed) && speed < 0.4) {

      return hex;

    }

    return hex;

  }

  function shipTypeLabel(shipType) {

    const t = Number(shipType);

    if (!Number.isFinite(t)) return 'Vessel';

    if (t === 35) return 'Military';

    if (t >= 80 && t < 90) return 'Tanker';

    if (t >= 70 && t < 80) return 'Cargo';

    if (t >= 60 && t < 70) return 'Passenger';

    if (t === 52) return 'Tug';

    if (t === 51) return 'SAR';

    if (t === 50) return 'Pilot';

    if (t >= 50 && t < 60) return 'Special';

    if (t >= 40 && t < 50) return 'High speed';

    if (t === 30) return 'Fishing';

    if (t === 36) return 'Sailing';

    if (t === 37) return 'Pleasure';

    return 'Type ' + t;

  }

  function validLatLng(lat, lng, allowZeroZero) {

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;

    if (!allowZeroZero && lat === 0 && lng === 0) return false;

    return true;

  }

  function makeShipRow(opts) {

    const lat = Number(opts.lat);

    const lng = Number(opts.lng);

    if (!validLatLng(lat, lng)) return null;

    const mmsi = String(opts.mmsi || '').trim();

    if (!mmsi) return null;

    let heading = Number(opts.heading);

    if (!Number.isFinite(heading) || heading < 0 || heading >= 360) heading = Number(opts.cog);

    if (!Number.isFinite(heading) || heading < 0 || heading >= 360) heading = 0;

    const sog = Number(opts.sog);

    const cog = Number(opts.cog);

    const shipType = Number(opts.shipType);

    const name = String(opts.name || '').trim() || ('MMSI ' + mmsi);

    return {

      lat, lng, altM: 0,

      id: 'ship-' + mmsi,

      type: 'ship',

      mmsi, name, label: name,

      callsign: String(opts.callsign || '').trim(),

      dest: String(opts.dest || opts.destination || '').trim(),

      sog: Number.isFinite(sog) ? sog : null,

      cog: Number.isFinite(cog) && cog <= 360 ? cog : null,

      heading,

      shipType: Number.isFinite(shipType) ? shipType : null,

      shipClass: shipTypeLabel(shipType),

      color: shipTypeColor(shipType, sog),

      source: opts.source || 'AIS',

      imo: opts.imo || '',

    };

  }

  function parseDigitrafficLocations(fc, metaByMmsi) {

    const features = Array.isArray(fc?.features) ? fc.features : [];

    const out = [];

    for (let i = 0; i < features.length; i++) {

      const f = features[i];

      const coords = f?.geometry?.coordinates;

      if (!Array.isArray(coords) || coords.length < 2) continue;

      const p = f.properties || {};

      const mmsi = String(f.mmsi || p.mmsi || '').trim();

      const meta = (metaByMmsi && metaByMmsi.get(mmsi)) || {};

      const row = makeShipRow({

        lat: Number(coords[1]), lng: Number(coords[0]),

        mmsi, sog: p.sog, cog: p.cog, heading: p.heading,

        name: meta.name, callsign: meta.callSign, dest: meta.destination,

        shipType: meta.shipType, imo: meta.imo,

        source: 'Digitraffic AIS (Baltic)',

      });

      if (row) out.push(row);

    }

    return out;

  }

  function parseShipArray(list, source) {

    const rows = Array.isArray(list) ? list : [];

    const out = [];

    for (let i = 0; i < rows.length; i++) {

      const s = rows[i];

      if (!s || typeof s !== 'object') continue;

      const coords = s.geometry?.coordinates;

      const lat = Number(s.lat ?? s.latitude ?? s.LAT ?? (Array.isArray(coords) ? coords[1] : NaN));

      const lng = Number(s.lng ?? s.lon ?? s.longitude ?? s.LON ?? (Array.isArray(coords) ? coords[0] : NaN));

      const p = s.properties || s;

      const row = makeShipRow({

        lat, lng,

        mmsi: p.mmsi || s.mmsi || s.MMSI,

        sog: p.sog ?? p.speed ?? s.sog, cog: p.cog ?? s.cog, heading: p.heading ?? p.hdg ?? s.heading,

        name: p.name || s.name || s.shipname, callsign: p.callSign || p.callsign || s.callsign,

        dest: p.destination || p.dest || s.destination, shipType: p.shipType || p.shiptype || s.shiptype,

        imo: p.imo || s.imo, source: source || 'AIS proxy',

      });

      if (row) out.push(row);

    }

    return out;

  }

  function capShips(rows) {

    const arr = Array.isArray(rows) ? rows.slice() : [];

    arr.sort((a, b) => (Number(b.sog) || 0) - (Number(a.sog) || 0));

    if (arr.length <= MAX_SHIP_POINTS) return arr;

    return arr.slice(0, MAX_SHIP_POINTS);

  }

  async function fetchDigitrafficMeta() {

    try {

      const raw = JSON.parse(global.localStorage.getItem(SHIP_META_CACHE_KEY) || 'null');

      if (raw?.map && Date.now() - Number(raw.savedAt || 0) < SHIP_META_TTL_MS) {

        return new Map(raw.map);

      }

    } catch (e) {}

    const res = await fetchWithTimeout('https://meri.digitraffic.fi/api/ais/v1/vessels', {

      headers: {

        Accept: 'application/geo+json, application/json;q=0.9, */*;q=0.8',

        'Digitraffic-User': 'UNALIGNED/GodMode 2.0',

      },

    }, 18000);

    if (!res.ok) throw new Error('digitraffic vessels ' + res.status);

    const list = await res.json();

    const map = new Map();

    (Array.isArray(list) ? list : []).forEach((v) => {

      const mmsi = String(v?.mmsi || '').trim();

      if (mmsi) map.set(mmsi, v);

    });

    try {

      global.localStorage.setItem(SHIP_META_CACHE_KEY, JSON.stringify({

        savedAt: Date.now(), map: [...map.entries()],

      }));

    } catch (e) {}

    return map;

  }

  async function fetchDigitrafficShips() {

    const [locRes, meta] = await Promise.all([

      fetchWithTimeout('https://meri.digitraffic.fi/api/ais/v1/locations', {

        headers: {

          Accept: 'application/geo+json, application/json;q=0.9, */*;q=0.8',

          'Digitraffic-User': 'UNALIGNED/GodMode 2.0',

        },

      }, 18000),

      fetchDigitrafficMeta().catch(() => new Map()),

    ]);

    if (!locRes.ok) throw new Error('digitraffic locations ' + locRes.status);

    const fc = await locRes.json();

    const rows = capShips(parseDigitrafficLocations(fc, meta));

    return { rows, source: 'Digitraffic AIS (Baltic / Finnish waters)', count: rows.length, raw: (fc?.features || []).length };

  }

  function metaMapFromVessels(list) {

    const map = new Map();

    (Array.isArray(list) ? list : []).forEach((v) => {

      const mmsi = String(v?.mmsi || v?.MMSI || '').trim();

      if (mmsi) map.set(mmsi, v);

    });

    return map;

  }

  async function fetchShipsFromProxy() {

    const paths = ['/god-mode/ships', '/god-mode/ais', '/god-mode/vessels'];

    let lastErr = null;

    for (let i = 0; i < paths.length; i++) {

      try {

        const data = await fetchGodModeProxy(paths[i], 20000);

        if (!data || data.ok === false) {

          lastErr = new Error(paths[i] + ' ' + (data && data.error || 'failed'));

          continue;

        }

        const loc = (data.locations && (data.locations.features || data.locations.type === 'FeatureCollection'))

          ? data.locations

          : ((data.type === 'FeatureCollection' || Array.isArray(data.features)) ? data : null);

        const meta = metaMapFromVessels(data.vessels || data.ships);

        if (loc) {

          const rows = capShips(parseDigitrafficLocations(loc, meta));

          if (rows.length) {

            return {

              rows,

              source: data.coverage || data.source || 'god-mode ships proxy',

              count: rows.length,

              raw: Number(data.count) || rows.length,

            };

          }

        }

        const list = data.ships || data.states || (Array.isArray(data) ? data : null);

        const rows = capShips(parseShipArray(list, 'god-mode ships proxy'));

        if (rows.length) return { rows, source: 'god-mode ships proxy', count: rows.length };

        lastErr = new Error(paths[i] + ' empty');

      } catch (e) { lastErr = e; }

    }

    throw lastErr || new Error('ships proxy failed');

  }

  function parseUsgsQuakes(fc) {

    return (Array.isArray(fc?.features) ? fc.features : []).map((f) => {

      const p = f?.properties || {};

      const c = f?.geometry?.coordinates;

      if (!Array.isArray(c) || c.length < 2) return null;

      const lng = Number(c[0]);

      const lat = Number(c[1]);

      if (!validLatLng(lat, lng)) return null;

      const mag = Number(p.mag);

      const place = String(p.place || 'Earthquake').trim();

      const magTxt = Number.isFinite(mag) ? mag.toFixed(1) : '?';

      return {

        id: 'usgs-' + String(f.id || p.code || p.ids || place),

        name: 'M' + magTxt + ' · ' + place,

        label: 'QUAKE · M' + magTxt + ' · ' + place,

        category: 'Earthquakes', source: 'USGS',

        lat, lng, altM: 0, mag,

        date: p.time ? new Date(p.time).toISOString() : (p.updated ? new Date(p.updated).toISOString() : ''),

        color: eventColor('earthquake'), text: 'QUAKE', type: 'event',

        pixelSize: Number.isFinite(mag) ? Math.max(8, Math.min(22, 6 + mag * 2.2)) : 10,

      };

    }).filter(Boolean);

  }

  async function fetchUsgsQuakes() {

    const res = await fetchWithTimeout(USGS_QUAKES_URL, { headers: { Accept: 'application/geo+json, application/json;q=0.9' } }, 12000);

    if (!res.ok) throw new Error('usgs ' + res.status);

    return parseUsgsQuakes(await res.json());

  }

  function el(type, props) {
    const kids = Array.prototype.slice.call(arguments, 2);
    return React.createElement.apply(React, [type, props || null].concat(kids));
  }

  function thinList(list, cap) {
    const arr = Array.isArray(list) ? list : [];
    const max = Math.max(1, Number(cap) || arr.length);
    if (arr.length <= max) return arr.slice();
    const step = arr.length / max;
    const outRows = [];
    for (let i = 0; i < max; i++) {
  const row = arr[Math.floor(i * step)];
  if (row) outRows.push(row);
    };
    return outRows;
  }

  function isNearSide(globe, lat, lng) {
    try {
  const cam = globe && globe.camera && globe.camera();
  if (!cam || !cam.position) return true;
  const phi = (90 - Number(lat)) * Math.PI / 180;
  const theta = (Number(lng) + 180) * Math.PI / 180;
  const x = -Math.sin(phi) * Math.cos(theta);
  const y = Math.cos(phi);
  const z = Math.sin(phi) * Math.sin(theta);
  const p = cam.position;
  return (p.x * x + p.y * y + p.z * z) > 0.04;
    } catch (e) {
  return true;
    }
  }

  async function fetchShips() {
    try {
  const proxied = await fetchShipsFromProxy();
  if (proxied && proxied.rows && proxied.rows.length) return proxied;
    } catch (e) {
  console.warn('[god-mode-phone] ships proxy unavailable', e);
    }
    return await fetchDigitrafficShips();
  }


  async function fetchGpsjam() {
    const empty = { date: '', rows: [], attribution: 'Data derived from ADS-B Exchange via gpsjam.org' };
    try {
      const data = await fetchGodModeProxy('/god-mode/gpsjam', 45000);
      if (!data || !data.ok || !Array.isArray(data.rows) || !data.rows.length) return empty;
      let toLatLng = null;
      try {
        const h3 = await loadH3Lib();
        toLatLng = h3CellToLatLngFn(h3);
      } catch (eH) { toLatLng = null; }
      if (typeof toLatLng !== 'function') return empty;
      const rows = [];
      for (let i = 0; i < data.rows.length && rows.length < GPSJAM_PHONE_CAP; i++) {
        const r = data.rows[i];
        const hx = String((r && r.hex) || '').trim();
        if (!hx) continue;
        let latlng = null;
        try { latlng = toLatLng(hx); } catch (eCell) { continue; }
        const lat = Number(Array.isArray(latlng) ? latlng[0] : latlng && latlng.lat);
        const lng = Number(Array.isArray(latlng) ? latlng[1] : (latlng && (latlng.lng != null ? latlng.lng : latlng.lon)));
        if (!validLatLng(lat, lng, true)) continue;
        const pct = Number(r.pct);
        if (jamBand(pct) !== 'high' && rows.length > 24) continue;
        rows.push({
          hex: hx, lat: lat, lng: lng, altM: 0, size: 0.07,
          pct: Number.isFinite(pct) ? pct : 0, band: jamBand(pct),
          id: 'jam-' + hx, type: 'gpsjam', color: jamColor(pct),
          name: 'GPS jam ' + (Number.isFinite(pct) ? pct.toFixed(1) : '?') + '%',
          label: 'JAM · ' + jamBand(pct).toUpperCase(),
          source: 'ADS-B Exchange via gpsjam.org',
        });
      }
      return { date: String(data.date || ''), rows: rows, attribution: data.attribution || empty.attribution };
    } catch (e) {
      return empty;
    }
  }

  function readDealGeoCache() {
    try { return JSON.parse(global.localStorage.getItem(DEAL_GEO_CACHE_KEY) || '{}') || {}; }
    catch (e) { return {}; }
  }
  async function geocodeDealCity(query, cache) {
    const key = String(query || '').toLowerCase();
    if (!key) return null;
    if (cache[key]) return cache[key].miss ? null : cache[key];
    const city = String(query).split(',')[0].trim();
    try {
      const known = typeof knownCityHit === 'function' ? knownCityHit(city) : null;
      if (known && Number.isFinite(known.lat) && Number.isFinite(known.lng)) {
        cache[key] = { lat: known.lat, lng: known.lng, name: known.name || city };
        try { global.localStorage.setItem(DEAL_GEO_CACHE_KEY, JSON.stringify(cache)); } catch (e) {}
        return cache[key];
      }
    } catch (eK) {}
    try {
      const res = await fetchWithTimeout(
        'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(city) + '&count=1&language=en&format=json',
        {}, 8000);
      if (res && res.ok) {
        const data = await res.json();
        const hit = Array.isArray(data && data.results) ? data.results[0] : null;
        if (hit && Number.isFinite(hit.latitude)) {
          cache[key] = { lat: hit.latitude, lng: hit.longitude, name: hit.name || city };
          try { global.localStorage.setItem(DEAL_GEO_CACHE_KEY, JSON.stringify(cache)); } catch (e) {}
          return cache[key];
        }
      }
    } catch (e) {}
    cache[key] = { miss: true };
    try { global.localStorage.setItem(DEAL_GEO_CACHE_KEY, JSON.stringify(cache)); } catch (e) {}
    return null;
  }
  function collectDealLeads(viewer) {
    const seen = {};
    const out = [];
    const pushAll = function (arr) {
      (Array.isArray(arr) ? arr : []).forEach(function (l) {
        if (!l) return;
        const id = String(l.id || l.leadId || l.brand || l.contactName || l.name || '') + '|' + String(l.location || l.loc || '');
        if (seen[id]) return;
        seen[id] = true;
        out.push(l);
      });
    };
    try { pushAll(global.V3 && global.V3.LEADS); } catch (e) {}
    try { pushAll(viewer && (viewer.leads || viewer.LEADS || viewer.deals)); } catch (e2) {}
    return out;
  }

  function leadToDealPoint(lead, geo) {
    const loc = String(lead.location || lead.loc || '').trim();
    const color = DEAL_STAGE_COLORS[String(lead.stage)] || lead.color || '#8e9dff';
    const name = lead.brand || lead.contactName || lead.name || 'Deal';
    return {
      lat: geo.lat, lng: geo.lng, altM: 0, size: 0.16,
      name: name, color: color, type: 'deal',
      id: 'deal-' + String(lead.id || name),
      stage: lead.stage, loc: loc, source: 'UNIFY deals',
      label: name + (loc ? ' · ' + loc : ''),
    };
  }

  async function fetchDealMarkers(viewer) {
    try {
      let leads = collectDealLeads(viewer);
      if (!leads.length) {
        try {
          const proxied = await fetchGodModeProxy('/god-mode/deals', 8000);
          if (proxied && proxied.ok !== false) {
            const pts = proxied.points || proxied.deals || proxied.rows || [];
            const ready = [];
            (Array.isArray(pts) ? pts : []).forEach(function (p) {
              if (!p) return;
              const lat = Number(p.lat);
              const lng = Number(p.lng != null ? p.lng : p.lon);
              if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
              ready.push({
                lat: lat, lng: lng, altM: 0, size: 0.16,
                name: p.name || p.brand || 'Deal', color: p.color || DEAL_STAGE_COLORS[String(p.stage)] || '#8e9dff',
                type: 'deal', id: 'deal-' + String(p.id || p.name || lat),
                stage: p.stage, loc: p.loc || p.location, source: 'UNIFY deals',
                label: p.label || p.name || 'Deal',
              });
            });
            if (ready.length) return ready;
            leads = proxied.leads || [];
          }
        } catch (eP) {}
      }
      const active = (leads || []).filter(function (l) {
        if (!l || l.isRobertBrief) return false;
        const stage = String(l.stage || '');
        const loc = String(l.location || l.loc || '').trim();
        const lat = Number(l.lat);
        const lng = Number(l.lng != null ? l.lng : l.lon);
        const hasGeo = Number.isFinite(lat) && Number.isFinite(lng);
        if (stage && DEAL_ACTIVE_STAGES.indexOf(stage) === -1 && !hasGeo) return false;
        return !!(loc || hasGeo);
      });
      const cache = readDealGeoCache();
      const slice = active.slice(0, 40);
      const points = [];
      for (let i = 0; i < slice.length; i++) {
        const lead = slice[i];
        let geo = null;
        const lat = Number(lead.lat);
        const lng = Number(lead.lng != null ? lead.lng : lead.lon);
        if (Number.isFinite(lat) && Number.isFinite(lng)) geo = { lat: lat, lng: lng };
        else {
          const loc = String(lead.location || lead.loc || '').trim();
          if (loc) geo = await geocodeDealCity(loc, cache).catch(function () { return null; });
        }
        if (!geo) continue;
        points.push(leadToDealPoint(lead, geo));
      }
      return points;
    } catch (e) {
      return [];
    }
  }

  async function loadFlights() {
    const rows = await fetchFlights();
    return thinList(rows, MAX_FLIGHTS);
  }

  async function loadStarlink() {
    await ensureStarlinkSatrecs();
    if (starlinkSatrecs && starlinkSatrecs.length > MAX_STARLINK) starlinkSatrecs = thinList(starlinkSatrecs, MAX_STARLINK);
    const points = propagateStarlinkPoints();
    if (!points.length) throw new Error('starlink empty');
    return { points: points, count: points.length, updatedAt: Date.now() };
  }

  async function loadEvents() {
    let quakes = [];
    try { quakes = await fetchUsgsQuakes(); } catch (e) {}
    let base = [];
    try { base = await fetchEarthEvents(); } catch (e) {}
    const seen = {};
    const merged = [];
    quakes.concat(base || []).forEach(function (row) {
  if (!row || seen[row.id] || merged.length >= MAX_EVENTS) return;
  seen[row.id] = true;
  merged.push(row);
    });
    if (!merged.length) throw new Error('no earth events');
    return merged.slice(0, MAX_EVENTS);
  }

  function fmtUtc(now) {
    const d = now instanceof Date ? now : new Date();
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    const ss = String(d.getUTCSeconds()).padStart(2, '0');
    return hh + ':' + mm + ':' + ss + ' UTC';
  }

  function typeLabel(item) {
    const t = item && item.type;
    if (t === 'weather') return 'Weather';
    if (t === 'flight') return 'Flight';
    if (t === 'satellite') return 'Satellite';
    if (t === 'starlink') return 'Starlink';
    if (t === 'ship') return 'Ship';
    if (t === 'event') return item.category || 'Event';
    if (t === 'launch') return 'Launch';
    if (t === 'deal') return 'Deal';
    if (t === 'gpsjam') return 'GPS jam';
    if (t === 'place') return 'Place';
    return 'Point';
  }

  function oneStat(item) {
    if (!item) return '';
    if (item.type === 'weather') {
  const bits = [];
  if (item.temp != null) bits.push(item.temp + ' F');
  if (item.condition) bits.push(item.condition);
  return bits.join(' · ') || 'Live city weather';
    }
    if (item.type === 'flight') {
  const fb = [];
  if (item.altitudeFt != null) fb.push(item.altitudeFt.toLocaleString() + ' ft');
  if (item.speedKts != null) fb.push(item.speedKts + ' kt');
  return fb.join(' · ') || item.country || 'Live flight';
    }
    if (item.type === 'ship') {
  const sb = [];
  if (item.sog != null) sb.push(Math.round(item.sog) + ' kn');
  if (item.shipClass) sb.push(item.shipClass);
  return sb.join(' · ') || 'Live AIS';
    }
    if (item.type === 'event') {
  if (item.mag != null) return 'M' + Number(item.mag).toFixed(1) + (item.source ? ' · ' + item.source : '');
  return item.source || item.category || 'Live event';
    }
    if (item.type === 'launch') return fmtLaunchWhen(item.when);
    if (item.type === 'deal') return item.stage ? String(item.stage).replace(/-/g, ' ') : (item.loc || 'Deal');
    if (item.type === 'gpsjam') return item.label || item.name || 'GPS jam';
    if (item.type === 'satellite') return 'Live position';
    if (item.type === 'starlink') return 'On orbit';
    if (item.type === 'place') {
      const lat = Number(item.lat);
      const lng = Number(item.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        const ns = lat >= 0 ? 'N' : 'S';
        const ew = lng >= 0 ? 'E' : 'W';
        return Math.abs(lat).toFixed(3) + '\u00b0' + ns + ' ' + Math.abs(lng).toFixed(3) + '\u00b0' + ew;
      }
    }
    return '';
  }

  function dockLayerIcon(id, filled) {
    const common = 'viewBox="0 0 24 24" width="22" height="22" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    const stroke = filled
      ? 'fill="currentColor" stroke="currentColor" stroke-width="1.4"'
      : 'fill="none" stroke="currentColor" stroke-width="1.85"';
    const icons = {
      all: '<svg ' + common + ' ' + stroke + '><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.4 2.6 3.6 5.6 3.6 9s-1.2 6.4-3.6 9"/><path d="M12 3c-2.4 2.6-3.6 5.6-3.6 9s1.2 6.4 3.6 9"/></svg>',
      weather: '<svg ' + common + ' ' + stroke + '><path d="M7.4 18h9.2a3.8 3.8 0 0 0 .5-7.6 5.8 5.8 0 0 0-11.1-1.6A3.4 3.4 0 0 0 7.4 18z"/></svg>',
      flights: '<svg ' + common + ' ' + stroke + '><path d="M21 15.5v-1.6l-8-5V4.4a1.5 1.5 0 0 0-3 0v4.5l-8 5v1.6l8-2.5V19l-2 1.4V22l3.5-1 3.5 1v-1.6L13 19v-6l8 2.5z"/></svg>',
      satellites: '<svg ' + common + ' ' + stroke + '><rect x="9.2" y="9.2" width="5.6" height="5.6" rx="1" transform="rotate(45 12 12)"/><path d="M7 7l2.6 2.6M17 17l-2.6-2.6M7 17l2.6-2.6M17 7l-2.6 2.6"/><path d="M15.2 8.8l3.6-3.6M8.8 15.2l-3.6 3.6"/></svg>',
      ships: '<svg ' + common + ' fill="none" stroke="currentColor" stroke-width="1.85"><path d="M3 16.4l2.4 3.4h13.2L21 16.4H3z"/><path d="M8 16.4V12h8v4.4"/><path d="M13 12V8.2h3.2V12"/><path d="M10 8v8.4"/></svg>',
      events: '<svg ' + common + ' ' + stroke + '><path d="M13 2L5 13.5h6.2L10 22l8-11.5h-6.2L13 2z"/></svg>'
    };
    return icons[id] || icons.all;
  }

  const PHONE_CSS = [
    '.v4-gm-phone{position:fixed;inset:0;z-index:12000;background:#05070c;color:#e8edf5;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;overflow:hidden;touch-action:none;overscroll-behavior:none;-webkit-user-select:none;user-select:none;}',
    'html.v4-godmode-phone,html.v4-godmode-phone body,body.v4-godmode-phone{touch-action:none;overscroll-behavior:none;overflow:hidden;height:100%;}',
    'body.v4-godmode-phone .hd,body.v4-godmode-phone .v6-gnav,body.v4-godmode-phone .mobile-nav-layer{visibility:hidden!important;pointer-events:none!important;}',
    '.v4-gm-phone-globe,.v4-gm-phone-globe>div,.v4-gm-phone-globe canvas{position:absolute;inset:0;z-index:0!important;touch-action:none;pointer-events:auto;-webkit-user-select:none;user-select:none;transform:none;-webkit-transform:none;}',
    '.v4-gm-phone-globe canvas{display:block;width:100%!important;height:100%!important;touch-action:none;pointer-events:auto;}',
    '.v4-gm-phone.is-street .v4-gm-phone-globe{visibility:hidden;pointer-events:none;}',
    '.v4-gm-phone.is-street .v4-gm-phone-globe canvas{display:none!important;}',
    '.v4-gm-phone-top{position:absolute;top:env(safe-area-inset-top,0px);left:env(safe-area-inset-left,0px);right:env(safe-area-inset-right,0px);z-index:12;isolation:isolate;transform:translateZ(0);-webkit-transform:translateZ(0);display:flex;align-items:center;justify-content:space-between;padding:8px 10px;pointer-events:none;}',
    '.v4-gm-phone-live{display:flex;align-items:center;gap:8px;background:#0b0d12;border:1px solid rgba(255,255,255,.22);border-radius:999px;padding:7px 12px;font-size:12px;letter-spacing:.08em;font-weight:700;color:#f2f5fa;pointer-events:none;}',
    '.v4-gm-phone-dot{width:7px;height:7px;border-radius:50%;background:#34c759;box-shadow:0 0 8px #34c759;}',
    '.v4-gm-phone-utc{opacity:.9;font-variant-numeric:tabular-nums;letter-spacing:.04em;pointer-events:none;}',
    '.v4-gm-phone-close{pointer-events:auto;touch-action:manipulation;-webkit-tap-highlight-color:transparent;min-width:44px;min-height:44px;width:44px;height:44px;border:1px solid rgba(255,255,255,.22);border-radius:50%;background:#0b0d12;color:#fff;font-size:22px;line-height:1;}',
    '.v4-gm-phone-err{position:absolute;top:calc(env(safe-area-inset-top,0px) + 64px);left:12px;right:12px;z-index:2;pointer-events:none;text-align:center;padding:8px 12px;background:#1a0c0c;border:1px solid rgba(255,80,80,.45);border-radius:10px;color:#ffd0d0;font-size:13px;font-weight:600;}',
    '.v4-gm-phone-sheet{position:absolute;left:0;right:0;bottom:0;z-index:5;isolation:isolate;transform:translateZ(0);-webkit-transform:translateZ(0);pointer-events:none;background:transparent;padding:0;padding-bottom:env(safe-area-inset-bottom,0px);}',
    '.v4-gm-phone-dock{pointer-events:none;padding:0;}',
    '.v4-gm-phone-dock-inner{pointer-events:auto;display:flex;align-items:center;justify-content:space-around;gap:2px;margin:0 18px 0;padding:6px 8px;border-radius:28px;border:1px solid rgba(255,255,255,0.1);border-top-color:rgba(255,255,255,0.16);background:rgba(18,20,26,0.82);backdrop-filter:saturate(1.4) blur(22px);-webkit-backdrop-filter:saturate(1.4) blur(22px);box-shadow:0 1px 0 rgba(255,255,255,0.08) inset,0 22px 52px rgba(0,0,0,0.55),0 8px 20px rgba(0,0,0,0.28);}',
    '.v4-gm-phone-dock-item{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;min-height:44px;min-width:44px;padding:6px 8px;border:0;border-radius:999px;background:transparent;color:rgba(232,237,245,0.55);appearance:none;-webkit-appearance:none;font:inherit;cursor:pointer;pointer-events:auto;touch-action:manipulation;-webkit-tap-highlight-color:transparent;transition:color .18s cubic-bezier(.2,.8,.2,1),background .18s cubic-bezier(.2,.8,.2,1),transform .18s cubic-bezier(.22,1.4,.36,1);}',
    '.v4-gm-phone-dock-item:active{transform:scale(0.96);}',
    '.v4-gm-phone-dock-ico{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;color:inherit;}',
    '.v4-gm-phone-dock-ico svg{display:block;width:22px;height:22px;}',
    '.v4-gm-phone-dock-label{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;}',
    '.v4-gm-phone-dock-item.is-on{background:rgba(232,237,245,0.16);color:#e8edf5;border-radius:999px;padding:6px 12px;flex-direction:column;gap:1px;min-width:64px;transform:translateY(-1px);}',
    '.v4-gm-phone-dock-item.is-on:active{transform:translateY(-1px) scale(0.96);}',
    '.v4-gm-phone-dock-item.is-on .v4-gm-phone-dock-label{position:static;width:auto;height:auto;overflow:visible;clip:auto;font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;line-height:1.1;}',
    '.v4-gm-phone-dock-item.is-on .v4-gm-phone-dock-ico svg{fill:currentColor;stroke:currentColor;}',
    '.v4-gm-phone-card{margin:0 12px 10px;padding:14px 16px;border-radius:16px;background:#121826;border:1px solid rgba(255,255,255,.14);pointer-events:auto;}',
    '.v4-gm-phone-card-name{font-size:16px;font-weight:700;line-height:1.25;color:#f2f5fa;}',
    '.v4-gm-phone-card-type{font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.7;margin-top:3px;}',
    '.v4-gm-phone-card-stat{font-size:14px;margin-top:6px;opacity:.95;}',
    '.v4-gm-phone-hint{padding:0 16px 8px;font-size:11px;opacity:.7;color:#e8edf5;pointer-events:none;}',
    '.v4-gm-phone-search{position:absolute;top:calc(env(safe-area-inset-top,0px) + 64px);left:10px;right:10px;z-index:12;display:flex;gap:8px;pointer-events:none;}',
    '.v4-gm-phone-search input{flex:1;min-height:44px;border-radius:12px;border:1px solid rgba(255,255,255,.22);background:rgba(11,13,18,.94);color:#f2f5fa;font-size:16px;padding:0 12px;outline:none;pointer-events:auto;}',
    '.v4-gm-phone-search-go,.v4-gm-phone-sv,.v4-gm-phone-search-clear{min-height:44px;min-width:44px;padding:0 12px;border-radius:12px;border:1px solid rgba(255,255,255,.22);background:#161c28;color:#f2f5fa;font-size:13px;font-weight:700;touch-action:manipulation;pointer-events:auto;}',
    '.v4-gm-phone-search-clear{min-width:40px;padding:0 8px;font-size:18px;line-height:1;}',
    '.v4-gm-phone-sv-card{margin-top:10px;min-height:44px;width:100%;border-radius:12px;border:1px solid rgba(255,255,255,.22);background:#e8edf5;color:#0b0d12;font-size:14px;font-weight:700;touch-action:manipulation;}',
    '.v4-gm-phone-back{pointer-events:auto;touch-action:manipulation;-webkit-tap-highlight-color:transparent;min-height:44px;padding:0 14px;border-radius:12px;border:1px solid rgba(255,255,255,.22);background:#e8edf5;color:#0b0d12;font-size:13px;font-weight:700;}',
    '.v4-gm-phone-globe .cesium-viewer,.v4-gm-phone-globe .cesium-viewer-cesiumWidgetContainer,.v4-gm-phone-globe .cesium-widget,.v4-gm-phone-globe .cesium-widget canvas,.v4-gm-phone-cesium{position:absolute;inset:0;width:100%!important;height:100%!important;touch-action:none;pointer-events:auto;}',
    '.v4-gm-phone-globe .cesium-viewer-toolbar,.v4-gm-phone-globe .cesium-viewer-animationContainer,.v4-gm-phone-globe .cesium-viewer-timelineContainer,.v4-gm-phone-globe .cesium-viewer-fullscreenContainer{display:none!important;}',
    '.v4-gm-phone-suggest{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:4;max-height:240px;overflow:auto;background:rgba(11,13,18,.96);border:1px solid rgba(255,255,255,.22);border-radius:12px;pointer-events:auto;}',
    '.v4-gm-phone-suggest button{display:block;width:100%;text-align:left;appearance:none;border:0;background:transparent;color:#f2f5fa;padding:10px 12px;font:inherit;pointer-events:auto;}',
    '.v4-gm-phone-suggest button.is-active,.v4-gm-phone-suggest button:hover{background:rgba(232,237,245,.12);}',
    '.v4-gm-phone-suggest-name{display:block;font-size:14px;font-weight:600;}',
    '.v4-gm-phone-suggest-sub{display:block;font-size:11px;opacity:.7;margin-top:2px;}',
    '.v4-gm-phone-search-msg{padding:6px 16px 0;font-size:12px;opacity:.75;}',
    '.v4-gm-phone-extra{pointer-events:auto;display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin:0 12px 16px;position:relative;z-index:7;}',
    '.v4-gm-phone-chip{min-height:36px;min-width:44px;padding:0 12px;border-radius:999px;border:1px solid rgba(255,255,255,.18);background:rgba(18,20,26,.88);color:#e8edf5;font-size:12px;font-weight:700;letter-spacing:.04em;pointer-events:auto;touch-action:manipulation;-webkit-tap-highlight-color:transparent;}',
    '.v4-gm-phone-chip.is-on{background:rgba(232,237,245,.18);border-color:rgba(255,255,255,.4);color:#fff;}',
    '.v4-gm-phone-chip.is-empty{border-color:rgba(255,214,10,.5);color:#ffd60a;}',
    '.v4-gm-phone-settings{position:relative;z-index:14;isolation:isolate;transform:translateZ(0);pointer-events:auto;margin:0 12px 16px;min-height:88px;max-height:min(52vh,420px);overflow:auto;background:rgba(11,13,18,.96);border:1px solid rgba(255,255,255,.22);border-radius:16px;box-shadow:0 18px 40px rgba(0,0,0,.55);}',
    '.v4-gm-phone-settings-row{display:flex;align-items:center;justify-content:space-between;min-height:44px;width:100%;padding:0 16px;border:0;border-bottom:1px solid rgba(255,255,255,.08);background:transparent;color:#e8edf5;font:inherit;font-size:15px;font-weight:600;text-align:left;pointer-events:auto;touch-action:manipulation;-webkit-tap-highlight-color:transparent;}',
    '.v4-gm-phone-settings-row:last-child{border-bottom:0;}',
    '.v4-gm-phone-settings-row.is-on{background:rgba(232,237,245,.12);}',
    '.v4-gm-phone-settings-title{padding:12px 16px 8px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;opacity:.7;font-weight:700;}','.v4-gm-phone-settings-mark{font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.7;}',
    '.v4-gm-phone-pano{position:absolute;inset:0;z-index:8;background:#0b0d12;display:none;}',
    '.v4-gm-phone-pano.is-on{display:block;}',
    '.v4-gm-phone-pano-inner,.v4-gm-phone-pano iframe,.v4-gm-phone-pano img{position:absolute;inset:0;width:100%;height:100%;border:0;object-fit:cover;}',
    '.v4-gm-phone-pano-miss{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);color:#e8edf5;text-align:center;padding:16px;letter-spacing:.08em;}',
    '.v4-gm-phone-pano-turn{position:absolute;top:50%;z-index:9;width:44px;height:44px;margin-top:-22px;border-radius:50%;border:1px solid rgba(255,255,255,.22);background:rgba(11,13,18,.82);color:#f2f5fa;font-size:22px;line-height:1;pointer-events:auto;touch-action:manipulation;}',
    '.v4-gm-phone-pano-turn.is-left{left:10px;}',
    '.v4-gm-phone-pano-turn.is-right{right:10px;}',
    '.v4-gm-phone-search{z-index:12;}',
    '.v4-gm-phone-suggest{z-index:13;}',
  ].join('');
  function injectPhoneCss() {
    let style = document.getElementById('v4-gm-phone-css');
    if (!style) {
      style = document.createElement('style');
      style.id = 'v4-gm-phone-css';
      document.head.appendChild(style);
    }
    style.textContent = PHONE_CSS;
  }
  var TAP_GUARD_MS = 450;
  var tapGuardAt = 0;
  function bindTap(fn) {
    return {
      onPointerUp: function (e) {
        if (e && e.pointerType === 'mouse' && e.button != null && e.button !== 0) return;
        if (e && e.preventDefault) e.preventDefault();
        if (e && e.stopPropagation) e.stopPropagation();
        var now = Date.now();
        if (now - tapGuardAt < TAP_GUARD_MS) return;
        tapGuardAt = now;
        fn();
      },
      onClick: function (e) {
        if (e && e.preventDefault) e.preventDefault();
        if (e && e.stopPropagation) e.stopPropagation();
        var now = Date.now();
        if (now - tapGuardAt < TAP_GUARD_MS) return;
        tapGuardAt = now;
        fn();
      }
    };
  }
  var STREET_PANO_TIMEOUT_MS = 14000;
  var phoneStreetState = { gen: 0, timer: 0, el: null, pano: null, panoId: '', heading: 0 };

  function streetViewUrl(lat, lng) {
    const a = Number(lat);
    const b = Number(lng);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return '';
    return 'https://www.google.com/maps?layer=c&cbll=' + a.toFixed(6) + ',' + b.toFixed(6) + '&cbp=12,0,0,0,0&output=svembed';
  }
  function streetViewPanoUrl(pano) {
    const id = String(pano || '').trim();
    if (!id) return '';
    return 'https://www.google.com/maps?layer=c&panoid=' + encodeURIComponent(id) + '&output=svembed';
  }
  function staticStreetSrc(panoId, heading) {
    const key = (typeof readGoogleTilesKey === 'function' && readGoogleTilesKey()) || '';
    const id = String(panoId || '').trim();
    if (!id || !key) return '';
    const h = ((Number(heading) % 360) + 360) % 360;
    return 'https://maps.googleapis.com/maps/api/streetview?size=640x640&pano=' + encodeURIComponent(id) + '&heading=' + h + '&source=outdoor&return_error_code=true&key=' + encodeURIComponent(key);
  }
  function fetchOutdoorPanoId(lat, lng) {
    const key = (typeof readGoogleTilesKey === 'function' && readGoogleTilesKey()) || '';
    if (!key) return Promise.resolve('');
    const radii = [200, 500, 1200];
    const ask = function (i) {
      if (i >= radii.length) return Promise.resolve('');
      const u = 'https://maps.googleapis.com/maps/api/streetview/metadata?location=' + Number(lat) + ',' + Number(lng) + '&radius=' + radii[i] + '&source=outdoor&key=' + encodeURIComponent(key);
      return fetch(u).then(function (r) { return r.json(); }).then(function (j) {
        if (j && String(j.status) === 'OK' && j.pano_id) {
          const copy = String(j.copyright || '');
          const indoor = /workbox/i.test(copy) || (/company/i.test(copy) && !/google/i.test(copy));
          if (!indoor) return String(j.pano_id);
        }
        return ask(i + 1);
      }).catch(function () { return ask(i + 1); });
    };
    return ask(0);
  }
  function openStreetView(lat, lng) {
    try {
      if (typeof global.__gmPhoneStreetView === 'function') global.__gmPhoneStreetView(lat, lng);
    } catch (e) {}
  }
  function parseHouseNumber(q) {
    const m = String(q || "").trim().match(/^(\d+[A-Za-z]?)\b/);
    return m ? String(m[1]) : "";
  }

  function normHouse(h) {
    return String(h || "").trim().toUpperCase().replace(/^0+(?=\d)/, "");
  }

  function housesEqual(a, b) {
    const x = normHouse(a);
    const y = normHouse(b);
    return !!(x && y && x === y);
  }

  const US_STATE_MAP = {
    al: "Alabama", alabama: "Alabama", ak: "Alaska", alaska: "Alaska",
    az: "Arizona", arizona: "Arizona", ar: "Arkansas", arkansas: "Arkansas",
    ca: "California", california: "California", co: "Colorado", colorado: "Colorado",
    ct: "Connecticut", connecticut: "Connecticut", de: "Delaware", delaware: "Delaware",
    fl: "Florida", florida: "Florida", ga: "Georgia", georgia: "Georgia",
    hi: "Hawaii", hawaii: "Hawaii", id: "Idaho", idaho: "Idaho",
    il: "Illinois", illinois: "Illinois", in: "Indiana", indiana: "Indiana",
    ia: "Iowa", iowa: "Iowa", ks: "Kansas", kansas: "Kansas",
    ky: "Kentucky", kentucky: "Kentucky", la: "Louisiana", louisiana: "Louisiana",
    me: "Maine", maine: "Maine", md: "Maryland", maryland: "Maryland",
    ma: "Massachusetts", massachusetts: "Massachusetts", mi: "Michigan", michigan: "Michigan",
    mn: "Minnesota", minnesota: "Minnesota", ms: "Mississippi", mississippi: "Mississippi",
    mo: "Missouri", missouri: "Missouri", mt: "Montana", montana: "Montana",
    ne: "Nebraska", nebraska: "Nebraska", nv: "Nevada", nevada: "Nevada",
    nh: "New Hampshire", "new hampshire": "New Hampshire",
    nj: "New Jersey", "new jersey": "New Jersey",
    nm: "New Mexico", "new mexico": "New Mexico",
    ny: "New York", "new york": "New York",
    nc: "North Carolina", "north carolina": "North Carolina",
    nd: "North Dakota", "north dakota": "North Dakota",
    oh: "Ohio", ohio: "Ohio", ok: "Oklahoma", oklahoma: "Oklahoma",
    or: "Oregon", oregon: "Oregon", pa: "Pennsylvania", pennsylvania: "Pennsylvania",
    ri: "Rhode Island", "rhode island": "Rhode Island",
    sc: "South Carolina", "south carolina": "South Carolina",
    sd: "South Dakota", "south dakota": "South Dakota",
    tn: "Tennessee", tennessee: "Tennessee", tx: "Texas", texas: "Texas",
    ut: "Utah", utah: "Utah", vt: "Vermont", vermont: "Vermont",
    va: "Virginia", virginia: "Virginia", wa: "Washington", washington: "Washington",
    wv: "West Virginia", "west virginia": "West Virginia",
    wi: "Wisconsin", wisconsin: "Wisconsin", wy: "Wyoming", wyoming: "Wyoming",
    dc: "District of Columbia", "district of columbia": "District of Columbia",
  };
  const STREET_SUF_RE = /\b(ave(?:nue)?|blvd|boulevard|cir(?:cle)?|ct|court|dr(?:ive)?|hwy|highway|ln|lane|pkwy|parkway|pl(?:ace)?|rd|road|st(?:reet)?|ter(?:race)?|trl|trail|way|wy)\b/i;

  function looksUsQuery(q) {
    const s = String(q || "");
    if (/\b\d{5}(?:-\d{4})?\b/.test(s)) return true;
    if (/\b(united states|u\.?s\.?a\.?)\b/i.test(s)) return true;
    if (/\b(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming|district of columbia)\b/i.test(s)) return true;
    if (/\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/.test(s)) return true;
    return false;
  }

  function parseUsStreetQuery(q) {
    let s = String(q || "").replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
    if (!s) return null;
    s = s.replace(/\b(united states|u s a|usa|u s)\s*$/i, "").trim();
    const house = parseHouseNumber(s);
    const zipM = s.match(/\b(\d{5})(?:-\d{4})?\b/);
    const zip = zipM ? zipM[1] : "";
    if (zipM) s = (s.slice(0, zipM.index) + " " + s.slice(zipM.index + zipM[0].length)).replace(/\s+/g, " ").trim();
    const tokens = s.split(" ").filter(Boolean);
    let state = "";
    for (let n = 2; n >= 1; n--) {
      if (tokens.length < n) continue;
      const tail = tokens.slice(-n).join(" ").toLowerCase();
      if (US_STATE_MAP[tail]) {
        state = US_STATE_MAP[tail];
        tokens.splice(-n, n);
        break;
      }
    }
    s = tokens.join(" ");
    let street = "";
    let city = "";
    const suf = s.match(new RegExp("^(.+?\\b(?:ave(?:nue)?|blvd|boulevard|cir(?:cle)?|ct|court|dr(?:ive)?|hwy|highway|ln|lane|pkwy|parkway|pl(?:ace)?|rd|road|st(?:reet)?|ter(?:race)?|trl|trail|way|wy))\\b(.*)$", "i"));
    if (suf) {
      street = suf[1].trim();
      city = suf[2].trim();
    } else {
      street = s;
    }
    return { house: house, street: street, city: city, state: state, zip: zip };
  }

  function destMeters(lat, lng, bearingDeg, distM) {
    const rad = Math.PI / 180;
    const br = Number(bearingDeg) * rad;
    const north = Number(distM) * Math.cos(br);
    const east = Number(distM) * Math.sin(br);
    const dLat = north / 111320;
    const cosLat = Math.cos(Number(lat) * rad);
    const denom = 111320 * (Math.abs(cosLat) < 0.15 ? (cosLat < 0 ? -0.15 : 0.15) : cosLat);
    const dLng = east / denom;
    return { lat: Number(lat) + dLat, lng: Number(lng) + dLng };
  }

  function bearingDeg(lat1, lng1, lat2, lng2) {
    const p1 = Number(lat1) * Math.PI / 180;
    const p2 = Number(lat2) * Math.PI / 180;
    const dl = (Number(lng2) - Number(lng1)) * Math.PI / 180;
    const y = Math.sin(dl) * Math.cos(p2);
    const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function censusUrl(address) {
    return "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address="
      + encodeURIComponent(address) + "&benchmark=Public_AR_Current&format=json";
  }

  function censusLineAddress(comp, houseOverride) {
    comp = comp || {};
    const bits = [
      houseOverride != null ? String(houseOverride) : "",
      comp.preDirection, comp.preType, comp.preQualifier,
      comp.streetName, comp.suffixType, comp.suffixDirection, comp.suffixQualifier,
      comp.city, comp.state, comp.zip,
    ].map(function (x) { return String(x || "").trim(); }).filter(Boolean);
    return bits.join(" ");
  }

  async function fetchCensusJson(address) {
    const addr = String(address || "").trim();
    if (!addr) return null;
    const url = censusUrl(addr);
    try {
      const res = await fetchWithTimeout(url, { headers: { Accept: "application/json" } }, 8000);
      if (res && res.ok) return await res.json();
    } catch (e) {}
    try {
      if (typeof fetchGodModeProxy === "function") {
        const data = await fetchGodModeProxy("/god-mode/census-geocode?address=" + encodeURIComponent(addr), 10000);
        if (data && (data.result || data.addressMatches || Number.isFinite(Number(data.lat)))) return data;
      }
    } catch (e) {}
    return null;
  }


  function pickCensusMatch(data, wantHouse) {
    const matches = data && data.result && Array.isArray(data.result.addressMatches)
      ? data.result.addressMatches
      : (data && Array.isArray(data.addressMatches) ? data.addressMatches : []);
    if (!matches.length) return null;
    if (wantHouse) {
      for (let i = 0; i < matches.length; i++) {
        const matched = String((matches[i] && matches[i].matchedAddress) || "");
        const mHouse = (matched.match(/^(\d+)/) || [])[1] || "";
        if (housesEqual(mHouse, wantHouse)) return matches[i];
      }
    }
    return matches[0];
  }

  function censusPoint(match) {
    const coords = (match && match.coordinates) || {};
    const lat = Number(coords.y);
    const lng = Number(coords.x);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat: lat, lng: lng };
  }

  async function offsetCensusToParcel(match) {
    const pt = censusPoint(match);
    if (!pt) return null;
    const side = String(((match && match.tigerLine) || {}).side || "").toUpperCase();
    const comp = (match && match.addressComponents) || {};
    const fromA = String(comp.fromAddress || "").trim();
    const toA = String(comp.toAddress || "").trim();
    let heading = null;
    if (fromA && toA && fromA !== toA) {
      try {
        const pair = await Promise.all([
          fetchCensusJson(censusLineAddress(comp, fromA)),
          fetchCensusJson(censusLineAddress(comp, toA)),
        ]);
        const pa = censusPoint(pickCensusMatch(pair[0], fromA));
        const pb = censusPoint(pickCensusMatch(pair[1], toA));
        if (pa && pb) {
          const dx = pb.lng - pa.lng;
          const dy = pb.lat - pa.lat;
          if ((dx * dx + dy * dy) > 1e-14) heading = bearingDeg(pa.lat, pa.lng, pb.lat, pb.lng);
        }
      } catch (e) {}
    }
    if (heading == null || !side) return { lat: pt.lat, lng: pt.lng };
    const br = side === "R" ? ((heading + 90) % 360) : ((heading - 90 + 360) % 360);
    return destMeters(pt.lat, pt.lng, br, 20);
  }

  async function geocodeCensus(query, wantHouse) {
    const data = await fetchCensusJson(query);
    if (data && Number.isFinite(Number(data.lat)) && Number.isFinite(Number(data.lng))) {
      return { lat: Number(data.lat), lng: Number(data.lng), name: data.name || query, kind: "address", source: "census" };
    }
    const match = pickCensusMatch(data, wantHouse);
    if (!match) return null;
    let pt = null;
    try { pt = await offsetCensusToParcel(match); } catch (eOff) { pt = null; }
    if (!pt) pt = censusPoint(match);
    if (!pt) return null;
    return {
      lat: pt.lat,
      lng: pt.lng,
      name: String(match.matchedAddress || query),
      kind: "address",
      source: "census",
      house: parseHouseNumber(String(match.matchedAddress || query)) || wantHouse,
    };
  }


  function nominatimHeaders() {
    // Nominatim requires a valid User-Agent; browsers send one and forbid overriding it.
    return { Accept: "application/json" };
  }

  async function fetchNominatim(params) {
    const u = new URLSearchParams(Object.assign({ format: "jsonv2", addressdetails: "1", limit: "8" }, params || {}));
    const res = await fetchWithTimeout("https://nominatim.openstreetmap.org/search?" + u.toString(), { headers: nominatimHeaders() }, 8000);
    if (!res || !res.ok) return [];
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  }

  function geocodeKindFromNominatim(hit) {
    const t = String((hit && (hit.addresstype || hit.type)) || "").toLowerCase();
    const cls = String((hit && hit.class) || "").toLowerCase();
    const addr = (hit && hit.address) || {};
    if (addr.house_number || t === "house" || t === "building" || t === "residential" || cls === "building") return "address";
    if (cls === "highway" || t === "road" || t === "pedestrian" || t === "living_street") return "street";
    if (t === "city" || t === "town" || t === "village" || t === "hamlet" || t === "suburb" || t === "state" || t === "country" || t === "administrative" || t === "municipality") return "city";
    return "place";
  }

  function geocodeKindFromPhoton(props) {
    props = props || {};
    const osmKey = String(props.osm_key || "").toLowerCase();
    const osmVal = String(props.osm_value || "").toLowerCase();
    if (props.housenumber || osmKey === "building") return "address";
    if (osmKey === "highway") return props.housenumber ? "address" : "street";
    if (osmKey === "place" && /city|town|village|hamlet|state|country|county|municipality/.test(osmVal)) return "city";
    if (osmKey === "boundary") return "city";
    return props.street ? "street" : "place";
  }

  function pickNominatimHit(rows, q) {
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return null;
    const wantHouse = parseHouseNumber(q);
    let best = null;
    let bestRank = -1;
    const rank = wantHouse ? { address: 4, street: 3, place: 2, city: 1 } : { city: 10, place: 6, street: 2, address: 1 };
    for (let i = 0; i < list.length; i++) {
      const hit = list[i];
      const k = geocodeKindFromNominatim(hit);
      const hn = ((hit && hit.address) || {}).house_number;
      let r = rank[k] || 2;
      if (wantHouse) {
        if (housesEqual(hn, wantHouse)) r = 20;
        else if (k === "address" || k === "place") r = 8 + r;
        else if (k === "street") r = 3;
        else r = 1;
      }
      if (r > bestRank) { bestRank = r; best = hit; }
    }
    if (!best) return null;
    const lat = Number(best && best.lat);
    const lng = Number(best && best.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      lat: lat,
      lng: lng,
      name: String((best && (best.display_name || best.name)) || q),
      kind: geocodeKindFromNominatim(best),
      source: "nominatim",
      house: ((best.address) || {}).house_number || "",
    };
  }


  function pickPhotonHit(data, q) {
    const feats = data && data.features;
    if (!feats || !feats.length) return null;
    const wantHouse = parseHouseNumber(q);
    let best = null;
    let bestRank = -1;
    const rank = wantHouse ? { address: 4, street: 3, place: 2, city: 1 } : { city: 10, place: 6, street: 2, address: 1 };
    for (let i = 0; i < feats.length; i++) {
      const hit = feats[i];
      const coords = hit && hit.geometry && hit.geometry.coordinates;
      if (!coords || coords.length < 2) continue;
      const props = hit.properties || {};
      const kind = geocodeKindFromPhoton(props);
      let r = rank[kind] || 2;
      if (wantHouse) {
        if (housesEqual(props.housenumber, wantHouse)) r = 20;
        else if (kind === "address" || kind === "place") r = 8 + r;
        else if (kind === "street") r = 3;
        else r = 1;
      }
      if (r > bestRank) {
        bestRank = r;
        const name = props.name || props.street || q;
        const streetLine = props.housenumber && props.street ? (props.housenumber + " " + props.street) : name;
        const bits = [streetLine, props.city || props.town || props.village, props.state, props.country].filter(Boolean);
        best = { lat: Number(coords[1]), lng: Number(coords[0]), name: bits.join(", "), kind: kind, source: "photon", house: props.housenumber || "" };
      }
    }
    if (!best || !Number.isFinite(best.lat) || !Number.isFinite(best.lng)) return null;
    return best;
  }


  function googleLocationTypeRank(t) {
    const x = String(t || "").toUpperCase();
    if (x === "ROOFTOP") return 40;
    if (x === "RANGE_INTERPOLATED") return 20;
    if (x === "GEOMETRIC_CENTER") return 10;
    return 5;
  }

  function pickGoogleGeocode(data, q) {
    const results = data && Array.isArray(data.results) ? data.results : [];
    if (!results.length) return null;
    let best = null;
    let bestRank = -1;
    for (let i = 0; i < results.length; i++) {
      const row = results[i];
      const loc = row && row.geometry && row.geometry.location;
      if (!loc) continue;
      const lat = Number(loc.lat);
      const lng = Number(loc.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const lt = String((row.geometry && row.geometry.location_type) || "");
      const types = Array.isArray(row.types) ? row.types : [];
      let r = googleLocationTypeRank(lt);
      if (types.indexOf("street_address") >= 0 || types.indexOf("premise") >= 0 || types.indexOf("subpremise") >= 0) r += 5;
      if (r > bestRank) {
        bestRank = r;
        let kind = "address";
        if (types.indexOf("locality") >= 0 || types.indexOf("administrative_area_level_1") >= 0 || types.indexOf("country") >= 0) kind = "city";
        else if (types.indexOf("route") >= 0) kind = "street";
        best = { lat: lat, lng: lng, name: String(row.formatted_address || q), kind: kind, source: "google", locationType: lt };
      }
    }
    return best;
  }


  function settleTimeout(promise, ms, fallback) {
    return new Promise(function (resolve) {
      var done = false;
      var timer = global.setTimeout(function () {
        if (done) return;
        done = true;
        resolve(fallback);
      }, ms);
      Promise.resolve(promise).then(function (value) {
        if (done) return;
        done = true;
        global.clearTimeout(timer);
        resolve(value);
      }, function () {
        if (done) return;
        done = true;
        global.clearTimeout(timer);
        resolve(fallback);
      });
    });
  }

  function mapsJsReady() {
    try {
      const g = global.google && global.google.maps;
      return !!(g && g.StreetViewService && g.StreetViewPanorama);
    } catch (e) { return false; }
  }
  function ensureGoogleMapsJs() {
    if (mapsJsReady()) return Promise.resolve(true);
    const key = (typeof readGoogleTilesKey === "function" && readGoogleTilesKey()) || "";
    if (!key) return Promise.resolve(false);
    if (ensureGoogleMapsJs._p) return ensureGoogleMapsJs._p;
    ensureGoogleMapsJs._p = new Promise(function (resolve) {
      var settled = false;
      function finish(ok) {
        if (settled) return;
        settled = true;
        resolve(!!ok);
      }
      function afterLoad() {
        var g = global.google && global.google.maps;
        if (g && typeof g.importLibrary === "function") {
          Promise.all([g.importLibrary("streetView"), g.importLibrary("core")]).then(function (libs) {
            try {
              var sv = libs && libs[0];
              if (sv && sv.StreetViewService && !g.StreetViewService) g.StreetViewService = sv.StreetViewService;
              if (sv && sv.StreetViewPanorama && !g.StreetViewPanorama) g.StreetViewPanorama = sv.StreetViewPanorama;
            } catch (eImp) {}
            finish(mapsJsReady());
          }).catch(function () { finish(mapsJsReady()); });
          return;
        }
        finish(mapsJsReady());
      }
      global.__gmPhoneMapsReady = function () {
        try { delete global.__gmPhoneMapsReady; } catch (e) {}
        afterLoad();
      };
      var timer = global.setTimeout(function () { afterLoad(); }, 15000);
      const s = document.createElement("script");
      s.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(key) + "&callback=__gmPhoneMapsReady&v=weekly&loading=async";
      s.async = true;
      s.onerror = function () {
        global.clearTimeout(timer);
        finish(false);
      };
      document.head.appendChild(s);
    });
    return ensureGoogleMapsJs._p;
  }

  async function geocodeGoogleJs(query) {
    const q = String(query || "").trim();
    if (!q) return null;
    return settleTimeout((async function () {
    const ok = await ensureGoogleMapsJs();
    if (!ok) return null;
    return new Promise(function (resolve) {
      try {
        const geo = new global.google.maps.Geocoder();
        geo.geocode({ address: q }, function (results, status) {
          if (String(status) !== "OK" || !results || !results.length) return resolve(null);
          const mapped = [];
          for (let i = 0; i < results.length; i++) {
            const r = results[i];
            const loc = r && r.geometry && r.geometry.location;
            const lat = loc && (typeof loc.lat === "function" ? loc.lat() : loc.lat);
            const lng = loc && (typeof loc.lng === "function" ? loc.lng() : loc.lng);
            mapped.push({
              formatted_address: r.formatted_address,
              types: r.types,
              geometry: {
                location: { lat: lat, lng: lng },
                location_type: r.geometry && r.geometry.location_type,
              },
            });
          }
          resolve(pickGoogleGeocode({ results: mapped }, q));
        });
      } catch (e) { resolve(null); }
    });
    })(), 2500, null);
  }

  async function geocodeGoogle(query) {
    const q = String(query || "").trim();
    if (!q) return null;
    const key = (typeof readGoogleTilesKey === "function" && readGoogleTilesKey()) || "";
    const qs = "address=" + encodeURIComponent(q) + (key ? "&key=" + encodeURIComponent(key) : "");
    try {
      const res = await fetchWithTimeout("https://maps.googleapis.com/maps/api/geocode/json?" + qs, { headers: { Accept: "application/json" } }, 8000);
      if (res && res.ok) {
        const hit = pickGoogleGeocode(await res.json(), q);
        if (hit) return hit;
      }
    } catch (e) {}
    try {
      const hit = await geocodeGoogleJs(q);
      if (hit) return hit;
    } catch (e) {}
    try {
      if (typeof fetchGodModeProxy === "function") {
        const data = await fetchGodModeProxy("/god-mode/google-geocode?address=" + encodeURIComponent(q), 10000);
        const hit = pickGoogleGeocode(data, q);
        if (hit) return hit;
        if (data && Number.isFinite(Number(data.lat)) && Number.isFinite(Number(data.lng))) {
          return { lat: Number(data.lat), lng: Number(data.lng), name: data.name || q, kind: data.kind || "address", source: "google" };
        }
      }
    } catch (e) {}
    return null;
  }



  function knownCityCountry(name) {
    const n = String(name || "").toLowerCase().replace("são", "sao");
    const map = {
      stockholm: "Sweden", tokyo: "Japan", london: "United Kingdom", paris: "France",
      berlin: "Germany", dubai: "United Arab Emirates", mumbai: "India", singapore: "Singapore",
      seoul: "South Korea", sydney: "Australia", moscow: "Russia", cairo: "Egypt",
      lagos: "Nigeria", johannesburg: "South Africa", nairobi: "Kenya", beijing: "China",
      shanghai: "China", "hong kong": "China", bangkok: "Thailand", toronto: "Canada",
      "sao paulo": "Brazil", "mexico city": "Mexico", chicago: "United States",
      "new york": "United States", "los angeles": "United States"
    };
    return map[n] || "";
  }
  function dropConflictingUsTowns(rows, known) {
    if (!known) return rows || [];
    const country = knownCityCountry(known.name || known.title);
    const intl = country && country !== "United States";
    const usRe = /\b(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming)\b/;
    return (rows || []).filter(function (r) {
      if (!r || r.source === "known-city") return !!r;
      const blob = (String(r.sub || "") + " " + String(r.title || "") + " " + String(r.name || "")).toLowerCase();
      if (/\btexas\b|\btx\b|, tx\b/.test(blob)) return false;
      if (intl && usRe.test(blob) && !/sweden|japan|united kingdom|france|germany|sweden/.test(blob)) return false;
      return true;
    });
  }

  function knownCityHit(q) {
    const s = String(q || "").trim().toLowerCase().replace(/\s+/g, " ");
    if (!s) return null;
    const cities = [
      ['Tokyo', 35.68, 139.69], ['Chicago', 41.88, -87.63], ['London', 51.51, -0.13],
      ['Paris', 48.86, 2.35], ['New York', 40.71, -74.01], ['Los Angeles', 34.05, -118.24],
      ['Singapore', 1.35, 103.82], ['Seoul', 37.57, 126.98], ['Sydney', -33.87, 151.21],
      ['Berlin', 52.52, 13.41], ['Stockholm', 59.33, 18.07], ['Dubai', 25.20, 55.27], ['Mumbai', 19.08, 72.88],
    ];
    for (let i = 0; i < cities.length; i++) {
      if (String(cities[i][0]).toLowerCase() === s) {
        const country = knownCityCountry(cities[i][0]);
        return { lat: cities[i][1], lng: cities[i][2], name: cities[i][0], title: cities[i][0], sub: country && country !== 'United States' ? ('City · ' + country) : 'City', kind: 'city', source: 'known-city', house: '' };
      }
    }
    return null;
  }
    function syntheticSuggestRow(q) {
    const s = String(q || "").trim();
    return {
      title: s,
      sub: "Search this address",
      name: s,
      kind: "address",
      source: "typed",
      house: parseHouseNumber(s),
      lat: NaN,
      lng: NaN,
    };
  }

  function queryHasLocality(q) {
    const parsed = parseUsStreetQuery(q);
    if (parsed && parsed.city && String(parsed.city).trim().length > 1) return true;
    if (parsed && parsed.state) return true;
    if (parsed && parsed.zip) return true;
    return false;
  }

  function hitsAreAmbiguous(hits, q) {
    const wantHouse = parseHouseNumber(q);
    if (!wantHouse || queryHasLocality(q)) return false;
    const list = (hits || []).filter(function (h) { return h && Number.isFinite(Number(h.lat)) && Number.isFinite(Number(h.lng)); });
    if (list.length < 2) return false;
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    for (let i = 0; i < list.length; i++) {
      minLat = Math.min(minLat, Number(list[i].lat));
      maxLat = Math.max(maxLat, Number(list[i].lat));
      minLng = Math.min(minLng, Number(list[i].lng));
      maxLng = Math.max(maxLng, Number(list[i].lng));
    }
    return (maxLat - minLat) > 0.12 || (maxLng - minLng) > 0.12;
  }

  function suggestKey(r) {
    if (!r) return "";
    if (Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lng))) {
      return Number(r.lat).toFixed(5) + "," + Number(r.lng).toFixed(5);
    }
    return "typed:" + String(r.name || r.title || "").toLowerCase();
  }

  function mergeSuggestRows(syn, rows) {
    const out = [];
    const seen = {};
    const push = function (r) {
      if (!r) return;
      const key = suggestKey(r);
      if (seen[key]) return;
      seen[key] = 1;
      out.push(r);
    };
    if (syn) push(syn);
    const list = Array.isArray(rows) ? rows : [];
    for (let i = 0; i < list.length; i++) push(list[i]);
    return out.slice(0, 8);
  }

  function googleRowFromResult(row, q) {
    if (!row) return null;
    const loc = row.geometry && row.geometry.location;
    if (!loc) return null;
    const lat = Number(typeof loc.lat === "function" ? loc.lat() : loc.lat);
    const lng = Number(typeof loc.lng === "function" ? loc.lng() : loc.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const types = Array.isArray(row.types) ? row.types : [];
    let kind = "address";
    if (types.indexOf("locality") >= 0 || types.indexOf("administrative_area_level_1") >= 0 || types.indexOf("country") >= 0) kind = "city";
    else if (types.indexOf("route") >= 0) kind = "street";
    const name = String(row.formatted_address || q);
    const parts = name.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    const title = parts[0] || String(q);
    const sub = parts.slice(1, 3).join(", ");
    const hn = parseHouseNumber(title) || parseHouseNumber(q);
    return {
      lat: lat, lng: lng, title: title, sub: sub, name: name,
      kind: kind, source: "google", house: hn,
      locationType: String((row.geometry && row.geometry.location_type) || ""),
    };
  }

  function googleRowsFromResults(results, q) {
    const list = Array.isArray(results) ? results : [];
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const row = googleRowFromResult(list[i], q);
      if (row) out.push(row);
    }
    return out;
  }

  function photonSuggestRow(feat, q) {
    const coords = feat && feat.geometry && feat.geometry.coordinates;
    if (!coords || coords.length < 2) return null;
    const lat = Number(coords[1]);
    const lng = Number(coords[0]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const p = (feat && feat.properties) || {};
    const title = p.housenumber && p.street ? (p.housenumber + " " + p.street) : (p.name || p.street || q);
    const city = p.city || p.town || p.village || "";
    const state = p.state || "";
    const sub = [city, state].filter(Boolean).join(", ");
    const bits = [title, sub, p.country].filter(Boolean);
    return {
      lat: lat, lng: lng, title: String(title || q), sub: sub,
      name: bits.join(", "), kind: geocodeKindFromPhoton(p), source: "photon", house: p.housenumber || "",
    };
  }

  function nominatimSuggestRow(hit, q) {
    if (!hit) return null;
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const addr = hit.address || {};
    const title = addr.house_number && addr.road ? (addr.house_number + " " + addr.road) : (hit.name || addr.road || "");
    const city = addr.city || addr.town || addr.village || addr.hamlet || "";
    const state = addr.state || "";
    const sub = [city, state].filter(Boolean).join(", ");
    return {
      lat: lat, lng: lng, title: String(title || hit.display_name || q), sub: sub,
      name: String(hit.display_name || title || q), kind: geocodeKindFromNominatim(hit), source: "nominatim", house: addr.house_number || "",
    };
  }

  async function fetchGoogleSuggests(query) {
    const q = String(query || "").trim();
    if (!q) return [];
    try {
      const rows = await geocodeGoogleJsAll(q);
      if (rows && rows.length) return rows;
    } catch (e) {}
    try {
      const hit = await geocodeGoogle(q);
      if (hit) return [hit];
    } catch (e2) {}
    return [];
  }

  async function geocodeGoogleJsAll(query) {
    const q = String(query || "").trim();
    if (!q) return [];
    return settleTimeout((async function () {
      const ok = await ensureGoogleMapsJs();
      if (!ok) return [];
      return new Promise(function (resolve) {
        try {
          const geo = new global.google.maps.Geocoder();
          geo.geocode({ address: q }, function (results, status) {
            if (String(status) !== "OK" || !results || !results.length) return resolve([]);
            resolve(googleRowsFromResults(results, q));
          });
        } catch (e) { resolve([]); }
      });
    })(), 2500, []);
  }

  async function fetchSearchSuggests(query) {
    const q = String(query || "").trim();
    if (q.length < 3) return [];
    const wantHouse = parseHouseNumber(q);
    const syn = syntheticSuggestRow(q);
    const googleP = (async function () {
      try { return await settleTimeout(fetchGoogleSuggests(q), 2500, []); } catch (e) { return []; }
    })();
    const photonP = (async function () {
      try {
        const res = await fetchWithTimeout("https://photon.komoot.io/api/?q=" + encodeURIComponent(q) + "&limit=6&lang=en", { headers: { Accept: "application/json" } }, 1800);
        if (!(res && res.ok)) return [];
        const data = await res.json();
        const feats = (data && data.features) || [];
        const rows = [];
        for (let i = 0; i < feats.length; i++) {
          const row = photonSuggestRow(feats[i], q);
          if (row) rows.push(row);
        }
        return rows;
      } catch (e) { return []; }
    })();
    const nomP = (async function () {
      try {
        const noms = await settleTimeout(fetchNominatim({ q: q, limit: "6" }), 1800, []);
        const rows = [];
        for (let i = 0; i < (noms || []).length; i++) {
          const row = nominatimSuggestRow(noms[i], q);
          if (row) rows.push(row);
        }
        return rows;
      } catch (e) { return []; }
    })();
    const osm = await Promise.all([photonP, nomP]);
    var gRows = [];
    try {
      var marker = { __gmPending: 1 };
      var raced = await Promise.race([googleP, Promise.resolve(marker)]);
      if (!(raced && raced.__gmPending)) gRows = raced || [];
    } catch (eG) { gRows = []; }
    const buckets = [gRows, osm[0], osm[1]];
    let rows = [];
    for (let b = 0; b < buckets.length; b++) {
      const part = buckets[b] || [];
      for (let i = 0; i < part.length; i++) rows.push(part[i]);
    }
    if (wantHouse) {
      rows.sort(function (a, b) {
        const ah = housesEqual(a.house, wantHouse) ? 1 : 0;
        const bh = housesEqual(b.house, wantHouse) ? 1 : 0;
        const ag = a.source === "google" ? 1 : 0;
        const bg = b.source === "google" ? 1 : 0;
        return (bh - ah) || (bg - ag);
      });
      var diverse = [];
      var rest = [];
      var seenCity = {};
      for (var di = 0; di < rows.length; di++) {
        var cityKey = String(rows[di].sub || "").toLowerCase() || suggestKey(rows[di]);
        if (!seenCity[cityKey]) { seenCity[cityKey] = 1; diverse.push(rows[di]); }
        else rest.push(rows[di]);
      }
      rows = diverse.concat(rest);
    } else {
      rows.sort(function (a, b) {
        const ac = a.kind === "city" ? 1 : 0;
        const bc = b.kind === "city" ? 1 : 0;
        const ag = a.source === "google" ? 1 : 0;
        const bg = b.source === "google" ? 1 : 0;
        return (bc - ac) || (bg - ag);
      });
    }
    const known = knownCityHit(q);
    if (known) {
      rows = dropConflictingUsTowns(rows, known);
      rows.unshift(known);
    }
    return mergeSuggestRows(syn, rows);
  }

  async function fetchOsmHits(q, parsed, noCity) {
    const nomP = (async function () {
      const rows = [];
      try {
        let noms;
        if (!noCity && parsed && parsed.street) {
          const params = { street: parsed.street, country: "US" };
          if (parsed.city) params.city = parsed.city;
          if (parsed.state) params.state = parsed.state;
          if (parsed.zip) params.postalcode = parsed.zip;
          noms = await fetchNominatim(params);
        } else {
          noms = await fetchNominatim({ q: q, limit: "6" });
        }
        for (let i = 0; i < (noms || []).length; i++) {
          const row = nominatimSuggestRow(noms[i], q);
          if (row) rows.push(row);
        }
      } catch (e) {}
      return rows;
    })();
    const phoP = (async function () {
      const rows = [];
      try {
        const res = await fetchWithTimeout("https://photon.komoot.io/api/?limit=8&lang=en&q=" + encodeURIComponent(q), { headers: { Accept: "application/json" } }, 2500);
        if (res && res.ok) {
          const data = await res.json();
          const feats = (data && data.features) || [];
          for (let i = 0; i < feats.length; i++) {
            const row = photonSuggestRow(feats[i], q);
            if (row) rows.push(row);
          }
        }
      } catch (e) {}
      return rows;
    })();
    const pair = await Promise.all([settleTimeout(nomP, 2500, []), settleTimeout(phoP, 2500, [])]);
    return [].concat(pair[0] || [], pair[1] || []);
  }

  function firstLatLngHits(aP, bP) {
    return new Promise(function (resolve) {
      var pending = 2;
      var acc = [];
      var sent = false;
      function one(rows) {
        var list = Array.isArray(rows) ? rows : [];
        if (!sent && list.length) {
          sent = true;
          resolve(list);
          return;
        }
        acc = acc.concat(list);
        pending -= 1;
        if (!sent && pending <= 0) {
          sent = true;
          resolve(acc);
        }
      }
      aP.then(one, function () { one([]); });
      bP.then(one, function () { one([]); });
    });
  }

  function preferCensusAddress(rows) {
    const list = Array.isArray(rows) ? rows.slice() : [];
    const census = [];
    const rest = [];
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (r && r.source === "census" && r.kind === "address" && Number.isFinite(Number(r.lat))) census.push(r);
      else rest.push(r);
    }
    return census.concat(rest);
  }

  async function geocodeAddressAll(query) {
    const q = String(query || "").trim();
    if (!q) return [];
    const wantHouse = parseHouseNumber(q);
    const looksAddr = !!wantHouse || /\d/.test(q);
    const parsed = parseUsStreetQuery(q);
    const noCity = !!(wantHouse && !queryHasLocality(q));
    const googleP = settleTimeout(geocodeGoogleJsAll(q).catch(function () { return []; }), 2500, []);
    const osmP = settleTimeout(fetchOsmHits(q, parsed, noCity).catch(function () { return []; }), 2500, []);
    const censusP = (looksAddr || wantHouse)
      ? settleTimeout(geocodeCensus(q, wantHouse).then(function (hit) { return hit ? [hit] : []; }).catch(function () { return []; }), 2500, [])
      : Promise.resolve([]);
    let rows = [];
    if (noCity || looksAddr) {
      const triple = await Promise.all([googleP, osmP, censusP]);
      rows = preferCensusAddress([].concat(triple[0] || [], triple[1] || [], triple[2] || []));
      if (noCity && hitsAreAmbiguous(rows, q)) return mergeSuggestRows(syntheticSuggestRow(q), rows);
    } else {
      rows = await firstLatLngHits(googleP, osmP);
    }
    if (!rows.length && !looksAddr) {
      try {
        if (typeof geocodeDealCity === "function") {
          const city = q.split(",")[0].trim();
          const geo = await geocodeDealCity(city, {});
          if (geo) rows.push({ lat: geo.lat, lng: geo.lng, name: geo.name || q, kind: "city", title: geo.name || q, source: "city" });
        }
      } catch (e) {}
    }
    return mergeSuggestRows(null, preferCensusAddress(rows));
  }

  async function geocodeAddress(query) {
    const q = String(query || "").trim();
    if (!q) return null;
    const rows = await geocodeAddressAll(q);
    const real = (rows || []).filter(function (r) { return r && Number.isFinite(Number(r.lat)); });
    if (!real.length) return null;
    if (hitsAreAmbiguous(real, q)) return { ambiguous: true, rows: mergeSuggestRows(syntheticSuggestRow(q), real) };
    return real[0];
  }


  function V4GodModeEarth(props) {
    bindReact();
    const open = !!(props && props.open);
    const activeLayer = (props && props.layer) || 'all';
    const viewer = props && props.viewer;
    const onClose = props && props.onClose;
    const onLayerChange = props && props.onLayerChange;
    const [layer, setLayer] = React.useState(activeLayer);
    const [utc, setUtc] = React.useState(function () { return fmtUtc(new Date()); });
    const [weather, setWeather] = React.useState([]);
    const [flights, setFlights] = React.useState([]);
    const [satellites, setSatellites] = React.useState([]);
    const [starlink, setStarlink] = React.useState({ points: [], count: 0 });
    const [ships, setShips] = React.useState([]);
    const [launches, setLaunches] = React.useState({ markers: [], list: [] });
    const [deals, setDeals] = React.useState([]);
    const [gpsjam, setGpsjam] = React.useState([]);
    const [settingsOpen, setSettingsOpen] = React.useState(false);
    const [earthEvents, setEarthEvents] = React.useState([]);
    const [storms, setStorms] = React.useState([]);
    const [selected, setSelected] = React.useState(null);
    const [globeError, setGlobeError] = React.useState('');
    const [feedsLoading, setFeedsLoading] = React.useState(false);
    const [searchQ, setSearchQ] = React.useState('');
    const searchInputRef = React.useRef(null);
    const setSearchField = function (v) {
      const s = v == null ? '' : String(v);
      setSearchQ(s);
      try { if (searchInputRef.current) searchInputRef.current.value = s; } catch (e) {}
    };
    const [searchMsg, setSearchMsg] = React.useState('');
    const [searching, setSearching] = React.useState(false);
    const [searchSuggests, setSearchSuggests] = React.useState([]);
    const [suggestHi, setSuggestHi] = React.useState(-1);
    const suggestGenRef = React.useRef(0);
    const searchingSinceRef = React.useRef(0);
    const searchQRef = React.useRef('');
    const searchSuggestsRef = React.useRef([]);
    const [streetMode, setStreetMode] = React.useState(false);
    const focusRef = React.useRef(null);
    const globeRef = React.useRef(null);
    const globeInstRef = React.useRef(null);
    const layerRef = React.useRef(layer);
    const selectedRef = React.useRef(null);
    const applyRef = React.useRef(function () {});
    const pointsFpRef = React.useRef("");
    const lastPovRef = React.useRef({ lat: null, alt: null });
    const swipeY = React.useRef(null);
    React.useEffect(function () {
      setLayer(activeLayer);
      layerRef.current = activeLayer;
    }, [activeLayer]);
    React.useEffect(function () { searchQRef.current = searchQ; }, [searchQ]);
    React.useEffect(function () { searchSuggestsRef.current = searchSuggests; }, [searchSuggests]);
    React.useEffect(function () {
      selectedRef.current = selected;
      if (selected && Number.isFinite(Number(selected.lat)) && Number.isFinite(Number(selected.lng))) {
        focusRef.current = { lat: Number(selected.lat), lng: Number(selected.lng), name: selected.name || selected.label || 'Selected' };
      }
    }, [selected]);
    React.useEffect(function () {
      if (!open) return undefined;
      injectPhoneCss();
      const onKey = function (e) {
        const active = (typeof document !== 'undefined' && document.activeElement) || (e && e.target);
        const tag = String((active && active.tagName) || (e && e.target && e.target.tagName) || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') {
          if (e.key !== 'Escape') return;
        } else {
          try {
            if (active && (active.isContentEditable || String(active.contentEditable || '').toLowerCase() === 'true')) { if (e.key !== 'Escape') return; }
            if (e.target && e.target.closest && e.target.closest('.v4-gm2-search, .v4-gm-phone-search')) { if (e.key !== 'Escape') return; }
          } catch (eType) {}
        }
        if (e.key === 'Escape') {
          if (e.preventDefault) e.preventDefault();
          if (e.stopPropagation) e.stopPropagation();
          if ((searchSuggestsRef.current && searchSuggestsRef.current.length) || String(searchQRef.current || '').trim()) {
            setSearchField('');
            setSearchMsg('');
            setSearchSuggests([]);
            setSuggestHi(-1);
            return;
          }
          if (selectedRef.current) { setSelected(null); return; }
          if (onClose) onClose();
        }
      };
      window.addEventListener('keydown', onKey);
      const onWheelHud = function (e) {
        try {
          if (e.target && e.target.closest && e.target.closest('.v4-gm-phone-suggest, .v4-gm-phone-settings')) return;
        } catch (eC) {}
        try { e.preventDefault(); } catch (eP) {}
      };
      window.addEventListener('wheel', onWheelHud, { capture: true, passive: false });
      document.body.classList.add('v4-godmode-open');
      document.body.classList.add('v4-godmode-phone');
      document.documentElement.classList.add('v4-godmode-phone');
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      const meta = document.querySelector('meta[name="viewport"]');
      const prevMeta = meta ? meta.getAttribute('content') : '';
      if (meta) meta.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
      const clock = window.setInterval(function () { setUtc(fmtUtc(new Date())); }, 1000);
      return function () {
        window.removeEventListener('keydown', onKey);
        try { window.removeEventListener('wheel', onWheelHud, { capture: true, passive: false }); } catch (eW) {}
        document.body.classList.remove('v4-godmode-open');
        document.body.classList.remove('v4-godmode-phone');
        document.documentElement.classList.remove('v4-godmode-phone');
        document.documentElement.classList.remove('v4-godmode-phone');
        document.body.style.overflow = prevOverflow;
        if (meta && prevMeta != null) meta.setAttribute('content', prevMeta);
        window.clearInterval(clock);
      };
    }, [open, onClose]);
    React.useEffect(function () {
      if (!open) {
        document.body.classList.remove('v4-godmode-open');
        document.body.classList.remove('v4-godmode-phone');
      }
    }, [open]);
    const collectPoints = React.useCallback(function (which) {
      const allow = LAYER_TYPES[which] || null;
      const rows = [];
      const push = function (item) {
        if (!item) return;
        const lat = Number(item.lat);
        const lng = Number(item.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        if (allow && allow.indexOf(item.type) === -1) return;
        var craftPt = item.type === 'flight' || item.type === 'military' || item.type === 'ship';
        if (item.alt == null && item.altM != null) item.alt = craftPt ? Math.min(0.0022, (Number(item.altM) || 0) / 6371000) : Math.min(0.02, (Number(item.altM) || 0) / 100000);
        if (item.size == null) {
          if (item.type === 'starlink') item.size = STARLINK_POINT_SIZE;
          else if (craftPt) item.size = 0.035;
          else if (item.type === 'deal') item.size = 0.22;
          else if (item.type === 'storm') item.size = 0.22;
          else if (item.type === 'launch') item.size = 0.16;
          else item.size = 0.10;
        }
        if (!item.color) item.color = '#d0d6e0';
        rows.push(item);
      };
      weather.forEach(push);
      flights.forEach(push);
      satellites.forEach(push);
      (starlink.points || []).forEach(push);
      ships.forEach(push);
      earthEvents.forEach(push);
      (storms || []).forEach(push);
      (launches.markers || []).forEach(push);
      (deals || []).forEach(push);
      (gpsjam || []).forEach(push);
      return rows;
    }, [weather, flights, satellites, starlink, ships, earthEvents, storms, launches, deals, gpsjam]);
    const applyGlobeLayers = React.useCallback(function (opts) {
      const globe = globeInstRef.current;
      if (!globe) return;
      const which = layerRef.current || "all";
      const skipHorizon = !!(opts && opts.skipHorizon);
      let rows = collectPoints(which);
      if (!skipHorizon && !globe.__cesium) {
        rows = rows.filter(function (row) {
          return isNearSide(globe, row.lat, row.lng);
        });
      }
      const fp = rows.map(function (r) {
        return String(r.id || r.name || (r.lat + "," + r.lng));
      }).join("|");
      const onPick = function (pt) {
        setSelected(pt || null);
        if (pt && Number.isFinite(Number(pt.lat))) {
          try { globe.pointOfView({ lat: Number(pt.lat), lng: Number(pt.lng), altitude: SEARCH_ALT_RADII }, 700); } catch (e) {}
        }
      };
      try { if (globe && typeof globe.onPointClick === 'function') globe.onPointClick(onPick); } catch (eB) {}
      if (fp === pointsFpRef.current) return;
      pointsFpRef.current = fp;
      try {
        globe.pointsData(rows).pointLat("lat").pointLng("lng")
          .pointAltitude(function (d) {
            if (d.type === 'flight' || d.type === 'military' || d.type === 'ship') return 0.0012;
            return Math.min(0.02, Number(d.alt) || 0.008);
          })
          .pointRadius(function (d) {
            if (d.type === 'starlink') return STARLINK_POINT_SIZE;
            if (d.type === 'flight' || d.type === 'military' || d.type === 'ship') return 0.035;
            if (d.type === 'storm' || d.type === 'deal') return Number(d.size) || 0.22;
            return Number(d.size) || 0.10;
          })
          .pointColor(function (d) {
            const g = globeInstRef.current;
            if (g && !isNearSide(g, d.lat, d.lng)) return "rgba(0,0,0,0)";
            return d.color || "#d0d6e0";
          })
          .pointResolution(12).pointsMerge(false).pointsTransitionDuration(0)
          .pointLabel(function (d) { return d.label || d.name || ""; })
          .onPointClick(onPick);
      } catch (e) {
        console.warn("[god-mode-phone] layer apply failed", e);
      }
    }, [collectPoints]);
    applyRef.current = applyGlobeLayers;
    React.useEffect(function () {
      if (!open) return;
      applyGlobeLayers();
    }, [open, applyGlobeLayers, layer]);
    React.useEffect(function () {
      if (!open) return undefined;
      let cancelled = false;
      let resizeObs = null;
      let globe = null;
      let onControls = null;
      let unbindGestures = null;
      const resizeGlobe = function () {
        const g = globeInstRef.current;
        const node = globeRef.current;
        if (!g || !node) return;
        const w = Math.max(240, node.clientWidth || node.offsetWidth || 0);
        const h = Math.max(240, node.clientHeight || node.offsetHeight || 0);
        if (w > 0 && h > 0) {
          if (typeof g.width === 'function') g.width(w);
          if (typeof g.height === 'function') g.height(h);
        }
      };
      const buildGlobe = async function () {
        await waitForGlobeContainer(globeRef.current);
        if (cancelled || !globeRef.current || globeInstRef.current) return null;
        const v = viewer || {};
        try {
          const cesiumGlobe = await mountPhoneCesium(globeRef.current, v);
          if (cesiumGlobe && !cancelled) return cesiumGlobe;
        } catch (eCesium) {
          console.warn('[god-mode-phone] Cesium unavailable, globe.gl fallback', eCesium);
        }
        if (cancelled || !globeRef.current || globeInstRef.current) return null;
        const GlobeFactory = await ensureGlobeLibrary();
        if (cancelled || !globeRef.current || globeInstRef.current) return null;
        const g = initGlobeInstance(GlobeFactory, globeRef.current);
        applySatelliteTiles(g);
        try { g.backgroundImageUrl(SKY_IMG); } catch (e) {}
        configurePhoneControls(g);
        syncGlobeCameraNear(g);
        const lat = Number(v.lat);
        const lng = Number(v.lng != null ? v.lng : v.lon);
        g.pointOfView({ lat: Number.isFinite(lat) ? lat : 28, lng: Number.isFinite(lng) ? lng : -20, altitude: 2.15 }, 0);
        return g;
      };
      const mountGlobe = async function () {
        if (cancelled) return;
        if (!globeRef.current) { window.requestAnimationFrame(mountGlobe); return; }
        if (globeInstRef.current) return;
        setGlobeError('');
        const webgl = probeWebGLSupport();
        if (!webgl.ok) {
          setGlobeError('3D globe needs WebGL. ' + (webgl.reason || 'Unavailable in this browser.'));
          return;
        }
        let lastErr = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          if (cancelled || globeInstRef.current) return;
          if (attempt > 0) {
            disposeGlobeInstance(globeInstRef.current);
            globeInstRef.current = null;
            if (globeRef.current) globeRef.current.innerHTML = '';
            await new Promise(function (r) { window.setTimeout(r, 400); });
          }
          try {
            globe = await buildGlobe();
            if (!globe || cancelled) return;
            globeInstRef.current = globe;
            try {
              const renderer = globe.renderer && globe.renderer();
              if (renderer) renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
            } catch (e) {}
            let camTimer = 0;
            try {
              const p0 = globe.pointOfView && globe.pointOfView();
              if (p0) lastPovRef.current = { lat: Number(p0.lat), alt: Number(p0.altitude) };
            } catch (e0) {}
            onControls = function () {
              if (camTimer) window.clearTimeout(camTimer);
              camTimer = window.setTimeout(function () {
                camTimer = 0;
                try {
                  const pov = globe.pointOfView && globe.pointOfView();
                  if (!pov) return;
                  const lat = Number(pov.lat);
                  const alt = Number(pov.altitude);
                  const prev = lastPovRef.current || {};
                  const altChanged = prev.alt == null || Math.abs(alt - prev.alt) > 0.08;
                  const latChanged = prev.lat == null || Math.abs(lat - prev.lat) > 4;
                  if (!altChanged && !latChanged) return;
                  lastPovRef.current = { lat: lat, alt: alt };
                  pointsFpRef.current = "";
                  try { globe.showAtmosphere(false); globe.atmosphereAltitude(0); } catch (eAtm) {}
                  applyRef.current();
                } catch (e) {}
              }, 400);
            };
            if (globe.controls && globe.controls() && globe.controls().addEventListener) {
              globe.controls().addEventListener("end", onControls);
            }
            if (!globe.__cesium) unbindGestures = bindPhoneGlobeGestures(globe, globeRef.current);
            window.requestAnimationFrame(function () { resizeGlobe(); applyRef.current(); });
            try {
              fetchRainViewerMeta().then(function (radar) {
                if (radar && globeInstRef.current && globeInstRef.current.showRadar) globeInstRef.current.showRadar(radar);
              });
            } catch (eRad) {}
            if (typeof ResizeObserver !== 'undefined' && globeRef.current) {
              resizeObs = new ResizeObserver(function () { resizeGlobe(); });
              resizeObs.observe(globeRef.current);
            }
            window.addEventListener('resize', resizeGlobe);
            return;
          } catch (e) {
            lastErr = e;
            console.error('[god-mode-phone] globe mount failed', e);
          }
        }
        if (!cancelled) setGlobeError('3D globe failed to load. ' + (lastErr && lastErr.message || 'Unknown error'));
      };
      mountGlobe();
      return function () {
        cancelled = true;
        window.removeEventListener('resize', resizeGlobe);
        if (resizeObs) resizeObs.disconnect();
        if (unbindGestures) { try { unbindGestures(); } catch (e) {} }
        if (globe && onControls) { try { globe.controls().removeEventListener('end', onControls); } catch (e) {} }
        disposeGlobeInstance(globeInstRef.current);
        globeInstRef.current = null;
        if (globeRef.current) globeRef.current.innerHTML = '';
      };
    }, [open, viewer]);
    React.useEffect(function () {
      if (!open) return undefined;
      let cancelled = false;
      const loadFeed = async function (key, fetcher, onSuccess) {
        try {
          const value = await fetcher();
          if (!cancelled) onSuccess(value);
        } catch (e) {
          if (!cancelled) console.warn('[god-mode-phone] feed ' + key + ' failed', e);
        }
      };
      setFeedsLoading(true);
      var loadTimer = setTimeout(function () { if (!cancelled) setFeedsLoading(false); }, 8000);
      Promise.all([
        loadFeed('weather', async function () {
          const cities = await fetchWeatherGrid();
          try {
            const radar = await fetchRainViewerMeta();
            const g = globeInstRef.current;
            if (radar && g && typeof g.showRadar === 'function') g.showRadar(radar);
          } catch (eR) {}
          return cities;
        }, setWeather),
        loadFeed('storms', fetchPhoneStorms, setStorms),
        loadFeed('flights', loadFlights, setFlights),
        loadFeed('satellites', fetchIss, setSatellites),
        loadFeed('starlink', loadStarlink, setStarlink),
        loadFeed('ships', function () { return fetchShips().then(function (v) { return (v && v.rows) || []; }); }, setShips),
        loadFeed('events', loadEvents, setEarthEvents),
        loadFeed('launches', function () { return settleTimeout(fetchLaunches(), 10000, { markers: [], list: [] }); }, setLaunches),
        loadFeed('deals', function () { return settleTimeout(fetchDealMarkers(viewer), 10000, []); }, setDeals),
        loadFeed('gpsjam', function () {
          return fetchGpsjam().then(function (v) { return (v && v.rows) || []; });
        }, setGpsjam),
      ]).then(function () { if (!cancelled) { clearTimeout(loadTimer); setFeedsLoading(false); } });
      const flightTimer = setInterval(function () {
        loadFlights().then(function (rows) { if (!cancelled) setFlights(rows); }).catch(function () {});
      }, 45000);
      const issTimer = setInterval(function () {
        fetchIss().then(function (rows) { if (!cancelled) setSatellites(rows); }).catch(function () {});
      }, 12000);
      const starTimer = setInterval(function () {
        if (cancelled || !starlinkSatrecs || !starlinkSatrecs.length) return;
        try {
          const points = propagateStarlinkPoints();
          if (points.length && !cancelled) setStarlink({ points: points, count: points.length, updatedAt: Date.now() });
        } catch (e) {}
      }, 90000);
      const shipTimer = setInterval(function () {
        fetchShips().then(function (v) { if (!cancelled) setShips((v && v.rows) || []); }).catch(function () {});
      }, 40000);
      const onLeads = function () {
        settleTimeout(fetchDealMarkers(viewer), 10000, []).then(function (rows) {
          if (!cancelled) setDeals(rows || []);
        }).catch(function () {});
      };
      try { window.addEventListener('v3:leads-loaded', onLeads); } catch (eL) {}
      return function () {
        cancelled = true;
        try { window.removeEventListener('v3:leads-loaded', onLeads); } catch (eL2) {}
        clearInterval(flightTimer);
        clearInterval(issTimer);
        clearInterval(starTimer);
        clearInterval(shipTimer);
      };
    }, [open]);
    const pickLayer = function (id) {
      setLayer(id);
      pointsFpRef.current = "";
      layerRef.current = id;
      if (onLayerChange) onLayerChange(id);
      setSelected(null);
      setSettingsOpen(false);
      if (id === 'weather' || id === 'all') {
        try {
          const g = globeInstRef.current;
          if (g && g._state && g._state.radarLayer) {
            try { g._state.radarLayer.show = true; } catch (eS) {}
            try { g._state.radarLayer.alpha = 0.62; } catch (eA) {}
            try {
              if (g._viewer && g._viewer.imageryLayers && g._viewer.imageryLayers.raiseToTop) {
                g._viewer.imageryLayers.raiseToTop(g._state.radarLayer);
              }
            } catch (eT) {}
          }
          if (g && typeof g.showRadar === 'function') {
            if (g._state && g._state.radarMeta) g.showRadar(g._state.radarMeta);
            else {
              fetchRainViewerMeta().then(function (radar) {
                if (radar && globeInstRef.current && globeInstRef.current.showRadar) {
                  globeInstRef.current.showRadar(radar);
                }
              });
            }
          }
        } catch (eWx) {}
      }
    };
    let _mobileSearchPinDataUrl = null;
    const mobileSearchPinDataUrl = function () {
      if (_mobileSearchPinDataUrl) return _mobileSearchPinDataUrl;
      const c = document.createElement('canvas');
      c.width = 56;
      c.height = 80;
      const ctx = c.getContext('2d');
      const cx = 28;
      const cy = 24;
      const r = 18;
      ctx.beginPath();
      ctx.moveTo(cx, 76);
      ctx.bezierCurveTo(cx - 6, 56, cx - r, cy + r, cx - r, cy);
      ctx.arc(cx, cy, r, Math.PI, 0, false);
      ctx.bezierCurveTo(cx + r, cy + r, cx + 6, 56, cx, 76);
      ctx.closePath();
      ctx.fillStyle = '#ffd60a';
      ctx.fill();
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2.25;
      ctx.strokeStyle = '#3a2a00';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      _mobileSearchPinDataUrl = c.toDataURL('image/png');
      return _mobileSearchPinDataUrl;
    };
    const clearMobileSearchPin = function (g) {
      g = g || globeInstRef.current;
      try {
        if (g && g._searchPinEntity && g._viewer) g._viewer.entities.remove(g._searchPinEntity);
      } catch (e) {}
      try { if (g && g._viewer && g._viewer.entities && g._viewer.entities.removeById) g._viewer.entities.removeById('gm2-search-pin'); } catch (e1) {}
      try { if (g && typeof g.htmlElementsData === 'function') g.htmlElementsData([]); } catch (eH) {}
      try { if (g) { g._searchPinEntity = null; g._searchPin = null; } } catch (e2) {}
    };
    const setMobileSearchPin = function (g, hit) {
      g = g || globeInstRef.current;
      clearMobileSearchPin(g);
      if (!g || !hit || !Number.isFinite(Number(hit.lat))) return;
      g._searchPin = { lat: Number(hit.lat), lng: Number(hit.lng), name: hit.name || '' };
      if (g.__cesium && g._viewer && g._cesium) {
        try {
          const Cesium = g._cesium;
          const pinName = String(hit.name || '').trim();
          const entityOpts = {
            id: 'gm2-search-pin',
            position: Cesium.Cartesian3.fromDegrees(Number(hit.lng), Number(hit.lat), 90),
            billboard: {
              image: mobileSearchPinDataUrl(),
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              heightReference: Cesium.HeightReference.NONE,
              pixelOffset: new Cesium.Cartesian2(0, 0),
              eyeOffset: new Cesium.Cartesian3(0, 0, -140),
              scale: 1.75,
              sizeInMeters: false,
              scaleByDistance: new Cesium.NearFarScalar(80, 1.8, 6.0e6, 1.05),
            },
            point: {
              pixelSize: 18,
              color: Cesium.Color.fromCssColorString('#ffbf00'),
              outlineColor: Cesium.Color.fromCssColorString('#1a1200'),
              outlineWidth: 3,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              heightReference: Cesium.HeightReference.NONE,
            },
          };
          if (pinName) {
            entityOpts.label = {
              text: pinName,
              fillColor: Cesium.Color.fromCssColorString('#ffd60a'),
              outlineColor: Cesium.Color.fromCssColorString('#1a1200'),
              outlineWidth: 3,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              font: '14px sans-serif',
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              pixelOffset: new Cesium.Cartesian2(0, -86),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              show: true,
            };
          }
          const ent = g._viewer.entities.add(entityOpts);
          ent.__gm2Decor = true;
          try { ent.show = true; } catch (eS) {}
          g._searchPinEntity = ent;
          try { if (g._viewer.scene && g._viewer.scene.requestRender) g._viewer.scene.requestRender(); } catch (eR) {}
        } catch (e) {}
      } else {
        try {
          if (typeof g.htmlElementsData === 'function') {
            g.htmlElementsData([{ lat: Number(hit.lat), lng: Number(hit.lng), alt: 0.0012 }])
              .htmlLat('lat').htmlLng('lng').htmlAltitude('alt')
              .htmlElement(function () {
                const wrap = document.createElement('div');
                wrap.style.cssText = 'pointer-events:none;transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;';
                const nm = String(hit.name || '').trim();
                if (nm) {
                  const lab = document.createElement('div');
                  lab.textContent = nm;
                  lab.style.cssText = 'font:14px sans-serif;color:#ffd60a;-webkit-text-stroke:1px #1a1200;paint-order:stroke fill;text-shadow:0 1px 0 #1a1200;white-space:nowrap;margin-bottom:4px;';
                  wrap.appendChild(lab);
                }
                const img = document.createElement('img');
                img.src = mobileSearchPinDataUrl();
                img.width = 36;
                img.height = 52;
                img.alt = '';
                wrap.appendChild(img);
                return wrap;
              });
          }
        } catch (eH) {}
      }
    };

    const flyTo = function (lat, lng, altitude) {
      const g = globeInstRef.current;
      if (!g || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return;
      if (g.__cesium) {
        try { if (g.pauseIdleSpin) g.pauseIdleSpin(); } catch (e) {}
      } else {
        try { const c = g.controls(); if (c) c.autoRotate = false; } catch (e) {}
      }
      try { g.pointOfView({ lat: Number(lat), lng: Number(lng), altitude: altitude == null ? SEARCH_ALT_RADII : altitude }, 900); } catch (e) {}
    };
    const applyMobileHit = function (hit) {
      if (!hit || !Number.isFinite(Number(hit.lat))) return;
      focusRef.current = hit;
      setSearchMsg(hit.name || searchQ);
      setSelected({ type: 'place', name: hit.name || searchQ, lat: hit.lat, lng: hit.lng, label: hit.name || searchQ, source: 'Search' });
      const altM = (hit.kind === 'city' || hit.kind === 'region') ? SEARCH_CAMERA_ALT_M : SEARCH_ADDRESS_ALT_M;
      setMobileSearchPin(globeInstRef.current, hit);
      flyTo(hit.lat, hit.lng, altM / EARTH_RADIUS_M);
    };
    var pickSuggestAt = 0;
    const pickSuggest = function (row) {
      if (!row) return;
      var now = Date.now();
      if (now - pickSuggestAt < 400) return;
      pickSuggestAt = now;
      const typed = String(searchQ || '').trim();
      const q = String(row.name || row.title || typed).trim();
      if (Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lng))) {
        const refineQ = (parseHouseNumber(typed) && !housesEqual(row.house, parseHouseNumber(typed))) ? typed : q;
        setSearchField(refineQ);
        setSearchSuggests([]);
        setSuggestHi(-1);
        applyMobileHit(Object.assign({}, row, { name: refineQ }));
        return;
      }
      setSearchField(q);
      setSearchMsg('Searching…');
      geocodeAddressAll(q).then(function (rows) {
        const real = (rows || []).filter(function (r) { return r && Number.isFinite(Number(r.lat)); });
        if (hitsAreAmbiguous(real, q) || (parseHouseNumber(q) && !queryHasLocality(q) && real.length > 1)) {
          setSearchSuggests(mergeSuggestRows(syntheticSuggestRow(q), real));
          setSuggestHi(0);
          setSearchMsg('Pick a city — several matches');
          return;
        }
        if (real[0]) applyMobileHit(real[0]);
        else setSearchMsg('No match');
      }).catch(function () { setSearchMsg('Search failed'); });
    };
    React.useEffect(function () {
      const q = String(searchQ || '').trim();
      if (q.length < 3) {
        setSearchSuggests([]);
        setSuggestHi(-1);
        return undefined;
      }
      const syn = syntheticSuggestRow(q);
      setSearchSuggests([syn]);
      setSuggestHi(0);
      const tmr = window.setTimeout(function () {
        const gen = ++suggestGenRef.current;
        fetchSearchSuggests(q).then(function (rows) {
          if (gen !== suggestGenRef.current) return;
          const list = mergeSuggestRows(syn, Array.isArray(rows) ? rows : []);
          setSearchSuggests(list);
          setSuggestHi(list.length ? 0 : -1);
        }).catch(function () {
          if (gen !== suggestGenRef.current) return;
          setSearchSuggests([syn]);
          setSuggestHi(0);
        });
      }, 180);
      return function () { window.clearTimeout(tmr); };
    }, [searchQ]);
    const runSearch = async function () {
      const q = String(searchQ || '').trim();
      if (!q) return;
      if (searching) {
        const since = searchingSinceRef.current || 0;
        if (since && (Date.now() - since) < 5000) return;
      }
      searchingSinceRef.current = Date.now();
      setSearching(true);
      setSearchMsg('Searching…');
      try {
        const rows = await settleTimeout(geocodeAddressAll(q), 4000, []);
        const real = (rows || []).filter(function (r) { return r && Number.isFinite(Number(r.lat)); });
        if (hitsAreAmbiguous(real, q) || (parseHouseNumber(q) && !queryHasLocality(q) && real.length > 1)) {
          setSearchSuggests(mergeSuggestRows(syntheticSuggestRow(q), real));
          setSuggestHi(0);
          setSearchMsg('Pick a city — several matches');
          return;
        }
        if (!real[0]) { setSearchMsg('No match'); return; }
        setSearchSuggests([]);
        applyMobileHit(real[0]);
      } catch (e) {
        setSearchMsg('Search failed');
      } finally {
        searchingSinceRef.current = 0;
        setSearching(false);
      }
    };
    const currentFocus = function () {
      const g = globeInstRef.current;
      if (g && g._searchPin && Number.isFinite(g._searchPin.lat)) return g._searchPin;
      if (focusRef.current && Number.isFinite(focusRef.current.lat)) return focusRef.current;
      if (selected && Number.isFinite(Number(selected.lat))) return { lat: Number(selected.lat), lng: Number(selected.lng) };
      try {
        const g = globeInstRef.current;
        const pov = g && g.pointOfView && g.pointOfView();
        if (pov && Number.isFinite(Number(pov.lat))) return { lat: Number(pov.lat), lng: Number(pov.lng) };
      } catch (e) {}
      return null;
    };
    const sleepPhoneGlobe = function () {
      try {
        const root = document.querySelector('.v4-gm-phone');
        if (root) root.classList.add('is-street');
      } catch (eR) {}
      const g = globeInstRef.current;
      if (g && g.__cesium && g._viewer) {
        try { if (g.pauseIdleSpin) g.pauseIdleSpin(); } catch (e) {}
        try { if (g._state) g._state._streetMode = true; } catch (eS) {}
        try { g._viewer.useDefaultRenderLoop = false; } catch (eL) {}
        try { if (g._viewer.scene && g._viewer.scene.globe) g._viewer.scene.globe.show = false; } catch (eG) {}
        try { if (g._viewer.scene && g._viewer.scene.fog) { g._viewer.scene.fog.enabled = false; g._viewer.scene.fog.density = 0; } } catch (eF) {}
        try { if (g.showAtmosphere) g.showAtmosphere(false); } catch (eA) {}
      } else if (g) {
        try { const c = g.controls(); if (c) c.autoRotate = false; } catch (e) {}
        try { g.showAtmosphere(false); } catch (eAtm) {}
      }
    };
    const hidePhonePano = function () {
      phoneStreetState.gen += 1;
      try { if (phoneStreetState.timer) { global.clearTimeout(phoneStreetState.timer); phoneStreetState.timer = 0; } } catch (eT) {}
      try { if (phoneStreetState.pano && phoneStreetState.pano.setVisible) phoneStreetState.pano.setVisible(false); } catch (eP) {}
      phoneStreetState.pano = null;
      const el = phoneStreetState.el || document.getElementById('v4-gm-phone-pano');
      if (el) {
        try { el.classList.remove('is-on'); } catch (e) {}
        try { el.innerHTML = ''; } catch (e2) {}
      }
    };
    const restorePhoneGlobe = function () {
      try {
        const root = document.querySelector('.v4-gm-phone');
        if (root) root.classList.remove('is-street');
      } catch (eR) {}
      const g = globeInstRef.current;
      if (g && g.__cesium && g._viewer) {
        try { if (g._state) g._state._streetMode = false; } catch (eS) {}
        try { g._viewer.useDefaultRenderLoop = true; } catch (eL) {}
        try { if (g._viewer.scene && g._viewer.scene.globe) g._viewer.scene.globe.show = true; } catch (eG) {}
        try { if (g._viewer.scene && g._viewer.scene.fog) { g._viewer.scene.fog.enabled = false; g._viewer.scene.fog.density = 0; } } catch (eF) {}
        try { if (g.showAtmosphere) g.showAtmosphere(false); } catch (eA) {}
        try { if (g._viewer.scene && g._viewer.scene.requestRender) g._viewer.scene.requestRender(); } catch (eRR) {}
        try { if (g.pauseIdleSpin) g.pauseIdleSpin(); } catch (eP) {}
      } else if (g) {
        try { g.showAtmosphere(false); } catch (eAtm) {}
      }
    };
    const failStreetView = function (msg) {
      hidePhonePano();
      try { restorePhoneGlobe(); } catch (eR) {}
      setSearchMsg(msg || 'Street View unavailable');
      setStreetMode(false);
    };
    const showPhonePano = function (lat, lng) {
      const gen = phoneStreetState.gen + 1;
      phoneStreetState.gen = gen;
      try { if (phoneStreetState.timer) { global.clearTimeout(phoneStreetState.timer); phoneStreetState.timer = 0; } } catch (eT0) {}
      const root = document.querySelector('.v4-gm-phone') || (globeRef.current && globeRef.current.parentNode);
      let el = document.getElementById('v4-gm-phone-pano');
      if (!el) {
        el = document.createElement('div');
        el.id = 'v4-gm-phone-pano';
        el.className = 'v4-gm-phone-pano';
      }
      if (root && el.parentNode !== root) root.appendChild(el);
      phoneStreetState.el = el;
      el.classList.add('is-on');
      el.innerHTML = '';
      const inner = document.createElement('div');
      inner.className = 'v4-gm-phone-pano-inner';
      el.appendChild(inner);
      const miss = document.createElement('div');
      miss.className = 'v4-gm-phone-pano-miss';
      miss.textContent = 'Loading Street View…';
      inner.appendChild(miss);
      phoneStreetState.timer = global.setTimeout(function () {
        if (phoneStreetState.gen !== gen) return;
        failStreetView('Street View timed out');
      }, STREET_PANO_TIMEOUT_MS);
      const boot = function (panoId) {
        if (phoneStreetState.gen !== gen) return;
        const id = String(panoId || '').trim();
        const key = (typeof readGoogleTilesKey === 'function' && readGoogleTilesKey()) || '';
        if (!id || !key) { failStreetView('No Street View coverage'); return; }
        try {
          inner.innerHTML = '';
          phoneStreetState.panoId = id;
          phoneStreetState.heading = 0;
          const img = document.createElement('img');
          img.alt = 'Street View';
          img.src = staticStreetSrc(id, 0);
          img.addEventListener('load', function () {
            if (phoneStreetState.gen !== gen) return;
            try { if (phoneStreetState.timer) { global.clearTimeout(phoneStreetState.timer); phoneStreetState.timer = 0; } } catch (eT1) {}
            setSearchMsg('');
          });
          img.addEventListener('error', function () {
            if (phoneStreetState.gen !== gen) return;
            failStreetView('Street View failed');
          });
          inner.appendChild(img);
          const turn = function (delta) {
            if (phoneStreetState.gen !== gen) return;
            phoneStreetState.heading = ((phoneStreetState.heading + delta) % 360 + 360) % 360;
            img.src = staticStreetSrc(phoneStreetState.panoId, phoneStreetState.heading);
          };
          const left = document.createElement('button');
          left.type = 'button';
          left.className = 'v4-gm-phone-pano-turn is-left';
          left.setAttribute('aria-label', 'Look left');
          left.textContent = '\u2039';
          left.addEventListener('click', function (e) { if (e && e.preventDefault) e.preventDefault(); turn(-90); });
          const right = document.createElement('button');
          right.type = 'button';
          right.className = 'v4-gm-phone-pano-turn is-right';
          right.setAttribute('aria-label', 'Look right');
          right.textContent = '\u203a';
          right.addEventListener('click', function (e) { if (e && e.preventDefault) e.preventDefault(); turn(90); });
          inner.appendChild(left);
          inner.appendChild(right);
          phoneStreetState.pano = null;
        } catch (ePano) {
          failStreetView('Street View failed');
        }
      };
      fetchOutdoorPanoId(lat, lng).then(function (panoId) {
        if (phoneStreetState.gen !== gen) return;
        try {
          global.requestAnimationFrame(function () { global.requestAnimationFrame(function () { boot(panoId); }); });
        } catch (eRaf) { boot(panoId); }
      });
    };
    const enterStreet = function (lat, lng) {
      const a = Number(lat);
      const b = Number(lng);
      if (!Number.isFinite(a) || !Number.isFinite(b)) { setSearchMsg('Search or tap a point first'); return; }
      const g = globeInstRef.current;
      try { if (g && g.pauseIdleSpin) g.pauseIdleSpin(); } catch (eP) {}
      try {
        if (g && g.__cesium && g._viewer) {
          try { if (g._viewer.scene && g._viewer.scene.fog) { g._viewer.scene.fog.enabled = false; g._viewer.scene.fog.density = 0; } } catch (eF0) {}
          try { if (g._viewer.scene && g._viewer.scene.skyAtmosphere) g._viewer.scene.skyAtmosphere.show = false; } catch (eS) {}
          try { if (g.showAtmosphere) g.showAtmosphere(false); } catch (eA) {}
          try { if (g._viewer.scene && g._viewer.scene.globe) g._viewer.scene.globe.show = true; } catch (eG) {}
        } else if (g) {
          try { if (g.showAtmosphere) g.showAtmosphere(false); } catch (eA2) {}
        }
      } catch (e) {}
      setStreetMode(true);
      setSearchMsg('Loading Street View…');
      showPhonePano(a, b);
    };
    global.__gmPhoneStreetView = enterStreet;
    const leaveStreetView = function () {
      hidePhonePano();
      try { restorePhoneGlobe(); } catch (eR) {}
      setSearchMsg('');
      setStreetMode(false);
    };
    const goStreetView = function () {
      const f = currentFocus();
      if (!f) { setSearchMsg('Search or tap a point first'); return; }
      enterStreet(f.lat, f.lng);
    };
    const dismiss = function () { setSelected(null); };
    const onCardTouchStart = function (e) {
      const t = e.changedTouches && e.changedTouches[0];
      swipeY.current = t ? t.clientY : null;
    };
    const onCardTouchEnd = function (e) {
      const t = e.changedTouches && e.changedTouches[0];
      if (t && swipeY.current != null && (t.clientY - swipeY.current) > 48) dismiss();
      swipeY.current = null;
    };
    if (!open) return null;
    injectPhoneCss();
    const closeProps = Object.assign({
      type: 'button',
      className: 'v4-gm-phone-close',
      'aria-label': 'Close'
    }, bindTap(function () { if (onClose) onClose(); }));
    const selectedCard = selected ? el('div', Object.assign({
      className: 'v4-gm-phone-card',
      role: 'button',
      tabIndex: 0,
      onTouchStart: onCardTouchStart,
      onTouchEnd: onCardTouchEnd
    }, bindTap(dismiss)),
      el('div', { className: 'v4-gm-phone-card-name' }, selected.name || selected.label || 'Selected'),
      el('div', { className: 'v4-gm-phone-card-type' }, typeLabel(selected)),
      el('div', { className: 'v4-gm-phone-card-stat' }, oneStat(selected)),
      Number.isFinite(Number(selected.lat)) ? el('button', Object.assign({
        type: 'button',
        className: 'v4-gm-phone-sv-card'
      }, bindTap(function () { enterStreet(selected.lat, selected.lng); })), 'Street View') : null
    ) : null;
    const dockEls = LAYERS.map(function (row) {
      const on = layer === row.id;
      return el('button', Object.assign({
        key: row.id,
        type: 'button',
        className: 'v4-gm-phone-dock-item' + (on ? ' is-on' : ''),
        'aria-label': row.label,
        'aria-pressed': on ? 'true' : 'false'
      }, bindTap(function () { pickLayer(row.id); })),
        el('span', {
          className: 'v4-gm-phone-dock-ico',
          dangerouslySetInnerHTML: { __html: dockLayerIcon(row.id, on) }
        }),
        el('span', { className: 'v4-gm-phone-dock-label' }, row.label)
      );
    });
    const extraChipEls = EXTRA_LAYER_CHIPS.map(function (row) {
      const on = layer === row.id;
      return el('button', Object.assign({
        key: row.id,
        type: 'button',
        className: 'v4-gm-phone-chip' + (on ? ' is-on' : '') + (row.id === 'deals' && !deals.length ? ' is-empty' : ''),
        'aria-label': row.id === 'deals' ? (deals.length ? ('Deals ' + deals.length) : 'Deals none') : row.label,
        'aria-pressed': on ? 'true' : 'false'
      }, bindTap(function () { pickLayer(row.id); })), row.id === 'deals' ? (deals.length ? ('Deals · ' + deals.length) : 'Deals · none') : row.label);
    });
    extraChipEls.push(el('button', Object.assign({
      key: 'settings',
      type: 'button',
      className: 'v4-gm-phone-chip' + (settingsOpen ? ' is-on' : ''),
      'aria-label': 'Settings',
      'aria-pressed': settingsOpen ? 'true' : 'false'
    }, bindTap(function () { setSettingsOpen(function (v) { return !v; }); })), 'Settings'));
    const settingsSheet = settingsOpen ? el('div', { className: 'v4-gm-phone-settings', role: 'listbox', 'aria-label': 'Layers' },
      el('div', { className: 'v4-gm-phone-settings-title' }, 'Layers'),
      SETTINGS_LAYERS.map(function (row) {
        const on = layer === row.id;
        return el('button', Object.assign({
          key: row.id,
          type: 'button',
          className: 'v4-gm-phone-settings-row' + (on ? ' is-on' : ''),
          'aria-pressed': on ? 'true' : 'false'
        }, bindTap(function () { pickLayer(row.id); })),
          el('span', null, row.label),
          on ? el('span', { className: 'v4-gm-phone-settings-mark' }, 'On') : null
        );
      })
    ) : null;
    const goProps = Object.assign({ type: 'button', className: 'v4-gm-phone-search-go', 'aria-label': 'Search' }, bindTap(runSearch));
    const svProps = Object.assign({ type: 'button', className: 'v4-gm-phone-sv', 'aria-label': 'Street View' }, bindTap(goStreetView));
    return el('div', { className: 'v4-gm-phone', role: 'dialog', 'aria-label': 'God Mode' },
      el('div', { className: 'v4-gm-phone-globe', ref: globeRef }),
      el('div', { className: 'v4-gm-phone-top' },
        el('div', { className: 'v4-gm-phone-live' },
          el('span', { className: 'v4-gm-phone-dot' }),
          el('span', null, 'LIVE'),
          el('span', { className: 'v4-gm-phone-utc' }, utc)
        ),
        el('div', { style: { display: 'flex', alignItems: 'center', pointerEvents: 'auto', gap: '8px' } },
          streetMode ? el('button', Object.assign({ type: 'button', className: 'v4-gm-phone-back', 'aria-label': 'Back to globe' }, bindTap(leaveStreetView)), 'Globe') : null,
          el('button', closeProps, '\u00d7')
        )
      ),
      el('form', {
        className: 'v4-gm-phone-search',
        onSubmit: function (e) { if (e && e.preventDefault) e.preventDefault(); runSearch(); },
        onMouseDown: function (e) { if (e && e.stopPropagation) e.stopPropagation(); },
        onPointerDown: function (e) { if (e && e.stopPropagation) e.stopPropagation(); }
      },
        el('input', {
          key: 'gm-phone-search',
          ref: searchInputRef,
          type: 'text',
          inputMode: 'text',
          enterKeyHint: 'search',
          autoComplete: 'off',
          autoCorrect: 'off',
          autoCapitalize: 'off',
          spellCheck: false,
          name: 'gm-addr-no-fill',
          placeholder: 'Search address or city',
          defaultValue: '',
          onMouseDown: function (e) { if (e && e.stopPropagation) e.stopPropagation(); },
          onPointerDown: function (e) { if (e && e.stopPropagation) e.stopPropagation(); },
          onChange: function (e) {
            const v = String((e && e.target && e.target.value) || '');
            setSearchQ(v);
            const qv = String(v || '').trim();
            if (!qv) {
              setSearchMsg('');
              setSearchSuggests([]);
              setSuggestHi(-1);
              clearMobileSearchPin(globeInstRef.current);
            } else if (qv.length >= 3) {
              setSearchSuggests([syntheticSuggestRow(qv)]);
              setSuggestHi(0);
            }
          },
          onKeyDown: function (e) {
            if (e && e.key === 'Escape') {
              if (e.preventDefault) e.preventDefault();
              if (e.stopPropagation) e.stopPropagation();
              setSearchField('');
              setSearchMsg('');
              setSearchSuggests([]);
              setSuggestHi(-1);
              clearMobileSearchPin(globeInstRef.current);
              return;
            }
            if (searchSuggests.length) {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSuggestHi(function (i) { return (i + 1) % searchSuggests.length; });
                return;
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSuggestHi(function (i) { return (i - 1 + searchSuggests.length) % searchSuggests.length; });
                return;
              }
              if (e.key === 'Enter' && suggestHi >= 0 && searchSuggests[suggestHi]) {
                e.preventDefault();
                pickSuggest(searchSuggests[suggestHi]);
              }
            }
          }
        }),
        el('button', Object.assign({ type: 'button', className: 'v4-gm-phone-search-clear', 'aria-label': 'Clear search', style: searchQ ? undefined : { visibility: 'hidden', pointerEvents: 'none' } }, bindTap(function () {
          setSearchField('');
          setSearchMsg('');
          setSearchSuggests([]);
          setSuggestHi(-1);
          clearMobileSearchPin(globeInstRef.current);
        })), '×'),
        el('button', goProps, searching ? '…' : 'Go'),
        el('button', svProps, 'SV'),
        searchSuggests.length ? el('div', { className: 'v4-gm-phone-suggest', role: 'listbox' },
          searchSuggests.map(function (row, idx) {
            return el('button', {
              key: (row.name || '') + idx,
              type: 'button',
              className: idx === suggestHi ? 'is-active' : '',
              role: 'option',
              onMouseDown: function (ev) { if (ev && ev.preventDefault) ev.preventDefault(); pickSuggest(row); }
            },
              el('span', { className: 'v4-gm-phone-suggest-name' }, row.title || row.name),
              row.sub ? el('span', { className: 'v4-gm-phone-suggest-sub' }, row.sub) : null
            );
          })
        ) : null
      ),
      globeError ? el('div', { className: 'v4-gm-phone-err' }, globeError) : null,
      el('div', { className: 'v4-gm-phone-sheet' },
        searchMsg ? el('div', { className: 'v4-gm-phone-search-msg' }, searchMsg) : null,
        selectedCard,
        layer === 'deals' && !feedsLoading ? el('div', { className: 'v4-gm-phone-hint' }, deals.length ? (deals.length + ' deals on globe') : 'No deal markers. Pipeline has no geocoded locations.') : (feedsLoading ? el('div', { className: 'v4-gm-phone-hint' }, 'Loading live data') : (!flights.length ? el('div', { className: 'v4-gm-phone-hint' }, 'Flights offline') : null)),
        settingsSheet,
        el('div', { className: 'v4-gm-phone-extra', 'aria-label': 'More layers' }, extraChipEls),
        el('nav', { className: 'v4-gm-phone-dock', 'aria-label': 'Layers' },
          el.apply(null, ['div', { className: 'v4-gm-phone-dock-inner' }].concat(dockEls))
        )
      )
    );
  }

  V4GodModeEarth.engine = 'phone';
  global.V4GodModeEarth = V4GodModeEarth;
  global.V4GodMode = V4GodModeEarth;
  global.GodModeEarth = V4GodModeEarth;
})(typeof window !== 'undefined' ? window : this);
