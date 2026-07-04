/**
 * God Mode Earth — 3D globe with live weather, flights, satellites, and launches.
 * Loads globe.gl on demand (local vendor copy first, then CDNs). Optional MapLibre for street mode.
 */
(function (global) {
  'use strict';

  const React = global.React;
  if (!React) return;

  const GLOBE_SCRIPT_CANDIDATES = [
    () => new URL('flow-v4/vendor/globe.gl.min.js', global.location.href).href,
    'https://cdn.jsdelivr.net/npm/globe.gl@2.46.1/dist/globe.gl.min.js',
    'https://unpkg.com/globe.gl@2.46.1/dist/globe.gl.min.js',
  ];
  const MAPLIBRE_SCRIPT = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
  const MAPLIBRE_STYLE_HREF = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
  let globeLibPromise = null;
  let mapLibPromise = null;

  const EARTH_IMG = 'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg';
  const BUMP_IMG = 'https://unpkg.com/three-globe/example/img/earth-topology.png';
  const SKY_IMG = 'https://unpkg.com/three-globe/example/img/night-sky.png';
  const SAT_TILE_URL = (x, y, l) =>
    `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${l}/${y}/${x}`;
  const STREET_MODE_ALT = 0.62;
  const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
  const MAX_FLIGHT_POINTS = 400;
  const FLIGHT_POINT_SIZE = 0.009;
  const FLIGHT_POINT_ALT = 0.002;
  const FETCH_TIMEOUT_MS = 14000;

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
    { id: 'flights', label: 'Flights', glyph: '✈' },
    { id: 'satellites', label: 'Satellites', glyph: '◎' },
    { id: 'launches', label: 'Launches', glyph: '▲' },
  ];

  let rocketElementProto = null;

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

  function ensureMapLibreCss() {
    if (document.getElementById('godmode-maplibre-css')) return;
    const link = document.createElement('link');
    link.id = 'godmode-maplibre-css';
    link.rel = 'stylesheet';
    link.href = MAPLIBRE_STYLE_HREF;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  }

  function resolveGlobeFactory() {
    const g = global.Globe || global.window?.Globe;
    if (typeof g === 'function') return g;
    if (g && typeof g.default === 'function') return g.default;
    return null;
  }

  async function ensureGlobeLibrary() {
    const ready = resolveGlobeFactory();
    if (ready) return ready;
    if (!globeLibPromise) {
      globeLibPromise = (async () => {
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

  async function ensureMapLibreLibrary() {
    if (global.maplibregl) return global.maplibregl;
    if (!mapLibPromise) {
      mapLibPromise = (async () => {
        ensureMapLibreCss();
        await loadExternalScript(MAPLIBRE_SCRIPT, 'maplibre');
        if (!global.maplibregl) throw new Error('maplibre-gl missing after load');
        return global.maplibregl;
      })();
    }
    return mapLibPromise;
  }

  function initGlobeInstance(GlobeFactory, el) {
    try {
      return GlobeFactory()(el);
    } catch (e1) {
      try {
        return new GlobeFactory(el);
      } catch (e2) {
        throw e1;
      }
    }
  }

  function resolveMapLibre() {
    return global.maplibregl || null;
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

  async function fetchGodModeProxy(path) {
    const bases = godModeServiceBases();
    let lastErr = null;
    for (const base of bases) {
      try {
        const res = await fetchWithTimeout(base + path);
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

  async function buildRadarTileComposite(host, frame, zoom, cols, rows) {
    const tile = 512;
    const canvas = document.createElement('canvas');
    canvas.width = tile * cols;
    canvas.height = tile * rows;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.fillStyle = '#061018';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const jobs = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        jobs.push((async () => {
          const img = await loadRadarImage(buildRadarFrameUrl(host, frame, zoom, x, y));
          if (img) ctx.drawImage(img, x * tile, y * tile, tile, tile);
        })());
      }
    }
    await Promise.all(jobs);
    return canvas.toDataURL('image/png');
  }

  function resolveThree() {
    return global.THREE || global.window?.THREE || null;
  }

  function viewerLng(viewer) {
    const raw = viewer?.lng ?? viewer?.lon;
    return Number(raw);
  }

  function flightPointsForGlobe(rows) {
    return rows.slice(0, MAX_FLIGHT_POINTS).map((f) => ({
      ...f,
      size: FLIGHT_POINT_SIZE,
      alt: FLIGHT_POINT_ALT,
      color: 'rgba(255,214,10,0.92)',
      label: f.label || f.callsign || 'Flight',
    }));
  }

  function buildRocketElement() {
    if (rocketElementProto) return rocketElementProto.cloneNode(true);
    const el = document.createElement('div');
    el.className = 'v4-god-rocket-marker';
    el.innerHTML = [
      '<div class="v4-god-rocket-stack">',
      '  <div class="v4-god-rocket-nose"></div>',
      '  <div class="v4-god-rocket-body"></div>',
      '  <div class="v4-god-rocket-fin v4-god-rocket-fin-l"></div>',
      '  <div class="v4-god-rocket-fin v4-god-rocket-fin-r"></div>',
      '  <div class="v4-god-rocket-flame"></div>',
      '  <div class="v4-god-rocket-blast"></div>',
      '</div>',
    ].join('');
    rocketElementProto = el;
    return el.cloneNode(true);
  }

  function parseFlightStates(states) {
    const out = [];
    const rows = Array.isArray(states) ? states : [];
    for (let i = 0; i < rows.length && out.length < 1400; i++) {
      const s = rows[i];
      if (!Array.isArray(s) || s.length < 11) continue;
      const lat = Number(s[6]);
      const lng = Number(s[5]);
      const altM = Number(s[7]);
      const vel = Number(s[9]);
      const heading = Number(s[10]);
      const callsign = String(s[1] || '').trim();
      const country = String(s[2] || '').trim();
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
      const altKm = Number.isFinite(altM) ? Math.max(0.002, altM / 100000) : 0.01;
      out.push({
        lat,
        lng,
        alt: Math.min(altKm, 0.35),
        heading: Number.isFinite(heading) ? heading : 0,
        label: callsign || country || 'Flight',
        callsign,
        country,
        type: 'flight',
        altitudeFt: Number.isFinite(altM) ? Math.round(altM * 3.281) : null,
        speedKts: Number.isFinite(vel) ? Math.round(vel * 1.944) : null,
      });
    }
    return out;
  }

  async function fetchWeatherCity(name, lat, lng) {
    const url = `https://wttr.in/${lat},${lng}?format=j1`;
    const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json', 'User-Agent': 'UNALIGNED-GodMode/1.0' } });
    if (!res.ok) throw new Error('weather failed for ' + name);
    const row = await res.json();
    const cur = row?.current_condition?.[0] || {};
    const temp = Number(cur.temp_F);
    const wind = Number(cur.windspeedMiles);
    const code = Number(cur.weatherCode);
    return mapWeatherRow({ name, lat, lng, temp, wind, code });
  }

  function mapWeatherRow(row) {
    const temp = Number(row?.temp);
    const wind = Number(row?.wind);
    const code = Number(row?.code);
    const name = String(row?.name || '').trim();
    const lat = Number(row?.lat);
    const lng = Number(row?.lng);
    return {
      name,
      lat,
      lng,
      temp: Number.isFinite(temp) ? Math.round(temp) : null,
      wind: Number.isFinite(wind) ? Math.round(wind) : null,
      code,
      color: tempColor(temp),
      text: Number.isFinite(temp) ? `${Math.round(temp)}°` : '—',
      labelSize: 0.42,
      alt: 0.008,
      type: 'weather',
    };
  }

  async function fetchWeatherGrid() {
    try {
      const data = await fetchGodModeProxy('/god-mode/weather');
      if (data?.ok && Array.isArray(data.cities) && data.cities.length) {
        return data.cities.map(mapWeatherRow).filter((row) => row.name && Number.isFinite(row.lat));
      }
    } catch (e) {
      console.warn('[god-mode] Mac weather proxy failed, trying browser', e);
    }
    const out = [];
    const batchSize = 8;
    for (let i = 0; i < WEATHER_CITIES.length; i += batchSize) {
      const batch = WEATHER_CITIES.slice(i, i + batchSize);
      const rows = await Promise.allSettled(
        batch.map(([name, lat, lng]) => fetchWeatherCity(name, lat, lng))
      );
      rows.forEach((row) => {
        if (row.status === 'fulfilled') out.push(row.value);
      });
    }
    if (!out.length) throw new Error('weather grid failed');
    return out;
  }

  async function fetchFlights() {
    const data = await fetchGodModeProxy('/god-mode/flights');
    if (!data?.ok) throw new Error(data?.error || 'flight proxy failed');
    const rows = parseFlightStates(data.states);
    if (!rows.length) throw new Error('no aircraft returned');
    return rows;
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

  async function fetchLaunches() {
    const url = 'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=24&mode=detailed';
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error('launches failed');
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
    const streetRef = React.useRef(null);
    const streetMapRef = React.useRef(null);
    const radarTimerRef = React.useRef(null);
    const radarMeshRef = React.useRef(null);
    const radarTextureLoaderRef = React.useRef(null);
    const radarBusyRef = React.useRef(false);
    const applyLayersRef = React.useRef(() => {});
    const syncStreetRef = React.useRef(() => {});
    const resizeRef = React.useRef(() => {});
    const viewerRef = React.useRef(viewer);
    const layerRef = React.useRef(activeLayer);
    const radarGlobeUrlRef = React.useRef('');

    const [layer, setLayer] = React.useState(activeLayer);
    const [loading, setLoading] = React.useState(true);
    const [errors, setErrors] = React.useState({});
    const [weather, setWeather] = React.useState([]);
    const [flights, setFlights] = React.useState([]);
    const [satellites, setSatellites] = React.useState([]);
    const [launches, setLaunches] = React.useState({ markers: [], list: [] });
    const [radar, setRadar] = React.useState(null);
    const [radarTileUrl, setRadarTileUrl] = React.useState('');
    const [streetMode, setStreetMode] = React.useState(false);
    const [zoomLabel, setZoomLabel] = React.useState('Orbital view');
    const [stats, setStats] = React.useState({ flights: 0, sats: 0, launches: 0, cities: 0 });
    const [selected, setSelected] = React.useState(null);
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
      if (streetMapRef.current) streetMapRef.current.resize();
    }, []);

    const ensureStreetMap = React.useCallback(async (lng, lat) => {
      const container = streetRef.current;
      if (!container || streetMapRef.current) return;
      try {
        const MapLibre = await ensureMapLibreLibrary();
        streetMapRef.current = new MapLibre.Map({
          container,
          style: OPENFREEMAP_STYLE,
          center: [Number(lng) || 0, Number(lat) || 20],
          zoom: 14,
          pitch: 58,
          bearing: 0,
          antialias: true,
          attributionControl: false,
        });
        streetMapRef.current.on('load', () => resizeGlobe());
      } catch (e) {
        console.warn('[god-mode] MapLibre unavailable', e);
      }
    }, [resizeGlobe]);

    const syncStreetMode = React.useCallback((globe) => {
      if (!globe) return;
      try {
      const pov = globe.pointOfView();
      const alt = Number(pov?.altitude);
      const lat = Number(pov?.lat);
      const lng = Number(pov?.lng);
      const active = Number.isFinite(alt) && alt < STREET_MODE_ALT;
      setStreetMode(active);
      if (alt >= 2.4) setZoomLabel('Orbital view');
      else if (alt >= 1.2) setZoomLabel('Continental view');
      else if (alt >= STREET_MODE_ALT) setZoomLabel('Satellite imagery · scroll to zoom closer');
      else setZoomLabel('Street detail · 3D buildings');
      if (active) {
        ensureStreetMap(lng, lat);
        const map = streetMapRef.current;
        if (map) {
          const zoom = Math.min(18, Math.max(11, 18 - alt * 14));
          const ctrl = globe.controls();
          const az = Number(ctrl?.azimuthalAngle ?? ctrl?.getAzimuthalAngle?.() ?? 0);
          const bearing = (az * 180) / Math.PI;
          map.jumpTo({ center: [lng, lat], zoom, pitch: 62, bearing });
        }
      }
      } catch (e) {
        console.warn('[god-mode] street sync failed', e);
      }
    }, [ensureStreetMap]);

    const applyGlobeLayers = React.useCallback(() => {
      const globe = globeInstRef.current;
      if (!globe) return;
      setLayerError('');
      try {
        const showWeather = layer === 'all' || layer === 'weather';
        const showFlights = layer === 'all' || layer === 'flights';
        const showSats = layer === 'all' || layer === 'satellites';
        const showLaunches = layer === 'all' || layer === 'launches';

        const flightPoints = showFlights && flights.length ? flightPointsForGlobe(flights) : [];
        const labelRows = [];
        if (showWeather) {
          labelRows.push(...weather.map((w) => ({
            ...w,
            text: w.text || (w.temp != null ? `${w.temp}°` : '—'),
            label: `${w.name} · ${w.temp != null ? w.temp + '°F' : '—'}`,
            labelSize: w.labelSize || 0.42,
          })));
        }
        if (showSats) {
          labelRows.push(...satellites.map((s) => ({
            ...s,
            text: s.text || s.label || 'SAT',
            labelSize: s.labelSize || 0.55,
          })));
        }
        const viewerLat = Number(viewer.lat);
        const viewerLon = viewerLng(viewer);
        if (Number.isFinite(viewerLat) && Number.isFinite(viewerLon)) {
          labelRows.push({
            lat: viewerLat,
            lng: viewerLon,
            alt: 0.008,
            text: '●',
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
          .labelDotRadius(0.14)
          .labelIncludeDot(true)
          .labelDotOrientation('bottom')
          .labelsTransitionDuration(0)
          .onLabelClick((pt) => setSelected(pt || null));

        const manyFlights = flightPoints.length > 120;
        globe
          .pointsData(flightPoints)
          .pointLat('lat')
          .pointLng('lng')
          .pointAltitude('alt')
          .pointRadius('size')
          .pointColor('color')
          .pointResolution(3)
          .pointsMerge(manyFlights)
          .pointsTransitionDuration(0)
          .onPointClick((pt) => setSelected(pt || null));

        globe.objectsData([]);

        if (showLaunches && launches.markers.length) {
          globe
            .htmlElementsData(launches.markers)
            .htmlLat('lat')
            .htmlLng('lng')
            .htmlAltitude('alt')
            .htmlElement(() => buildRocketElement())
            .htmlElementVisibilityModifier((el, isVisible) => {
              el.style.display = isVisible ? '' : 'none';
            })
            .htmlTransitionDuration(0);
        } else {
          globe.htmlElementsData([]);
        }

        globe
          .ringsData(showLaunches ? launches.markers : [])
          .ringLat('lat')
          .ringLng('lng')
          .ringAltitude(0.002)
          .ringMaxRadius(3.5)
          .ringPropagationSpeed(2.2)
          .ringRepeatPeriod(1200)
          .ringColor(() => 'rgba(255,69,58,0.55)');

        layerRef.current = layer;
        if (radarMeshRef.current) {
          radarMeshRef.current.visible = showWeather && !!radarGlobeUrlRef.current;
        }
      } catch (e) {
        const msg = String(e?.message || e || 'layer render failed');
        setLayerError(msg);
        console.error('[god-mode] layer apply failed', e);
      }
    }, [layer, weather, flights, satellites, launches, viewer]);

    applyLayersRef.current = applyGlobeLayers;
    syncStreetRef.current = syncStreetMode;
    resizeRef.current = resizeGlobe;

    const applyRadarGlobeTexture = React.useCallback((url) => {
      const mesh = radarMeshRef.current;
      const THREE = resolveThree();
      if (!mesh || !THREE || !url) return;
      if (!radarTextureLoaderRef.current) radarTextureLoaderRef.current = new THREE.TextureLoader();
      radarTextureLoaderRef.current.load(url, (tex) => {
        if (!radarMeshRef.current) return;
        const old = radarMeshRef.current.material?.map;
        if (old && old.dispose) old.dispose();
        tex.anisotropy = 4;
        radarMeshRef.current.material.map = tex;
        radarMeshRef.current.material.needsUpdate = true;
      });
    }, []);

    const syncRadarOverlayVisibility = React.useCallback(() => {
      const mesh = radarMeshRef.current;
      if (!mesh) return;
      const showWeather = layerRef.current === 'all' || layerRef.current === 'weather';
      mesh.visible = showWeather && !!radarGlobeUrlRef.current;
    }, []);

    const setupRadarShell = React.useCallback((globe) => {
      const THREE = resolveThree();
      if (!globe || !THREE) return;
      try {
        globe
          .customLayerData([{ id: 'radar-shell' }])
          .customThreeObject(() => {
            const radius = globe.getGlobeRadius() * 1.012;
            const geometry = new THREE.SphereGeometry(radius, 72, 36);
            const material = new THREE.MeshBasicMaterial({
              transparent: true,
              opacity: 0.82,
              depthWrite: false,
              blending: THREE.NormalBlending,
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.renderOrder = 2;
            mesh.visible = false;
            radarMeshRef.current = mesh;
            return mesh;
          });
      } catch (e) {
        console.warn('[god-mode] radar shell unavailable', e);
      }
    }, []);

    React.useEffect(() => {
      if (!open) return undefined;
      let cancelled = false;
      let resizeObs = null;
      let globe = null;
      let onControls = null;

      const mountGlobe = async () => {
        if (cancelled) return;
        if (!globeRef.current) {
          window.requestAnimationFrame(mountGlobe);
          return;
        }
        if (globeInstRef.current) return;
        setGlobeError('');
        try {
          const GlobeFactory = await ensureGlobeLibrary();
          if (cancelled || !globeRef.current || globeInstRef.current) return;
          const v = viewerRef.current || {};
          globe = initGlobeInstance(GlobeFactory, globeRef.current)
            .globeImageUrl(EARTH_IMG)
            .bumpImageUrl(BUMP_IMG)
            .backgroundImageUrl(SKY_IMG)
            .showAtmosphere(true)
            .atmosphereColor('lightskyblue')
            .atmosphereAltitude(0.18)
            .pointLabel('label')
            .onPointHover((pt) => {
              if (globeRef.current) globeRef.current.style.cursor = pt ? 'pointer' : 'grab';
            });
          globe.controls().autoRotate = true;
          globe.controls().autoRotateSpeed = 0.35;
          globe.controls().enableDamping = true;
          globe.controls().minDistance = 101;
          globe.controls().maxDistance = 520;
          globe.pointOfView({ lat: Number(v.lat) || 28, lng: viewerLng(v) || -20, altitude: 2.2 }, 0);
          globeInstRef.current = globe;
          setupRadarShell(globe);

          onControls = () => syncStreetRef.current(globe);
          globe.controls().addEventListener('change', onControls);

          window.requestAnimationFrame(() => {
            resizeRef.current();
            applyLayersRef.current();
            syncStreetRef.current(globe);
            if (radarGlobeUrlRef.current) applyRadarGlobeTexture(radarGlobeUrlRef.current);
            syncRadarOverlayVisibility();
          });
          if (typeof ResizeObserver !== 'undefined') {
            resizeObs = new ResizeObserver(() => resizeRef.current());
            resizeObs.observe(globeRef.current);
          }
          window.addEventListener('resize', resizeRef.current);
        } catch (e) {
          if (!cancelled) {
            setGlobeError('3D globe failed to load: ' + (e?.message || 'unknown error') + '. Hard refresh (Cmd+Shift+R).');
          }
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
        if (streetMapRef.current) {
          streetMapRef.current.remove();
          streetMapRef.current = null;
        }
        if (radarMeshRef.current?.material?.map?.dispose) {
          try { radarMeshRef.current.material.map.dispose(); } catch (e) {}
        }
        radarMeshRef.current = null;
        radarGlobeUrlRef.current = '';
        globeInstRef.current = null;
        if (globeRef.current) globeRef.current.innerHTML = '';
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
        radarBusyRef.current = true;
        try {
          const frame = radar.frames[idx];
          const globeUrl = buildRadarFrameUrl(radar.host, frame, 0, 0, 0);
          const stripUrl = await buildRadarTileComposite(radar.host, frame, 1, 2, 2);
          if (cancelled) return;
          if (globeUrl) {
            radarGlobeUrlRef.current = globeUrl;
            applyRadarGlobeTexture(globeUrl);
            syncRadarOverlayVisibility();
          }
          if (stripUrl) setRadarTileUrl(stripUrl);
          idx = (idx + 1) % radar.frames.length;
        } catch (e) {
          console.warn('[god-mode] radar frame failed', e);
        } finally {
          radarBusyRef.current = false;
        }
      };

      tick();
      radarTimerRef.current = window.setInterval(tick, 1200);
      return () => {
        cancelled = true;
        if (radarTimerRef.current) {
          clearInterval(radarTimerRef.current);
          radarTimerRef.current = null;
        }
      };
    }, [open, radar, applyRadarGlobeTexture, syncRadarOverlayVisibility]);

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
        setLoading(true);
        setErrors({});
        await Promise.all([
          loadFeed('weather', fetchWeatherGrid, (v) => {
            setWeather(v);
            setStats((s) => ({ ...s, cities: v.length }));
          }),
          loadFeed('flights', fetchFlights, (v) => {
            setFlights(v);
            setStats((s) => ({ ...s, flights: v.length }));
          }),
          loadFeed('satellites', fetchIss, (v) => {
            setSatellites(v);
            setStats((s) => ({ ...s, sats: v.length }));
          }),
          loadFeed('launches', fetchLaunches, (v) => {
            setLaunches(v);
            setStats((s) => ({ ...s, launches: v.list.length }));
          }),
          loadFeed('radar', fetchRadarMeta, (v) => {
            if (v) setRadar(v);
          }),
        ]);
        if (!cancelled) setLoading(false);
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
      }, 300000);
      const radarTimer = setInterval(() => {
        fetchRadarMeta().then((meta) => { if (!cancelled && meta) setRadar(meta); }).catch(() => {});
      }, 300000);

      return () => {
        cancelled = true;
        clearInterval(flightTimer);
        clearInterval(issTimer);
        clearInterval(launchTimer);
        clearInterval(radarTimer);
      };
    }, [open]);

    function pickLayer(id) {
      setLayerError('');
      setLayer(id);
      layerRef.current = id;
      onLayerChange?.(id);
      setSelected(null);
      syncRadarOverlayVisibility();
    }

    if (!open) return null;

    const panelLayer = layer === 'all' ? 'weather' : layer;
    const launchList = launches.list || [];
    const showRadarHud = (layer === 'all' || layer === 'weather') && radarTileUrl;

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
            { className: 'v4-godmode-stage' + (streetMode ? ' is-street-mode' : '') },
            loading && React.createElement('div', { className: 'v4-godmode-loading' }, 'Pulling live planetary data…'),
            !loading && stats.cities === 0 && stats.flights === 0 && Object.keys(errors).length > 0
              && React.createElement('div', { className: 'v4-godmode-loading v4-godmode-loading-warn' }, 'Some feeds failed — check errors below'),
            globeError && React.createElement('div', { className: 'v4-godmode-globe-error' }, globeError),
            React.createElement('div', { className: 'v4-godmode-zoom-chip' }, zoomLabel),
            React.createElement('div', { ref: globeRef, className: 'v4-godmode-globe' + (streetMode ? ' is-faded' : '') }),
            React.createElement('div', { ref: streetRef, className: 'v4-godmode-street' + (streetMode ? ' is-active' : '') }),
            showRadarHud && React.createElement(
              'div',
              { className: 'v4-godmode-radar-strip is-visible' },
              React.createElement('span', { className: 'v4-godmode-radar-label' }, 'Live precipitation radar'),
              React.createElement('img', {
                className: 'v4-godmode-radar-img',
                src: radarTileUrl,
                alt: 'Global precipitation radar',
                title: 'RainViewer precipitation radar',
              })
            ),
            selected && React.createElement(
              'div',
              { className: 'v4-godmode-pin' },
              React.createElement('strong', null, selected.label || selected.name || 'Selected'),
              selected.type === 'flight' && React.createElement('div', null,
                selected.altitudeFt != null ? `${selected.altitudeFt.toLocaleString()} ft` : '',
                selected.speedKts != null ? ` · ${selected.speedKts} kts` : ''
              ),
              selected.type === 'weather' && selected.wind != null && React.createElement('div', null, `Wind ${selected.wind} mph`),
              selected.type === 'launch' && selected.when && React.createElement('div', null, fmtLaunchWhen(selected.when))
            )
          ),
          React.createElement(
            'aside',
            { className: 'v4-godmode-panel' },
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
                        const g = globeInstRef.current;
                        if (g && Number.isFinite(item.lat) && Number.isFinite(item.lng)) {
                          g.pointOfView({ lat: item.lat, lng: item.lng, altitude: 1.6 }, 1200);
                          setSelected({ ...item, type: 'launch', label: item.name });
                        }
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
            panelLayer === 'weather' && React.createElement(
              React.Fragment,
              null,
              React.createElement('div', { className: 'v4-godmode-panel-head' }, 'Global weather mesh'),
              React.createElement('p', { className: 'v4-godmode-panel-note' }, 'Animated precipitation radar draped on the globe + city temperature nodes. Scroll in for satellite tiles, then 3D buildings.'),
              React.createElement('div', { className: 'v4-godmode-legend' },
                ['95°+', '82°', '68°', '50°', '32°', 'Cold'].map((label, i) => {
                  const colors = ['#ff3b30', '#ff9500', '#ffd60a', '#34c759', '#5ac8fa', '#5e5ce6'];
                  return React.createElement('span', { key: label, className: 'v4-godmode-legend-item' },
                    React.createElement('i', { style: { background: colors[i] } }),
                    label
                  );
                })
              ),
              React.createElement(
                'div',
                { className: 'v4-godmode-weather-list' },
                weather.slice(0, 12).map((w) =>
                  React.createElement('div', { key: w.name, className: 'v4-godmode-weather-row' },
                    React.createElement('span', null, w.name),
                    React.createElement('strong', null, w.temp != null ? `${w.temp}°F` : '—')
                  )
                )
              )
            ),
            panelLayer === 'flights' && React.createElement(
              React.Fragment,
              null,
              React.createElement('div', { className: 'v4-godmode-panel-head' }, 'Live air traffic'),
              React.createElement('p', { className: 'v4-godmode-panel-note' }, `Tracking ${stats.flights.toLocaleString()} aircraft via OpenSky. Refreshes every 20s.`),
              React.createElement('div', { className: 'v4-godmode-flight-hint' }, `Showing up to ${MAX_FLIGHT_POINTS.toLocaleString()} aircraft as lightweight points. Click any dot for callsign + altitude.`)
            ),
            panelLayer === 'satellites' && React.createElement(
              React.Fragment,
              null,
              React.createElement('div', { className: 'v4-godmode-panel-head' }, 'Satellite tracking'),
              React.createElement('p', { className: 'v4-godmode-panel-note' }, 'ISS live position (cyan). Full constellation mesh coming next — Starlink, GPS, weather sats.'),
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