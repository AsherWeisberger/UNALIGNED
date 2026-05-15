// FLOW v4 — main app shell (refined top bar + view wiring)

const V4_TWEAKS = /*EDITMODE-BEGIN*/{
  "viewAs": "asher",
  "theme": "light",
  "view": "today"
}/*EDITMODE-END*/;

function V4App() {
  const { USERS, LEADS, STAGE_BY_ID, ACTIVE_STAGE_IDS, flowCounts } = window.V3;
  const [t, setTweak] = useTweaks(V4_TWEAKS);
  const [view, setView] = React.useState(t.view || 'today');
  const [openId, setOpenId] = React.useState(null);
  const [briefId, setBriefId] = React.useState(null);
  const [leads, setLeads] = React.useState(LEADS);
  const [leadStatus, setLeadStatus] = React.useState('loading');
  const [ownerFilter, setOwnerFilter] = React.useState('all');
  const [toast, setToast] = React.useState(null);

  React.useEffect(() => {
    const h = (e) => setBriefId(e.detail.leadId);
    window.addEventListener('v3:open-brief', h);
    return () => window.removeEventListener('v3:open-brief', h);
  }, []);

  React.useEffect(() => {
    const h = (e) => {
      const { leadId, sender, subject, body } = e.detail || {};
      if (!leadId) return;
      const senderName = V3SenderName(sender);
      setLeads(curr => {
        const next = curr.map(l => l.id === String(leadId) ? {
          ...l,
          needsReply: false,
          unread: false,
          draftReplyStatus: 'sent',
          thread: [...(l.thread || []), { from: senderName, when: 'now', subject, body }],
        } : l);
        window.V3.LEADS = next;
        return next;
      });
      setToast('Email sent from ' + senderName + '.');
      setTimeout(() => setToast(null), 3500);
    };
    window.addEventListener('v3:email-sent', h);
    return () => window.removeEventListener('v3:email-sent', h);
  }, []);

  React.useEffect(() => {
    let alive = true;
    V3LoadSupabaseLeads()
      .then(realLeads => {
        if (!alive) return;
        window.V3.LEADS = realLeads;
        setLeads(realLeads);
        setLeadStatus('real');
      })
      .catch(err => {
        console.error('[ALIGNED v4] Supabase lead load failed:', err);
        if (!alive) return;
        window.V3.LEADS = LEADS;
        setLeads(LEADS);
        setLeadStatus('demo');
      });
    return () => { alive = false; };
  }, []);

  React.useEffect(() => {
    document.body.setAttribute('data-theme', t.theme);
  }, [t.theme]);

  const user = t.viewAs;
  const me = USERS[user];
  const openLead = leads.find(l => l.id === openId) || null;
  const unreadCount = leads.filter(l => l.unread).length;

  // Scope tag matching the Today scope card
  const SCOPE_TAG = {
    asher:  'Founder · sees all',
    sammy:  'Manager · my leads',
    robert: 'Creator · post queue',
  };

  const stats = {
    total: leads.length,
    assigned: leads.filter(l => l.ownerId === user).length,
    hot: leads.filter(l => l.stage === 'rates-sent' && l.daysInStage >= 5).length,
    stuck: leads.filter(l => l.daysInStage >= 10 && !['paid-out'].includes(l.stage)).length,
    newToday: 3,
    pipeline: leads.filter(l => !['paid-out'].includes(l.stage)).reduce((s, l) => s + (l.value || 0), 0),
  };

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
          <button className="hd-nav-btn" aria-current={view === 'board' ? 'page' : undefined} onClick={() => { setView('board'); }}>Pipeline</button>
          <button className="hd-nav-btn" aria-current={view === 'leads' ? 'page' : undefined} onClick={() => { setView('leads'); }}>Network</button>
          <button className="hd-nav-btn" aria-current={view === 'inbox' ? 'page' : undefined} onClick={() => { setView('inbox'); }}>
            Inbox
            {unreadCount > 0 && <span className="cnt">{unreadCount}</span>}
          </button>
        </div>

        <div className="hd-search">
          <V3Icon name="search" w={12} />
          <input placeholder="Search leads, brands, threads…" />
          <kbd>⌘K</kbd>
        </div>

        {/* The transparency signal */}
        <div className="hd-context" title={`Viewing as ${me.name} — ${me.role}`}>
          <span className="hd-context-pip" style={{ background: me.color }}>{me.name[0]}</span>
          <span>{me.name}</span>
          <span className="hd-context-scope">· {SCOPE_TAG[user]}</span>
        </div>

        <div className="hd-sync" title="Real-time Gmail sync">
          <span className="dot"></span>
          {leadStatus === 'loading' ? 'Loading Supabase' : leadStatus === 'real' ? 'Supabase live' : 'Demo data'}
        </div>

        <div className="hd-right">
          <div className="hd-user-switch" title="Switch viewer">
            {Object.values(USERS).map(u => (
              <button key={u.id} className="hd-user-pip"
                      aria-pressed={user === u.id}
                      onClick={() => setTweak('viewAs', u.id)}
                      title={`${u.name} · ${u.role}`}
                      style={{ background: u.color }}>
                {u.name[0]}
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
          <V4TodayView user={user} leads={leads} onOpenLead={setOpenId} onGoInbox={() => setView('inbox')} />
        )}
        {view === 'board' && (
          <V3BoardView leads={leads} openId={openId} onOpen={setOpenId} user={user}
                       ownerFilter={ownerFilter} setOwnerFilter={setOwnerFilter} />
        )}
        {view === 'inbox' && (
          <V4InboxView leads={leads} user={user} />
        )}
        {view === 'leads' && (
          <V4LeadsView leads={leads} openId={openId} onOpenLead={setOpenId} user={user} />
        )}
      </main>

      {/* ─── Footer ─── */}
      <footer className="ft">
        <span className="dot"></span>
        <span>Synced · {leads.length} cards · {flowCounts().reduce((s, f) => s + f.count, 0)} active</span>
        <span className="right">v4.0 · {me.name} ({me.role}) · ALIGNED</span>
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
                    options={['today','board','leads','inbox']}
                    onChange={v => { setView(v); setOpenId(null); }} />
        <TweakSection label="Appearance" />
        <TweakRadio label="Theme" value={t.theme}
                    options={['light','dark']}
                    onChange={v => setTweak('theme', v)} />
        <TweakSection label="Demo" />
        <TweakButton label="Open a negotiating deal"
                     onClick={() => setOpenId(leads.find(l => l.stage === 'negotiating')?.id)} />
        <TweakButton label="Jump to Robert's post queue"
                     onClick={() => { setTweak('viewAs', 'robert'); setView('today'); }} />
        <TweakButton label="Asher's brief approval"
                     onClick={() => { setTweak('viewAs', 'asher'); setOpenId(leads.find(l => l.brief?.status === 'awaiting-approval')?.id); }} />
      </TweaksPanel>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<V4App />);
