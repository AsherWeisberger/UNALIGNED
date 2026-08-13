/**
 * God Mode Cesium — Phase 3f leak/glitch/perf pass for UNIFY Planetary Ops.
 * Browser-loadable IIFE. Exposes window.V4GodModeEarth (React function component).
 * API: { open, layer, viewer, onClose, onLayerChange }
 * React / ReactDOM are globals (ops.html). CesiumJS loaded on demand from CDN.
 */
(function (global) {
  'use strict';

  const React = global.React;
  if (!React) return;

  const CESIUM_VERSION = '1.125';
  const CESIUM_BASE = 'https://cesium.com/downloads/cesiumjs/releases/' + CESIUM_VERSION + '/Build/Cesium/';
  const CESIUM_JS = CESIUM_BASE + 'Cesium.js';
  const CESIUM_CSS = CESIUM_BASE + 'Widgets/widgets.css';
  const SAT_LIB_URL = 'https://unpkg.com/satellite.js@5.0.0/dist/satellite.min.js';
  const H3_JS_URLS = [
    'https://cdn.jsdelivr.net/npm/h3-js@4.2.1/dist/h3-js.umd.js',
    'https://unpkg.com/h3-js@3.7.2/dist/h3-js.js',
  ];
  const CELESTRAK_TLE = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=';
  const USGS_QUAKES_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson';
  const NHC_STORMS_URL = 'https://www.nhc.noaa.gov/CurrentStorms.json';
  const NHC_CONES_URL = 'https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather_summary/MapServer/7/query?where=1%3D1&outFields=*&f=geojson';
  const NHC_TRACKS_URL = 'https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather_summary/MapServer/6/query?where=1%3D1&outFields=*&f=geojson';
  const NHC_PAST_TRACK_URL = 'https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather_summary/MapServer/11/query?where=1%3D1&outFields=*&f=geojson';
  const NHC_KML_URL = 'https://www.nhc.noaa.gov/gis/kml/nhc_active.kml';
  const OPENSEAMAP_URL = 'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png';
  const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
  const EEZ_WFS_BASE = 'https://geo.vliz.be/geoserver/MarineRegions/wfs';

  const FETCH_TIMEOUT_MS = 18000;
  const WEATHER_PROXY_TIMEOUT_MS = 8000;
  const LAUNCH_CACHE_KEY = 'v4-godmode-launch-cache-v1';
  const EONET_CACHE_KEY = 'v4-godmode-eonet-cache-v1';
  const STARLINK_TLE_CACHE_KEY = 'v4-godmode-starlink-tle-v1';
  const TLE_GROUP_CACHE_PREFIX = 'v4-godmode-tle-';
  const DEAL_GEO_CACHE_KEY = 'v4-godmode-dealgeo-v1';
  const SHIP_META_CACHE_KEY = 'v4-godmode-ais-meta-v1';
  const LAUNCH_CACHE_TTL_MS = 25 * 60 * 1000;
  const EONET_CACHE_TTL_MS = 10 * 60 * 1000;
  const STARLINK_TLE_TTL_MS = 6 * 60 * 60 * 1000;
  const TLE_GROUP_TTL_MS = 6 * 60 * 60 * 1000;
  const SHIP_META_TTL_MS = 12 * 60 * 1000;

  const MAX_FLIGHT_POINTS = 420;
  const MAX_SHIP_POINTS = 1100;
  const STARLINK_MAX_ALL = 720;
  const STARLINK_MAX_FOCUS = 1100;
  const GPS_MAX = 64;
  const WXSAT_MAX = 80;
  const STATION_MAX = 24;
  const ONEWEB_MAX = 280;
  const GEO_MAX = 180;
  const VISUAL_MAX = 80;
  const MILSAT_MAX = 24;
  const KUIPER_MAX = 180;
  const GPSJAM_ORBIT_CAP = 1200;
  const GPSJAM_REGIONAL_CAP = 2500;
  const GPSJAM_CITY_CAP = 4000;
  const GPSJAM_HEX_M = 22000;
  const USGS_POLL_MS = 10 * 60 * 1000;
  const LOD_CITY_M = 80e3;
  const LOD_REGIONAL_M = 1200e3;
  const CITY_LABEL_DIST_M = 95e3;
  const ROAD_QUERY_DEBOUNCE_MS = 800;
  const ROAD_OVERPASS_TIMEOUT_MS = 25000;
  const ROAD_WAY_CAP = 180;
  const ROAD_LINE_CAP = 48;
  const ROAD_PARTICLE_MAX = 280;
  const ROAD_BBOX_MAX_DEG = 0.38;
  const EEZ_MAX_FEATURES = 50;
  const EEZ_BBOX_MAX_DEG = 12;
  const EEZ_TIMEOUT_MS = 18000;
  const SHIP_POLL_MS = 28000;
  const FLIGHT_POLL_MS = 40000;
  const MIL_POLL_MS = 20000;
  const RADAR_ALPHA = 0.45;
  const RADAR_FRAME_MS = 1000;
  const RADAR_HIDE_M = 25000;
  const RADAR_FADE_M = 40000;
  const SAT_LIVE_MS = 4000;
  const SAT_WARP_MS = 350;

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
    { id: 'all', label: 'God mode', glyph: '◉', key: '1' },
    { id: 'deals', label: 'Deals', glyph: '$', key: '2' },
    { id: 'weather', label: 'Weather', glyph: '☁', key: '3' },
    { id: 'events', label: 'Events', glyph: '⚡', key: '4' },
    { id: 'flights', label: 'Flights', glyph: '✈', key: '5' },
    { id: 'satellites', label: 'Satellites', glyph: '◎', key: '6' },
    { id: 'launches', label: 'Launches', glyph: '▲', key: '7' },
    { id: 'ships', label: 'Ships', glyph: '⚓', key: '8' },
    { id: 'gpsjam', label: 'GPS jam', glyph: '⬡', key: '9' },
  ];

  const LAYER_GROUPS = {
    all: null,
    deals: ['deal', 'deal-arc'],
    weather: ['weather', 'storm'],
    events: ['event', 'gpsjam'],
    flights: ['flight', 'military'],
    satellites: ['satellite', 'starlink', 'gps', 'wxsat', 'station', 'oneweb', 'geo', 'visual', 'milsat', 'kuiper'],
    gpsjam: ['gpsjam'],
    launches: ['launch'],
    ships: ['ship'],
  };

  const DEAL_STAGE_COLORS = {
    'first-touch': '#8e9dff', engaged: '#5ac8fa', 'rates-sent': '#ffd60a',
    negotiating: '#ff9f0a', 'invoice-sent': '#ff5e6c', done: '#34c759', 'paid-out': '#f5c518',
  };
  const DEAL_ACTIVE_STAGES = Object.keys(DEAL_STAGE_COLORS);
  const LAUNCH_PROVIDER_COLORS = [
    [/space ?x|falcon|starship/i, '#4da3ff'],
    [/blue origin|new glenn|new shepard/i, '#8e9dff'],
    [/rocket ?lab|electron|neutron/i, '#ff5e6c'],
    [/united launch|\bula\b|vulcan|atlas v/i, '#ffd60a'],
    [/arianespace|ariane|vega/i, '#bf5af2'],
    [/casc|long march|china aerospace|cz-/i, '#ff453a'],
    [/roscosmos|soyuz|proton|angara/i, '#ff9f0a'],
    [/isro|pslv|gslv|lvm/i, '#34c759'],
    [/nasa|\bsls\b/i, '#ff375f'],
  ];

  const AIS_TYPE_COLORS = [
    [35, '#ff9f0a'],   // military
    [80, '#ff453a'],   // tanker family 80-89
    [70, '#ffd60a'],   // cargo 70-79
    [60, '#64d2ff'],   // passenger 60-69
    [50, '#bf5af2'],   // special craft 50-59
    [40, '#ff5e6c'],   // HSC
    [30, '#34c759'],   // fishing
    [36, '#5ac8fa'],
    [37, '#8e9dff'],
  ];

  const SKINS = [
    { id: 'eo', label: 'EO', key: 'E' },
    { id: 'nvg', label: 'NVG', key: 'N' },
    { id: 'flir', label: 'FLIR', key: 'F' },
    { id: 'crt', label: 'CRT', key: 'C' },
  ];

  const SHADER_NVG = [
    'uniform sampler2D colorTexture;',
    'in vec2 v_textureCoordinates;',
    'void main() {',
    '  vec4 c = texture(colorTexture, v_textureCoordinates);',
    '  float l = dot(c.rgb, vec3(0.22, 0.72, 0.06));',
    '  float g = pow(clamp(l * 1.45, 0.0, 1.0), 0.82);',
    '  float n = fract(sin(dot(v_textureCoordinates * 240.0, vec2(12.9898, 78.233))) * 43758.5453);',
    '  g = clamp(g + (n - 0.5) * 0.07, 0.0, 1.0);',
    '  float vig = smoothstep(0.95, 0.32, length(v_textureCoordinates - vec2(0.5)));',
    '  out_FragColor = vec4(0.02, g, 0.08, 1.0) * vig;',
    '}',
  ].join('\n');

  const SHADER_FLIR = [
    'uniform sampler2D colorTexture;',
    'in vec2 v_textureCoordinates;',
    'void main() {',
    '  vec4 c = texture(colorTexture, v_textureCoordinates);',
    '  float l = pow(dot(c.rgb, vec3(0.299, 0.587, 0.114)), 0.72);',
    '  vec3 cold = vec3(0.01, 0.02, 0.06);',
    '  vec3 mid = vec3(0.78, 0.18, 0.02);',
    '  vec3 hot = vec3(1.0, 0.94, 0.55);',
    '  vec3 col = mix(cold, mid, clamp(l * 1.55, 0.0, 1.0));',
    '  col = mix(col, hot, clamp((l - 0.52) * 2.3, 0.0, 1.0));',
    '  out_FragColor = vec4(col, 1.0);',
    '}',
  ].join('\n');

  const SHADER_CRT = [
    'uniform sampler2D colorTexture;',
    'in vec2 v_textureCoordinates;',
    'void main() {',
    '  vec2 uv = v_textureCoordinates;',
    '  vec2 center = uv - vec2(0.5);',
    '  uv += center * dot(center, center) * 0.07;',
    '  float r = texture(colorTexture, uv + vec2(0.0016, 0.0)).r;',
    '  float g = texture(colorTexture, uv).g;',
    '  float b = texture(colorTexture, uv - vec2(0.0016, 0.0)).b;',
    '  float scan = 0.88 + 0.12 * sin(uv.y * 980.0);',
    '  vec3 phos = vec3(r * 0.62, g * 1.08, b * 0.92) * scan;',
    '  phos *= vec3(0.72, 1.08, 0.98);',
    '  float vig = 1.0 - dot(center, center) * 0.85;',
    '  out_FragColor = vec4(phos * vig, 1.0);',
    '}',
  ].join('\n');

  let cesiumLibPromise = null;
  let satLibPromise = null;
  let stylesInjected = false;
  let issIconUrl = null;
  const tleStore = {
    starlink: null,
    gps: null,
    weather: null,
    stations: null,
    starlinkSubset: null,
    oneweb: null,
    geo: null,
    visual: null,
    military: null,
    kuiper: null,
  };
  const EXTRA_TLE = [
    { group: 'oneweb', type: 'oneweb', color: '#64d2ff', prefix: 'ow-', max: ONEWEB_MAX, altMin: 300, altMax: 2000 },
    { group: 'geo', type: 'geo', color: '#bf5af2', prefix: 'geo-', max: GEO_MAX, altMin: 25000, altMax: 45000 },
    { group: 'visual', type: 'visual', color: '#ff9f0a', prefix: 'vis-', max: VISUAL_MAX, altMin: 200, altMax: 45000 },
    { group: 'military', type: 'milsat', color: '#ff453a', prefix: 'mil-', max: MILSAT_MAX, altMin: 200, altMax: 45000 },
    { group: 'kuiper', type: 'kuiper', color: '#5ac8fa', prefix: 'kp-', max: KUIPER_MAX, altMin: 300, altMax: 2000 },
  ];
  let h3LibPromise = null;
  const trailHistory = new Map();

  function injectStyles() {
    if (stylesInjected || document.getElementById('v4-gm2-styles')) { stylesInjected = true; return; }
    const css = [
      '.v4-godmode.v4-gm2{--gm2-cyan:#64d2ff;--gm2-amber:#ffd60a;--gm2-red:#ff453a;--gm2-panel:rgba(8,12,20,0.82);--gm2-border:rgba(100,210,255,0.22);--gm2-text:#e8eef8;--gm2-muted:#8b96a8;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}',
      '.v4-gm2 .v4-godmode-shell{position:relative;display:flex;flex-direction:column;width:min(100vw,100%);height:min(100vh,100%);background:#05070c;color:var(--gm2-text);overflow:hidden;border:1px solid var(--gm2-border);box-shadow:0 0 80px rgba(0,40,80,0.45)}',
      '.v4-gm2 .v4-godmode-body{position:relative;flex:1;min-height:0;display:flex}',
      '.v4-gm2 .v4-gm2-stage{position:relative;flex:1;min-width:0;min-height:0;background:#02040a}',
      '.v4-gm2 .v4-gm2-cesium,.v4-gm2 .v4-gm2-cesium .cesium-viewer,.v4-gm2 .v4-gm2-cesium .cesium-viewer-cesiumWidgetContainer,.v4-gm2 .v4-gm2-cesium .cesium-widget,.v4-gm2 .v4-gm2-cesium canvas{width:100%!important;height:100%!important}',
      '.v4-gm2 .v4-gm2-cesium .cesium-viewer-bottom,.v4-gm2 .v4-gm2-cesium .cesium-viewer-animationContainer,.v4-gm2 .v4-gm2-cesium .cesium-viewer-timelineContainer,.v4-gm2 .v4-gm2-cesium .cesium-viewer-fullscreenContainer,.v4-gm2 .v4-gm2-cesium .cesium-viewer-vrContainer,.v4-gm2 .v4-gm2-cesium .cesium-viewer-toolbar{display:none!important}',
      '.v4-gm2 .v4-gm2-cesium .cesium-credit-logoContainer,.v4-gm2 .v4-gm2-cesium .cesium-credit-expand-link{filter:invert(1) brightness(1.2);opacity:.55}',
      '.v4-gm2 .v4-godmode-head{display:flex;align-items:center;gap:16px;padding:10px 14px;border-bottom:1px solid var(--gm2-border);background:linear-gradient(180deg,rgba(10,18,32,.95),rgba(6,10,18,.88));z-index:5}',
      '.v4-gm2 .v4-godmode-title{display:flex;flex-direction:column;gap:2px;min-width:160px}',
      '.v4-gm2 .v4-godmode-eyebrow{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--gm2-cyan)}',
      '.v4-gm2 .v4-godmode-sub{font-size:11px;color:var(--gm2-muted)}',
      '.v4-gm2 .v4-godmode-stats{display:flex;flex-wrap:wrap;gap:8px;flex:1;justify-content:center}',
      '.v4-gm2 .v4-gm2-stat{display:flex;flex-direction:column;align-items:center;min-width:58px;padding:4px 10px;border:1px solid rgba(100,210,255,.14);background:rgba(12,20,36,.55);border-radius:4px}',
      '.v4-gm2 .v4-gm2-stat b{font-size:15px;color:#fff;font-weight:600}',
      '.v4-gm2 .v4-gm2-stat span{font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--gm2-muted)}',
      '.v4-gm2 .v4-gm2-clockbox{display:flex;flex-direction:column;align-items:flex-end;gap:4px;margin-left:auto}',
      '.v4-gm2 .v4-gm2-utc{font-size:12px;letter-spacing:.08em;color:var(--gm2-cyan)}',
      '.v4-gm2 .v4-gm2-rec{display:inline-flex;align-items:center;gap:6px;font-size:10px;letter-spacing:.16em;color:var(--gm2-red)}',
      '.v4-gm2 .v4-gm2-rec i{width:7px;height:7px;border-radius:50%;background:var(--gm2-red);box-shadow:0 0 8px var(--gm2-red);animation:v4gm2pulse 1.2s ease-in-out infinite}',
      '.v4-gm2 .v4-gm2-rec.is-paused{color:var(--gm2-amber);animation:none}',
      '.v4-gm2 .v4-gm2-rec.is-paused i{background:var(--gm2-amber);box-shadow:none;animation:none;opacity:.7}',
      '.v4-gm2 .v4-gm2-rec.is-warp{color:var(--gm2-amber)}',
      '.v4-gm2 .v4-gm2-rec.is-warp i{background:var(--gm2-amber);box-shadow:0 0 8px var(--gm2-amber);animation:v4gm2pulse 1.2s ease-in-out infinite}',
      '@keyframes v4gm2pulse{0%,100%{opacity:1}50%{opacity:.35}}',
      '.v4-gm2 .v4-godmode-close{appearance:none;border:1px solid rgba(255,69,58,.45);background:rgba(40,10,12,.55);color:#ff8a80;width:36px;height:36px;border-radius:4px;cursor:pointer;font-size:16px;margin-left:10px}',
      '.v4-gm2 .v4-godmode-close:hover{background:rgba(80,16,20,.8);color:#fff}',
      '.v4-gm2 .v4-godmode-layers{position:absolute;left:12px;top:12px;z-index:6;display:flex;flex-direction:column;gap:4px;padding:8px;background:var(--gm2-panel);border:1px solid var(--gm2-border);border-radius:6px;backdrop-filter:blur(10px);max-height:calc(100% - 88px);overflow:auto}',
      '.v4-gm2 .v4-godmode-layer{display:flex;align-items:center;gap:8px;appearance:none;border:1px solid transparent;background:transparent;color:var(--gm2-text);padding:7px 10px;border-radius:4px;cursor:pointer;font:inherit;font-size:12px;text-align:left;letter-spacing:.04em}',
      '.v4-gm2 .v4-godmode-layer:hover{background:rgba(100,210,255,.08)}',
      '.v4-gm2 .v4-godmode-layer.is-active{border-color:rgba(100,210,255,.45);background:rgba(100,210,255,.12);color:#fff}',
      '.v4-gm2 .v4-godmode-layer-glyph{width:1.2em;text-align:center;color:var(--gm2-cyan)}',
      '.v4-gm2 .v4-gm2-keyhint{margin-left:auto;font-size:9px;letter-spacing:.14em;color:var(--gm2-muted);opacity:.7}',
      '.v4-gm2 .v4-gm2-hud-right{position:absolute;right:12px;top:12px;z-index:6;display:flex;flex-direction:column;gap:8px;align-items:flex-end;max-width:min(360px,44vw)}',
      '.v4-gm2 .v4-gm2-chip{display:inline-flex;align-items:center;gap:8px;padding:6px 10px;background:var(--gm2-panel);border:1px solid var(--gm2-border);border-radius:4px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--gm2-cyan);backdrop-filter:blur(10px)}',
      '.v4-gm2 .v4-gm2-chip.warn{border-color:rgba(255,214,10,.35);color:var(--gm2-amber)}',
      '.v4-gm2 .v4-gm2-chip.ok{border-color:rgba(52,199,89,.4);color:#34c759}',
      '.v4-gm2 .v4-gm2-chip.err{border-color:rgba(255,69,58,.45);color:var(--gm2-red)}',
      '.v4-gm2 .v4-gm2-chiprow{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end;max-width:min(360px,44vw)}',
      '.v4-gm2 .v4-gm2-chip.satfam{max-width:min(320px,42vw);white-space:normal;line-height:1.35;letter-spacing:.06em;font-size:10px}',
      '.v4-gm2 .v4-gm2-skins{display:flex;gap:0;border:1px solid var(--gm2-border);border-radius:4px;overflow:hidden;background:var(--gm2-panel);backdrop-filter:blur(10px)}',
      '.v4-gm2 .v4-gm2-skin{appearance:none;border:0;background:transparent;color:var(--gm2-muted);padding:6px 10px;font:inherit;font-size:10px;letter-spacing:.14em;cursor:pointer}',
      '.v4-gm2 .v4-gm2-skin.is-active{background:rgba(100,210,255,.16);color:#fff}',
      '.v4-gm2 .v4-gm2-inspector{width:100%;padding:10px 12px;background:var(--gm2-panel);border:1px solid var(--gm2-border);border-radius:6px;backdrop-filter:blur(12px);color:var(--gm2-text);font-variant-numeric:tabular-nums}',
      '.v4-gm2 .v4-gm2-inspector .v4-gm2-ins-type{margin:0 0 2px;font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:var(--gm2-cyan)}',
      '.v4-gm2 .v4-gm2-inspector .v4-gm2-ins-name{margin:0 0 8px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#fff;font-weight:600;line-height:1.25;word-break:break-word}',
      '.v4-gm2 .v4-gm2-inspector .v4-gm2-ins-row{display:flex;justify-content:space-between;align-items:baseline;gap:12px;font-size:11px;line-height:1.55}',
      '.v4-gm2 .v4-gm2-inspector .k{color:var(--gm2-muted);letter-spacing:.14em;font-size:9px;text-transform:uppercase;flex:0 0 32px}',
      '.v4-gm2 .v4-gm2-inspector .v{color:var(--gm2-text);text-align:right;word-break:break-word}',
      '.v4-gm2 .v4-gm2-inspector-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;align-items:center}',
      '.v4-gm2 .v4-gm2-btn{appearance:none;border:1px solid var(--gm2-border);background:rgba(100,210,255,.08);color:var(--gm2-cyan);padding:5px 10px;border-radius:3px;font:inherit;font-size:11px;letter-spacing:.08em;cursor:pointer}',
      '.v4-gm2 .v4-gm2-btn:hover{background:rgba(100,210,255,.18);color:#fff}',
      '.v4-gm2 .v4-gm2-btn.is-active{border-color:rgba(100,210,255,.55);background:rgba(100,210,255,.22);color:#fff}',
      '.v4-gm2 .v4-gm2-skin .v4-gm2-skinkey{margin-left:5px;font-size:8px;letter-spacing:.12em;opacity:.55}',
      '.v4-gm2 .v4-gm2-keys{position:absolute;left:50%;bottom:56px;transform:translateX(-50%);z-index:8;min-width:248px;padding:12px 14px;background:var(--gm2-panel);border:1px solid var(--gm2-border);border-radius:6px;backdrop-filter:blur(14px);box-shadow:0 18px 48px rgba(0,8,20,.55)}',
      '.v4-gm2 .v4-gm2-keys h4{margin:0 0 8px;font-size:9px;letter-spacing:.22em;text-transform:uppercase;color:var(--gm2-cyan)}',
      '.v4-gm2 .v4-gm2-keys dl{margin:0;display:grid;grid-template-columns:56px 1fr;gap:4px 12px;font-size:11px}',
      '.v4-gm2 .v4-gm2-keys dt{color:var(--gm2-amber);letter-spacing:.08em;font-variant-numeric:tabular-nums}',
      '.v4-gm2 .v4-gm2-keys dd{margin:0;color:var(--gm2-text)}',
      '.v4-gm2 .v4-gm2-keys-foot{margin-top:8px;font-size:9px;letter-spacing:.14em;color:var(--gm2-muted);text-transform:uppercase}',
      '.v4-gm2 .v4-gm2-loading,.v4-gm2 .v4-godmode-loading{position:absolute;inset:0;z-index:4;display:flex;align-items:center;justify-content:center;background:rgba(2,4,10,.55);color:var(--gm2-cyan);letter-spacing:.14em;font-size:12px;text-transform:uppercase;pointer-events:none}',
      '.v4-gm2 .v4-godmode-loading-inline{inset:auto;top:12px;left:50%;transform:translateX(-50%);padding:8px 14px;border-radius:4px;border:1px solid var(--gm2-border);background:var(--gm2-panel);width:auto;height:auto}',
      '.v4-gm2 .v4-godmode-errors{position:absolute;left:12px;bottom:56px;z-index:6;max-width:320px;padding:8px 10px;background:rgba(40,10,12,.75);border:1px solid rgba(255,69,58,.4);border-radius:4px;font-size:10px;color:#ffb4ae;line-height:1.4;pointer-events:none}',
      '.v4-gm2 .v4-gm2-scan{pointer-events:none;position:absolute;inset:0;z-index:3;background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.08) 3px);mix-blend-mode:overlay;opacity:.28}',
      '.v4-gm2 .v4-gm2-vignette{pointer-events:none;position:absolute;inset:0;z-index:2;background:radial-gradient(ellipse at center,transparent 48%,rgba(0,0,0,.55) 100%)}',
      '.v4-gm2 .v4-gm2-sensor-fx{pointer-events:none;position:absolute;inset:0;z-index:3;opacity:0;transition:opacity .25s ease}',
      '.v4-gm2.v4-gm2-skin-nvg .v4-gm2-sensor-fx{opacity:1;background:radial-gradient(ellipse at center,rgba(20,80,40,.12),rgba(0,20,8,.45));box-shadow:inset 0 0 80px rgba(0,255,80,.12)}',
      '.v4-gm2.v4-gm2-skin-flir .v4-gm2-sensor-fx{opacity:1;background:radial-gradient(ellipse at center,rgba(80,20,0,.1),rgba(10,0,0,.4))}',
      '.v4-gm2.v4-gm2-skin-crt .v4-gm2-sensor-fx{opacity:1;background:repeating-linear-gradient(0deg,rgba(0,0,0,.18) 0,rgba(0,0,0,.18) 1px,transparent 2px,transparent 3px);mix-blend-mode:multiply}',
      '.v4-gm2.v4-gm2-skin-crt .v4-gm2-scan{opacity:.55}',
      '.v4-gm2 .v4-gm2-timeline{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);z-index:6;display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--gm2-panel);border:1px solid var(--gm2-border);border-radius:6px;backdrop-filter:blur(12px);font-size:11px;letter-spacing:.08em}',
      '.v4-gm2 .v4-gm2-timeline button{appearance:none;border:1px solid transparent;background:transparent;color:var(--gm2-muted);padding:4px 8px;border-radius:3px;font:inherit;font-size:10px;letter-spacing:.12em;cursor:pointer}',
      '.v4-gm2 .v4-gm2-timeline button.is-active{border-color:rgba(100,210,255,.45);color:#fff;background:rgba(100,210,255,.12)}',
      '.v4-gm2 .v4-gm2-timeline .v4-gm2-clock-read{color:var(--gm2-cyan);min-width:168px;text-align:right}',
      '.v4-gm2 .v4-gm2-note{font-size:9px;letter-spacing:.08em;color:var(--gm2-amber);text-transform:uppercase}',
      '.v4-gm2 .v4-gm2-cesium-host{position:absolute;inset:0;width:100%;height:100%;overflow:hidden}',
      '.v4-gm2 .v4-gm2-search{position:absolute;left:50%;top:12px;transform:translateX(-50%);z-index:8;display:flex;gap:6px;align-items:center;padding:6px 8px;background:var(--gm2-panel);border:1px solid var(--gm2-border);border-radius:6px;backdrop-filter:blur(10px);max-width:min(520px,70vw);width:min(520px,70vw)}',
      '.v4-gm2 .v4-gm2-search input{flex:1;min-width:0;height:32px;border:1px solid var(--gm2-border);background:rgba(8,12,20,.85);color:#e8eef8;border-radius:4px;padding:0 10px;font:inherit;font-size:12px;letter-spacing:.04em}',
      '.v4-gm2 .v4-gm2-search-msg{position:absolute;left:50%;top:52px;transform:translateX(-50%);z-index:8;padding:4px 10px;background:var(--gm2-panel);border:1px solid var(--gm2-border);border-radius:4px;font-size:11px;color:var(--gm2-cyan);pointer-events:none;white-space:nowrap}',
    ].join('\n');
    const style = document.createElement('style');
    style.id = 'v4-gm2-styles';
    style.textContent = css;
    document.head.appendChild(style);
    stylesInjected = true;
  }

  function loadCss(href, id) {
    if (document.getElementById(id)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.id = id; link.rel = 'stylesheet'; link.href = href;
      link.onload = () => resolve();
      link.onerror = () => reject(new Error('CSS failed: ' + href));
      document.head.appendChild(link);
    });
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
      s.id = id; s.src = src; s.async = true; s.crossOrigin = 'anonymous';
      s.onload = () => { s.dataset.loaded = '1'; resolve(); };
      s.onerror = () => reject(new Error('Script failed: ' + src));
      document.head.appendChild(s);
    });
  }

  async function ensureCesium() {
    if (global.Cesium && global.Cesium.Viewer) return global.Cesium;
    if (!cesiumLibPromise) {
      cesiumLibPromise = (async () => {
        await loadCss(CESIUM_CSS, 'cesium-widgets-css');
        if (!global.CESIUM_BASE_URL) global.CESIUM_BASE_URL = CESIUM_BASE;
        await loadExternalScript(CESIUM_JS, 'cesium-' + CESIUM_VERSION);
        if (!global.Cesium || !global.Cesium.Viewer) throw new Error('Cesium loaded but window.Cesium.Viewer missing');
        return global.Cesium;
      })();
    }
    return cesiumLibPromise;
  }

    function h3CellToLatLngFn(mod) {
    if (!mod || (typeof mod !== "object" && typeof mod !== "function")) return null;
    if (typeof mod.cellToLatLng === "function") return function (cell) { return mod.cellToLatLng(cell); };
    if (typeof mod.h3ToGeo === "function") return function (cell) { return mod.h3ToGeo(cell); };
    if (typeof mod.cellToLatLngs === "function") return function (cell) { return mod.cellToLatLngs(cell); };
    if (mod.default && mod.default !== mod) return h3CellToLatLngFn(mod.default);
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
    h3LibPromise = (async () => {
      for (let i = 0; i < H3_JS_URLS.length; i++) {
        try {
          await loadExternalScript(H3_JS_URLS[i], "h3-js-" + i);
          const h3 = resolveH3Module();
          if (h3) return h3;
        } catch (e) {
          console.warn("[god-mode-cesium] h3 candidate failed", H3_JS_URLS[i], e);
        }
      }
      return null;
    })();
    return h3LibPromise;
  }

  function isSatType(t) {
    return t === 'satellite' || t === 'starlink' || t === 'gps' || t === 'wxsat' || t === 'station'
      || t === 'oneweb' || t === 'geo' || t === 'visual' || t === 'milsat' || t === 'kuiper';
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

  function loadSatelliteLib() {
    if (global.satellite?.twoline2satrec) return Promise.resolve(global.satellite);
    if (satLibPromise) return satLibPromise;
    satLibPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SAT_LIB_URL; s.async = true;
      s.onload = () => (global.satellite?.twoline2satrec ? resolve(global.satellite) : reject(new Error('satellite.js loaded but missing API')));
      s.onerror = () => reject(new Error('satellite.js failed to load'));
      document.head.appendChild(s);
    });
    return satLibPromise;
  }

  function scrubBrowserFetchHeaders(headers) {
    if (!headers) return undefined;
    const clean = {};
    const put = (k, v) => {
      const key = String(k || '');
      if (/^(user-agent|accept-encoding|accept-charset|connection|content-length|host|keep-alive|transfer-encoding|upgrade|te|trailer)$/i.test(key)) return;
      clean[key] = v;
    };
    if (typeof headers.forEach === 'function') headers.forEach((v, k) => put(k, v));
    else Object.keys(headers).forEach((k) => put(k, headers[k]));
    return clean;
  }

  async function fetchWithTimeout(url, options, ms) {
    const timeout = Number(ms) || FETCH_TIMEOUT_MS;
    const ctrl = new AbortController();
    const timer = global.setTimeout(() => ctrl.abort(), timeout);
    const opts = Object.assign({}, options || {});
    const outer = opts.signal;
    delete opts.signal;
    if (outer) {
      if (outer.aborted) ctrl.abort();
      else {
        try { outer.addEventListener('abort', function () { ctrl.abort(); }, { once: true }); } catch (e) {}
      }
    }
    if (opts.headers) opts.headers = scrubBrowserFetchHeaders(opts.headers);
    try { return await fetch(url, Object.assign({}, opts, { signal: ctrl.signal, cache: 'no-store' })); }
    finally { global.clearTimeout(timer); }
  }

  function godModeServiceBases() {
    const bases = [];
    const host = String(global.location?.hostname || '').toLowerCase();
    try {
      const origin = String(global.location?.origin || '').replace(/\/$/, '');
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
        if (!res.ok) { lastErr = new Error('proxy ' + res.status); continue; }
        const ct = String(res.headers.get('content-type') || '');
        const body = await res.text();
        const looksJson = ct.includes('json') || /^\s*[{\[]/.test(body);
        if (looksJson) {
          try { return JSON.parse(body); }
          catch (e) { return { ok: true, text: body }; }
        }
        return { ok: true, text: body };
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('Mac god-mode proxy unreachable');
  }

  function readKey(name) {
    try {
      const w = global[name];
      if (w && String(w).trim()) return String(w).trim();
    } catch (e) {}
    try {
      const ls = global.localStorage?.getItem(name);
      if (ls && String(ls).trim()) return String(ls).trim();
    } catch (e) {}
    return '';
  }

  function readGoogleTilesKey() { return readKey('UNALIGNED_GOOGLE_MAPS_TILES_KEY') || 'AIzaSyAdikDP3IFcWhm-p-FVq49GHUoLqg18s64'; }
  function readAisstreamKey() { return readKey('UNALIGNED_AISSTREAM_KEY'); }

  function validLatLng(lat, lng, allowZeroZero) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
    if (!allowZeroZero && lat === 0 && lng === 0) return false;
    return true;
  }

  function cartesianFinite(Cesium, p) {
    return !!(p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
  }

  function filterCartesians(Cesium, positions) {
    const src = positions || [];
    const out = [];
    for (let i = 0; i < src.length; i++) {
      if (cartesianFinite(Cesium, src[i])) out.push(src[i]);
    }
    return out;
  }

  function tempColor(f) {
    const t = Number(f);
    if (!Number.isFinite(t)) return '#8c8c8c';
    if (t >= 95) return '#ff3b30';
    if (t >= 82) return '#ff9500';
    if (t >= 68) return '#ffd60a';
    if (t >= 50) return '#34c759';
    if (t >= 32) return '#5ac8fa';
    return '#5e5ce6';
  }

  function flightAltColor(altitudeFt) {
    const ft = Number(altitudeFt);
    if (!Number.isFinite(ft)) return '#ffd60a';
    if (ft >= 30000) return '#64d2ff';
    if (ft >= 15000) return '#ffd60a';
    return '#ff9f0a';
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

  function windCompass(deg) {
    const d = Number(deg);
    if (!Number.isFinite(d)) return '';
    return ['N','NE','E','SE','S','SW','W','NW'][Math.round(d / 45) % 8];
  }

  function wmoGlyph(code) {
    const c = Number(code);
    if (c === 0) return '☀';
    if (c === 1 || c === 2) return '⛅';
    if (c === 3 || c === 45 || c === 48) return '☁';
    if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return '🌧';
    if ((c >= 71 && c <= 77) || c === 85 || c === 86) return '❄';
    if (c >= 95) return '⛈';
    return '◌';
  }

  function wmoLabel(code) {
    const labels = {
      0:'Clear',1:'Mostly clear',2:'Partly cloudy',3:'Overcast',45:'Fog',48:'Freezing fog',
      51:'Light drizzle',53:'Drizzle',55:'Heavy drizzle',61:'Light rain',63:'Rain',65:'Heavy rain',
      71:'Light snow',73:'Snow',75:'Heavy snow',80:'Light showers',81:'Showers',82:'Heavy showers',95:'Thunderstorm',
    };
    return labels[Number(code)] || 'Weather';
  }

  function mapWeatherRow(row) {
    const temp = Number(row?.temp);
    const wind = Number(row?.wind);
    const code = Number(row?.code);
    const windDeg = Number(row?.wind_deg);
    const name = String(row?.name || '').trim();
    const lat = Number(row?.lat);
    const lng = Number(row?.lng);
    const condition = String(row?.conditionLabel || '').trim() || wmoLabel(code);
    const glyph = String(row?.glyphOverride || '').trim() || wmoGlyph(code);
    const tempRounded = Number.isFinite(temp) ? Math.round(temp) : null;
    return {
      name, lat, lng, temp: tempRounded,
      wind: Number.isFinite(wind) ? Math.round(wind) : null,
      windDeg: Number.isFinite(windDeg) ? windDeg : null,
      windCompass: windCompass(windDeg) || String(row?.wind_dir || '').trim(),
      code, condition, glyph, color: tempColor(temp),
      label: name + ' · ' + condition + (tempRounded != null ? ' · ' + tempRounded + '°F' : ''),
      type: 'weather', id: 'wx-' + name, altM: 0, source: 'Open-Meteo',
    };
  }

  async function fetchOpenMeteoGrid() {
    const lats = WEATHER_CITIES.map((c) => c[1]).join(',');
    const lngs = WEATHER_CITIES.map((c) => c[2]).join(',');
    const url = 'https://api.open-meteo.com/v1/forecast'
      + '?latitude=' + lats + '&longitude=' + lngs
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
        name: city[0], lat: city[1], lng: city[2],
        temp: cur.temperature_2m, wind: cur.wind_speed_10m,
        wind_deg: cur.wind_direction_10m, code,
        conditionLabel: wmoLabel(code), glyphOverride: wmoGlyph(code),
      }));
    });
    if (!out.length) throw new Error('open-meteo empty');
    return out;
  }

  async function fetchWeatherGrid() {
    try { return await fetchOpenMeteoGrid(); }
    catch (e) { console.warn('[god-mode-cesium] open-meteo failed, trying proxy', e); }
    const data = await fetchGodModeProxy('/god-mode/weather', WEATHER_PROXY_TIMEOUT_MS);
    if (data?.ok && Array.isArray(data.cities) && data.cities.length) {
      return data.cities.map(mapWeatherRow).filter((row) => row.name && Number.isFinite(row.lat));
    }
    throw new Error('weather grid failed');
  }

  function flightRowFromCoords(lat, lng, altM, vel, heading, callsign, country, key) {
    if (!validLatLng(lat, lng)) return null;
    const cs = String(callsign || '').trim();
    const cc = String(country || '').trim();
    return {
      lat, lng, altM: Number.isFinite(altM) ? Math.max(0, altM) : 10000,
      heading: Number.isFinite(heading) ? heading : 0,
      label: cs || cc || 'Flight', callsign: cs, country: cc, type: 'flight',
      key: String(key || cs || (lat + ',' + lng)),
      id: 'flt-' + String(key || cs || (lat + ',' + lng)),
      altitudeFt: Number.isFinite(altM) ? Math.round(altM * 3.281) : null,
      speedKts: Number.isFinite(vel) ? Math.round(vel * 1.944) : null,
      color: flightAltColor(Number.isFinite(altM) ? altM * 3.281 : null),
      source: 'ADS-B',
    };
  }

  function parseFlightStates(states) {
    const out = [];
    const rows = Array.isArray(states) ? states : [];
    for (let i = 0; i < rows.length && out.length < 1400; i++) {
      const s = rows[i];
      if (!Array.isArray(s) || s.length < 11) continue;
      const row = flightRowFromCoords(Number(s[6]), Number(s[5]), Number(s[7]), Number(s[9]), Number(s[10]), s[1], s[2], s[0]);
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
      const last = ac.lastPosition && typeof ac.lastPosition === 'object' ? ac.lastPosition : null;
      const lat = Number(ac.lat ?? ac.latitude ?? last?.lat);
      const lng = Number(ac.lon ?? ac.lng ?? ac.longitude ?? last?.lon ?? last?.lng);
      const rawAlt = ac.alt_baro ?? ac.alt_geom ?? ac.baro_altitude;
      let altM = null;
      if (rawAlt === 'ground' || rawAlt === 'GROUND') altM = 0;
      else {
        const altNum = Number(rawAlt);
        if (Number.isFinite(altNum)) altM = altNum * 0.3048;
      }
      const gs = Number(ac.gs ?? ac.ground_speed);
      const vel = Number.isFinite(gs) ? gs * 0.514444 : null;
      const key = String(ac.hex || ac.icao || ac.flight || '').trim();
      if (key && seen.has(key)) continue;
      const row = flightRowFromCoords(lat, lng, altM, vel, Number(ac.track), ac.flight, '', key);
      if (row) { if (key) seen.add(key); out.push(row); }
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
        (await fetchAdsbHubFlights(lat, lng)).forEach((row) => {
          const key = row.key || row.callsign || (row.lat + ',' + row.lng);
          if (seen.has(key)) return;
          seen.add(key); merged.push(row);
        });
      } catch (e) {}
      if (i < FLIGHT_HUBS.length - 1) await new Promise((r) => setTimeout(r, 350));
    }
    return merged;
  }

    async function fetchFlights() {
    try {
      const data = await fetchGodModeProxy("/god-mode/flights", 15000);
      const rows = parseFlightsPayload(data);
      if (rows.length) {
        rows.forEach((r) => { if (!r.source) r.source = "OpenSky proxy"; });
        return rows;
      }
    } catch (e) { console.warn("[god-mode-cesium] flight proxy failed, trying ADS-B", e); }
    try {
      const rows = await fetchAdsbFlightsMerged();
      if (rows.length) {
        rows.forEach((r) => { if (!r.source) r.source = "airplanes.live"; });
        return rows;
      }
    } catch (e) { console.warn("[god-mode-cesium] ADS-B failed", e); }
    return [];
  }

  async function fetchMilFlights() {
    try {
      const data = await fetchGodModeProxy('/god-mode/flights-mil', 15000);
      let list = [];
      if (Array.isArray(data?.ac)) list = data.ac;
      else if (Array.isArray(data?.aircraft)) list = data.aircraft;
      else if (Array.isArray(data)) list = data;
      if (!list.length && typeof data?.text === 'string') {
        try {
          const parsed = JSON.parse(data.text);
          if (Array.isArray(parsed?.ac)) list = parsed.ac;
          else if (Array.isArray(parsed?.aircraft)) list = parsed.aircraft;
          else if (Array.isArray(parsed)) list = parsed;
        } catch (e2) {}
      }
      if (!list.length) return [];
      return parseAdsbAircraft(list).map((row) => {
        const key = row.key || row.id;
        row.type = 'military';
        row.color = '#ff9f0a';
        row.id = 'mil-' + String(key || row.callsign || (row.lat + ',' + row.lng));
        row.source = data?.source ? (String(data.source) + ' /mil') : 'military ADS-B';
        row.mil = true;
        return row;
      });
    } catch (e) {
      console.warn('[god-mode-cesium] military flights proxy failed', e);
      return [];
    }
  }

  function rememberTrail(id, lat, lng, altM, type) {
    if (!id || !validLatLng(lat, lng)) return;
    if (type && type !== 'flight' && type !== 'ship' && type !== 'military') return;
    let buf = trailHistory.get(id);
    if (!buf) {
      if (trailHistory.size > 900) {
        const first = trailHistory.keys().next().value;
        if (first) trailHistory.delete(first);
      }
      buf = [];
      trailHistory.set(id, buf);
    }
    const last = buf[buf.length - 1];
    if (last && Math.abs(last.lat - lat) < 1e-5 && Math.abs(last.lng - lng) < 1e-5) return;
    buf.push({ lat, lng, altM: Number(altM) || 0, t: Date.now() });
    if (buf.length > 48) buf.splice(0, buf.length - 48);
  }

  function projectHeadingPath(lat, lng, heading, speedKts, altM, minutesBack, minutesFwd, steps) {
    if (!validLatLng(lat, lng)) return [];
    const hdg = Number(heading);
    const spd = Number(speedKts);
    if (!Number.isFinite(hdg) || !Number.isFinite(spd) || spd < 0.2) {
      return [{ lat, lng, altM: Number(altM) || 0 }];
    }
    const kmPerMin = (spd * 1.852) / 60;
    const degPerMin = kmPerMin / 111.32;
    const rad = (hdg * Math.PI) / 180;
    const cosLat = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
    const pts = [];
    const n = Math.max(4, Number(steps) || 16);
    const back = Number(minutesBack) || 8;
    const fwd = Number(minutesFwd) || 4;
    const total = back + fwd;
    for (let i = 0; i <= n; i++) {
      const min = -back + (total * i) / n;
      const dist = degPerMin * min;
      const pLat = lat + Math.cos(rad) * dist;
      const pLng = lng + (Math.sin(rad) * dist) / cosLat;
      if (!validLatLng(pLat, pLng, true)) continue;
      pts.push({ lat: pLat, lng: pLng, altM: Number(altM) || 0 });
    }
    return pts;
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

  const aisstreamLive = new Map();
  let aisstreamWs = null;

  function mergeAisstream(rows, source) {
    if (!aisstreamLive.size) return { rows: rows || [], source: source };
    const by = new Map();
    (rows || []).forEach((r) => { if (r?.mmsi) by.set(String(r.mmsi), r); });
    aisstreamLive.forEach((row, mmsi) => { if (!by.has(mmsi)) by.set(mmsi, row); });
    const merged = capShips([...by.values()]);
    const extra = aisstreamLive.size;
    return {
      rows: merged,
      source: (source || 'AIS') + (extra ? ' + AISStream' : ''),
      count: merged.length,
    };
  }

  function startAisstream() {
    const key = readAisstreamKey();
    if (!key || aisstreamWs || typeof WebSocket === 'undefined') return;
    try {
      const ws = new WebSocket('wss://stream.aisstream.io/v0/stream');
      aisstreamWs = ws;
      ws.onopen = () => {
        try {
          ws.send(JSON.stringify({
            APIKey: key,
            BoundingBoxes: [
              [[24.8, 56.0], [27.2, 57.0]],
              [[1.1, 103.4], [1.6, 104.2]],
              [[50.8, -1.2], [51.6, 1.8]],
              [[40.4, -74.3], [40.9, -73.7]],
              [[33.6, -118.4], [34.0, -118.1]],
            ],
            FilterMessageTypes: ['PositionReport'],
          }));
        } catch (e) {}
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          const meta = msg.MetaData || {};
          const pr = (msg.Message && (msg.Message.PositionReport || msg.Message.StandardClassBPositionReport)) || {};
          const lat = Number(meta.latitude ?? pr.Latitude);
          const lng = Number(meta.longitude ?? pr.Longitude);
          const mmsi = String(meta.MMSI || pr.UserID || '').trim();
          const row = makeShipRow({
            lat, lng, mmsi,
            sog: pr.Sog ?? meta.sog, cog: pr.Cog, heading: pr.TrueHeading,
            name: meta.ShipName, source: 'AISStream',
          });
          if (row) {
            aisstreamLive.set(mmsi, row);
            if (aisstreamLive.size > MAX_SHIP_POINTS) {
              const first = aisstreamLive.keys().next().value;
              if (first) aisstreamLive.delete(first);
            }
          }
        } catch (e) {}
      };
      ws.onclose = () => { if (aisstreamWs === ws) aisstreamWs = null; };
      ws.onerror = () => {};
    } catch (e) { aisstreamWs = null; }
  }

  function stopAisstream() {
    try { if (aisstreamWs) aisstreamWs.close(); } catch (e) {}
    aisstreamWs = null;
    aisstreamLive.clear();
  }

  async function fetchShips() {
    startAisstream();
    try {
      const proxied = await fetchShipsFromProxy();
      if (proxied?.rows?.length) return Object.assign({ count: proxied.rows.length }, mergeAisstream(proxied.rows, proxied.source));
    } catch (e) {
      console.warn('[god-mode-cesium] /god-mode/ships proxy unavailable', e);
    }
    try {
      const live = await fetchDigitrafficShips();
      const merged = mergeAisstream(live?.rows || [], live?.source || 'Digitraffic AIS');
      if (merged.rows.length) return merged;
      return { rows: [], source: merged.source, count: 0, error: 'AIS feed empty' };
    } catch (e) {
      const merged = mergeAisstream([], 'none');
      if (merged.rows.length) return merged;
      return { rows: [], source: 'none', count: 0, error: String(e?.message || e) };
    }
  }

  function parseTleRecs(text, kind) {
    const sat = global.satellite;
    if (!sat?.twoline2satrec) return [];
    const lines = String(text || '').split(/\r?\n/);
    const recs = [];
    for (let i = 1; i < lines.length; i++) {
      const l1 = lines[i];
      const l2 = lines[i + 1] || '';
      if (!l1 || l1.charCodeAt(0) !== 49 || !l1.startsWith('1 ') || !l2.startsWith('2 ')) continue;
      const name = String(lines[i - 1] || '').trim() || kind || 'SAT';
      try {
        const rec = sat.twoline2satrec(l1, l2);
        if (!rec) continue;
        const satnum = String(rec.satnum || l1.substring(2, 7).trim());
        recs.push({ name, rec, satnum, kind });
      } catch (e) {}
      i += 1;
    }
    return recs;
  }

  async function fetchTleText(group) {
    const cacheKey = group === 'starlink' ? STARLINK_TLE_CACHE_KEY : (TLE_GROUP_CACHE_PREFIX + group);
    try {
      const raw = JSON.parse(global.localStorage.getItem(cacheKey) || 'null');
      if (raw?.text && Date.now() - Number(raw.savedAt || 0) < (group === 'starlink' ? STARLINK_TLE_TTL_MS : TLE_GROUP_TTL_MS)) {
        return raw.text;
      }
    } catch (e) {}
    let text = '';
    const proxyPaths = [
      '/god-mode/' + group + '-tle',
      '/god-mode/tle?group=' + encodeURIComponent(group),
    ];
    if (group === 'starlink') proxyPaths.unshift('/god-mode/starlink-tle');
    for (let i = 0; i < proxyPaths.length && !text; i++) {
      try {
        const data = await fetchGodModeProxy(proxyPaths[i], 45000);
        if (data?.ok && data.tle) text = String(data.tle);
        else if (data?.text && /^1 /m.test(data.text)) text = String(data.text);
      } catch (e) {}
    }
    if (!text) {
      const res = await fetchWithTimeout(CELESTRAK_TLE + encodeURIComponent(group) + '&FORMAT=tle', {}, 30000);
      if (!res.ok) throw new Error(group + ' TLE feed ' + res.status);
      text = await res.text();
    }
    if (!/^1 /m.test(text)) throw new Error(group + ' TLE feed malformed');
    try { global.localStorage.setItem(cacheKey, JSON.stringify({ text, savedAt: Date.now() })); } catch (e) {}
    return text;
  }

  async function ensureTleGroup(group) {
    if (tleStore[group]?.length) return tleStore[group];
    await loadSatelliteLib();
    const recs = parseTleRecs(await fetchTleText(group), group);
    if (!recs.length) throw new Error('no ' + group + ' TLEs parsed');
    tleStore[group] = recs;
    return recs;
  }

  function stableSubset(recs, cap) {
    const arr = Array.isArray(recs) ? recs : [];
    if (arr.length <= cap) return arr;
    const sorted = arr.slice().sort((a, b) => String(a.satnum).localeCompare(String(b.satnum)));
    const step = sorted.length / cap;
    const out = [];
    for (let i = 0; i < cap; i++) {
      const row = sorted[Math.floor(i * step)];
      if (row) out.push(row);
    }
    return out;
  }

  function propagateRecs(recs, when, type, color, idPrefix, altMin, altMax) {
    const sat = global.satellite;
    if (!sat || !recs?.length) return [];
    const date = when instanceof Date ? when : new Date();
    if (!Number.isFinite(date.getTime())) return [];
    let gmst;
    try { gmst = sat.gstime(date); } catch (e) { return []; }
    const points = [];
    const amin = Number.isFinite(altMin) ? altMin : 100;
    const amax = Number.isFinite(altMax) ? altMax : 40000;
    for (let i = 0; i < recs.length; i++) {
      const { name, rec, satnum, kind } = recs[i];
      let geo = null;
      try {
        const pv = sat.propagate(rec, date);
        if (!pv?.position) continue;
        geo = sat.eciToGeodetic(pv.position, gmst);
      } catch (e) { continue; }
      const lat = sat.degreesLat(geo.latitude);
      const lng = sat.degreesLong(geo.longitude);
      const altKm = Number(geo.height);
      if (!validLatLng(lat, lng)) continue;
      if (!Number.isFinite(altKm) || altKm < amin || altKm > amax) continue;
      const id = idPrefix + String(satnum || i);
      points.push({
        lat, lng, altM: altKm * 1000,
        label: name, name, satnum: String(satnum || ''),
        type, kind: kind || type, id, color,
        source: 'Celestrak TLE + SGP4',
        heading: 0,
      });
    }
    return points;
  }

  function sampleOrbit(rec, when, minutes, samples) {
    const sat = global.satellite;
    if (!sat || !rec) return [];
    const date = when instanceof Date ? when : new Date();
    const n = Math.max(16, Number(samples) || 64);
    const span = (Number(minutes) || 92) * 60000;
    const start = date.getTime() - span * 0.15;
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = new Date(start + (span * i) / n);
      try {
        const pv = sat.propagate(rec, t);
        if (!pv?.position) continue;
        const geo = sat.eciToGeodetic(pv.position, sat.gstime(t));
        const lat = sat.degreesLat(geo.latitude);
        const lng = sat.degreesLong(geo.longitude);
        const altKm = Number(geo.height);
        if (!validLatLng(lat, lng) || !Number.isFinite(altKm)) continue;
        out.push({ lat, lng, altM: altKm * 1000 });
      } catch (e) {}
    }
    return out;
  }

  function findIssRec() {
    const recs = tleStore.stations || [];
    for (let i = 0; i < recs.length; i++) {
      const r = recs[i];
      if (String(r.satnum) === '25544' || /ISS/i.test(r.name)) return r;
    }
    return null;
  }

  async function fetchIssLive() {
    try {
      const res = await fetchWithTimeout('https://api.wheretheiss.at/v1/satellites/25544');
      if (res.ok) {
        const data = await res.json();
        const lat = Number(data?.latitude);
        const lng = Number(data?.longitude);
        const altKm = Number(data?.altitude);
        if (validLatLng(lat, lng)) {
          return [{
            lat, lng, altM: (Number.isFinite(altKm) ? altKm : 420) * 1000,
            name: 'International Space Station', label: 'ISS · live',
            type: 'satellite', craft: 'iss', id: 'sat-iss', color: '#5ac8fa',
            source: 'where-the-iss.at', heading: Number(data?.heading) || 0,
            speedKts: Number.isFinite(Number(data?.velocity)) ? Math.round(Number(data.velocity) * 1.944) : null,
            altitudeFt: Number.isFinite(altKm) ? Math.round(altKm * 1000 * 3.281) : null,
            satnum: '25544',
          }];
        }
      }
    } catch (e) {}
    try {
      const data = await fetchGodModeProxy('/god-mode/satellites');
      if (data?.ok) {
        return (Array.isArray(data.satellites) ? data.satellites : []).map((row, idx) => ({
          lat: Number(row.lat), lng: Number(row.lng), altM: 420000,
          name: String(row.name || 'ISS'), label: String(row.name || 'ISS'),
          type: 'satellite', craft: 'iss', id: 'sat-' + idx, color: '#5ac8fa',
          source: 'god-mode satellites proxy', satnum: '25544',
        })).filter((row) => validLatLng(row.lat, row.lng));
      }
    } catch (e) {}
    return [];
  }

  function issFromSgp4(when) {
    const rec = findIssRec();
    if (!rec) return null;
    const pts = propagateRecs([rec], when, 'satellite', '#5ac8fa', 'sat-iss-', 200, 2000);
    if (!pts.length) return null;
    const p = pts[0];
    p.id = 'sat-iss';
    p.craft = 'iss';
    p.name = 'International Space Station';
    p.label = 'ISS · SGP4';
    p.source = 'Celestrak stations TLE + SGP4';
    p.satnum = '25544';
    p.altitudeFt = Math.round((p.altM || 0) * 3.281);
    return p;
  }

  async function fetchIssTrail() {
    const rec = findIssRec();
    if (rec) {
      const pts = sampleOrbit(rec.rec, new Date(), 92, 72);
      if (pts.length >= 8) return pts;
    }
    try {
      const now = Math.floor(Date.now() / 1000);
      const stamps = [];
      for (let i = 0; i < 10; i++) stamps.push(now - 2760 + Math.round(i * 613));
      const res = await fetchWithTimeout(
        'https://api.wheretheiss.at/v1/satellites/25544/positions?timestamps=' + stamps.join(',') + '&units=kilometers',
        {}, 12000);
      if (!res.ok) throw new Error('iss trail ' + res.status);
      const rows = await res.json();
      return (Array.isArray(rows) ? rows : [])
        .map((r) => ({ lat: Number(r.latitude), lng: Number(r.longitude), altM: (Number(r.altitude) || 420) * 1000 }))
        .filter((p) => validLatLng(p.lat, p.lng));
    } catch (e) { return []; }
  }

  function propagateAllSats(when) {
    const t = when instanceof Date ? when : new Date();
    const starRecs = tleStore.starlinkSubset || tleStore.starlink || [];
    const starlink = propagateRecs(starRecs, t, 'starlink', 'rgba(210,220,230,0.7)', 'sl-', 200, 2500);
    const gps = propagateRecs(tleStore.gps || [], t, 'gps', '#ffd60a', 'gps-', 15000, 30000);
    const wxsat = propagateRecs(tleStore.weather || [], t, 'wxsat', '#34c759', 'wxsat-', 400, 40000);
    const stations = propagateRecs(
      (tleStore.stations || []).filter((r) => String(r.satnum) !== '25544' && !/ISS/i.test(r.name)),
      t, 'station', '#5ac8fa', 'stn-', 200, 2000
    );
    const extra = {};
    EXTRA_TLE.forEach((g) => {
      extra[g.type] = propagateRecs(tleStore[g.group] || [], t, g.type, g.color, g.prefix, g.altMin, g.altMax);
    });
    return Object.assign({ starlink, gps, wxsat, stations }, extra);
  }

  function applySatBag(data, bag) {
    if (!data || !bag) return;
    data.starlink = bag.starlink || [];
    data.gps = bag.gps || [];
    data.wxsat = bag.wxsat || [];
    data.stations = bag.stations || [];
    EXTRA_TLE.forEach((g) => { data[g.type] = bag[g.type] || []; });
  }

  function syncSatEntities(Cesium, viewer, state, bag, layer) {
    const cap = layer === 'satellites' ? STARLINK_MAX_FOCUS : STARLINK_MAX_ALL;
    syncGroup(Cesium, viewer, state, 'starlink', (bag.starlink || []).slice(0, cap), () => ({ pixelSize: 3, outline: false }), false);
    syncGroup(Cesium, viewer, state, 'gps', bag.gps, () => ({ pixelSize: 5 }), false);
    syncGroup(Cesium, viewer, state, 'wxsat', bag.wxsat, () => ({ pixelSize: 6 }), false);
    syncGroup(Cesium, viewer, state, 'station', bag.stations, () => ({ pixelSize: 8 }), false);
    EXTRA_TLE.forEach((g) => {
      syncGroup(Cesium, viewer, state, g.type, bag[g.type] || [], () => ({ pixelSize: defaultPointSize(g.type), outline: false }), false);
    });
  }

  async function ensureAllTles() {
    await loadSatelliteLib();
    const results = await Promise.allSettled([
      ensureTleGroup('starlink'),
      ensureTleGroup('gps-ops').then((r) => { tleStore.gps = stableSubset(r, GPS_MAX); return r; }),
      ensureTleGroup('weather').then((r) => { tleStore.weather = stableSubset(r, WXSAT_MAX); return r; }),
      ensureTleGroup('stations').then((r) => {
        const iss = r.filter((x) => String(x.satnum) === '25544' || /ISS/i.test(x.name));
        const rest = r.filter((x) => String(x.satnum) !== '25544' && !/ISS/i.test(x.name));
        tleStore.stations = iss.concat(stableSubset(rest, STATION_MAX));
        return r;
      }),
      ...EXTRA_TLE.map((g) => ensureTleGroup(g.group).then((r) => {
        tleStore[g.group] = stableSubset(r, g.max);
        return r;
      })),
    ]);
    if (tleStore.starlink?.length && !tleStore.starlinkSubset) {
      tleStore.starlinkSubset = stableSubset(tleStore.starlink, STARLINK_MAX_FOCUS);
    }
    return results;
  }

  function providerName(launch) {
    return String(launch?.launch_service_provider?.name || launch?.rocket?.configuration?.launch_service_provider?.name || 'Unknown').trim();
  }

  function launchProviderColor(provider, rocket) {
    const hay = (provider || '') + ' ' + (rocket || '');
    for (let i = 0; i < LAUNCH_PROVIDER_COLORS.length; i++) {
      if (LAUNCH_PROVIDER_COLORS[i][0].test(hay)) return LAUNCH_PROVIDER_COLORS[i][1];
    }
    return '#d0d6e0';
  }

  function fmtLaunchWhen(iso) {
    try {
      const d = new Date(iso);
      if (!Number.isFinite(d.getTime())) return 'TBD';
      return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
    } catch (e) { return 'TBD'; }
  }

  function readLaunchCache() {
    try {
      const raw = JSON.parse(global.localStorage.getItem(LAUNCH_CACHE_KEY) || 'null');
      if (raw && Array.isArray(raw.markers) && Array.isArray(raw.list)) return raw;
    } catch (e) {}
    return null;
  }

  function writeLaunchCache(payload) {
    try { global.localStorage.setItem(LAUNCH_CACHE_KEY, JSON.stringify({ ...payload, savedAt: Date.now() })); } catch (e) {}
  }

  async function fetchLaunchesLive() {
    const res = await fetchWithTimeout('https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=12&mode=detailed');
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
      if (validLatLng(lat, lng)) {
        markers.push({
          lat, lng, altM: 0, label: provider + ' · ' + name, name, provider, when, rocket, loc, status,
          type: 'launch', id: 'lnch-' + String(launch.id || name), color: launchProviderColor(provider, rocket),
          source: 'Launch Library 2',
        });
      }
    });
    return { markers, list };
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

  function eventGlyph(category) {
    const c = String(category || '').toLowerCase();
    if (c.includes('wildfire') || c.includes('fire')) return 'FIRE';
    if (c.includes('earthquake')) return 'QUAKE';
    if (c.includes('storm') || c.includes('cyclone')) return 'STORM';
    if (c.includes('volcano')) return 'VOLC';
    if (c.includes('flood')) return 'FLOOD';
    return 'EVENT';
  }

  function eventColor(category) {
    const c = String(category || '').toLowerCase();
    if (c.includes('wildfire') || c.includes('fire')) return '#ff453a';
    if (c.includes('earthquake')) return '#bf5af2';
    if (c.includes('storm') || c.includes('cyclone')) return '#64d2ff';
    if (c.includes('volcano')) return '#ff9f0a';
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
      for (const child of node) { const found = walk(child); if (found) return found; }
      return null;
    };
    const first = walk(coords);
    return first ? { lng: Number(first[0]), lat: Number(first[1]), date: g.date } : null;
  }

  function parseEonetEvents(rows) {
    return (Array.isArray(rows) ? rows : []).map((ev) => {
      const coord = eventCoordFromGeometry(ev?.geometry);
      if (!coord || !validLatLng(coord.lat, coord.lng)) return null;
      const category = String((ev?.categories || [])[0]?.title || 'Natural event');
      const title = String(ev?.title || 'Earth event').trim();
      const source = String((ev?.sources || [])[0]?.id || (ev?.sources || [])[0]?.title || 'NASA EONET').trim();
      return {
        id: String(ev?.id || title), name: title, label: category + ' · ' + title,
        category, source, lat: coord.lat, lng: coord.lng, altM: 0,
        date: coord.date || ev?.updated || '', color: eventColor(category),
        text: eventGlyph(category), type: 'event',
      };
    }).filter(Boolean).slice(0, 70);
  }

  function parseGdacsEvents(features) {
    const categoryMap = { EQ: 'Earthquakes', TC: 'Severe Storms', FL: 'Floods', VO: 'Volcanoes', WF: 'Wildfires', DR: 'Drought' };
    return (Array.isArray(features) ? features : []).map((feat) => {
      const props = feat?.properties || {};
      const coords = Array.isArray(feat?.geometry?.coordinates)
        ? feat.geometry.coordinates
        : (Array.isArray(feat?.bbox) ? feat.bbox.slice(0, 2) : null);
      if (!Array.isArray(coords) || coords.length < 2) return null;
      const lng = Number(coords[0]);
      const lat = Number(coords[1]);
      if (!validLatLng(lat, lng)) return null;
      const eventType = String(props.eventtype || 'Event').trim();
      const category = categoryMap[eventType] || eventType;
      const name = String(props.name || props.description || 'GDACS event').trim();
      return {
        id: 'gdacs-' + eventType + '-' + (props.eventid || name) + '-' + (props.episodeid || ''),
        name, label: category + ' · ' + name, category, source: 'GDACS',
        lat, lng, altM: 0, date: props.fromdate || props.datemodified || '',
        color: eventColor(category), text: eventGlyph(category), type: 'event',
      };
    }).filter(Boolean).slice(0, 70);
  }

  function readEventCache() {
    try {
      const raw = JSON.parse(global.localStorage.getItem(EONET_CACHE_KEY) || 'null');
      if (raw && Array.isArray(raw.events)) return raw;
    } catch (e) {}
    return null;
  }

  function writeEventCache(payload) {
    try { global.localStorage.setItem(EONET_CACHE_KEY, JSON.stringify({ ...payload, savedAt: Date.now() })); } catch (e) {}
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

  function mergeEventRows(quakes, others) {
    const q = Array.isArray(quakes) ? quakes : [];
    const rest = Array.isArray(others) ? others : [];
    const seen = new Set(q.map((r) => r.id));
    const out = q.slice();
    rest.forEach((row) => {
      if (!row || seen.has(row.id)) return;
      seen.add(row.id);
      out.push(row);
    });
    return out.slice(0, 140);
  }

  async function fetchEarthEvents() {
    const cached = readEventCache();
    let base = null;
    if (cached && Date.now() - Number(cached.savedAt || 0) < EONET_CACHE_TTL_MS) base = cached.events;
    if (!base) {
      try {
        const res = await fetchWithTimeout('https://www.gdacs.org/gdacsapi/api/Events/geteventlist/EVENTS4APP', {}, 12000);
        if (res.ok) {
          const data = await res.json();
          const events = parseGdacsEvents(data?.features);
          if (events.length) { writeEventCache({ events }); base = events; }
        }
      } catch (e) {}
    }
    if (!base) {
      try {
        const res = await fetchWithTimeout('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=70&days=30', {}, 12000);
        if (!res.ok) throw new Error('eonet ' + res.status);
        const data = await res.json();
        const events = parseEonetEvents(data?.events);
        if (!events.length) throw new Error('eonet empty');
        writeEventCache({ events });
        base = events;
      } catch (e) {
        try {
          const data = await fetchGodModeProxy('/god-mode/events', 12000);
          const events = parseEonetEvents(data?.events);
          if (events.length) { writeEventCache({ events }); base = events; }
        } catch (proxyErr) {}
        if (!base && cached?.events?.length) base = cached.events;
        if (!base) console.warn('[god-mode-cesium] GDACS/EONET unavailable', e);
      }
    }
    let quakes = [];
    try { quakes = await fetchUsgsQuakes(); } catch (e) { console.warn('[god-mode-cesium] USGS quakes failed', e); }
    const merged = mergeEventRows(quakes, base || []);
    if (!merged.length) throw new Error('no earth events');
    return merged;
  }

    async function fetchGpsjam() {
    const empty = {
      date: "", rows: [], high: [], med: [], low: [], count: 0,
      attribution: "Data derived from ADS-B Exchange via gpsjam.org",
    };
    let data = null;
    try {
      data = await fetchGodModeProxy("/god-mode/gpsjam", 45000);
    } catch (e) {
      console.warn("[god-mode-cesium] gpsjam proxy failed", e);
      return empty;
    }
    if (!data || !data.ok || !Array.isArray(data.rows) || !data.rows.length) {
      return Object.assign({}, empty, {
        date: String((data && data.date) || ""),
        attribution: (data && data.attribution) || empty.attribution,
      });
    }
    const h3 = await loadH3Lib();
    const toLatLng = h3CellToLatLngFn(h3);
    if (!toLatLng) {
      console.warn("[god-mode-cesium] h3 cell convert unavailable, skip gpsjam");
      return Object.assign({}, empty, {
        date: String(data.date || ""),
        attribution: data.attribution || empty.attribution,
      });
    }
    const rows = [];
    for (let i = 0; i < data.rows.length; i++) {
      const r = data.rows[i];
      const hx = String((r && r.hex) || "").trim();
      if (!hx) continue;
      let latlng = null;
      try { latlng = toLatLng(hx); } catch (e) { continue; }
      const lat = Number(Array.isArray(latlng) ? latlng[0] : latlng && latlng.lat);
      const lng = Number(Array.isArray(latlng) ? latlng[1] : (latlng && (latlng.lng != null ? latlng.lng : latlng.lon)));
      if (!validLatLng(lat, lng, true)) continue;
      const pct = Number(r.pct);
      const band = jamBand(pct);
      rows.push({
        hex: hx, lat, lng, altM: 0,
        good: Number(r.good) || 0, bad: Number(r.bad) || 0,
        pct: Number.isFinite(pct) ? pct : 0, band,
        id: "jam-" + hx, type: "gpsjam",
        color: jamColor(pct),
        name: "GPS jam " + (Number.isFinite(pct) ? pct.toFixed(1) : "?") + "%",
        label: "JAM · " + band.toUpperCase() + " · " + (Number.isFinite(pct) ? pct.toFixed(1) : "?") + "%",
        source: "ADS-B Exchange via gpsjam.org",
        date: String(data.date || ""),
      });
    }
    const high = [];
    const med = [];
    const low = [];
    for (let i = 0; i < rows.length; i++) {
      const b = rows[i].band;
      if (b === "high") high.push(rows[i]);
      else if (b === "med") med.push(rows[i]);
      else low.push(rows[i]);
    }
    return {
      date: String(data.date || ""),
      rows,
      high, med, low,
      count: rows.length,
      attribution: data.attribution || "Data derived from ADS-B Exchange via gpsjam.org",
    };
  }

  function filterGpsjamVisible(rows, lod, rect, bag) {
    let list;
    if (lod === 'Orbit') list = (bag && bag.high) || [];
    else if (lod === 'Regional') {
      const hi = (bag && bag.high) || [];
      const md = (bag && bag.med) || [];
      list = hi.concat(md);
    } else list = Array.isArray(rows) ? rows : [];
    const out = [];
    const cap = lod === 'City' ? GPSJAM_CITY_CAP : (lod === 'Regional' ? GPSJAM_REGIONAL_CAP : GPSJAM_ORBIT_CAP);
    for (let i = 0; i < list.length && out.length < cap; i++) {
      const r = list[i];
      if (!r) continue;
      if (lod === 'City' && rect && !inViewRect(rect, r.lat, r.lng)) continue;
      out.push(r);
    }
    return out;
  }

  function gpsjamCamKey(Cesium, viewer, lod, rect) {
    let cam = '';
    try {
      const c = viewer.camera.positionCartographic;
      cam = c.longitude.toFixed(2) + ',' + c.latitude.toFixed(2);
    } catch (e) {}
    const r = (lod === 'City' && rect)
      ? [rect.west, rect.south, rect.east, rect.north].map((n) => Number(n).toFixed(2)).join(',')
      : '';
    return lod + ':' + cam + ':' + r;
  }

  function parseNhcStorms(data) {
    const storms = Array.isArray(data?.activeStorms) ? data.activeStorms : [];
    return storms.map((s) => {
      const lat = Number(s?.latitudeNumeric);
      const lng = Number(s?.longitudeNumeric);
      if (!validLatLng(lat, lng)) return null;
      const name = String(s?.name || s?.id || 'Storm').trim();
      const cls = String(s?.classification || '').trim();
      return {
        lat, lng, altM: 0, type: 'storm',
        id: 'nhc-' + String(s.id || name),
        name: (cls ? cls + ' ' : '') + name,
        label: (cls ? cls + ' · ' : '') + name,
        classification: cls,
        intensity: s.intensity, pressure: s.pressure,
        color: '#64d2ff', source: 'NHC CurrentStorms',
      };
    }).filter(Boolean);
  }

  function ringToLonLat(ring) {
    const out = [];
    (ring || []).forEach((pt) => {
      if (Array.isArray(pt) && Number.isFinite(Number(pt[0])) && Number.isFinite(Number(pt[1]))) {
        out.push(Number(pt[0]), Number(pt[1]));
      }
    });
    return out;
  }

  function geomCentroid(lonlat) {
    if (!lonlat || lonlat.length < 2) return { lat: NaN, lng: NaN };
    let lng = 0, lat = 0, n = 0;
    for (let i = 0; i + 1 < lonlat.length; i += 2) {
      lng += lonlat[i]; lat += lonlat[i + 1]; n += 1;
    }
    if (!n) return { lat: NaN, lng: NaN };
    return { lng: lng / n, lat: lat / n };
  }

  function lonlatFromGeoJson(geom) {
    const gtype = String(geom?.type || '');
    const coords = geom?.coordinates;
    if (gtype === 'Polygon') return { lonlat: ringToLonLat(coords && coords[0]), gtype: 'Polygon' };
    if (gtype === 'MultiPolygon') return { lonlat: ringToLonLat(coords && coords[0] && coords[0][0]), gtype: 'Polygon' };
    if (gtype === 'LineString') return { lonlat: ringToLonLat(coords), gtype: 'LineString' };
    if (gtype === 'MultiLineString') return { lonlat: ringToLonLat(coords && coords[0]), gtype: 'LineString' };
    return { lonlat: [], gtype: gtype };
  }

  function parseGeoJsonStormGeoms(fc, kind) {
    const feats = Array.isArray(fc?.features) ? fc.features : [];
    return feats.map((f, i) => {
      const p = f?.properties || {};
      const parsed = lonlatFromGeoJson(f?.geometry);
      if (!parsed.lonlat || parsed.lonlat.length < 4) return null;
      const c = geomCentroid(parsed.lonlat);
      if (!validLatLng(c.lat, c.lng)) return null;
      const name = String(p.stormname || p.STORMNAME || p.NAME || p.name || ('Storm ' + (i + 1)));
      const cls = String(p.stormtype || p.classification || '').trim();
      return {
        lat: c.lat, lng: c.lng, altM: 0, type: 'storm', kind,
        lonlat: parsed.lonlat, gtype: parsed.gtype,
        id: 'nhc-' + kind + '-' + (p.objectid || p.OBJECTID || p.stormnum || i),
        name: (cls ? cls + ' ' : '') + name,
        label: (kind === 'cone' ? 'CONE · ' : 'TRACK · ') + name,
        color: '#64d2ff',
        source: 'NHC MapServer ' + kind,
      };
    }).filter(Boolean);
  }

  function parseKmlStormGeoms(kmlText) {
    const out = [];
    if (!kmlText) return out;
    const blocks = String(kmlText).match(/<coordinates[^>]*>([\s\S]*?)<\/coordinates>/gi) || [];
    blocks.forEach((block, i) => {
      const inner = block.replace(/<\/?coordinates[^>]*>/gi, '');
      const lonlat = [];
      inner.trim().split(/[\s\n]+/).forEach((tok) => {
        const parts = tok.split(',');
        if (parts.length >= 2) {
          const lng = Number(parts[0]);
          const lat = Number(parts[1]);
          if (Number.isFinite(lat) && Number.isFinite(lng)) lonlat.push(lng, lat);
        }
      });
      if (lonlat.length < 4) return;
      const c = geomCentroid(lonlat);
      if (!validLatLng(c.lat, c.lng)) return;
      const closed = lonlat.length > 10
        && Math.abs(lonlat[0] - lonlat[lonlat.length - 2]) < 1e-5
        && Math.abs(lonlat[1] - lonlat[lonlat.length - 1]) < 1e-5;
      const kind = closed ? 'cone' : 'track';
      out.push({
        lat: c.lat, lng: c.lng, altM: 0, type: 'storm', kind,
        lonlat, gtype: closed ? 'Polygon' : 'LineString',
        id: 'nhc-kml-' + kind + '-' + i,
        name: 'NHC ' + kind, label: (closed ? 'CONE' : 'TRACK'),
        color: '#64d2ff', source: 'NHC active KML',
      });
    });
    return out;
  }

  async function fetchNhcKmlGeoms() {
    const res = await fetchWithTimeout(NHC_KML_URL, { headers: { Accept: 'application/vnd.google-earth.kml+xml, application/xml, text/xml, */*;q=0.8' } }, 12000);
    if (!res.ok) return [];
    return parseKmlStormGeoms(await res.text());
  }

  async function fetchNhcMapserverGeoms() {
    const out = [];
    const jobs = [[NHC_CONES_URL, 'cone'], [NHC_TRACKS_URL, 'track'], [NHC_PAST_TRACK_URL, 'past']];
    for (let i = 0; i < jobs.length; i++) {
      try {
        const res = await fetchWithTimeout(jobs[i][0], { headers: { Accept: 'application/geo+json, application/json;q=0.9' } }, 12000);
        if (!res.ok) continue;
        out.push.apply(out, parseGeoJsonStormGeoms(await res.json(), jobs[i][1]));
      } catch (e) {}
    }
    return out;
  }

  async function fetchNhcStorms() {
    let data = null;
    try { data = await fetchGodModeProxy('/god-mode/storms', 12000); }
    catch (e) {
      try {
        const res = await fetchWithTimeout(NHC_STORMS_URL, { headers: { Accept: 'application/json' } }, 10000);
        if (res.ok) data = await res.json();
      } catch (e2) {}
    }
    const storms = Array.isArray(data?.activeStorms) ? data.activeStorms : [];
    if (!storms.length) return [];
    const points = parseNhcStorms(data);
    let geoms = [];
    try { geoms = await fetchNhcKmlGeoms(); } catch (e) {}
    if (!geoms.length) {
      try { geoms = await fetchNhcMapserverGeoms(); } catch (e) {}
    }
    return points.concat(geoms);
  }

  function readDealGeoCache() {
    try { return JSON.parse(global.localStorage.getItem(DEAL_GEO_CACHE_KEY) || '{}') || {}; }
    catch (e) { return {}; }
  }

  async function geocodeDealCity(query, cache) {
    const key = query.toLowerCase();
    if (cache[key]) return cache[key].miss ? null : cache[key];
    const city = query.split(',')[0].trim();
    try {
      const res = await fetchWithTimeout(
        'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(city) + '&count=1&language=en&format=json',
        {}, 8000);
      if (res.ok) {
        const data = await res.json();
        const hit = Array.isArray(data?.results) ? data.results[0] : null;
        if (hit && Number.isFinite(hit.latitude)) {
          cache[key] = { lat: hit.latitude, lng: hit.longitude };
          try { global.localStorage.setItem(DEAL_GEO_CACHE_KEY, JSON.stringify(cache)); } catch (e) {}
          return cache[key];
        }
      }
    } catch (e) {}
    cache[key] = { miss: true };
    try { global.localStorage.setItem(DEAL_GEO_CACHE_KEY, JSON.stringify(cache)); } catch (e) {}
    return null;
  }

  async function fetchDealMarkers(viewer) {
    const leads = (global.V3 && global.V3.LEADS) || [];
    const hqLat = Number(viewer?.lat);
    const hqLng = Number(viewer?.lng ?? viewer?.lon);
    const hq = { lat: Number.isFinite(hqLat) ? hqLat : 37.46, lng: Number.isFinite(hqLng) ? hqLng : -122.43 };
    const active = leads.filter((l) =>
      DEAL_ACTIVE_STAGES.includes(String(l.stage || '')) && String(l.location || '').trim() && !l.isRobertBrief);
    const cache = readDealGeoCache();
    const points = [];
    for (const lead of active.slice(0, 80)) {
      const loc = String(lead.location).trim();
      const geo = await geocodeDealCity(loc, cache);
      if (!geo) continue;
      const color = DEAL_STAGE_COLORS[String(lead.stage)] || '#d0d6e0';
      const name = lead.brand || lead.contactName || 'Deal';
      const money = typeof lead.value === 'number' && lead.value > 0 ? lead.value : 0;
      points.push({
        lat: geo.lat, lng: geo.lng, altM: 0,
        label: name + ' · ' + loc + ' · ' + String(lead.stage).replace(/-/g, ' ') + (money ? ' · $' + money.toLocaleString() : ''),
        name, color, type: 'deal', leadId: lead.id, id: 'deal-' + String(lead.id || name),
        stage: lead.stage, money, loc, hqLat: hq.lat, hqLng: hq.lng, source: 'UNIFY deals',
      });
    }
    return { points, count: points.length };
  }

  async function fetchRadarMeta() {
    try {
      const res = await fetchWithTimeout('https://api.rainviewer.com/public/weather-maps.json');
      if (!res.ok) return null;
      const data = await res.json();
      const host = String(data?.host || 'https://tilecache.rainviewer.com');
      const past = Array.isArray(data?.radar?.past) ? data.radar.past : [];
      const nowcast = Array.isArray(data?.radar?.nowcast) ? data.radar.nowcast : [];
      const frames = past.length ? past : nowcast;
      if (!frames.length) return null;
      return { host, frames, frameIdx: frames.length - 1 };
    } catch (e) { return null; }
  }

  function lodFromHeight(heightM) {
    const h = Number(heightM);
    if (!Number.isFinite(h)) return 'Orbit';
    if (h < LOD_CITY_M) return 'City';
    if (h < LOD_REGIONAL_M) return 'Regional';
    return 'Orbit';
  }

  function cameraHeightM(viewer) {
    try {
      const h = Number(viewer && viewer.camera && viewer.camera.positionCartographic && viewer.camera.positionCartographic.height);
      return Number.isFinite(h) ? h : NaN;
    } catch (e) { return NaN; }
  }

  function radarAlphaForHeight(heightM) {
    const h = Number(heightM);
    if (!Number.isFinite(h) || h < RADAR_HIDE_M) return 0;
    if (h >= RADAR_FADE_M) return RADAR_ALPHA;
    return RADAR_ALPHA * ((h - RADAR_HIDE_M) / (RADAR_FADE_M - RADAR_HIDE_M));
  }

  function radarVisibleForView(state, viewer, layerVisible) {
    if (!layerVisible) return false;
    const h = cameraHeightM(viewer);
    const lod = (state && state.lastLod) || lodFromHeight(h);
    if (lod === 'City') return false;
    if (Number.isFinite(h) && h < RADAR_HIDE_M) return false;
    return true;
  }

  function clockDate(Cesium, viewer) {
    try {
      const d = Cesium.JulianDate.toDate(viewer.clock.currentTime);
      if (d && Number.isFinite(d.getTime())) return d;
    } catch (e) {}
    return new Date();
  }

  function viewRectDeg(Cesium, viewer) {
    try {
      const r = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid);
      if (!r) return null;
      return {
        west: Cesium.Math.toDegrees(r.west),
        south: Cesium.Math.toDegrees(r.south),
        east: Cesium.Math.toDegrees(r.east),
        north: Cesium.Math.toDegrees(r.north),
      };
    } catch (e) { return null; }
  }

  function inViewRect(rect, lat, lng) {
    if (!rect) return true;
    if (!(lat >= rect.south && lat <= rect.north)) return false;
    if (rect.west <= rect.east) return lng >= rect.west && lng <= rect.east;
    return lng >= rect.west || lng <= rect.east;
  }

  function applyStarlinkLod(Cesium, viewer, state, layer, lod) {
    const ids = state.groups.get('starlink');
    if (!ids || !ids.size) return;
    const visibleLayer = (layer === 'all' || layer === 'satellites');
    if (!visibleLayer) {
      ids.forEach((id) => {
        const ent = state.entityById.get(id);
        if (ent && !isDestroyedEnt(ent)) { try { ent.show = false; } catch (e) {} }
      });
      return;
    }
    const cap = layer === 'satellites' ? STARLINK_MAX_FOCUS : STARLINK_MAX_ALL;
    const rect = lod === 'Orbit' ? null : viewRectDeg(Cesium, viewer);
    const inV = [];
    const outV = [];
    ids.forEach((id) => {
      const ent = state.entityById.get(id);
      if (!ent) return;
      const row = ent.__gm2 || {};
      if (rect && inViewRect(rect, Number(row.lat), Number(row.lng))) inV.push(ent);
      else outV.push(ent);
    });
    let shown = 0;
    const showEnt = (ent) => {
      if (shown >= cap) { try { ent.show = false; } catch (e) {} return; }
      try {
        const pos = ent.position && ent.position.getValue(viewer.clock.currentTime);
        if (pos && !isPointFacing(Cesium, viewer, state, pos)) { try { ent.show = false; } catch (e2) {} return; }
        ent.show = true;
        shown += 1;
      } catch (e) {
        try { ent.show = true; } catch (e2) {}
        shown += 1;
      }
    };
    inV.forEach(showEnt);
    if (shown < cap) {
      const remain = cap - shown;
      const step = Math.max(1, outV.length / remain);
      const picked = new Set();
      for (let i = 0; i < remain && i * step < outV.length; i++) {
        picked.add(Math.floor(i * step));
      }
      outV.forEach((ent, i) => {
        if (picked.has(i) && shown < cap) showEnt(ent);
        else { try { ent.show = false; } catch (e) {} }
      });
    } else {
      outV.forEach((ent) => { try { ent.show = false; } catch (e) {} });
    }
  }

  function ensureCityLabels(Cesium, viewer, state) {
    if (state.cityLabels) return;
    state.cityLabels = true;
    try { viewer.entities.suspendEvents?.(); } catch (e) {}
    WEATHER_CITIES.forEach((c, i) => {
      const name = c[0];
      const lat = c[1];
      const lng = c[2];
      if (!validLatLng(lat, lng)) return;
      try {
        viewer.entities.add({
          id: 'gm2-city-' + i,
          position: Cesium.Cartesian3.fromDegrees(lng, lat, 0),
          label: {
            text: String(name),
            font: '12px monospace',
            fillColor: Cesium.Color.fromCssColorString('#c9e7ff').withAlpha(0.92),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -6),
            disableDepthTestDistance: 0,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(250, CITY_LABEL_DIST_M),
          },
        });
      } catch (e) {}
    });
    try { viewer.entities.resumeEvents?.(); } catch (e) {}
  }

  function syncNightLights(state, lod) {
    if (!state.nightLayer) return;
    try {
      state.nightLayer.show = lod !== 'City';
      if (lod === 'City') return;
      state.nightLayer.alpha = lod === 'Orbit' ? 0.42 : 0.26;
      try { state.nightLayer.dayAlpha = 0; } catch (e2) {}
      try { state.nightLayer.nightAlpha = lod === 'Orbit' ? 0.88 : 0.62; } catch (e2) {}
    } catch (e) {}
  }

  function syncSeamark(state, lod) {
    if (!state.seamarkLayer) return;
    try { state.seamarkLayer.show = lod === 'City'; } catch (e) {}
  }

  function clampRect(rect, maxDeg, camLat, camLng) {
    if (!rect) return null;
    const west0 = Number(rect.west);
    const east0 = Number(rect.east);
    const south0 = Number(rect.south);
    const north0 = Number(rect.north);
    if (![west0, east0, south0, north0].every(Number.isFinite)) return null;
    if (east0 < west0) return null;
    let west = west0, east = east0, south = south0, north = north0;
    const maxD = Number(maxDeg) || ROAD_BBOX_MAX_DEG;
    const lat = Number.isFinite(camLat) ? camLat : (south + north) / 2;
    const lng = Number.isFinite(camLng) ? camLng : (west + east) / 2;
    if (east - west > maxD) {
      west = lng - maxD / 2;
      east = lng + maxD / 2;
    }
    if (north - south > maxD) {
      south = lat - maxD / 2;
      north = lat + maxD / 2;
    }
    south = Math.max(-85, Math.min(85, south));
    north = Math.max(-85, Math.min(85, north));
    if (north <= south) return null;
    return { west, south, east, north };
  }

  function cameraLatLng(Cesium, viewer) {
    try {
      const c = viewer.camera.positionCartographic;
      if (!c) return null;
      return { lat: Cesium.Math.toDegrees(c.latitude), lng: Cesium.Math.toDegrees(c.longitude) };
    } catch (e) { return null; }
  }

  function rectKey(rect, prec) {
    if (!rect) return '';
    const p = prec == null ? 2 : prec;
    return [rect.west, rect.south, rect.east, rect.north].map((n) => Number(n).toFixed(p)).join(',');
  }

  function clearDecorEntities(viewer, list) {
    const arr = Array.isArray(list) ? list : [];
    if (!viewer) return [];
    for (let i = 0; i < arr.length; i++) {
      try { if (arr[i] && !isDestroyedEnt(arr[i])) viewer.entities.remove(arr[i]); } catch (e) {}
    }
    return [];
  }

  function setDecorShow(list, vis) {
    const arr = Array.isArray(list) ? list : [];
    for (let i = 0; i < arr.length; i++) {
      try { if (arr[i] && !isDestroyedEnt(arr[i])) arr[i].show = !!vis; } catch (e) {}
    }
  }

  function hideRoadParticles(viewer, state) {
    setDecorShow(state.roadEntities, false);
  }

  function destroyRoadParticles(viewer, state) {
    state.roadEntities = clearDecorEntities(viewer, state.roadEntities);
    state.roadBboxKey = '';
  }

  function hideEez(viewer, state) {
    setDecorShow(state.eezEntities, false);
  }

  function wayToLonLat(geom) {
    const pts = [];
    for (let i = 0; i < geom.length; i++) {
      const g = geom[i];
      const lat = Number(g.lat);
      const lng = Number(g.lon != null ? g.lon : g.lng);
      if (!validLatLng(lat, lng, true)) continue;
      pts.push(lng, lat);
    }
    return pts;
  }

  function polylineMetrics(Cesium, positions) {
    const cum = [0];
    let total = 0;
    for (let i = 1; i < positions.length; i++) {
      const d = Cesium.Cartesian3.distance(positions[i - 1], positions[i]);
      total += (Number.isFinite(d) ? d : 0);
      cum.push(total);
    }
    return { cum, total };
  }

  function pointAlongPolyline(Cesium, positions, cum, total, dist, result) {
    if (!positions || positions.length < 2 || !(total > 0)) {
      return Cesium.Cartesian3.clone(positions && positions[0] ? positions[0] : Cesium.Cartesian3.ZERO, result || new Cesium.Cartesian3());
    }
    let d0 = dist % total;
    if (d0 < 0) d0 += total;
    let lo = 1;
    let hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < d0) lo = mid + 1;
      else hi = mid;
    }
    const i = Math.max(1, lo);
    const span = cum[i] - cum[i - 1];
    const f = span > 1e-4 ? (d0 - cum[i - 1]) / span : 0;
    if (!Number.isFinite(f) || !cartesianFinite(Cesium, positions[i - 1]) || !cartesianFinite(Cesium, positions[i])) {
      return Cesium.Cartesian3.clone(positions[0], result || new Cesium.Cartesian3());
    }
    const p = Cesium.Cartesian3.lerp(positions[i - 1], positions[i], f, result || new Cesium.Cartesian3());
    if (!cartesianFinite(Cesium, p)) return Cesium.Cartesian3.clone(positions[i - 1], result || new Cesium.Cartesian3());
    return p;
  }

  function pickRoadWays(elements) {
    const motor = [];
    const trunk = [];
    const primary = [];
    const list = Array.isArray(elements) ? elements : [];
    for (let i = 0; i < list.length; i++) {
      const el = list[i];
      if (!el || el.type !== 'way' || !Array.isArray(el.geometry) || el.geometry.length < 2) continue;
      const hw = String((el.tags || {}).highway || '');
      if (hw === 'motorway') motor.push(el);
      else if (hw === 'trunk') trunk.push(el);
      else if (hw === 'primary') primary.push(el);
    }
    return motor.concat(trunk, primary).slice(0, ROAD_WAY_CAP);
  }

  function buildRoadOverpassQuery(rect) {
    const s = rect.south.toFixed(5);
    const w = rect.west.toFixed(5);
    const n = rect.north.toFixed(5);
    const e = rect.east.toFixed(5);
    return [
      '[out:json][timeout:25];',
      '// UNALIGNED GodMode',
      'way["highway"~"^(motorway|trunk|primary)$"](' + s + ',' + w + ',' + n + ',' + e + ');',
      'out geom ' + ROAD_WAY_CAP + ';',
    ].join('\n');
  }

  function rebuildRoadParticles(Cesium, viewer, state, ways) {
    state.roadEntities = clearDecorEntities(viewer, state.roadEntities);
    if (!ways || !ways.length || state.destroyed || !viewer || viewer.isDestroyed?.()) return 0;
    const particles = [];
    const lineEnts = [];
    try { viewer.entities.suspendEvents?.(); } catch (e) {}
    for (let i = 0; i < ways.length; i++) {
      const el = ways[i];
      const hw = String((el.tags || {}).highway || 'primary');
      let geom = el.geometry;
      if (geom.length > 80) {
        const step = Math.ceil(geom.length / 80);
        const slim = [];
        for (let k = 0; k < geom.length; k += step) slim.push(geom[k]);
        if (slim[slim.length - 1] !== geom[geom.length - 1]) slim.push(geom[geom.length - 1]);
        geom = slim;
      }
      const lonlat = wayToLonLat(geom);
      if (lonlat.length < 4) continue;
      let positions = null;
      try {
        const packed = [];
        for (let k = 0; k < lonlat.length; k += 2) packed.push(lonlat[k], lonlat[k + 1], 14);
        positions = filterCartesians(Cesium, Cesium.Cartesian3.fromDegreesArrayHeights(packed));
      } catch (e) { positions = null; }
      if (!positions || positions.length < 2) continue;
      const metrics = polylineMetrics(Cesium, positions);
      if (!(metrics.total > 80)) continue;
      if (lineEnts.length < ROAD_LINE_CAP) {
        try {
          const col = hw === 'motorway' ? '#5ac8fa' : (hw === 'trunk' ? '#64d2ff' : '#ffd60a');
          const ent = viewer.entities.add({
            polyline: {
              positions,
              width: hw === 'motorway' ? 1.8 : 1.2,
              material: cesiumColor(Cesium, col, hw === 'motorway' ? 0.38 : 0.22),
              clampToGround: true,
            },
          });
          ent.__gm2Decor = true;
          lineEnts.push(ent);
        } catch (e) {}
      }
      const nPart = hw === 'motorway' ? 3 : (hw === 'trunk' ? 2 : 1);
      for (let p = 0; p < nPart && particles.length < ROAD_PARTICLE_MAX; p++) {
        particles.push({
          positions, cum: metrics.cum, total: metrics.total, hw,
          offset: Math.random() * metrics.total,
          speed: (hw === 'motorway' ? 22 : (hw === 'trunk' ? 16 : 12)) * (0.75 + Math.random() * 0.5),
        });
      }
    }
    const t0 = Date.now() / 1000;
    for (let i = 0; i < particles.length; i++) {
      const spec = particles[i];
      const scratch = new Cesium.Cartesian3();
      try {
        const posProp = new Cesium.CallbackProperty(function (time, result) {
          let sec = t0;
          try {
            const d = Cesium.JulianDate.toDate(time);
            if (d && Number.isFinite(d.getTime())) sec = d.getTime() / 1000;
          } catch (e) {}
          const dist = spec.offset + (sec - t0) * spec.speed;
          const p = pointAlongPolyline(Cesium, spec.positions, spec.cum, spec.total, dist, result || scratch);
          if (!cartesianFinite(Cesium, p)) {
            if (spec._last && cartesianFinite(Cesium, spec._last)) {
              return Cesium.Cartesian3.clone(spec._last, result || scratch);
            }
            return Cesium.Cartesian3.clone(spec.positions[0], result || scratch);
          }
          spec._last = Cesium.Cartesian3.clone(p, spec._last);
          return p;
        }, false);
        const col = spec.hw === 'motorway' ? '#7ad7ff' : (spec.hw === 'trunk' ? '#ffd60a' : '#ffe08a');
        const ent = viewer.entities.add({
          position: posProp,
          point: {
            pixelSize: spec.hw === 'motorway' ? 4 : 3,
            color: cesiumColor(Cesium, col, 0.95),
            outlineWidth: 0,
            heightReference: Cesium.HeightReference.NONE,
            disableDepthTestDistance: 0,
            scaleByDistance: new Cesium.NearFarScalar(4.0e4, 1.2, 1.6e5, 0.35),
          },
        });
        ent.__gm2Decor = true;
        lineEnts.push(ent);
      } catch (e) {}
    }
    try { viewer.entities.resumeEvents?.(); } catch (e) {}
    state.roadEntities = lineEnts;
    return particles.length;
  }

  async function fetchAndShowRoads(Cesium, viewer, state) {
    if (state.destroyed || !viewer || viewer.isDestroyed?.()) return;
    const lod = lodFromHeight(viewer.camera.positionCartographic?.height);
    if (lod !== 'City') { destroyRoadParticles(viewer, state); return; }
    const cam = cameraLatLng(Cesium, viewer);
    const raw = viewRectDeg(Cesium, viewer);
    const rect = clampRect(raw, ROAD_BBOX_MAX_DEG, cam && cam.lat, cam && cam.lng);
    if (!rect) return;
    const key = rectKey(rect, 2);
    if (key && key === state.roadBboxKey && (state.roadEntities || []).length) {
      setDecorShow(state.roadEntities, true);
      return;
    }
    if (state.roadCache && state.roadCache.key === key && state.roadCache.ways) {
      state.roadBboxKey = key;
      rebuildRoadParticles(Cesium, viewer, state, state.roadCache.ways);
      return;
    }
    const gen = (state._roadGen = (state._roadGen || 0) + 1);
    try {
      try { if (state._roadAbort) state._roadAbort.abort(); } catch (e0) {}
      state._roadAbort = new AbortController();
      const ql = buildRoadOverpassQuery(rect);
      const res = await fetchWithTimeout(OVERPASS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: 'data=' + encodeURIComponent(ql),
        signal: state._roadAbort.signal,
      }, ROAD_OVERPASS_TIMEOUT_MS);
      if (gen !== state._roadGen) return;
      if (!res || !res.ok) return;
      const data = await res.json();
      if (gen !== state._roadGen || state.destroyed || viewer.isDestroyed?.()) return;
      if (lodFromHeight(viewer.camera.positionCartographic?.height) !== 'City') return;
      const ways = pickRoadWays(data && data.elements);
      state.roadCache = { key, ways };
      state.roadBboxKey = key;
      rebuildRoadParticles(Cesium, viewer, state, ways);
    } catch (e) {
      /* Overpass 429 / timeout / abort: fail quiet */
    }
  }

  function clipLineToRect(coords, rect, pad) {
    const p = Number.isFinite(pad) ? pad : 0.15;
    const w = rect.west - p, s = rect.south - p, e = rect.east + p, n = rect.north + p;
    const segs = [];
    let cur = [];
    const list = Array.isArray(coords) ? coords : [];
    const stride = list.length > 8000 ? Math.ceil(list.length / 4000) : 1;
    for (let i = 0; i < list.length; i += stride) {
      const pt = list[i];
      if (!pt || pt.length < 2) continue;
      const lon = Number(pt[0]);
      const lat = Number(pt[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      if (lat >= s && lat <= n && lon >= w && lon <= e) {
        cur.push(pt);
        if (cur.length > 600) {
          segs.push(cur);
          cur = [pt];
        }
      } else if (cur.length) {
        if (cur.length >= 2) segs.push(cur);
        cur = [];
      }
    }
    if (cur.length >= 2) segs.push(cur);
    return segs;
  }

  function geomToLines(geom) {
    const lines = [];
    if (!geom || !geom.type) return lines;
    if (geom.type === 'LineString') lines.push(geom.coordinates || []);
    else if (geom.type === 'MultiLineString') (geom.coordinates || []).forEach((l) => lines.push(l));
    else if (geom.type === 'Polygon') (geom.coordinates || []).forEach((r) => lines.push(r));
    else if (geom.type === 'MultiPolygon') {
      (geom.coordinates || []).forEach((poly) => (poly || []).forEach((r) => lines.push(r)));
    }
    return lines;
  }

  function rebuildEez(Cesium, viewer, state, features, rect) {
    state.eezEntities = clearDecorEntities(viewer, state.eezEntities);
    if (!features || !features.length) return;
    const ents = [];
    try { viewer.entities.suspendEvents?.(); } catch (e) {}
    let drawn = 0;
    for (let i = 0; i < features.length && drawn < EEZ_MAX_FEATURES; i++) {
      const lines = geomToLines(features[i] && features[i].geometry);
      for (let li = 0; li < lines.length && drawn < EEZ_MAX_FEATURES; li++) {
        const segs = clipLineToRect(lines[li], rect, 0.25);
        for (let s = 0; s < segs.length && drawn < EEZ_MAX_FEATURES; s++) {
          const lonlat = [];
          const seg = segs[s];
          const step = seg.length > 400 ? Math.ceil(seg.length / 400) : 1;
          for (let k = 0; k < seg.length; k += step) {
            const lon = Number(seg[k][0]);
            const lat = Number(seg[k][1]);
            if (validLatLng(lat, lon, true)) { lonlat.push(lon, lat); }
          }
          if (lonlat.length < 4) continue;
          let positions;
          try { positions = filterCartesians(Cesium, Cesium.Cartesian3.fromDegreesArray(lonlat)); } catch (e) { continue; }
          if (!positions || positions.length < 2) continue;
          try {
            const ent = viewer.entities.add({
              polyline: {
                positions,
                width: 1.6,
                material: cesiumColor(Cesium, '#5ac8fa', 0.55),
                clampToGround: true,
              },
            });
            ent.__gm2Decor = true;
            ents.push(ent);
            drawn += 1;
          } catch (e) {}
        }
      }
    }
    try { viewer.entities.resumeEvents?.(); } catch (e) {}
    state.eezEntities = ents;
  }

  async function fetchAndShowEez(Cesium, viewer, state) {
    if (state.destroyed || !viewer || viewer.isDestroyed?.()) return;
    const lod = lodFromHeight(viewer.camera.positionCartographic?.height);
    if (lod !== 'Regional') { hideEez(viewer, state); return; }
    const cam = cameraLatLng(Cesium, viewer);
    const raw = viewRectDeg(Cesium, viewer);
    const rect = clampRect(raw, EEZ_BBOX_MAX_DEG, cam && cam.lat, cam && cam.lng);
    if (!rect) return;
    const key = rectKey(rect, 1);
    if (key && key === state.eezBboxKey && (state.eezEntities || []).length) {
      setDecorShow(state.eezEntities, true);
      return;
    }
    const gen = (state._eezGen = (state._eezGen || 0) + 1);
    const bbox = [rect.west, rect.south, rect.east, rect.north].map((n) => Number(n).toFixed(4)).join(',');
    const url = EEZ_WFS_BASE
      + '?service=WFS&version=1.0.0&request=GetFeature&typeName=eez_boundaries'
      + '&maxFeatures=' + EEZ_MAX_FEATURES
      + '&outputformat=application/json&srsName=EPSG:4326&bbox=' + encodeURIComponent(bbox);
    try {
      try { if (state._eezAbort) state._eezAbort.abort(); } catch (e0) {}
      state._eezAbort = new AbortController();
      const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' }, signal: state._eezAbort.signal }, EEZ_TIMEOUT_MS);
      if (gen !== state._eezGen) return;
      if (!res || !res.ok) return;
      const data = await res.json();
      if (gen !== state._eezGen || state.destroyed || viewer.isDestroyed?.()) return;
      if (lodFromHeight(viewer.camera.positionCartographic?.height) !== 'Regional') return;
      const feats = Array.isArray(data && data.features) ? data.features : [];
      state.eezBboxKey = key;
      rebuildEez(Cesium, viewer, state, feats, rect);
    } catch (e) { /* quiet */ }
  }

  function scheduleCityAlive(Cesium, viewer, state) {
    if (state._aliveTimer) {
      global.clearTimeout(state._aliveTimer);
      state._aliveTimer = null;
    }
    const bandNow = lodFromHeight(viewer.camera.positionCartographic?.height);
    if (bandNow !== 'City') {
      try { if (state._roadAbort) { state._roadAbort.abort(); state._roadAbort = null; } } catch (e) {}
      state._roadGen = (state._roadGen || 0) + 1;
      destroyRoadParticles(viewer, state);
    }
    if (bandNow !== 'Regional') hideEez(viewer, state);
    state._aliveTimer = global.setTimeout(function () {
      state._aliveTimer = null;
      if (state.destroyed || !viewer || viewer.isDestroyed?.()) return;
      const band = lodFromHeight(viewer.camera.positionCartographic?.height);
      if (band === 'City') fetchAndShowRoads(Cesium, viewer, state);
      else {
        try { if (state._roadAbort) { state._roadAbort.abort(); state._roadAbort = null; } } catch (e) {}
        destroyRoadParticles(viewer, state);
      }
      if (band === 'Regional') fetchAndShowEez(Cesium, viewer, state);
      else {
        hideEez(viewer, state);
        state.eezEntities = clearDecorEntities(viewer, state.eezEntities);
        state.eezBboxKey = '';
      }
    }, ROAD_QUERY_DEBOUNCE_MS);
  }

  function cesiumColor(Cesium, hexOrRgba, alpha) {
    try {
      const c = Cesium.Color.fromCssColorString(String(hexOrRgba || '#64d2ff'));
      return Number.isFinite(alpha) ? c.withAlpha(alpha) : c;
    } catch (e) {
      return Cesium.Color.CYAN.withAlpha(Number.isFinite(alpha) ? alpha : 0.9);
    }
  }

  function isDestroyedEnt(ent) {
    try { return !ent || ent.isDestroyed?.(); } catch (e) { return true; }
  }

  function getIssIconUrl() {
    if (issIconUrl) return issIconUrl;
    try {
      const c = document.createElement('canvas');
      c.width = 81; c.height = 36;
      const g = c.getContext('2d');
      g.clearRect(0, 0, 81, 36);
      g.fillStyle = 'rgba(90,200,250,0.22)';
      g.fillRect(0, 13, 81, 10);
      g.fillStyle = '#3aa7d8';
      g.fillRect(2, 13, 26, 10);
      g.fillRect(53, 13, 26, 10);
      g.strokeStyle = 'rgba(8,20,32,0.55)';
      g.beginPath(); g.moveTo(15, 13); g.lineTo(15, 23); g.moveTo(66, 13); g.lineTo(66, 23); g.stroke();
      g.fillStyle = '#eaf7ff';
      g.fillRect(32, 11, 17, 14);
      g.fillStyle = '#5ac8fa';
      g.fillRect(35, 14, 11, 8);
      issIconUrl = c.toDataURL();
    } catch (e) { issIconUrl = ''; }
    return issIconUrl;
  }

  function defaultPointSize(type) {
    if (type === 'starlink' || type === 'oneweb' || type === 'kuiper') return 3;
    if (type === 'flight') return 6;
    if (type === 'military') return 7;
    if (type === 'ship') return 7;
    if (type === 'gps') return 5;
    if (type === 'wxsat' || type === 'visual') return 6;
    if (type === 'geo') return 5;
    if (type === 'milsat') return 6;
    if (type === 'station') return 8;
    if (type === 'satellite') return 14;
    if (type === 'launch') return 11;
    if (type === 'event') return 10;
    if (type === 'deal') return 9;
    if (type === 'weather') return 8;
    if (type === 'gpsjam') return 5;
    if (type === 'storm') return 11;
    return 8;
  }

  function cityLabelTypes() {
    return { flight: 1, military: 1, ship: 1, deal: 1, launch: 1, storm: 1 };
  }

  function makeLabelOpts(Cesium, row, lod, layer) {
    if (row.kind === 'cone' || row.kind === 'track' || row.kind === 'past') return undefined;
    const type = row.type;
    const always = type === 'satellite' || (layer === 'launches' && type === 'launch')
      || (layer === 'deals' && type === 'deal') || (layer === 'weather' && type === 'weather');
    const cityOnly = !!cityLabelTypes()[type];
    const show = always || (lod === 'City' && cityOnly) || (layer === type + 's' && type !== 'starlink' && type !== 'oneweb' && type !== 'kuiper');
    const text = String(row.name || row.callsign || row.label || '').slice(0, 28);
    if (!text) return undefined;
    const cond = cityOnly && !always
      ? new Cesium.DistanceDisplayCondition(0, CITY_LABEL_DIST_M)
      : undefined;
    return {
      text,
      font: '11px monospace',
      fillColor: Cesium.Color.WHITE.withAlpha(0.92),
      outlineColor: Cesium.Color.BLACK, outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, type === 'satellite' ? -18 : -12),
      disableDepthTestDistance: 0,
      show: !!show,
      distanceDisplayCondition: cond,
    };
  }

  function highlightSelected(state, newId) {
    const oldId = state.selectedId;
    if (oldId && oldId !== newId) {
      const old = state.entityById.get(oldId);
      if (old && old.point && old.__gm2) {
        try {
          old.point.pixelSize = defaultPointSize(old.__gm2.type);
          old.point.outlineWidth = 1;
        } catch (e) {}
      }
    }
    state.selectedId = newId || '';
    if (newId) {
      const ent = state.entityById.get(newId);
      if (ent && ent.point && ent.__gm2) {
        try {
          ent.point.pixelSize = defaultPointSize(ent.__gm2.type) + 5;
          ent.point.outlineWidth = 2;
        } catch (e) {}
      }
    }
  }


  function cameraOccluder(Cesium, viewer, state) {
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

  function isPointFacing(Cesium, viewer, state, pos) {
    if (!pos) return true;
    try {
      const occ = cameraOccluder(Cesium, viewer, state);
      return !occ || occ.isPointVisible(pos);
    } catch (e) { return true; }
  }

  function runHorizonCull(Cesium, viewer, state) {
    try {
      const occluder = cameraOccluder(Cesium, viewer, state);
      if (!occluder) return;
      const selected = state.selectedId;
      state.entityById.forEach((ent, id) => {
        if (!ent || isDestroyedEnt(ent)) return;
        if (ent.__gm2Decor) return;
        if (ent.__gm2LayerOn === false) {
          ent.show = false;
          return;
        }
        let pos = null;
        try { pos = ent.position && ent.position.getValue(viewer.clock.currentTime); } catch (e) {}
        if (!pos) { ent.show = true; return; }
        if (!cartesianFinite(Cesium, pos)) { ent.show = false; return; }
        const facing = occluder.isPointVisible(pos);
        ent.show = !!facing || id === selected;
      });
    } catch (e) {}
  }

  function attachHorizonCull(Cesium, viewer, state) {
    if (state.horizonCullRemove) return;
    let timer = null;
    const run = function () { runHorizonCull(Cesium, viewer, state); };
    const schedule = function () {
      if (timer) return;
      timer = global.setTimeout(function () {
        timer = null;
        run();
      }, 250);
    };
    viewer.camera.moveEnd.addEventListener(run);
    try { viewer.camera.changed.addEventListener(schedule); } catch (e) {}
    state.runHorizonCull = run;
    state.horizonCullRemove = function () {
      try { viewer.camera.moveEnd.removeEventListener(run); } catch (e) {}
      try { viewer.camera.changed.removeEventListener(schedule); } catch (e) {}
      if (timer) { global.clearTimeout(timer); timer = null; }
      state.horizonCullRemove = null;
      state.runHorizonCull = null;
    };
    run();
  }

  function upsertPointEntity(Cesium, viewer, state, row, opts) {
    const lat = Number(row.lat);
    const lng = Number(row.lng);
    if (!validLatLng(lat, lng)) return null;
    const alt = Number(row.altM);
    const height = Number.isFinite(alt) ? alt : 0;
    const id = String(row.id || (row.type + '-' + lat + '-' + lng));
    row.id = id;
    const color = cesiumColor(Cesium, row.color || opts?.color || '#64d2ff', opts?.alpha);
    const pixelSize = opts?.pixelSize || defaultPointSize(row.type);
    const selected = state.selectedId && state.selectedId === id;
    const pos = Cesium.Cartesian3.fromDegrees(lng, lat, height);
    if (!cartesianFinite(Cesium, pos)) return null;
    let ent = state.entityById.get(id);
    if ((!ent || isDestroyedEnt(ent)) && id !== state.selectedId && !isPointFacing(Cesium, viewer, state, pos)) {
      return null;
    }
    const lod = state.lastLod || 'Orbit';
    const layer = state.layer || 'all';
    const labelOpts = makeLabelOpts(Cesium, row, lod, layer);
    const heightRef = height > 50 ? Cesium.HeightReference.NONE : Cesium.HeightReference.CLAMP_TO_GROUND;
    if (ent && !isDestroyedEnt(ent)) {
      try { ent.position = pos; } catch (e) {}
      ent.__gm2 = row;
      try {
        if (ent.point) {
          ent.point.color = color;
          ent.point.pixelSize = selected ? pixelSize + 5 : pixelSize;
          ent.point.outlineWidth = selected ? 2 : (opts?.outline === false ? 0 : 1);
        }
        if (ent.label && labelOpts) {
          ent.label.text = labelOpts.text;
          ent.label.show = labelOpts.show;
          if (labelOpts.distanceDisplayCondition) ent.label.distanceDisplayCondition = labelOpts.distanceDisplayCondition;
        }
        if (row.type === 'satellite' && ent.billboard && issIconUrl) {
          ent.billboard.position = pos;
        }
        if (ent.ellipse && opts?.ellipseM) {
          ent.ellipse.semiMajorAxis = opts.ellipseM;
          ent.ellipse.semiMinorAxis = opts.ellipseM;
          ent.ellipse.material = color.withAlpha(0.28);
        }
      } catch (e) {}
      return ent;
    }
    const entityDef = {
      id: 'gm2-' + id,
      position: pos,
      point: {
        pixelSize: selected ? pixelSize + 5 : pixelSize,
        color,
        outlineColor: Cesium.Color.BLACK.withAlpha(0.65),
        outlineWidth: opts?.outline === false ? 0 : 1,
        heightReference: heightRef,
        disableDepthTestDistance: 0,
        scaleByDistance: new Cesium.NearFarScalar(8.0e5, 1.15, 2.2e7, 0.28),
        translucencyByDistance: new Cesium.NearFarScalar(1.2e7, 1.0, 3.2e7, 0.15),
      },
    };
    if (opts?.ellipseM && Number.isFinite(opts.ellipseM) && opts.ellipseM > 0) {
      entityDef.ellipse = {
        semiMajorAxis: opts.ellipseM,
        semiMinorAxis: opts.ellipseM,
        material: color.withAlpha(0.28),
        outline: true,
        outlineColor: color.withAlpha(0.8),
        height: 0,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      };
    }
    if (labelOpts) entityDef.label = labelOpts;
    if (row.craft === 'iss') {
      const icon = getIssIconUrl();
      if (icon) {
        entityDef.billboard = {
          image: icon, width: 54, height: 24,
          disableDepthTestDistance: 0,
          pixelOffset: new Cesium.Cartesian2(0, 0),
        };
        entityDef.point.pixelSize = 11;
        entityDef.label = Object.assign({}, labelOpts || {}, { text: 'ISS', show: true, pixelOffset: new Cesium.Cartesian2(0, -20) });
      }
    }
    try {
      ent = viewer.entities.add(entityDef);
    } catch (e) { return null; }
    ent.__gm2 = row;
    state.entityById.set(id, ent);
    return ent;
  }

  function removeEntity(viewer, state, id) {
    const ent = state.entityById.get(id);
    if (!ent) return;
    try { viewer.entities.remove(ent); } catch (e) {}
    state.entityById.delete(id);
  }

  function syncGroup(Cesium, viewer, state, groupKey, rows, optsFn, prune) {
    const keep = new Set();
    const list = Array.isArray(rows) ? rows : [];
    try { viewer.entities.suspendEvents?.(); } catch (e) {}
    for (let i = 0; i < list.length; i++) {
      const row = list[i];
      if (!row) continue;
      const opts = optsFn ? optsFn(row) : {};
      const ent = upsertPointEntity(Cesium, viewer, state, row, opts);
      if (ent && row.id) {
        keep.add(row.id);
        rememberTrail(row.id, row.lat, row.lng, row.altM, row.type);
      }
    }
    const prev = state.groups.get(groupKey) || new Set();
    if (prune !== false) {
      prev.forEach((id) => {
        if (!keep.has(id)) removeEntity(viewer, state, id);
      });
      state.groups.set(groupKey, keep);
    } else {
      const merged = new Set(prev);
      keep.forEach((id) => merged.add(id));
      state.groups.set(groupKey, merged);
    }
    try { viewer.entities.resumeEvents?.(); } catch (e) {}
    return keep.size;
  }

  function setGroupShow(state, groupKey, visible) {
    const ids = state.groups.get(groupKey);
    if (!ids) return;
    ids.forEach((id) => {
      const ent = state.entityById.get(id);
      if (ent && !isDestroyedEnt(ent)) {
        try {
          ent.__gm2LayerOn = !!visible;
          if (!visible) ent.show = false;
        } catch (e) {}
      }
    });
  }

  function applyLayerVisibility(state, layer) {
    const wanted = LAYER_GROUPS[layer];
    const allKeys = ['weather', 'event', 'flight', 'military', 'satellite', 'starlink', 'gps', 'wxsat', 'station', 'oneweb', 'geo', 'visual', 'milsat', 'kuiper', 'launch', 'deal', 'deal-arc', 'ship', 'gpsjam', 'storm'];
    allKeys.forEach((g) => {
      const on = !wanted || wanted.indexOf(g) >= 0;
      setGroupShow(state, g, on);
    });
    if (layer !== 'all' && layer !== 'weather') stopRadarAnim(state);
    if (state.radarLayer) {
      try {
        const vis = (layer === 'all' || layer === 'weather');
        const wantedRadar = radarVisibleForView(state, state.viewer, vis);
        const a = wantedRadar ? radarAlphaForHeight(cameraHeightM(state.viewer)) : 0;
        state.radarLayer.show = wantedRadar && a > 0.01;
        state.radarLayer.alpha = a;
      } catch (e) {}
    }
    if (state.issOrbitEntity) {
      try { state.issOrbitEntity.show = (!wanted || wanted.indexOf('satellite') >= 0); } catch (e) {}
    }
    const cap = layer === 'satellites' ? STARLINK_MAX_FOCUS : STARLINK_MAX_ALL;
    const sl = state.groups.get('starlink');
    if (sl && layer !== 'satellites' && (layer === 'all' || !wanted)) {
      let n = 0;
      sl.forEach((id) => {
        const ent = state.entityById.get(id);
        if (!ent) return;
        n += 1;
        try { ent.show = n <= cap && (layer === 'all' || layer === 'satellites'); } catch (e) {}
      });
    }
  }

  function refreshCityLabels(Cesium, state, lod, layer) {
    state.entityById.forEach((ent, id) => {
      const row = ent?.__gm2;
      if (!row || !ent.label) return;
      const opts = makeLabelOpts(Cesium, row, lod, layer);
      if (!opts) return;
      try {
        ent.label.show = opts.show;
        if (opts.distanceDisplayCondition) ent.label.distanceDisplayCondition = opts.distanceDisplayCondition;
      } catch (e) {}
    });
  }

  function cartesianPath(Cesium, pts) {
    const out = [];
    (pts || []).forEach((p) => {
      if (!validLatLng(p.lat, p.lng)) return;
      const alt = Number.isFinite(p.altM) ? p.altM : 0;
      const c = Cesium.Cartesian3.fromDegrees(p.lng, p.lat, alt);
      if (cartesianFinite(Cesium, c)) out.push(c);
    });
    return out;
  }

  function upsertPolyline(Cesium, viewer, state, key, positions, color, width) {
    if (!positions || positions.length < 2) {
      if (state[key]) {
        try { viewer.entities.remove(state[key]); } catch (e) {}
        state[key] = null;
      }
      return;
    }
    try {
      if (state[key] && !isDestroyedEnt(state[key])) {
        state[key].polyline.positions = positions;
        try { state[key].polyline.disableDepthTestDistance = 0; } catch (e2) {}
        return;
      }
    } catch (e) {}
    try {
      state[key] = viewer.entities.add({
        id: 'gm2-' + key,
        polyline: {
          positions, width: width || 2,
          material: cesiumColor(Cesium, color || '#5ac8fa', 0.8),
          clampToGround: false,
          disableDepthTestDistance: 0,
        },
      });
    } catch (e) {}
  }

  function showSelectionTrail(Cesium, viewer, state, row) {
    if (!row) {
      upsertPolyline(Cesium, viewer, state, 'trailEntity', null);
      upsertPolyline(Cesium, viewer, state, 'selOrbitEntity', null);
      return;
    }
    if (row.type === 'flight' || row.type === 'ship' || row.type === 'military') {
      const hist = trailHistory.get(row.id) || [];
      let pts = hist.slice();
      if (pts.length < 3) {
        const spd = row.type === 'ship' ? row.sog : row.speedKts;
        const hdg = row.heading || row.cog;
        pts = projectHeadingPath(row.lat, row.lng, hdg, spd, row.altM || 0, (row.type === 'flight' || row.type === 'military') ? 12 : 18, 4, 20);
      } else {
        const spd = row.type === 'ship' ? row.sog : row.speedKts;
        const fwd = projectHeadingPath(row.lat, row.lng, row.heading || row.cog, spd, row.altM || 0, 0, 5, 8);
        pts = pts.concat(fwd.slice(1));
      }
      upsertPolyline(Cesium, viewer, state, 'trailEntity', cartesianPath(Cesium, pts), row.type === 'ship' ? '#64d2ff' : (row.type === 'military' ? '#ff9f0a' : '#ffd60a'), 3);
      upsertPolyline(Cesium, viewer, state, 'selOrbitEntity', null);
      return;
    }
    if (isSatType(row.type)) {
      let rec = null;
      if (row.craft === 'iss' || row.id === 'sat-iss') rec = findIssRec();
      if (!rec && row.satnum) {
        const bags = [tleStore.starlinkSubset, tleStore.gps, tleStore.weather, tleStore.stations, tleStore.starlink, tleStore.oneweb, tleStore.geo, tleStore.visual, tleStore.military, tleStore.kuiper];
        for (let b = 0; b < bags.length && !rec; b++) {
          const list = bags[b] || [];
          for (let i = 0; i < list.length; i++) {
            if (String(list[i].satnum) === String(row.satnum)) { rec = list[i]; break; }
          }
        }
      }
      const period = row.type === 'gps' ? 720 : (row.type === 'geo' ? 1436 : (row.type === 'wxsat' ? 140 : 96));
      const when = clockDate(Cesium, viewer);
      const pts = rec ? sampleOrbit(rec.rec, when, period, 80) : (row.craft === 'iss' ? (state.data?.issTrail || []) : []);
      upsertPolyline(Cesium, viewer, state, 'selOrbitEntity', cartesianPath(Cesium, pts), row.color || '#5ac8fa', 2.4);
      upsertPolyline(Cesium, viewer, state, 'trailEntity', null);
      return;
    }
    upsertPolyline(Cesium, viewer, state, 'trailEntity', null);
    upsertPolyline(Cesium, viewer, state, 'selOrbitEntity', null);
  }

  function ensureIssOrbit(Cesium, viewer, state, trailPts) {
    const rec = findIssRec();
    const pts = rec ? sampleOrbit(rec.rec, clockDate(Cesium, viewer), 92, 72) : trailPts;
    upsertPolyline(Cesium, viewer, state, 'issOrbitEntity', cartesianPath(Cesium, pts || []), '#5ac8fa', 1.8);
  }

  function syncDeals(Cesium, viewer, state, deals) {
    syncGroup(Cesium, viewer, state, 'deal', deals, () => ({ pixelSize: 9 }));
    const keep = new Set();
    (deals || []).forEach((d) => {
      if (!validLatLng(d.hqLat, d.hqLng) || !validLatLng(d.lat, d.lng)) return;
      const arcId = 'arc-' + d.id;
      let ent = state.entityById.get(arcId);
      const rawArc = Cesium.Cartesian3.fromDegreesArrayHeights
        ? Cesium.Cartesian3.fromDegreesArray([d.lng, d.lat, d.hqLng, d.hqLat])
        : null;
      const positions = filterCartesians(Cesium, rawArc);
      if (!positions || positions.length < 2) return;
      if (ent && !isDestroyedEnt(ent)) {
        try { ent.polyline.positions = positions; } catch (e) {}
        ent.__gm2 = d;
      } else {
        try {
          ent = viewer.entities.add({
            id: 'gm2-' + arcId,
            polyline: {
              positions, width: 1.4,
              material: cesiumColor(Cesium, d.color, 0.55),
              clampToGround: false,
              arcType: Cesium.ArcType.GEODESIC,
            },
          });
          ent.__gm2 = d;
          state.entityById.set(arcId, ent);
        } catch (e) {}
      }
      keep.add(arcId);
    });
    const prev = state.groups.get('deal-arc') || new Set();
    prev.forEach((id) => { if (!keep.has(id)) removeEntity(viewer, state, id); });
    state.groups.set('deal-arc', keep);
  }

  function stopRadarAnim(state) {
    if (state && state.radarTimer != null) {
      try { window.clearInterval(state.radarTimer); } catch (e) {}
      state.radarTimer = null;
    }
  }

  function hideRadarLayer(state) {
    stopRadarAnim(state);
    if (state && state.radarLayer) {
      try { state.radarLayer.show = false; } catch (e) {}
      try { state.radarLayer.alpha = 0; } catch (e) {}
    }
  }

  function ensureRadar(Cesium, viewer, state, radar, visible) {
    const wanted = radarVisibleForView(state, viewer, visible);
    const h = cameraHeightM(viewer);
    const alpha = wanted ? radarAlphaForHeight(h) : 0;
    if (!wanted || alpha <= 0.01) {
      hideRadarLayer(state);
      return;
    }
    if (!radar?.host || !radar.frames?.length) {
      hideRadarLayer(state);
      return;
    }
    try {
      const frame = radar.frames[radar.frames.length - 1] || radar.frames[radar.frameIdx];
      const path = String(frame?.path || '').trim();
      if (!path) return;
      const url = String(radar.host).replace(/\/$/, '') + path + '/256/{z}/{x}/{y}/2/1_0.png';
      if (state.radarLayer) {
        state.radarLayer.show = true;
        try { state.radarLayer.alpha = alpha; } catch (e2) {}
        stopRadarAnim(state);
        return;
      }
      if (state.radarUrl === url && state.radarLayer) {
        state.radarLayer.show = true;
        try { state.radarLayer.alpha = alpha; } catch (e2) {}
        stopRadarAnim(state);
        return;
      }
      const provider = new Cesium.UrlTemplateImageryProvider({
        url, maximumLevel: 7, credit: 'RainViewer',
      });
      const next = viewer.imageryLayers.addImageryProvider(provider);
      try { next.alpha = alpha; } catch (e) {}
      next.show = true;
      const prev = state.radarLayer;
      state.radarLayer = next;
      state.radarUrl = url;
      if (prev) {
        try { viewer.imageryLayers.remove(prev, true); } catch (e) {}
      }
    } catch (e) { console.warn('[god-mode-cesium] radar layer failed', e); }
    stopRadarAnim(state);
  }

  function upsertStormGeomEntity(Cesium, viewer, state, row) {
    const id = String(row.id || '');
    const lonlat = row.lonlat;
    if (!id || !lonlat || lonlat.length < 4) return null;
    let positions;
    try { positions = Cesium.Cartesian3.fromDegreesArray(lonlat); } catch (e) { return null; }
    positions = filterCartesians(Cesium, positions);
    if (!positions || positions.length < 2) return null;
    const color = cesiumColor(Cesium, row.color || '#64d2ff');
    const pos = Cesium.Cartesian3.fromDegrees(row.lng, row.lat, 0);
    if (cartesianFinite(Cesium, pos) && id !== state.selectedId && !isPointFacing(Cesium, viewer, state, pos)) {
      return null;
    }
    let ent = state.entityById.get(id);
    if (ent && !isDestroyedEnt(ent)) {
      try {
        if (row.kind === 'cone' && ent.polygon) {
          ent.polygon.hierarchy = new Cesium.PolygonHierarchy(positions);
        }
        if ((row.kind === 'track' || row.kind === 'past') && ent.polyline) {
          ent.polyline.positions = positions;
        }
        if (pos) ent.position = pos;
      } catch (e) {}
      ent.__gm2 = row;
      return ent;
    }
    const def = { id: 'gm2-' + id, position: pos };
    if (row.kind === 'cone') {
      def.polygon = {
        hierarchy: new Cesium.PolygonHierarchy(positions),
        material: color.withAlpha(0.18),
        outline: true,
        outlineColor: color.withAlpha(0.85),
        height: 0,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      };
    } else {
      def.polyline = {
        positions,
        width: row.kind === 'past' ? 1.6 : 2.4,
        material: color.withAlpha(row.kind === 'past' ? 0.55 : 0.9),
        clampToGround: true,
      };
    }
    try { ent = viewer.entities.add(def); } catch (e) { return null; }
    ent.__gm2 = row;
    state.entityById.set(id, ent);
    return ent;
  }

  function syncStorms(Cesium, viewer, state, storms) {
    const keep = new Set();
    const list = Array.isArray(storms) ? storms : [];
    try { viewer.entities.suspendEvents?.(); } catch (e) {}
    for (let i = 0; i < list.length; i++) {
      const row = list[i];
      if (!row) continue;
      let ent = null;
      if (row.kind === 'cone' || row.kind === 'track' || row.kind === 'past') {
        ent = upsertStormGeomEntity(Cesium, viewer, state, row);
      } else {
        ent = upsertPointEntity(Cesium, viewer, state, row, { pixelSize: 11 });
      }
      if (ent && row.id) keep.add(row.id);
    }
    const prev = state.groups.get('storm') || new Set();
    prev.forEach((id) => { if (!keep.has(id)) removeEntity(viewer, state, id); });
    state.groups.set('storm', keep);
    try { viewer.entities.resumeEvents?.(); } catch (e) {}
  }

  function syncGpsjamLayer(Cesium, viewer, state, data, layer) {
    const showJam = layer === 'all' || layer === 'events' || layer === 'gpsjam';
    if (!showJam) { setGroupShow(state, 'gpsjam', false); return; }
    const lod = state.lastLod || 'Orbit';
    const rect = lod === 'City' ? viewRectDeg(Cesium, viewer) : null;
    const jamRows = filterGpsjamVisible(data.gpsjam, lod, rect, data.gpsjamBag);
    const key = gpsjamCamKey(Cesium, viewer, lod, rect) + ':' + jamRows.length;
    if (state.gpsjamSyncKey === key && (state.groups.get('gpsjam') || new Set()).size) {
      setGroupShow(state, 'gpsjam', true);
      return;
    }
    state.gpsjamSyncKey = key;
    const useEllipse = lod === 'City';
    syncGroup(Cesium, viewer, state, 'gpsjam', jamRows, (r) => ({
      pixelSize: r.band === 'high' ? 8 : (r.band === 'med' ? 6 : 4),
      outline: false,
      ellipseM: useEllipse && r.band !== 'low' ? GPSJAM_HEX_M : 0,
    }));
  }

  function syncAllEntities(Cesium, viewer, state, data, layer) {
    if (!viewer || !Cesium || state.destroyed) return;
    state.layer = layer;
    const showWx = layer === 'all' || layer === 'weather';
    const showEvents = layer === 'all' || layer === 'events';
    const showFlights = layer === 'all' || layer === 'flights';
    const showSats = layer === 'all' || layer === 'satellites';
    const showLaunches = layer === 'all' || layer === 'launches';
    const showDeals = layer === 'all' || layer === 'deals';
    const showShips = layer === 'all' || layer === 'ships';

    if (showWx) syncGroup(Cesium, viewer, state, 'weather', data.weather, (w) => ({
      pixelSize: 8, label: true,
    }));
    else setGroupShow(state, 'weather', false);
    ensureRadar(Cesium, viewer, state, data.radar, showWx);

    const showStorms = layer === 'all' || layer === 'weather';

    if (showEvents) syncGroup(Cesium, viewer, state, 'event', data.events, (e) => ({ pixelSize: e.pixelSize || 10 }));
    else setGroupShow(state, 'event', false);

    syncGpsjamLayer(Cesium, viewer, state, data, layer);

    if (showStorms) {
      if ((data.storms || []).length) syncStorms(Cesium, viewer, state, data.storms);
      else setGroupShow(state, 'storm', false);
    } else setGroupShow(state, 'storm', false);

    if (showFlights) {
      if ((data.flights || []).length) syncGroup(Cesium, viewer, state, 'flight', data.flights.slice(0, MAX_FLIGHT_POINTS), () => ({ pixelSize: 6 }));
      syncGroup(Cesium, viewer, state, 'military', data.milFlights || [], () => ({ pixelSize: 7 }));
    } else {
      setGroupShow(state, 'flight', false);
      setGroupShow(state, 'military', false);
    }

    if (showSats) {
      if ((data.satellites || []).length) syncGroup(Cesium, viewer, state, 'satellite', data.satellites, () => ({ pixelSize: 14 }), false);
      const cap = layer === 'satellites' ? STARLINK_MAX_FOCUS : STARLINK_MAX_ALL;
      if ((data.starlink || []).length) syncGroup(Cesium, viewer, state, 'starlink', data.starlink.slice(0, cap), () => ({ pixelSize: 3, outline: false }), false);
      if ((data.gps || []).length) syncGroup(Cesium, viewer, state, 'gps', data.gps, () => ({ pixelSize: 5 }), false);
      if ((data.wxsat || []).length) syncGroup(Cesium, viewer, state, 'wxsat', data.wxsat, () => ({ pixelSize: 6 }), false);
      if ((data.stations || []).length) syncGroup(Cesium, viewer, state, 'station', data.stations, () => ({ pixelSize: 8 }), false);
      EXTRA_TLE.forEach((g) => {
        const rows = data[g.type] || [];
        if (rows.length) syncGroup(Cesium, viewer, state, g.type, rows, () => ({ pixelSize: defaultPointSize(g.type), outline: false }), false);
      });
      ensureIssOrbit(Cesium, viewer, state, data.issTrail);
    } else {
      ['satellite', 'starlink', 'gps', 'wxsat', 'station', 'oneweb', 'geo', 'visual', 'milsat', 'kuiper'].forEach((g) => setGroupShow(state, g, false));
      if (state.issOrbitEntity) try { state.issOrbitEntity.show = false; } catch (e) {}
    }

    if (showLaunches) syncGroup(Cesium, viewer, state, 'launch', data.launches, () => ({ pixelSize: 11 }));
    else setGroupShow(state, 'launch', false);

    if (showDeals) syncDeals(Cesium, viewer, state, data.deals);
    else { setGroupShow(state, 'deal', false); setGroupShow(state, 'deal-arc', false); }

    if (showShips) {
      if ((data.ships || []).length) syncGroup(Cesium, viewer, state, 'ship', data.ships, () => ({ pixelSize: 7 }));
    } else setGroupShow(state, 'ship', false);

    if (state.selectedId) {
      const ent = state.entityById.get(state.selectedId);
      if (ent && ent.__gm2) showSelectionTrail(Cesium, viewer, state, ent.__gm2);
    }
    if (typeof state.runHorizonCull === 'function') state.runHorizonCull();
  }

  function createImageryLayers(Cesium, viewer, state) {
    try { if (viewer.imageryLayers) viewer.imageryLayers.removeAll(true); } catch (e) {}
    let esri = null;
    try {
      esri = viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        maximumLevel: 19, credit: 'Esri World Imagery',
      }));
    } catch (e) {}
    if (!esri) {
      try {
        esri = viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
          url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          maximumLevel: 19, credit: 'OpenStreetMap',
        }));
      } catch (e) {}
    }
    state.esriLayer = esri;
    try {
      const night = viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
        url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png',
        maximumLevel: 8, credit: 'NASA GIBS Black Marble',
      }));
      try { night.dayAlpha = 0; } catch (e) {}
      try { night.nightAlpha = 0.88; } catch (e) {}
      try { night.alpha = 0.42; } catch (e) {}
      state.nightLayer = night;
    } catch (e) { console.warn('[god-mode-cesium] night lights overlay failed', e); }
    try {
      const osm = viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        maximumLevel: 19, credit: 'OpenStreetMap',
      }));
      osm.alpha = 0;
      osm.show = false;
      state.osmContrast = osm;
    } catch (e) {}
    try {
      const sea = viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
        url: OPENSEAMAP_URL, maximumLevel: 18, credit: 'OpenSeaMap',
      }));
      sea.show = false;
      sea.alpha = 1;
      state.seamarkLayer = sea;
    } catch (e) { console.warn('[god-mode-cesium] OpenSeaMap seamark layer failed', e); }
    return !!esri;
  }

  function setOsmContrast(state, on) {
    if (!state.osmContrast) return;
    try {
      state.osmContrast.show = !!on;
      state.osmContrast.alpha = on ? 0.08 : 0;
    } catch (e) {}
  }

  function killSkyAtmosphere(viewer) {
    try {
      const scene = viewer && viewer.scene;
      if (!scene) return;
      try {
        if (scene.skyAtmosphere) scene.skyAtmosphere.show = false;
      } catch (e) {}
      try {
        if (scene.globe) {
          scene.globe.showGroundAtmosphere = false;
          scene.globe.atmosphereLightIntensity = 0;
        }
      } catch (e) {}
      try { if (scene.fog) scene.fog.enabled = false; } catch (e) {}
    } catch (e) {}
  }

  function configureAtmosphere(Cesium, viewer) {
    try {
      const scene = viewer.scene;
      const globe = scene.globe;
      killSkyAtmosphere(viewer);
      globe.enableLighting = true;
      try { globe.dynamicAtmosphereLighting = true; } catch (e) {}
      try { globe.dynamicAtmosphereLightingFromSun = true; } catch (e) {}
      try { globe.showGroundAtmosphere = false; } catch (e) {}
      try { globe.atmosphereLightIntensity = 0; } catch (e) {}
      try { globe.lambertDiffuseMultiplier = 1.65; } catch (e) {}
      try { globe.lightingFadeOutDistance = 6.0e7; } catch (e) {}
      try { globe.lightingFadeInDistance = 9.0e7; } catch (e) {}
      try { globe.nightFadeOutDistance = 8.0e6; } catch (e) {}
      try { globe.nightFadeInDistance = 5.5e7; } catch (e) {}
      try { globe.vertexShadowDarkness = 0.18; } catch (e) {}
      try { globe.baseColor = Cesium.Color.fromCssColorString('#0b1422'); } catch (e) {}
      if (scene.skyAtmosphere) {
        scene.skyAtmosphere.show = false;
        try { scene.skyAtmosphere.hueShift = -0.02; } catch (e) {}
        try { scene.skyAtmosphere.saturationShift = 0.08; } catch (e) {}
        try { scene.skyAtmosphere.brightnessShift = 0.04; } catch (e) {}
      }
      try {
        if (scene.atmosphere && Cesium.DynamicAtmosphereLightingType) {
          scene.atmosphere.dynamicLighting = Cesium.DynamicAtmosphereLightingType.SUNLIGHT;
        }
      } catch (e) {}
      try {
        if (Cesium.SunLight) scene.light = new Cesium.SunLight({ intensity: 1.55 });
      } catch (e) {}
      if (scene.sun) scene.sun.show = true;
      if (scene.moon) scene.moon.show = true;
      scene.fog.enabled = false;
      scene.backgroundColor = Cesium.Color.fromCssColorString('#02040a');
      try { scene.highDynamicRange = true; } catch (e) {}
    } catch (e) {}
  }

  function applyStreetClarity(Cesium, viewer, lod) {
    try {
      const scene = viewer && viewer.scene;
      if (!scene) return;
      try { scene.fog.enabled = false; } catch (e) {}
      try { if (scene.fog) scene.fog.density = 0; } catch (e) {}
      try { scene.globe.showGroundAtmosphere = false; } catch (e) {}
      try { if (scene.globe) scene.globe.atmosphereLightIntensity = 0; } catch (e) {}
      try { if (scene.skyAtmosphere) scene.skyAtmosphere.show = false; } catch (e) {}
      try { if (scene.globe) scene.globe.translucency.enabled = false; } catch (e) {}
    } catch (e) {}
  }

  function tuneGoogleTileset(tileset) {
    if (!tileset) return;
    try { tileset.maximumScreenSpaceError = 4; } catch (e) {}
    try { tileset.dynamicScreenSpaceError = true; } catch (e) {}
    try { tileset.skipLevelOfDetail = true; } catch (e) {}
    try { tileset.immediatelyLoadDesiredLevelOfDetail = false; } catch (e) {}
    try { tileset.baseScreenSpaceError = 1024; } catch (e) {}
    try { tileset.skipScreenSpaceErrorFactor = 16; } catch (e) {}
  }

  async function tryEnableGooglePhotoreal(Cesium, viewer, state) {
    const key = readGoogleTilesKey();
    if (!key) { state.googleTiles = 'missing-key'; return false; }
    const showExisting = function () {
      if (!state.googleTileset || state.googleTileset.isDestroyed?.()) return false;
      state.googleTiles = 'active';
      try { state.googleTileset.show = true; } catch (e) {}
      tuneGoogleTileset(state.googleTileset);
      setOsmContrast(state, false);
      return true;
    };
    if (showExisting()) return true;
    if (state._googleTilesPending) {
      try { await state._googleTilesPending; } catch (e) {}
      if (state.destroyed || state.lastLod !== 'City' || viewer.isDestroyed?.()) {
        disableGooglePhotoreal(state);
        return false;
      }
      return showExisting();
    }
    const pending = (async function () {
      if (Cesium.GoogleMaps) Cesium.GoogleMaps.defaultApiKey = key;
      let tileset = null;
      if (typeof Cesium.createGooglePhotorealistic3DTileset === 'function') {
        try { tileset = await Cesium.createGooglePhotorealistic3DTileset({ key: key }); }
        catch (e1) {
          try { tileset = await Cesium.createGooglePhotorealistic3DTileset(key); }
          catch (e2) { throw e1; }
        }
      } else if (Cesium.Cesium3DTileset?.fromUrl) {
        tileset = await Cesium.Cesium3DTileset.fromUrl(
          'https://tile.googleapis.com/v1/3dtiles/root.json?key=' + encodeURIComponent(key),
          { showCreditsOnScreen: true }
        );
      } else {
        tileset = new Cesium.Cesium3DTileset({
          url: 'https://tile.googleapis.com/v1/3dtiles/root.json?key=' + encodeURIComponent(key),
          showCreditsOnScreen: true,
        });
      }
      if (state.destroyed || !viewer || viewer.isDestroyed?.()) {
        try { tileset.destroy?.(); } catch (e) {}
        return false;
      }
      if (state.googleTileset && !state.googleTileset.isDestroyed?.()) {
        try { tileset.destroy?.(); } catch (e) {}
        return showExisting();
      }
      tuneGoogleTileset(tileset);
      viewer.scene.primitives.add(tileset);
      state.googleTileset = tileset;
      if (state.lastLod !== 'City') {
        try { tileset.show = false; } catch (e) {}
        state.googleTiles = 'idle';
        return false;
      }
      state.googleTiles = 'active';
      setOsmContrast(state, false);
      return true;
    })();
    state._googleTilesPending = pending;
    try {
      return await pending;
    } catch (e) {
      console.warn('[god-mode-cesium] Google Photorealistic 3D Tiles failed', e);
      state.googleTiles = 'error';
      state.googleTilesError = String(e?.message || e);
      setOsmContrast(state, true);
      return false;
    } finally {
      if (state._googleTilesPending === pending) state._googleTilesPending = null;
    }
  }

  function disableGooglePhotoreal(state) {
    if (state.googleTileset && !state.googleTileset.isDestroyed?.()) {
      try { state.googleTileset.show = false; } catch (e) {}
    }
    setOsmContrast(state, false);
  }

  function tilesChipFromState(state, lod) {
    if (lod !== 'City') return { text: 'TILES · IMAGERY', kind: '' };
    if (state.googleTiles === 'active') return { text: 'TILES · PHOTOREAL', kind: 'ok' };
    if (state.googleTiles === 'error') return { text: 'TILES · ERROR', kind: 'err' };
    if (state.googleTiles === 'missing-key') return { text: 'TILES · IMAGERY', kind: 'warn' };
    return { text: 'TILES · IMAGERY', kind: 'warn' };
  }

  function addSensorStages(Cesium, viewer, state) {
    state.sensorStages = { nvg: null, flir: null, crt: null };
    state.sensorCssOnly = false;
    const stages = viewer.scene?.postProcessStages;
    if (!stages || !Cesium.PostProcessStage) { state.sensorCssOnly = true; return; }
    const addCustom = (name, shader) => {
      try {
        const st = stages.add(new Cesium.PostProcessStage({ fragmentShader: shader, name: 'gm2-' + name }));
        st.enabled = false;
        return st;
      } catch (e) {
        console.warn('[god-mode-cesium] postprocess ' + name + ' failed', e);
        return null;
      }
    };
    try {
      if (Cesium.PostProcessStageLibrary?.createNightVisionStage) {
        const nvg = stages.add(Cesium.PostProcessStageLibrary.createNightVisionStage());
        nvg.enabled = false;
        state.sensorStages.nvg = nvg;
      }
    } catch (e) {}
    if (!state.sensorStages.nvg) state.sensorStages.nvg = addCustom('nvg', SHADER_NVG);
    state.sensorStages.flir = addCustom('flir', SHADER_FLIR);
    state.sensorStages.crt = addCustom('crt', SHADER_CRT);
    if (!state.sensorStages.nvg && !state.sensorStages.flir && !state.sensorStages.crt) state.sensorCssOnly = true;
  }

  function tuneBloomUniforms(stage) {
    if (!stage || !stage.uniforms) return;
    try { stage.uniforms.glowOnly = false; } catch (e) {}
    try { stage.uniforms.contrast = 64; } catch (e) {}
    try { stage.uniforms.brightness = -0.48; } catch (e) {}
    try { stage.uniforms.delta = 0.9; } catch (e) {}
    try { stage.uniforms.sigma = 3.0; } catch (e) {}
    try { stage.uniforms.stepSize = 1.0; } catch (e) {}
  }

  function addBloomFxaa(Cesium, viewer, state) {
    state.bloomStage = null;
    state.fxaaStage = null;
    state.bloomAdded = false;
    state.fxaaAdded = false;
    state.bloomApi = '';
    state.fxaaApi = '';
    const stages = viewer.scene && viewer.scene.postProcessStages;
    const lib = Cesium.PostProcessStageLibrary;
    if (!stages) return;
    try {
      if (stages.bloom) {
        stages.bloom.enabled = true;
        tuneBloomUniforms(stages.bloom);
        state.bloomStage = stages.bloom;
        state.bloomApi = 'postProcessStages.bloom';
      } else if (lib && typeof lib.createBloomStage === 'function') {
        const bloom = stages.add(lib.createBloomStage());
        bloom.enabled = true;
        tuneBloomUniforms(bloom);
        state.bloomStage = bloom;
        state.bloomAdded = true;
        state.bloomApi = 'PostProcessStageLibrary.createBloomStage';
      }
    } catch (e) {
      console.warn('[god-mode-cesium] bloom stage failed', e);
    }
    try {
      if (stages.fxaa) {
        stages.fxaa.enabled = true;
        state.fxaaStage = stages.fxaa;
        state.fxaaApi = 'postProcessStages.fxaa';
      } else if (Object.prototype.hasOwnProperty.call(stages, 'fxaaEnabled') || typeof stages.fxaaEnabled !== 'undefined') {
        stages.fxaaEnabled = true;
        state.fxaaApi = 'postProcessStages.fxaaEnabled';
      } else if (lib && typeof lib.createFXAAStage === 'function') {
        const fxaa = stages.add(lib.createFXAAStage());
        fxaa.enabled = true;
        state.fxaaStage = fxaa;
        state.fxaaAdded = true;
        state.fxaaApi = 'PostProcessStageLibrary.createFXAAStage';
      }
    } catch (e) {
      try { stages.fxaaEnabled = true; state.fxaaApi = 'postProcessStages.fxaaEnabled'; } catch (e2) {}
    }
  }

  function applySensorSkin(state, skin) {
    const stages = state.sensorStages || {};
    Object.keys(stages).forEach((k) => {
      if (k === 'bloom' || k === 'fxaa') return;
      if (stages[k]) {
        try { stages[k].enabled = (k === skin); } catch (e) {}
      }
    });
    if (state.bloomStage) {
      try { state.bloomStage.enabled = true; } catch (e) {}
    }
    if (state.fxaaStage) {
      try { state.fxaaStage.enabled = true; } catch (e) {}
    }
  }

  function applyClock(Cesium, viewer, mode, speed) {
    if (!viewer?.clock) return;
    const clock = viewer.clock;
    try { clock.clockRange = Cesium.ClockRange.UNBOUNDED; } catch (e) {}
    if (mode === 'live') {
      try { clock.clockStep = Cesium.ClockStep.SYSTEM_CLOCK; } catch (e) {}
      clock.shouldAnimate = true;
      clock.multiplier = 1;
      try { clock.currentTime = Cesium.JulianDate.now(); } catch (e) {}
    } else if (mode === 'paused') {
      try { clock.clockStep = Cesium.ClockStep.SYSTEM_CLOCK_MULTIPLIER; } catch (e) {}
      clock.shouldAnimate = false;
    } else {
      try { clock.clockStep = Cesium.ClockStep.SYSTEM_CLOCK_MULTIPLIER; } catch (e) {}
      clock.shouldAnimate = true;
      clock.multiplier = Number(speed) || 1;
    }
  }


  function enterStreetView(Cesium, viewer, state, lat, lng) {
    const a = Number(lat);
    const b = Number(lng);
    if (!Cesium || !viewer || !Number.isFinite(a) || !Number.isFinite(b)) return false;
    try {
      state._streetPrev = viewer.camera.position.clone();
      state._streetMode = true;
    } catch (e) {}
    try { state.lastLod = 'City'; } catch (e) {}
    try { viewer.scene.screenSpaceCameraController.minimumZoomDistance = 80; } catch (e) {}
    try { if (viewer.scene.fog) { viewer.scene.fog.enabled = false; viewer.scene.fog.density = 0; } } catch (e) {}
    try { if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false; } catch (e) {}
    try {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(b, a, 160),
        orientation: { heading: 0, pitch: Cesium.Math.toRadians(-38), roll: 0 },
        duration: 1.55,
        complete: function () {
          tryEnableGooglePhotoreal(Cesium, viewer, state);
          applyStreetClarity(Cesium, viewer, 'City');
        },
      });
    } catch (e) {}
    tryEnableGooglePhotoreal(Cesium, viewer, state);
    applyStreetClarity(Cesium, viewer, 'City');
    return true;
  }

  function exitStreetView(Cesium, viewer, state) {
    if (!viewer || !state) return;
    const prev = state._streetPrev;
    state._streetMode = false;
    state._streetPrev = null;
    if (prev && Cesium) {
      try { viewer.camera.flyTo({ destination: prev, duration: 1.25 }); } catch (e) {}
    }
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
      const geo = await geocodeDealCity(city, {});
      if (geo) return { lat: geo.lat, lng: geo.lng, name: geo.name || q };
    } catch (e) {}
    return null;
  }

  function flyToEntity(Cesium, viewer, row) {
    if (!viewer || !row) return;
    const lat = Number(row.lat);
    const lng = Number(row.lng);
    if (!validLatLng(lat, lng)) return;
    const alt = Number(row.altM);
    const range = isSatType(row.type) ? 2.2e6
      : ((row.type === 'flight' || row.type === 'military') ? 2.5e5 : (row.type === 'ship' ? 1.2e5 : 4.5e5));
    try {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lng, lat, (Number.isFinite(alt) ? alt : 0) + range),
        duration: 1.35,
      });
    } catch (e) {}
  }

  function lerpFollow(Cesium, viewer, state) {
    if (!state.follow || !state.selectedId || !viewer) return;
    const ent = state.entityById.get(state.selectedId);
    if (!ent || isDestroyedEnt(ent)) return;
    let pos = null;
    try {
      pos = ent.position?.getValue ? ent.position.getValue(viewer.clock.currentTime) : ent.position;
    } catch (e) { return; }
    if (!cartesianFinite(Cesium, pos)) return;
    try {
      const carto = Cesium.Cartographic.fromCartesian(pos);
      if (!carto) return;
      const cam = viewer.camera.positionCartographic;
      if (!cam) return;
      if (state._followId !== state.selectedId) {
        state._followId = state.selectedId;
        state._followLast = Cesium.Cartesian3.clone(pos);
        return;
      }
      const dest = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, cam.height);
      const cur = viewer.camera.position;
      Cesium.Cartesian3.lerp(cur, dest, 0.045, cur);
      viewer.camera.position = cur;
      state._followLast = Cesium.Cartesian3.clone(pos);
    } catch (e) {}
  }

  function fmtUtcClock(d) {
    try { return d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC'); }
    catch (e) { return '—'; }
  }

  function fmtCoord(lat, lng) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
    const ns = lat >= 0 ? 'N' : 'S';
    const ew = lng >= 0 ? 'E' : 'W';
    return Math.abs(lat).toFixed(3) + '°' + ns + '  ' + Math.abs(lng).toFixed(3) + '°' + ew;
  }

  function cheatKeyRows() {
    const rows = [['Esc', 'close'], ['1–9', 'layers']];
    SKINS.forEach((s) => { if (s.key) rows.push([s.key, s.label]); });
    rows.push(['V', 'cycle skin'], ['Space', 'pause / live'], ['?', 'this overlay']);
    return rows;
  }

  function inspectorFields(row) {
    if (!row) return null;
    const type = String(row.type || 'entity').toUpperCase();
    const name = String(row.name || row.label || row.callsign || row.mmsi || row.satnum || 'Entity');
    const coord = fmtCoord(Number(row.lat), Number(row.lng));
    const bits = [];
    if (row.altitudeFt != null && Number.isFinite(Number(row.altitudeFt))) {
      bits.push(Math.round(Number(row.altitudeFt)).toLocaleString() + ' ft');
    } else if (Number.isFinite(row.altM) && row.altM > 50) {
      bits.push((row.altM >= 10000 ? Math.round(row.altM / 1000) : (row.altM / 1000).toFixed(1)) + ' km');
    }
    if (row.speedKts != null && Number.isFinite(Number(row.speedKts))) bits.push(Math.round(Number(row.speedKts)) + ' kts');
    else if (row.sog != null && Number.isFinite(Number(row.sog))) bits.push(Number(row.sog).toFixed(1) + ' kn');
    let hdg = null;
    if (row.heading != null && Number.isFinite(Number(row.heading))) hdg = Number(row.heading);
    else if (row.cog != null && Number.isFinite(Number(row.cog))) hdg = Number(row.cog);
    if (hdg != null) {
      const d = ((Math.round(hdg) % 360) + 360) % 360;
      bits.push(String(d).padStart(3, '0') + '°');
    }
    return { type, name, coord, kin: bits.join('  ·  '), source: String(row.source || '').trim() };
  }

  function destroyViewer(state) {
    stopRadarAnim(state);
    try { if (state._aliveTimer) { global.clearTimeout(state._aliveTimer); state._aliveTimer = null; } } catch (e) {}
    try { if (state._roadAbort) { state._roadAbort.abort(); state._roadAbort = null; } } catch (e) {}
    try { if (state._eezAbort) { state._eezAbort.abort(); state._eezAbort = null; } } catch (e) {}
    try { state._roadGen = (state._roadGen || 0) + 1; } catch (e) {}
    try { state._eezGen = (state._eezGen || 0) + 1; } catch (e) {}
    try { if (state._onWheelFollow && state.viewer?.scene?.canvas) state.viewer.scene.canvas.removeEventListener('wheel', state._onWheelFollow); } catch (e) {}
    try { state.roadEntities = clearDecorEntities(state.viewer, state.roadEntities); } catch (e) {}
    try { state.eezEntities = clearDecorEntities(state.viewer, state.eezEntities); } catch (e) {}
    try { if (state.horizonCullRemove) state.horizonCullRemove(); } catch (e) {}
    try { if (state.aisWs) { state.aisWs.close(); state.aisWs = null; } } catch (e) {}
    try { stopAisstream(); } catch (e) {}
    try {
      if (state.googleTileset && !state.googleTileset.isDestroyed?.()) {
        try { state.viewer?.scene?.primitives?.remove(state.googleTileset); } catch (e) {}
        try { state.googleTileset.destroy?.(); } catch (e) {}
      }
    } catch (e) {}
    state.googleTileset = null;
    try {
      const stages = state.sensorStages || {};
      Object.keys(stages).forEach((k) => {
        try { state.viewer?.scene?.postProcessStages?.remove(stages[k]); } catch (e) {}
      });
    } catch (e) {}
    state.sensorStages = {};
    try {
      if (state.bloomAdded && state.bloomStage) state.viewer?.scene?.postProcessStages?.remove(state.bloomStage);
      else if (state.bloomStage) state.bloomStage.enabled = false;
    } catch (e) {}
    try {
      if (state.fxaaAdded && state.fxaaStage) state.viewer?.scene?.postProcessStages?.remove(state.fxaaStage);
      else if (state.fxaaStage) state.fxaaStage.enabled = false;
    } catch (e) {}
    state.bloomStage = null;
    state.fxaaStage = null;
    try { if (state.viewer && !state.viewer.isDestroyed?.()) state.viewer.destroy(); } catch (e) {}
    state.viewer = null;
    state.entityById = new Map();
    state.groups = new Map();
    state.handler = null;
    state.trailEntity = null;
    state.selOrbitEntity = null;
    state.issOrbitEntity = null;
    state.radarLayer = null;
    state.nightLayer = null;
    state.seamarkLayer = null;
    state.osmContrast = null;
    state.esriLayer = null;
    state.cityLabels = false;
    state._onMoveEnd = null;
    state._onTick = null;
    state._onWheelFollow = null;
    state.roadBboxKey = '';
    state.eezBboxKey = '';
    state.gpsjamSyncKey = '';
    state.googleTiles = 'idle';
    state._googleTilesPending = null;
  }

  function V4GodModeEarth(props) {
    const open = !!props.open;
    const activeLayer = String(props.layer || 'all');
    const viewerProp = props.viewer || {};
    const onClose = props.onClose;
    const onLayerChange = props.onLayerChange;

    const stageRef = React.useRef(null);
    const stateRef = React.useRef({
      viewer: null, entityById: new Map(), groups: new Map(),
      trailEntity: null, selOrbitEntity: null, issOrbitEntity: null,
      radarLayer: null, radarUrl: '', radarTimer: null, googleTileset: null, googleTiles: 'idle', googleTilesError: '',
      handler: null, lastLod: 'Orbit', destroyed: false, _onMoveEnd: null, _onTick: null,
      sensorStages: {}, selectedId: '', follow: false, layer: 'all',
      esriLayer: null, nightLayer: null, osmContrast: null, seamarkLayer: null, aisWs: null, data: null,
      gpsjamSyncKey: '', runHorizonCull: null,
      roadEntities: [], roadBboxKey: '', roadCache: null, eezEntities: [], eezBboxKey: '',
      _aliveTimer: null, _roadGen: 0, _eezGen: 0, _followId: '', _onWheelFollow: null,
      _bootGen: 0, _roadAbort: null, _eezAbort: null, _googleTilesPending: null,
    });
    const dataRef = React.useRef({
      weather: [], flights: [], milFlights: [], satellites: [], starlink: [], gps: [], wxsat: [], stations: [],
      oneweb: [], geo: [], visual: [], milsat: [], kuiper: [],
      launches: [], launchList: [], events: [], deals: [], ships: [], issTrail: [], radar: null,
      gpsjam: [], gpsjamBag: null, gpsjamDate: '', gpsjamAttribution: '', storms: [],
      shipSource: '', shipError: '',
    });
    const layerRef = React.useRef(activeLayer);
    const viewerPropRef = React.useRef(viewerProp);
    const clockRef = React.useRef({ mode: 'live', speed: 1 });
    const followRef = React.useRef(false);
    const keysOpenRef = React.useRef(false);
    const skinRef = React.useRef('eo');
    const lastSatPropRef = React.useRef(0);

    React.useEffect(() => { viewerPropRef.current = viewerProp; }, [viewerProp]);

    const [layer, setLayer] = React.useState(activeLayer);
    const [ready, setReady] = React.useState(false);
    const [bootError, setBootError] = React.useState('');
    const [feedsLoading, setFeedsLoading] = React.useState(false);
    const [firstPaint, setFirstPaint] = React.useState(false);
    const [errors, setErrors] = React.useState({});
    const [utc, setUtc] = React.useState(() => fmtUtcClock(new Date()));
    const [lod, setLod] = React.useState('Orbit');
    const [tilesChip, setTilesChip] = React.useState({ text: 'TILES · IMAGERY', kind: '' });
    const [selected, setSelected] = React.useState(null);
    const [follow, setFollow] = React.useState(false);
    const [keysOpen, setKeysOpen] = React.useState(false);
    const [skin, setSkin] = React.useState('eo');
    const [clockMode, setClockMode] = React.useState('live');
    const [clockSpeed, setClockSpeed] = React.useState(1);
    const [stats, setStats] = React.useState({
      flights: 0, sats: 0, launches: 0, events: 0, weather: 0, deals: 0, ships: 0,
    });
    const [shipHud, setShipHud] = React.useState('');
    const [jamHud, setJamHud] = React.useState('');
    const [milHud, setMilHud] = React.useState('MIL · 0');
    const [satHud, setSatHud] = React.useState('');
    const [searchQ, setSearchQ] = React.useState('');
    const [searchMsg, setSearchMsg] = React.useState('');
    const [searching, setSearching] = React.useState(false);
    const [streetMode, setStreetMode] = React.useState(false);

    React.useEffect(() => { setLayer(activeLayer); layerRef.current = activeLayer; }, [activeLayer]);
    React.useEffect(() => { injectStyles(); }, []);
    React.useEffect(() => { followRef.current = follow; stateRef.current.follow = follow; }, [follow]);
    React.useEffect(() => { keysOpenRef.current = keysOpen; }, [keysOpen]);
    React.useEffect(() => { if (!open) setKeysOpen(false); }, [open]);
    React.useEffect(() => { skinRef.current = skin; }, [skin]);
    React.useEffect(() => { clockRef.current = { mode: clockMode, speed: clockSpeed }; }, [clockMode, clockSpeed]);

    React.useEffect(() => {
      if (!open) { document.body.classList.remove('v4-godmode-open'); return undefined; }
      document.body.classList.add('v4-godmode-open');
      return () => document.body.classList.remove('v4-godmode-open');
    }, [open]);

    const pickLayer = React.useCallback((id) => {
      setLayer(id);
      layerRef.current = id;
      onLayerChange?.(id);
    }, [onLayerChange]);

    const flySearchHit = React.useCallback((hit) => {
      const Cesium = global.Cesium;
      const viewer = stateRef.current.viewer;
      if (!Cesium || !viewer || !hit) return;
      try {
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(hit.lng, hit.lat, 12000),
          duration: 1.4,
        });
      } catch (e) {}
    }, []);

    const runSearch = React.useCallback(async () => {
      const q = String(searchQ || '').trim();
      if (!q || searching) return;
      setSearching(true);
      setSearchMsg('Searching…');
      try {
        const hit = await geocodeAddress(q);
        if (!hit) { setSearchMsg('No match'); return; }
        setSearchMsg(hit.name || q);
        flySearchHit(hit);
      } catch (e) {
        setSearchMsg('Search failed');
      } finally {
        setSearching(false);
      }
    }, [searchQ, searching, flySearchHit]);

    const goStreetView = React.useCallback(() => {
      const Cesium = global.Cesium;
      const state = stateRef.current;
      const viewer = state.viewer;
      let lat = null, lng = null;
      const row = selected;
      if (row && Number.isFinite(Number(row.lat))) {
        lat = Number(row.lat); lng = Number(row.lng);
      } else {
        try {
          const carto = viewer && viewer.camera && viewer.camera.positionCartographic;
          if (Cesium && carto) {
            lat = Cesium.Math.toDegrees(carto.latitude);
            lng = Cesium.Math.toDegrees(carto.longitude);
          }
        } catch (e) {}
      }
      if (enterStreetView(Cesium, viewer, state, lat, lng)) setStreetMode(true);
    }, [selected]);
    const leaveStreetViewHud = React.useCallback(() => {
      exitStreetView(global.Cesium, stateRef.current.viewer, stateRef.current);
      setStreetMode(false);
    }, []);

    const setSkinAndApply = React.useCallback((id) => {
      setSkin(id);
      applySensorSkin(stateRef.current, id);
    }, []);

    React.useEffect(() => {
      if (!open) return undefined;
      const onKey = (e) => {
        const tag = String(e.target?.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.key === '?') {
          e.preventDefault();
          setKeysOpen((v) => !v);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          if (keysOpenRef.current) { setKeysOpen(false); return; }
          if (stateRef.current.selectedId) {
            setSelected(null);
            setFollow(false);
            const C = global.Cesium;
            const st = stateRef.current;
            highlightSelected(st, '');
            if (C && st.viewer) showSelectionTrail(C, st.viewer, st, null);
            return;
          }
          onClose?.();
          return;
        }
        if (e.code === 'Space') {
          e.preventDefault();
          setClockMode((m) => m === 'paused' ? 'live' : 'paused');
          return;
        }
        const layerHit = LAYERS.find((row) => row.key === e.key);
        if (layerHit) { e.preventDefault(); pickLayer(layerHit.id); return; }
        const k = e.key.toLowerCase();
        const skinHit = SKINS.find((row) => String(row.key || '').toLowerCase() === k);
        if (skinHit) { e.preventDefault(); setSkinAndApply(skinHit.id); return; }
        if (k === 'v') {
          e.preventDefault();
          const order = SKINS.map((row) => row.id);
          const next = order[(order.indexOf(skinRef.current) + 1) % order.length];
          setSkinAndApply(next);
        }
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose, pickLayer, setSkinAndApply]);

    const paint = React.useCallback(() => {
      const state = stateRef.current;
      const Cesium = global.Cesium;
      if (!state.viewer || !Cesium || state.destroyed) return;
      syncAllEntities(Cesium, state.viewer, state, dataRef.current, layerRef.current);
    }, []);

    const refreshStats = React.useCallback(() => {
      const d = dataRef.current;
      const satTotal = d.satellites.length + d.starlink.length + d.gps.length + d.wxsat.length + d.stations.length
        + (d.oneweb || []).length + (d.geo || []).length + (d.visual || []).length + (d.milsat || []).length + (d.kuiper || []).length;
      setStats({
        flights: d.flights.length + (d.milFlights || []).length,
        sats: satTotal,
        launches: d.launches.length,
        events: d.events.length,
        weather: d.weather.length,
        deals: d.deals.length,
        ships: d.ships.length,
      });
      const bits = [];
      const add = (k, n) => { if (n) bits.push(k + ' ' + n); };
      add('ISS', d.satellites.length);
      add('SL', d.starlink.length);
      add('GPS', d.gps.length);
      add('WX', d.wxsat.length);
      add('STN', d.stations.length);
      add('OW', (d.oneweb || []).length);
      add('GEO', (d.geo || []).length);
      add('VIS', (d.visual || []).length);
      add('MIL', (d.milsat || []).length);
      add('KP', (d.kuiper || []).length);
      setSatHud(bits.length ? ('SAT · ' + bits.join(' · ')) : 'SAT · 0');
      if (d.gpsjamDate) setJamHud('GPSJAM · ' + d.gpsjamDate);
    }, []);

    React.useEffect(() => {
      if (!open) return undefined;
      let cancelled = false;
      const state = stateRef.current;
      const bootGen = (state._bootGen = (state._bootGen || 0) + 1);
      state.destroyed = false;

      (async () => {
        setBootError('');
        setReady(false);
        setFirstPaint(false);
        let viewer = null;
        try {
          const Cesium = await ensureCesium();
          if (cancelled || bootGen !== state._bootGen || !stageRef.current) return;
          try { if (Cesium.Ion && !Cesium.Ion.defaultAccessToken) Cesium.Ion.defaultAccessToken = ''; } catch (e) {}
          try { if (!global.UNALIGNED_GOOGLE_MAPS_TILES_KEY) global.UNALIGNED_GOOGLE_MAPS_TILES_KEY = readGoogleTilesKey(); } catch (e) {}

          const container = stageRef.current;
          container.innerHTML = '';
          const cesiumDiv = document.createElement('div');
          cesiumDiv.className = 'v4-gm2-cesium';
          container.appendChild(cesiumDiv);

          const viewerOpts = {
            animation: false, timeline: false, baseLayerPicker: false,
            fullscreenButton: false, vrButton: false, geocoder: false,
            homeButton: false, infoBox: false, sceneModePicker: false,
            selectionIndicator: false, navigationHelpButton: false,
            creditContainer: document.createElement('div'),
            terrainProvider: new Cesium.EllipsoidTerrainProvider(),
            shouldAnimate: true,
            skyAtmosphere: false,
            useDefaultRenderLoop: false,
          };
          try { viewerOpts.baseLayer = false; } catch (e) {}
          try { viewerOpts.imageryProvider = false; } catch (e) {}

          try {
            viewer = new Cesium.Viewer(cesiumDiv, viewerOpts);
          } catch (e) {
            delete viewerOpts.baseLayer;
            delete viewerOpts.imageryProvider;
            viewer = new Cesium.Viewer(cesiumDiv, viewerOpts);
          }
          if (cancelled || bootGen !== state._bootGen || state.destroyed) {
            try { if (viewer && !viewer.isDestroyed?.()) viewer.destroy(); } catch (e2) {}
            return;
          }

          try { killSkyAtmosphere(viewer); } catch (e) {}
          try { viewer.useDefaultRenderLoop = false; } catch (e) {}
          state.viewer = viewer;
          state.entityById = new Map();
          state.groups = new Map();
          createImageryLayers(Cesium, viewer, state);
          configureAtmosphere(Cesium, viewer);
          try { viewer.useDefaultRenderLoop = true; } catch (e) {}
          ensureCityLabels(Cesium, viewer, state);
          addSensorStages(Cesium, viewer, state);
          addBloomFxaa(Cesium, viewer, state);
          applySensorSkin(state, skinRef.current);
          applyClock(Cesium, viewer, clockRef.current.mode, clockRef.current.speed);
          try {
            viewer.scene.globe.depthTestAgainstTerrain = true;
            viewer.scene.screenSpaceCameraController.minimumZoomDistance = 80;
            viewer.scene.screenSpaceCameraController.maximumZoomDistance = 4.5e7;
          } catch (e) {}
          attachHorizonCull(Cesium, viewer, state);

          const vLat = Number(viewerPropRef.current.lat);
          const vLng = Number(viewerPropRef.current.lng ?? viewerPropRef.current.lon);
          const destLat = Number.isFinite(vLat) ? vLat : 20;
          const destLng = Number.isFinite(vLng) ? vLng : -30;
          viewer.camera.setView({
            destination: Cesium.Cartesian3.fromDegrees(destLng, destLat, 1.8e7),
          });

          const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
          handler.setInputAction((click) => {
            const picked = viewer.scene.pick(click.position);
            let row = null;
            if (Cesium.defined(picked) && picked.id && !picked.id.__gm2Decor) {
              row = picked.id.__gm2 || null;
              if (!row && picked.id.description) {
                try { row = JSON.parse(picked.id.description.getValue?.(viewer.clock.currentTime) || picked.id.description); }
                catch (e) {}
              }
            }
            if (row && row.type) {
              highlightSelected(state, row.id);
              setSelected(row);
              showSelectionTrail(Cesium, viewer, state, row);
            }
          }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
          const stopFollow = function () {
            if (!followRef.current && !state.follow) return;
            followRef.current = false;
            state.follow = false;
            state._followId = '';
            setFollow(false);
          };
          try { handler.setInputAction(stopFollow, Cesium.ScreenSpaceEventType.WHEEL); } catch (e) {}
          try {
            const canvas = viewer.scene.canvas;
            canvas.addEventListener('wheel', stopFollow, { passive: true });
            state._onWheelFollow = stopFollow;
          } catch (e) {}
          state.handler = handler;

          const onMoveEnd = async () => {
            try {
              if (state.destroyed || bootGen !== state._bootGen || !viewer || viewer.isDestroyed?.()) return;
              const h = viewer.camera.positionCartographic?.height;
              const band = lodFromHeight(h);
              const prevLod = state.lastLod;
              state.lastLod = band;
              setLod(band);
              applyStreetClarity(Cesium, viewer, band);
              syncNightLights(state, band);
              syncSeamark(state, band);
              ensureRadar(Cesium, viewer, state, dataRef.current.radar, layerRef.current === 'all' || layerRef.current === 'weather');
              applyStarlinkLod(Cesium, viewer, state, layerRef.current, band);
              syncGpsjamLayer(Cesium, viewer, state, dataRef.current, layerRef.current);
              if (typeof state.runHorizonCull === 'function') state.runHorizonCull();
              if (band !== prevLod) {
                if (band === 'City') {
                  const ok = await tryEnableGooglePhotoreal(Cesium, viewer, state);
                  if (state.destroyed || bootGen !== state._bootGen || viewer.isDestroyed?.()) return;
                  if (state.lastLod !== 'City') {
                    disableGooglePhotoreal(state);
                  } else if (!ok && state.googleTiles !== 'active') {
                    setOsmContrast(state, true);
                  }
                } else {
                  disableGooglePhotoreal(state);
                }
                setTilesChip(tilesChipFromState(state, band));
                refreshCityLabels(Cesium, state, band, layerRef.current);
              } else {
                setTilesChip(tilesChipFromState(state, band));
              }
              scheduleCityAlive(Cesium, viewer, state);
            } catch (e) {}
          };
          viewer.camera.moveEnd.addEventListener(onMoveEnd);
          state._onMoveEnd = onMoveEnd;
          onMoveEnd();

          const onTick = () => {
            if (state.destroyed || !viewer || viewer.isDestroyed?.()) return;
            const mode = clockRef.current.mode;
            try {
              if (mode === 'live') {
                const now = Cesium.JulianDate.now();
                if (Math.abs(Cesium.JulianDate.secondsDifference(viewer.clock.currentTime, now)) > 1.2) {
                  viewer.clock.currentTime = now;
                }
              }
              const tDate = Cesium.JulianDate.toDate(viewer.clock.currentTime);
              if (tDate && Number.isFinite(tDate.getTime())) {
                const ms = Date.now();
                if (ms - (state._utcPush || 0) > 1000) {
                  state._utcPush = ms;
                  setUtc(fmtUtcClock(tDate));
                }
                const interval = mode === 'live' ? SAT_LIVE_MS : SAT_WARP_MS;
                if (ms - lastSatPropRef.current >= interval) {
                  lastSatPropRef.current = ms;
                  if (tleStore.starlinkSubset || tleStore.gps || tleStore.weather || tleStore.stations || tleStore.oneweb) {
                    const bag = propagateAllSats(tDate);
                    applySatBag(dataRef.current, bag);
                    const iss = issFromSgp4(tDate);
                    if (iss) dataRef.current.satellites = [iss];
                    const showSats = layerRef.current === 'all' || layerRef.current === 'satellites';
                    if (showSats) {
                      syncSatEntities(Cesium, viewer, state, bag, layerRef.current);
                      if (iss) syncGroup(Cesium, viewer, state, 'satellite', [iss], () => ({ pixelSize: 14 }), false);
                      applyStarlinkLod(Cesium, viewer, state, layerRef.current, state.lastLod || 'Orbit');
                      if (typeof state.runHorizonCull === 'function') state.runHorizonCull();
                    }
                    if (state.selectedId && followRef.current) {
                      const ent = state.entityById.get(state.selectedId);
                      if (ent && ent.__gm2) showSelectionTrail(Cesium, viewer, state, ent.__gm2);
                    }
                  }
                }
              }
            } catch (e) {}
            if (followRef.current) lerpFollow(Cesium, viewer, state);
          };
          viewer.clock.onTick.addEventListener(onTick);
          state._onTick = onTick;

          if (!cancelled && bootGen === state._bootGen && !state.destroyed) setReady(true);
          else {
            try { if (viewer && !viewer.isDestroyed?.()) viewer.destroy(); } catch (e2) {}
            if (state.viewer === viewer) state.viewer = null;
          }
        } catch (e) {
          console.error('[god-mode-cesium] boot failed', e);
          if (!cancelled && bootGen === state._bootGen) setBootError(String(e?.message || e || 'Cesium boot failed'));
          try { if (viewer && !viewer.isDestroyed?.()) viewer.destroy(); } catch (e2) {}
          if (state.viewer === viewer) state.viewer = null;
        }
      })();

      return () => {
        cancelled = true;
        state.destroyed = true;
        state._bootGen = (state._bootGen || 0) + 1;
        try { if (state.handler) state.handler.destroy(); } catch (e) {}
        try {
          if (state.viewer && state._onMoveEnd) state.viewer.camera.moveEnd.removeEventListener(state._onMoveEnd);
        } catch (e) {}
        try {
          if (state.viewer && state._onTick) state.viewer.clock.onTick.removeEventListener(state._onTick);
        } catch (e) {}
        destroyViewer(state);
        if (stageRef.current) stageRef.current.innerHTML = '';
      };
    }, [open]);

    React.useEffect(() => {
      if (!open || !ready) return undefined;
      let cancelled = false;
      const errorsLocal = {};

      async function loadFeed(key, fetcher, onSuccess) {
        try {
          const v = await fetcher();
          if (!cancelled) onSuccess(v);
        } catch (e) {
          console.warn('[god-mode-cesium] feed ' + key + ' failed', e);
        }
      }

      (async () => {
        setFeedsLoading(true);
        await Promise.all([
          loadFeed('weather', fetchWeatherGrid, (v) => { dataRef.current.weather = v; }),
          loadFeed('flights', fetchFlights, (v) => { dataRef.current.flights = v; }),
          loadFeed('milFlights', fetchMilFlights, (v) => {
            dataRef.current.milFlights = v || [];
            setMilHud(v && v.length ? ('MIL · ' + v.length) : 'MIL · 0');
          }),
          loadFeed('ships', fetchShips, (v) => {
            dataRef.current.ships = v.rows || [];
            dataRef.current.shipSource = v.source || '';
            dataRef.current.shipError = v.error || (v.rows?.length ? '' : 'AIS empty');
            setShipHud((() => {
              const n = (v.rows || []).length;
              const src = String(v.source || '');
              const cov = /baltic|digitraffic/i.test(src) ? 'BALTIC' : (src ? src.slice(0, 18) : 'AIS');
              return n ? (cov + ' · ' + n) : (cov + ' · 0');
            })());
          }),
          loadFeed('tle', ensureAllTles, () => {
            const bag = propagateAllSats(new Date());
            applySatBag(dataRef.current, bag);
            const iss = issFromSgp4(new Date());
            if (iss) dataRef.current.satellites = [iss];
          }),
          loadFeed('satellites', fetchIssLive, (v) => {
            if (!dataRef.current.satellites.length && v?.length) dataRef.current.satellites = v;
          }),
          loadFeed('launches', fetchLaunches, (v) => {
            dataRef.current.launches = v.markers || [];
            dataRef.current.launchList = v.list || [];
          }),
          loadFeed('events', fetchEarthEvents, (v) => { dataRef.current.events = v; }),
          loadFeed('gpsjam', fetchGpsjam, (v) => {
            dataRef.current.gpsjam = v.rows || [];
            dataRef.current.gpsjamBag = { high: v.high || [], med: v.med || [], low: v.low || [] };
            dataRef.current.gpsjamDate = v.date || '';
            dataRef.current.gpsjamAttribution = v.attribution || '';
            setJamHud(v.date ? ('GPSJAM · ' + v.date) : 'GPSJAM · NONE');
          }),
          loadFeed('storms', fetchNhcStorms, (v) => { dataRef.current.storms = v || []; }),
          loadFeed('deals', () => fetchDealMarkers(viewerPropRef.current), (v) => { dataRef.current.deals = v.points || []; }),
          loadFeed('issTrail', fetchIssTrail, (v) => { dataRef.current.issTrail = v; }),
          loadFeed('radar', fetchRadarMeta, (v) => { dataRef.current.radar = v; }),
        ]);
        if (cancelled) return;
        setErrors(errorsLocal);
        refreshStats();
        setFeedsLoading(false);
        paint();
        setFirstPaint(true);
      })();

      const flightTimer = window.setInterval(async () => {
        if (cancelled || clockRef.current.mode !== 'live') return;
        try {
          dataRef.current.flights = await fetchFlights();
          const Cesium = global.Cesium;
          const st = stateRef.current;
          if (Cesium && st.viewer && (layerRef.current === 'all' || layerRef.current === 'flights')) {
            syncGroup(Cesium, st.viewer, st, 'flight', dataRef.current.flights.slice(0, MAX_FLIGHT_POINTS), () => ({ pixelSize: 6 }));
          }
          refreshStats();
        } catch (e) {}
      }, FLIGHT_POLL_MS);

      const milTimer = window.setInterval(async () => {
        if (cancelled || clockRef.current.mode !== 'live') return;
        try {
          const mil = await fetchMilFlights();
          dataRef.current.milFlights = mil;
          setMilHud(mil.length ? ('MIL · ' + mil.length) : 'MIL · 0');
          const Cesium = global.Cesium;
          const st = stateRef.current;
          if (Cesium && st.viewer && (layerRef.current === 'all' || layerRef.current === 'flights')) {
            syncGroup(Cesium, st.viewer, st, 'military', mil, () => ({ pixelSize: 7 }));
            if (typeof st.runHorizonCull === 'function') st.runHorizonCull();
          }
          refreshStats();
        } catch (e) {}
      }, MIL_POLL_MS);

      const shipTimer = window.setInterval(async () => {
        if (cancelled || clockRef.current.mode !== 'live') return;
        try {
          const v = await fetchShips();
          dataRef.current.ships = v.rows || [];
          dataRef.current.shipSource = v.source || '';
          dataRef.current.shipError = v.error || '';
          setShipHud((() => {
            const n = (v.rows || []).length;
            const src = String(v.source || '');
            const cov = /baltic|digitraffic/i.test(src) ? 'BALTIC' : (src ? src.slice(0, 18) : 'AIS');
            return n ? (cov + ' · ' + n) : (cov + ' · 0');
          })());
          const Cesium = global.Cesium;
          const st = stateRef.current;
          if (Cesium && st.viewer && (layerRef.current === 'all' || layerRef.current === 'ships')) {
            syncGroup(Cesium, st.viewer, st, 'ship', dataRef.current.ships, () => ({ pixelSize: 7 }));
          }
          refreshStats();
        } catch (e) {}
      }, SHIP_POLL_MS);

      const issTimer = window.setInterval(async () => {
        if (cancelled || clockRef.current.mode !== 'live') return;
        try {
          if (!findIssRec()) {
            const sats = await fetchIssLive();
            if (sats.length) dataRef.current.satellites = sats;
          }
        } catch (e) {}
      }, 20000);

      const quakeTimer = window.setInterval(async () => {
        if (cancelled) return;
        try {
          const v = await fetchEarthEvents();
          dataRef.current.events = v;
          const Cesium = global.Cesium;
          const st = stateRef.current;
          if (Cesium && st.viewer && (layerRef.current === 'all' || layerRef.current === 'events')) {
            syncGroup(Cesium, st.viewer, st, 'event', v, (e) => ({ pixelSize: e.pixelSize || 10 }));
          }
          refreshStats();
        } catch (e) {}
      }, USGS_POLL_MS);

      return () => {
        cancelled = true;
        window.clearInterval(flightTimer);
        window.clearInterval(milTimer);
        window.clearInterval(shipTimer);
        window.clearInterval(issTimer);
        window.clearInterval(quakeTimer);
      };
    }, [open, ready, paint, refreshStats]);

    React.useEffect(() => {
      layerRef.current = layer;
      const state = stateRef.current;
      state.layer = layer;
      if (!ready || !state.viewer) return;
      applyLayerVisibility(state, layer);
      paint();
      refreshCityLabels(global.Cesium, state, state.lastLod || lod, layer);
    }, [layer, ready, paint, lod]);

    React.useEffect(() => {
      const Cesium = global.Cesium;
      const st = stateRef.current;
      if (!ready || !Cesium || !st.viewer) return;
      applyClock(Cesium, st.viewer, clockMode, clockSpeed);
    }, [clockMode, clockSpeed, ready]);

    React.useEffect(() => {
      if (!ready) return;
      applySensorSkin(stateRef.current, skin);
    }, [skin, ready]);

    const liveTracksNote = clockMode !== 'live'
      ? 'Live tracks frozen at last poll · sats follow clock'
      : '';

    if (!open) return null;

    const errKeys = Object.keys(errors).filter((k) => k !== "gpsjam" && k !== "flights" && k !== "weather");
    const fields = inspectorFields(selected);
    const recLive = clockMode === 'live';
    const recPaused = clockMode === 'paused';
    const recClass = recLive ? '' : (recPaused ? ' is-paused' : ' is-warp');
    const recLabel = recLive ? 'REC · LIVE' : (recPaused ? 'REC · PAUSE' : ('REC · ' + clockSpeed + 'X'));

    return React.createElement(
      'div',
      { className: 'v4-godmode v4-gm2 v4-gm2-skin-' + skin, role: 'dialog', 'aria-label': 'God mode earth view' },
      React.createElement('div', { className: 'v4-godmode-backdrop', onClick: onClose }),
      React.createElement(
        'div',
        { className: 'v4-godmode-shell' },
        React.createElement(
          'div',
          { className: 'v4-godmode-head' },
          React.createElement('div', { className: 'v4-godmode-title' },
            React.createElement('span', { className: 'v4-godmode-eyebrow' }, 'Planetary ops'),
            React.createElement('strong', null, 'GOD MODE · CESIUM'),
            React.createElement('span', { className: 'v4-godmode-sub' }, 'Phase 3e · lighting · bloom')
          ),
          React.createElement('div', { className: 'v4-godmode-stats' },
            [['flights', 'Flights'], ['sats', 'Sats'], ['ships', 'Ships'], ['launches', 'Launches'], ['events', 'Events'], ['weather', 'Wx']].map(([k, label]) =>
              React.createElement('div', { key: k, className: 'v4-gm2-stat' },
                React.createElement('b', null, String(stats[k] || 0)),
                React.createElement('span', null, label)
              )
            )
          ),
          React.createElement('div', { className: 'v4-gm2-clockbox' },
            React.createElement('div', { className: 'v4-gm2-utc' }, utc),
            React.createElement('div', { className: 'v4-gm2-rec' + recClass },
              React.createElement('i', null), recLabel
            )
          ),
          React.createElement('button', {
            type: 'button', className: 'v4-godmode-close', onClick: onClose, 'aria-label': 'Close god mode',
          }, '✕')
        ),
        React.createElement(
          'div',
          { className: 'v4-godmode-body' },
          React.createElement('div', { className: 'v4-godmode-layers', 'aria-label': 'Data layers' },
            LAYERS.map((row) =>
              React.createElement('button', {
                key: row.id, type: 'button',
                className: 'v4-godmode-layer' + (layer === row.id ? ' is-active' : ''),
                onClick: () => pickLayer(row.id),
              },
                React.createElement('span', { className: 'v4-godmode-layer-glyph' }, row.glyph),
                React.createElement('span', null, row.label),
                React.createElement('span', { className: 'v4-gm2-keyhint' }, row.key)
              )
            )
          ),
          React.createElement(
            'div',
            { className: 'v4-gm2-stage' },
            React.createElement('div', { ref: stageRef, className: 'v4-gm2-cesium-host', style: { width: '100%', height: '100%' } }),
            React.createElement('form', {
              className: 'v4-gm2-search',
              onSubmit: (e) => { e.preventDefault(); runSearch(); },
            },
              React.createElement('input', {
                type: 'search',
                placeholder: 'Search city or address',
                value: searchQ,
                onChange: (e) => setSearchQ(e.target.value),
                'aria-label': 'Search',
              }),
              React.createElement('button', { type: 'submit', className: 'v4-gm2-btn' }, searching ? '…' : 'Go'),
              React.createElement('button', {
                type: 'button', className: 'v4-gm2-btn', title: 'Street height on this globe', 'aria-label': 'Street View',
                onClick: goStreetView,
              }, 'SV'),
              streetMode ? React.createElement('button', {
                type: 'button', className: 'v4-gm2-btn is-active', title: 'Back to globe', 'aria-label': 'Back to globe',
                onClick: leaveStreetViewHud,
              }, 'Globe') : null
            ),
            searchMsg ? React.createElement('div', { className: 'v4-gm2-search-msg' }, searchMsg) : null,
            React.createElement('div', { className: 'v4-gm2-vignette', 'aria-hidden': 'true' }),
            React.createElement('div', { className: 'v4-gm2-scan', 'aria-hidden': 'true' }),
            React.createElement('div', { className: 'v4-gm2-sensor-fx', 'aria-hidden': 'true' }),
            !ready && !bootError && React.createElement('div', { className: 'v4-godmode-loading' }, 'Starting Cesium globe…'),
            feedsLoading && ready && !firstPaint && React.createElement('div', { className: 'v4-godmode-loading v4-godmode-loading-inline' }, 'Syncing live feeds…'),
            bootError && React.createElement('div', { className: 'v4-godmode-globe-error v4-godmode-loading' }, bootError),
            React.createElement('div', { className: 'v4-gm2-hud-right' },
              React.createElement('div', { className: 'v4-gm2-chiprow' },
                React.createElement('div', { className: 'v4-gm2-chip' }, 'LOD · ' + lod.toUpperCase()),
                React.createElement('div', { className: 'v4-gm2-chip ' + (tilesChip.kind || '') }, tilesChip.text),
                satHud ? React.createElement('div', { className: 'v4-gm2-chip satfam' }, satHud) : null
              ),
              React.createElement('div', { className: 'v4-gm2-skins', role: 'tablist', 'aria-label': 'Sensor skins' },
                SKINS.map((s) =>
                  React.createElement('button', {
                    key: s.id, type: 'button',
                    className: 'v4-gm2-skin' + (skin === s.id ? ' is-active' : ''),
                    onClick: () => setSkinAndApply(s.id),
                  }, s.label, s.key ? React.createElement('span', { className: 'v4-gm2-skinkey' }, s.key) : null)
                )
              ),
              shipHud ? React.createElement('div', {
                className: 'v4-gm2-chip ' + (stats.ships ? '' : 'warn'),
              }, 'SHIPS · ' + shipHud) : null,
              jamHud ? React.createElement('div', {
                className: 'v4-gm2-chip ' + (dataRef.current.gpsjam.length ? '' : 'warn'),
                title: dataRef.current.gpsjamAttribution || 'Data derived from ADS-B Exchange via gpsjam.org',
              }, jamHud) : null,
              milHud ? React.createElement('div', {
                className: 'v4-gm2-chip ' + ((dataRef.current.milFlights || []).length ? '' : 'warn'),
              }, milHud) : null,
              readAisstreamKey() ? React.createElement('div', { className: 'v4-gm2-chip warn' }, 'AISSTREAM KEY · IDLE') : null,
              selected && fields ? React.createElement('div', { className: 'v4-gm2-inspector' },
                React.createElement('div', { className: 'v4-gm2-ins-type' }, fields.type),
                React.createElement('div', { className: 'v4-gm2-ins-name' }, fields.name),
                fields.coord ? React.createElement('div', { className: 'v4-gm2-ins-row' },
                  React.createElement('span', { className: 'k' }, 'POS'),
                  React.createElement('span', { className: 'v' }, fields.coord)
                ) : null,
                fields.kin ? React.createElement('div', { className: 'v4-gm2-ins-row' },
                  React.createElement('span', { className: 'k' }, 'KIN'),
                  React.createElement('span', { className: 'v' }, fields.kin)
                ) : null,
                fields.source ? React.createElement('div', { className: 'v4-gm2-ins-row' },
                  React.createElement('span', { className: 'k' }, 'SRC'),
                  React.createElement('span', { className: 'v' }, fields.source)
                ) : null,
                React.createElement('div', { className: 'v4-gm2-inspector-actions' },
                  React.createElement('button', {
                    type: 'button',
                    className: 'v4-gm2-btn' + (follow ? ' is-active' : ''),
                    onClick: () => setFollow((v) => !v),
                  }, follow ? 'FOLLOW · ON' : 'FOLLOW'),
                  React.createElement('button', {
                    type: 'button', className: 'v4-gm2-btn',
                    onClick: () => {
                      const Cesium = global.Cesium;
                      const viewer = stateRef.current.viewer;
                      if (Cesium && viewer) flyToEntity(Cesium, viewer, selected);
                    },
                  }, 'TRACK'),
                  React.createElement('button', {
                    type: 'button', className: 'v4-gm2-btn',
                    onClick: () => {
                      const Cesium = global.Cesium;
                      const st = stateRef.current;
                      if (enterStreetView(Cesium, st.viewer, st, selected && selected.lat, selected && selected.lng)) setStreetMode(true);
                    },
                  }, 'STREET VIEW'),
                  React.createElement('button', {
                    type: 'button', className: 'v4-gm2-btn',
                    onClick: () => {
                      setSelected(null);
                      setFollow(false);
                      const Cesium = global.Cesium;
                      const st = stateRef.current;
                      highlightSelected(st, '');
                      if (Cesium && st.viewer) showSelectionTrail(Cesium, st.viewer, st, null);
                    },
                  }, 'CLEAR')
                )
              ) : React.createElement('div', { className: 'v4-gm2-chip' }, 'NO TARGET')
            ),
            keysOpen ? React.createElement('div', { className: 'v4-gm2-keys', role: 'dialog', 'aria-label': 'Keyboard shortcuts' },
              React.createElement('h4', null, 'KEYS'),
              React.createElement('dl', null,
                cheatKeyRows().map(([k, v]) => React.createElement(React.Fragment, { key: k },
                  React.createElement('dt', null, k),
                  React.createElement('dd', null, v)
                ))
              ),
              React.createElement('div', { className: 'v4-gm2-keys-foot' }, '? toggle · Esc close')
            ) : null,
            React.createElement('div', { className: 'v4-gm2-timeline' },
              React.createElement('button', {
                type: 'button', className: clockMode === 'live' ? 'is-active' : '',
                onClick: () => { setClockMode('live'); setClockSpeed(1); },
              }, 'LIVE'),
              React.createElement('button', {
                type: 'button', className: clockMode === 'paused' ? 'is-active' : '',
                onClick: () => setClockMode((m) => m === 'paused' ? 'live' : 'paused'),
              }, clockMode === 'paused' ? 'RESUME' : 'PAUSE'),
              [['10x', 10], ['1m', 60], ['5m', 300], ['1h', 3600]].map(([lab, sp]) =>
                React.createElement('button', {
                  key: sp, type: 'button',
                  className: (clockMode === 'warp' && clockSpeed === sp) ? 'is-active' : '',
                  onClick: () => { setClockMode('warp'); setClockSpeed(sp); },
                }, lab)
              ),
              React.createElement('span', { className: 'v4-gm2-clock-read' }, utc),
              React.createElement('button', {
                type: 'button', className: keysOpen ? 'is-active' : '',
                onClick: () => setKeysOpen((v) => !v),
                title: 'Keyboard shortcuts',
                'aria-label': 'Toggle keyboard shortcuts',
              }, '?'),
              liveTracksNote ? React.createElement('span', { className: 'v4-gm2-note' }, liveTracksNote) : null
            )
          )
        )
      )
    );
  }

  V4GodModeEarth.engine = 'cesium';
  global.V4GodModeEarth = V4GodModeEarth;
  if (typeof module !== 'undefined' && module.exports) module.exports = V4GodModeEarth;
})(typeof window !== 'undefined' ? window : globalThis);
