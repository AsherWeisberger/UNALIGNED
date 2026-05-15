// FLOW v3 — Detail drawer (right slide-in)

function V3Drawer({ lead, user, onClose }) {
  const { STAGE_BY_ID, USERS, ACTIVE_STAGE_IDS } = window.V3;
  // Open straight to the Brief tab when there's something requiring action
  const pickInitialTab = (l) => (l?.brief && (
    (user === 'asher' && l.brief.status === 'awaiting-approval') ||
    (user === 'robert' && l.brief.status === 'ready')
  )) ? 'brief' : 'stands';
  const [tab, setTab] = React.useState(() => pickInitialTab(lead));
  // Reset to the right default whenever the drawer switches to a different lead.
  React.useEffect(() => { setTab(pickInitialTab(lead)); }, [lead?.id]);

  if (!lead) return null;
  const stage = STAGE_BY_ID[lead.stage];
  const owner = lead.ownerId ? USERS[lead.ownerId] : null;
  const nextOwner = lead.nextMove.who ? USERS[lead.nextMove.who] : null;
  const isMine = lead.nextMove.who === user;
  const isThem = !lead.nextMove.who && !['paid-out'].includes(lead.stage);

  return (
    <>
      <div className="backdrop show" onClick={onClose} />
      <aside className="drawer">
        <div className="drawer-hd">
          <button className="hd-icon-btn" onClick={onClose} aria-label="Close">
            <V3Icon name="x" w={15} />
          </button>
          <span className="drawer-id">{lead.id}</span>
          <span style={{ color: 'var(--text-4)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>· {lead.brand}</span>
          <div className="drawer-hd-actions">
            <button className="hd-icon-btn" title="Star"><V3Icon name="star" w={14} /></button>
            <button className="hd-icon-btn" title="Archive"><V3Icon name="archive" w={14} /></button>
            <button className="hd-icon-btn" title="More"><V3Icon name="more" w={14} /></button>
          </div>
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
          {isMine && (
            <div className="next-move-actions">
              <button className="btn btn-sm btn-accent">
                <V3Icon name={lead.nextMove.action === 'Post' ? 'check' : 'arrow_r'} w={13} />
                {lead.nextMove.action === 'Reply' ? 'Reply' : lead.nextMove.action === 'Send' ? 'Send' : lead.nextMove.action === 'Nudge' ? 'Nudge' : lead.nextMove.action === 'Post' ? 'Done' : 'Go'}
              </button>
            </div>
          )}
        </div>

        {/* Meta grid */}
        <div className="drawer-meta">
          <div className="dm-cell">
            <span className="dm-lbl">Stage</span>
            <span className="dm-val" style={{ color: stage.color, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: stage.color }}></span>
              {stage.name}
            </span>
          </div>
          <div className="dm-cell">
            <span className="dm-lbl">Value</span>
            <span className="dm-val mono">{lead.value ? v3Money(lead.value) : '—'}</span>
          </div>
          <div className="dm-cell">
            <span className="dm-lbl">Owner</span>
            <span className="dm-val" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {owner ? <><V3Avatar name={owner.name} color={owner.color} size="xs" />{owner.name}</> : '—'}
            </span>
          </div>
          <div className="dm-cell">
            <span className="dm-lbl">Source</span>
            <span className="dm-val">{lead.source}</span>
          </div>
          <div className="dm-cell">
            <span className="dm-lbl">Deliverables</span>
            <span className="dm-val" style={{ fontSize: 11.5, textAlign: 'right' }}>{lead.deliverables}</span>
          </div>
          <div className="dm-cell">
            <span className="dm-lbl">Days in stage</span>
            <span className="dm-val mono">{lead.daysInStage}d</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="drawer-tabs">
          <button className="dr-tab" aria-selected={tab === 'stands'} onClick={() => setTab('stands')}>
            Where this stands
          </button>
          {lead.brief && (
            <button className="dr-tab" aria-selected={tab === 'brief'} onClick={() => setTab('brief')}>
              Brief
              {lead.brief.status === 'awaiting-approval' && user === 'asher' && (
                <span className="dr-tab-dot" title="Awaiting your approval"></span>
              )}
            </button>
          )}
          <button className="dr-tab" aria-selected={tab === 'thread'} onClick={() => setTab('thread')}>
            Email thread <span className="cnt">{lead.thread.length}</span>
          </button>
          <button className="dr-tab" aria-selected={tab === 'files'} onClick={() => setTab('files')}>
            Files <span className="cnt">3</span>
          </button>
        </div>

        {/* Body */}
        <div className="drawer-body">
          {tab === 'stands' && <V3Stands lead={lead} />}
          {tab === 'brief' && lead.brief && <V3BriefPanel lead={lead} user={user} />}
          {tab === 'thread' && <V3Thread lead={lead} />}
          {tab === 'files' && <V3Files lead={lead} />}
        </div>

        <div className="drawer-foot">
          <textarea placeholder={`Reply to ${lead.contactName.split(' ')[0]}, or type / for snippets…`} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <button className="btn btn-sm btn-accent"><V3Icon name="send" w={12} /> Send</button>
            <button className="btn btn-sm btn-ghost"><V3Icon name="spark" w={12} /> Draft</button>
          </div>
        </div>
      </aside>
    </>
  );
}

function V3Stands({ lead }) {
  return (
    <>
      <div className="standstrip-hd">
        <div className="standstrip-title">Where this stands</div>
        <span className="standstrip-pulse">Step {lead.progress + 1} of {window.V3.ACTIVE_STAGE_IDS.length}</span>
        <div style={{ marginLeft: 'auto' }}>
          <button className="btn btn-sm btn-ghost">
            <V3Icon name="chev_d" w={11} /> Advance stage
          </button>
        </div>
      </div>

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

      {/* Robert's checklist — only on Done/Booked stage */}
      {lead.stage === 'done' && (
        <div className="checklist">
          <div className="checklist-h">Robert's checklist</div>
          <V3CheckRow text="Review the brief — talking points & do/don'ts" due="Today" />
          <V3CheckRow text={`Record Reel (${lead.deliverables.split('+')[0].trim()})`} due="Today" />
          <V3CheckRow text="Record 3 Stories — behind-the-scenes" due="Tomorrow" />
          <V3CheckRow text="Submit for Sammy's approval" due="Thu" />
          <V3CheckRow text="Post Friday 4pm PT" due="Fri" />
        </div>
      )}

      {/* For paid stages, show a summary checklist */}
      {lead.stage === 'invoice-sent' && (
        <div className="checklist">
          <div className="checklist-h">Closing checklist</div>
          <V3CheckRow text="Send invoice with usage rights summary" done due="" />
          <V3CheckRow text="Chase payment in 7 days if quiet" due="Next Tue" />
          <V3CheckRow text="Move to Paid Out once received" due="" />
        </div>
      )}
    </>
  );
}

function V3CheckRow({ text, done: initial = false, due }) {
  const [done, setDone] = React.useState(initial);
  return (
    <div className={'check-row' + (done ? ' done' : '')} onClick={() => setDone(d => !d)}>
      <div className={'check-box' + (done ? ' done' : '')}>{done && <V3Icon name="check" w={11} />}</div>
      <span className="check-text">{text}</span>
      {due && <span className="check-due">{due}</span>}
    </div>
  );
}

function V3Thread({ lead }) {
  return (
    <div className="act">
      {lead.thread.map((m, i) => (
        <div key={i} className="act-item">
          <div className="act-item-hd">
            <V3Avatar name={m.from} color={m.from === 'Sammy' ? '#16894a' : m.from === 'Asher' ? '#2f5fd6' : lead.color} size="xs" />
            <span className="from">{m.from}</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{m.subject}</span>
            <span className="time">{m.when}</span>
          </div>
          <div className="act-item-body">{m.body}</div>
        </div>
      ))}
    </div>
  );
}

function V3Files({ lead }) {
  const files = [
    { name: 'Brand brief.pdf', size: '2.1 MB' },
    { name: 'Rate card.pdf',   size: '180 KB' },
  ];
  if (['done','paid-out'].includes(lead.stage)) files.push({ name: 'Final cut.mp4', size: '68 MB' });
  if (['invoice-sent','paid-out'].includes(lead.stage)) files.push({ name: 'Invoice.pdf', size: '94 KB' });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {files.map((f, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 9,
          padding: '8px 10px',
          border: '1px solid var(--line)', background: 'var(--surface-2)',
          borderRadius: 7, fontSize: 12.5,
        }}>
          <V3Icon name="doc" w={14} />
          <span style={{ flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{f.name}</span>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-3)', fontSize: 11 }}>{f.size}</span>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { V3Drawer });
