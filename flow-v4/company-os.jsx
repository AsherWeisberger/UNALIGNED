// Company OS Beta — full port of the localhost Hermes Workspace UI.
// Built on the gh-pages flow-v4 stack (inline Babel JSX + vanilla CSS).

// ─────────────────────────────────────────────────────────────
// Static brief content — Daily Operating Brief lives here
// ─────────────────────────────────────────────────────────────

const V4_COMPANY_OS_PREP = [
  {
    title: 'AhaCreator PDF / Lumina',
    tags: ['urgent', 'PDF links', 'resend'],
    points: [
      'Lumina said the brief PDF is corrupted and the links are not visible.',
      'Regenerate Robert_Brief_AhaCreator_3.0.pdf from the HTML source.',
      'Resend to lumina@arcgrowth.xyz and CC Asher.',
      'Keep this separate from normal outreach reply cleanup.',
    ],
  },
  {
    title: 'Marketing Guys / Kombai',
    tags: ['June 2', '$1,895', 'payment Monday'],
    points: [
      'Launch moved to Tuesday, June 2.',
      'Rate confirmed at $1,895 for QRT.',
      'They expect to settle payment and receipt Monday.',
      'Reply can confirm Monday works, but Robert posts only after payment clears.',
    ],
  },
  {
    title: 'Read.ai / Sarah',
    tags: ['schedule', 'three slots'],
    points: [
      'Scheduling slot still needs a human choice.',
      'Options: Tuesday, June 2 at 9:00 AM PT; Wednesday, June 3 at 12:00 PM PT; Thursday, June 4 at 2:00 PM PT.',
      'Send the selected slot from Asher once confirmed.',
    ],
  },
  {
    title: 'Riverside / Nadav',
    tags: ['scheduling', 'warm'],
    points: [
      'Jay asked Savion for Monday availability.',
      'Robert said he is interested.',
      'Treat this as scheduling follow-up, not a fresh sales pitch.',
    ],
  },
];

const V4_COMPANY_OS_WAITING = [
  {
    title: 'Outreach replies handled',
    tags: ['14 sent', 'watch only'],
    points: [
      'Yiki, Zack, Robert Adams, and Joey / CHUU were answered first.',
      'Ryan, Charlie, Chris, Preethy, Matthew, Dan, Kevin, Eric, Bill, and Mark were answered in the second batch.',
      'Do not treat old unread state alone as proof that Asher still owes a reply.',
    ],
  },
  {
    title: 'EezyCollab / LobeHub payment',
    tags: ['payment next week', 'separate thread'],
    points: [
      'They will check with finance Monday.',
      'They expect payment next week and will send receipt.',
      'Track this separately from the warm Yiki/Zack outreach conversation.',
    ],
  },
  {
    title: 'ACL / Alibaba',
    tags: ['agreement signed', '$20k'],
    points: [
      'Annika signed the agreement.',
      'Sam sent the signed agreement from Unaligned.',
      'No Asher reply needed right now.',
    ],
  },
  {
    title: 'CapCut Director Mode',
    tags: ['warm hold'],
    points: [
      'Halley thanked Asher for rate info.',
      'They will reach out if they move forward.',
      'Keep visible, but do not chase yet.',
    ],
  },
  {
    title: 'Do Not Touch',
    tags: ['Ori', 'Olivia', 'Macy', 'auto-replies'],
    points: [
      'Ori: Sam said the email was erroneous; user said not to reply.',
      'Olivia: previous paid client, but user said not to reply for now.',
      'Macy / a16z: Robert already jumped in, so wait.',
      'Dave and Paola are auto-replies.',
    ],
  },
  {
    title: 'NVIDIA Nemotron',
    tags: ['review later', 'not outreach cleanup'],
    points: [
      'Mark Cai checked in on Drive and endpoint access.',
      'Useful later, but not part of the current Asher reply cleanup.',
    ],
  },
];

const V4_COMPANY_OS_SENDERS = [
  { id: 'asher', label: 'Asher', role: 'Relationship-aware replies' },
  { id: 'robert', label: 'Robert', role: 'Intro + execution' },
  { id: 'sam', label: 'Sammy', role: 'Oversight' },
];

