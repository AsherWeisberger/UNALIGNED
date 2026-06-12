// Company OS Beta — full port of the localhost Hermes Workspace UI.
// Built on the gh-pages flow-v4 stack (inline Babel JSX + vanilla CSS).

// ─────────────────────────────────────────────────────────────
// Static brief content — Daily Operating Brief lives here
// ─────────────────────────────────────────────────────────────

const V4_COMPANY_OS_PREP = [
  {
    title: 'Perceptron / Agentic Detection',
    tags: ['P0', 'paid June 9', 'live-link missing'],
    points: [
      'Eric confirmed payment on June 9, 2026 and said the launch link would follow the next morning.',
      'Asher already replied "Waiting on your live link," but no final Perceptron URL is visible in-thread yet.',
      'The only useful next move is to get the exact post URL, confirm Robert\'s repost actually ran, and keep proof attached to the paid thread.',
      'Do not open the robotics follow-on conversation until the first paid deliverable is executed and linked.',
    ],
  },
  {
    title: 'ACL / Hockey Stick',
    tags: ['P0', 'framework sent', 'reimbursement risk'],
    points: [
      'Annika now has the revised 8-piece Alibaba Cloud framework built around the ACL papers plus booth coverage after the July 5 event.',
      'The content framework is not the blocker anymore. Robert already bought the $1,200 ticket, and hotel, flight, and reimbursement approval are still not explicit in writing.',
      'Next Asher move is payment-risk cleanup: written confirmation on ticket coverage, hotel/travel coverage, and any remaining approvals before more logistics move.',
      'Do not greenlight more spend, hotel, or flights until the thread explicitly covers reimbursement.',
    ],
  },
  {
    title: 'AhaCreator 3.0 / Arc Growth',
    tags: ['P0', 'access fixed', 'final polish'],
    points: [
      'This is no longer a blank-canvas access problem. Lumina said the brand added Robert to the testing/demo flow on June 10, 2026.',
      'Asher sent an updated draft on June 11, 2026 after testing, and Lumina\'s latest asks are narrow: add the safety/risk line, update creator count to 10K+, use the UTM link, and keep screenshots privacy-safe.',
      'This can move back into Robert-prep only after those exact brand tweaks are locked and the final draft is confirmed clean.',
      'Do not treat this as blocked product access anymore. Treat it as final approval and CTA cleanup.',
    ],
  },
  {
    title: 'Cutback / Selects',
    tags: ['P0', 'Monday hold', 'full prepay only'],
    points: [
      'Wonjae moved the Selects quote-tweet timing to Monday at 9 AM ET and asked for a 40/60 split because of delivery risk on their side.',
      'Asher held the line on June 11, 2026: full payment only, no partials, and the Stripe invoice link is already in-thread.',
      'This stays in action until they either pay in full or explicitly walk away from the Monday slot.',
      'No Robert brief is needed until payment policy is accepted and the launch post/video are actually released into the thread.',
    ],
  },
  {
    title: 'Skillshare / Michael Turner',
    tags: ['P0', 'rate accepted', 'billing needed'],
    points: [
      'Michael accepted the June 11, 2026 structure at $1,995 plus the 42% long-tail commission and confirmed the Skillshare verification email landed.',
      'Asher already replied that the catalog can open and asked for invoice information so Unaligned can generate the Stripe payment link.',
      'Asher owns the follow-up until billing details arrive and the payment path is live.',
      'Do not hand this to Robert yet; there is still no paid slot, no final content date, and no execution brief to act on.',
    ],
  },
];

