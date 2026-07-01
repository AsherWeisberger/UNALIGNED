// FLOW v4 — Today / Inbox / Leads views
// Today rebuilt as a tabbed work surface: NOW · NEXT · LATER · DONE.
// NOW = big action cards. NEXT/LATER = compact rows.

const V4_ROBERT_BRIEF_STORAGE_KEY = 'v4-robert-brief-complete';
const V4_ROBERT_BRIEF_TO = 'asherunaligned@gmail.com';

function V4RobertBriefReplyDraft(brief) {
  const first = 'Asher';
  const title = String(brief?.title || 'the brief');
  return [
    `Hi ${first},`,
    '',
    `Can you send a little more information on ${title}?`,
    '',
    'Specifically, I’d love:',
    '• the final posting direction',
    '• any hard do / do not notes',
    '• whether anything needs to be approved before I move',
    '',
    'Thanks,',
  ].join('\n');
}

function V4LeadToRobertBrief(lead) {
  if (!lead) return null;
  return {
    id: lead.briefId || lead.id,
    title: lead.briefTitle || lead.title || 'Robert brief',
    subtitle: lead.briefSubtitle || lead.subtitle || '',
    subject: lead.briefSubject || lead.subject || '',
    gmailThreadId: lead.gmailThreadId || lead.briefThreadId || '',
    sentAt: lead.briefSentAt || lead.sentAt || lead.date_received_iso || lead.lastTouchAt || '',
    from: lead.briefFrom || lead.from || '',
    to: Array.isArray(lead.briefTo) ? lead.briefTo : [],
    cc: Array.isArray(lead.briefCc) ? lead.briefCc : [],
    status: lead.briefStatus || lead.status || 'ready',
    partner: lead.briefPartner || lead.partner || lead.contactName || '',
    company: lead.briefCompany || lead.company || lead.brand || '',
    summary: lead.briefSummary || lead.summary || '',
    body: lead.briefBody || lead.body || '',
    action: lead.briefAction || lead.action || '',
    notes: Array.isArray(lead.briefNotes) ? lead.briefNotes : [],
    attachment: lead.briefAttachment || null,
    links: Array.isArray(lead.briefLinks) ? lead.briefLinks : [],
  };
}

