// Company OS Beta — full port of the localhost Hermes Workspace UI.
// Built on the gh-pages flow-v4 stack (inline Babel JSX + vanilla CSS).

// ─────────────────────────────────────────────────────────────
// Static brief content — Daily Operating Brief lives here
// ─────────────────────────────────────────────────────────────

const V4_COMPANY_OS_PREP = [
  {
    title: 'Airtap / Flot.AI',
    tags: ['P0', 'June 9 live', 'final approved'],
    points: [
      'Zoe sent the final approved version on June 4 and wants post one live on Monday, June 9 U.S. time, with post two 24 hours later.',
      'Asher now owes the exact posting time, Robert calendar lock, and both final live links as soon as each post is up.',
      'The copy fight is over; this is pure execution and link capture.',
      'Do not let this slip because the sponsor is waiting on publishing, not revisions.',
    ],
  },
  {
    title: 'ACL / Hockey Stick',
    tags: ['P0', 'budget hold', '$20k signed'],
    points: [
      'Agreement is signed, but on June 3 Annika said Alibaba still needs to reconfirm budget after Robert already bought the $1,200 ticket.',
      'Sam already put reimbursement on the record; the only acceptable next move is written approval or explicit repayment confirmation.',
      'Do not prep Robert for hotel, flights, or any other spend until Annika or Chang confirm budget in writing.',
      'If approval lands, collapse this into one tight travel, payment, and reimbursement brief immediately.',
    ],
  },
  {
    title: 'Tripo / Vivian Deng',
    tags: ['P0', 'CVPR week', 'interview + X scope'],
    points: [
      'Vivian wants a CVPR-week interview with Dr. Yanpei Cao plus an X collaboration around Project Eden.',
      'Vivian replied on June 4 asking for time slots that work for Robert and for the X package and rates; the Tripo usernames have already been passed over.',
      'Asher now owes concrete interview windows, package pricing, and one simple recommendation on whether this should be a single post, quote post, or thread.',
      'Keep Robert testing tied to the brief so the eventual post reads like real product context, not borrowed launch copy.',
    ],
  },
  {
    title: 'Perceptron / Eric Pence',
    tags: ['P0', 'launch June', 'task-driven'],
    points: [
      'Eric wants launch support for a new perception plus control model in the third or fourth week of June and shared embargoed positioning on June 3.',
      'He specifically wants a real-task QRT, not canned marketing, with newsletter optional if the fit is strong.',
      'Asher now needs to answer with the recommended structure and push for 2 to 3 candidate demo tasks Robert can react to personally.',
      'Do not turn this into a Robert brief until the task, launch window, and deliverable shape are all explicit.',
    ],
  },
  {
    title: 'Chris + Michael Call',
    tags: ['P1', 'Friday June 5', '12 p.m. ET'],
    points: [
      'Chris Niederman confirmed the Friday call and accepted the 12 p.m. ET invite from Michael, declining the duplicate 1 p.m. ET invite.',
      'Asher owns keeping the scheduling clean and making sure Sam is aligned on the exact call time.',
      'This is a discovery call, not a Robert brief yet, so do not over-prep beyond goals, timing, and what outcome they want.',
      'After the call, promote it only if there is a concrete collaboration shape with budget, platform, and next step.',
    ],
  },
];

