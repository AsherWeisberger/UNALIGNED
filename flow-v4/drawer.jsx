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
  const isMine = window.V3.MoveIsMineForProfile(lead, user);
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
          <V3InlineReply lead={lead} user={user} />
        </div>
      </aside>
    </>
  );
}

function V3InlineReply({ lead, user }) {
  const [sender, setSender] = React.useState(() => V3SenderForUser(user));
  const [internalOnly, setInternalOnly] = React.useState(false);
  const initialRecipients = React.useMemo(() => V3ReplyRecipients(lead, sender, internalOnly), [lead.id, sender, internalOnly]);
  const [to, setTo] = React.useState(initialRecipients.to);
  const [cc, setCc] = React.useState(initialRecipients.cc);
  const [toDraft, setToDraft] = React.useState('');
  const [ccDraft, setCcDraft] = React.useState('');
  const [body, setBody] = React.useState(lead.draftReply?.body || '');
  const [attachPdf, setAttachPdf] = React.useState(false);
  const [status, setStatus] = React.useState('draft');
  const [error, setError] = React.useState('');
  const subject = V3SubjectForLead(lead);
  const toLine = to.join(',');
  const ccLine = cc.join(',');
  const isSelfRecipient = V3IsSelfRecipient(sender, toLine);

  React.useEffect(() => {
    const nextSender = V3SenderForUser(user);
    const next = V3ReplyRecipients(lead, nextSender, false);
    setSender(nextSender);
    setInternalOnly(false);
    setTo(next.to);
    setCc(next.cc);
    setToDraft('');
    setCcDraft('');
    setBody(lead.draftReply?.body || '');
    setAttachPdf(false);
    setStatus('draft');
    setError('');
  }, [lead.id, user]);

  React.useEffect(() => {
    const next = V3ReplyRecipients(lead, sender, internalOnly);
    setTo(next.to);
    setCc(next.cc);
    setToDraft('');
    setCcDraft('');
    setError('');
  }, [sender, internalOnly, lead.id]);

  const addRecipients = (field, value) => {
    const emails = V3SplitEmails(value);
    if (!emails.length) return;
    if (field === 'to') setTo(list => V3UniqueEmails([...list, ...emails]));
    if (field === 'cc') setCc(list => V3UniqueEmails([...list, ...emails]));
    if (field === 'to') setToDraft('');
    if (field === 'cc') setCcDraft('');
    if (error) setError('');
  };

  const removeRecipient = (field, email) => {
    if (field === 'to') setTo(list => list.filter(item => item !== email));
    if (field === 'cc') setCc(list => list.filter(item => item !== email));
    if (error) setError('');
  };

  const RecipientChips = ({ label, list, field, draft, setDraft }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 32, padding: '5px 8px', border: '1px solid var(--line)', borderRadius: 6, background: 'var(--surface)' }}>
      <span style={{ flex: '0 0 24px', fontSize: 11, color: 'var(--text-3)' }}>{label}</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, flex: 1 }}>
        {list.length ? list.map(email => (
          <span key={field + email} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: '100%', padding: '3px 7px', border: '1px solid var(--line)', borderRadius: 999, background: 'var(--surface-2)', fontSize: 11.5, color: 'var(--text)' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{email}</span>
            <button type="button" disabled={status === 'sending'} onClick={() => removeRecipient(field, email)} aria-label={'Remove ' + email} title={'Remove ' + email} style={{ border: 0, background: 'transparent', color: 'var(--text-3)', padding: 0, display: 'inline-flex', cursor: 'pointer' }}>
              <V3Icon name="x" w={11} />
            </button>
          </span>
        )) : (
          <span style={{ fontSize: 11.5, color: 'var(--bad)' }}>{field === 'to' ? 'No recipients selected' : 'No CCs'}</span>
        )}
        <input
          value={draft}
          disabled={status === 'sending'}
          onChange={e => setDraft(e.target.value)}
          onBlur={e => addRecipients(field, e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ',' || e.key === ';') {
              e.preventDefault();
              addRecipients(field, e.currentTarget.value);
            }
          }}
          placeholder={field === 'to' ? 'Add recipient' : 'Add cc'}
          style={{ flex: '1 1 130px', minWidth: 110, border: 0, outline: 0, background: 'transparent', color: 'var(--text)', fontSize: 11.5 }}
        />
      </div>
    </div>
  );

  const send = async () => {
    const msg = body.trim();
    const recipient = toLine.trim();
    if (!recipient || !msg) {
      setError(!to.length ? 'Add the outside lead email above, or choose Talk internally.' : 'Write a reply before sending.');
      return;
    }
    if (isSelfRecipient) {
      setError(V3SenderName(sender) + ' is also a recipient. Remove them before sending.');
      return;
    }
    setStatus('sending');
    setError('');
    try {
      await V3SendLeadEmail({ lead, sender, to: recipient, cc: ccLine, subject, body: msg, attachPdf });
      fetch(V3_SUPABASE_URL + '/rest/v1/cards?id=eq.' + encodeURIComponent(lead.id), {
        method: 'PATCH',
        headers: {
          apikey: V3_SUPABASE_ANON_KEY,
          Authorization: 'Bearer ' + V3_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ draft_reply_status: 'sent', new_reply_at: null }),
      }).catch(err => console.warn('[ALIGNED v4] card status update failed:', err));
      window.dispatchEvent(new CustomEvent('v3:email-sent', { detail: { leadId: lead.id, sender, subject, body: msg } }));
      setBody('');
      setStatus('sent');
    } catch (err) {
      setStatus('error');
      setError(err.message || 'Send failed');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, width: '100%' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 180px) 1fr', gap: 7 }}>
        <select className="brief-input" value={sender} disabled={status === 'sending'} onChange={e => setSender(e.target.value)} title="Sender">
          <option value="robert">Robert Scoble</option>
          <option value="sam">Sam Levin / UnalignedX</option>
          <option value="asher">Asher</option>
        </select>
        <button className={'btn btn-sm ' + (internalOnly ? 'btn-accent' : 'btn-ghost')} type="button" disabled={status === 'sending'} onClick={() => setInternalOnly(value => !value)} title="Send only to Robert, Sam, and Asher">
          <V3Icon name="mail" w={12} /> {internalOnly ? 'Internal email chain' : 'Talk internally'}
        </button>
      </div>
      <RecipientChips label="To" list={to} field="to" draft={toDraft} setDraft={setToDraft} />
      {!internalOnly && <RecipientChips label="Cc" list={cc} field="cc" draft={ccDraft} setDraft={setCcDraft} />}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 7 }}>
        <input className="brief-input" value={subject} readOnly disabled title="Subject" />
        <textarea
          className="brief-input"
          style={{ minHeight: 100, resize: 'vertical' }}
          value={body}
          disabled={status === 'sending'}
          onChange={e => setBody(e.target.value)}
          placeholder={`Reply to ${lead.contactName.split(' ')[0]}...`}
        />
      </div>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: 'var(--text-2)', userSelect: 'none' }}>
        <input
          type="checkbox"
          checked={attachPdf}
          disabled={status === 'sending'}
          onChange={e => setAttachPdf(e.target.checked)}
        />
        Attach SINGLE TIER.pdf
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 10.5, color: 'var(--text-3)' }}>
          {error || (isSelfRecipient ? `${V3SenderName(sender)} is also a recipient. Remove them before sending.` : status === 'sent' ? 'Sent.' : `Lead chain · sending as ${V3SenderName(sender)}${lead.gmailThreadId && sender === 'robert' ? ' in the Gmail thread' : ''}`)}
        </div>
        <button className="btn btn-sm btn-accent" onClick={send} disabled={status === 'sending'}>
          <V3Icon name="send" w={12} /> Send
        </button>
      </div>
    </div>
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
