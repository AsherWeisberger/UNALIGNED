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
      'Asher now owes the exact posting time, Robert calendar lock, and both final live links the moment each post is up.',
      'This is no longer a copy discussion. It is calendar, execution, and link capture only.',
      'Do not let this slip because the sponsor is waiting on publishing, not revisions.',
    ],
  },
  {
    title: 'ACL / Hockey Stick',
    tags: ['P0', 'signed', 'reimbursement risk'],
    points: [
      'Agreement is signed, but Annika and Chang said on June 3 and June 4 that Alibaba still needs internal budget reconfirmation after Robert already bought the $1,200 ACL ticket.',
      'Sam already put ticket reimbursement on the record; Asher is still chasing written budget approval or explicit repayment confirmation before any more spend happens.',
      'Do not prep Robert for hotel, flights, or any other spend until Annika or Chang confirm budget in writing.',
      'If approval lands, collapse this into one tight travel, payment, and reimbursement brief immediately.',
    ],
  },
  {
    title: 'Polsia / Jeddi',
    tags: ['P0', 'invoice out', 'compliance stop'],
    points: [
      'The invoice is already out, but the thread turned risky on June 5 when Robert suggested a way to feature Polsia without disclosure and Jeddi replied yes.',
      'Asher now owes a clean reset: compliant Aligned News placement plus transparent amplification only, or a full pause if Jeddi still wants stealth.',
      'Do not let Robert go shoot posters, post to X, or move this into execution while the disclosure question is unresolved.',
      'Keep invoice_Polsia_SFPhysicalCampaign_060426.pdf visible in outstanding until the structure is either accepted cleanly or killed.',
    ],
  },
  {
    title: 'EezyCollab / Hard Pass',
    tags: ['P0', 'June 5', 'decline owed'],
    points: [
      'Sam said on June 5, 2026, "we\'re not working for these guys nor have time for their testing. hard pass."',
      'Robert has a decline draft sitting in the thread, but it is not sent yet.',
      'Asher owes one clean closeout if the team wants the thread formally shut; otherwise treat this as dead and do not brief Robert further.',
      'No beta, NDA, Discord onboarding, or deliverable prep should happen here.',
    ],
  },
  {
    title: 'Chris + Michael Call',
    tags: ['P1', 'June 5', 'follow-up needed'],
    points: [
      'Asher joined the June 5 call thread, then Chris replied that he was still trying to get into the meeting.',
      'This is now a same-day clean-up item: confirm whether the correct invite and Meet link worked, then capture any real next step from the call.',
      'Robert is already out of this pass unless the conversation turns into a concrete package ask.',
      'Do not leave duplicate invite confusion hanging after the meeting window.',
    ],
  },
  {
    title: 'Viture / Emily + Leo',
    tags: ['P1', 'roadmap call', 'launch planning'],
    points: [
      'Emily wants an early roadmap conversation around Viture’s second-half launch push before CES, and Leo sent his U.S. number on June 4: +1 (970) 682-9952.',
      'Sam asked for Leo\'s number and said he wanted to chat with Asher; the remaining Asher-owned move is simply getting that roadmap call onto the calendar.',
      'Keep this at planning level until the roadmap call turns into an actual package, campaign sequence, or proposal.',
      'No Robert brief yet because this is still launch planning, not execution.',
    ],
  },
];

