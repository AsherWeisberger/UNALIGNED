// FLOW v3 — Detail drawer (right slide-in)

function V3DrawerQueue({ queue, currentId, onNavigate }) {
  const currentRef = React.useRef(null);
  React.useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest' });
  }, [currentId]);
  const replyNow = queue.filter(l => l.unread);
  const followUps = queue.filter(l => !l.unread);
  const renderItem = (l) => {
    const isCurrent = String(l.id) === String(currentId);
    return (
      <button
        key={l.id}
        ref={isCurrent ? currentRef : null}
        type="button"
        className={'dq-item' + (isCurrent ? ' is-current' : '')}
        onClick={() => onNavigate(l.id)}
      >
        <span className="dq-item-top">
          {l.unread && <span className="dq-dot" />}
          <span className="dq-brand">{l.brand}</span>
          <span className={'dq-age' + ((l.daysInStage || 0) >= 10 ? ' is-late' : '')}>{l.daysInStage || 0}d</span>
        </span>
        <span className="dq-move">{l.nextMove?.text || l.contactName}</span>
      </button>
    );
  };
  return (
    <nav className="drawer-queue" aria-label="Lead queue">
      {replyNow.length > 0 && (
        <div className="dq-subhead is-hot"><span>Reply now</span><span>{replyNow.length}</span></div>
      )}
      {replyNow.map(renderItem)}
      {followUps.length > 0 && (
        <div className="dq-subhead"><span>Follow ups</span><span>{followUps.length}</span></div>
      )}
      {followUps.map(renderItem)}
      {queue.length === 0 && <div className="dq-empty">Queue is clear.</div>}
      <div className="dq-hints">
        <span><kbd>J</kbd><kbd>K</kbd> move</span>
        <span><kbd>R</kbd> reply</span>
        <span><kbd>E</kbd> archive</span>
        <span><kbd>Esc</kbd> close</span>
      </div>
    </nav>
  );
}