const V4_COMPANY_OS_RULES = [
  'Relationship-aware replies only. No first-touch language when there is history.',
  'Robert introduces and executes; Asher gathers facts, payment, and timing.',
  'Do not use Gmail thread state alone as truth after a mass blast.',
  'No post goes live until payment status is visible.',
];

const V4_COMPANY_OS_STAGES = [
  { key: 'new', label: 'Robert contacted' },
  { key: 'intro', label: 'Team intro' },
  { key: 'client', label: 'Client work' },
  { key: 'invoice', label: 'Invoice/pay' },
  { key: 'brief', label: '60-sec brief' },
  { key: 'done', label: 'Done' },
];

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function V4CompanyOsMoney(value) {
  if (!value) return '';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function V4CompanyOsStageIndex(lead) {
  const stage = lead?.stage || 'new';
  if (stage === 'paid-out' || stage === 'done') return 5;
  if (stage === 'invoice-sent') return 3;
  if (stage === 'negotiating' || stage === 'rates-sent') return 2;
  if (stage === 'first-touch' || stage === 'engaged') return 1;
  return 0;
}

function V4CompanyOsWhy(lead) {
  if (!lead) return 'No active lead selected.';
  if (lead.needsReply) return 'New thread activity needs an Asher reply, not a Robert interruption.';
  if (lead.stage === 'invoice-sent') return 'Deal terms appear close enough to verify payment and invoice status.';
  if (lead.stage === 'rates-sent') return 'Pricing/package is in motion; keep the client work moving toward a clear scope.';
  if (lead.stage === 'negotiating') return 'Client and package details need to become a clean brief, invoice, or both.';
  if (lead.stage === 'done' || lead.stage === 'paid-out') return 'Execution appears complete; confirm payment and archive cleanly.';
  return 'Robert is the source of the lead and final executor. Asher handles the back-and-forth. Sammy is oversight.';
}

function V4CompanyOsJob(lead) {
  if (!lead) return 'Pick a lead from the queue.';
  if (lead.stage === 'invoice-sent') return 'Verify payment, invoice state, and what is blocking the post.';
  if (lead.stage === 'rates-sent') return 'Get budget, date, deliverables, and approval path into one clean answer.';
  if (lead.stage === 'negotiating') return 'Turn the back-and-forth into a deal shape Robert can execute.';
  if (lead.stage === 'done' || lead.stage === 'paid-out') return 'Make sure the brief, payment, and archive are complete.';
  return 'Asher gets the deal facts before Robert sees anything.';
}

function V4CompanyOsDraft(lead, sender) {
  if (!lead) return '';
  if (window.V3ComposeReplyDraft) {
    const draft = window.V3ComposeReplyDraft(lead, sender);
    return [`Subject: ${draft.subject}`, '', draft.body].join('\n');
  }
  return '';
}

function V4CompanyOsFilterLead(lead, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  return [lead.title, lead.contactName, lead.brand, lead.email, lead.deliverables, lead.nextMove?.text]
    .filter(Boolean)
    .some(value => String(value).toLowerCase().includes(q));
}

function V4CompanyOsPriority(lead) {
  if (!lead) return 'P1';
  if (lead.needsReply) return 'P0';
  if (lead.stage === 'invoice-sent') return 'P0';
  return 'P1';
}

function V4CompanyOsPhase(lead) {
  const stage = lead?.stage || 'new';
  if (stage === 'invoice-sent') return 'Invoice / Payment';
  if (stage === 'negotiating' || stage === 'rates-sent') return 'Client Work';
  if (stage === 'first-touch' || stage === 'engaged') return 'Team Intro';
  if (stage === 'done' || stage === 'paid-out') return 'Done';
  return 'Client Work';
}

function V4CompanyOsPhaseTag(lead) {
  if (lead?.stage === 'invoice-sent') return 'verify first';
  if (lead?.needsReply) return 'needs reply';
  return 'next move';
}

function senderShortLabel(sender) {
  const map = { asher: 'Asher', robert: 'Robert', sam: 'Sammy' };
  return map[sender] || 'Asher';
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function V4CompanyOsBuildingIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="1.5" />
      <line x1="4" y1="9" x2="20" y2="9" />
      <line x1="4" y1="14" x2="20" y2="14" />
      <line x1="10" y1="9" x2="10" y2="21" />
      <line x1="14" y1="9" x2="14" y2="21" />
    </svg>
  );
}

