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
      'Zoe sent the final approved version on June 4, 2026 and asked for post one on Monday, June 9, 2026 U.S. time, with post two exactly 24 hours later.',
      'Asher now owes the strongest posting slot, Robert calendar lock, and both live links the moment each post is up.',
      'This is not a revision thread anymore. It is execution timing, posting, and link capture only.',
      'Do not reopen copy unless Zoe changes the approved Notion doc in-thread.',
    ],
  },
  {
    title: 'AhaCreator 3.0 / Arc Growth',
    tags: ['P0', 'access blocked', 'June 5-9 window'],
    points: [
      'Lumina provided the assets and brief, and Robert did complete the June 5 sign-in flow, but Asher confirmed the actual demo environment still is not visible inside the account.',
      'The blocker is now narrowed: login exists, usable product context does not.',
      'Asher owes one exact unblock loop with Lumina so the team lands in the right environment with no ambiguity about what Robert should test.',
      'Do not build the Robert brief or push posting from the written brief alone while the product view is still missing.',
    ],
  },
  {
    title: 'ACL / Hockey Stick',
    tags: ['P0', 'signed', 'budget reconfirmation'],
    points: [
      'Agreement is signed, but Chang replied on June 4, 2026 that Annika is still pinging clients daily for payment confirmation.',
      'Robert already bought the $1,200 ACL ticket, so Asher now needs written budget approval or explicit reimbursement confirmation before any more spend happens.',
      'Do not prep Robert for hotel, flights, or additional travel costs until Annika or Chang confirm budget in writing.',
      'If that confirmation lands, collapse the travel, payment, and reimbursement details into one brief immediately.',
    ],
  },
  {
    title: 'Polsia / Jeddi',
    tags: ['P0', 'invoice out', 'compliance stop'],
    points: [
      'The invoice is already out, but the thread turned risky on June 5, 2026 when Robert floated a no-disclosure billboard angle and Jeddi immediately said yes.',
      'Asher now owes a clean reset: either a compliant Aligned News placement with transparent amplification, or a full pause if Jeddi still wants stealth.',
      'Do not let Robert go shoot posters, post to X, or move this into execution while the disclosure issue is unresolved.',
      'Keep invoice_Polsia_SFPhysicalCampaign_060426.pdf visible in outstanding until the structure is either accepted cleanly or killed.',
    ],
  },
  {
    title: 'Omane / Nitrosend',
    tags: ['P0', 'live', 'payment proof owed'],
    points: [
      'Ori sent the live Nitrosend launch instructions on June 3, 2026, and Asher replied in-thread with the invoice attached plus a direct ask for receipt/payment proof.',
      'The operational task is still payment-proof capture, not more creative work.',
      'Keep invoice_Omane_Nitrosend_060326.pdf in outstanding until receipt or settled payment evidence lands.',
      'Do not mark this complete from goodwill replies alone.',
    ],
  },
  {
    title: 'Chris + Michael / Redirect',
    tags: ['P1', 'missed Friday', 'route through Asher'],
    points: [
      'The Friday, June 5, 2026 meeting broke down, and Michael asked to rebook for Monday.',
      'Robert already closed the loop correctly: no extra catch-up call, send any concrete paid campaign, sponsorship, or scoped collaboration through Asher and Sam.',
      'Asher should treat this as intake-routing only and protect Robert from another exploratory calendar block.',
      'Do not put Robert back on a live call here unless scope, budget, and deliverable are concrete in-thread first.',
    ],
  },
];