function V3Drawer({ lead, user, queue = [], onNavigate, onClose }) {
  const { STAGE_BY_ID, USERS, ACTIVE_STAGE_IDS } = window.V3;
  // Open straight to the Brief tab when there's something requiring action,
  // otherwise lead with the real conversation
  const pickInitialTab = (l) => (l?.brief && (
    (user === 'asher' && l.brief.status === 'awaiting-approval') ||
    (user === 'robert' && l.brief.status === 'ready')
  )) ? 'brief' : 'thread';
  const [tab, setTab] = React.useState(() => pickInitialTab(lead));
  // The composer stays out of the way unless you owe a reply or ask for it
  const [composeOpen, setComposeOpen] = React.useState(() => Boolean(lead?.unread));
  // Reset to the right defaults whenever the drawer switches to a different lead.
  React.useEffect(() => {
    setTab(pickInitialTab(lead));
    setComposeOpen(Boolean(lead?.unread));
  }, [lead?.id]);

  const queueIndex = queue.findIndex(l => String(l.id) === String(lead?.id));
  const goTo = React.useCallback((delta) => {
    if (!queue.length || !onNavigate) return;
    const idx = queue.findIndex(l => String(l.id) === String(lead?.id));
    const next = idx === -1 ? queue[0] : queue[Math.min(queue.length - 1, Math.max(0, idx + delta))];
    if (next && String(next.id) !== String(lead?.id)) onNavigate(next.id);
  }, [queue, lead?.id, onNavigate]);

  // E — archive the thread and advance, Superhuman style. The queue
  // recomputes from the leads-loaded event MoveLeadStage fires.
  const archiveAndAdvance = React.useCallback(() => {
    if (!lead) return;
    const idx = queue.findIndex(l => String(l.id) === String(lead.id));
    const next = idx === -1 ? queue[0] : (queue[idx + 1] || queue[idx - 1]);
    window.V3.MoveLeadStage(lead, 'trash');
    if (next && String(next.id) !== String(lead.id) && onNavigate) onNavigate(next.id);
    else onClose?.();
  }, [lead, queue, onNavigate, onClose]);

  // Superhuman keys: J/K walk the queue, R replies, E archives, Esc backs out.
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (composeOpen) setComposeOpen(false);
        else onClose?.();
        return;
      }
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'j' || e.key === 'J' || e.key === 'ArrowDown') { e.preventDefault(); goTo(1); }
      if (e.key === 'k' || e.key === 'K' || e.key === 'ArrowUp')   { e.preventDefault(); goTo(-1); }
      if (e.key === 'r' || e.key === 'R') { e.preventDefault(); setComposeOpen(true); }
      if (e.key === 'e' || e.key === 'E') { e.preventDefault(); archiveAndAdvance(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goTo, onClose, composeOpen, archiveAndAdvance]);

  if (!lead) return null;
  const stage = STAGE_BY_ID[lead.stage];
  const owner = lead.ownerId ? USERS[lead.ownerId] : null;
  const nextOwner = lead.nextMove.who ? USERS[lead.nextMove.who] : null;
  const isMine = window.V3.MoveIsMineForProfile(lead, user);
  const isThem = !lead.nextMove.who && !['paid-out'].includes(lead.stage);
  const replyAction = ['Reply', 'Send', 'Nudge'].includes(lead.nextMove.action);

  return (
    <>
      <div className="backdrop show" onClick={onClose} />
      <aside className={'drawer' + (queue.length ? ' drawer-split' : '')}>
        {queue.length > 0 && (
          <V3DrawerQueue queue={queue} currentId={lead.id} onNavigate={onNavigate} />
        )}
        <div className="drawer-main">
        <div className="drawer-hd">
          <button className="hd-icon-btn" onClick={onClose} aria-label="Close">
            <V3Icon name="x" w={15} />
          </button>
          <span className="drawer-hd-brand">{lead.brand}</span>
          {queue.length > 0 && (
            <span className="drawer-hd-nav">
              <span className="drawer-hd-pos">{queueIndex === -1 ? '—' : (queueIndex + 1) + ' of ' + queue.length}</span>
              <button className="hd-icon-btn" onClick={() => goTo(-1)} disabled={queueIndex <= 0} aria-label="Previous lead" title="Previous (K)">
                <V3Icon name="chev_d" w={13} style={{ transform: 'rotate(180deg)' }} />
              </button>
              <button className="hd-icon-btn" onClick={() => goTo(1)} disabled={queueIndex !== -1 && queueIndex >= queue.length - 1} aria-label="Next lead" title="Next (J)">
                <V3Icon name="chev_d" w={13} />
              </button>
            </span>
          )}
          <span className="drawer-hd-stage" style={{ color: stage.color }}>
            <span className="drawer-hd-stage-dot" style={{ background: stage.color }}></span>
            {stage.name}
          </span>
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
          {isMine && replyAction && (
            <div className="next-move-actions">
              <button className="btn btn-sm btn-accent" onClick={() => setComposeOpen(true)}>
                <V3Icon name="arrow_r" w={13} />
                {lead.nextMove.action}
              </button>
            </div>
          )}
        </div>

        {/* Key facts — one compact strip instead of a six-row grid */}
        <div className="drawer-facts">
          {lead.value ? <span className="drawer-fact mono">{v3Money(lead.value)}</span> : null}
          {owner && (
            <span className="drawer-fact">
              <V3Avatar name={owner.name} color={owner.color} size="xs" /> {owner.name}
            </span>
          )}
          <span className="drawer-fact mono">{lead.daysInStage}d in stage</span>
          <span className="drawer-fact">{lead.source}</span>
          {lead.deliverables ? <span className="drawer-fact drawer-fact-wide" title={lead.deliverables}>{lead.deliverables}</span> : null}
        </div>

        {/* Tabs */}
        <div className="drawer-tabs">
          <button className="dr-tab" aria-selected={tab === 'thread'} onClick={() => setTab('thread')}>
            Email thread <span className="cnt">{lead.thread.length}</span>
          </button>
          {lead.brief && (
            <button className="dr-tab" aria-selected={tab === 'brief'} onClick={() => setTab('brief')}>
              Brief
              {lead.brief.status === 'awaiting-approval' && user === 'asher' && (
                <span className="dr-tab-dot" title="Awaiting your approval"></span>
              )}
            </button>
          )}
          <button className="dr-tab" aria-selected={tab === 'stands'} onClick={() => setTab('stands')}>
            Where this stands
          </button>
        </div>

        {/* Body */}
        <div className="drawer-body">
          {tab === 'stands' && <V3Stands lead={lead} />}
          {tab === 'brief' && lead.brief && <V3BriefPanel lead={lead} user={user} />}
          {tab === 'thread' && <V3Thread lead={lead} />}
        </div>

        <div className="drawer-foot">
          {composeOpen ? (
            <V3InlineReply lead={lead} user={user} onCollapse={() => setComposeOpen(false)} />
          ) : (
            <button className="drawer-reply-bar" onClick={() => setComposeOpen(true)}>
              <V3Icon name="reply" w={14} />
              <span>Reply to {lead.contactName.split(' ')[0]}{lead.draftReply ? ' — draft ready' : ''}</span>
              <V3Icon name="chev_d" w={12} style={{ transform: 'rotate(180deg)' }} />
            </button>
          )}
        </div>
        </div>
      </aside>
    </>
  );
}

