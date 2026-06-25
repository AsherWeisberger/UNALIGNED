// UNALIGNED Ops — main app shell (top bar, views, command palette)

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
    'machine-room': '',
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
    if (view === 'machine-room') return 'Search Machine Room…';
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
    // Defer so the opening tap doesn't immediately close on iOS (synthetic pointer events).
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
    { label: 'Go to Machine Room', hint: 'workers', run: () => { setView('machine-room'); setOpenId(null); } },
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
    <div className="app" data-screen-label={`UNALIGNED — ${view}`}>
      {/* ─── Top bar ─── */}
      <header className="hd v6-gnav">
        <div className="hd-brand v6-gbrand">
          <V6CompanyOsLogo className="v6-logo-full" />
          <V6CompanyOsLogo compact className="v6-logo-compact" />
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
          <button className="hd-nav-btn" aria-current={view === 'machine-room' ? 'page' : undefined} onClick={() => { setView('machine-room'); setOpenId(null); }}>Machine Room</button>
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

        <div className="hd-sync" title="Real-time Gmail sync">
          <span className="dot"></span>
          Synced
        </div>

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
        {view === 'machine-room' && (
          <div className="body body-machine-room">
            <V4AgentsView
              leads={mergedLeads}
              query={search}
              onOpenLead={(id) => {
                setView('company-os');
                setOpenId(id);
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
        <button className="ft-tab" aria-current={view === 'machine-room' ? 'page' : undefined}
                onClick={() => { setView('machine-room'); setOpenId(null); }}>
          <V3Icon name="network" w={18} />
          Machine
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
                    options={['today','board','new-leads','company-os','machine-room','leads','inbox','invoices','calendar']}
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

/** Cinematic startup — Model Y-style fade into dashboard */
function V6CompanyOsBoot({ onDone }) {
  const [phase, setPhase] = React.useState('intro');
  const iconSrc = React.useMemo(() => {
    const file = 'flow-v4/assets/company-os-icon.svg?v=20260625-boot-1';
    try { return new URL(file, window.location.href).href; }
    catch (err) { return file; }
  }, []);

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
    const tExit = setTimeout(() => setPhase('exit'), 2400);
    const tDone = setTimeout(() => {
      document.body.classList.remove('v6-booting');
      onDone();
    }, 3200);
    return () => {
      clearTimeout(tReveal);
      clearTimeout(tHold);
      clearTimeout(tExit);
      clearTimeout(tDone);
      document.body.classList.remove('v6-booting');
    };
  }, [onDone]);

  if (phase === 'done') return null;

  return (
    <div className={'v6-boot' + (phase !== 'intro' ? ' is-active' : '') + (phase === 'exit' ? ' is-exit' : '')} aria-hidden="true">
      <div className="v6-boot-vignette" />
      <div className="v6-boot-glow" />
      <div className="v6-boot-core">
        <img className="v6-boot-icon" src={iconSrc} alt="" draggable={false} decoding="async" />
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

try {
  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(<V4AppRoot />);
  if (window.__alignedBootMarkReady) window.__alignedBootMarkReady();
} catch (e) {
  console.error('[UNALIGNED] render failed', e);
  if (window.__alignedBootMarkReady) window.__alignedBootMarkReady();
  const el = document.getElementById('boot-status');
  if (el) {
    el.style.display = 'block';
    el.textContent = 'Render error:\n' + (e && (e.stack || e.message) || e);
  }
}
window.V4App = V4App;
