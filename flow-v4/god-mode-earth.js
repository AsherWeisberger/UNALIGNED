/**
 * God Mode Earth — 3D globe with live weather, flights, satellites, and launches.
 * Loads globe.gl on demand (local vendor copy first, then CDNs). Esri satellite tiles on deep zoom.
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

  const GLOBE_SCRIPT_CANDIDATES = [
    () => new URL('flow-v4/vendor/globe.gl.safari.min.js', global.location.href).href,
    () => new URL('flow-v4/vendor/globe.gl.min.js', global.location.href).href,
    'https://cdn.jsdelivr.net/npm/globe.gl@2.35.0/dist/globe.gl.min.js',
  ];
  let globeLibPromise = null;

  const EARTH_IMG = 'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg';
  const BUMP_IMG = 'https://unpkg.com/three-globe/example/img/earth-topology.png';
  const SKY_IMG = 'https://unpkg.com/three-globe/example/img/night-sky.png';
  // Local copy — the old unpkg .../img/earth-clouds.png URL 404s.
  const CLOUDS_IMG = assetUrl('flow-v4/assets/earth-clouds.png');
  const WATER_IMG = 'https://unpkg.com/three-globe/example/img/earth-water.png';
  const TEMP_LEGEND = [
    { label: '95°+ hot', color: '#ff3b30' },
    { label: '82° warm', color: '#ff9500' },
    { label: '68° mild', color: '#ffd60a' },
    { label: '50° cool', color: '#34c759' },
    { label: '32° cold', color: '#5ac8fa' },
    { label: 'freezing', color: '#5e5ce6' },
  ];
  const WEATHER_MODES = [
    { id: 'temp', label: 'Temperature', glyph: '◐', hint: 'Colored heat map + city temps. Warmer = red, colder = blue.' },
    { id: 'precip', label: 'Rain', glyph: '☔', hint: 'Live rain radar on the globe. Green/yellow/red = light to heavy rain.' },
    { id: 'wind', label: 'Wind', glyph: '〰', hint: 'Arrows show wind direction and speed at each city.' },
  ];
  const SAT_TILE_URL = (x, y, l) =>
    `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${l}/${y}/${x}`;
  const SAT_DETAIL_ALT = 0.62;
  // Level 15 ≈ 4m/px — plenty of ground detail. Higher levels flood the GPU
  // with tile textures during pan/rotate and kill the WebGL context.
  const SAT_TILE_MAX_LEVEL = 15;
  const AUTOROTATE_PAUSE_ALT = 1.15;
  const AUTOROTATE_RESUME_ALT = 1.6;
  const MAX_FLIGHT_POINTS = 300;
  const FLIGHT_POINT_SIZE = 0.011;
  const FLIGHT_POINT_ALT = 0.002;
  const FETCH_TIMEOUT_MS = 18000;
  const WEATHER_PROXY_TIMEOUT_MS = 8000;
  const LAUNCH_CACHE_KEY = 'v4-godmode-launch-cache-v1';
  const EONET_CACHE_KEY = 'v4-godmode-eonet-cache-v1';
  const LAUNCH_CACHE_TTL_MS = 25 * 60 * 1000;
  const EONET_CACHE_TTL_MS = 10 * 60 * 1000;
  const FLIGHT_HUBS = [
    [40.71, -74.01], [34.05, -118.24], [51.51, -0.13], [35.68, 139.69],
    [-33.87, 151.21], [25.20, 55.27],
  ];

  const WEATHER_CITIES = [
    ['New York', 40.71, -74.01], ['Los Angeles', 34.05, -118.24], ['Chicago', 41.88, -87.63],
    ['London', 51.51, -0.13], ['Paris', 48.86, 2.35], ['Berlin', 52.52, 13.41],
    ['Moscow', 55.76, 37.62], ['Dubai', 25.20, 55.27], ['Mumbai', 19.08, 72.88],
    ['Singapore', 1.35, 103.82], ['Tokyo', 35.68, 139.69], ['Seoul', 37.57, 126.98],
    ['Sydney', -33.87, 151.21], ['São Paulo', -23.55, -46.63], ['Mexico City', 19.43, -99.13],
    ['Toronto', 43.65, -79.38], ['Cairo', 30.04, 31.24], ['Lagos', 6.52, 3.38],
    ['Johannesburg', -26.20, 28.04], ['Nairobi', -1.29, 36.82], ['Beijing', 39.90, 116.41],
    ['Shanghai', 31.23, 121.47], ['Hong Kong', 22.32, 114.17], ['Bangkok', 13.76, 100.50],
    ['Jakarta', -6.21, 106.85], ['Istanbul', 41.01, 28.98], ['Riyadh', 24.71, 46.67],
    ['Tel Aviv', 32.09, 34.78], ['Reykjavik', 64.15, -21.94], ['Anchorage', 61.22, -149.90],
    ['Honolulu', 21.31, -157.86], ['Buenos Aires', -34.60, -58.38], ['Santiago', -33.45, -70.67],
    ['Vancouver', 49.28, -123.12], ['Miami', 25.76, -80.19], ['Houston', 29.76, -95.37],
    ['Seattle', 47.61, -122.33], ['Denver', 39.74, -104.99], ['Madrid', 40.42, -3.70],
    ['Rome', 41.90, 12.50], ['Stockholm', 59.33, 18.07],
  ];

  const LAYERS = [
    { id: 'all', label: 'God mode', glyph: '◉' },
    { id: 'weather', label: 'Weather', glyph: '☁' },
    { id: 'events', label: 'Events', glyph: '⚡' },
    { id: 'flights', label: 'Flights', glyph: '✈' },
    { id: 'satellites', label: 'Satellites', glyph: '◎' },
    { id: 'launches', label: 'Launches', glyph: '▲' },
  ];

  let rocketElementProto = null;
  let planeElementProto = null;

  function assetUrl(path) {
    try {
      return new URL(path, global.location.href).href;
    } catch (e) {
      return path;
    }
  }

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

  function colorWithAlpha(color, alpha) {
    const a = Math.max(0, Math.min(1, Number(alpha) || 0.65));
    const hex = String(color || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(hex)) {
      const n = parseInt(hex.slice(1), 16);
      const r = (n >> 16) & 255;
      const g = (n >> 8) & 255;
      const b = n & 255;
      return `rgba(${r},${g},${b},${a})`;
    }
    return hex || `rgba(140,140,140,${a})`;
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

  // Open-Meteo uses WMO weather codes (0–99), unlike wttr.in's WWO codes.
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

  function windArcEnd(lat, lng, deg, speed) {
    const d = Number(deg);
    const spd = Number(speed);
    if (!Number.isFinite(d) || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { lat, lng };
    }
    const len = Math.min(6, Math.max(1.2, (Number.isFinite(spd) ? spd : 8) / 6));
    const rad = (d * Math.PI) / 180;
    const cosLat = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
    return {
      lat: lat + len * Math.cos(rad) * 0.55,
      lng: lng + (len * Math.sin(rad)) / cosLat,
    };
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
    const host = String(window.location?.hostname || '').toLowerCase();
    try {
      const origin = String(window.location?.origin || '').replace(/\/$/, '');
      if (origin) bases.push(origin);
    } catch (e) {}
    if (!host.includes('127.0.0.1') && !host.includes('localhost')) {
      bases.push('https://mac-studio.tail50d3a2.ts.net');
    }
    bases.push('http://127.0.0.1:8767');
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

  function buildRadarFrameUrl(host, frame, z, x, y) {
    const base = String(host || 'https://tilecache.rainviewer.com').replace(/\/$/, '');
    const path = String(frame?.path || '').trim();
    if (!path) return '';
    return `${base}${path}/512/${z}/${x}/${y}/2/1_0.png`;
  }

  function loadRadarImage(url) {
    return new Promise((resolve) => {
      if (!url) {
        resolve(null);
        return;
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  // RainViewer tiles are Web-Mercator; the globe texture is equirectangular.
  // Stitch the z1 2x2 world composite, then remap rows so rain lands on the
  // correct latitudes instead of drifting toward the poles.
  async function buildRadarEquirectCanvas(host, frame) {
    const tile = 512;
    const merc = document.createElement('canvas');
    merc.width = tile * 2;
    merc.height = tile * 2;
    const mctx = merc.getContext('2d');
    if (!mctx) return null;
    let drew = 0;
    const jobs = [];
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 2; x++) {
        jobs.push((async () => {
          const img = await loadRadarImage(buildRadarFrameUrl(host, frame, 1, x, y));
          if (img) {
            mctx.drawImage(img, x * tile, y * tile, tile, tile);
            drew++;
          }
        })());
      }
    }
    await Promise.all(jobs);
    if (!drew) return null;

    const out = document.createElement('canvas');
    out.width = 1024;
    out.height = 512;
    const octx = out.getContext('2d');
    if (!octx) return null;
    const MAX_LAT = 85.0511;
    for (let row = 0; row < out.height; row++) {
      const lat = 90 - ((row + 0.5) / out.height) * 180;
      if (lat > MAX_LAT || lat < -MAX_LAT) continue;
      const phi = (lat * Math.PI) / 180;
      const mercY = 0.5 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / (2 * Math.PI);
      const srcY = mercY * merc.height;
      octx.drawImage(merc, 0, srcY, merc.width, 1, 0, row, out.width, 1);
    }
    return out;
  }

  // window.THREE is never loaded on this site — the globe.gl bundle keeps its
  // copy private. Instead of constructing meshes we clone live scene objects.
  function findGlobeMesh(globe) {
    let found = null;
    try {
      const mat = globe.globeMaterial();
      globe.scene().traverse((o) => {
        if (!found && o.isMesh && o.material === mat) found = o;
      });
    } catch (e) {}
    return found;
  }

  function makeShellFromGlobe(base, scale, mutateMaterial) {
    const mesh = base.clone(false);
    mesh.geometry = base.geometry;
    // material.clone() crashes in this vendor build (copies a null color
    // field), so build a fresh instance of the same material class.
    const mat = new base.material.constructor();
    mat.transparent = true;
    mat.depthWrite = false;
    mutateMaterial(mat);
    mesh.material = mat;
    mesh.scale.setScalar(scale);
    mesh.visible = false;
    base.parent.add(mesh);
    return mesh;
  }

  // Manual world→screen projection. The vendored build's getScreenCoords and
  // camera.projectionMatrix are broken (NaN aspect), but the view matrix is
  // sound, so we apply our own perspective transform.
  function projectToScreen(globe, lat, lng, alt, w, h) {
    if (!(w > 0) || !(h > 0)) return null;
    let p = null;
    let cam = null;
    try {
      p = globe.getCoords(lat, lng, alt);
      cam = globe.camera();
    } catch (e) {
      return null;
    }
    const mv = cam?.matrixWorldInverse?.elements;
    if (!p || !mv) return null;
    const vx = mv[0] * p.x + mv[4] * p.y + mv[8] * p.z + mv[12];
    const vy = mv[1] * p.x + mv[5] * p.y + mv[9] * p.z + mv[13];
    const vz = mv[2] * p.x + mv[6] * p.y + mv[10] * p.z + mv[14];
    if (vz >= 0) return null;
    const f = 1 / Math.tan(((Number(cam.fov) || 50) * Math.PI) / 360);
    const x = (((f / (w / h)) * (vx / -vz)) + 1) / 2 * w;
    const y = (1 - f * (vy / -vz)) / 2 * h;
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }

  function angularDistanceDeg(lat1, lng1, lat2, lng2) {
    const r = Math.PI / 180;
    const a = Math.sin(lat1 * r) * Math.sin(lat2 * r)
      + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lng2 - lng1) * r);
    return Math.acos(Math.min(1, Math.max(-1, a))) / r;
  }

  function viewerLng(viewer) {
    const raw = viewer?.lng ?? viewer?.lon;
    return Number(raw);
  }

  function cleanGroundName(item) {
    const raw = item?.label || item?.name || item?.callsign || item?.title || item?.provider || 'Ground point';
    return String(raw).replace(/\s+·\s+.*/, '').trim() || 'Ground point';
  }

  function coordLabel(lat, lng) {
    const a = Number(lat);
    const b = Number(lng);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 'Coordinates unavailable';
    return `${a.toFixed(4)}, ${b.toFixed(4)}`;
  }

  function osmEmbedUrl(lat, lng) {
    const a = Number(lat);
    const b = Number(lng);
    const dLat = 0.014;
    const dLng = 0.02;
    return `https://www.openstreetmap.org/export/embed.html?bbox=${b - dLng}%2C${a - dLat}%2C${b + dLng}%2C${a + dLat}&layer=mapnik&marker=${a}%2C${b}`;
  }

  function groundLinks(lat, lng) {
    const a = Number(lat);
    const b = Number(lng);
    const q = `${a},${b}`;
    return {
      streetView: `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${encodeURIComponent(q)}`,
      googleMaps: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`,
      osm: `https://www.openstreetmap.org/?mlat=${a}&mlon=${b}#map=16/${a}/${b}`,
      panoramax: `https://api.panoramax.xyz/#focus=map&map=17/${a}/${b}`,
    };
  }

  function isGroundable(item) {
    return item && Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lng));
  }

  function flightPointsForGlobe(rows) {
    return rows.slice(0, MAX_FLIGHT_POINTS).map((f) => ({
      ...f,
      size: FLIGHT_POINT_SIZE,
      alt: FLIGHT_POINT_ALT,
      color: flightAltColor(f.altitudeFt),
      label: f.label || f.callsign || 'Flight',
    }));
  }

  function buildRocketElement() {
    if (rocketElementProto) return rocketElementProto.cloneNode(true);
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'v4-god-rocket-marker';
    el.innerHTML = [
      '<div class="v4-god-rocket-pad">',
      '  <span class="v4-god-rocket-icon">▲</span>',
      '  <span class="v4-god-rocket-pulse"></span>',
      '</div>',
    ].join('');
    rocketElementProto = el;
    return el.cloneNode(true);
  }

  function buildPlaneElement() {
    if (planeElementProto) return planeElementProto.cloneNode(true);
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'v4-god-plane-marker';
    el.innerHTML = [
      '<svg viewBox="0 0 24 24" aria-hidden="true">',
      '  <path d="M12 2.3 15.1 11l6.6 2.1v2.1l-5.8-.5 1.9 5.1-1.7 1-4.1-4.3-4.1 4.3-1.7-1 1.9-5.1-5.8.5v-2.1L8.9 11 12 2.3Z" fill="currentColor"/>',
      '</svg>',
    ].join('');
    planeElementProto = el;
    return el.cloneNode(true);
  }

  function markerHorizonVisible(globe, marker, marginDeg) {
    let pov = null;
    try { pov = globe.pointOfView(); } catch (e) { return false; }
    const povLat = Number(pov?.lat);
    const povLng = Number(pov?.lng);
    const alt = Number(pov?.altitude);
    if (!Number.isFinite(povLat) || !Number.isFinite(povLng)) return false;
    const horizonDeg = (Math.acos(1 / (1 + Math.max(0.05, Number.isFinite(alt) ? alt : 2.2))) * 180) / Math.PI;
    return angularDistanceDeg(povLat, povLng, marker.lat, marker.lng) <= horizonDeg - (Number(marginDeg) || 2);
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
      if (!ac || typeof ac !== 'object') continue;
      const lat = Number(ac.lat);
      const lng = Number(ac.lon ?? ac.lng);
      const altRaw = ac.alt_baro ?? ac.alt_geom;
      const altNum = Number(altRaw);
      const altM = Number.isFinite(altNum) ? altNum * 0.3048 : null;
      const gs = Number(ac.gs);
      const vel = Number.isFinite(gs) ? gs * 0.514444 : null;
      const key = String(ac.hex || ac.flight || '').trim();
      if (key && seen.has(key)) continue;
      const row = flightRowFromCoords(lat, lng, altM, vel, Number(ac.track), ac.flight, '', key);
      if (row) {
        if (key) seen.add(key);
        out.push(row);
      }
    }
    return out;
  }

  async function fetchAdsbHubFlights(lat, lng) {
    const res = await fetchWithTimeout(
      `https://api.airplanes.live/v2/point/${lat}/${lng}/200`,
      { headers: { Accept: 'application/json', 'User-Agent': 'UNALIGNED-GodMode/1.0' } },
      16000
    );
    if (!res.ok) return [];
    const data = await res.json();
    return parseAdsbAircraft(data?.ac);
  }

  // Sequential with a gap — airplanes.live allows ~1 request/second, so
  // firing all hubs in parallel gets most of them rate-limited.
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

  async function fetchOpenMeteoGrid() {
    const lats = WEATHER_CITIES.map((c) => c[1]).join(',');
    const lngs = WEATHER_CITIES.map((c) => c[2]).join(',');
    const url = 'https://api.open-meteo.com/v1/forecast'
      + `?latitude=${lats}&longitude=${lngs}`
      + '&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m'
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

  async function fetchWeatherGrid() {
    try {
      return await fetchOpenMeteoGrid();
    } catch (e) {
      console.warn('[god-mode] open-meteo failed, trying Mac proxy', e);
    }
    const data = await fetchGodModeProxy('/god-mode/weather', WEATHER_PROXY_TIMEOUT_MS);
    if (data?.ok && Array.isArray(data.cities) && data.cities.length) {
      return data.cities.map(mapWeatherRow).filter((row) => row.name && Number.isFinite(row.lat));
    }
    throw new Error('weather grid failed');
  }

  async function fetchFlights() {
    try {
      const data = await fetchGodModeProxy('/god-mode/flights', 15000);
      if (data?.ok) {
        const rows = parseFlightStates(data.states);
        if (rows.length) return rows;
      }
    } catch (e) {
      console.warn('[god-mode] Mac flight proxy failed, trying browser ADS-B', e);
    }
    try {
      const rows = await fetchAdsbFlightsMerged();
      if (rows.length) return rows;
    } catch (e) {
      console.warn('[god-mode] live ADS-B failed', e);
    }
    throw new Error('no live flight data');
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
            alt: 0.05,
            text: 'ISS',
            labelSize: 0.55,
            color: '#64d2ff',
            label: 'ISS',
            name: 'International Space Station',
            type: 'satellite',
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
        alt: 0.05,
        text: 'ISS',
        labelSize: 0.55,
        color: '#64d2ff',
        label: 'ISS',
        name: String(row.name || 'ISS'),
        type: 'satellite',
      };
    }).filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lng));
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

  // Launch Library allows ~15 calls/hour — serve from cache and only refetch
  // when stale, otherwise the feed rate-limits itself into permanent failure.
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

  // One full ISS orbit (~92 min) as 10 sampled points → drawn as a path ring.
  async function fetchIssTrail() {
    const now = Math.floor(Date.now() / 1000);
    const stamps = [];
    for (let i = 0; i < 10; i++) stamps.push(now - 2760 + Math.round(i * 613));
    const res = await fetchWithTimeout(
      `https://api.wheretheiss.at/v1/satellites/25544/positions?timestamps=${stamps.join(',')}&units=kilometers`,
      {},
      12000
    );
    if (!res.ok) throw new Error('iss trail ' + res.status);
    const rows = await res.json();
    const pts = (Array.isArray(rows) ? rows : [])
      .map((r) => [Number(r.latitude), Number(r.longitude), 0.05])
      .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    return pts.length >= 4 ? [pts] : [];
  }

  async function fetchRadarMeta() {
    const res = await fetchWithTimeout('https://api.rainviewer.com/public/weather-maps.json');
    if (!res.ok) return null;
    const data = await res.json();
    const host = String(data?.host || 'https://tilecache.rainviewer.com');
    const past = Array.isArray(data?.radar?.past) ? data.radar.past : [];
    const nowcast = Array.isArray(data?.radar?.nowcast) ? data.radar.nowcast : [];
    const frames = past.length ? past : nowcast;
    if (!frames.length) return null;
    return { host, frames, frameIdx: frames.length - 1 };
  }

  function V4GodModeEarth(props) {
    const open = !!props.open;
    const activeLayer = String(props.layer || 'weather');
    const viewer = props.viewer || {};
    const onClose = props.onClose;
    const onLayerChange = props.onLayerChange;

    const globeRef = React.useRef(null);
    const globeInstRef = React.useRef(null);
    const radarTimerRef = React.useRef(null);
    const radarMeshRef = React.useRef(null);
    const cloudMeshRef = React.useRef(null);
    const radarTexCacheRef = React.useRef(null);
    const texProtoRef = React.useRef(null);
    const rocketOverlayRef = React.useRef(null);
    const flightOverlayRef = React.useRef(null);
    const radarBusyRef = React.useRef(false);
    const applyLayersRef = React.useRef(() => {});
    const syncStreetRef = React.useRef(() => {});
    const resizeRef = React.useRef(() => {});
    const viewerRef = React.useRef(viewer);
    const layerRef = React.useRef(activeLayer);
    const weatherModeRef = React.useRef('temp');
    const deepZoomRef = React.useRef(false);
    const radarGlobeUrlRef = React.useRef('');
    const cloudSpinRef = React.useRef(null);

    const [layer, setLayer] = React.useState(activeLayer);
    const [weatherMode, setWeatherMode] = React.useState('temp');
    const [globeReady, setGlobeReady] = React.useState(false);
    const [feedsLoading, setFeedsLoading] = React.useState(true);
    const [errors, setErrors] = React.useState({});
    const [weather, setWeather] = React.useState([]);
    const [flights, setFlights] = React.useState([]);
    const [satellites, setSatellites] = React.useState([]);
    const [launches, setLaunches] = React.useState({ markers: [], list: [] });
    const [earthEvents, setEarthEvents] = React.useState([]);
    const [radar, setRadar] = React.useState(null);
    const [issTrail, setIssTrail] = React.useState([]);
    const [canReset, setCanReset] = React.useState(false);
    const [zoomLabel, setZoomLabel] = React.useState('Orbital view');
    const [stats, setStats] = React.useState({ flights: 0, sats: 0, launches: 0, cities: 0, events: 0 });
    const [selected, setSelected] = React.useState(null);
    const [groundTarget, setGroundTarget] = React.useState(null);
    const [globeError, setGlobeError] = React.useState('');
    const [layerError, setLayerError] = React.useState('');

    React.useEffect(() => {
      setLayer(activeLayer);
      layerRef.current = activeLayer;
    }, [activeLayer]);

    React.useEffect(() => {
      viewerRef.current = viewer;
    }, [viewer]);

    React.useEffect(() => {
      if (!open) return undefined;
      const onKey = (e) => {
        if (e.key === 'Escape') onClose?.();
      };
      window.addEventListener('keydown', onKey);
      document.body.classList.add('v4-godmode-open');
      return () => {
        window.removeEventListener('keydown', onKey);
        document.body.classList.remove('v4-godmode-open');
      };
    }, [open, onClose]);

    React.useEffect(() => {
      if (!open) document.body.classList.remove('v4-godmode-open');
    }, [open]);

    const resizeGlobe = React.useCallback(() => {
      const globe = globeInstRef.current;
      const el = globeRef.current;
      if (!globe || !el) return;
      const w = Math.max(320, el.clientWidth || el.offsetWidth || 0);
      const h = Math.max(320, el.clientHeight || el.offsetHeight || 0);
      if (w > 0 && h > 0) globe.width(w).height(h);
    }, []);

    const syncZoomLabel = React.useCallback((globe) => {
      if (!globe) return;
      try {
        const pov = globe.pointOfView();
        const alt = Number(pov?.altitude);
        if (alt >= 2.4) setZoomLabel('Orbital view');
        else if (alt >= 1.2) setZoomLabel('Continental view');
        else if (alt >= SAT_DETAIL_ALT) setZoomLabel('Satellite imagery · scroll to zoom closer');
        else setZoomLabel('Ground detail · Esri satellite tiles');
      } catch (e) {
        console.warn('[god-mode] zoom label sync failed', e);
      }
    }, []);

    const inspectPoint = React.useCallback((item, altitude, duration) => {
      const pick = item || null;
      setSelected(pick);
      if (isGroundable(pick)) {
        setGroundTarget(pick);
        const g = globeInstRef.current;
        if (g) {
          g.pointOfView({
            lat: Number(pick.lat),
            lng: Number(pick.lng),
            altitude: Number(altitude) || 1.35,
          }, Number(duration) || 1000);
        }
      }
    }, []);

    const updateRocketOverlay = React.useCallback(() => {
      const overlay = rocketOverlayRef.current;
      const globe = globeInstRef.current;
      if (!overlay || !globe || !overlay.childElementCount) return;
      for (let i = 0; i < overlay.children.length; i++) {
        const el = overlay.children[i];
        const m = el.__godMarker;
        if (!m) continue;
        if (!markerHorizonVisible(globe, m, 2)) {
          if (el.style.display !== 'none') el.style.display = 'none';
          continue;
        }
        const c = projectToScreen(globe, m.lat, m.lng, 0.006, overlay.clientWidth, overlay.clientHeight);
        if (!c) {
          if (el.style.display !== 'none') el.style.display = 'none';
          continue;
        }
        if (el.style.display === 'none') el.style.display = '';
        el.style.left = c.x + 'px';
        el.style.top = c.y + 'px';
      }
    }, []);

    const updateFlightOverlay = React.useCallback(() => {
      const overlay = flightOverlayRef.current;
      const globe = globeInstRef.current;
      if (!overlay || !globe || !overlay.childElementCount) return;
      for (let i = 0; i < overlay.children.length; i++) {
        const el = overlay.children[i];
        const m = el.__godMarker;
        if (!m) continue;
        if (!markerHorizonVisible(globe, m, 3)) {
          if (el.style.display !== 'none') el.style.display = 'none';
          continue;
        }
        const c = projectToScreen(globe, m.lat, m.lng, 0.018, overlay.clientWidth, overlay.clientHeight);
        if (!c) {
          if (el.style.display !== 'none') el.style.display = 'none';
          continue;
        }
        if (el.style.display === 'none') el.style.display = '';
        el.style.left = c.x + 'px';
        el.style.top = c.y + 'px';
        el.style.color = flightAltColor(m.altitudeFt);
        const heading = Number(m.heading);
        el.style.setProperty('--flight-heading', `${Number.isFinite(heading) ? heading : 0}deg`);
      }
    }, []);

    const applyGlobeLayers = React.useCallback(() => {
      const globe = globeInstRef.current;
      if (!globe) return;
      setLayerError('');
      try {
        const showWeather = layer === 'all' || layer === 'weather';
        const showEvents = layer === 'all' || layer === 'events';
        const showFlights = layer === 'all' || layer === 'flights';
        const showSats = layer === 'all' || layer === 'satellites';
        const showLaunches = layer === 'all' || layer === 'launches';

        const mode = weatherModeRef.current || 'temp';
        // At ground detail the weather labels/hex towers just block the
        // satellite imagery — hide them until the user zooms back out.
        const deepZoom = deepZoomRef.current;
        const flightPoints = showFlights && flights.length ? flightPointsForGlobe(flights) : [];
        const labelRows = [];
        const windArcs = [];
        if (showWeather && !deepZoom) {
          weather.forEach((w) => {
            labelRows.push({
              ...w,
              text: w.text || (w.temp != null ? `${w.temp}°` : w.name),
              label: w.label || `${w.name} · ${w.condition || 'Weather'}`,
              labelSize: w.labelSize || 0.58,
              color: w.color || tempColor(w.temp),
            });
            if (mode === 'wind' && Number.isFinite(w.windDeg)) {
              const end = windArcEnd(w.lat, w.lng, w.windDeg, w.wind);
              windArcs.push({
                startLat: w.lat,
                startLng: w.lng,
                endLat: end.lat,
                endLng: end.lng,
                color: 'rgba(100, 210, 255, 0.82)',
                stroke: Math.min(1.1, Math.max(0.35, (Number(w.wind) || 8) / 18)),
                label: `${w.name} · ${w.wind || 0} mph ${w.windCompass || ''}`.trim(),
                type: 'wind',
              });
            }
          });
        }
        if (showSats) {
          labelRows.push(...satellites.map((s) => ({
            ...s,
            text: s.text || s.label || 'SAT',
            labelSize: s.labelSize || 0.55,
          })));
        }
        if (showEvents && !deepZoom) {
          labelRows.push(...earthEvents.map((ev) => ({
            ...ev,
            text: ev.text || 'EVENT',
            labelSize: ev.labelSize || 0.42,
            color: ev.color || '#bf5af2',
          })));
        }
        if (showLaunches && !deepZoom) {
          labelRows.push(...launches.markers.map((m) => ({
            ...m,
            text: '▲',
            labelSize: 0.52,
            color: '#ff453a',
            alt: 0.007,
          })));
        }
        const viewerLat = Number(viewer.lat);
        const viewerLon = viewerLng(viewer);
        if (!deepZoom && Number.isFinite(viewerLat) && Number.isFinite(viewerLon)) {
          labelRows.push({
            lat: viewerLat,
            lng: viewerLon,
            alt: 0.008,
            text: 'YOU',
            labelSize: 0.5,
            color: '#30d158',
            label: viewer.city ? `You · ${viewer.city}` : 'You',
            type: 'viewer',
          });
        }

        globe
          .labelsData(labelRows)
          .labelLat('lat')
          .labelLng('lng')
          .labelAltitude('alt')
          .labelText((d) => String(d.text || d.label || ''))
          .labelSize('labelSize')
          .labelColor('color')
          .labelDotRadius(showWeather ? 0.22 : 0.14)
          .labelIncludeDot(true)
          .labelDotOrientation('bottom')
          .labelsTransitionDuration(0)
          .onLabelClick((pt) => {
            inspectPoint(pt || null, 1.35, 1100);
          });

        if (showWeather && !deepZoom && mode === 'temp' && weather.length) {
          const binTempColor = (bin) => {
            const pts = bin?.points || [];
            if (!pts.length) return 'rgba(90,90,90,0.2)';
            const avg = pts.reduce((s, p) => s + Number(p.weight || p.temp || 50), 0) / pts.length;
            return colorWithAlpha(tempColor(avg), 0.65); // keep land readable
          };
          globe
            .hexBinPointsData(weather)
            .hexBinPointLat('lat')
            .hexBinPointLng('lng')
            .hexBinPointWeight('weight')
            .hexBinResolution(3)
            .hexBinMerge(true)
            .hexAltitude(0.012)
            .hexTopColor(binTempColor)
            .hexSideColor(binTempColor);
        } else {
          globe.hexBinPointsData([]);
        }

        if (showWeather && !deepZoom && mode === 'wind' && windArcs.length) {
          globe
            .arcsData(windArcs)
            .arcStartLat('startLat')
            .arcStartLng('startLng')
            .arcEndLat('endLat')
            .arcEndLng('endLng')
            .arcColor('color')
            .arcStroke('stroke')
            .arcAltitude(0.05)
            .arcDashLength(0.45)
            .arcDashGap(0.2)
            .arcDashAnimateTime(1800)
            .arcsTransitionDuration(0)
            .onArcClick((pt) => inspectPoint(pt || null, 1.35, 1000));
        } else {
          globe.arcsData([]);
        }

        // Never merge — merged point geometry kills per-point click detection,
        // and the panel promises clickable aircraft. Capped at MAX_FLIGHT_POINTS.
        globe
          .pointsData(flightPoints)
          .pointLat('lat')
          .pointLng('lng')
          .pointAltitude('alt')
          .pointRadius('size')
          .pointColor('color')
          .pointResolution(3)
          .pointsMerge(false)
          .pointsTransitionDuration(0)
          .onPointClick((pt) => inspectPoint(pt || null, 1.35, 900));

        globe
          .pathsData(showSats && issTrail.length ? issTrail : [])
          .pathPointLat((p) => p[0])
          .pathPointLng((p) => p[1])
          .pathPointAlt((p) => p[2])
          .pathColor(() => 'rgba(100,210,255,0.55)')
          .pathStroke(1.4)
          .pathTransitionDuration(0);

        globe.objectsData([]);

        // Rockets live in our own screen-space overlay — the vendored globe.gl
        // build never attaches htmlElementsData nodes to the DOM.
        const flightOverlay = flightOverlayRef.current;
        if (flightOverlay) {
          flightOverlay.innerHTML = '';
          if (showFlights) {
            flightPoints.slice(0, 220).forEach((m) => {
              const el = buildPlaneElement();
              el.style.position = 'absolute';
              el.style.transform = 'translate(-50%, -50%) rotate(var(--flight-heading, 0deg))';
              el.style.display = 'none';
              el.style.pointerEvents = 'auto';
              el.style.cursor = 'pointer';
              el.title = `${m.callsign || m.label || 'Flight'}${m.altitudeFt ? ` · ${m.altitudeFt.toLocaleString()} ft` : ''}`;
              el.__godMarker = m;
              el.addEventListener('click', () => {
                inspectPoint(m, 1.35, 900);
              });
              flightOverlay.appendChild(el);
            });
          }
          updateFlightOverlay();
        }

        const overlay = rocketOverlayRef.current;
        if (overlay) {
          overlay.innerHTML = '';
          if (showLaunches) {
            launches.markers.forEach((m) => {
              const el = buildRocketElement();
              el.style.position = 'absolute';
              el.style.transform = 'translate(-50%, -50%)';
              el.style.display = 'none';
              el.style.pointerEvents = 'auto';
              el.style.cursor = 'pointer';
              el.title = m.label || m.name || 'Launch';
              el.__godMarker = m;
              el.addEventListener('click', () => {
                inspectPoint(m, 1.4, 1100);
              });
              overlay.appendChild(el);
            });
          }
          updateRocketOverlay();
        }

        globe
          .ringsData([
            ...(showLaunches ? launches.markers.map((m) => ({ ...m, ringColor: 'rgba(255,69,58,0.55)', ringRadius: 3.5, ringSpeed: 2.2 })) : []),
            ...(showEvents ? earthEvents.map((m) => ({ ...m, ringColor: colorWithAlpha(m.color || '#bf5af2', 0.55), ringRadius: 2.2, ringSpeed: 1.4 })) : []),
          ])
          .ringLat('lat')
          .ringLng('lng')
          .ringAltitude(0.002)
          .ringMaxRadius((d) => d.ringRadius || 2.4)
          .ringPropagationSpeed((d) => d.ringSpeed || 1.4)
          .ringRepeatPeriod(1200)
          .ringColor((d) => d.ringColor || 'rgba(191,90,242,0.55)');

        layerRef.current = layer;
        if (radarMeshRef.current) {
          radarMeshRef.current.visible = showWeather && !deepZoom && mode === 'precip' && !!radarGlobeUrlRef.current;
        }
        if (cloudMeshRef.current) {
          cloudMeshRef.current.visible = showWeather && !deepZoom && mode !== 'precip' && !!cloudMeshRef.current.material.map;
        }
      } catch (e) {
        const msg = String(e?.message || e || 'layer render failed');
        setLayerError(msg);
        console.error('[god-mode] layer apply failed', e);
      }
    }, [layer, weather, flights, satellites, launches, earthEvents, viewer, weatherMode, issTrail, updateRocketOverlay, updateFlightOverlay, inspectPoint]);

    applyLayersRef.current = applyGlobeLayers;
    syncStreetRef.current = syncZoomLabel;
    resizeRef.current = resizeGlobe;

    const applyRadarTexture = React.useCallback((tex) => {
      const mesh = radarMeshRef.current;
      if (!mesh || !tex) return;
      mesh.material.map = tex;
      mesh.material.needsUpdate = true;
    }, []);

    const syncRadarOverlayVisibility = React.useCallback(() => {
      const mesh = radarMeshRef.current;
      if (!mesh) return;
      const showWeather = layerRef.current === 'all' || layerRef.current === 'weather';
      const mode = weatherModeRef.current || 'temp';
      mesh.visible = showWeather && !deepZoomRef.current && mode === 'precip' && !!radarGlobeUrlRef.current;
      if (cloudMeshRef.current) {
        cloudMeshRef.current.visible = showWeather && !deepZoomRef.current && mode !== 'precip' && !!cloudMeshRef.current.material.map;
      }
    }, []);

    React.useEffect(() => {
      weatherModeRef.current = weatherMode;
      syncRadarOverlayVisibility();
      applyLayersRef.current();
    }, [weatherMode, syncRadarOverlayVisibility]);

    // Builds the cloud + radar shells by cloning the live globe mesh once its
    // earth texture has loaded (the clone gives us mesh/material/texture
    // classes without needing a global THREE).
    const setupWeatherShells = React.useCallback((globe) => {
      let tries = 0;
      const attempt = () => {
        if (!globeInstRef.current || globeInstRef.current !== globe || cloudMeshRef.current) return;
        const base = findGlobeMesh(globe);
        const baseMap = base?.material?.map;
        if (!base || !base.parent || !baseMap || !baseMap.image) {
          if (++tries < 60) window.setTimeout(attempt, 400);
          return;
        }
        try {
          texProtoRef.current = baseMap;

          const cloud = makeShellFromGlobe(base, 1.015, (mat) => {
            mat.opacity = 0.4;
          });
          cloud.renderOrder = 1;
          cloudMeshRef.current = cloud;
          const cloudImg = new Image();
          cloudImg.crossOrigin = 'anonymous';
          cloudImg.onload = () => {
            if (cloudMeshRef.current !== cloud) return;
            const tex = baseMap.clone();
            tex.image = cloudImg;
            tex.needsUpdate = true;
            cloud.material.map = tex;
            cloud.material.needsUpdate = true;
            syncRadarOverlayVisibility();
          };
          cloudImg.src = CLOUDS_IMG;

          const radarShell = makeShellFromGlobe(base, 1.011, (mat) => {
            mat.opacity = 0.85;
            mat.blending = 2; // THREE.AdditiveBlending
            if ('shininess' in mat) mat.shininess = 0;
          });
          radarShell.renderOrder = 2;
          radarMeshRef.current = radarShell;

          // Ocean specular sheen on the base globe while we're here.
          const waterImg = new Image();
          waterImg.crossOrigin = 'anonymous';
          waterImg.onload = () => {
            try {
              const mat = globe.globeMaterial();
              if (!mat || !mat.specular) return;
              const tex = baseMap.clone();
              tex.image = waterImg;
              tex.needsUpdate = true;
              mat.specularMap = tex;
              mat.specular.set('#2e4a6b');
              mat.shininess = 12;
              mat.needsUpdate = true;
            } catch (e) {}
          };
          waterImg.src = WATER_IMG;

          syncRadarOverlayVisibility();
          applyLayersRef.current();
        } catch (e) {
          console.warn('[god-mode] weather shells unavailable', e);
        }
      };
      attempt();
    }, [syncRadarOverlayVisibility]);

    React.useEffect(() => {
      if (!open) return undefined;
      let cancelled = false;
      let resizeObs = null;
      let globe = null;
      let onControls = null;

      const buildGlobe = async () => {
        await waitForGlobeContainer(globeRef.current);
        if (cancelled || !globeRef.current || globeInstRef.current) return null;
        const GlobeFactory = await ensureGlobeLibrary();
        if (cancelled || !globeRef.current || globeInstRef.current) return null;
        const v = viewerRef.current || {};
        const mountEl = globeRef.current;
        const g = initGlobeInstance(GlobeFactory, mountEl);
        g
          .globeImageUrl(EARTH_IMG)
          .bumpImageUrl(BUMP_IMG)
          .showAtmosphere(true)
          .atmosphereColor('lightskyblue')
          .atmosphereAltitude(0.18)
          .pointLabel('label')
          .onPointHover((pt) => {
            if (globeRef.current) globeRef.current.style.cursor = pt ? 'pointer' : 'grab';
          });
        try { g.backgroundImageUrl(SKY_IMG); } catch (e) {
          console.warn('[god-mode] sky background skipped', e);
        }
        try {
          g.globeTileEngineUrl(SAT_TILE_URL).globeTileEngineMaxLevel(SAT_TILE_MAX_LEVEL);
        } catch (e) {
          console.warn('[god-mode] satellite tile engine unavailable', e);
        }
        const controls = g.controls();
        if (!controls) throw new Error('Globe controls unavailable');
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.35;
        controls.enableDamping = true;
        controls.minDistance = 101;
        controls.maxDistance = 520;
        g.pointOfView({ lat: Number(v.lat) || 28, lng: viewerLng(v) || -20, altitude: 2.2 }, 0);
        return g;
      };

      const mountGlobe = async () => {
        if (cancelled) return;
        if (!globeRef.current) {
          window.requestAnimationFrame(mountGlobe);
          return;
        }
        if (globeInstRef.current) return;
        setGlobeError('');
        const webgl = probeWebGLSupport();
        if (!webgl.ok) {
          setGlobeError('3D globe needs WebGL: ' + (webgl.reason || 'unavailable') + '. Enable hardware graphics or try another browser.');
          return;
        }
        let lastErr = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          if (cancelled || globeInstRef.current) return;
          if (attempt > 0) {
            disposeGlobeInstance(globeInstRef.current);
            globeInstRef.current = null;
            if (globeRef.current) globeRef.current.innerHTML = '';
            await new Promise((r) => window.setTimeout(r, 450));
          }
          try {
            globe = await buildGlobe();
            if (!globe || cancelled) return;
            globeInstRef.current = globe;
            global.__V4GodGlobe = globe;
            try {
              const renderer = globe.renderer?.();
              if (renderer) {
                renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
                renderer.domElement.addEventListener('webglcontextlost', (ev) => {
                  ev.preventDefault();
                  setGlobeError('Graphics memory ran out — close and reopen god mode.');
                });
              }
            } catch (e) {}
            setupWeatherShells(globe);
            if (!cancelled) setGlobeReady(true);

            let lastControlsWork = 0;
            onControls = () => {
              const now = Date.now();
              if (now - lastControlsWork < 80) return;
              lastControlsWork = now;
              if (!globeInstRef.current) return;
              syncStreetRef.current(globe);
              try {
                const alt = Number(globe.pointOfView()?.altitude);
                if (Number.isFinite(alt)) {
                  const ctrls = globe.controls();
                  if (alt < AUTOROTATE_PAUSE_ALT && ctrls.autoRotate) ctrls.autoRotate = false;
                  else if (alt > AUTOROTATE_RESUME_ALT && !ctrls.autoRotate) ctrls.autoRotate = true;
                  setCanReset(alt < AUTOROTATE_RESUME_ALT);
                  const deep = alt < SAT_DETAIL_ALT;
                  if (deep !== deepZoomRef.current) {
                    deepZoomRef.current = deep;
                    applyLayersRef.current();
                  }
                }
              } catch (e) {}
            };
            globe.controls().addEventListener('change', onControls);

            const frameTick = () => {
              if (cloudMeshRef.current && cloudMeshRef.current.visible) {
                cloudMeshRef.current.rotation.y += 0.00035;
              }
              updateRocketOverlay();
              updateFlightOverlay();
              cloudSpinRef.current = window.requestAnimationFrame(frameTick);
            };
            cloudSpinRef.current = window.requestAnimationFrame(frameTick);

            window.requestAnimationFrame(() => {
              resizeRef.current();
              applyLayersRef.current();
              syncStreetRef.current(globe);
              syncRadarOverlayVisibility();
            });
            if (typeof ResizeObserver !== 'undefined') {
              resizeObs = new ResizeObserver(() => resizeRef.current());
              resizeObs.observe(globeRef.current);
            }
            window.addEventListener('resize', resizeRef.current);
            return;
          } catch (e) {
            lastErr = e;
            console.error('[god-mode] globe mount attempt ' + (attempt + 1) + ' failed', e);
          }
        }
        if (!cancelled) {
          const hint = isWebKitBrowser() ? ' Try Chrome if Safari keeps failing.' : '';
          setGlobeError('3D globe failed to load: ' + (lastErr?.message || 'unknown error') + '.' + hint + ' Hard refresh (Cmd+Shift+R).');
        }
      };

      mountGlobe();

      return () => {
        cancelled = true;
        window.removeEventListener('resize', resizeRef.current);
        if (resizeObs) resizeObs.disconnect();
        if (globe && onControls) {
          try { globe.controls().removeEventListener('change', onControls); } catch (e) {}
        }
        if (cloudSpinRef.current) window.cancelAnimationFrame(cloudSpinRef.current);
        cloudSpinRef.current = null;
        if (radarTexCacheRef.current) {
          radarTexCacheRef.current.forEach((tex) => {
            try { tex.dispose(); } catch (e) {}
          });
          radarTexCacheRef.current.clear();
        }
        radarMeshRef.current = null;
        cloudMeshRef.current = null;
        texProtoRef.current = null;
        radarGlobeUrlRef.current = '';
        disposeGlobeInstance(globeInstRef.current);
        if (global.__V4GodGlobe === globeInstRef.current) global.__V4GodGlobe = null;
        globeInstRef.current = null;
        setGlobeReady(false);
        if (globeRef.current) globeRef.current.innerHTML = '';
        if (rocketOverlayRef.current) rocketOverlayRef.current.innerHTML = '';
        if (flightOverlayRef.current) flightOverlayRef.current.innerHTML = '';
      };
    }, [open]);

    React.useEffect(() => {
      if (!open) return;
      applyGlobeLayers();
    }, [open, applyGlobeLayers]);

    React.useEffect(() => {
      if (!open || !radar?.frames?.length) return undefined;
      let idx = radar.frames.length - 1;
      let cancelled = false;

      const tick = async () => {
        if (cancelled || radarBusyRef.current) return;
        // Only animate while the rain view is actually on screen.
        const showWeather = layerRef.current === 'all' || layerRef.current === 'weather';
        if (!showWeather || weatherModeRef.current !== 'precip') return;
        if (!radarMeshRef.current || !texProtoRef.current) return;
        radarBusyRef.current = true;
        try {
          const frame = radar.frames[idx];
          const key = String(frame?.path || idx);
          if (!radarTexCacheRef.current) radarTexCacheRef.current = new Map();
          let tex = radarTexCacheRef.current.get(key);
          if (!tex) {
            const canvas = await buildRadarEquirectCanvas(radar.host, frame);
            if (cancelled) return;
            if (canvas && texProtoRef.current) {
              tex = texProtoRef.current.clone();
              tex.image = canvas;
              tex.needsUpdate = true;
              radarTexCacheRef.current.set(key, tex);
            }
          }
          if (tex) {
            radarGlobeUrlRef.current = key;
            applyRadarTexture(tex);
            syncRadarOverlayVisibility();
          }
          idx = (idx + 1) % radar.frames.length;
        } catch (e) {
          console.warn('[god-mode] radar frame failed', e);
        } finally {
          radarBusyRef.current = false;
        }
      };

      tick();
      radarTimerRef.current = window.setInterval(tick, 1500);
      return () => {
        cancelled = true;
        if (radarTimerRef.current) {
          clearInterval(radarTimerRef.current);
          radarTimerRef.current = null;
        }
      };
    }, [open, radar, applyRadarTexture, syncRadarOverlayVisibility]);

    React.useEffect(() => {
      if (!open) return undefined;
      let cancelled = false;

      async function loadFeed(key, fetcher, onSuccess) {
        try {
          const value = await fetcher();
          if (cancelled) return;
          onSuccess(value);
          setErrors((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
        } catch (e) {
          if (cancelled) return;
          const msg = String(e?.message || e || key + ' unavailable');
          setErrors((prev) => ({ ...prev, [key]: msg }));
        }
      }

      async function loadAll() {
        setFeedsLoading(true);
        setErrors({});
        await Promise.all([
          loadFeed('weather', fetchWeatherGrid, (v) => {
            setWeather(v);
            setStats((s) => ({ ...s, cities: v.length }));
          }),
          loadFeed('events', fetchEarthEvents, (v) => {
            setEarthEvents(v);
            setStats((s) => ({ ...s, events: v.length }));
          }),
          loadFeed('flights', fetchFlights, (v) => {
            setFlights(v);
            setStats((s) => ({ ...s, flights: v.length }));
          }),
          loadFeed('satellites', fetchIss, (v) => {
            setSatellites(v);
            setStats((s) => ({ ...s, sats: v.length }));
          }),
          fetchIssTrail().then((t) => { if (!cancelled) setIssTrail(t); }).catch(() => {}),
          loadFeed('launches', fetchLaunches, (v) => {
            setLaunches(v);
            setStats((s) => ({ ...s, launches: v.list.length }));
          }),
          loadFeed('radar', fetchRadarMeta, (v) => {
            if (v) setRadar(v);
          }),
        ]);
        if (!cancelled) setFeedsLoading(false);
      }

      loadAll();
      const flightTimer = setInterval(() => {
        fetchFlights().then((rows) => { if (!cancelled) setFlights(rows); }).catch(() => {});
      }, 20000);
      const issTimer = setInterval(() => {
        fetchIss().then((rows) => { if (!cancelled) setSatellites(rows); }).catch(() => {});
      }, 8000);
      const launchTimer = setInterval(() => {
        fetchLaunches().then((rows) => { if (!cancelled) setLaunches(rows); }).catch(() => {});
      }, 1800000);
      const eventTimer = setInterval(() => {
        fetchEarthEvents().then((rows) => {
          if (!cancelled) {
            setEarthEvents(rows);
            setStats((s) => ({ ...s, events: rows.length }));
          }
        }).catch(() => {});
      }, 600000);
      const radarTimer = setInterval(() => {
        fetchRadarMeta().then((meta) => { if (!cancelled && meta) setRadar(meta); }).catch(() => {});
      }, 300000);
      const trailTimer = setInterval(() => {
        fetchIssTrail().then((t) => { if (!cancelled) setIssTrail(t); }).catch(() => {});
      }, 300000);

      return () => {
        cancelled = true;
        clearInterval(flightTimer);
        clearInterval(issTimer);
        clearInterval(launchTimer);
        clearInterval(eventTimer);
        clearInterval(radarTimer);
        clearInterval(trailTimer);
      };
    }, [open]);

    function pickLayer(id) {
      setLayerError('');
      setLayer(id);
      layerRef.current = id;
      onLayerChange?.(id);
      setSelected(null);
      setGroundTarget(null);
      syncRadarOverlayVisibility();
    }

    function pickWeatherMode(id) {
      setWeatherMode(id);
      weatherModeRef.current = id;
      setSelected(null);
      setGroundTarget(null);
      syncRadarOverlayVisibility();
      applyLayersRef.current();
    }

    if (!open) return null;

    const panelLayer = layer;
    const launchList = launches.list || [];
    const showWeatherHud = layer === 'all' || layer === 'weather';
    const activeWeatherMode = WEATHER_MODES.find((m) => m.id === weatherMode) || WEATHER_MODES[0];
    const groundLat = groundTarget ? Number(groundTarget.lat) : NaN;
    const groundLng = groundTarget ? Number(groundTarget.lng) : NaN;
    const showGround = Number.isFinite(groundLat) && Number.isFinite(groundLng);
    const groundName = showGround ? cleanGroundName(groundTarget) : '';
    const groundActionLinks = showGround ? groundLinks(groundLat, groundLng) : {};

    return React.createElement(
      'div',
      { className: 'v4-godmode', role: 'dialog', 'aria-label': 'God mode earth view' },
      React.createElement('div', { className: 'v4-godmode-backdrop', onClick: onClose }),
      React.createElement(
        'div',
        { className: 'v4-godmode-shell' },
        React.createElement(
          'header',
          { className: 'v4-godmode-head' },
          React.createElement('div', { className: 'v4-godmode-title' },
            React.createElement('span', { className: 'v4-godmode-eyebrow' }, 'Planetary ops'),
            React.createElement('strong', null, 'God mode'),
            React.createElement('span', { className: 'v4-godmode-sub' }, 'Live weather · flights · satellites · launches')
          ),
          React.createElement(
            'div',
            { className: 'v4-godmode-stats' },
            React.createElement('span', null, `${stats.flights.toLocaleString()} flights`),
            React.createElement('span', null, `${stats.events} earth events`),
            React.createElement('span', null, `${stats.sats} in orbit track`),
            React.createElement('span', null, `${stats.launches} upcoming launches`),
            React.createElement('span', null, `${stats.cities} weather nodes`)
          ),
          React.createElement('button', { type: 'button', className: 'v4-godmode-close', onClick: onClose, 'aria-label': 'Close god mode' }, '✕')
        ),
        React.createElement(
          'div',
          { className: 'v4-godmode-body' },
          React.createElement(
            'nav',
            { className: 'v4-godmode-layers', 'aria-label': 'Data layers' },
            LAYERS.map((row) =>
              React.createElement(
                'button',
                {
                  key: row.id,
                  type: 'button',
                  className: 'v4-godmode-layer' + (layer === row.id ? ' is-active' : ''),
                  onClick: () => pickLayer(row.id),
                },
                React.createElement('span', { className: 'v4-godmode-layer-glyph' }, row.glyph),
                React.createElement('span', null, row.label)
              )
            ),
            (layerError || Object.keys(errors).length > 0) && React.createElement(
              'div',
              { className: 'v4-godmode-errors' },
              layerError && React.createElement('div', { key: 'layer' }, 'layer: ' + layerError),
              Object.entries(errors).map(([k, v]) => React.createElement('div', { key: k }, `${k}: ${v}`))
            )
          ),
          React.createElement(
            'div',
            { className: 'v4-godmode-stage' },
            !globeReady && !globeError && React.createElement('div', { className: 'v4-godmode-loading' }, 'Starting 3D globe…'),
            feedsLoading && globeReady && React.createElement('div', { className: 'v4-godmode-loading v4-godmode-loading-inline' }, 'Syncing live feeds…'),
            !feedsLoading && stats.cities === 0 && stats.flights === 0 && Object.keys(errors).length > 0
              && React.createElement('div', { className: 'v4-godmode-loading v4-godmode-loading-warn' }, 'Some feeds failed — globe still works'),
            globeError && React.createElement('div', { className: 'v4-godmode-globe-error' }, globeError),
            React.createElement('div', { className: 'v4-godmode-zoom-chip' }, zoomLabel),
            canReset && React.createElement('button', {
              type: 'button',
              className: 'v4-godmode-zoom-chip',
              style: { left: 'auto', right: 12, transform: 'none', pointerEvents: 'auto', cursor: 'pointer' },
              onClick: () => {
                const g = globeInstRef.current;
                if (!g) return;
                const v = viewerRef.current || {};
                g.pointOfView({ lat: Number(v.lat) || 28, lng: viewerLng(v) || -20, altitude: 2.2 }, 900);
                try { g.controls().autoRotate = true; } catch (e) {}
                setCanReset(false);
              },
            }, '⟲ Zoom out'),
            React.createElement('div', { ref: globeRef, className: 'v4-godmode-globe' }),
            showGround && React.createElement(
              'div',
              { className: 'v4-godmode-ground' },
              React.createElement(
                'div',
                { className: 'v4-godmode-ground-head' },
                React.createElement(
                  'div',
                  null,
                  React.createElement('span', { className: 'v4-godmode-ground-kicker' }, 'Ground mode'),
                  React.createElement('strong', null, groundName),
                  React.createElement('em', null, coordLabel(groundLat, groundLng))
                ),
                React.createElement('button', {
                  type: 'button',
                  onClick: () => setGroundTarget(null),
                  'aria-label': 'Close ground mode',
                }, '×')
              ),
              React.createElement('iframe', {
                className: 'v4-godmode-ground-frame',
                src: osmEmbedUrl(groundLat, groundLng),
                title: `${groundName} ground map`,
                loading: 'lazy',
              }),
              React.createElement(
                'div',
                { className: 'v4-godmode-ground-actions' },
                React.createElement('a', { href: groundActionLinks.streetView, target: '_blank', rel: 'noreferrer' }, 'Street View'),
                React.createElement('a', { href: groundActionLinks.googleMaps, target: '_blank', rel: 'noreferrer' }, 'Google Maps'),
                React.createElement('a', { href: groundActionLinks.osm, target: '_blank', rel: 'noreferrer' }, 'OpenStreetMap'),
                React.createElement('a', { href: groundActionLinks.panoramax, target: '_blank', rel: 'noreferrer' }, 'Panoramax')
              ),
              React.createElement('p', { className: 'v4-godmode-ground-note' }, 'Real embedded Street View requires a Google or Mapillary key. Until that is connected, this opens the live street imagery source directly.')
            ),
            React.createElement('div', {
              ref: flightOverlayRef,
              className: 'v4-godmode-flight-overlay',
              style: { position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 2 },
            }),
            React.createElement('div', {
              ref: rocketOverlayRef,
              className: 'v4-godmode-rocket-overlay',
              style: { position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 2 },
            }),
            showWeatherHud && React.createElement(
              'div',
              { className: 'v4-godmode-weather-hud is-visible' },
              React.createElement('span', { className: 'v4-godmode-weather-hud-title' }, activeWeatherMode.label),
              React.createElement('span', { className: 'v4-godmode-weather-hud-hint' }, activeWeatherMode.hint),
              weatherMode === 'temp' && React.createElement(
                'div',
                { className: 'v4-godmode-weather-hud-legend' },
                TEMP_LEGEND.map((row) =>
                  React.createElement('span', { key: row.label, className: 'v4-godmode-legend-item' },
                    React.createElement('i', { style: { background: row.color } }),
                    row.label
                  )
                )
              ),
              weatherMode === 'precip' && React.createElement(
                'div',
                { className: 'v4-godmode-weather-hud-legend' },
                ['Light rain', 'Moderate', 'Heavy'].map((label, i) =>
                  React.createElement('span', { key: label, className: 'v4-godmode-legend-item' },
                    React.createElement('i', { style: { background: ['#34c759', '#ffd60a', '#ff3b30'][i] } }),
                    label
                  )
                )
              ),
              weatherMode === 'wind' && React.createElement(
                'div',
                { className: 'v4-godmode-weather-hud-legend' },
                React.createElement('span', { className: 'v4-godmode-legend-item' },
                  React.createElement('i', { style: { background: '#64d2ff' } }),
                  'Longer arrows = faster wind'
                )
              )
            ),
            selected && React.createElement(
              'div',
              { className: 'v4-godmode-pin' },
              React.createElement('strong', null, selected.label || selected.name || 'Selected'),
              selected.type === 'flight' && React.createElement('div', null,
                selected.altitudeFt != null ? `${selected.altitudeFt.toLocaleString()} ft` : '',
                selected.speedKts != null ? ` · ${selected.speedKts} kts` : ''
              ),
              selected.type === 'weather' && React.createElement('div', null,
                selected.condition || 'Weather',
                selected.temp != null ? ` · ${selected.temp}°F` : '',
                selected.wind != null ? ` · Wind ${selected.wind} mph ${selected.windCompass || ''}` : ''
              ),
              selected.type === 'event' && React.createElement('div', null,
                selected.category || 'Earth event',
                selected.source ? ` · ${selected.source}` : '',
                selected.date ? ` · ${fmtLaunchWhen(selected.date)}` : ''
              ),
              selected.type === 'wind' && React.createElement('div', null, selected.label || 'Wind flow'),
              selected.type === 'launch' && selected.when && React.createElement('div', null, fmtLaunchWhen(selected.when)),
              isGroundable(selected) && React.createElement(
                'div',
                { className: 'v4-godmode-pin-actions' },
                React.createElement('button', { type: 'button', onClick: () => setGroundTarget(selected) }, 'Ground'),
                React.createElement('a', {
                  href: groundLinks(Number(selected.lat), Number(selected.lng)).streetView,
                  target: '_blank',
                  rel: 'noreferrer',
                }, 'Street View')
              )
            )
          ),
          React.createElement(
            'aside',
            { className: 'v4-godmode-panel' },
            panelLayer === 'all' && React.createElement(
              React.Fragment,
              null,
              React.createElement('div', { className: 'v4-godmode-panel-head' }, 'Planetary operations'),
              React.createElement('p', { className: 'v4-godmode-panel-note' }, 'All live layers are active: weather, natural events, air traffic, ISS orbit, and launch pads. Click any marker on the globe to inspect it.'),
              React.createElement('div', { className: 'v4-godmode-ops-grid' },
                React.createElement('div', null, React.createElement('strong', null, stats.flights.toLocaleString()), React.createElement('span', null, 'Aircraft')),
                React.createElement('div', null, React.createElement('strong', null, stats.events), React.createElement('span', null, 'Earth events')),
                React.createElement('div', null, React.createElement('strong', null, stats.launches), React.createElement('span', null, 'Launches')),
                React.createElement('div', null, React.createElement('strong', null, stats.cities), React.createElement('span', null, 'Weather nodes'))
              )
            ),
            (panelLayer === 'launches' || panelLayer === 'all') && React.createElement(
              React.Fragment,
              null,
              React.createElement('div', { className: 'v4-godmode-panel-head' }, 'Upcoming rocket launches'),
              React.createElement('p', { className: 'v4-godmode-panel-note' }, 'Animated rockets at each pad · ripple rings show blast radius. Top providers: SpaceX, ULA, Rocket Lab, Arianespace.'),
              React.createElement(
                'div',
                { className: 'v4-godmode-launch-list' },
                launchList.length === 0 && React.createElement('div', { className: 'v4-godmode-empty' }, 'No launch data yet'),
                launchList.map((item) =>
                  React.createElement(
                    'button',
                    {
                      key: item.id,
                      type: 'button',
                      className: 'v4-godmode-launch-card',
                      onClick: () => {
                        inspectPoint({ ...item, type: 'launch', label: item.name }, 1.6, 1200);
                      },
                    },
                    item.image && React.createElement('img', { className: 'v4-godmode-launch-img', src: item.image, alt: '' }),
                    React.createElement('div', { className: 'v4-godmode-launch-meta' },
                      React.createElement('strong', null, item.name),
                      React.createElement('span', { className: 'v4-godmode-launch-provider' }, item.provider),
                      React.createElement('span', { className: 'v4-godmode-launch-when' }, fmtLaunchWhen(item.when)),
                      item.rocket && React.createElement('span', { className: 'v4-godmode-launch-rocket' }, item.rocket),
                      item.loc && React.createElement('span', { className: 'v4-godmode-launch-pad' }, item.loc)
                    )
                  )
                )
              )
            ),
            panelLayer === 'events' && React.createElement(
              React.Fragment,
              null,
              React.createElement('div', { className: 'v4-godmode-panel-head' }, 'Earth events'),
              React.createElement('p', { className: 'v4-godmode-panel-note' }, 'NASA EONET open events from the last 30 days. These are real-world event markers, not decoration.'),
              React.createElement(
                'div',
                { className: 'v4-godmode-event-list' },
                earthEvents.length === 0 && React.createElement('div', { className: 'v4-godmode-empty' }, 'No event data yet'),
                earthEvents.map((ev) =>
                  React.createElement(
                    'button',
                    {
                      key: ev.id,
                      type: 'button',
                      className: 'v4-godmode-event-card',
                      onClick: () => {
                        inspectPoint(ev, 1.45, 1000);
                      },
                    },
                    React.createElement('span', { className: 'v4-godmode-event-dot', style: { background: ev.color } }),
                    React.createElement('span', { className: 'v4-godmode-event-copy' },
                      React.createElement('strong', null, ev.name),
                      React.createElement('em', null, `${ev.category || 'Event'} · ${ev.source || 'NASA EONET'}`)
                    )
                  )
                )
              )
            ),
            panelLayer === 'weather' && React.createElement(
              React.Fragment,
              null,
              React.createElement('div', { className: 'v4-godmode-panel-head' }, 'Planetary weather'),
              React.createElement('p', { className: 'v4-godmode-panel-note' }, 'Live conditions for 42 cities worldwide. Pick a view, read the legend, click any city on the globe.'),
              React.createElement(
                'div',
                { className: 'v4-godmode-weather-modes' },
                WEATHER_MODES.map((row) =>
                  React.createElement(
                    'button',
                    {
                      key: row.id,
                      type: 'button',
                      className: 'v4-godmode-weather-mode' + (weatherMode === row.id ? ' is-active' : ''),
                      onClick: () => pickWeatherMode(row.id),
                    },
                    React.createElement('span', { className: 'v4-godmode-weather-mode-glyph' }, row.glyph),
                    React.createElement('span', null, row.label)
                  )
                )
              ),
              React.createElement(
                'div',
                { className: 'v4-godmode-weather-list' },
                weather.map((w) =>
                  React.createElement(
                    'button',
                    {
                      key: w.name,
                      type: 'button',
                      className: 'v4-godmode-weather-row v4-godmode-weather-row-btn',
                      onClick: () => {
                        inspectPoint(w, 1.35, 1100);
                      },
                    },
                    React.createElement('span', { className: 'v4-godmode-weather-row-city' },
                      React.createElement('i', { className: 'v4-godmode-weather-glyph', style: { color: w.color } }, w.glyph || '◌'),
                      w.name
                    ),
                    React.createElement('strong', null, w.temp != null ? `${w.temp}°F` : '—'),
                    React.createElement('em', null, w.condition || '')
                  )
                )
              )
            ),
            panelLayer === 'flights' && React.createElement(
              React.Fragment,
              null,
              React.createElement('div', { className: 'v4-godmode-panel-head' }, 'Live air traffic'),
              React.createElement('p', { className: 'v4-godmode-panel-note' }, `Tracking ${stats.flights.toLocaleString()} aircraft live from the ADS-B network. Refreshes every 20s.`),
              React.createElement('div', { className: 'v4-godmode-flight-hint' }, `Showing up to ${MAX_FLIGHT_POINTS.toLocaleString()} aircraft with heading-shaped markers. Cyan = cruising above 30k ft, yellow = mid, orange = low. Click any aircraft for callsign + altitude.`)
            ),
            panelLayer === 'satellites' && React.createElement(
              React.Fragment,
              null,
              React.createElement('div', { className: 'v4-godmode-panel-head' }, 'Satellite tracking'),
              React.createElement('p', { className: 'v4-godmode-panel-note' }, 'ISS live position with its full orbit ring (cyan). Position updates every 8 seconds.'),
              satellites.map((s) => {
                const lat = Number(s.lat);
                const lng = Number(s.lng);
                const pos = Number.isFinite(lat) && Number.isFinite(lng)
                  ? `${lat.toFixed(2)}°, ${lng.toFixed(2)}°`
                  : 'Position unavailable';
                return React.createElement('div', { key: s.name, className: 'v4-godmode-sat-row' },
                  React.createElement('strong', null, s.name),
                  React.createElement('span', null, pos)
                );
              })
            )
          )
        )
      )
    );
  }

  global.V4GodModeEarth = V4GodModeEarth;
})(typeof window !== 'undefined' ? window : globalThis);