const V4_COMPANY_OS_WAITING = [
  {
    title: 'Riverside / Savion',
    tags: ['watch', 'dates pending', 'exec fallback'],
    points: [
      'Savion reversed the termination path and now says Nadav is in, aiming roughly two weeks out, with alternates if timing slips.',
      'Savion replied again on June 4 that exact dates are still coming.',
      'Waiting on exact dates from Riverside; no further Robert prep until a spokesperson and slot are locked.',
      'If dates arrive, move it back to action with one prep path only.',
    ],
  },
  {
    title: 'Marketing Guys / Kombai',
    tags: ['payment watch', 'QRT live', '$1,895'],
    points: [
      'Robert fixed the deliverable and the final QRT link is live: https://x.com/Scobleizer/status/2061829182154588383?s=20.',
      'Marketing Guys sent wire-in-motion proof on June 1 and closed the thread warmly on June 3, but there is still no confirmed deposit.',
      'Keep this visible until the wire actually clears or bank-side payment proof is confirmed.',
      'Invoice is already in outstanding; archive only after payment lands and the final link stays captured.',
      'No more creative work is needed here unless payment goes sideways.',
    ],
  },
  {
    title: 'FloatSchedule / Judy Gao',
    tags: ['Robert testing', 'multi-channel', 'wait for reaction'],
    points: [
      'Robert is actively trying FloatSchedule and Asher already pointed him toward the core calendar-agent workflow.',
      'Judy wants X, LinkedIn, and newsletter support once Robert has firsthand reaction plus launch timing and campaign goals.',
      'Do not book strategy time until Robert reaction, deliverables, and timing are all back in-thread.',
      'When it comes back, keep the brief about product experience and campaign shape, not abstract AI-calendar chatter.',
    ],
  },
  {
    title: 'The Between / Stanley + Tristian',
    tags: ['next week', 'formation mode', 'schedule wait'],
    points: [
      'Stanley asked to push the conversation to next week while Tristian gets settled and they stay partly under wraps.',
      'Robert drafted the handoff, but this is still waiting on clean windows and a more concrete conversation target.',
      'Do not interrupt Robert with speculative scheduling until there is a specific slot to confirm.',
      'This stays founder and discovery oriented, not a sponsorship pitch.',
    ],
  },
  {
    title: 'AgentNet / Tejas',
    tags: ['new lead', 'watch', 'keep in email'],
    points: [
      'Tejas replied fast with product context and offered WhatsApp or a quick call, but there is still no concrete campaign, budget, or deliverable ask.',
      'Keep the conversation in structured email until campaign intent, deliverable, or budget is explicit.',
      'No Robert brief yet because there is still no concrete collaboration shape.',
      'If he comes back with scope or budget, promote it to action immediately.',
    ],
  },
  {
    title: 'Low-Touch Finance Watch',
    tags: ['Sintra', 'Omane', 'AK'],
    points: [
      'Sintra sent a payment receipt, Omane was asked again for proof of payment, and AK or Acti still has no new action-driving reply.',
      'Keep these visible only for receipt, deposit, or invoice-state changes.',
      'Unread is not a task by itself.',
      'Leave these in watch mode until a concrete ask, payment event, or deadline appears.',
    ],
  },
];