const V4_COMPANY_OS_WAITING = [
  {
    title: 'FloatSchedule / Judy Gao',
    tags: ['watch', 'testing first', 'timing owed'],
    points: [
      'Judy told Robert on June 8, 2026 to keep testing FloatSchedule, especially AI scheduling, calendar sync, and meeting prep.',
      'Robert drafted that he would send feedback plus availability after a proper run-through, but there is still no real testing readout or locked content date in-thread.',
      'Wait on Robert\'s product reaction, then move it back into action with 1-2 concrete timing windows.',
      'No Robert brief exists until the product test is real.',
    ],
  },
  {
    title: 'HeyGen / Andrew Mok',
    tags: ['watch', 'brainstorm call', 'invite still loose'],
    points: [
      'Andrew asked on June 11, 2026 for a quick brainstorm call after Kevin looped him in on the partnership thread.',
      'Robert expressed strong interest and sent time ideas, but there is still no confirmed calendar invite or commercial scope in-thread.',
      'Watch for an actual invite, then move it back into action with one clean scheduling confirmation.',
      'This is still exploratory; there is no Robert execution brief yet.',
    ],
  },
  {
    title: 'Omane / Nitrosend',
    tags: ['watch', 'live June 3', 'receipt still missing'],
    points: [
      'Nitrosend went live on June 3, 2026 and Asher sent invoice_Omane_Nitrosend_060326.pdf in-thread the same day.',
      'There is still no visible receipt or deposit proof in the email thread, only brief acknowledgement from Ori.',
      'Keep the invoice active and watch for actual payment proof, not goodwill replies.',
      'If proof lands, move it to done immediately.',
    ],
  },
  {
    title: 'Riverside / Savion',
    tags: ['watch', 'dates pending', 'speaker TBD'],
    points: [
      'Savion said on June 11, 2026 that Nadav does want to move forward but is out of office and still owes available dates.',
      'Jay immediately pushed for a specific date, but no interview slot or backup executive is locked yet.',
      'Nothing useful is owed until Riverside sends concrete availability.',
      'If dates land, move it back into action immediately and confirm the spokesperson before prep starts.',
    ],
  },
  {
    title: 'Exploratory Inbound / Eastworlds + Joe Devon',
    tags: ['watch', 'needs context', 'not Robert-ready'],
    points: [
      'Eastworlds has a strong Chimborazo robot-climb story, but the thread still lacks real scope, budget, deliverable shape, and timing.',
      'Joe Devon replied on June 11, 2026 that he is not even sure which event Robert meant, so that thread is context-repair, not a live opportunity.',
      'Keep both in email until the opportunity is concrete enough to summarize in one sentence.',
      'Do not create a Robert brief from vague admiration, story ideas, or crossed wires.',
    ],
  },
  {
    title: 'Do-Not-Touch / Hard Pass',
    tags: ['EezyCollab', 'KroWork', 'keep closed'],
    points: [
      'EezyCollab kept following up on KroWork after Robert looped in Asher and Sam, but the internal position remains no.',
      'The fact that the product sounds relevant does not override the existing hard-pass call.',
      'Do not negotiate, brief Robert, or spend more reply energy here unless Sam or Robert explicitly reopens it.',
      'A follow-up from the brand is not a reopen by itself.',
    ],
  },
];

const V4_COMPANY_OS_DONE = [
  {
    title: 'Polsia / SF Posters',
    tags: ['June 6 live', 'paid', 'closed'],
    points: [
      'Robert\'s SF poster post is live at https://x.com/scobleizer/status/2063286745320600036?s=46.',
      'Jeddi replied "Paid!" on June 8, 2026 in the same invoice thread, which closes the payment chase for invoice_Polsia_SFPhysicalCampaign_060426.pdf.',
      'This is no longer an outstanding invoice or action item.',
      'Keep the live link and invoice as proof, then archive cleanly.',
    ],
  },
  {
    title: 'Marketing Guys / Kombai QRT',
    tags: ['June 2 live', 'paid'],
    points: [
      'Campaign execution is complete and Robert posted the final QRT on June 2.',
      'Invoice is in DONE: invoice_MarketingGuys_Kombai_QRT_060126.pdf.',
      'Payment is complete; no wire-watch or follow-up remains.',
      'Final link is captured: https://x.com/Scobleizer/status/2061829182154588383?s=20.',
    ],
  },
  {
    title: 'Polsia / Tier 3 QRT',
    tags: ['May 22 live', 'paid'],
    points: [
      'The original Polsia QRT is already complete and its invoice lives in DONE as invoice_Polsia_Tier3_052126.pdf.',
      'Keep this separate from the new June 4 poster-campaign invoice, which is not approved for execution yet.',
    ],
  },
  {
    title: 'Archive Snapshot',
    tags: ['older invoices', 'done'],
    points: [
      'Older closed invoice files remain archived in DONE and should stay separate from the active board.',
      'Examples already closed include AhaCreator\'s old invoice path, PlayOS / Sintra Tier5, LobeHub, Jay / LangChainAI, STAV, and other historical completions.',
    ],
  },
];

const V4_COMPANY_OS_SENDERS = [
  { id: 'asher', label: 'Asher', role: 'Relationship-aware replies' },
  { id: 'robert', label: 'Robert', role: 'Intro + execution' },
  { id: 'sam', label: 'Sammy', role: 'Oversight' },
];