function V3InlineReply({ lead, user, onCollapse }) {
  const [sender, setSender] = React.useState(() => V3SenderForUser(user));
  const [internalOnly, setInternalOnly] = React.useState(false);
  const draft = React.useMemo(() => V3ComposeReplyDraft(lead, sender), [lead.id, lead.draftReply?.body, lead.draftReply?.subject, lead.thread.length, lead.lastTouchAt, sender]);
  const initialRecipients = React.useMemo(() => V3ReplyRecipients(lead, sender, internalOnly), [lead.id, sender, internalOnly]);
  const [to, setTo] = React.useState(initialRecipients.to);
  const [cc, setCc] = React.useState(initialRecipients.cc);
  const [toDraft, setToDraft] = React.useState('');
  const [ccDraft, setCcDraft] = React.useState('');
  const [body, setBody] = React.useState(draft.body);
  const [attachPdf, setAttachPdf] = React.useState(false);
  const [status, setStatus] = React.useState('draft');
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState('');
  const successTimer = React.useRef(null);
  const subject = V3SubjectForLead(lead);
  const toLine = to.join(',');
  const ccLine = cc.join(',');
  const isSelfRecipient = V3IsSelfRecipient(sender, toLine);

  const clearSuccessTimer = () => {
    if (successTimer.current) {
      clearTimeout(successTimer.current);
      successTimer.current = null;
    }
  };

  const showSuccess = (message) => {
    clearSuccessTimer();
    setSuccess(message);
    successTimer.current = setTimeout(() => {
      setSuccess('');
      setStatus('draft');
      successTimer.current = null;
    }, 2500);
  };

  React.useEffect(() => {
    const nextSender = V3SenderForUser(user);
    const next = V3ReplyRecipients(lead, nextSender, false);
    const nextDraft = V3ComposeReplyDraft(lead, nextSender);
    setSender(nextSender);
    setInternalOnly(false);
    setTo(next.to);
    setCc(next.cc);
    setToDraft('');
    setCcDraft('');
    setBody(nextDraft.body);
    setAttachPdf(false);
    setStatus('draft');
    setError('');
    setSuccess('');
    clearSuccessTimer();
  }, [lead.id, lead.draftReply?.body, lead.draftReply?.subject, lead.thread.length, lead.lastTouchAt, user]);

  React.useEffect(() => {
    const next = V3ReplyRecipients(lead, sender, internalOnly);
    const nextDraft = V3ComposeReplyDraft(lead, sender);
    setTo(next.to);
    setCc(next.cc);
    setToDraft('');
    setCcDraft('');
    setBody(nextDraft.body);
    setError('');
    setSuccess('');
  }, [sender, internalOnly, lead.id, lead.draftReply?.body, lead.draftReply?.subject, lead.thread.length, lead.lastTouchAt]);

  React.useEffect(() => () => clearSuccessTimer(), []);

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
    const msg = V3EnsureSenderSignature(body.trim(), sender);
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
      window.dispatchEvent(new CustomEvent('v3:email-sent', { detail: { leadId: lead.id, sender, subject, body: msg, to: to.slice(), cc: cc.slice(), internalOnly } }));
      setBody('');
      setError('');
      setStatus('sent');
      showSuccess(`Sent to ${recipient}${ccLine ? ' · CC ' + ccLine : ''}`);
    } catch (err) {
      clearSuccessTimer();
      setStatus('error');
      setError(err.message || 'Send failed');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, width: '100%' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 180px) 1fr auto', gap: 7 }}>
        <select className="brief-input" value={sender} disabled={status === 'sending'} onChange={e => setSender(e.target.value)} title="Sender">
          <option value="robert">Robert Scoble</option>
          <option value="sam">Sam Levin / UnalignedX</option>
          <option value="asher">Asher</option>
        </select>
        <button className={'btn btn-sm ' + (internalOnly ? 'btn-accent' : 'btn-ghost')} type="button" disabled={status === 'sending'} onClick={() => setInternalOnly(value => !value)} title="Send only to Robert, Sam, and Asher">
          <V3Icon name="mail" w={12} /> {internalOnly ? 'Internal email chain' : 'Talk internally'}
        </button>
        {onCollapse && (
          <button className="btn btn-sm btn-ghost" type="button" onClick={onCollapse} title="Hide composer" aria-label="Hide composer">
            <V3Icon name="chev_d" w={12} />
          </button>
        )}
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
        <div style={{ flex: 1, minWidth: 0, fontSize: 10.5, color: success ? 'var(--good)' : error ? 'var(--bad)' : 'var(--text-3)' }}>
          {success || error || (isSelfRecipient ? `${V3SenderName(sender)} is also a recipient. Remove them before sending.` : status === 'sent' ? 'Sent.' : `Lead chain · sending as ${V3SenderName(sender)}${lead.gmailThreadId && sender === 'robert' ? ' in the Gmail thread' : ''}`)}
        </div>
        <button
          className={'btn btn-sm ' + (status === 'sent' ? 'btn-success' : 'btn-accent')}
          onClick={send}
          disabled={status === 'sending'}
          aria-live="polite"
        >
          <V3Icon name={status === 'sent' ? 'check' : 'send'} w={12} /> {status === 'sending' ? 'Sending…' : status === 'sent' ? 'Sent' : 'Send'}
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
    </>
  );
}