const V4_COMPANY_OS_WAITING = [
  {
    title: 'Tripo / Vivian Deng',
    tags: ['watch', 'windows sent', 'interview + X scope'],
    points: [
      'Vivian said on June 4 that she received the package and would get back soon.',
      'Asher already sent Monday, June 22 or Friday, June 26 for the Dr. Cao interview and asked how Tripo wants to structure the X collaboration.',
      'Nothing new is owed until Vivian picks a day or clarifies deliverable shape.',
      'Once she replies, move this straight back into action and lock the schedule the same day.',
    ],
  },
  {
    title: 'TRAE Work / Inpander',
    tags: ['watch', 'rates sent', 'June 25-30'],
    points: [
      'Anna asked about a June 25-30 launch window for TRAE Work plus separate pricing for one quote repost and one thread.',
      'Asher replied on June 4 with availability plus rates of $1,895 for the QRT and $2,495 for the thread.',
      'Waiting on the brief, messaging, links, approval path, and a real go-ahead from their side.',
      'Do not prep Robert beyond awareness until the campaign packet and posting requirements arrive.',
    ],
  },
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
    title: 'FloatSchedule / Judy Gao',
    tags: ['Robert testing', 'multi-channel', 'wait for reaction'],
    points: [
      'Robert is actively trying FloatSchedule and asked what he should pay special attention to while testing.',
      'Asher already pointed him toward the core AI calendar-agent workflow so Judy gets firsthand product reaction instead of abstract feedback.',
      'Waiting on Robert reaction, launch timing, and the actual mix of X, LinkedIn, and newsletter support Judy wants to buy.',
      'Do not book strategy time until the product reaction and deliverable shape are back in-thread.',
    ],
  },
  {
    title: 'Perceptron / Eric Pence',
    tags: ['watch', 'launch June', 'task-driven'],
    points: [
      'Eric wants launch support for a new perception plus control model in late June and shared embargoed positioning.',
      'Robert and Asher pushed for 2 to 3 concrete tasks or demos Robert can react to directly instead of vague launch language.',
      'The missing piece is still on Eric: actual tasks, timing, and deliverable shape.',
      'Keep it warm, but do not build a Robert brief until those specifics exist.',
    ],
  },
  {
    title: 'Marketing Guys / Kombai',
    tags: ['payment watch', 'QRT live', '$1,895'],
    points: [
      'The final QRT link is captured: https://x.com/Scobleizer/status/2061829182154588383?s=20.',
      'Marketing Guys sent only wire-in-motion proof on June 1 and then closed the thread warmly on June 3.',
      'Keep this visible until the deposit actually clears or bank-side proof confirms payment landed.',
      'Invoice remains open; execution is done, but finance is not closed.',
    ],
  },
  {
    title: 'Low-Touch Finance Watch',
    tags: ['Omane', 'Viture', 'AdZen'],
    points: [
      'Omane has a fresh Nitrosend invoice from June 3 and Asher already asked for the payment receipt immediately after payment.',
      'Viture still needs the Leo call actually locked, while AdZen should stay untouched because Sam said on June 4 that it is not our business model.',
      'Keep these visible only for receipt, calendar-lock, or reopen signals.',
      'Unread is not a task by itself.',
    ],
  },
];

const V4_COMPANY_OS_DONE = [
  {
    title: 'Polsia / Tier 3 QRT',
    tags: ['May 22 live', 'done invoice', 'archived'],
    points: [
      'The original Polsia QRT is already complete and its invoice lives in DONE as invoice_Polsia_Tier3_052126.pdf.',
      'Keep this separate from the new June 4 poster-campaign invoice, which is not approved for execution yet.',
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
  'A wire screenshot is not settled money. Omane and similar deals stay on the board until deposit confirmation lands.',
  'If Asher already sent a time window, the next task is calendar lock or decline. Do not leave live scheduling threads floating without a same-owner follow-through.',
  'If a sponsor asks for stealth posting or no paid-promotion disclosure, reroute it into a compliant media placement or kill it. This rule overrides any off-the-cuff workaround sent in-thread.',
  'Every Robert brief must fit inside 60 seconds and include scope, timing, deliverable, approval path, payment path, and why Robert is the right fit now.',
  'Do not create a Robert brief for founder intros or discovery calls until scope, budget, platform, timing, and owner are concrete.',
  'Capture the live link and any receipt or reimbursement proof in the same thread before a campaign leaves the board.',
  'Keep new founder outreach in email until the deal shape is real. Do not drift into WhatsApp unless scope is already clear.',
  'Robert will not promote crypto. AI and blockchain infrastructure may be acceptable, but token or coin promotion is out.',
  'If Sam calls a deal a pass, treat it as closed unless he explicitly reopens it.',
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
