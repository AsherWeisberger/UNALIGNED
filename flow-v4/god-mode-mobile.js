/**
 * God Mode Mobile -- phone globe for UNIFY Planetary Ops.
 * Browser IIFE. Exposes window.V4GodModeEarth with props
 * { open, layer, viewer, onClose, onLayerChange }.
 * React is a global. Phone HUD + Cesium camera/photoreal (globe.gl fallback).
 * Desktop Cesium stays on its own module.
 */
(function (global) {
  'use strict';

  const React = global.React;
  if (!React) return;

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
    const localMin = function () { return new URL('flow-v4/vendor/globe.gl.min.js', global.location.href).href; };
    const localSafari = function () { return new URL('flow-v4/vendor/globe.gl.safari.min.js', global.location.href).href; };
    const cdn = 'https://cdn.jsdelivr.net/npm/globe.gl@2.35.0/dist/globe.gl.min.js';
    if (isWebKitBrowser()) return [localMin, localSafari, cdn];
    return [localMin, cdn];
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
  const MAX_SHIPS = 120;
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
  ];
  const LAYERS = [
    { id: 'all', label: 'All' },
    { id: 'weather', label: 'Wx' },
    { id: 'flights', label: 'Flights' },
    { id: 'satellites', label: 'Sats' },
    { id: 'ships', label: 'Ships' },
    { id: 'events', label: 'Events' },
  ];
  const LAYER_TYPES = { all: null, weather: ['weather'], flights: ['flight'], satellites: ['satellite', 'starlink'], ships: ['ship'], events: ['event', 'launch'] };
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

  function disposeGlobeInstance(globe) {

    if (!globe) return;

    try { globe.pauseAnimation?.(); } catch (e) {}

    try {

      const renderer = globe.renderer?.();

      if (renderer) {

        renderer.dispose?.();

        renderer.forceContextLoss?.();

      }

    } catch (e) {}

    try { globe._destructor?.(); } catch (e) {}

  }


  const SAT_TILE_MAX_LEVEL = 19;
  const EARTH_RADIUS_M = 6371000;
  const MIN_CAMERA_ALT_M = 80;
  const STREET_CAMERA_ALT_M = 160;
  const SEARCH_CAMERA_ALT_M = 12000;
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
  function killPhoneAtmosphere(viewer) {
    try {
      const scene = viewer && viewer.scene;
      if (!scene) return;
      try { if (scene.skyAtmosphere) scene.skyAtmosphere.show = false; } catch (e) {}
      try {
        if (scene.globe) {
          scene.globe.showGroundAtmosphere = false;
          scene.globe.atmosphereLightIntensity = 0;
        }
      } catch (e) {}
      try { if (scene.fog) { scene.fog.enabled = false; scene.fog.density = 0; } } catch (e) {}
    } catch (e) {}
  }
  async function enablePhonePhotoreal(Cesium, viewer, state) {
    const key = readGoogleTilesKey();
    if (!key || !Cesium || !viewer) return false;
    try {
      if (state && state.googleTileset && !(state.googleTileset.isDestroyed && state.googleTileset.isDestroyed())) {
        state.googleTileset.show = true;
        return true;
      }
    } catch (e) {}
    try { if (Cesium.GoogleMaps) Cesium.GoogleMaps.defaultApiKey = key; } catch (e) {}
    let tileset = null;
    try {
      if (typeof Cesium.createGooglePhotorealistic3DTileset === 'function') {
        try { tileset = await Cesium.createGooglePhotorealistic3DTileset({ key: key }); }
        catch (e1) { tileset = await Cesium.createGooglePhotorealistic3DTileset(key); }
      } else if (Cesium.Cesium3DTileset && Cesium.Cesium3DTileset.fromUrl) {
        tileset = await Cesium.Cesium3DTileset.fromUrl(
          'https://tile.googleapis.com/v1/3dtiles/root.json?key=' + encodeURIComponent(key),
          { showCreditsOnScreen: true }
        );
      }
      if (!tileset) return false;
      try { tileset.maximumScreenSpaceError = 4; } catch (e) {}
      viewer.scene.primitives.add(tileset);
      if (state) state.googleTileset = tileset;
      return true;
    } catch (e) {
      console.warn('[god-mode-phone] photoreal tiles failed', e);
      return false;
    }
  }
  function makeCesiumPhoneAdapter(Cesium, viewer, state) {
    const pointEntities = [];
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
      showAtmosphere: function () { killPhoneAtmosphere(viewer); return adapter; },
      atmosphereAltitude: function () { return adapter; },
      globeTileEngineUrl: function () { return adapter; },
      globeTileEngineMaxLevel: function () { return adapter; },
      globeImageUrl: function () { return adapter; },
      backgroundImageUrl: function () { return adapter; },
      pauseAnimation: function () {},
      getGlobeRadius: function () { return EARTH_RADIUS_M; },
      _destructor: function () {
        try { if (state && state.handler && state.handler.destroy) state.handler.destroy(); } catch (e) {}
        try {
          if (state && state.googleTileset && !(state.googleTileset.isDestroyed && state.googleTileset.isDestroyed())) {
            state.googleTileset.destroy();
          }
        } catch (e) {}
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
        try {
          if (dur > 0.05) viewer.camera.flyTo({ destination: dest, duration: dur });
          else viewer.camera.setView({ destination: dest });
        } catch (e) {}
        return adapter;
      },
      pointsData: function (rows) {
        for (let i = 0; i < pointEntities.length; i++) {
          try { viewer.entities.remove(pointEntities[i]); } catch (e) {}
        }
        pointEntities.length = 0;
        (rows || []).forEach(function (row) {
          const lat = Number(row.lat);
          const lng = Number(row.lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
          let height = Number(row.altM);
          if (!Number.isFinite(height)) {
            const alt = Number(row.alt);
            height = Number.isFinite(alt) ? alt * EARTH_RADIUS_M : 0;
          }
          if (!Number.isFinite(height) || height < 0) height = 0;
          if (height > 2.5e6) height = 2.5e6;
          let color = Cesium.Color.WHITE;
          try { color = Cesium.Color.fromCssColorString(String(row.color || '#d0d6e0')); } catch (e) {}
          const ent = viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(lng, lat, height),
            point: {
              pixelSize: row.type === 'starlink' ? 5 : 9,
              color: color,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 1,
              disableDepthTestDistance: 500000,
            },
          });
          ent.__gmPhone = row;
          pointEntities.push(ent);
        });
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
    };
    try {
      const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      handler.setInputAction(function (click) {
        try {
          const picked = viewer.scene.pick(click.position);
          if (Cesium.defined(picked) && picked.id && picked.id.__gmPhone && adapter._onPointClick) {
            adapter._onPointClick(picked.id.__gmPhone);
          }
        } catch (e) {}
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
      state.handler = handler;
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
    try {
      const globe = viewer.scene.globe;
      globe.enableLighting = true;
      globe.showGroundAtmosphere = false;
      globe.atmosphereLightIntensity = 0;
      globe.depthTestAgainstTerrain = true;
    } catch (e) {}
    try {
      const ssc = viewer.scene.screenSpaceCameraController;
      ssc.enableInputs = true;
      ssc.enableZoom = true;
      ssc.enableRotate = true;
      ssc.enableTilt = true;
      ssc.enableLook = true;
      ssc.enableTranslate = true;
      ssc.minimumZoomDistance = MIN_CAMERA_ALT_M;
      ssc.maximumZoomDistance = 4.5e7;
      ssc.inertiaZoom = 0.4;
      try {
        ssc.zoomEventTypes = [Cesium.CameraEventType.PINCH, Cesium.CameraEventType.WHEEL, Cesium.CameraEventType.RIGHT_DRAG];
      } catch (eZ) {}
    } catch (e) {}
    try {
      const canvas = viewer.scene.canvas;
      canvas.style.touchAction = 'none';
      canvas.style.pointerEvents = 'auto';
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
        if (Number.isFinite(h) && h < 80000) enablePhonePhotoreal(Cesium, viewer, state);
      } catch (e) {}
    };
    try { viewer.camera.moveEnd.addEventListener(onMoveEnd); } catch (e) {}
    try { viewer.resize(); } catch (e) {}
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
  async function fetchRainViewerMeta() {
    try {
      const res = await fetchWithTimeout(RAINVIEWER_META_URL, { headers: { Accept: 'application/json' } }, 8000);
      if (!res || !res.ok) return null;
      const data = await res.json();
      const host = String((data && data.host) || 'https://tilecache.rainviewer.com');
      const past = Array.isArray(data && data.radar && data.radar.past) ? data.radar.past : [];
      const nowcast = Array.isArray(data && data.radar && data.radar.nowcast) ? data.radar.nowcast : [];
      const frames = past.length ? past : nowcast;
      if (!frames.length) return null;
      const last = frames[frames.length - 1] || {};
      return { host: host, path: last.path, time: last.time, frames: frames };
    } catch (e) {
      return null;
    }
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
    if (!host.includes('127.0.0.1') && !host.includes('localhost')) {
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

    const altKm = Number.isFinite(altM) ? Math.max(0.002, altM / 100000) : 0.01;

    const cs = String(callsign || '').trim();

    const cc = String(country || '').trim();

    return {

      lat,

      lng,

      alt: Math.min(altKm, 0.35),

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

  async function fetchLaunches() {

    const cached = readLaunchCache();

    if (cached && Date.now() - Number(cached.savedAt || 0) < LAUNCH_CACHE_TTL_MS) {

      return { markers: cached.markers, list: cached.list };

    }

    try {

      const fresh = await fetchLaunchesLive();

      writeLaunchCache(fresh);

      return fresh;

    } catch (e) {

      if (cached) return { markers: cached.markers, list: cached.list };

      throw e;

    }

  }

  async function fetchLaunchesLive() {

    const url = 'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=12&mode=detailed';

    const res = await fetchWithTimeout(url);

    if (!res.ok) throw new Error('launches ' + res.status);

    const data = await res.json();

    const rows = Array.isArray(data?.results) ? data.results : [];

    const markers = [];

    const list = [];

    rows.forEach((launch) => {

      const pad = launch?.pad || {};

      const lat = Number(pad.latitude);

      const lng = Number(pad.longitude);

      const name = String(launch?.name || 'Launch').trim();

      const provider = providerName(launch);

      const when = String(launch?.net || '');

      const status = String(launch?.status?.name || 'Scheduled');

      const rocket = String(launch?.rocket?.configuration?.full_name || launch?.rocket?.configuration?.name || '').trim();

      const loc = String(pad?.location?.name || pad?.name || '').trim();

      const image = String(launch?.image || launch?.infographic || '').trim();

      list.push({ id: launch.id, name, provider, when, status, rocket, loc, image, lat, lng });

      if (Number.isFinite(lat) && Number.isFinite(lng)) {

        markers.push({

          lat,

          lng,

          alt: 0.03,

          label: `${provider} · ${name}`,

          name,

          provider,

          when,

          type: 'launch',

        });

      }

    });

    return { markers, list };

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
    if (item.type === 'satellite') return 'Live position';
    if (item.type === 'starlink') return 'On orbit';
    return '';
  }

  const PHONE_CSS = [
    '.v4-gm-phone{position:fixed;inset:0;z-index:12000;background:#05070c;color:#e8edf5;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;overflow:hidden;touch-action:none;overscroll-behavior:none;-webkit-user-select:none;user-select:none;}',
    'html.v4-godmode-phone,html.v4-godmode-phone body,body.v4-godmode-phone{touch-action:none;overscroll-behavior:none;overflow:hidden;height:100%;}',
    'body.v4-godmode-phone .hd,body.v4-godmode-phone .v6-gnav,body.v4-godmode-phone .mobile-nav-layer{visibility:hidden!important;pointer-events:none!important;}',
    '.v4-gm-phone-globe,.v4-gm-phone-globe>div,.v4-gm-phone-globe canvas{position:absolute;inset:0;z-index:0!important;touch-action:none;-webkit-user-select:none;user-select:none;transform:none;-webkit-transform:none;}',
    '.v4-gm-phone-globe canvas{display:block;width:100%!important;height:100%!important;}',
    '.v4-gm-phone-top{position:absolute;top:env(safe-area-inset-top,0px);left:env(safe-area-inset-left,0px);right:env(safe-area-inset-right,0px);z-index:2;isolation:isolate;transform:translateZ(0);-webkit-transform:translateZ(0);display:flex;align-items:center;justify-content:space-between;padding:8px 10px;pointer-events:none;}',
    '.v4-gm-phone-live{display:flex;align-items:center;gap:8px;background:#0b0d12;border:1px solid rgba(255,255,255,.22);border-radius:999px;padding:7px 12px;font-size:12px;letter-spacing:.08em;font-weight:700;color:#f2f5fa;pointer-events:none;}',
    '.v4-gm-phone-dot{width:7px;height:7px;border-radius:50%;background:#34c759;box-shadow:0 0 8px #34c759;}',
    '.v4-gm-phone-utc{opacity:.9;font-variant-numeric:tabular-nums;letter-spacing:.04em;pointer-events:none;}',
    '.v4-gm-phone-close{pointer-events:auto;touch-action:manipulation;-webkit-tap-highlight-color:transparent;min-width:44px;min-height:44px;width:44px;height:44px;border:1px solid rgba(255,255,255,.22);border-radius:50%;background:#0b0d12;color:#fff;font-size:22px;line-height:1;}',
    '.v4-gm-phone-err{position:absolute;top:calc(env(safe-area-inset-top,0px) + 64px);left:12px;right:12px;z-index:2;pointer-events:none;text-align:center;padding:8px 12px;background:#1a0c0c;border:1px solid rgba(255,80,80,.45);border-radius:10px;color:#ffd0d0;font-size:13px;font-weight:600;}',
    '.v4-gm-phone-sheet{position:absolute;left:0;right:0;bottom:0;z-index:2;isolation:isolate;transform:translateZ(0);-webkit-transform:translateZ(0);pointer-events:auto;padding-bottom:env(safe-area-inset-bottom,0px);background:#0b0d12;}',
    '.v4-gm-phone-chips{display:flex;flex-wrap:wrap;justify-content:center;align-items:stretch;gap:8px;padding:10px 12px 12px;background:#0b0d12;border-top:1px solid rgba(255,255,255,.16);}',
    '.v4-gm-phone-chip{flex:1 1 calc(33.33% - 8px);min-width:96px;min-height:44px;padding:0 14px;border-radius:999px;border:1px solid rgba(255,255,255,.22);background:#161c28;color:#f2f5fa;font-size:14px;font-weight:700;pointer-events:auto;touch-action:manipulation;-webkit-tap-highlight-color:transparent;}',
    '.v4-gm-phone-chip.is-on{background:#e8edf5;color:#0b0d12;border-color:#e8edf5;}',
    '.v4-gm-phone-card{margin:0 12px 10px;padding:14px 16px;border-radius:16px;background:#121826;border:1px solid rgba(255,255,255,.14);pointer-events:auto;}',
    '.v4-gm-phone-card-name{font-size:16px;font-weight:700;line-height:1.25;color:#f2f5fa;}',
    '.v4-gm-phone-card-type{font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.7;margin-top:3px;}',
    '.v4-gm-phone-card-stat{font-size:14px;margin-top:6px;opacity:.95;}',
    '.v4-gm-phone-hint{padding:0 16px 8px;font-size:11px;opacity:.7;color:#e8edf5;pointer-events:none;}',
    '.v4-gm-phone-search{position:absolute;top:calc(env(safe-area-inset-top,0px) + 56px);left:10px;right:10px;z-index:2;display:flex;gap:8px;pointer-events:none;}',
    '.v4-gm-phone-search input{flex:1;min-height:44px;border-radius:12px;border:1px solid rgba(255,255,255,.22);background:rgba(11,13,18,.94);color:#f2f5fa;font-size:16px;padding:0 12px;outline:none;pointer-events:auto;}',
    '.v4-gm-phone-search-go,.v4-gm-phone-sv{min-height:44px;min-width:44px;padding:0 12px;border-radius:12px;border:1px solid rgba(255,255,255,.22);background:#161c28;color:#f2f5fa;font-size:13px;font-weight:700;touch-action:manipulation;pointer-events:auto;}',
    '.v4-gm-phone-sv-card{margin-top:10px;min-height:44px;width:100%;border-radius:12px;border:1px solid rgba(255,255,255,.22);background:#e8edf5;color:#0b0d12;font-size:14px;font-weight:700;touch-action:manipulation;}',
    '.v4-gm-phone-back{pointer-events:auto;touch-action:manipulation;-webkit-tap-highlight-color:transparent;min-height:44px;padding:0 14px;border-radius:12px;border:1px solid rgba(255,255,255,.22);background:#e8edf5;color:#0b0d12;font-size:13px;font-weight:700;}',
    '.v4-gm-phone-globe .cesium-viewer,.v4-gm-phone-globe .cesium-viewer-cesiumWidgetContainer,.v4-gm-phone-globe .cesium-widget,.v4-gm-phone-globe .cesium-widget canvas,.v4-gm-phone-cesium{position:absolute;inset:0;width:100%!important;height:100%!important;}',
    '.v4-gm-phone-globe .cesium-viewer-toolbar,.v4-gm-phone-globe .cesium-viewer-animationContainer,.v4-gm-phone-globe .cesium-viewer-timelineContainer,.v4-gm-phone-globe .cesium-viewer-fullscreenContainer{display:none!important;}',
    '.v4-gm-phone-search-msg{padding:6px 16px 0;font-size:12px;opacity:.75;}',
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
  function bindTap(fn) {
    return {
      onPointerUp: function (e) { e.preventDefault(); e.stopPropagation(); fn(); },
      onClick: function (e) { e.preventDefault(); e.stopPropagation(); fn(); }
    };
  }
  function streetViewUrl(lat, lng) {
    return '';
  }
  function openStreetView(lat, lng) {
    try {
      if (typeof global.__gmPhoneStreetView === 'function') global.__gmPhoneStreetView(lat, lng);
    } catch (e) {}
  }
  async function geocodeAddress(query) {
    const q = String(query || '').trim();
    if (!q) return null;
    try {
      const res = await fetchWithTimeout('https://photon.komoot.io/api/?limit=1&q=' + encodeURIComponent(q), { headers: { Accept: 'application/json' } }, 8000);
      if (res && res.ok) {
        const data = await res.json();
        const hit = data && data.features && data.features[0];
        const coords = hit && hit.geometry && hit.geometry.coordinates;
        if (coords && coords.length >= 2 && Number.isFinite(Number(coords[1])) && Number.isFinite(Number(coords[0]))) {
          const props = hit.properties || {};
          const name = props.name || props.street || q;
          const bits = [props.city || props.town || props.village, props.state, props.country].filter(Boolean);
          return { lat: Number(coords[1]), lng: Number(coords[0]), name: bits.length ? (name + ', ' + bits.join(', ')) : name };
        }
      }
    } catch (e) {}
    try {
      const res = await fetchWithTimeout('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=' + encodeURIComponent(q), { headers: { Accept: 'application/json' } }, 8000);
      if (res && res.ok) {
        const rows = await res.json();
        const hit = Array.isArray(rows) ? rows[0] : null;
        const lat = Number(hit && hit.lat);
        const lng = Number(hit && hit.lon);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          return { lat: lat, lng: lng, name: String((hit && (hit.display_name || hit.name)) || q) };
        }
      }
    } catch (e) {}
    try {
      const city = q.split(',')[0].trim();
      const res = await fetchWithTimeout('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(city) + '&count=1&language=en&format=json', {}, 8000);
      if (res && res.ok) {
        const data = await res.json();
        const hit = Array.isArray(data && data.results) ? data.results[0] : null;
        if (hit && Number.isFinite(hit.latitude)) {
          return { lat: hit.latitude, lng: hit.longitude, name: [hit.name, hit.admin1, hit.country].filter(Boolean).join(', ') || q };
        }
      }
    } catch (e) {}
    return null;
  }

  function V4GodModeEarth(props) {
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
    const [earthEvents, setEarthEvents] = React.useState([]);
    const [selected, setSelected] = React.useState(null);
    const [globeError, setGlobeError] = React.useState('');
    const [feedsLoading, setFeedsLoading] = React.useState(false);
    const [searchQ, setSearchQ] = React.useState('');
    const [searchMsg, setSearchMsg] = React.useState('');
    const [searching, setSearching] = React.useState(false);
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
        if (e.key === 'Escape') {
          if (selectedRef.current) { setSelected(null); return; }
          if (onClose) onClose();
        }
      };
      window.addEventListener('keydown', onKey);
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
        if (item.alt == null && item.altM != null) item.alt = Math.min(0.05, (Number(item.altM) || 0) / 100000);
        if (item.size == null) item.size = item.type === 'starlink' ? 0.14 : 0.28;
        if (!item.color) item.color = '#d0d6e0';
        rows.push(item);
      };
      weather.forEach(push);
      flights.forEach(push);
      satellites.forEach(push);
      (starlink.points || []).forEach(push);
      ships.forEach(push);
      earthEvents.forEach(push);
      (launches.markers || []).forEach(push);
      return rows;
    }, [weather, flights, satellites, starlink, ships, earthEvents, launches]);
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
      if (fp === pointsFpRef.current) return;
      pointsFpRef.current = fp;
      try {
        globe.pointsData(rows).pointLat("lat").pointLng("lng")
          .pointAltitude(function (d) { return Number(d.alt) || 0.01; })
          .pointRadius(function (d) { return Number(d.size) || 0.22; })
          .pointColor(function (d) {
            const g = globeInstRef.current;
            if (g && !isNearSide(g, d.lat, d.lng)) return "rgba(0,0,0,0)";
            return d.color || "#d0d6e0";
          })
          .pointResolution(6).pointsMerge(false).pointsTransitionDuration(0)
          .pointLabel(function (d) { return d.label || d.name || ""; })
          .onPointClick(function (pt) {
            setSelected(pt || null);
            if (pt && Number.isFinite(Number(pt.lat))) {
              try { globe.pointOfView({ lat: Number(pt.lat), lng: Number(pt.lng), altitude: SEARCH_ALT_RADII }, 700); } catch (e) {}
            }
          });
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
      Promise.all([
        loadFeed('weather', fetchWeatherGrid, setWeather),
        loadFeed('flights', loadFlights, setFlights),
        loadFeed('satellites', fetchIss, setSatellites),
        loadFeed('starlink', loadStarlink, setStarlink),
        loadFeed('ships', function () { return fetchShips().then(function (v) { return (v && v.rows) || []; }); }, setShips),
        loadFeed('events', loadEvents, setEarthEvents),
        loadFeed('launches', fetchLaunches, setLaunches),
      ]).then(function () { if (!cancelled) setFeedsLoading(false); });
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
      return function () {
        cancelled = true;
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
    };
    const flyTo = function (lat, lng, altitude) {
      const g = globeInstRef.current;
      if (!g || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return;
      try { const c = g.controls(); if (c) c.autoRotate = false; } catch (e) {}
      try { g.pointOfView({ lat: Number(lat), lng: Number(lng), altitude: altitude == null ? SEARCH_ALT_RADII : altitude }, 900); } catch (e) {}
    };
    const runSearch = function () {
      const q = String(searchQ || '').trim();
      if (!q || searching) return;
      setSearching(true);
      setSearchMsg('Searching…');
      geocodeAddress(q).then(function (hit) {
        setSearching(false);
        if (!hit) { setSearchMsg('No match'); return; }
        focusRef.current = hit;
        setSearchMsg(hit.name || q);
        setSelected({ type: 'place', name: hit.name || q, lat: hit.lat, lng: hit.lng, label: hit.name || q, source: 'Search' });
        flyTo(hit.lat, hit.lng, SEARCH_ALT_RADII);
      }).catch(function () {
        setSearching(false);
        setSearchMsg('Search failed');
      });
    };
    const currentFocus = function () {
      if (focusRef.current && Number.isFinite(focusRef.current.lat)) return focusRef.current;
      if (selected && Number.isFinite(Number(selected.lat))) return { lat: Number(selected.lat), lng: Number(selected.lng) };
      try {
        const g = globeInstRef.current;
        const pov = g && g.pointOfView && g.pointOfView();
        if (pov && Number.isFinite(Number(pov.lat))) return { lat: Number(pov.lat), lng: Number(pov.lng) };
      } catch (e) {}
      return null;
    };
    const enterStreet = function (lat, lng) {
      const a = Number(lat);
      const b = Number(lng);
      if (!Number.isFinite(a) || !Number.isFinite(b)) { setSearchMsg('Search or tap a point first'); return; }
      const g = globeInstRef.current;
      if (!g) return;
      try { const c = g.controls(); if (c) c.autoRotate = false; } catch (e) {}
      if (g.__cesium) {
        const Cesium = g._cesium;
        const viewer = g._viewer;
        try { g._streetPrev = viewer.camera.position.clone(); } catch (e) {}
        try {
          viewer.scene.screenSpaceCameraController.minimumZoomDistance = MIN_CAMERA_ALT_M;
          viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(b, a, STREET_CAMERA_ALT_M),
            orientation: { heading: 0, pitch: Cesium.Math.toRadians(-38), roll: 0 },
            duration: 1.55,
          });
        } catch (e) {}
        enablePhonePhotoreal(Cesium, viewer, g._state);
      } else {
        try { g.pointOfView({ lat: a, lng: b, altitude: STREET_ALT_RADII }, 1100); } catch (e) {}
        syncGlobeCameraNear(g);
      }
      setStreetMode(true);
      setSearchMsg('Street height · stay on globe');
    };
    global.__gmPhoneStreetView = enterStreet;
    const leaveStreetView = function () {
      const g = globeInstRef.current;
      if (g && g.__cesium && g._streetPrev) {
        try { g._viewer.camera.flyTo({ destination: g._streetPrev, duration: 1.2 }); } catch (e) {}
        g._streetPrev = null;
      } else if (g) {
        try {
          const p = g.pointOfView && g.pointOfView();
          g.pointOfView({
            lat: p && Number.isFinite(Number(p.lat)) ? Number(p.lat) : 28,
            lng: p && Number.isFinite(Number(p.lng)) ? Number(p.lng) : -20,
            altitude: 2.15,
          }, 1000);
        } catch (e) {}
      }
      setStreetMode(false);
      setSearchMsg('');
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
    const chipEls = LAYERS.map(function (row) {
      return el('button', Object.assign({
        key: row.id,
        type: 'button',
        className: 'v4-gm-phone-chip' + (layer === row.id ? ' is-on' : '')
      }, bindTap(function () { pickLayer(row.id); })), row.label);
    });
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
        onSubmit: function (e) { if (e && e.preventDefault) e.preventDefault(); runSearch(); }
      },
        el('input', {
          type: 'search',
          enterKeyHint: 'search',
          autoComplete: 'off',
          autoCorrect: 'off',
          placeholder: 'Search address or city',
          value: searchQ,
          onChange: function (e) { setSearchQ(e.target.value); }
        }),
        el('button', goProps, searching ? '…' : 'Go'),
        el('button', svProps, 'SV')
      ),
      globeError ? el('div', { className: 'v4-gm-phone-err' }, globeError) : null,
      el('div', { className: 'v4-gm-phone-sheet' },
        searchMsg ? el('div', { className: 'v4-gm-phone-search-msg' }, searchMsg) : null,
        selectedCard,
        feedsLoading ? el('div', { className: 'v4-gm-phone-hint' }, 'Loading live data') : (!flights.length ? el('div', { className: 'v4-gm-phone-hint' }, 'Flights offline') : null),
        el.apply(null, ['div', { className: 'v4-gm-phone-chips' }].concat(chipEls))
      )
    );
  }

  V4GodModeEarth.engine = 'phone';
  global.V4GodModeEarth = V4GodModeEarth;
})(typeof window !== 'undefined' ? window : this);
