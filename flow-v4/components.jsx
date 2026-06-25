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

/** UNALIGNED mark — black circle, torn U, transparent outside (seamless) */
function V6UnalignedMark({ size = 30, className = '' }) {
  const uid = React.useId().replace(/:/g, '');
  return (
    <svg
      className={'v6-mark ' + className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      role="img"
    >
      <defs>
        <filter id={`v6u-shadow-${uid}`} x="-8%" y="-8%" width="116%" height="116%">
          <feDropShadow dx="0.35" dy="0.55" stdDeviation="0.45" floodColor="#000000" floodOpacity="0.42" />
        </filter>
      </defs>
      <circle cx="16" cy="16" r="16" fill="#000000" />
      <g fill="#FFFFFF" filter={`url(#v6u-shadow-${uid})`}>
        <path d="M7.5 8h3.35v2.35l-.6.45.75.38-.8.52.65.55H7.5V8z" />
        <path d="M21.15 8h3.35v6.25h-3.1l.65-.55-.8-.52.75-.38-.6-.45V8h-.25z" />
        <path d="M7.5 12.15l.65-.6.8.6-.85.48.75.8h1.75v7.6q4.75 2.7 9.5 0v-7.6h1.75l.75-.8-.85-.48.8-.6.65-.6h-2.65l.55-.5-.75-.38.8-.52-.65-.45v-.55h-3.35v.55l-.65.45.8.52-.75.38.55.5H7.5z" />
      </g>
    </svg>
  );
}

/** Company OS mark — offset C + slash (UNALIGNED), Perplexity-style depth */
function V6CompanyOsMark({ size = 28, className = '' }) {
  const uid = React.useId().replace(/:/g, '');
  const bg = `v6cos-bg-${uid}`;
  const stroke = `v6cos-stroke-${uid}`;
  const sheen = `v6cos-sheen-${uid}`;
  return (
    <svg
      className={'v6-gmark ' + className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      role="img"
    >
      <defs>
        <linearGradient id={bg} x1="6" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#070d1a" />
          <stop offset="0.38" stopColor="#152a5c" />
          <stop offset="0.72" stopColor="#1d4ed8" />
          <stop offset="1" stopColor="#38bdf8" />
        </linearGradient>
        <linearGradient id={stroke} x1="9" y1="7" x2="25" y2="25" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f8fafc" />
          <stop offset="0.45" stopColor="#bae6fd" />
          <stop offset="1" stopColor="#a5b4fc" />
        </linearGradient>
        <linearGradient id={sheen} x1="4" y1="4" x2="18" y2="14" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" stopOpacity="0.34" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <filter id={`v6cos-glow-${uid}`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="0.65" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9.5" fill={`url(#${bg})`} />
      <rect x="1.5" y="1.5" width="29" height="29" rx="9" fill={`url(#${sheen})`} />
      <rect x="1" y="1" width="30" height="30" rx="9.5" stroke="rgba(186, 230, 253, 0.22)" strokeWidth="0.75" />
      <path
        d="M22.2 9.4a10.2 10.2 0 1 0 0 13.2"
        stroke="#38bdf8"
        strokeOpacity="0.22"
        strokeWidth="3.6"
        strokeLinecap="round"
        transform="translate(1.35 1.05)"
      />
      <path
        d="M21.6 9a10.4 10.4 0 1 0 0 14"
        stroke={`url(#${stroke})`}
        strokeWidth="3.75"
        strokeLinecap="round"
        filter={`url(#v6cos-glow-${uid})`}
      />
      <path
        d="M10.8 23.6L22.4 8.6"
        stroke="#67e8f9"
        strokeWidth="2.15"
        strokeLinecap="round"
      />
      <circle cx="22.7" cy="8.4" r="1.55" fill="#ecfeff" />
      <circle cx="22.7" cy="8.4" r="0.55" fill="#0ea5e9" />
    </svg>
  );
}

Object.assign(window, {
  V3Icon,
  V3Avatar,
  V3StageProg,
  V3Empty,
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