function V4CompanyOsRocketIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 14l-2 5 5-2" />
      <path d="M12 4c5 0 8 3 8 8-3 0-5 2-6 4l-6-6c2-1 4-3 4-6z" />
      <circle cx="14" cy="10" r="1.5" />
    </svg>
  );
}

function V4CompanyOsActionItem({ item }) {
  return (
    <article className="cos-action-item">
      <div className="cos-action-head">
        <h3 className="cos-action-title">{item.title}</h3>
        {item.tags && (
          <div className="cos-chips">
            {item.tags.map(t => <span key={t} className="cos-chip">{t}</span>)}
          </div>
        )}
      </div>
      <ul className="cos-action-points">
        {item.points.map(p => <li key={p}>{p}</li>)}
      </ul>
    </article>
  );
}

function V4CompanyOsWatchItem({ item }) {
  return (
    <article className="cos-watch-item">
      <h3 className="cos-watch-title">{item.title}</h3>
      {item.tags && (
        <div className="cos-chips cos-chips-soft">
          {item.tags.map(t => <span key={t} className="cos-chip cos-chip-soft">{t}</span>)}
        </div>
      )}
      <ul className="cos-action-points">
        {item.points.map(p => <li key={p}>{p}</li>)}
      </ul>
    </article>
  );
}

function V4CompanyOsDealPath({ stageIndex }) {
  return (
    <div className="cos-deal-path" aria-label="Deal path">
      {V4_COMPANY_OS_STAGES.map((stage, index) => {
        const isDone = index < stageIndex;
        const isCurrent = index === stageIndex;
        return (
          <div key={stage.key} className={[
            'cos-deal-path-step',
            isDone ? 'is-done' : '',
            isCurrent ? 'is-current' : '',
          ].filter(Boolean).join(' ')}>
            <span className="cos-deal-path-bar"></span>
            <small>{stage.label}</small>
          </div>
        );
      })}
    </div>
  );
}

function V4CompanyOsLeadCard({ lead, isActive, onClick }) {
  const priority = V4CompanyOsPriority(lead);
  const phase = V4CompanyOsPhase(lead);
  const tag = V4CompanyOsPhaseTag(lead);
  const stageIndex = V4CompanyOsStageIndex(lead);
  return (
    <button
      type="button"
      className={isActive ? 'cos-lead-card-new is-active' : 'cos-lead-card-new'}
      onClick={onClick}
    >
      <div className="cos-lead-card-row">
        <span className="cos-lead-card-title">{lead.title || lead.brand}</span>
        <span className={`cos-priority cos-priority-${priority.toLowerCase()}`}>{priority}</span>
      </div>
      <div className="cos-lead-card-eyebrow">{phase}</div>
      <div className="cos-lead-card-row">
        <span className="cos-chip cos-chip-tight">{tag}</span>
        <span className="cos-lead-card-progress">{stageIndex + 1}/6</span>
      </div>
    </button>
  );
}