function V3Thread({ lead }) {
  const messages = React.useMemo(() => {
    const source = Array.isArray(lead?.thread) ? lead.thread : [];
    return [...source].sort((a, b) =>
      V3TimestampForUi(a.date || a.dateIso || a.timestamp || a.when) -
      V3TimestampForUi(b.date || b.dateIso || b.timestamp || b.when)
    );
  }, [lead?.id, lead?.thread]);
  return (
    <div className="act">
      <div className="act-thread-meta">
        <span>{messages.length} email{messages.length === 1 ? '' : 's'}</span>
        {lead.gmailThreadId && <span>Gmail thread {String(lead.gmailThreadId).slice(-8)}</span>}
        {messages[0] && <span>Started {window.V3.GmailTime.full(messages[0].date || messages[0].when) || messages[0].when}</span>}
      </div>
      {messages.map((m, i) => {
        const senderEmail = V3ExtractEmail(m.from) ||
          (m.from === 'Asher' ? 'asherunaligned@gmail.com' :
           m.from === 'Sammy' ? 'unalignedx@gmail.com' :
           m.from === 'Robert' ? 'scobleizer@gmail.com' : '');
        const dateValue = m.date || m.dateIso || m.timestamp || m.when;
        return (
          <div key={i} className="act-item">
            <div className="act-item-hd">
              <V3Avatar name={m.from} color={m.from === 'Sammy' ? '#16894a' : m.from === 'Asher' ? '#2f5fd6' : lead.color} size="xs" />
              <div className="act-item-sender">
                <div className="act-item-from-row">
                  <span className="from">{m.from || 'Unknown sender'}</span>
                  {senderEmail && <span className="from-email">&lt;{senderEmail}&gt;</span>}
                  {m.pending && <span className="act-item-pending">Pending sync</span>}
                </div>
                {m.subject && <div className="act-item-subject">{m.subject}</div>}
                {(m.to?.length || m.cc?.length || m.replyTo?.length) ? (
                  <div className="act-item-participants">
                    {m.to?.length ? <span><strong>To:</strong> {m.to.join(', ')}</span> : null}
                    {m.cc?.length ? <span><strong>Cc:</strong> {m.cc.join(', ')}</span> : null}
                    {m.replyTo?.length ? <span><strong>Reply-To:</strong> {m.replyTo.join(', ')}</span> : null}
                  </div>
                ) : null}
              </div>
              <div className="act-item-time-wrap">
                <span className="time" title={window.V3.GmailTime.tooltip(dateValue) || undefined}>
                  {window.V3.GmailTime.full(dateValue) || m.when || ''}
                </span>
                {window.V3.GmailTime.relative(dateValue) && <span className="time-rel">{window.V3.GmailTime.relative(dateValue)}</span>}
              </div>
            </div>
            <div className="act-item-body">{m.body}</div>
          </div>
        );
      })}
    </div>
  );
}

Object.assign(window, { V3Drawer });
