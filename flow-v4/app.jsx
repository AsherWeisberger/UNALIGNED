// FLOW v4 — main app shell (refined top bar + view wiring)

const V4_TWEAKS = /*EDITMODE-BEGIN*/{
  "viewAs": "robert",
  "theme": "light",
  "view": "calendar"
}/*EDITMODE-END*/;

function V4DefaultViewForUser(user) {
  return user === 'robert' ? 'inbox' : 'calendar';
}

function V4App() {
  const { USERS, LEADS, STAGE_BY_ID, ACTIVE_STAGE_IDS } = window.V3;
  const [t, setTweak] = useTweaks(V4_TWEAKS);
  const isPhone = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
  const [view, setView] = React.useState(isPhone ? 'today' : V4DefaultViewForUser(t.viewAs));
  const [openId, setOpenId] = React.useState(null);
  const [briefId, setBriefId] = React.useState(null);
  const [leads, setLeads] = React.useState(LEADS);
  const [ownerFilter, setOwnerFilter] = React.useState('all');
  const [searchByView, setSearchByView] = React.useState({
    today: '',
    invoices: '',
    board: '',
    inbox: '',
    leads: '',
    calendar: '',
  });
  const [toast, setToast] = React.useState(null);
  const toastTimer = React.useRef(null);
  const searchRef = React.useRef(null);
  const [pendingReplies, setPendingReplies] = React.useState(() => {
    try {
      return JSON.parse(window.localStorage.getItem('v3-pending-replies') || '[]') || [];
    } catch (e) {
      return [];
    }
  });

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
    try {
      window.localStorage.setItem('v3-pending-replies', JSON.stringify(pendingReplies));
    } catch (e) {}
  }, [pendingReplies]);

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
    if (view === 'leads') return 'Search network…';
    if (view === 'board') return 'Search pipeline…';
    return 'Search calendar…';
  }, [view]);

  React.useEffect(() => {
    setOwnerFilter('all');
    setOpenId(null);
    setBriefId(null);
    setView(V4DefaultViewForUser(user));
  }, [user]);

  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape' && document.activeElement === searchRef.current) {
        searchRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const me = USERS[user];
  const mergedLeads = React.useMemo(() => {
    return window.V3.MergePendingReplies ? window.V3.MergePendingReplies(leads, pendingReplies) : leads;
  }, [leads, pendingReplies]);
  const visibleLeads = mergedLeads
    .filter(l => window.V3.LeadVisibleToProfile(l, user))
    .filter(l => window.V3.LeadMatchesQuery ? window.V3.LeadMatchesQuery(l, search) : true);
  const openLead = visibleLeads.find(l => l.id === openId) || null;
  const unreadCount = visibleLeads.filter(l => l.unread).length;

  // Scope tag matching the Today scope card
  const SCOPE_TAG = {
    asher:  'Shared sales lane',
    sammy:  'Shared sales lane',
    robert: 'Creator lane',
  };

  const stats = {
    total: visibleLeads.length,
    assigned: visibleLeads.filter(l => window.V3.LeadIsMineForProfile(l, user)).length,
    hot: visibleLeads.filter(l => l.stage === 'rates-sent' && l.daysInStage >= 5).length,
    stuck: visibleLeads.filter(l => l.daysInStage >= 10 && !['paid-out'].includes(l.stage)).length,
    newToday: 3,
    pipeline: visibleLeads.filter(l => !['paid-out'].includes(l.stage)).reduce((s, l) => s + (l.value || 0), 0),
  };
  const inboxLabel = user === 'robert' ? 'Brief' : 'Inbox';

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
          <button className="hd-nav-btn" aria-current={view === 'leads' ? 'page' : undefined} onClick={() => { setView('leads'); }}>Network</button>
          <button className="hd-nav-btn" aria-current={view === 'board' ? 'page' : undefined} onClick={() => { setView('board'); }}>Pipeline</button>
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
              All <span className="fs-chip-cnt">{leads.length}</span>
            </span>
            {Object.values(USERS).map(u => {
              const n = leads.filter(l => l.ownerId === u.id).length;
              return (
                <span key={u.id} className={'fs-chip' + (ownerFilter === u.id ? ' active' : '')} onClick={() => setOwnerFilter(u.id)}>
                  {u.name} <span className="fs-chip-cnt">{n}</span>
                </span>
              );
            })}
          </div>
        )}

        {view === 'today' && (
          <V4TodayView user={user} leads={visibleLeads} query={search} onOpenLead={setOpenId} onGoInbox={() => setView('inbox')} />
        )}
        {view === 'board' && (
          <V3BoardView leads={visibleLeads} query={search} openId={openId} onOpen={setOpenId} user={user}
                       ownerFilter={ownerFilter} setOwnerFilter={setOwnerFilter} />
        )}
        {view === 'inbox' && (user === 'robert'
          ? <V4RobertBriefView leads={visibleLeads} query={search} user={user} onOpenLead={setOpenId} />
          : <V4InboxView leads={visibleLeads} query={search} user={user} />
        )}
        {view === 'invoices' && (
          <V4InvoicesView query={search} />
        )}
        {view === 'leads' && (
          <V4LeadsView leads={visibleLeads} query={search} openId={openId} onOpenLead={setOpenId} user={user} />
        )}
        {view === 'calendar' && (
          <V4CalendarView query={search} />
        )}
      </main>

      {/* ─── Footer ─── */}
      <footer className="ft">
        <span className="dot"></span>
        <span>Synced · {visibleLeads.length} cards · {visibleLeads.filter(l => !['paid-out'].includes(l.stage)).length} active</span>
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
        <button className="ft-tab" aria-current={view === 'leads' ? 'page' : undefined}
                onClick={() => { setView('leads'); }}>
          <V3Icon name="leads" w={18} />
          Network
        </button>
        <button className="ft-tab" aria-current={view === 'board' ? 'page' : undefined}
                onClick={() => { setView('board'); }}>
          <V3Icon name="table" w={18} />
          Pipeline
        </button>
      </footer>

      {/* Detail drawer — suppressed in Inbox; the inbox's right pane is its own reader */}
      {openLead && view !== 'inbox' && <V3Drawer lead={openLead} user={user} onClose={() => setOpenId(null)} />}

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
                    options={['today','board','leads','inbox','invoices','calendar']}
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