function V4RobertBriefView({ leads = [], query = '' }) {
  const q = String(query || '').trim().toLowerCase();
  const briefs = React.useMemo(() => {
    const liveBriefs = (Array.isArray(leads) ? leads : [])
      .filter(item => item && item.isRobertBrief)
      .map(V4LeadToRobertBrief)
      .filter(Boolean);
    const sourceBriefs = liveBriefs.length ? liveBriefs : (window.V3.ROBERT_BRIEFS || []);
    return sourceBriefs.filter(b => !q || [
      b.title, b.subtitle, b.subject, b.partner, b.company, b.summary, b.body, b.action, (b.notes || []).join(' ')
    ].filter(Boolean).some(value => String(value).toLowerCase().includes(q)));
  }, [q, leads]);
  const [modalId, setModalId] = React.useState(null);
  const [completedIds, setCompletedIds] = React.useState(() => {
    try {
      return JSON.parse(window.localStorage.getItem(V4_ROBERT_BRIEF_STORAGE_KEY) || '[]') || [];
    } catch (e) {
      return [];
    }
  });
  const [replyOpen, setReplyOpen] = React.useState(false);
  const [replyBody, setReplyBody] = React.useState('');
  const [replyStatus, setReplyStatus] = React.useState('idle');
  const [replyError, setReplyError] = React.useState('');
  const [replySuccess, setReplySuccess] = React.useState('');
  const replyTimer = React.useRef(null);
  const modalBrief = briefs.find(b => String(b.id) === String(modalId)) || null;
  const completedSet = React.useMemo(() => new Set(completedIds.map(id => String(id))), [completedIds]);
  const orderedBriefs = React.useMemo(() => {
    return [...briefs].sort((a, b) => {
      const aDone = completedSet.has(String(a.id));
      const bDone = completedSet.has(String(b.id));
      if (aDone !== bDone) return aDone ? 1 : -1;
      return new Date(b.sentAt || 0) - new Date(a.sentAt || 0);
    });
  }, [briefs, completedSet]);

  React.useEffect(() => {
    try {
      window.localStorage.setItem(V4_ROBERT_BRIEF_STORAGE_KEY, JSON.stringify(completedIds));
    } catch (e) {}
  }, [completedIds]);

  React.useEffect(() => () => {
    if (replyTimer.current) clearTimeout(replyTimer.current);
  }, []);

  const counts = {
    total: briefs.length,
    urgent: briefs.filter(b => String(b.subtitle || '').toLowerCase().includes('time-sensitive') || String(b.summary || '').toLowerCase().includes('today')).length,
    ready: briefs.filter(b => b.status === 'ready').length,
    completed: completedIds.length,
  };

  const openBrief = (brief, openReply = false) => {
    setModalId(brief.id);
    setReplyOpen(openReply);
    setReplyBody(openReply ? V4RobertBriefReplyDraft(brief) : '');
    setReplyStatus('idle');
    setReplyError('');
    setReplySuccess('');
  };

  const toggleComplete = (brief) => {
    setCompletedIds(curr => {
      const id = String(brief.id);
      return curr.map(String).includes(id) ? curr.filter(item => String(item) !== id) : [...curr, brief.id];
    });
  };

  const sendReply = async () => {
    if (!modalBrief) return;
    const body = window.V3EnsureSenderSignature(String(replyBody || '').trim(), 'robert');
    if (!body) {
      setReplyError('Write a message before sending.');
      return;
    }
    setReplyStatus('sending');
    setReplyError('');
    setReplySuccess('');
    try {
      await window.V3SendLeadEmail({
        lead: { gmailThreadId: modalBrief.gmailThreadId || null },
        sender: 'robert',
        to: V4_ROBERT_BRIEF_TO,
        cc: '',
        subject: window.V3SubjectForLead({ thread: [{ subject: modalBrief.subject }] }),
        body,
        attachPdf: false,
      });
      window.dispatchEvent(new CustomEvent('v3:email-sent', {
        detail: {
          leadId: modalBrief.id,
          sender: 'robert',
          subject: modalBrief.subject,
          body,
          to: [V4_ROBERT_BRIEF_TO],
          cc: [],
          internalOnly: false,
        },
      }));
      setReplyStatus('sent');
      setReplySuccess('Sent to Asher.');
      if (replyTimer.current) clearTimeout(replyTimer.current);
      replyTimer.current = setTimeout(() => {
        setReplyStatus('idle');
        setReplySuccess('');
        replyTimer.current = null;
      }, 2500);
    } catch (err) {
      setReplyStatus('error');
      setReplyError(err.message || 'Send failed');
    }
  };

  return (
    <div className="page brief-page">
      <div className="page-hd">
        <div>
          <div className="page-eyebrow">Robert</div>
          <h1 className="page-title">Briefs</h1>
          <div className="page-sub">Official posting briefs Asher sent by email.</div>
        </div>
        <div className="invoice-stats">
          <span className="invoice-stat warn">{counts.urgent} urgent</span>
          <span className="invoice-stat good">{counts.ready} ready</span>
          <span className="invoice-stat total">{counts.completed} complete</span>
          <span className="invoice-stat total">{counts.total} total</span>
        </div>
      </div>

      <div className="body brief-body">
        <div className="brief-list">
          {orderedBriefs.map(brief => {
            const isComplete = completedSet.has(String(brief.id));
            return (
              <div
                key={brief.id}
                role="button"
                tabIndex={0}
                className={'brief-card' + (isComplete ? ' is-complete' : '')}
                onClick={() => openBrief(brief, false)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openBrief(brief, false);
                  }
                }}
              >
                <div className="brief-card-top">
                  <V3Avatar name={brief.partner} color={__v3Color(brief.partner)} size="xs" />
                  <div className="brief-card-top-text">
                    <div className="brief-card-partnership">{brief.title}</div>
                    <div className="brief-card-meta">{brief.subject}</div>
                  </div>
                  <span className="brief-card-stage">{isComplete ? 'COMPLETED' : (brief.status === 'ready' ? 'READY' : 'BRIEF')}</span>
                </div>
                <div className="brief-card-summary">{brief.summary}</div>
                <div className="brief-card-foot">
                  <span className="brief-card-note">Tap for details</span>
                  <span className="brief-card-mini">{window.V3.GmailTime.list(brief.sentAt) || brief.sentAt}</span>
                </div>
                <div className="brief-card-actions" onClick={e => e.stopPropagation()}>
                  <button
                    type="button"
                    className={'btn btn-sm brief-card-cta ' + (isComplete ? 'btn-success' : 'btn-accent')}
                    onClick={() => toggleComplete(brief)}
                  >
                    <V3Icon name={isComplete ? 'check' : 'spark'} w={12} />
                    {isComplete ? 'Completed' : 'Complete'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost brief-card-reply"
                    onClick={() => openBrief(brief, true)}
                  >
                    <V3Icon name="reply" w={12} />
                    Reply to Asher
                  </button>
                </div>
              </div>
            );
          })}
          {briefs.length === 0 && <V3Empty icon="doc" title="No official posting briefs found." sub="Try searching the email title or partner name." />}
        </div>
      </div>
      {modalBrief && (
        <div className="brief-modal-backdrop" onClick={() => { setModalId(null); setReplyOpen(false); }}>
          <div className="brief-modal-panel" onClick={e => e.stopPropagation()}>
            <div className="brief-modal-hd">
              <div>
                <div className="brief-modal-eyebrow">Official posting</div>
                <h2 className="brief-modal-title">{modalBrief.title}</h2>
              </div>
              <div className="brief-modal-hd-actions">
                <button
                  type="button"
                  className={'btn btn-sm ' + (completedSet.has(String(modalBrief.id)) ? 'btn-success' : 'btn-accent')}
                  onClick={() => toggleComplete(modalBrief)}
                >
                  <V3Icon name={completedSet.has(String(modalBrief.id)) ? 'check' : 'spark'} w={12} />
                  {completedSet.has(String(modalBrief.id)) ? 'Completed' : 'Complete'}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => openBrief(modalBrief, true)}
                >
                  <V3Icon name="reply" w={12} />
                  Reply to Asher
                </button>
                <button className="brief-modal-close" onClick={() => { setModalId(null); setReplyOpen(false); }} aria-label="Close brief">
                  <V3Icon name="x" w={14} />
                </button>
              </div>
            </div>
            <div className="brief-modal-body">
              <div className="brief-modal-row">
                <div className="brief-modal-label">Subject</div>
                <div className="brief-modal-copy">{modalBrief.subject}</div>
              </div>
              <div className="brief-modal-grid">
                <div>
                  <div className="brief-modal-label">From</div>
                  <div className="brief-modal-copy">{modalBrief.from}</div>
                </div>
                <div>
                  <div className="brief-modal-label">To</div>
                  <div className="brief-modal-copy">{modalBrief.to.join(', ')}</div>
                </div>
              </div>
              <div className="brief-modal-grid">
                <div>
                  <div className="brief-modal-label">Partner</div>
                  <div className="brief-modal-copy">{modalBrief.partner}</div>
                </div>
                <div>
                  <div className="brief-modal-label">Company</div>
                  <div className="brief-modal-copy">{modalBrief.company}</div>
                </div>
              </div>
              <div className="brief-modal-row">
                <div className="brief-modal-label">What Robert should do</div>
                <div className="brief-modal-copy">{modalBrief.action}</div>
              </div>
              <div className="brief-modal-row">
                <div className="brief-modal-label">Brief text</div>
                <div className="brief-modal-copy brief-modal-pre">{modalBrief.body}</div>
              </div>
              {modalBrief.attachment && (
                <div className="brief-modal-row">
                  <div className="brief-modal-label">Attachment</div>
                  <div className="brief-modal-copy">
                    {modalBrief.attachment.filename} · {modalBrief.attachment.type}
                  </div>
                </div>
              )}
              {(modalBrief.links || []).length > 0 && (
                <div className="brief-modal-row">
                  <div className="brief-modal-label">Links</div>
                  <div className="brief-modal-copy">
                    {modalBrief.links.map(link => (
                      <div key={link.href}><a href={link.href} target="_blank" rel="noreferrer">{link.label}</a></div>
                    ))}
                  </div>
                </div>
              )}
              {modalBrief.notes?.length > 0 && (
                <div className="brief-modal-row">
                  <div className="brief-modal-label">Notes</div>
                  <div className="brief-modal-copy">{modalBrief.notes.join(' · ')}</div>
                </div>
              )}
              <div className="brief-modal-row brief-reply-panel">
                <div className="brief-modal-label">Reply to Asher</div>
                <div className="brief-reply-hint">From Robert Scoble to {V4_ROBERT_BRIEF_TO}</div>
                {!replyOpen ? (
                  <div className="brief-reply-compact">
                    <button className="btn btn-sm btn-accent" type="button" onClick={() => openBrief(modalBrief, true)}>
                      <V3Icon name="reply" w={12} />
                      Open reply
                    </button>
                    <span className="brief-card-note">Send a quick question if Robert needs more detail.</span>
                  </div>
                ) : (
                  <>
                    <input
                      className="brief-input"
                      value={'Re: ' + modalBrief.subject.replace(/^re:\s*/i, '')}
                      readOnly
                      aria-label="Reply subject"
                    />
                    <textarea
                      className="brief-input"
                      style={{ minHeight: 118, resize: 'vertical' }}
                      value={replyBody}
                      disabled={replyStatus === 'sending'}
                      onChange={e => setReplyBody(e.target.value)}
                      placeholder="Ask Asher for any missing details..."
                    />
                    <div className="brief-reply-foot">
                      <div className="brief-reply-status">
                        {replySuccess || replyError || (replyStatus === 'sent' ? 'Sent.' : `Sending as Robert Scoble to Asher.`)}
                      </div>
                      <button
                        className={'btn btn-sm ' + (replyStatus === 'sent' ? 'btn-success' : 'btn-accent')}
                        type="button"
                        disabled={replyStatus === 'sending'}
                        onClick={sendReply}
                      >
                        <V3Icon name={replyStatus === 'sent' ? 'check' : 'send'} w={12} />
                        {replyStatus === 'sending' ? 'Sending…' : replyStatus === 'sent' ? 'Sent' : 'Send reply'}
                      </button>
                    </div>
                  </>
                )}
              </div>
              <div className="brief-modal-actions">
                <span className="brief-card-note">Sent {window.V3.GmailTime.full(modalBrief.sentAt) || modalBrief.sentAt}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function V4AgentTone(active, blocked) {
  if (blocked) return 'blocked';
  if (active > 0) return 'active';
  return 'clear';
}

function V4AgentViewItems(leads, fn, limit = 4) {
  return leads.filter(fn).slice(0, limit);
}

function V4AgentCapsuleSummary(lead) {
  if (!lead) return 'Review thread';
  const primary = String(
    lead.nextMove?.text ||
    lead.deliverables ||
    lead.operatorSummary?.next_action ||
    lead.operatorSummary?.lead_summary ||
    lead.notes ||
    lead.evidence ||
    lead.summary ||
    ''
  ).replace(/\s+/g, ' ').trim();
  if (!primary) return 'Review thread';
  if (primary.length <= 88) return primary;
  return primary.slice(0, 85).trim() + '...';
}

function V4AgentCapsuleMeta(lead) {
  const stage = String(lead?.stage || '').toLowerCase();
  if (lead?.unread || lead?.needsReply) return 'Needs reply';
  if (lead?.followUpDue) return 'Follow up due';
  if (stage === 'invoice-sent') return 'Payment check';
  if (stage === 'done') return 'Brief ready';
  if (stage === 'negotiating') return 'Negotiation';
  if (stage === 'rates-sent') return 'Pricing';
  if (String(lead?.source || '').toLowerCase().includes('x')) return 'X lead';
  return 'Live thread';
}

function V4WorkerPortrait({ worker, compact = false, isActive = false }) {
  const size = compact ? 54 : 78;
  const eyeY = compact ? 28 : 35;
  const variant = worker.id;
  // Restrained: almost always the single electric accent. Per-worker hue only as tiny signal.
  const accentColor = '#3b82f6';

  return (
    <svg 
      viewBox="0 0 100 100" 
      width={size} 
      height={size} 
      className={`worker-portrait ${isActive ? 'is-active' : ''}`} 
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={`glow-${variant}`} cx="32%" cy="26%" r="68%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>

      {/* Clean precision body — minimal, instrument-like */}
      <rect 
        x="14" y="16" width="72" height="68" rx="22" 
        fill="#0f1116" 
        stroke={accentColor} 
        strokeWidth="1.25" 
        strokeOpacity={isActive ? "0.9" : "0.4"}
      />

      {/* Subtle top plane */}
      <rect 
        x="18" y="20" width="64" height="22" rx="12" 
        fill="#1a1d24" 
        opacity="0.55" 
      />

      {/* Refined eyes — data points, not faces */}
      <g className="worker-portrait-eyes">
        <circle cx="34" cy={eyeY} r="3.6" fill="#0b0d11" />
        <circle cx="34" cy={eyeY} r="1.6" fill={accentColor} opacity={isActive ? "1" : "0.75"} />
        <circle cx="66" cy={eyeY} r="3.6" fill="#0b0d11" />
        <circle cx="66" cy={eyeY} r="1.6" fill={accentColor} opacity={isActive ? "1" : "0.75"} />
      </g>

      {/* Minimal abstract glyph / signal for worker type (no cute mouths) */}
      {worker.id === 'pricing' && (
        <g fill="none" stroke={accentColor} strokeWidth="1.6" opacity="0.7">
          <path d="M30 50 L50 38 L70 50" />
          <circle cx="50" cy="44" r="2" fill={accentColor} opacity="0.5" />
        </g>
      )}
      {worker.id === 'brief' && (
        <g stroke={accentColor} strokeWidth="1.4" fill="none" opacity="0.65">
          <rect x="32" y="48" width="36" height="14" rx="2" />
          <line x1="38" y1="52" x2="62" y2="52" strokeWidth="1" />
        </g>
      )}
      {worker.id === 'calendar' && (
        <g fill={accentColor} opacity="0.55">
          <rect x="34" y="46" width="32" height="16" rx="2" />
          <rect x="38" y="42" width="3" height="6" />
          <rect x="59" y="42" width="3" height="6" />
        </g>
      )}
      {worker.id === 'xwatch' && (
        <g fill="none" stroke={accentColor} strokeWidth="1.6" opacity="0.6">
          <path d="M 30 55 Q 50 42 70 55" />
        </g>
      )}
      {worker.id === 'finance' && (
        <text x="50" y="57" textAnchor="middle" fill={accentColor} fontSize="13" fontWeight="700" opacity="0.65">$</text>
      )}

      {/* Living status — refined, sparse */}
      <g>
        <circle cx="32" cy="70" r="2.2" fill={accentColor} opacity={worker.active > 0 ? (isActive ? "1" : "0.85") : "0.15"} />
        <circle cx="50" cy="70" r="2.2" fill={accentColor} opacity={worker.waiting > 0 ? "0.9" : "0.12"} />
        <circle cx="68" cy="70" r="2.2" fill={accentColor} opacity={worker.blocked > 0 ? "0.95" : "0.12"} />
      </g>

      {/* Very restrained top glow — only when alive */}
      {isActive && (
        <circle cx="34" cy="28" r="26" fill={`url(#glow-${variant})`} opacity="0.28" />
      )}
    </svg>
  );
}

function V4WorkerActionLabel(worker) {
  const map = {
    intake: 'Routing new lead',
    reply: 'Drafting reply',
    pricing: 'Pricing thread',
    brief: 'Building Robert brief',
    calendar: 'Locking go-live date',
    finance: 'Chasing payment proof',
    followup: 'Follow-up nudge',
    xwatch: 'X intake watch',
    network: 'Relationship upkeep',
    handoff: 'Robert/Sam handoff',
  };
  return map[worker.id] || worker.subtitle || 'Working queue';
}

function V4LiveTaskFloor({ groupedWorkers, totalActive, liveWorkers, onOpenLead }) {
  const liveTasks = React.useMemo(() => {
    const rows = [];
    groupedWorkers.forEach((group) => {
      group.workers.forEach((worker) => {
        worker.items.forEach((item) => {
          rows.push({
            id: `${worker.id}-${item.id}`,
            leadId: item.id,
            workerId: worker.id,
            workerName: worker.name,
            workerGlyph: worker.glyph,
            zone: group.zone,
            zoneLabel: group.label,
            accent: worker.accent,
            tone: worker.tone,
            brand: item.brand || item.contactName || 'Unknown lead',
            contact: item.contactName || item.email || '',
            action: V4AgentCapsuleSummary(item),
            meta: V4AgentCapsuleMeta(item),
            blocked: worker.blocked > 0,
          });
        });
      });
    });
    return rows;
  }, [groupedWorkers]);

  const [focusIdx, setFocusIdx] = React.useState(0);
  React.useEffect(() => {
    if (!liveTasks.length) {
      setFocusIdx(0);
      return undefined;
    }
    const timer = setInterval(() => {
      setFocusIdx((i) => (i + 1) % liveTasks.length);
    }, 3200);
    return () => clearInterval(timer);
  }, [liveTasks.length]);

  const focusTask = liveTasks[focusIdx] || null;

  return (
    <div className="live-task-floor">
      <div className="live-task-floor-head">
        <div>
          <div className="live-task-floor-eyebrow">Live queue</div>
          <div className="live-task-floor-title">
            {liveTasks.length
              ? `${liveTasks.length} real tasks assigned across ${liveWorkers} workers`
              : 'All lanes clear — no live queue pressure'}
          </div>
        </div>
        <div className="live-task-floor-stats">
          <span className="live-task-stat">{totalActive} in motion</span>
          <span className="live-task-stat is-live">{liveWorkers} workers on duty</span>
        </div>
      </div>

      {focusTask && (
        <button
          type="button"
          className={`live-task-spotlight accent-${focusTask.accent} is-${focusTask.tone}`}
          onClick={() => onOpenLead?.(focusTask.leadId)}
        >
          <span className="live-task-spotlight-kicker">Now handling</span>
          <strong>{focusTask.workerName}</strong>
          <span className="live-task-spotlight-arrow">→</span>
          <strong>{focusTask.brand}</strong>
          <span className="live-task-spotlight-action">{focusTask.action}</span>
          <span className="live-task-spotlight-meta">{focusTask.meta} · {focusTask.zoneLabel}</span>
        </button>
      )}

      <div className="live-task-zones">
        {groupedWorkers.map((group) => (
          <section key={group.zone} className={`live-task-zone zone-${group.zone}`}>
            <header className="live-task-zone-head">
              <span>{group.label}</span>
              <b>{group.workers.reduce((sum, w) => sum + w.active, 0)}</b>
            </header>
            <div className="live-task-zone-body">
              {group.workers.map((worker) => (
                <article
                  key={worker.id}
                  className={`live-task-station accent-${worker.accent} is-${worker.tone} ${worker.active > 0 ? 'has-work' : ''}`}
                >
                  <div className="live-task-station-head">
                    <span className="live-task-station-glyph">{worker.glyph}</span>
                    <div>
                      <div className="live-task-station-name">{worker.name}</div>
                      <div className="live-task-station-verb">{V4WorkerActionLabel(worker)}</div>
                    </div>
                    <span className={`live-task-station-badge is-${worker.tone}`}>
                      {worker.blocked > 0 ? 'blocked' : worker.active > 0 ? 'working' : 'idle'}
                    </span>
                  </div>
                  {worker.items.length ? (
                    <div className="live-task-station-queue">
                      {worker.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="live-task-chip"
                          onClick={() => onOpenLead?.(item.id)}
                        >
                          <span className="live-task-chip-brand">{item.brand || item.contactName}</span>
                          <span className="live-task-chip-action">{V4AgentCapsuleSummary(item)}</span>
                          <span className="live-task-chip-meta">{V4AgentCapsuleMeta(item)}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="live-task-station-empty">{worker.note}</div>
                  )}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      {liveTasks.length > 0 && (
        <div className="live-task-feed" aria-live="polite">
          <div className="live-task-feed-label">Task rotation</div>
          <div className="live-task-feed-track">
            {liveTasks.map((task, index) => (
              <button
                key={task.id}
                type="button"
                className={`live-task-feed-item accent-${task.accent} ${index === focusIdx ? 'is-focus' : ''}`}
                onClick={() => { setFocusIdx(index); onOpenLead?.(task.leadId); }}
              >
                <span className="live-task-feed-worker">{task.workerName}</span>
                <span className="live-task-feed-brand">{task.brand}</span>
                <span className="live-task-feed-action">{task.action}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function V4AgentsView({ leads = [], query = '', onOpenLead }) {
  const q = String(query || '').trim().toLowerCase();
  const liveLeads = (Array.isArray(leads) ? leads : []).filter(l => l && !l.isRobertBrief && !['trash', 'dead-leads'].includes(String(l.stage || '').toLowerCase()));

  const newLeads = V4AgentViewItems(liveLeads, l =>
    (window.V3.IsNewLeadReview && window.V3.IsNewLeadReview(l)) ||
    ['new', 'first-touch', 'engaged'].includes(String(l.stage || '').toLowerCase())
  );
  const replyLeads = V4AgentViewItems(liveLeads, l => Boolean(l.unread || l.needsReply));
  const pricingLeads = V4AgentViewItems(liveLeads, l => ['rates-sent', 'negotiating'].includes(String(l.stage || '').toLowerCase()));
  const briefLeads = V4AgentViewItems(liveLeads, l => String(l.stage || '').toLowerCase() === 'done');
  const financeLeads = V4AgentViewItems(liveLeads, l => String(l.stage || '').toLowerCase() === 'invoice-sent');
  const followUps = V4AgentViewItems(liveLeads, l => Boolean(l.followUpDue));
  const xLeads = V4AgentViewItems(liveLeads, l => String(l.source || '').toLowerCase().includes('x') || String(l.source || '').toLowerCase().includes('twitter'));
  const calendarLeads = V4AgentViewItems(liveLeads, l => Boolean(l.goLiveDate || l.calendarDate || l.postingDate || l.dueDate));
  const networkLeads = V4AgentViewItems(liveLeads, l => ['follow-up', 'waiting-on-them', 'waiting', 'pitched'].includes(String(l.stage || '').toLowerCase()));
  const handoffLeads = V4AgentViewItems(liveLeads, l => Boolean(l.nextMove?.who) && /robert|sam/i.test(String(l.nextMove.who || '')));

  const workers = [
    {
      id: 'intake',
      name: 'Lead Intake',
      glyph: 'IN',
      accent: 'blue',
      habitat: 'north-west',
      zone: 'intake',
      subtitle: 'Cleans and routes new opportunities',
      owner: 'Asher',
      tone: V4AgentTone(newLeads.length, 0),
      active: newLeads.length,
      waiting: 0,
      blocked: 0,
      note: newLeads.length ? 'Fresh leads are waiting to be judged and routed.' : 'No new lead pile right now.',
      items: newLeads,
    },
    {
      id: 'reply',
      name: 'Reply Operator',
      glyph: 'RP',
      accent: 'violet',
      habitat: 'north-mid',
      zone: 'conversion',
      subtitle: 'Keeps hot threads moving',
      owner: 'Asher',
      tone: V4AgentTone(replyLeads.length, 0),
      active: replyLeads.length,
      waiting: 0,
      blocked: 0,
      note: replyLeads.length ? 'Unread or reply-now threads need fast action.' : 'No urgent reply lane right now.',
      items: replyLeads,
    },
    {
      id: 'pricing',
      name: 'Pricing Desk',
      glyph: 'PR',
      accent: 'gold',
      habitat: 'north-east',
      zone: 'conversion',
      subtitle: 'Handles packages, rates, and negotiation',
      owner: 'Asher + Sam',
      tone: V4AgentTone(pricingLeads.length, 0),
      active: pricingLeads.length,
      waiting: 0,
      blocked: 0,
      note: pricingLeads.length ? 'Pricing conversations are active and need clean package control.' : 'No live pricing back-and-forth at the moment.',
      items: pricingLeads,
    },
    {
      id: 'calendar',
      name: 'Calendar Runner',
      glyph: 'CL',
      accent: 'mint',
      habitat: 'east-high',
      zone: 'execution',
      subtitle: 'Turns timing into tasks, events, and go-live holds',
      owner: 'Asher',
      tone: V4AgentTone(calendarLeads.length, 0),
      active: calendarLeads.length,
      waiting: 0,
      blocked: 0,
      note: calendarLeads.length ? 'These deals have real dates attached and should stay visible on Robert’s calendar.' : 'No scheduled drops or meetings need calendar work right now.',
      items: calendarLeads,
    },
    {
      id: 'brief',
      name: 'Brief Maker',
      glyph: 'BF',
      accent: 'coral',
      habitat: 'east-low',
      zone: 'execution',
      subtitle: 'Turns sold deals into execution docs',
      owner: 'Asher',
      tone: V4AgentTone(briefLeads.length, 0),
      active: briefLeads.length,
      waiting: 0,
      blocked: 0,
      note: briefLeads.length ? 'These deals are sold and need clean Robert execution prep.' : 'No brief queue right now.',
      items: briefLeads,
    },
    {
      id: 'finance',
      name: 'Finance Loop',
      glyph: 'FN',
      accent: 'red',
      habitat: 'south-east',
      zone: 'retention',
      subtitle: 'Locks payment proof before live posting',
      owner: 'Asher',
      tone: V4AgentTone(financeLeads.length, financeLeads.length),
      active: financeLeads.length,
      waiting: financeLeads.length,
      blocked: financeLeads.length,
      note: financeLeads.length ? 'Money is still unresolved on these threads. No post should outrun proof.' : 'No payment blockers live right now.',
      items: financeLeads,
    },
    {
      id: 'followup',
      name: 'Follow Up Loop',
      glyph: 'FU',
      accent: 'amber',
      habitat: 'south-mid',
      zone: 'retention',
      subtitle: 'Revives threads after 2 days of silence',
      owner: 'Asher',
      tone: V4AgentTone(followUps.length, 0),
      active: followUps.length,
      waiting: followUps.length,
      blocked: 0,
      note: followUps.length ? 'These threads need nudges before they go stale.' : 'Silence queue is clear.',
      items: followUps,
    },
    {
      id: 'xwatch',
      name: 'X Watcher',
      glyph: 'XW',
      accent: 'sky',
      habitat: 'south-west',
      zone: 'intake',
      subtitle: 'Monitors X leads and routes real opportunities',
      owner: 'Robert source → Asher desk',
      tone: V4AgentTone(xLeads.length, 0),
      active: xLeads.length,
      waiting: 0,
      blocked: 0,
      note: xLeads.length ? 'X leads are in motion and should be turned into clean email threads.' : 'No live X intake pressure right now.',
      items: xLeads,
    },
    {
      id: 'network',
      name: 'Network Keeper',
      glyph: 'NW',
      accent: 'plum',
      habitat: 'west-low',
      zone: 'intake',
      subtitle: 'Keeps warm relationships from disappearing into clutter',
      owner: 'Asher',
      tone: V4AgentTone(networkLeads.length, 0),
      active: networkLeads.length,
      waiting: networkLeads.length,
      blocked: 0,
      note: networkLeads.length ? 'Warm contacts need context and gentle upkeep so they can be reactivated fast.' : 'The relationship layer is quiet right now.',
      items: networkLeads,
    },
    {
      id: 'handoff',
      name: 'Robert Handoff',
      glyph: 'RH',
      accent: 'slate',
      habitat: 'west-high',
      zone: 'conversion',
      subtitle: 'Flags what needs Robert or Sam to step in',
      owner: 'Robert + Sam',
      tone: V4AgentTone(handoffLeads.length, 0),
      active: handoffLeads.length,
      waiting: handoffLeads.length,
      blocked: 0,
      note: handoffLeads.length ? 'These threads need founder voice, approval, or a direct handoff to close the loop.' : 'No executive handoff pressure at the moment.',
      items: handoffLeads,
    },
  ];

  const filteredWorkers = workers.filter(worker => {
    if (!q) return true;
    return [
      worker.name,
      worker.subtitle,
      worker.owner,
      worker.note,
      ...worker.items.map(item => `${item.brand} ${item.contactName} ${item.nextMove?.text || ''}`),
    ].join(' ').toLowerCase().includes(q);
  });

  const totalActive = workers.reduce((sum, worker) => sum + worker.active, 0);
  const totalBlocked = workers.reduce((sum, worker) => sum + worker.blocked, 0);
  const totalWaiting = workers.reduce((sum, worker) => sum + worker.waiting, 0);
  const liveWorkers = workers.filter(worker => worker.active > 0).length;

  // Group for the map
  const zoneMeta = {
    intake: { label: 'Intake', color: '#3b82f6' },
    conversion: { label: 'Conversion', color: '#8b5cf6' },
    execution: { label: 'Execution', color: '#14b8a6' },
    retention: { label: 'Retention', color: '#f59e0b' },
  };
  const zoneOrder = ['intake', 'conversion', 'execution', 'retention'];
  const groupedWorkers = zoneOrder.map(zone => ({
    zone,
    ...zoneMeta[zone],
    workers: filteredWorkers.filter(worker => worker.zone === zone),
  }));

  const [selectedWorkerId, setSelectedWorkerId] = React.useState(null);

  const handleWorkerClick = (worker) => {
    setSelectedWorkerId(worker.id === selectedWorkerId ? null : worker.id);
    if (worker.items[0]) {
      // Optional: still allow opening lead
      // onOpenLead?.(worker.items[0].id);
    }
  };

  return (
    <div className="page workers-page">
      <div className="page-hd">
        <div>
          <div className="page-eyebrow">Autonomy</div>
          <h1 className="page-title">Machine Room</h1>
          <div className="page-sub">Every worker lane below is wired to live board data — brands, next moves, and queue pressure.</div>
        </div>
        <div className="invoice-stats">
          <span className="invoice-stat total">{liveWorkers} workers live</span>
          <span className="invoice-stat good">{totalActive} active</span>
          <span className="invoice-stat warn">{totalWaiting} waiting</span>
          <span className="invoice-stat bad">{totalBlocked} blocked</span>
        </div>
      </div>

      <div className="machine-theater machine-theater--live">
        <div className="theater-header">
          <div>
            <div className="theater-eyebrow">Live system</div>
            <div className="theater-title">Task Floor</div>
            <div className="theater-tagline">Real queue items, real worker lanes, real next moves from your board.</div>
          </div>
          <div className="theater-legend">
            <div><span className="dot"></span> Working lane</div>
            <div><span className="dot" style={{ background: '#f59e0b' }}></span> Waiting / blocked</div>
          </div>
        </div>

        <V4LiveTaskFloor
          groupedWorkers={groupedWorkers}
          totalActive={totalActive}
          liveWorkers={liveWorkers}
          onOpenLead={onOpenLead}
        />
      </div>

      {/* Worker Control Panels — Useful + Beautiful */}
      <div className="machine-panels">
        {filteredWorkers.map((worker, index) => (
          <div 
            key={worker.id}
            className={`machine-panel accent-${worker.accent} ${selectedWorkerId === worker.id ? 'is-selected' : ''} ${worker.active > 0 ? 'has-pressure' : ''}`}
            onClick={() => handleWorkerClick(worker)}
          >
            <div className="panel-head">
              <V4WorkerPortrait worker={worker} compact isActive={worker.tone === 'active'} />
              <div>
                <div className="panel-name">{worker.name}</div>
                <div className="panel-sub">{worker.subtitle}</div>
              </div>
              <div className={`panel-status is-${worker.tone}`}>
                {worker.active}
              </div>
            </div>

            <div className="panel-metrics">
              <div><span>Active</span><strong>{worker.active}</strong></div>
              <div><span>Waiting</span><strong>{worker.waiting}</strong></div>
              <div><span>Blocked</span><strong>{worker.blocked}</strong></div>
            </div>

            <div className="panel-note">{worker.note}</div>

            {worker.items.length > 0 && (
              <div className="panel-queue">
                <div className="queue-label">Live items</div>
                {worker.items.slice(0, 3).map(item => (
                  <div 
                    key={item.id} 
                    className="queue-item"
                    onClick={(e) => { e.stopPropagation(); onOpenLead?.(item.id); }}
                  >
                    <strong>{item.brand}</strong>
                    <span>{item.contactName} — {item.nextMove?.text?.slice(0, 60) || 'Open thread'}</span>
                  </div>
                ))}
                {worker.items.length > 3 && <div className="queue-more">+{worker.items.length - 3} more</div>}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="machine-footer-note">
        Every chip above is a live card from your board. Click a task to open the thread.
      </div>
    </div>
  );
}

const V4_INVOICE_GROUPS = [
  {
    id: 'outstanding',
    label: 'Outstanding',
    eyebrow: 'Awaiting payment or confirmation',
    note: 'These are still open and should stay visible until they are paid or explicitly closed.',
    tone: 'warn',
    buckets: [
      {
        label: 'Stripe',
        note: 'New Stripe invoices live here. Legacy manual invoices from your folders stay in their own buckets below.',
        items: [
          {
            id: 'stripe-in1tnb7mk0weauaymjhjytgwgu',
            title: 'eugenia x HASH MATRIX',
            company: 'eugenia@hashmatrix.xyz',
            folder: 'STRIPE / OPEN',
            source: 'Stripe',
            sourceDir: 'STRIPE',
            file: 'QDMSHZYY-0001',
            href: 'https://dashboard.stripe.com/invoices/in_1TnB7MK0WeauAYMJHjYTGWgU',
            kind: 'STRIPE',
            stripeStatus: 'open',
            stripePaid: false,
            stripeAmountDue: 2000.0,
            stripeAmountPaid: 0.0,
            stripeCurrency: 'USD',
            stripeDashboardUrl: 'https://dashboard.stripe.com/invoices/in_1TnB7MK0WeauAYMJHjYTGWgU',
            stripeHostedInvoiceUrl: 'https://invoice.stripe.com/i/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VbWtjYlFUM2taakpZa29iM0RJY2RWRWZ0WUd4c3hBLDE3MzM2MTY4Mw020043EU7qUu?s=ap',
            stripeInvoicePdf: 'https://pay.stripe.com/invoice/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VbWtjYlFUM2taakpZa29iM0RJY2RWRWZ0WUd4c3hBLDE3MzM2MTY4Mw020043EU7qUu/pdf?s=ap',
          },
          {
            id: 'stripe-in1tm0isk0weauaymjqeotw904',
            title: 'Vihaan Khanna, Atomik Growth,',
            company: 'vihaan@atomikgrowth.com',
            folder: 'STRIPE / OPEN',
            source: 'Stripe',
            sourceDir: 'STRIPE',
            file: 'TRBOL3JV-0001',
            href: 'https://dashboard.stripe.com/invoices/in_1Tm0ISK0WeauAYMJqeoTw904',
            kind: 'STRIPE',
            stripeStatus: 'open',
            stripePaid: false,
            stripeAmountDue: 1900.0,
            stripeAmountPaid: 0.0,
            stripeCurrency: 'USD',
            stripeDashboardUrl: 'https://dashboard.stripe.com/invoices/in_1Tm0ISK0WeauAYMJqeoTw904',
            stripeHostedInvoiceUrl: 'https://invoice.stripe.com/i/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VbFhOSDRVSWd4dVNDVDJuTTNhYm1ITHZZQlg0eER3LDE3MzM2MTY4Mw0200sSpRSUc3?s=ap',
            stripeInvoicePdf: 'https://pay.stripe.com/invoice/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VbFhOSDRVSWd4dVNDVDJuTTNhYm1ITHZZQlg0eER3LDE3MzM2MTY4Mw0200sSpRSUc3/pdf?s=ap',
          },
          {
            id: 'stripe-in1tlrt7k0weauaymj4ogww4mg',
            title: 'Peter Zheng',
            company: 'peterzheng@imerch.ai',
            folder: 'STRIPE / OPEN',
            source: 'Stripe',
            sourceDir: 'STRIPE',
            file: 'CYD6SSVP-0001',
            href: 'https://dashboard.stripe.com/invoices/in_1TlrT7K0WeauAYMJ4OgWW4mg',
            kind: 'STRIPE',
            stripeStatus: 'open',
            stripePaid: false,
            stripeAmountDue: 2575.0,
            stripeAmountPaid: 0.0,
            stripeCurrency: 'USD',
            stripeDashboardUrl: 'https://dashboard.stripe.com/invoices/in_1TlrT7K0WeauAYMJ4OgWW4mg',
            stripeHostedInvoiceUrl: 'https://invoice.stripe.com/i/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VbE9GanBDWHY1TG9CMUVYcVVuekZNYVoyR3VjVGs3LDE3MzM2MTY4Mw0200duxnTCFJ?s=ap',
            stripeInvoicePdf: 'https://pay.stripe.com/invoice/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VbE9GanBDWHY1TG9CMUVYcVVuekZNYVoyR3VjVGs3LDE3MzM2MTY4Mw0200duxnTCFJ/pdf?s=ap',
          },
          {
            id: 'stripe-in1tjsxfk0weauaymjjq6bosxf',
            title: 'Hockey Stick Growth LLC',
            company: 'billing@hockeystick.io',
            folder: 'STRIPE / OPEN',
            source: 'Stripe',
            sourceDir: 'STRIPE',
            file: 'F058AI3B-0001',
            href: 'https://dashboard.stripe.com/invoices/in_1TjsxfK0WeauAYMJJQ6boSxf',
            kind: 'STRIPE',
            stripeStatus: 'open',
            stripePaid: false,
            stripeAmountDue: 10000.0,
            stripeAmountPaid: 0.0,
            stripeCurrency: 'USD',
            stripeDashboardUrl: 'https://dashboard.stripe.com/invoices/in_1TjsxfK0WeauAYMJJQ6boSxf',
            stripeHostedInvoiceUrl: 'https://invoice.stripe.com/i/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VakxmcEt4UUNhbENUN1FBNnZsd0xZQzNOdVdPSm9jLDE3MzM2MTY4Mw0200i9YZiqiy?s=ap',
            stripeInvoicePdf: 'https://pay.stripe.com/invoice/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VakxmcEt4UUNhbENUN1FBNnZsd0xZQzNOdVdPSm9jLDE3MzM2MTY4Mw0200i9YZiqiy/pdf?s=ap',
          },
          {
            id: 'stripe-in1tic8ek0weauaymjz0v1f90g',
            title: 'Sean Kim x EASTWORLD',
            company: 'sean@virtuals.io',
            folder: 'STRIPE / OPEN',
            source: 'Stripe',
            sourceDir: 'STRIPE',
            file: 'WYB8J2D8-0001',
            href: 'https://dashboard.stripe.com/invoices/in_1Tic8eK0WeauAYMJZ0v1f90G',
            kind: 'STRIPE',
            stripeStatus: 'open',
            stripePaid: false,
            stripeAmountDue: 2055.0,
            stripeAmountPaid: 0.0,
            stripeCurrency: 'USD',
            stripeDashboardUrl: 'https://dashboard.stripe.com/invoices/in_1Tic8eK0WeauAYMJZ0v1f90G',
            stripeHostedInvoiceUrl: 'https://invoice.stripe.com/i/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VaTJEbTlWd3NYV3JMVGZzQ2s4OUFMM3dHM2RuVDR0LDE3MzM2MTY4Mw0200UZdYE1s2?s=ap',
            stripeInvoicePdf: 'https://pay.stripe.com/invoice/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VaTJEbTlWd3NYV3JMVGZzQ2s4OUFMM3dHM2RuVDR0LDE3MzM2MTY4Mw0200UZdYE1s2/pdf?s=ap',
          },
        ],
      },
      {
        label: 'Open outstanding',
        note: 'Active invoices still waiting on payment.',
        items: [
          {
            id: 'invoice-ad-og-062226',
            title: 'AD-OG',
            company: 'AD-OG',
            folder: 'OUTSTANDING / OPEN OUTSTANDING',
            source: 'Manual',
            sourceDir: 'OUTSTANDING',
            file: 'invoice_AD-OG_062226.pdf',
            href: 'flow-v4/assets/invoices/outstanding/invoice_AD-OG_062226.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-atomikgrowth-062426',
            title: 'AtomikGrowth',
            company: 'AtomikGrowth',
            folder: 'OUTSTANDING / OPEN OUTSTANDING',
            source: 'Manual',
            sourceDir: 'OUTSTANDING',
            file: 'invoice_AtomikGrowth_062426.pdf',
            href: 'flow-v4/assets/invoices/outstanding/invoice_AtomikGrowth_062426.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-eastworlds-061926',
            title: 'Eastworlds',
            company: 'Eastworlds',
            folder: 'OUTSTANDING / OPEN OUTSTANDING',
            source: 'Manual',
            sourceDir: 'OUTSTANDING',
            file: 'invoice_Eastworlds_061926.pdf',
            href: 'flow-v4/assets/invoices/outstanding/invoice_Eastworlds_061926.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-echonlab-mainecoon-061626',
            title: 'EchonLab',
            company: 'MaineCoon',
            folder: 'OUTSTANDING / OPEN OUTSTANDING',
            source: 'Manual',
            sourceDir: 'OUTSTANDING',
            file: 'invoice_EchonLab_MaineCoon_061626.pdf',
            href: 'flow-v4/assets/invoices/outstanding/invoice_EchonLab_MaineCoon_061626.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-goldenegg-banking-sample',
            title: 'GoldenEgg',
            company: 'banking sample',
            folder: 'OUTSTANDING / OPEN OUTSTANDING',
            source: 'Manual',
            sourceDir: 'OUTSTANDING',
            file: 'invoice_GoldenEgg_banking_sample.pdf',
            href: 'flow-v4/assets/invoices/outstanding/invoice_GoldenEgg_banking_sample.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-goldeneggmedia-banking-sample',
            title: 'GoldenEggMedia',
            company: 'banking sample',
            folder: 'OUTSTANDING / OPEN OUTSTANDING',
            source: 'Manual',
            sourceDir: 'OUTSTANDING',
            file: 'invoice_GoldenEggMedia_banking_sample.pdf',
            href: 'flow-v4/assets/invoices/outstanding/invoice_GoldenEggMedia_banking_sample.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-hockeystickgrowth-acl2026-firstpayment-062026',
            title: 'HockeyStickGrowth',
            company: 'ACL2026 FirstPayment',
            folder: 'OUTSTANDING / OPEN OUTSTANDING',
            source: 'Manual',
            sourceDir: 'OUTSTANDING',
            file: 'invoice_HockeyStickGrowth_ACL2026_FirstPayment_062026.pdf',
            href: 'flow-v4/assets/invoices/outstanding/invoice_HockeyStickGrowth_ACL2026_FirstPayment_062026.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-imerch-062226',
            title: 'iMerch',
            company: 'iMerch',
            folder: 'OUTSTANDING / OPEN OUTSTANDING',
            source: 'Manual',
            sourceDir: 'OUTSTANDING',
            file: 'invoice_iMerch_062226.pdf',
            href: 'flow-v4/assets/invoices/outstanding/invoice_iMerch_062226.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-imerch-062226-1of2',
            title: 'iMerch',
            company: '062226 1of2',
            folder: 'OUTSTANDING / OPEN OUTSTANDING',
            source: 'Manual',
            sourceDir: 'OUTSTANDING',
            file: 'invoice_iMerch_062226_1of2.pdf',
            href: 'flow-v4/assets/invoices/outstanding/invoice_iMerch_062226_1of2.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-imerch-062226-2of2',
            title: 'iMerch',
            company: '062226 2of2',
            folder: 'OUTSTANDING / OPEN OUTSTANDING',
            source: 'Manual',
            sourceDir: 'OUTSTANDING',
            file: 'invoice_iMerch_062226_2of2.pdf',
            href: 'flow-v4/assets/invoices/outstanding/invoice_iMerch_062226_2of2.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-jay-riversideinterview-061526',
            title: 'Jay',
            company: 'RiversideInterview',
            folder: 'OUTSTANDING / OPEN OUTSTANDING',
            source: 'Manual',
            sourceDir: 'OUTSTANDING',
            file: 'invoice_Jay_RiversideInterview_061526.pdf',
            href: 'flow-v4/assets/invoices/outstanding/invoice_Jay_RiversideInterview_061526.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-omane-nitrosend-061726',
            title: 'Omane',
            company: 'NitroSend',
            folder: 'OUTSTANDING / OPEN OUTSTANDING',
            source: 'Manual',
            sourceDir: 'OUTSTANDING',
            file: 'invoice_Omane_NitroSend_061726.pdf',
            href: 'flow-v4/assets/invoices/outstanding/invoice_Omane_NitroSend_061726.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-omane-viktor-payment2-062226',
            title: 'Omane',
            company: 'Viktor Payment2',
            folder: 'OUTSTANDING / OPEN OUTSTANDING',
            source: 'Manual',
            sourceDir: 'OUTSTANDING',
            file: 'invoice_Omane_Viktor_Payment2_062226.pdf',
            href: 'flow-v4/assets/invoices/outstanding/invoice_Omane_Viktor_Payment2_062226.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-r3ach-061926',
            title: 'R3ach',
            company: 'R3ach',
            folder: 'OUTSTANDING / OPEN OUTSTANDING',
            source: 'Manual',
            sourceDir: 'OUTSTANDING',
            file: 'invoice_R3ach_061926.pdf',
            href: 'flow-v4/assets/invoices/outstanding/invoice_R3ach_061926.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-viture-062426-month1',
            title: 'Viture',
            company: '062426 Month1',
            folder: 'OUTSTANDING / OPEN OUTSTANDING',
            source: 'Manual',
            sourceDir: 'OUTSTANDING',
            file: 'invoice_Viture_062426_Month1.pdf',
            href: 'flow-v4/assets/invoices/outstanding/invoice_Viture_062426_Month1.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
        ],
      },
      {
        label: 'Check Mailed',
        note: 'Synced from this invoice subfolder.',
        items: [
          {
            id: 'invoice-mayank-clinesdk-051326',
            title: 'Mayank',
            company: 'ClineSDK',
            folder: 'OUTSTANDING / CHECK MAILED',
            source: 'Manual',
            sourceDir: 'OUTSTANDING/CHECK MAILED',
            file: 'invoice_Mayank_ClineSDK_051326.pdf',
            href: 'flow-v4/assets/invoices/outstanding/check-mailed/invoice_Mayank_ClineSDK_051326.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
        ],
      },
    ],
  },
  {
    id: 'done',
    label: 'Done',
    eyebrow: 'Completed and closed',
    note: 'These invoices are finished and moved out of the active queue.',
    tone: 'good',
    buckets: [
      {
        label: 'Stripe',
        note: 'Closed Stripe invoices live here. Legacy manual invoices from your folders stay in their own buckets below.',
        items: [
          {
            id: 'stripe-in1timqck0weauaymjabporweh',
            title: 'Annika Wang',
            company: 'annika.wang@hockeystick.io',
            folder: 'STRIPE / CLOSED',
            source: 'Stripe',
            sourceDir: 'STRIPE',
            file: 'LIS6UY6W-0001',
            href: 'https://dashboard.stripe.com/invoices/in_1TimqCK0WeauAYMJABpOrweH',
            kind: 'STRIPE',
            stripeStatus: 'void',
            stripePaid: false,
            stripeAmountDue: 10000.0,
            stripeAmountPaid: 0.0,
            stripeCurrency: 'USD',
            stripeDashboardUrl: 'https://dashboard.stripe.com/invoices/in_1TimqCK0WeauAYMJABpOrweH',
            stripeHostedInvoiceUrl: 'https://invoice.stripe.com/i/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VaURHYmRwNmJuODJLem9yTUVWd3FOYnZHRGgwTzhmLDE3MzM2MTY4Mw02003w3tDMxK?s=ap',
            stripeInvoicePdf: 'https://pay.stripe.com/invoice/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VaURHYmRwNmJuODJLem9yTUVWd3FOYnZHRGgwTzhmLDE3MzM2MTY4Mw02003w3tDMxK/pdf?s=ap',
          },
          {
            id: 'stripe-in1tmyx4k0weauaymjblyis6ms',
            title: 'YIKI EEZYCOLLAB',
            company: 'yiki@eezycollab.com',
            folder: 'STRIPE / CLOSED',
            source: 'Stripe',
            sourceDir: 'STRIPE',
            file: '5X8TBWYT-0002',
            href: 'https://dashboard.stripe.com/invoices/in_1TmYx4K0WeauAYMJbLYIs6ms',
            kind: 'STRIPE',
            stripeStatus: 'paid',
            stripePaid: false,
            stripeAmountDue: 1950.0,
            stripeAmountPaid: 1950.0,
            stripeCurrency: 'USD',
            stripeDashboardUrl: 'https://dashboard.stripe.com/invoices/in_1TmYx4K0WeauAYMJbLYIs6ms',
            stripeHostedInvoiceUrl: 'https://invoice.stripe.com/i/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VbTdCbmJnS2ZTdE5scTdYbHlDWnpuMVBMWmhqMHY5LDE3MzM2MTY4Mw0200XPTBJojD?s=ap',
            stripeInvoicePdf: 'https://pay.stripe.com/invoice/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VbTdCbmJnS2ZTdE5scTdYbHlDWnpuMVBMWmhqMHY5LDE3MzM2MTY4Mw0200XPTBJojD/pdf?s=ap',
          },
          {
            id: 'stripe-in1tmpx5k0weauaymj6b8cnxkk',
            title: 'YIKI EEZYCOLLAB',
            company: 'yiki@eezycollab.com',
            folder: 'STRIPE / CLOSED',
            source: 'Stripe',
            sourceDir: 'STRIPE',
            file: '5X8TBWYT-0001',
            href: 'https://dashboard.stripe.com/invoices/in_1TmPx5K0WeauAYMJ6b8CNXKk',
            kind: 'STRIPE',
            stripeStatus: 'void',
            stripePaid: false,
            stripeAmountDue: 1900.0,
            stripeAmountPaid: 0.0,
            stripeCurrency: 'USD',
            stripeDashboardUrl: 'https://dashboard.stripe.com/invoices/in_1TmPx5K0WeauAYMJ6b8CNXKk',
            stripeHostedInvoiceUrl: 'https://invoice.stripe.com/i/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VbHhzMFQwRmRNSjFLRnNyUGJMR3NzcjNXSVRoQlZwLDE3MzM2MTY4Mw0200fS8LrBYy?s=ap',
            stripeInvoicePdf: 'https://pay.stripe.com/invoice/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VbHhzMFQwRmRNSjFLRnNyUGJMR3NzcjNXSVRoQlZwLDE3MzM2MTY4Mw0200fS8LrBYy/pdf?s=ap',
          },
          {
            id: 'stripe-in1tlrwgk0weauaymjyas2fino',
            title: 'Peter Zheng',
            company: 'peterzheng@imerch.ai',
            folder: 'STRIPE / CLOSED',
            source: 'Stripe',
            sourceDir: 'STRIPE',
            file: 'CYD6SSVP-0002',
            href: 'https://dashboard.stripe.com/invoices/in_1TlrWgK0WeauAYMJyas2fInO',
            kind: 'STRIPE',
            stripeStatus: 'paid',
            stripePaid: false,
            stripeAmountDue: 2158.0,
            stripeAmountPaid: 2158.0,
            stripeCurrency: 'USD',
            stripeDashboardUrl: 'https://dashboard.stripe.com/invoices/in_1TlrWgK0WeauAYMJyas2fInO',
            stripeHostedInvoiceUrl: 'https://invoice.stripe.com/i/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VbE9KRVBiRkgzTUE0ZTZ1eGZBRnRVa3drVkZpR3ZRLDE3MzM2MTY4Mw0200OC8tfl2U?s=ap',
            stripeInvoicePdf: 'https://pay.stripe.com/invoice/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VbE9KRVBiRkgzTUE0ZTZ1eGZBRnRVa3drVkZpR3ZRLDE3MzM2MTY4Mw0200OC8tfl2U/pdf?s=ap',
          },
          {
            id: 'stripe-in1thwn2k0weauaymjfm1x0dpg',
            title: 'Judy — Echon Labs',
            company: 'collab@echonlab.com',
            folder: 'STRIPE / CLOSED',
            source: 'Stripe',
            sourceDir: 'STRIPE',
            file: 'RYKHX5KX-0001',
            href: 'https://dashboard.stripe.com/invoices/in_1ThwN2K0WeauAYMJFm1x0dPG',
            kind: 'STRIPE',
            stripeStatus: 'void',
            stripePaid: false,
            stripeAmountDue: 1952.0,
            stripeAmountPaid: 0.0,
            stripeCurrency: 'USD',
            stripeDashboardUrl: 'https://dashboard.stripe.com/invoices/in_1ThwN2K0WeauAYMJFm1x0dPG',
            stripeHostedInvoiceUrl: 'https://invoice.stripe.com/i/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VaEwzOFNaOTJUS0swT3JMYm41NVlsMmtoNmNqcFJrLDE3MzM2MTY4Mw0200qyxsqEXD?s=ap',
            stripeInvoicePdf: 'https://pay.stripe.com/invoice/acct_1ThABUK0WeauAYMJ/live_YWNjdF8xVGhBQlVLMFdlYXVBWU1KLF9VaEwzOFNaOTJUS0swT3JMYm41NVlsMmtoNmNqcFJrLDE3MzM2MTY4Mw0200qyxsqEXD/pdf?s=ap',
          },
        ],
      },
      {
        label: 'Done',
        note: 'Archived for reference.',
        items: [
          {
            id: 'invoice-arcgrowth-ahacreator-052126',
            title: 'ArcGrowth',
            company: 'AhaCreator',
            folder: 'DONE / ARCHIVED',
            source: 'Manual',
            sourceDir: 'DONE',
            file: 'invoice_ArcGrowth_AhaCreator_052126.pdf',
            href: 'flow-v4/assets/invoices/done/invoice_ArcGrowth_AhaCreator_052126.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-cutback-selects-061226',
            title: 'Cutback',
            company: 'Selects',
            folder: 'DONE / ARCHIVED',
            source: 'Manual',
            sourceDir: 'DONE',
            file: 'invoice_Cutback_Selects_061226.pdf',
            href: 'flow-v4/assets/invoices/done/invoice_Cutback_Selects_061226.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-eezycollab-team9-052226',
            title: 'EezyCollab',
            company: 'Team9',
            folder: 'DONE / ARCHIVED',
            source: 'Manual',
            sourceDir: 'DONE',
            file: 'invoice_EezyCollab_Team9_052226.pdf',
            href: 'flow-v4/assets/invoices/done/invoice_EezyCollab_Team9_052226.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-hockeystick-voxcpm2-051526',
            title: 'HockeyStick',
            company: 'VOXCPM2',
            folder: 'DONE / ARCHIVED',
            source: 'Manual',
            sourceDir: 'DONE',
            file: 'invoice_HockeyStick_VOXCPM2_051526.pdf',
            href: 'flow-v4/assets/invoices/done/invoice_HockeyStick_VOXCPM2_051526.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-jay-langchainai-051326',
            title: 'Jay',
            company: 'LangChainAI',
            folder: 'DONE / ARCHIVED',
            source: 'Manual',
            sourceDir: 'DONE',
            file: 'invoice_Jay_LangChainAI_051326.pdf',
            href: 'flow-v4/assets/invoices/done/invoice_Jay_LangChainAI_051326.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-lobehub-051626',
            title: 'LobeHub',
            company: 'LobeHub',
            folder: 'DONE / ARCHIVED',
            source: 'Manual',
            sourceDir: 'DONE',
            file: 'invoice_LobeHub_051626.pdf',
            href: 'flow-v4/assets/invoices/done/invoice_LobeHub_051626.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-marketingguys-kombai-qrt-060126',
            title: 'MarketingGuys',
            company: 'Kombai QRT',
            folder: 'DONE / ARCHIVED',
            source: 'Manual',
            sourceDir: 'DONE',
            file: 'invoice_MarketingGuys_Kombai_QRT_060126.pdf',
            href: 'flow-v4/assets/invoices/done/invoice_MarketingGuys_Kombai_QRT_060126.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-omane-060826',
            title: 'Omane',
            company: 'Omane',
            folder: 'DONE / ARCHIVED',
            source: 'Manual',
            sourceDir: 'DONE',
            file: 'invoice_Omane_060826.pdf',
            href: 'flow-v4/assets/invoices/done/invoice_Omane_060826.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-omane-ormannheim-051826',
            title: 'Omane',
            company: 'OrMannheim',
            folder: 'DONE / ARCHIVED',
            source: 'Manual',
            sourceDir: 'DONE',
            file: 'invoice_Omane_OrMannheim_051826.pdf',
            href: 'flow-v4/assets/invoices/done/invoice_Omane_OrMannheim_051826.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-omane-viktor-060826',
            title: 'Omane',
            company: 'Viktor',
            folder: 'DONE / ARCHIVED',
            source: 'Manual',
            sourceDir: 'DONE',
            file: 'invoice_Omane_Viktor_060826.pdf',
            href: 'flow-v4/assets/invoices/done/invoice_Omane_Viktor_060826.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-playos-sintra-tier5-052126',
            title: 'PlayOS',
            company: 'Sintra Tier5',
            folder: 'DONE / ARCHIVED',
            source: 'Manual',
            sourceDir: 'DONE',
            file: 'invoice_PlayOS_Sintra_Tier5_052126.pdf',
            href: 'flow-v4/assets/invoices/done/invoice_PlayOS_Sintra_Tier5_052126.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-polsia-sfphysicalcampaign-060426',
            title: 'Polsia',
            company: 'SFPhysicalCampaign',
            folder: 'DONE / ARCHIVED',
            source: 'Manual',
            sourceDir: 'DONE',
            file: 'invoice_Polsia_SFPhysicalCampaign_060426.pdf',
            href: 'flow-v4/assets/invoices/done/invoice_Polsia_SFPhysicalCampaign_060426.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-polsia-tier3-052126',
            title: 'Polsia',
            company: 'Tier3',
            folder: 'DONE / ARCHIVED',
            source: 'Manual',
            sourceDir: 'DONE',
            file: 'invoice_Polsia_Tier3_052126.pdf',
            href: 'flow-v4/assets/invoices/done/invoice_Polsia_Tier3_052126.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-polyai-04232026',
            title: 'PolyAI',
            company: 'PolyAI',
            folder: 'DONE / ARCHIVED',
            source: 'Manual',
            sourceDir: 'DONE',
            file: 'invoice_PolyAI_04232026.html',
            href: 'flow-v4/assets/invoices/done/invoice_PolyAI_04232026.html',
            kind: 'HTML',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-vivi-eezycollab-051426',
            title: 'Vivi',
            company: 'EezyCollab',
            folder: 'DONE / ARCHIVED',
            source: 'Manual',
            sourceDir: 'DONE',
            file: 'invoice_Vivi_EezyCollab_051426.pdf',
            href: 'flow-v4/assets/invoices/done/invoice_Vivi_EezyCollab_051426.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
          {
            id: 'invoice-stav-invoice',
            title: 'STAV',
            company: 'INVOICE',
            folder: 'DONE / ARCHIVED',
            source: 'Manual',
            sourceDir: 'DONE',
            file: 'STAV INVOICE.pdf',
            href: 'flow-v4/assets/invoices/done/STAV%20INVOICE.pdf',
            kind: 'PDF',
            stripeStatus: null,
            stripePaid: false,
            stripeAmountDue: null,
            stripeAmountPaid: null,
            stripeCurrency: null,
            stripeDashboardUrl: null,
            stripeHostedInvoiceUrl: null,
            stripeInvoicePdf: null,
          },
        ],
      },
    ],
  },
];

const V4_INVOICE_ACTION_URL = 'http://127.0.0.1:8765/complete-invoice';

function V4InvoiceMatchesQuery(item, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  return [item.title, item.company, item.folder, item.source, item.sourceDir, item.file, item.kind, item.href, item.stripeStatus, item.stripeCurrency]
    .filter(Boolean)
    .some(value => String(value).toLowerCase().includes(q));
}

function V4InvoiceMoney(amount, currency = 'USD') {
  if (amount == null || amount === '') return '';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: String(currency || 'USD').toUpperCase(),
      maximumFractionDigits: 2,
    }).format(Number(amount));
  } catch (e) {
    return '$' + Number(amount).toFixed(2);
  }
}

function V4InvoiceCard({ item, onComplete, completingId }) {
  const canComplete = String(item.sourceDir || '').startsWith('OUTSTANDING');
  const isCompleting = completingId === item.id;
  const stripeStatus = String(item.stripeStatus || '').trim();
  const openHref = item.stripeDashboardUrl || item.href || item.stripeHostedInvoiceUrl || item.stripeInvoicePdf || '';
  const stripeTone = item.stripePaid ? 'paid' : (
    stripeStatus === 'open' || stripeStatus === 'draft' ? 'open' : (
      stripeStatus === 'void' || stripeStatus === 'uncollectible' ? 'void' : 'neutral'
    )
  );
  const stripeAmount = item.stripePaid ? item.stripeAmountPaid : item.stripeAmountDue;
  const stripeAmountLabel = stripeAmount != null ? V4InvoiceMoney(stripeAmount, item.stripeCurrency) : '';
  return (
    <div className="invoice-card">
      <div className="invoice-card-top">
        <div className="invoice-card-icon">
          <V3Icon name="invoice" w={14} />
        </div>
        <div className="invoice-card-head">
          <div className="invoice-card-title-row">
            <strong>{item.title}</strong>
            <span className={'invoice-kind invoice-kind-' + item.kind.toLowerCase()}>{item.kind}</span>
            {item.source && (
              <span className="invoice-source-badge">{item.source}</span>
            )}
            {stripeStatus && (
              <span className={'invoice-stripe-badge is-' + stripeTone}>
                Stripe {item.stripePaid ? 'paid' : stripeStatus}
              </span>
            )}
          </div>
          <div className="invoice-card-company">{item.company}</div>
          <div className="invoice-card-folder">{item.folder}</div>
          {(stripeAmountLabel || item.stripeHostedInvoiceUrl) && (
            <div className="invoice-stripe-meta">
              {stripeAmountLabel && <span>{item.stripePaid ? 'Paid ' : 'Due '}{stripeAmountLabel}</span>}
              {item.stripeHostedInvoiceUrl && (
                <a className="invoice-stripe-link" href={item.stripeHostedInvoiceUrl} target="_blank" rel="noreferrer">
                  Customer invoice
                </a>
              )}
              {item.stripeInvoicePdf && (
                <a className="invoice-stripe-link" href={item.stripeInvoicePdf} target="_blank" rel="noreferrer">
                  Stripe PDF
                </a>
              )}
            </div>
          )}
        </div>
        {openHref ? (
          <a className="invoice-open" href={openHref} target="_blank" rel="noreferrer">Open</a>
        ) : (
          <span className="invoice-open is-disabled">No link</span>
        )}
      </div>
      <div className="invoice-card-file">{item.file}</div>
      {canComplete && (
        <button
          className="invoice-complete-btn"
          type="button"
          disabled={isCompleting}
          onClick={() => onComplete(item)}
        >
          <V3Icon name={isCompleting ? 'spark' : 'check'} w={13} />
          {isCompleting ? 'Completing...' : 'Complete'}
        </button>
      )}
    </div>
  );
}

function V4InvoicesView({ query = '' }) {
  const q = String(query || '').trim();
  const [groups, setGroups] = React.useState(V4_INVOICE_GROUPS);
  const [completingId, setCompletingId] = React.useState(null);
  const [notice, setNotice] = React.useState(null);

  const completeInvoice = async (item) => {
    setCompletingId(item.id);
    setNotice(null);
    try {
      const res = await fetch(V4_INVOICE_ACTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDir: item.sourceDir, file: item.file }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.ok) throw new Error(payload.error || 'Could not complete invoice.');

      setGroups(current => current.map(group => {
        if (group.id === 'outstanding') {
          return {
            ...group,
            buckets: group.buckets.map(bucket => ({
              ...bucket,
              items: bucket.items.filter(next => next.id !== item.id),
            })).filter(bucket => bucket.items.length > 0),
          };
        }
        if (group.id === 'done') {
          const doneItem = {
            ...item,
            sourceDir: 'DONE',
            folder: 'DONE / ARCHIVED',
            file: payload.file || item.file,
            href: 'flow-v4/assets/invoices/done/' + encodeURIComponent(payload.file || item.file),
          };
          const buckets = group.buckets.length ? [...group.buckets] : [{ label: 'Done', note: 'Archived for reference.', items: [] }];
          buckets[0] = { ...buckets[0], items: [doneItem, ...buckets[0].items] };
          return { ...group, buckets };
        }
        return group;
      }));
      setNotice({ tone: 'good', text: `${payload.file || item.file} moved to DONE.` });
    } catch (err) {
      setNotice({ tone: 'warn', text: `Start the local invoice helper, then try again. ${err.message || err}` });
    } finally {
      setCompletingId(null);
    }
  };

  const visibleGroups = groups.map(group => ({
    ...group,
    buckets: group.buckets
      .map(bucket => ({
        ...bucket,
        items: bucket.items.filter(item => V4InvoiceMatchesQuery(item, q)),
      }))
      .filter(bucket => bucket.items.length > 0),
  })).filter(group => group.buckets.length > 0);

  const outstandingCount = (groups.find(group => group.id === 'outstanding')?.buckets || []).reduce((sum, bucket) => sum + bucket.items.length, 0);
  const doneCount = (groups.find(group => group.id === 'done')?.buckets || []).reduce((sum, bucket) => sum + bucket.items.length, 0);
  const totalCount = outstandingCount + doneCount;
  const visibleCount = visibleGroups.reduce((sum, group) => sum + group.buckets.reduce((n, bucket) => n + bucket.items.length, 0), 0);

  return (
    <div className="page invoices-page">
      <div className="page-hd">
        <div>
          <div className="page-eyebrow">Invoices</div>
          <h1 className="page-title">Invoices</h1>
          <div className="page-sub">Outstanding and done invoices from your local folder tree, with Stripe payment status when connected.</div>
        </div>
        <div className="invoice-stats">
          <span className="invoice-stat warn">{outstandingCount} outstanding</span>
          <span className="invoice-stat good">{doneCount} done</span>
          <span className="invoice-stat total">{totalCount} total</span>
        </div>
      </div>

      <div className="body invoices-body">
        {notice && <div className={'invoice-notice invoice-notice-' + notice.tone}>{notice.text}</div>}
        {q && <div className="invoice-search-note">{visibleCount} result{visibleCount === 1 ? '' : 's'} for “{q}”</div>}
        {visibleGroups.length === 0 && <V3Empty icon="invoice" title="No invoices match that search." sub="Try a company name, file name, or folder." />}

        {visibleGroups.map(group => (
          <section key={group.id} className={'invoice-group invoice-group-' + group.tone}>
            <div className="invoice-group-hd">
              <div>
                <div className="invoice-group-eyebrow">{group.eyebrow}</div>
                <h2 className="invoice-group-title">{group.label}</h2>
                <div className="invoice-group-note">{group.note}</div>
              </div>
              <div className="invoice-group-count">
                {group.buckets.reduce((n, bucket) => n + bucket.items.length, 0)}
              </div>
            </div>

            <div className="invoice-buckets">
              {group.buckets.map(bucket => (
                <div key={bucket.label} className="invoice-bucket">
                  <div className="invoice-bucket-hd">
                    <div>
                      <div className="invoice-bucket-label">{bucket.label}</div>
                      <div className="invoice-bucket-note">{bucket.note}</div>
                    </div>
                    <div className="invoice-bucket-count">{bucket.items.length}</div>
                  </div>
                  <div className="invoice-grid">
                    {bucket.items.map(item => <V4InvoiceCard key={item.id} item={item} onComplete={completeInvoice} completingId={completingId} />)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

// ─── Today ──────────────────────────────────────────────────
function V4TodayView({ user, leads, onOpenLead, onGoInbox }) {
  const { USERS, TASK_TYPES, deriveTasks, bucketTasks, greeting } = window.V3;
  const me = USERS[user];

  const [tab, setTab] = React.useState('now');
  const [completed, setCompleted] = React.useState({});
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  const FADE_MS = 10000;

  const allTasks = React.useMemo(() => deriveTasks(user, leads), [user, leads]);
  const liveTasks = allTasks.filter(t => !completed[t.id] || (now - completed[t.id]) < FADE_MS);
  const doneTasks = allTasks.filter(t =>  completed[t.id] && (now - completed[t.id]) >= FADE_MS);
  const buckets   = bucketTasks(liveTasks);

  const toggleComplete = (task) => {
    setCompleted(c => {
      if (c[task.id]) { const next = { ...c }; delete next[task.id]; return next; }
      return { ...c, [task.id]: Date.now() };
    });
  };

  const STUCK_DAYS = 7;
  const ACTIVE_STAGES = ['new','first-touch','engaged','rates-sent','negotiating','invoice-sent'];
  const stuckLeads = React.useMemo(() =>
    leads
      .filter(l => ACTIVE_STAGES.includes(l.stage) && l.daysInStage >= STUCK_DAYS)
      .sort((a, b) => b.daysInStage - a.daysInStage),
    [leads]
  );

  const unreadCount = leads.filter(l => l.unread).length;
  const today = new Date();
  const dayLabel = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const pipeOpen = leads.filter(l => !['paid-out'].includes(l.stage)).reduce((s, l) => s + (l.value || 0), 0);

  const nowCount   = buckets.urgent.length + buckets.past.length + buckets.today.length;
  const nextCount  = buckets.tomorrow.length + buckets.thisWeek.length;
  const laterCount = buckets.upcoming.length;

  // Auto-flip to first non-empty tab on user change
  React.useEffect(() => {
    if (tab === 'now' && nowCount === 0 && nextCount > 0) setTab('next');
  }, [user]);

  const subline = nowCount === 0
    ? (nextCount > 0 ? `Clear for now · ${nextCount} coming up` : "You're all clear.")
    : (<><strong style={{ color: 'var(--text)' }}>{nowCount}</strong> thing{nowCount === 1 ? '' : 's'} on you right now</>);

  const ctx = { user, onOpenLead, onToggle: toggleComplete, completed, now, fadeMs: FADE_MS };

  return (
    <div className="page today-v4">
      <div className="page-hd">
        <div>
          <div className="page-eyebrow">{dayLabel}</div>
          <h1 className="page-title">{greeting()}, <span className="accent">{me.name}</span>.</h1>
          <div className="page-sub">{subline}</div>
        </div>
        <div className="page-actions">
          <button className="btn-inbox-cta" onClick={onGoInbox} title="Go to inbox">
            <V3Icon name="mail" w={13} />
            <span>Inbox</span>
            {unreadCount > 0 && <span className="btn-inbox-cta-cnt">{unreadCount}</span>}
          </button>
          <button className="btn btn-sm btn-accent"><V3Icon name="plus" /> New lead</button>
        </div>
      </div>

      <div className="today-tabs-bar">
        <div className="today-tabs">
          <TodayTab id="now"   label="Now"   count={nowCount}          tab={tab} setTab={setTab} tone="now" />
          <TodayTab id="next"  label="Next"  count={nextCount}         tab={tab} setTab={setTab} />
          <TodayTab id="later" label="Later" count={laterCount}        tab={tab} setTab={setTab} />
          <TodayTab id="stuck" label="Stuck" count={stuckLeads.length} tab={tab} setTab={setTab} tone="stuck" />
          <TodayTab id="done"  label="Done"  count={doneTasks.length}  tab={tab} setTab={setTab} tone="done" />
        </div>
        <div className="today-pipe-stat">
          <span className="today-pipe-lbl">Open pipeline</span>
          <span className="today-pipe-val">{v3Money(pipeOpen, { compact: true })}</span>
        </div>
      </div>

      <div className="body today-body">
        {tab === 'now'   && <NowZone   buckets={buckets} {...ctx} />}
        {tab === 'next'  && <NextZone  buckets={buckets} {...ctx} />}
        {tab === 'later' && <LaterZone buckets={buckets} {...ctx} />}
        {tab === 'stuck' && <StuckZone leads={stuckLeads} onOpenLead={onOpenLead} user={user} />}
        {tab === 'done'  && <DoneZone  items={doneTasks} {...ctx} />}
      </div>
    </div>
  );
}

function TodayTab({ id, label, count, tab, setTab, tone }) {
  const active = tab === id;
  return (
    <button className={'today-tab' + (active ? ' is-active' : '') + (tone ? ' today-tab-' + tone : '')}
            onClick={() => setTab(id)}>
      <span className="today-tab-lbl">{label}</span>
      <span className="today-tab-cnt">{count}</span>
    </button>
  );
}

// ─── STUCK zone ─────────────────────────────────────────────
function StuckZone({ leads, onOpenLead, user }) {
  const { STAGE_BY_ID, USERS } = window.V3;
  if (leads.length === 0) {
    return (
      <div className="card" style={{ padding: '40px 24px', textAlign: 'center' }}>
        <V3Empty icon="check" title="No stuck leads." sub="Everything is moving. Nice work." />
      </div>
    );
  }

  const buckets = [
    { label: '21+ days', tone: 'critical', items: leads.filter(l => l.daysInStage >= 21) },
    { label: '14–20 days', tone: 'warning', items: leads.filter(l => l.daysInStage >= 14 && l.daysInStage < 21) },
    { label: '7–13 days', tone: 'caution', items: leads.filter(l => l.daysInStage >= 7 && l.daysInStage < 14) },
  ].filter(b => b.items.length > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {buckets.map(b => (
        <div key={b.label} className="card" style={{ overflow: 'hidden' }}>
          <div className={'stuck-bucket-hd stuck-' + b.tone}>
            <span className="stuck-bucket-label">{b.label}</span>
            <span className="stuck-bucket-cnt">{b.items.length}</span>
          </div>
          {b.items.map(l => {
            const stage = STAGE_BY_ID[l.stage];
            const owner = l.ownerId ? USERS[l.ownerId] : null;
            const barPct = Math.min(100, Math.round((l.daysInStage / 30) * 100));
            return (
              <div key={l.id} className="stuck-row" onClick={() => onOpenLead(l.id)}>
                <div className="stuck-row-left">
                  <V3Avatar name={l.contactName} color={l.color} />
                  <div className="stuck-row-info">
                    <div className="stuck-row-name">{l.contactName}</div>
                    <div className="stuck-row-brand">{l.brand}</div>
                  </div>
                </div>
                <div className="stuck-row-stage" style={{ color: stage.color }}>
                  <span className="dot" style={{ background: stage.color }}></span>
                  {stage.short}
                </div>
                <div className="stuck-row-bar-wrap">
                  <div className="stuck-row-bar" style={{ width: barPct + '%', background: b.tone === 'critical' ? 'var(--red,#e03)' : b.tone === 'warning' ? 'var(--amber,#f90)' : 'var(--accent)' }} />
                </div>
                <div className="stuck-row-days">{l.daysInStage}d</div>
                <div className="stuck-row-owner">
                  {owner ? <V3Avatar name={owner.name} color={owner.color} size="xs" /> : null}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── Pipeline progress visual ───────────────────────────────
// pipeStep: 0-7 index in ACTIVE_STAGE_IDS. daysInStage for the stuck bar.
function V3PipeViz({ stageId, daysInStage, compact }) {
  const { ACTIVE_STAGE_IDS, STAGE_BY_ID } = window.V3;
  const PIPE_STAGES = ['new','first-touch','engaged','rates-sent','negotiating','invoice-sent','done','paid-out'];
  const step = PIPE_STAGES.indexOf(stageId);
  const stage = STAGE_BY_ID[stageId] || {};
  const stuckColor = daysInStage >= 21 ? '#dd0033' : daysInStage >= 14 ? '#e87800' : daysInStage >= 7 ? '#c9a000' : 'var(--accent)';
  const stuckPct   = Math.min(100, Math.round((daysInStage / 28) * 100));

  if (compact) {
    return (
      <div className="pv-compact">
        <div className="pv-compact-segs">
          {PIPE_STAGES.map((s, i) => (
            <div key={s} className={'pv-seg' + (i < step ? ' past' : i === step ? ' cur' : '')}
                 style={i === step ? { background: stage.color } : undefined} />
          ))}
        </div>
        <div className="pv-compact-bar-wrap">
          <div className="pv-compact-bar" style={{ width: stuckPct + '%', background: stuckColor }} />
        </div>
      </div>
    );
  }

  return (
    <div className="pv-full">
      <div className="pv-full-segs">
        {PIPE_STAGES.map((s, i) => (
          <div key={s} className={'pv-seg' + (i < step ? ' past' : i === step ? ' cur' : '')}
               style={i === step ? { background: stage.color } : undefined}>
            {i === step && <span className="pv-seg-label">{stage.short}</span>}
          </div>
        ))}
      </div>
      <div className="pv-full-foot">
        <div className="pv-full-bar-wrap">
          <div className="pv-full-bar" style={{ width: stuckPct + '%', background: stuckColor }} />
        </div>
        <span className="pv-full-days" style={{ color: stuckColor }}>{daysInStage}d in stage</span>
      </div>
    </div>
  );
}

// ─── NOW zone — big action cards, 3 sub-sections clearly differentiated
function NowZone({ buckets, ...ctx }) {
  const isEmpty = buckets.urgent.length === 0 && buckets.past.length === 0 && buckets.today.length === 0;
  if (isEmpty) {
    return (
      <div className="card" style={{ padding: '40px 24px', textAlign: 'center' }}>
        <V3Empty icon="check" title="Nothing on you right now." sub="Check Next to see what's coming up." />
      </div>
    );
  }
  return (
    <>
      {buckets.urgent.length > 0 && (
        <NowSection tone="priority" label="Priority" sublabel="They asked for a date in the email"
                    items={buckets.urgent} {...ctx} />
      )}
      {buckets.past.length > 0 && (
        <NowSection tone="late" label="Past due" sublabel="Should have been done by now"
                    items={buckets.past} {...ctx} />
      )}
      {buckets.today.length > 0 && (
        <NowSection tone="today" label="Due today" sublabel="Wrap by end of day"
                    items={buckets.today} {...ctx} />
      )}
    </>
  );
}

function NowSection({ tone, label, sublabel, items, ...ctx }) {
  return (
    <section className={'now-section now-' + tone}>
      <header className="now-section-hd">
        <div className="now-section-rail"></div>
        <h2 className="now-section-title">{label}</h2>
        <span className="now-section-count">{items.length}</span>
        <span className="now-section-sub">{sublabel}</span>
      </header>
      <div className="now-section-body">
        {items.map(t => <NowCard key={t.id} task={t} {...ctx} />)}
      </div>
    </section>
  );
}

// CTA verbs per task type — what does the button SAY
const CTA_VERB = {
  qualify:  'Reply',
  followup: 'Nudge',
  reply:    'Reply',
  rates:    'Send rates',
  nudge:    'Nudge',
  respond:  'Respond',
  invoice:  'Send invoice',
  payment:  'Check $',
  post:     'Post',
  live:     'Track',
  approve:  'Review',
};

function NowCard({ task, user, onOpenLead, onToggle, completed, now, fadeMs }) {
  const { TASK_TYPES, STAGE_BY_ID, USERS } = window.V3;
  const t = TASK_TYPES[task.type] || { label: task.type, icon: 'doc', tone: 'reply' };
  const lead = task.lead;
  const stage = STAGE_BY_ID[lead.stage];
  const isCompleted = !!completed[task.id];
  const ageMs = isCompleted ? (now - completed[task.id]) : 0;
  const fadeFrac = Math.min(1, ageMs / fadeMs);

  const SALES_TYPES = new Set(['qualify','followup','reply','rates','nudge','respond','invoice','payment']);
  let ownerId;
  if (task.type === 'approve') ownerId = 'asher';
  else if (task.type === 'post' || task.type === 'live') ownerId = 'robert';
  else if (SALES_TYPES.has(task.type)) ownerId = lead.ownerId || 'sammy';
  else ownerId = lead.ownerId;
  const owner = USERS[ownerId];
  const isMine = window.V3.LeadIsMineForProfile(lead, user, ownerId);

  const hasBriefAction = task.action === 'open-brief';
  const openBrief = (e) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('v3:open-brief', { detail: { leadId: task.leadId } }));
  };

  let due;
  if (task.dueIn < 0)        due = { label: Math.abs(task.dueIn) + 'd late', tone: 'late' };
  else if (task.dueIn === 0) due = { label: 'today', tone: 'today' };
  else if (task.dueIn === 1) due = { label: 'tomorrow', tone: 'soon' };
  else                       due = { label: 'in ' + task.dueIn + 'd', tone: 'soon' };

  const cta = CTA_VERB[task.type] || 'Open';

  return (
    <div className={'now-card' + (isCompleted ? ' is-completed' : '') + (isMine ? ' for-you' : ' for-other')}
         style={{ '--fade': fadeFrac }}
         onClick={() => onOpenLead(lead.id)}>
      <button className={'now-card-check' + (isCompleted ? ' on' : '')}
              onClick={(e) => { e.stopPropagation(); onToggle(task); }}
              aria-label={isCompleted ? 'Mark incomplete' : 'Mark complete'}>
        {isCompleted && <V3Icon name="check" w={11} />}
      </button>

      <V3Avatar name={lead.contactName} color={lead.color} size="lg" />

      <div className="now-card-body">
        <div className="now-card-top">
          <span className="now-card-lead">{lead.contactName}</span>
          <span className="now-card-brand">{lead.brand}</span>
          <span className={'now-card-due tk-due-' + due.tone}>{due.label}</span>
        </div>

        <div className="now-card-action">{task.title}</div>

        {/* Deal context — what is this lead actually about */}
        <div className="now-card-context">
          {lead.deliverables && lead.deliverables !== '—' && (
            <span className="now-card-deliv"><V3Icon name="doc" w={10} /> {lead.deliverables}</span>
          )}
          {(() => {
            const last = lead.thread && lead.thread[lead.thread.length - 1];
            const snippet = last && (last.body || last.subject || '');
            const clean = snippet.replace(/\s+/g, ' ').trim().slice(0, 90);
            const stamp = last && window.V3.GmailTime.list(last.date || last.when);
            const stampTip = last && window.V3.GmailTime.tooltip(last.date || last.when);
            if (!clean) return null;
            return (
              <span className="now-card-snippet">
                {stamp && <span className="now-card-snippet-time" title={stampTip}>{stamp}</span>}
                <span className="now-card-snippet-text">"{clean}{snippet.length > 90 ? '…' : ''}"</span>
              </span>
            );
          })()}
        </div>

        {task.urgent && task.emailDeadlineNote && (
          <div className="now-card-quote">
            <V3Icon name="bolt" w={10} />
            <span>"{task.emailDeadlineNote}"</span>
          </div>
        )}

        <div className="now-card-stage-row">
          <span className="now-card-stage-name" style={{ color: stage.color }}>{stage.short}</span>
          <div className="now-card-stage-track">
            <div className="now-card-stage-fill" style={{ width: (Math.min(lead.daysInStage, 14) / 14 * 100) + '%', background: stage.color }} />
          </div>
          <span className="now-card-stage-days" style={{ color: stage.color }}>{lead.daysInStage}d</span>
        </div>

        <div className="now-card-meta">
          {task.value != null && <span className="now-card-value">{v3Money(task.value, { compact: true })}</span>}
          {!isMine && owner && (
            <span className="now-card-owner">
              <V3Avatar name={owner.name} color={owner.color} className="now-card-owner-pip" />
              For {owner.name}
            </span>
          )}
          {isMine && <span className="now-card-foryou">YOU</span>}
        </div>
      </div>

      <div className="now-card-actions" onClick={(e) => e.stopPropagation()}>
        {hasBriefAction ? (
          <button className="btn btn-primary now-card-cta" onClick={openBrief}>
            <V3Icon name="doc" w={12} /> Open brief
          </button>
        ) : (
          <button className="btn btn-accent now-card-cta" onClick={() => onOpenLead(lead.id)}>
            <V3Icon name={t.icon} w={12} /> {cta}
          </button>
        )}
        <button className="btn btn-ghost btn-sm now-card-secondary" onClick={() => onOpenLead(lead.id)}>
          Open →
        </button>
      </div>
    </div>
  );
}

// ─── NEXT zone — compact rows, grouped by tomorrow / this week
function NextZone({ buckets, ...ctx }) {
  const isEmpty = buckets.tomorrow.length === 0 && buckets.thisWeek.length === 0;
  if (isEmpty) {
    return (
      <div className="card" style={{ padding: '40px 24px', textAlign: 'center' }}>
        <V3Empty icon="cal" title="Nothing scheduled for tomorrow or this week." />
      </div>
    );
  }
  return (
    <>
      {buckets.tomorrow.length > 0 && (
        <CompactSection label="Tomorrow" sublabel="Heads up" items={buckets.tomorrow} {...ctx} />
      )}
      {buckets.thisWeek.length > 0 && (
        <CompactSection label="Later this week" sublabel="Next 2–7 days" items={buckets.thisWeek} {...ctx} />
      )}
    </>
  );
}

// ─── LATER zone — even more compressed, single section
function LaterZone({ buckets, ...ctx }) {
  if (buckets.upcoming.length === 0) {
    return (
      <div className="card" style={{ padding: '40px 24px', textAlign: 'center' }}>
        <V3Empty icon="cal" title="Nothing booked for the next 4 weeks." />
      </div>
    );
  }
  return <CompactSection label="Next 4 weeks" sublabel="Coming up" items={buckets.upcoming} {...ctx} />;
}

// ─── DONE zone — completed today
function DoneZone({ items, ...ctx }) {
  if (items.length === 0) {
    return (
      <div className="card" style={{ padding: '40px 24px', textAlign: 'center' }}>
        <V3Empty icon="check" title="Nothing checked off yet today." sub="Knock something out, and it'll show up here." />
      </div>
    );
  }
  return <CompactSection label="Completed today" sublabel="Nice work" items={items} done {...ctx} />;
}

function CompactSection({ label, sublabel, items, done, ...ctx }) {
  return (
    <section className="compact-section">
      <header className="compact-section-hd">
        <h2 className="compact-section-title">{label}</h2>
        <span className="compact-section-sub">{sublabel}</span>
        <span className="compact-section-count">{items.length}</span>
      </header>
      <div className="compact-section-body">
        {items.map(t => <CompactRow key={t.id} task={t} isDonePile={!!done} {...ctx} />)}
      </div>
    </section>
  );
}

function CompactRow({ task, user, onOpenLead, onToggle, completed, now, fadeMs, isDonePile }) {
  const { TASK_TYPES, STAGE_BY_ID, USERS } = window.V3;
  const t = TASK_TYPES[task.type] || { label: task.type, icon: 'doc', tone: 'reply' };
  const lead = task.lead;
  const stage = STAGE_BY_ID[lead.stage];
  const isCompleted = !!completed[task.id] || isDonePile;
  const ageMs = isCompleted && !isDonePile ? (now - completed[task.id]) : 0;
  const fadeFrac = Math.min(1, ageMs / fadeMs);

  const SALES_TYPES = new Set(['qualify','followup','reply','rates','nudge','respond','invoice','payment']);
  let ownerId;
  if (task.type === 'approve') ownerId = 'asher';
  else if (task.type === 'post' || task.type === 'live') ownerId = 'robert';
  else if (SALES_TYPES.has(task.type)) ownerId = lead.ownerId || 'sammy';
  else ownerId = lead.ownerId;
  const owner = USERS[ownerId];
  const isMine = window.V3.LeadIsMineForProfile(lead, user, ownerId);

  let due;
  if (task.dueIn < 0)        due = { label: Math.abs(task.dueIn) + 'd late', tone: 'late' };
  else if (task.dueIn === 0) due = { label: 'today', tone: 'today' };
  else if (task.dueIn === 1) due = { label: 'tomorrow', tone: 'soon' };
  else                       due = { label: 'in ' + task.dueIn + 'd', tone: 'soon' };

  return (
    <div className={'cr' + (isCompleted ? ' is-completed' : '') + (isDonePile ? ' in-pile' : '')}
         style={{ '--fade': fadeFrac }}
         onClick={() => onOpenLead(lead.id)}>
      <button className={'tk-check' + (isCompleted ? ' on' : '')}
              onClick={(e) => { e.stopPropagation(); onToggle(task); }}
              aria-label={isCompleted ? 'Mark incomplete' : 'Mark complete'}>
        {isCompleted && <V3Icon name="check" w={10} />}
      </button>
      <V3Avatar name={lead.contactName} color={lead.color} size="xs" />
      <div className="cr-body">
        <div className="cr-title">{task.title}</div>
        <div className="cr-sub">
          <span className="cr-brand">{lead.brand}</span>
          {lead.deliverables && lead.deliverables !== '—' && <span className="cr-deliv"> · {lead.deliverables}</span>}
          {!isMine && owner && <span className="cr-owner"> · for {owner.name}</span>}
          {(() => {
            const last = lead.thread && lead.thread[lead.thread.length - 1];
            const stamp = last && window.V3.GmailTime.list(last.date || last.when);
            const stampTip = last && window.V3.GmailTime.tooltip(last.date || last.when);
            return stamp ? <span className="cr-time" title={stampTip}> · {stamp}</span> : null;
          })()}
        </div>
        <div className="cr-stage-row">
          <span className="cr-stage-name" style={{ color: stage.color }}>{stage.short}</span>
          <div className="cr-stage-track">
            <div className="cr-stage-fill" style={{ width: (Math.min(lead.daysInStage, 14) / 14 * 100) + '%', background: stage.color }} />
          </div>
          <span className="cr-stage-days">{lead.daysInStage}d</span>
        </div>
      </div>
      {task.value != null && <div className="cr-value">{v3Money(task.value, { compact: true })}</div>}
      <div className={'tk-due tk-due-' + due.tone}>{due.label}</div>
    </div>
  );
}

// ─── Inbox ────────────────────────────────────────────────
function V4InboxView({ leads, user }) {
  const { STAGE_BY_ID, USERS } = window.V3;
  const [folder, setFolder] = React.useState('mine');
  const [selectedId, setSelectedId] = React.useState(null);
  const isShared = user !== 'robert';
  const laneLabel = isShared ? 'Shared lane' : "Robert's";
  const isRobert = user === 'robert';

  const folders = [
    { id: 'mine',    label: 'Your move',    icon: 'bolt',    fn: l => l.stage !== 'trash' && window.V3.MoveIsMineForProfile(l, user) && !['paid-out'].includes(l.stage), section: 'Quick' },
    { id: 'all',     label: 'All threads',  icon: 'inbox',   fn: l => l.stage !== 'trash',         section: 'Quick' },
    { id: 'unread',  label: 'Unread',       icon: 'mail',    fn: l => l.stage !== 'trash' && l.unread, section: 'Quick' },
    { id: 'engaged', label: 'Engaged',      icon: 'spark',   fn: l => l.stage !== 'trash' && l.stage === 'engaged',       section: 'By stage' },
    { id: 'rates',   label: 'Rates sent',   icon: 'send',    fn: l => l.stage !== 'trash' && l.stage === 'rates-sent',    section: 'By stage' },
    { id: 'nego',    label: 'Negotiating',  icon: 'reply',   fn: l => l.stage !== 'trash' && l.stage === 'negotiating',   section: 'By stage' },
    { id: 'invoice', label: 'Invoice sent', icon: 'invoice', fn: l => l.stage !== 'trash' && l.stage === 'invoice-sent',  section: 'By stage' },
    { id: 'trash',   label: 'Trash',        icon: 'trash',   fn: l => l.stage === 'trash',         section: 'By stage' },
    { id: 'lane',    label: laneLabel,      icon: 'leads',   fn: l => l.stage !== 'trash' && window.V3.LeadLane(l) === window.V3.ProfileLane(user), section: 'By owner' },
  ];

  const cur = folders.find(f => f.id === folder);
  const filtered = leads
    .filter(cur.fn)
    .sort((a, b) => V3TimestampForUi(b.lastTouchAt) - V3TimestampForUi(a.lastTouchAt));
  const isMobile = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
  const openLead = leads.find(l => l.id === selectedId) || (!isMobile && !selectedId ? filtered[0] : null);
  const sections = [...new Set(folders.map(f => f.section))];
  const showReader = Boolean(isMobile && selectedId && openLead);
  const moveThread = (lead, nextStage) => {
    window.V3.MoveLeadStage(lead, nextStage, leads);
    if (nextStage === 'trash' && folder !== 'trash' && String(selectedId) === String(lead.id)) {
      setSelectedId(null);
    }
  };

  return (
    <div className={'page inbox-page' + (showReader ? ' inbox-reader-open' : '')} style={{ overflow: 'hidden' }}>
      {!(showReader) && (
        <div className="page-hd inbox-page-hd">
        <div>
          <div className="page-eyebrow">{isRobert ? 'Robert' : 'Inbox'}</div>
          <h1 className="page-title">{isRobert ? 'Briefing' : 'Mail'}</h1>
          <div className="page-sub">
            {isRobert
              ? `${filtered.length} collaboration${filtered.length === 1 ? '' : 's'} in ${cur.label.toLowerCase()}`
              : `${filtered.length} thread${filtered.length === 1 ? '' : 's'} in ${cur.label.toLowerCase()}`}
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-sm"><V3Icon name="filter" /> Filter</button>
          <button className="btn btn-sm btn-accent"><V3Icon name="plus" /> {isRobert ? 'New note' : 'Compose'}</button>
        </div>
        </div>
      )}

      <div className={'inbox' + (showReader ? ' is-open' : '')}>
        <div className="in-folders">
          {sections.map(sec => (
            <React.Fragment key={sec}>
              <div className="in-folder-section">{sec}</div>
              {folders.filter(f => f.section === sec).map(f => (
                <div key={f.id} className="in-folder" aria-current={folder === f.id ? 'true' : undefined} onClick={() => { setFolder(f.id); setSelectedId(null); }}>
                  <V3Icon name={f.icon} />
                  <span>{f.label}</span>
                  <span className="in-folder-cnt">{leads.filter(f.fn).length}</span>
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>

        <div className="in-list">
          <div className="in-list-hd">
            <div className="in-list-hd-title">{cur.label}</div>
            <div className="in-list-hd-meta">{filtered.length}</div>
          </div>
          {filtered.length === 0 && <V3Empty icon="inbox" title="Zero inbox." />}
          {filtered.map(l => {
            const last = l.thread[l.thread.length - 1];
            const stage = STAGE_BY_ID[l.stage];
            const yourMove = window.V3.MoveIsMineForProfile(l, user);
            return (
              <div key={l.id}
                   className={'thread' + (l.unread ? ' is-unread' : '') + (openLead?.id === l.id ? ' is-active' : '')}
                   onClick={() => setSelectedId(l.id)}>
                <div className="thread-top">
                  <V3Avatar name={l.contactName} color={l.color} size="xs" />
                  <div className="thread-from">{l.contactName} · {l.brand}</div>
                  <div className="thread-time" title={window.V3.GmailTime.tooltip(l.lastTouchAt || last?.date || l.lastTouch)}>
                    {window.V3.GmailTime.list(l.lastTouchAt || last?.date || l.lastTouch) || l.lastTouch}
                  </div>
                  <button
                    className={l.stage === 'trash' ? "thread-restore-btn" : "thread-trash-btn"}
                    title={l.stage === 'trash' ? "Restore to New" : "Move to trash"}
                    aria-label={(l.stage === 'trash' ? 'Restore ' : 'Move ') + l.contactName + (l.stage === 'trash' ? ' to New' : ' to trash')}
                    onClick={e => { e.stopPropagation(); moveThread(l, l.stage === 'trash' ? 'new' : 'trash'); }}
                  >
                    <V3Icon name={l.stage === 'trash' ? "reply" : "trash"} w={12} />
                  </button>
                </div>
                <div className="thread-subject">{last?.subject}</div>
                <div className="thread-snippet">{(last?.body || '').replace(/\s+/g, ' ').trim().slice(0, 280)}</div>
                <div className="thread-tags">
                  {last?.pending && <span className="thread-tag pending">Pending sync</span>}
                  {yourMove && <span className="thread-tag your-move">Your move</span>}
                  {l.unread && !yourMove && <span className="thread-tag unread">New</span>}
                  <span className="thread-tag stage" style={{ color: stage.color, borderColor: 'currentColor' }}>{stage.short}</span>
                </div>
              </div>
            );
          })}
        </div>

        {openLead ? (
          <V4Reader lead={openLead} user={user} onBack={showReader ? () => setSelectedId(null) : null} onMoveStage={(nextStage) => moveThread(openLead, nextStage)} />
        ) : !isMobile ? (
          <div style={{ display: 'grid', placeItems: 'center', padding: 40 }}>
            <V3Empty icon="mail" title="Pick a thread." />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function fmtMsgDate(msg) {
  const v = msg.date || msg.when;
  return window.V3.GmailTime.full(v) || msg.when || '';
}
function fmtMsgRelative(msg) {
  const v = msg.date || msg.when;
  return window.V3.GmailTime.relative(v) || '';
}
function fmtMsgTooltip(msg) {
  const v = msg.date || msg.when;
  return window.V3.GmailTime.tooltip(v) || '';
}

function V4Reader({ lead, user, onBack, onMoveStage }) {
  const { STAGE_BY_ID, USERS } = window.V3;
  const [replyOpen, setReplyOpen] = React.useState(false);
  const last = lead.thread[lead.thread.length - 1];
  const stage = STAGE_BY_ID[lead.stage];
  const nextOwnerName = lead.nextMove.who ? USERS[lead.nextMove.who].name : `Awaiting ${lead.contactName.split(' ')[0]}`;
  const isMine = window.V3.MoveIsMineForProfile(lead, user);
  React.useEffect(() => {
    setReplyOpen(false);
  }, [lead.id]);
  return (
    <div className="reader">
      <div className="reader-hd">
        {onBack && (
          <button className="reader-back" onClick={onBack} aria-label="Back to threads">
            <V3Icon name="chev_l" w={14} />
            Threads
          </button>
        )}
        <div className="reader-title-row">
          <h2 className="reader-subject">{last?.subject}</h2>
          <button
            className="reader-reply-btn"
            type="button"
            onClick={() => setReplyOpen(true)}
          >
            <V3Icon name="reply" w={13} />
            Reply
          </button>
          <button
            className={lead.stage === 'trash' ? "reader-restore-btn" : "reader-trash-btn"}
            title={lead.stage === 'trash' ? "Restore to New" : "Move to trash"}
            onClick={() => onMoveStage?.(lead.stage === 'trash' ? 'new' : 'trash')}
          >
            <V3Icon name={lead.stage === 'trash' ? "reply" : "trash"} w={13} />
            {lead.stage === 'trash' ? 'Restore' : 'Trash'}
          </button>
        </div>
        <div className="reader-meta">
          <V3Avatar name={lead.contactName} color={lead.color} size="xs" />
          <strong>{lead.contactName}</strong>
          <span>· {lead.contactRole} at {lead.brand}</span>
          <span className="reader-meta-email">{lead.email}</span>
        </div>
      </div>
      <div className="reader-context">
        <div className="reader-context-block">
          <div className="reader-context-lbl">Where this stands</div>
          <div className="reader-context-val">
            <strong style={{ color: stage.color }}>{stage.name}</strong>
            <span style={{ color: 'var(--text-3)' }}> · {lead.daysInStage}d in stage · {lead.deliverables}</span>
          </div>
          <div style={{ marginTop: 6 }}><V3StageProg stageId={lead.stage} /></div>
        </div>
        <div className="reader-context-divider"></div>
        <div className="reader-context-block" style={{ textAlign: 'right' }}>
          <div className="reader-context-lbl">Next move</div>
          <div className="reader-context-val"><strong>{lead.nextMove.text}</strong></div>
          <div style={{ marginTop: 4, fontSize: 10.5, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em', color: isMine ? 'var(--accent-deep)' : 'var(--text-3)' }}>
            {isMine ? 'YOUR MOVE' : nextOwnerName + (lead.nextMove.who ? "'s move" : '')}
          </div>
        </div>
      </div>
      <div className="reader-body">
        <div className="act">
          {lead.thread.map((m, i) => {
            const senderEmail = m.from === 'Asher' ? 'asherunaligned@gmail.com'
                              : m.from === 'Sammy' ? 'unalignedx@gmail.com'
                              : m.from === 'Robert' ? 'scobleizer@gmail.com'
                              : V3ExtractEmail(m.from) || lead.email;
            const isInbound = !['Asher','Sammy','Robert','UNALIGNED'].includes(m.from);
            const toLabel = isInbound ? 'to me' : 'to ' + lead.contactName.split(' ')[0];
            const toLine = Array.isArray(m.to) ? m.to.join(', ') : '';
            const ccLine = Array.isArray(m.cc) ? m.cc.join(', ') : '';
            return (
              <div key={i} className="act-item">
                <div className="act-item-hd">
                  <V3Avatar name={m.from} color={m.from === 'Sammy' ? '#1f8a5b' : m.from === 'Asher' ? '#15171c' : lead.color} size="xs" />
                  <div className="act-item-sender">
                    <div className="act-item-from-row">
                      <span className="from">{m.from}</span>
                      <span className="from-email">&lt;{senderEmail}&gt;</span>
                      {m.pending && <span className="act-item-pending">Pending sync</span>}
                    </div>
                    {(toLine || ccLine) && (
                      <div className="act-item-participants">
                        {toLine && <span><strong>To:</strong> {toLine}</span>}
                        {ccLine && <span><strong>Cc:</strong> {ccLine}</span>}
                      </div>
                    )}
                    <div className="act-item-to">{toLabel}</div>
                  </div>
                  <div className="act-item-time-wrap">
                    {fmtMsgDate(m) ? (
                      <>
                        <span className="time" title={fmtMsgTooltip(m)}>{fmtMsgDate(m)}</span>
                        {fmtMsgRelative(m) && <span className="time-rel">{fmtMsgRelative(m)}</span>}
                      </>
                    ) : m.when ? (
                      <span className="time">{m.when}</span>
                    ) : null}
                  </div>
                </div>
                <div className="act-item-body">{m.body}</div>
              </div>
            );
          })}
        </div>
      </div>
      {replyOpen ? (
        <div className="drawer-foot reader-reply-panel">
          <div className="reader-reply-panel-top">
            <strong>Reply to {lead.contactName.split(' ')[0]}</strong>
            <button className="btn btn-sm btn-ghost" type="button" onClick={() => setReplyOpen(false)}>
              <V3Icon name="x" w={12} />
              Hide
            </button>
          </div>
          <V3InlineReply lead={lead} user={user} />
        </div>
      ) : null}
    </div>
  );
}

// ─── Leads list ─────────────────────────────────────────────
function V4LeadsView({ leads, openId, onOpenLead, user }) {
  const { USERS, STAGE_BY_ID } = window.V3;
  const [tab, setTab] = React.useState('active');
  const tabs = [
    { id: 'active',  label: 'Active',   fn: l => !['paid-out','trash'].includes(l.stage) },
    { id: 'mine',    label: 'My move',  fn: l => window.V3.MoveIsMineForProfile(l, user) && !['paid-out','trash'].includes(l.stage) },
    { id: 'waiting', label: 'Waiting',  fn: l => !l.nextMove.who && !['paid-out','trash'].includes(l.stage) },
    { id: 'paid',    label: 'Paid out', fn: l => l.stage === 'paid-out' },
    { id: 'trash',   label: 'Trash',    fn: l => l.stage === 'trash' },
    { id: 'all',     label: 'All',      fn: () => true },
  ];
  const filtered = leads.filter(tabs.find(t => t.id === tab).fn);
  const moveLead = (lead, nextStage) => window.V3.MoveLeadStage(lead, nextStage, leads);

  return (
    <div className="page">
      <div className="page-hd">
        <div>
          <div className="page-eyebrow">Pipeline</div>
          <h1 className="page-title">Network</h1>
          <div className="page-sub">All your collaborations in one table.</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-sm"><V3Icon name="filter" /> Filter</button>
          <button className="btn btn-sm"><V3Icon name="sort" /> Sort</button>
          <button className="btn btn-sm btn-accent"><V3Icon name="plus" /> New lead</button>
        </div>
      </div>

      <div className="body" style={{ paddingTop: 8 }}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: '1px solid var(--line)' }}>
          {tabs.map(t => {
            const n = leads.filter(t.fn).length;
            const active = tab === t.id;
            return (
              <button key={t.id} className="hd-nav-btn" aria-current={active ? 'page' : undefined}
                      onClick={() => setTab(t.id)}
                      style={{ background: active ? 'transparent' : undefined, color: active ? 'var(--text)' : 'var(--text-3)', marginBottom: -1, borderBottom: active ? '2px solid var(--text)' : '2px solid transparent', borderRadius: 0 }}>
                {t.label} <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, marginLeft: 4, opacity: 0.6 }}>{n}</span>
              </button>
            );
          })}
        </div>

        <div className="card">
          <div className="lead-row hd-row">
            <div>Contact / Brand</div>
            <div>Next move</div>
            <div>Stage</div>
            <div>Owner</div>
            <div style={{ textAlign: 'right' }}>Value</div>
            <div style={{ textAlign: 'right' }}>Action</div>
          </div>
          {filtered.length === 0 && <V3Empty icon="leads" title="Nothing here." />}
          {filtered.map(l => {
            const owner = l.ownerId ? USERS[l.ownerId] : null;
            const isMine = window.V3.MoveIsMineForProfile(l, user);
            const stage = STAGE_BY_ID[l.stage];
            return (
              <div key={l.id} className={'lead-row' + (openId === l.id ? ' is-active' : '')} onClick={() => onOpenLead(l.id)}>
                <div className="lead-name">
                  <V3Avatar name={l.contactName} color={l.color} />
                  <div className="lead-name-txt">
                    <strong>{l.contactName}</strong>
                    <span>{l.brand} · {l.contactRole}</span>
                  </div>
                </div>
                <div>
                  <div className={'lead-next-txt' + (isMine ? ' you' : '')}>
                    <V3Icon name={isMine ? 'bolt' : 'clock'} w={11} className="ic" />
                    <span style={{ marginLeft: 5 }}>{l.nextMove.text}</span>
                  </div>
                  <div className="lead-next-meta">{isMine ? 'Your move' : l.nextMove.who ? `${window.V3.USERS[l.nextMove.who].name}'s move` : `Waiting on ${l.contactName.split(' ')[0]}`}</div>
                </div>
                <div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: stage.color, fontWeight: 500, fontSize: 12 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: stage.color }}></span>
                    {stage.name}
                  </div>
                  <div style={{ marginTop: 5 }}><V3StageProg stageId={l.stage} /></div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  {owner ? <><V3Avatar name={owner.name} color={owner.color} size="xs" /><span>{owner.name}</span></> : <span style={{ color: 'var(--text-3)' }}>—</span>}
                </div>
                <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 12.5 }}>
                  {l.value ? v3Money(l.value, { compact: true }) : '—'}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <button
                    className={l.stage === 'trash' ? "lead-restore-btn" : "lead-trash-btn"}
                    title={l.stage === 'trash' ? "Restore to New" : "Move to trash"}
                    onClick={e => { e.stopPropagation(); moveLead(l, l.stage === 'trash' ? 'new' : 'trash'); }}
                  >
                    <V3Icon name={l.stage === 'trash' ? "reply" : "trash"} w={12} />
                    {l.stage === 'trash' ? 'Restore' : 'Trash'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Calendar ────────────────────────────────────────────────
const CAL_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby7SNgq-2mlzm5JkVHkbo0fsa1fOHIh6KPFfKqvPPLoFYYUvYZv94z2-KMdweTbAYVw9A/exec';
const CAL_TZ = 'America/Los_Angeles';

const EMPTY_FORM = { title: '', date: '', startTime: '09:00', endTime: '10:00', location: '', allDay: false };

// Split a summary into a highlighted opening "gist" + the rest, skipping
// sentence breaks that are really abbreviations ("Mt.", "Inc.", "U.S.") or
// initials, so the gist is a clean first line rather than a mid-word cut.
const V4_GIST_ABBR = /\b(mt|st|inc|ltd|co|corp|dr|mr|mrs|ms|jr|sr|vs|etc|approx|no|fig|dept|gov|u\.s|a\.m|p\.m|e\.g|i\.e)\.$/i;
function V4SplitGist(text) {
  const s = String(text || '').trim();
  const re = /([.!?])\s+(?=[A-Z0-9"'“‘])/g;
  let m;
  while ((m = re.exec(s))) {
    const head = s.slice(0, m.index + 1);
    if (head.trim().length < 20) continue;
    if (m[1] === '.' && (V4_GIST_ABBR.test(head) || /\b[A-Z]\.$/.test(head))) continue;
    if (head.length <= 200) return { gist: head.trim(), detail: s.slice(m.index + 1).trim() };
    break; // first sentence is a long run-on — fall through to a word-boundary cut
  }
  // No usable sentence break (e.g. a run-on with a URL): cut at a word boundary
  // so the gist stays a short headline and the remainder becomes detail.
  if (s.length > 150) {
    let cut = s.slice(0, 140);
    const sp = cut.lastIndexOf(' ');
    if (sp > 90) cut = cut.slice(0, sp);
    return { gist: cut.trim(), detail: s.slice(cut.length).trim() };
  }
  return { gist: s, detail: '' };
}

function V4NewLeadHasPricingSignal(lead) {
  const text = [
    lead?.notes,
    lead?.evidence,
    lead?.deliverables,
    lead?.nextMove?.text,
    lead?.thread?.[0]?.subject,
    lead?.thread?.[0]?.body,
  ].filter(Boolean).join(' ');
  return /\b(rate|pricing|budget|quote|quoted|paid|payment|invoice|sponsor|sponsorship|deliverable|package|repost)\b/i.test(text);
}

function V4NewLeadWorkflowLabel(lead) {
  if (V4NewLeadHasPricingSignal(lead)) return 'Route to pricing';
  return 'Route to scope';
}

function V4NewLeadsView({ leads = [], query = '', onOpenLead }) {
  const q = String(query || '').trim();
  const [sourceTab, setSourceTab] = React.useState('gmail');
  // A lead belongs to the New Leads queue by its source, independent of stage —
  // reuse IsNewLeadReview with a forced 'new' stage so the same source rules
  // also identify trashed intake leads for the Trash bin.
  const isReviewSource = (lead) => window.V3.IsNewLeadReview ? window.V3.IsNewLeadReview({ ...lead, stage: 'new' }) : true;
  const sortByActivity = (a, b) => (window.V3SortLeadsByActivity ? window.V3SortLeadsByActivity(a, b) : V3TimestampForUi(b.lastTouchAt || b.receivedAt) - V3TimestampForUi(a.lastTouchAt || a.receivedAt));

  const reviewLeads = React.useMemo(() => {
    const source = (Array.isArray(leads) ? leads : []).filter(lead => {
      if (window.V3.IsNewLeadReview) return window.V3.IsNewLeadReview(lead);
      return lead && lead.stage === 'new';
    });
    return source
      .filter(lead => window.V3.LeadMatchesQuery ? window.V3.LeadMatchesQuery(lead, q) : true)
      .sort(sortByActivity);
  }, [leads, q]);

  const trashLeads = React.useMemo(() => {
    return (Array.isArray(leads) ? leads : [])
      .filter(lead => lead && lead.stage === 'trash' && isReviewSource(lead))
      .filter(lead => window.V3.LeadMatchesQuery ? window.V3.LeadMatchesQuery(lead, q) : true)
      .sort(sortByActivity);
  }, [leads, q]);

  const counts = {
    total: reviewLeads.length,
    needsReply: reviewLeads.filter(l => l.needsReply).length,
    pricing: reviewLeads.filter(l => /rate|pricing|paid|sponsor|quote|repost/i.test([l.notes, l.evidence, l.nextMove?.text].join(' '))).length,
    scope: reviewLeads.filter(l => !V4NewLeadHasPricingSignal(l)).length,
    gmail: reviewLeads.filter(l => (window.V3.NewLeadSourceKind ? window.V3.NewLeadSourceKind(l) : 'gmail') === 'gmail').length,
    x: reviewLeads.filter(l => (window.V3.NewLeadSourceKind ? window.V3.NewLeadSourceKind(l) : 'gmail') === 'x').length,
    trash: trashLeads.length,
  };

  const moveLead = (lead, nextStage) => {
    window.V3.MoveLeadStage(lead, nextStage, leads);
  };

  const isTrashTab = sourceTab === 'trash';
  const visibleLeads = React.useMemo(() => {
    if (isTrashTab) return trashLeads;
    return reviewLeads.filter(lead => {
      const kind = window.V3.NewLeadSourceKind ? window.V3.NewLeadSourceKind(lead) : 'gmail';
      return sourceTab === 'x' ? kind === 'x' : kind === 'gmail';
    });
  }, [reviewLeads, trashLeads, sourceTab, isTrashTab]);

  const groupedLeads = React.useMemo(() => {
    const groups = new Map();
    for (const lead of visibleLeads) {
      const stamp = window.V3LeadReceivedTimestamp ? window.V3LeadReceivedTimestamp(lead) : V3TimestampForUi(lead.receivedAt || lead.lastTouchAt);
      const date = stamp ? new Date(stamp) : null;
      const key = date ? date.toDateString() : 'No date';
      const label = date
        ? date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
        : 'No date';
      if (!groups.has(key)) groups.set(key, { key, label, items: [] });
      groups.get(key).items.push(lead);
    }
    return Array.from(groups.values());
  }, [visibleLeads]);

  return (
    <div className="page new-leads-page">
      <div className="page-hd">
        <div>
          <div className="page-eyebrow">Robert + Asher intake</div>
          <h1 className="page-title">New Leads</h1>
          <div className="page-sub">A clean intake queue for Robert Gmail and Robert X leads, sorted newest to oldest before they enter the active board.</div>
        </div>
        <div className="invoice-stats">
          <span className="invoice-stat warn">{counts.needsReply} need reply</span>
          <span className="invoice-stat good">{counts.scope} route to scope</span>
          <span className="invoice-stat total">{counts.pricing} route to pricing</span>
          <span className="invoice-stat total">{counts.gmail} gmail</span>
          <span className="invoice-stat total">{counts.x} x</span>
          <span className="invoice-stat total">{counts.total} total</span>
        </div>
      </div>

      <div className="new-leads-shell">
        <div className="new-leads-tabs" role="tablist" aria-label="New lead sources">
          {[
            { key: 'gmail', label: 'Gmail', count: counts.gmail },
            { key: 'x', label: 'X', count: counts.x },
            { key: 'trash', label: 'Trash', count: counts.trash },
          ].map(tab => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={sourceTab === tab.key}
              className={'new-leads-tab' + (sourceTab === tab.key ? ' is-active' : '')}
              onClick={() => setSourceTab(tab.key)}
            >
              <span>{tab.label}</span>
              <strong>{tab.count}</strong>
            </button>
          ))}
        </div>
        {groupedLeads.map(group => (
          <section key={group.key} className="new-lead-day">
            <div className="new-lead-day-hd">
              <span>{group.label}</span>
              <strong>{group.items.length}</strong>
            </div>
            {group.items.map(lead => {
              const latest = Array.isArray(lead.thread) && lead.thread.length ? lead.thread[lead.thread.length - 1] : null;
              const first = Array.isArray(lead.thread) && lead.thread.length ? lead.thread[0] : null;
              const kind = window.V3.NewLeadSourceKind ? window.V3.NewLeadSourceKind(lead) : 'gmail';
              const summary = window.V3.NewLeadSummary ? window.V3.NewLeadSummary(lead) : String(lead.notes || latest?.body || lead.nextMove?.text || '').replace(/\s+/g, ' ').trim();
              // Pull the opening sentence out as a highlighted "gist" so the
              // intent ("X is asking for an intro") pops on the list; the rest
              // of the message reads as lighter supporting detail beneath it.
              const { gist: summaryGist, detail: summaryDetail } = V4SplitGist(summary);
              const source = window.V3.NewLeadSourceLabel ? window.V3.NewLeadSourceLabel(lead) : 'Gmail';
              const handle = window.V3.NewLeadHandle ? window.V3.NewLeadHandle(lead) : '';
              const identity = window.V3.NewLeadPrimaryIdentity ? window.V3.NewLeadPrimaryIdentity(lead) : (lead.contactName || 'Unknown contact');
              const reason = window.V3NewLeadReason ? window.V3NewLeadReason(lead) : 'Needs review';
              const receivedStamp = window.V3.GmailTime.full(lead.receivedAt || first?.date || first?.when);
              const receivedListStamp = window.V3.GmailTime.list(lead.receivedAt || first?.date || first?.when) || lead.lastTouch || 'new';
              const brandRaw = String(lead.brand || '').trim();
              const isPlaceholderBrand = /^(gmail|x|x lead|unknown.*)$/i.test(brandRaw);
              const metaBrand = brandRaw && !isPlaceholderBrand && brandRaw.toLowerCase() !== String(identity || '').trim().toLowerCase() ? lead.brand : '';
              const hasPricingSignal = V4NewLeadHasPricingSignal(lead);
              const workflowLabel = V4NewLeadWorkflowLabel(lead);
              const xSecondary = [handle, lead.email || '', metaBrand].filter(Boolean);
              const gmailSecondary = [lead.email || '', metaBrand].filter(Boolean);
              return (
                <article key={lead.id} className="new-lead-card new-lead-row">
                  <div className="new-lead-main">
                    <div className="new-lead-avatar">
                      <V3Avatar name={lead.contactName} color={lead.color} size="sm" />
                    </div>
                    <div className="new-lead-content">
                      <div className="new-lead-topline">
                        <div className="new-lead-topline-main">
                          <span className={'new-lead-source-chip' + (kind === 'x' ? ' is-x' : '')}>{source}</span>
                          <h2>{identity}</h2>
                        </div>
                        <span title={receivedStamp || undefined}>{receivedListStamp}</span>
                      </div>
                      <div className="new-lead-meta">
                        {kind === 'x' ? (
                          <>
                            {xSecondary.map((item, index) => index === 0 ? <strong key={item}>{item}</strong> : <span key={item}>{item}</span>)}
                          </>
                        ) : (
                          <>
                            {gmailSecondary.map((item, index) => index === 0 ? <strong key={item}>{item}</strong> : <span key={item}>{item}</span>)}
                          </>
                        )}
                      </div>
                      <div className="new-lead-reason-row">
                        <span className="new-lead-reason">{reason}</span>
                        <span className={'new-lead-workflow-chip' + (hasPricingSignal ? ' is-pricing' : ' is-scope')}>{workflowLabel}</span>
                        {kind === 'x' && lead.xMessageCount ? <span>{lead.xMessageCount} messages</span> : null}
                      </div>
                      {summaryGist ? (
                        <div className="new-lead-gist">
                          <p className="new-lead-gist-line">{summaryGist}</p>
                          {summaryDetail && <p className="new-lead-summary">{summaryDetail}</p>}
                        </div>
                      ) : (
                        <p className="new-lead-summary">No summary available yet.</p>
                      )}
                    </div>
                  </div>
                  <div className="new-lead-actions">
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => onOpenLead?.(lead.id)}>
                      <V3Icon name="reply" w={12} />
                      {kind === 'x' ? 'Review lead' : 'Open & reply'}
                    </button>
                    {kind === 'x' && lead.xOpenDm ? (
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => window.open(lead.xOpenDm, '_blank', 'noopener')}>
                        <V3Icon name="network" w={12} />
                        Open DM
                      </button>
                    ) : null}
                    {kind === 'x' && lead.email ? (
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => onOpenLead?.(lead.id)}>
                        <V3Icon name="mail" w={12} />
                        Email lead
                      </button>
                    ) : null}
                    {isTrashTab ? (
                      <button type="button" className="btn btn-sm btn-accent" onClick={() => moveLead(lead, 'new')}>
                        <V3Icon name="reply" w={12} />
                        Restore
                      </button>
                    ) : (
                      <>
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => moveLead(lead, 'first-touch')}>
                          <V3Icon name="plus" w={12} />
                          Scope
                        </button>
                        <button type="button" className="btn btn-sm btn-accent" onClick={() => moveLead(lead, hasPricingSignal ? 'rates-sent' : 'engaged')}>
                          <V3Icon name="plus" w={12} />
                          {hasPricingSignal ? 'Pricing' : 'Qualify'}
                        </button>
                        <button type="button" className="btn btn-sm btn-danger" onClick={() => moveLead(lead, 'trash')}>
                          <V3Icon name="trash" w={12} />
                          Trash
                        </button>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        ))}
        {visibleLeads.length === 0 && (
          <V3Empty
            icon={isTrashTab ? 'trash' : 'leads'}
            title={isTrashTab ? 'Trash is empty.' : (sourceTab === 'x' ? 'No X leads synced yet.' : 'No Gmail leads waiting.')}
            sub={isTrashTab
              ? 'Leads you trash land here and stay out of the scrape. Restore one to send it back to its queue.'
              : (sourceTab === 'x'
                ? 'The X scraper lane is ready. New X leads will appear here as they sync in.'
                : 'Fresh Robert Gmail leads will appear here before they enter the board.')}
          />
        )}
      </div>
    </div>
  );
}

function V4CalendarView({ query = '' }) {
  const [events, setEvents]   = React.useState(null);
  const [err, setErr]         = React.useState(null);
  const [form, setForm]       = React.useState(null); // null = closed; { mode:'create'|'edit', ev, fields }
  const [saving, setSaving]   = React.useState(false);
  const q = String(query || '').trim().toLowerCase();
  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time';
  const tzLabel = localTz === CAL_TZ
    ? 'Pacific Time'
    : `Pacific Time · Your time (${localTz.replace(/_/g, ' ')})`;

  function load() {
    fetch(CAL_SCRIPT_URL)
      .then(r => r.json())
      .then(data => setEvents(data))
      .catch(e => setErr(String(e)));
  }

  React.useEffect(load, []);

  function dayKey(offset) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toLocaleDateString('en-CA', { timeZone: CAL_TZ });
  }

  function eventKey(ev) {
    return new Date(ev.start).toLocaleDateString('en-CA', { timeZone: CAL_TZ });
  }

  function fmtTime(iso, allDay) {
    if (allDay) return 'All day';
    const pt = new Date(iso).toLocaleTimeString('en-US', {
      timeZone: CAL_TZ,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    const et = new Date(iso).toLocaleTimeString('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    return `${pt} PT · ${et} ET`;
  }

  function fullDate(offset) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toLocaleDateString('en-US', { timeZone: CAL_TZ, weekday: 'long', month: 'long', day: 'numeric' });
  }

  function openCreate(dayOffset) {
    setForm({ mode: 'create', ev: null, fields: { ...EMPTY_FORM, date: dayKey(dayOffset) } });
  }

  function openEdit(ev) {
    const d = new Date(ev.start);
    const pad = n => String(n).padStart(2, '0');
    const localTime = t => {
      const dt = new Date(t);
      const h = pad(dt.toLocaleString('en-US', { timeZone: CAL_TZ, hour: '2-digit', hour12: false }).replace('24','00'));
      const m = pad(dt.toLocaleString('en-US', { timeZone: CAL_TZ, minute: '2-digit' }));
      return `${h}:${m}`;
    };
    setForm({
      mode: 'edit',
      ev,
      fields: {
        title:     ev.title,
        date:      eventKey(ev),
        startTime: ev.allDay ? '09:00' : localTime(ev.start),
        endTime:   ev.allDay ? '10:00' : localTime(ev.end),
        location:  ev.location || '',
        allDay:    ev.allDay,
      },
    });
  }

  function setField(k, v) {
    setForm(f => ({ ...f, fields: { ...f.fields, [k]: v } }));
  }

  function buildDatetime(date, time) {
    return new Date(`${date}T${time}:00`).toISOString();
  }

  async function handleSave() {
    const { mode, ev, fields } = form;
    setSaving(true);
    const body = mode === 'create'
      ? { action: 'create', title: fields.title, allDay: fields.allDay,
          start: buildDatetime(fields.date, fields.startTime),
          end:   buildDatetime(fields.date, fields.endTime),
          location: fields.location }
      : { action: 'update', id: ev.id,
          searchStart: new Date(ev.start).toISOString(),
          searchEnd:   new Date(ev.end).toISOString(),
          title: fields.title, allDay: fields.allDay,
          start: buildDatetime(fields.date, fields.startTime),
          end:   buildDatetime(fields.date, fields.endTime),
          location: fields.location };
    await fetch(CAL_SCRIPT_URL, { method: 'POST', body: JSON.stringify(body) });
    setSaving(false);
    setForm(null);
    setEvents(null);
    load();
  }

  async function handleDelete() {
    const { ev } = form;
    setSaving(true);
    await fetch(CAL_SCRIPT_URL, { method: 'POST', body: JSON.stringify({
      action: 'delete', id: ev.id,
      searchStart: new Date(ev.start).toISOString(),
      searchEnd:   new Date(ev.end).toISOString(),
    })});
    setSaving(false);
    setForm(null);
    setEvents(null);
    load();
  }

  const days = [-1, 0, 1].map(offset => ({
    offset,
    label: offset === -1 ? 'Yesterday' : offset === 0 ? 'Today' : 'Tomorrow',
    sub: fullDate(offset),
    key: dayKey(offset),
    items: (events || []).filter(ev => eventKey(ev) === dayKey(offset))
                         .filter(ev => !q || [ev.title, ev.location, ev.description].join(' ').toLowerCase().includes(q))
                         .sort((a, b) => new Date(a.start) - new Date(b.start)),
  }));

  return (
    <div className="page">
      <div className="page-hd">
        <div>
          <div className="page-eyebrow">Robert Scoble</div>
          <h1 className="page-title">Schedule</h1>
          <div className="page-sub">Yesterday · Today · Tomorrow · {tzLabel}</div>
        </div>
      </div>

      <div className="body" style={{ paddingTop: 8 }}>
        {err && (
          <div className="card" style={{ padding: 20, color: 'var(--text-3)', fontSize: 13 }}>
            Could not load calendar: {err}
          </div>
        )}
        {!err && !events && (
          <div className="card" style={{ padding: 24, color: 'var(--text-3)', fontSize: 13 }}>
            Loading Robert's schedule…
          </div>
        )}
        {!err && events && (
          <div className="cal-3col">
            {days.map(day => (
              <div key={day.key} className={'cal-day' + (day.offset === 0 ? ' cal-day-today' : '')}>
                <div className="cal-day-hd">
                  <span className="cal-day-label">{day.label}</span>
                  <span className="cal-day-date">{day.sub}</span>
                  <button className="cal-add-btn" onClick={() => openCreate(day.offset)} title="Add event">+</button>
                </div>
                <div className="cal-day-body">
                  {day.items.length === 0 && <div className="cal-empty">{q ? 'No matching events' : 'Nothing scheduled'}</div>}
                  {day.items.map((ev, i) => (
                    <div key={i} className={'cal-event' + (ev.allDay ? ' cal-event-allday' : '')} onClick={() => openEdit(ev)} style={{ cursor: 'pointer' }}>
                      <div className="cal-event-time">{fmtTime(ev.start, ev.allDay)}</div>
                      <div className="cal-event-title">{ev.title}</div>
                      {ev.location && <div className="cal-event-loc">{ev.location}</div>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Event form modal ─── */}
      {form && (
        <div className="cal-modal-overlay" onClick={() => setForm(null)}>
          <div className="cal-modal" onClick={e => e.stopPropagation()}>
            <div className="cal-modal-hd">
              <span>{form.mode === 'create' ? 'New Event' : 'Edit Event'}</span>
              <button className="cal-modal-close" onClick={() => setForm(null)}>✕</button>
            </div>

            <div className="cal-modal-body">
              <label className="cal-field">
                <span>Title</span>
                <input value={form.fields.title} onChange={e => setField('title', e.target.value)} placeholder="Event title" autoFocus />
              </label>
              <label className="cal-field">
                <span>Date</span>
                <input type="date" value={form.fields.date} onChange={e => setField('date', e.target.value)} />
              </label>
              <label className="cal-field cal-field-check">
                <input type="checkbox" checked={form.fields.allDay} onChange={e => setField('allDay', e.target.checked)} />
                <span>All day</span>
              </label>
              {!form.fields.allDay && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <label className="cal-field" style={{ flex: 1 }}>
                    <span>Start</span>
                    <input type="time" value={form.fields.startTime} onChange={e => setField('startTime', e.target.value)} />
                  </label>
                  <label className="cal-field" style={{ flex: 1 }}>
                    <span>End</span>
                    <input type="time" value={form.fields.endTime} onChange={e => setField('endTime', e.target.value)} />
                  </label>
                </div>
              )}
              <label className="cal-field">
                <span>Location</span>
                <input value={form.fields.location} onChange={e => setField('location', e.target.value)} placeholder="Optional" />
              </label>
            </div>

            <div className="cal-modal-foot">
              {form.mode === 'edit' && (
                <button className="cal-btn-delete" onClick={handleDelete} disabled={saving}>Delete</button>
              )}
              <button className="cal-btn-save" onClick={handleSave} disabled={saving || !form.fields.title}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { V4TodayView, V4RobertBriefView, V4InboxView, V4LeadsView, V4NewLeadsView, V4CalendarView, V4AgentsView, V4InvoicesView });