const V4_COMPANY_OS_DONE = [
  {
    title: 'Marketing Guys / Kombai QRT',
    tags: ['June 2 live', 'wire pending', '$1,895'],
    points: [
      'Campaign execution is complete and Robert posted the final QRT on June 2.',
      'Invoice sent: invoice_MarketingGuys_Kombai_QRT_060126.pdf.',
      'Marketing Guys sent Wire Pending - Robert.pdf; keep payment visible until deposit clears.',
      'Archive after the wire lands and the final link/proof is stored.',
    ],
  },
  {
    title: 'Vivi / EezyCollab',
    tags: ['done invoice', 'archived'],
    points: [
      'Invoice is in DONE: invoice_Vivi_EezyCollab_051426.pdf.',
      'Treat as completed unless a new reply creates fresh work.',
    ],
  },
  {
    title: 'PlayOS / Sintra Tier5',
    tags: ['done invoice', 'archived'],
    points: [
      'Invoice is in DONE: invoice_PlayOS_Sintra_Tier5_052126.pdf.',
      'No active Asher action unless client reopens scope.',
    ],
  },
  {
    title: 'Polsia Tier3',
    tags: ['done invoice', 'archived'],
    points: [
      'Invoice is in DONE: invoice_Polsia_Tier3_052126.pdf.',
      'Closed from the active operating queue.',
    ],
  },
  {
    title: 'Hockey Stick / VOXCPM2',
    tags: ['done invoice', 'archived'],
    points: [
      'Invoice is in DONE: invoice_HockeyStick_VOXCPM2_051526.pdf.',
      'Separate from the ACL/Alibaba event, which is signed but still upcoming.',
    ],
  },
  {
    title: 'Omane / OrMannheim',
    tags: ['done invoice', 'archived'],
    points: [
      'Invoice is in DONE: invoice_Omane_OrMannheim_051826.pdf.',
      'No current follow-up in the action queue.',
    ],
  },
  {
    title: 'PolyAI',
    tags: ['done invoice', 'archived'],
    points: [
      'Invoice is in DONE: invoice_PolyAI_04232026.html.',
      'Archived as complete.',
    ],
  },
  {
    title: 'LobeHub',
    tags: ['done invoice', 'archived'],
    points: [
      'Invoice is in DONE: invoice_LobeHub_051626.pdf.',
      'Do not keep this in payment chase unless a new finance reply contradicts it.',
    ],
  },
  {
    title: 'Jay / LangChainAI',
    tags: ['done invoice', 'archived'],
    points: [
      'Invoice is in DONE: invoice_Jay_LangChainAI_051326.pdf.',
      'Closed from the active queue.',
    ],
  },
  {
    title: 'STAV',
    tags: ['done invoice', 'archived'],
    points: [
      'Invoice is in DONE: STAV INVOICE.pdf.',
      'Closed from active campaign work.',
    ],
  },
];

const V4_COMPANY_OS_SENDERS = [
  { id: 'asher', label: 'Asher', role: 'Relationship-aware replies' },
  { id: 'robert', label: 'Robert', role: 'Intro + execution' },
  { id: 'sam', label: 'Sammy', role: 'Oversight' },
];

const V4_COMPANY_OS_RULES = [
  'Asher owns replies, scheduling, payment-proof capture, invoice links, package sends, and final post links. Sammy escalates. Robert handles intro, testing, interviews, or final execution only.',
  'No paid post, QRT, travel, ticket, hotel, or other spend happens before payment proof, receipt, reimbursement confirmation, or written budget approval is visible in-thread.',
  'A wire screenshot is not settled money. Kombai and similar deals stay on the board until deposit confirmation lands.',
  'Every Robert brief must fit inside 60 seconds and include scope, timing, deliverable, approval path, payment path, and why Robert is the right fit now.',
  'Do not create a Robert brief for founder intros or discovery calls until scope, budget, platform, and timing are concrete.',
  'Capture the live link and any receipt or reimbursement proof in the same thread before a campaign leaves the board.',
  'Keep new founder outreach in email until the deal shape is real. Do not drift into WhatsApp unless scope is already clear.',
  'Robert will not promote crypto. AI and blockchain infrastructure may be acceptable, but token or coin promotion is out.',
  'Unread is not the same as needs reply. Confirm thread state before creating work.',
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

function V4CompanyOsDoneItem({ item }) {
  return (
    <article className="cos-done-item">
      <div className="cos-done-head">
        <h3 className="cos-done-title">{item.title}</h3>
        {item.tags && (
          <div className="cos-chips cos-chips-soft">
            {item.tags.map(t => <span key={t} className="cos-chip cos-chip-soft">{t}</span>)}
          </div>
        )}
      </div>
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
  const doneItems = V4_COMPANY_OS_DONE;

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

          <section className="cos-panel cos-panel-done">
            <div className="cos-panel-head">
              <h3>Completed Campaigns</h3>
              <span className="cos-panel-count">{doneItems.length}</span>
            </div>
            <div className="cos-done-grid">
              {doneItems.map(item => <V4CompanyOsDoneItem key={item.title} item={item} />)}
            </div>
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