const V4_COMPANY_OS_RULES = [
  'Asher owns replies, scheduling, examples, package sends, onboarding forms, invoice links, payment-proof capture, reimbursement follow-up, demo-access cleanup, and final post links. Sammy escalates. Robert only handles testing, interviews, intros, and final execution.',
  'No paid post, travel spend, hotel, or added ticket cost happens before payment proof, written reimbursement, written budget approval, or clearly prepaid package coverage is visible in-thread.',
  'A live post is not a closed deal. If the receipt is missing, the item stays in action until proof lands.',
  'If a client wants split payment, post-live payment, net terms, stealth posting, or no paid-promotion disclosure, the answer is no until the thread proves otherwise.',
  'If copy is already approved and the date is already set, do not reopen strategy. Lock timing, execute, and return the live link.',
  'If a client has paid but the launch URL or final asset is missing, chase the live link before opening any next campaign discussion.',
  'Every Robert brief must fit inside 60 seconds and include scope, timing, deliverable, approval path, payment path, and why Robert is the right fit now.',
  'Do not create a Robert brief for exploratory calls, founder coffees, or vague intros. Scope, budget, platform, timing, and owner must already be concrete.',
  'If a product requires testing, a login alone does not count. No execution brief exists until Robert can actually use the right environment and report something real back.',
  'Keep new lead threads in email until company, product, deliverable, budget, timing, and payment path are real. Generic interest, onboarding asks, and story pitches are not Robert briefs.',
  'Robert will not promote crypto. AI and blockchain infrastructure may be acceptable, but token or coin promotion is out.',
  'If Sam calls it a hard pass or Robert drafts a decline, treat the thread as closed unless one of them explicitly reopens it.',
  'If the thread is about billing details, invoices, payment links, or scheduling cleanup, it stays on Asher\'s side until the commercial path is settled.',
  'Unread is not the same as actionable. Confirm the latest thread state before creating work.',
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

// ─────────────────────────────────────────────────────────────
// Team Pulse — per-person lanes computed from live leads
// ─────────────────────────────────────────────────────────────

function V4CompanyOsPulseLane({ lane, onOpenLead }) {
  const { items } = lane;
  const members = lane.members.map(id => window.V3.USERS[id]).filter(Boolean);
  const shown = items.slice(0, members.length > 1 ? 8 : 6);
  return (
    <section className="cos-pulse-lane">
      <div className="cos-pulse-head">
        <span className="cos-pulse-avatars">
          {members.map(m => <V3Avatar key={m.id} name={m.name} color={m.color} size="sm" />)}
        </span>
        <div className="cos-pulse-id">
          <strong>{lane.label}</strong>
          <span>{lane.sub}</span>
        </div>
        <span className="cos-panel-count">{items.length}</span>
      </div>
      <div className="cos-pulse-body">
        {shown.map(lead => (
          <button key={lead.id} type="button" className="cos-pulse-item" onClick={() => onOpenLead?.(lead.id)}>
            <span className="cos-pulse-top">
              <span className="cos-pulse-brand">{lead.brand}</span>
              <span className={'cos-pulse-age' + ((lead.daysInStage || 0) >= 10 ? ' is-late' : '')}>
                {lead.daysInStage || 0}d
              </span>
            </span>
            <span className="cos-pulse-move">{lead.nextMove?.text || 'Review thread'}</span>
          </button>
        ))}
        {items.length === 0 && (
          <div className="cos-pulse-empty">Clear. Nothing waiting on {lane.label}.</div>
        )}
        {items.length > shown.length && (
          <div className="cos-pulse-more">+{items.length - shown.length} more in queue</div>
        )}
      </div>
    </section>
  );
}

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
  const invoicedOutstanding = activeLeads
    .filter(l => l.stage === 'invoice-sent')
    .reduce((s, l) => s + (l.value || 0), 0);
  const openPipeline = activeLeads
    .filter(l => !['done', 'paid-out'].includes(l.stage))
    .reduce((s, l) => s + (l.value || 0), 0);

  // Lanes show only leads where someone on the team owes the next move;
  // threads waiting on the client live in Watch/Waiting instead.
  const pulseLanes = [
    { id: 'robert',   label: 'Robert',             sub: 'Creator',       members: ['robert'] },
    { id: 'partners', label: 'Unaligned Partners', sub: 'Asher + Sammy', members: ['asher', 'sammy'] },
  ].map(lane => ({
    ...lane,
    items: activeLeads
      .filter(l => lane.members.includes(l.nextMove?.who))
      .sort((a, b) =>
        ((b.needsReply ? 1 : 0) - (a.needsReply ? 1 : 0)) ||
        ((b.daysInStage || 0) - (a.daysInStage || 0))
      ),
  }));

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
          <span className="cos-kpi"><strong>{V4CompanyOsMoney(invoicedOutstanding) || '$0'}</strong> Invoiced</span>
          <span className="cos-kpi"><strong>{V4CompanyOsMoney(openPipeline) || '$0'}</strong> In play</span>
          <button type="button" className="cos-refresh-btn" onClick={() => window.location.reload()}>↻ Refresh</button>
        </div>
      </header>

      {/* ── Team Pulse ──────────────────────────────────────── */}
      <section className="cos-section cos-pulse">
        <div className="cos-pulse-section-head">
          <span className="cos-eyebrow">Team Pulse</span>
          <span className="cos-section-date">who moves next, live from the inbox</span>
        </div>
        <div className="cos-pulse-grid">
          {pulseLanes.map(lane => (
            <V4CompanyOsPulseLane key={lane.id} lane={lane} onOpenLead={onOpenLead} />
          ))}
        </div>
      </section>

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