const V4_COMPANY_OS_WAITING = [
  {
    title: 'Griffin360 / Lumus',
    tags: ['watch', 'examples sent', 'awaiting brief'],
    points: [
      'Samantha asked for collaboration examples on June 5, 2026 and Asher replied that night with tiered examples, prices, and live post links.',
      'Nothing else is owed until the Lumus team answers with campaign goals, timing, and preferred deliverables.',
      'If they come back with a real ask, move it straight back into action with one recommended package.',
      'Do not create a Robert brief from sample links alone.',
    ],
  },
  {
    title: 'Deck / Nicholas Young',
    tags: ['watch', 'editorial intro', 'YG windows pending'],
    points: [
      'Nicholas clarified that Deck is primarily an editorial or background conversation around AI-native companies and agentic workflows, not a defined sponsor ask.',
      'Asher already asked for YG coffee windows and later steered toward a virtual conversation if travel timing is messy.',
      'Waiting on Nicholas or YG to send real availability and preferred format.',
      'No Robert brief until there is either a locked conversation slot or a concrete collaboration proposal.',
    ],
  },
  {
    title: 'Riverside / Savion',
    tags: ['watch', 'dates pending', 'exec fallback'],
    points: [
      'Savion reversed the termination path and said on June 3, 2026 that Nadav is in, aiming roughly two weeks out, with alternate executives if timing slips.',
      'The latest operating state is still the same: genuine intent is back on both sides, but exact dates still have not landed.',
      'Waiting on exact dates from Riverside; no further Robert prep until a spokesperson and slot are locked.',
      'If dates arrive, move it back to action with one prep path only.',
    ],
  },
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
    title: 'CL Coding Collaboration',
    tags: ['watch', 'intro sent', 'scope needed'],
    points: [
      'Robert handed CL Coding to Asher late on June 5, 2026, and Asher replied the same night with the correct intake ask for goals, platform, deliverable, timing, and budget.',
      'The next move is entirely on their side now.',
      'Keep Robert out until this becomes a real package or execution request.',
      'No 60-second Robert brief yet because there is still no defined scope.',
    ],
  },
  {
    title: 'Do-Not-Touch / Hard Pass',
    tags: ['EezyCollab', 'Olivia', 'hard pass'],
    points: [
      'Robert explicitly declined EezyCollab on June 5, 2026 after the NDA, Discord interview, and post-live payment structure came through.',
      'Sam separately said on June 5, 2026, "we\'re not working for these guys nor have time for their testing. hard pass" on EezyCollab.',
      'Sam separately told Asher on May 31, 2026 to ditch the Olivia paid-promotion thread because it is wasting cycles.',
      'Treat both as closed unless the team explicitly reopens them.',
      'Do not build briefs, negotiate terms, or spend more reply energy here.',
    ],
  },
];

const V4_COMPANY_OS_DONE = [
  {
    title: 'Marketing Guys / Kombai QRT',
    tags: ['June 2 live', 'paid', 'archived'],
    points: [
      'Campaign execution is complete and Robert posted the final QRT on June 2.',
      'Invoice is in DONE: invoice_MarketingGuys_Kombai_QRT_060126.pdf.',
      'Payment is complete; no wire-watch or follow-up remains.',
      'Final link is captured: https://x.com/Scobleizer/status/2061829182154588383?s=20.',
    ],
  },
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
  'Asher owns replies, scheduling, payment-proof capture, invoice links, package sends, demo-access cleanup, and final post links. Sammy escalates. Robert handles intro, testing, interviews, or final execution only.',
  'No paid post, QRT, travel, ticket, hotel, or other spend happens before payment proof, receipt, reimbursement confirmation, written budget approval, or clearly prepaid package coverage is visible in-thread.',
  'A wire screenshot is not settled money. Omane and similar deals stay live until deposit confirmation lands.',
  'If a client wants post-live payment, net terms, or reimbursement later, treat the work as unpaid until cash or written exception is in-thread. Do not schedule Robert around promises.',
  'If the sponsor already approved copy and named the live date, do not reopen messaging. Calendar lock, execution, and live-link capture are the remaining tasks.',
  'If a sponsor asks for stealth posting or no paid-promotion disclosure, reroute it into a compliant media placement or kill it. This overrides any off-the-cuff workaround sent in-thread.',
  'Every Robert brief must fit inside 60 seconds and include scope, timing, deliverable, approval path, payment path, and why Robert is the right fit now.',
  'Do not create a Robert brief for founder intros, editorial coffees, or discovery calls until scope, budget, platform, timing, and owner are concrete.',
  'If the product requires Robert testing, a login alone does not count. No execution brief exists until the actual demo environment or usable access is visible.',
  'Capture the live link and any receipt or reimbursement proof in the same thread before a campaign leaves the board.',
  'Keep new founder outreach in email until the deal shape is real. Do not drift into WhatsApp unless scope is already clear.',
  'Robert will not promote crypto. AI and blockchain infrastructure may be acceptable, but token or coin promotion is out.',
  'If Robert declines a deal or Sam calls it a pass, treat it as closed unless one of them explicitly reopens it.',
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