function V4CompanyOsOperator({ activeLead, sender, setSender, recipients, draft, copied, copyDraft, sendDraft }) {
  const senderLabel = senderShortLabel(sender);
  const targetEmail = activeLead?.email || activeLead?.contactEmail || (recipients?.to?.[0] || '');
  return (
    <aside className="cos-operator">
      <div className="cos-eyebrow">Operator</div>

      <div className="cos-operator-roles">
        {V4_COMPANY_OS_SENDERS.map(option => (
          <div key={option.id} className="cos-operator-role">
            <div className="cos-operator-role-label">{option.label}</div>
            <div className="cos-operator-role-meta">{option.role}</div>
          </div>
        ))}
        <div className="cos-operator-role">
          <div className="cos-operator-role-label">Target</div>
          <div className="cos-operator-role-meta cos-operator-role-target">{targetEmail || '—'}</div>
        </div>
      </div>

      <div className="cos-operator-send-as">
        <div className="cos-eyebrow">Send as</div>
        <div className="cos-operator-send-buttons">
          {V4_COMPANY_OS_SENDERS.map(option => (
            <button
              key={option.id}
              type="button"
              className={sender === option.id ? 'cos-send-btn is-active' : 'cos-send-btn'}
              onClick={() => setSender(option.id)}
            >{option.label}</button>
          ))}
        </div>
        <p className="cos-operator-help">
          Default is Asher. Switch only when Robert or Sammy should be the visible sender.
        </p>
      </div>

      <div className="cos-operator-guardrail">
        <div className="cos-eyebrow">Guardrail</div>
        <p>Keep Robert out of the middle. Collect the facts first.</p>
      </div>

      <pre className="cos-draft">{draft || 'Pick a live lead to prepare a reply.'}</pre>

      <div className="cos-operator-actions">
        <button type="button" className="cos-send-primary" onClick={sendDraft}>
          {window.V3SendLeadEmail ? `Send as ${senderLabel}` : `Prepare as ${senderLabel}`}
        </button>
        <button type="button" className="cos-send-secondary" onClick={copyDraft}>
          {copied ? 'Copied' : 'Copy draft'}
        </button>
      </div>

      <div className="cos-operator-recips">
        <span>To {recipients?.to?.length || 0}</span>
        <span>Cc {recipients?.cc?.length || 0}</span>
      </div>
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────
// Main view
// ─────────────────────────────────────────────────────────────

function V4CompanyOsView({ leads = [], query = '', onOpenLead }) {
  const activeLeads = React.useMemo(() => {
    return leads
      .filter(lead => !lead.isRobertBrief)
      .filter(lead => lead.stage !== 'trash' && lead.stage !== 'dead-leads')
      .filter(lead => (lead.daysInStage || 0) <= 21)
      .filter(lead => V4CompanyOsFilterLead(lead, query))
      .sort((a, b) => {
        const pa = (a.needsReply ? 100 : 0) + (a.stage === 'invoice-sent' ? 40 : 0) - (a.daysInStage || 0);
        const pb = (b.needsReply ? 100 : 0) + (b.stage === 'invoice-sent' ? 40 : 0) - (b.daysInStage || 0);
        return pb - pa;
      });
  }, [leads, query]);

  const [activeId, setActiveId] = React.useState(null);
  const [sender, setSender] = React.useState('asher');
  const [view, setView] = React.useState('queue');
  const [copied, setCopied] = React.useState(false);

  const activeLead = activeLeads.find(lead => lead.id === activeId) || activeLeads[0] || null;
  const stageIndex = V4CompanyOsStageIndex(activeLead);
  const recipients = activeLead && window.V3ReplyRecipients
    ? window.V3ReplyRecipients(activeLead, sender)
    : { to: [], cc: [] };
  const draft = React.useMemo(
    () => V4CompanyOsDraft(activeLead, sender),
    [activeLead?.id, activeLead?.draftReply?.body, sender]
  );

  React.useEffect(() => {
    if (activeLead && activeLead.id !== activeId) setActiveId(activeLead.id);
  }, [activeLead?.id]);

  const copyDraft = async () => {
    if (!draft) return;
    await navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const sendDraft = async () => {
    if (!activeLead || !draft || !window.V3SendLeadEmail) {
      await copyDraft();
      return;
    }
    const [subjectLine, ...bodyLines] = draft.split('\n');
    const subject = subjectLine.replace(/^Subject:\s*/i, '').trim();
    const body = bodyLines.join('\n').trim();
    await window.V3SendLeadEmail({
      lead: activeLead,
      sender,
      to: recipients.to,
      cc: recipients.cc,
      subject,
      body,
      attachPdf: sender === 'asher',
    });
  };

  const p0Count = activeLeads.filter(l => l.needsReply || l.stage === 'invoice-sent').length;
  const leadInboxCount = activeLeads.length;
  const sourceCount = new Set(activeLeads.map(l => l.brand).filter(Boolean)).size || 5;

  const today = new Date();
  const todayLabel = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const topPrep = V4_COMPANY_OS_PREP;
  const watchItems = V4_COMPANY_OS_WAITING;

  const dealCardTags = activeLead ? [
    V4CompanyOsPhase(activeLead),
    activeLead.needsReply ? 'needs Robert' : 'queued',
    'today',
  ] : [];

  const nextLeads = activeLeads.filter(l => l.id !== activeLead?.id).slice(0, 6);

  return (
    <section className="page company-os-page">
      {/* ── Sub-header ──────────────────────────────────────── */}
      <header className="cos-topbar">
        <div className="cos-topbar-id">
          <span className="cos-topbar-icon"><V4CompanyOsBuildingIcon size={24} /></span>
          <div className="cos-topbar-id-text">
            <div className="cos-topbar-eyebrow-row">
              <span className="cos-eyebrow">Company OS Beta</span>
              <span className="cos-topbar-status">Live Unaligned demo</span>
            </div>
            <h1 className="cos-topbar-title">UnalignedOS</h1>
          </div>
        </div>
        <div className="cos-topbar-kpis">
          <span className="cos-kpi"><strong>{p0Count}</strong> P0</span>
          <span className="cos-kpi cos-kpi-accent"><strong>{leadInboxCount}</strong> Lead inbox</span>
          <span className="cos-kpi"><strong>{sourceCount}</strong> Sources</span>
          <button type="button" className="cos-refresh-btn">↻ Refresh Gmail</button>
        </div>
      </header>

      {/* ── Daily Operating Brief ───────────────────────────── */}
      <section className="cos-section cos-brief">
        <div className="cos-brief-head">
          <div>
            <div className="cos-section-eyebrow-row">
              <span className="cos-eyebrow">Asher Inbox Command Center</span>
              <span className="cos-section-date">{todayLabel}</span>
            </div>
            <h2 className="cos-section-title">What needs action, what is waiting, and what must not be touched</h2>
          </div>
          <p className="cos-section-sub">
            Built from the latest Asher/Robert outreach cleanup so old threads do not get answered like first-touch leads.
          </p>
        </div>

        <div className="cos-brief-grid">
          <section className="cos-panel cos-panel-prep">
            <div className="cos-panel-head">
              <h3>Needs Prep / Action</h3>
              <span className="cos-panel-count">{topPrep.length}</span>
            </div>
            <div className="cos-panel-body">
              {topPrep.map(item => <V4CompanyOsActionItem key={item.title} item={item} />)}
            </div>
          </section>

          <section className="cos-panel cos-panel-watch">
            <div className="cos-panel-head">
              <h3>Watch / Waiting</h3>
              <span className="cos-panel-count">{watchItems.length}</span>
            </div>
            <div className="cos-panel-body">
              {watchItems.map(item => <V4CompanyOsWatchItem key={item.title} item={item} />)}
            </div>
          </section>

          <section className="cos-panel cos-rules">
            <div className="cos-panel-head">
              <h3>Operating Rules</h3>
              <span className="cos-panel-count">{V4_COMPANY_OS_RULES.length}</span>
            </div>
            <ul>
              {V4_COMPANY_OS_RULES.map(rule => <li key={rule}>{rule}</li>)}
            </ul>
          </section>
        </div>
      </section>

      {/* ── Deal Machine ────────────────────────────────────── */}
      <section className="cos-section cos-machine">
        <div className="cos-machine-head">
          <div className="cos-machine-title">
            <span className="cos-machine-icon"><V4CompanyOsRocketIcon size={18} /></span>
            <h2>Deal Machine</h2>
            <span className="cos-machine-pills">
              <span className="cos-kpi cos-kpi-tight">{topPrep.length} today</span>
              <span className="cos-kpi cos-kpi-tight">{leadInboxCount} leads</span>
              <span className="cos-kpi cos-kpi-tight">{senderShortLabel(sender)} replies</span>
            </span>
          </div>
          <div className="cos-toggle">
            <button
              type="button"
              className={view === 'queue' ? 'cos-toggle-btn is-active' : 'cos-toggle-btn'}
              onClick={() => setView('queue')}
            >Queue</button>
            <button
              type="button"
              className={view === 'calendar' ? 'cos-toggle-btn is-active' : 'cos-toggle-btn'}
              onClick={() => setView('calendar')}
            >Calendar</button>
          </div>
        </div>

        <div className="cos-machine-grid">
          {/* Deal card */}
          <article className="cos-deal-card">
            <div className="cos-deal-card-head">
              <div className="cos-chips">
                {dealCardTags.map(t => <span key={t} className="cos-chip cos-chip-soft">{t}</span>)}
              </div>
              {activeLead && (
                <button
                  type="button"
                  className="cos-deal-card-open"
                  onClick={() => onOpenLead?.(activeLead.id)}
                >Open brief</button>
              )}
            </div>
            <h2 className="cos-deal-card-subject">
              {activeLead?.title || activeLead?.brand || 'No lead selected'}
            </h2>

            <div className="cos-deal-current-job">
              <div className="cos-eyebrow">Current Job</div>
              <strong>{V4CompanyOsJob(activeLead)}</strong>
              <p>{V4CompanyOsWhy(activeLead)}</p>
            </div>

            <div className="cos-deal-path-wrap">
              <div className="cos-deal-path-head">
                <div className="cos-eyebrow">Deal Path</div>
                <span className="cos-chip cos-chip-soft">
                  {V4_COMPANY_OS_STAGES[stageIndex]?.label || 'New'}
                </span>
              </div>
              <V4CompanyOsDealPath stageIndex={stageIndex} />
            </div>

            <div className="cos-deal-info-grid">
              <div className="cos-deal-info">
                <div className="cos-eyebrow">Client Inputs</div>
                <div className="cos-chips">
                  <span className="cos-chip cos-chip-tight">budget</span>
                  <span className="cos-chip cos-chip-tight">timing</span>
                  <span className="cos-chip cos-chip-tight">deliverables</span>
                  <span className="cos-chip cos-chip-tight">payment path</span>
                  <span className="cos-chip cos-chip-tight">Robert ask</span>
                </div>
              </div>
              <div className="cos-deal-info">
                <div className="cos-eyebrow">Invoice / Pay</div>
                <p>Invoice comes after package, scope, deliverables, and timing are agreed. Payment is not cleared yet.</p>
              </div>
              <div className="cos-deal-info">
                <div className="cos-eyebrow">Robert Brief</div>
                <p>Create or rewrite the company brief into a 60-second Robert brief before execution.</p>
              </div>
              <div className="cos-deal-info">
                <div className="cos-eyebrow">Done Rule</div>
                <p>Done means Robert has executed, brief is stored, and payment is cleared or tracked.</p>
              </div>
            </div>
          </article>

          {/* Operator */}
          <V4CompanyOsOperator
            activeLead={activeLead}
            sender={sender}
            setSender={setSender}
            recipients={recipients}
            draft={draft}
            copied={copied}
            copyDraft={copyDraft}
            sendDraft={sendDraft}
          />

          {/* Next Leads sidebar */}
          <aside className="cos-leads-sidebar">
            <div className="cos-section-head">
              <div>
                <div className="cos-eyebrow">Next Leads</div>
              </div>
              <span className="cos-panel-count">{activeLeads.length}</span>
            </div>
            <div className="cos-leads-list">
              {activeLead && (
                <V4CompanyOsLeadCard lead={activeLead} isActive onClick={() => setActiveId(activeLead.id)} />
              )}
              {nextLeads.map(lead => (
                <V4CompanyOsLeadCard
                  key={lead.id}
                  lead={lead}
                  isActive={false}
                  onClick={() => setActiveId(lead.id)}
                />
              ))}
              {activeLeads.length === 0 && (
                <div className="cos-leads-empty">No live leads in the queue.</div>
              )}
            </div>
          </aside>
        </div>
      </section>
    </section>
  );
}

window.V4CompanyOsView = V4CompanyOsView;
