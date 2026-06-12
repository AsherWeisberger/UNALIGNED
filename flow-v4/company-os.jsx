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
      'Eric confirmed payment on June 9, 2026, then said on June 10 that Perceptron would post in about two hours and shared preview copy for Agentic Detection.',
      'The thread still does not show the final launch URL or Robert\'s repost URL, so paid execution is not fully documented yet.',
      'The only useful next move is to get the exact live post link, confirm Robert\'s repost actually ran, and keep that proof on the paid thread.',
      'Do not open the robotics follow-on conversation until the first paid deliverable is executed and linked.',
    ],
  },
  {
    title: 'ACL / Hockey Stick',
    tags: ['P0', 'framework updated', 'payment clarification'],
    points: [
      'Annika replied on June 11, 2026 with Alibaba\'s final content buckets: Qoderwork, Qwen Cloud, ACL paper coverage, and the Alibaba Cloud booth, all framed as soft promotion.',
      'Asher answered the same day with the revised 8-piece structure and flagged that pass fees plus the first payment due June 20 need to be clarified before purchases continue.',
      'The framework itself is now usable. The remaining blocker is commercial cleanup around exhibitor-pass fees, first payment timing, and any other travel exposure.',
      'Do not approve more pass, hotel, or flight spend until the reimbursement and payment path are explicit in writing.',
    ],
  },
  {
    title: 'AhaCreator 3.0 / Arc Growth',
    tags: ['P0', 'tested', 'awaiting final ok'],
    points: [
      'Lumina confirmed on June 10, 2026 that Robert had been added to the testing flow, and Asher said testing was complete before sending the draft back on June 11.',
      'Lumina\'s latest asks were narrow: add the risk-filtering line, change creator count to 10K+, use the UTM link, and hide creator details in screenshots.',
      'Asher sent the updated doc back on June 11, 2026 and is now waiting for a final clean approval rather than more access fixes.',
      'Treat this as CTA and approval cleanup, not a demo-access problem.',
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
    tags: ['watch', 'times sent', 'invite still loose'],
    points: [
      'Andrew asked on June 11, 2026 for a quick brainstorm call after Kevin handed the thread to him.',
      'Robert replied on June 11 with availability and then again early June 12 with a broad 9 AM to 1 PM PT window, but there is still no invite or scoped partnership ask in-thread.',
      'Watch for an actual invite, then move it back into action with one clean scheduling confirmation.',
      'This is still exploratory; there is no Robert execution brief yet.',
    ],
  },
  {
    title: 'Riverside / Savion',
    tags: ['watch', 'dates pending', 'speaker TBD'],
    points: [
      'Savion said on June 11, 2026 that Nadav still wants to move forward but is out of office and has not yet sent dates.',
      'Jay pushed for a date marker the same day, but there is still no interview slot or backup executive locked in the thread.',
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
    title: 'Omane / Nitrosend',
    tags: ['June 3 live', 'paid June 11', 'proof landed'],
    points: [
      'Nitrosend went live on June 3, 2026 and Asher sent invoice_Omane_Nitrosend_060326.pdf the same day.',
      'Payment proof finally appeared on June 11, 2026 via the Wells Fargo alert showing a $1,000 Zelle deposit with memo "Omane Media."',
      'This is no longer waiting on goodwill or receipt promises; it has actual proof of funds.',
      'Keep the bank-proof screenshot with the invoice so the file closes cleanly even though the client thread never sent a formal receipt.',
    ],
  },
  {
    title: 'Flot / Airtap',
    tags: ['June 10 live', 'final link captured', 'closed'],
    points: [
      'The second Airtap post went live and Asher sent the final comment link in-thread on June 10, 2026: https://x.com/Scobleizer/status/2064788508401914209?s=20.',
      'Zoe\'s latest message was only a thank-you, which means the execution chase is over from the brand side.',
      'No extra Robert brief or scheduling work remains here.',
      'Keep the live link on the thread as the completion artifact.',
    ],
  },
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
  'If payment proof lands outside the client thread, attach or log that proof against the invoice before marking the deal done.',
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

function V4CompanyOsPulseItem({ lead, onOpenLead }) {
  return (
    <button type="button" className="cos-pulse-item" onClick={() => onOpenLead?.(lead.id)}>
      <span className="cos-pulse-top">
        <span className="cos-pulse-brand">{lead.brand}</span>
        <span className={'cos-pulse-age' + ((lead.daysInStage || 0) >= 10 ? ' is-late' : '')}>
          {lead.daysInStage || 0}d
        </span>
      </span>
      <span className="cos-pulse-move">{lead.nextMove?.text || 'Review thread'}</span>
    </button>
  );
}

function V4CompanyOsPulseLane({ lane, onOpenLead }) {
  const { items } = lane;
  const members = lane.members.map(id => window.V3.USERS[id]).filter(Boolean);
  // Only an actual new inbound message counts as reply-now; auto-drafted
  // replies exist on most rows and are routine follow-up work
  const replyNow = items.filter(l => l.unread);
  const followUps = items.filter(l => !replyNow.includes(l));
  const shownReply = replyNow.slice(0, 6);
  const shownFollow = followUps.slice(0, replyNow.length ? 4 : 6);
  const hiddenCount = items.length - shownReply.length - shownFollow.length;
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
        {replyNow.length > 0 && <span className="cos-pulse-count-hot">{replyNow.length} reply now</span>}
        <span className="cos-panel-count">{items.length}</span>
      </div>
      <div className="cos-pulse-body">
        {shownReply.length > 0 && (
          <div className="cos-pulse-subhead is-hot">
            <span>Reply now</span><span>{replyNow.length}</span>
          </div>
        )}
        {shownReply.map(lead => <V4CompanyOsPulseItem key={lead.id} lead={lead} onOpenLead={onOpenLead} />)}
        {shownReply.length > 0 && shownFollow.length > 0 && (
          <div className="cos-pulse-subhead">
            <span>Follow ups</span><span>{followUps.length}</span>
          </div>
        )}
        {shownFollow.map(lead => <V4CompanyOsPulseItem key={lead.id} lead={lead} onOpenLead={onOpenLead} />)}
        {items.length === 0 && (
          <div className="cos-pulse-empty">Clear. Nothing waiting on {lane.label}.</div>
        )}
        {hiddenCount > 0 && (
          <div className="cos-pulse-more">+{hiddenCount} more in queue</div>
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
      .filter(l => !(window.V3.IsNewLeadReview && window.V3.IsNewLeadReview(l)))
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

    </section>
  );
}

window.V4CompanyOsView = V4CompanyOsView;
