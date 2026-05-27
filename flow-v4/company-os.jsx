// Company OS Beta — simple deal machine view for the live UNALIGNED site

const V4_COMPANY_OS_PREP = [
  {
    title: 'Kombai QRT via Marketing Guys',
    meta: 'Needs Prep / Action',
    points: [
      'Launch moved to Tuesday, June 2.',
      'Rate confirmed: $1,895.',
      'Need Robert to test/review kombai.com before QRT.',
      'Need receipt/payment confirmation before posting.',
    ],
  },
  {
    title: 'AhaCreator 3.0 launch',
    meta: 'Needs Prep / Action',
    points: [
      'Paid X narrative thread. Budget: $2,495.',
      'Latest follow-up is working toward June 2.',
      'Resolve date mismatch, invoice, and whether Robert commentary changes rate.',
    ],
  },
  {
    title: 'NVIDIA Nemotron / NemoClaw briefing',
    meta: 'Needs Prep / Action',
    points: [
      'Briefing: Wednesday, May 27 at 8am PT.',
      'Embargo: Thursday, June 4 at 6am PT.',
      'Need NVIDIA NGC login and Google Form completed for model access.',
      'Do not mention Nemotron 3.5 Nano publicly until NVIDIA clears it.',
    ],
  },
  {
    title: 'ACL San Diego / Alibaba via Hockey Stick',
    meta: 'Needs Prep / Action',
    points: [
      'Event target: July 5 in San Diego.',
      'Proposed fee: $20,000, with payment split before/on event.',
      'Meeting set: Wednesday, May 27, 12:00-12:30pm ET.',
      'Decide content pieces, travel, video deliverables, and approval process.',
    ],
  },
  {
    title: 'Life Summit / Bloomstack',
    meta: 'Needs Prep / Action',
    points: [
      'Event: June 11.',
      'Robert needs to accept LinkedIn connection/speaker invite.',
      'Resource kit exists; speaker posts should tag Bloomstack.',
    ],
  },
  {
    title: 'Riverside / Nadav',
    meta: 'Needs Prep / Action',
    points: [
      'Still needs rescheduling.',
      'Draft times include May 29, June 1, June 2, and June 3 windows.',
      'Send or confirm the reschedule email.',
    ],
  },
];

const V4_COMPANY_OS_WAITING = [
  {
    title: 'Anything.com / Leo launch amplification',
    points: ['Recurring X + LinkedIn launch posts.', 'Rate PDF sent; waiting on next details.'],
  },
  {
    title: 'Goodfire / SoCap',
    points: ['May 26-28 was postponed.', 'No prep until new dates arrive.'],
  },
  {
    title: 'Deel / SoCap',
    points: ['June 2 was postponed.', 'No prep until new dates arrive.'],
  },
  {
    title: 'R3ACH / Declan',
    points: ['Asher asked for overview/onboarding details.', 'Waiting on them.'],
  },
  {
    title: 'IFM / Hector Liu',
    points: ['Scheduling needed for Hector Liu at IFM Lab in Sunnyvale.', 'Not a paid collab yet.'],
  },
];

const V4_COMPANY_OS_SENDERS = [
  { id: 'asher', label: 'Asher', role: 'Replies and closes the fluff' },
  { id: 'robert', label: 'Robert', role: 'Intro and final execution only' },
  { id: 'sam', label: 'Sammy', role: 'Oversight' },
];

const V4_COMPANY_OS_STAGES = [
  { key: 'new', label: 'Robert contacted' },
  { key: 'intro', label: 'Team intro' },
  { key: 'client', label: 'Client work' },
  { key: 'invoice', label: 'Invoice/pay' },
  { key: 'brief', label: '60-sec brief' },
  { key: 'done', label: 'Done' },
];

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
  return 'Robert opened the door. Asher should collect budget, timing, deliverables, payment path, and whether Robert is needed.';
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

function V4CompanyOsActionCard({ item, compact }) {
  return (
    <article className={compact ? 'cos-action cos-action-compact' : 'cos-action'}>
      <div className="cos-action-meta">{item.meta || 'Watch / Waiting'}</div>
      <h3>{item.title}</h3>
      <ul>
        {item.points.map(point => <li key={point}>{point}</li>)}
      </ul>
    </article>
  );
}

function V4CompanyOsView({ leads = [], query = '', onOpenLead }) {
  const activeLeads = React.useMemo(() => {
    return leads
      .filter(lead => !lead.isRobertBrief)
      .filter(lead => lead.stage !== 'trash' && lead.stage !== 'dead-leads')
      .filter(lead => V4CompanyOsFilterLead(lead, query))
      .sort((a, b) => {
        const pa = (a.needsReply ? 100 : 0) + (a.stage === 'invoice-sent' ? 40 : 0) + (a.daysInStage || 0);
        const pb = (b.needsReply ? 100 : 0) + (b.stage === 'invoice-sent' ? 40 : 0) + (b.daysInStage || 0);
        return pb - pa;
      });
  }, [leads, query]);

  const [activeId, setActiveId] = React.useState(null);
  const [sender, setSender] = React.useState('asher');
  const [copied, setCopied] = React.useState(false);
  const activeLead = activeLeads.find(lead => lead.id === activeId) || activeLeads[0] || null;
  const stageIndex = V4CompanyOsStageIndex(activeLead);
  const recipients = activeLead && window.V3ReplyRecipients ? window.V3ReplyRecipients(activeLead, sender) : { to: [], cc: [] };
  const draft = React.useMemo(() => V4CompanyOsDraft(activeLead, sender), [activeLead?.id, activeLead?.draftReply?.body, sender]);
  const topPrep = V4_COMPANY_OS_PREP.slice(0, 4);
  const totalValue = activeLeads.reduce((sum, lead) => sum + (lead.value || 0), 0);

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

  return (
    <section className="page company-os-page">
      <div className="cos-shell">
        <aside className="cos-left">
          <div className="cos-left-top">
            <div>
              <div className="page-eyebrow">Company OS Beta</div>
              <h1 className="page-title">Turn leads into money.</h1>
            </div>
            <div className="cos-kpis" aria-label="Company OS snapshot">
              <span>{activeLeads.length} live leads</span>
              <span>{V4CompanyOsMoney(totalValue) || 'value TBD'}</span>
              <span>Asher replies</span>
            </div>
          </div>

          <div className="cos-brief-grid">
            <section className="cos-panel cos-daily">
              <div className="cos-section-head">
                <div>
                  <div className="cos-eyebrow">Needs Prep / Action</div>
                  <h2>Today’s money queue</h2>
                </div>
                <span>{topPrep.length}</span>
              </div>
              <div className="cos-action-grid">
                {topPrep.map(item => <V4CompanyOsActionCard key={item.title} item={item} />)}
              </div>
            </section>

            <section className="cos-panel cos-watch">
              <div className="cos-section-head">
                <div>
                  <div className="cos-eyebrow">Watch / Waiting</div>
                  <h2>Do not burn time here</h2>
                </div>
                <span>{V4_COMPANY_OS_WAITING.length}</span>
              </div>
              {V4_COMPANY_OS_WAITING.map(item => <V4CompanyOsActionCard key={item.title} item={item} compact />)}
            </section>
          </div>

          <section className="cos-panel cos-deal">
            <div className="cos-deal-main">
              <div className="cos-tags">
                <span>{activeLead?.needsReply ? 'needs reply' : 'active'}</span>
                <span>{activeLead?.stage || 'no stage'}</span>
                {activeLead?.lastTouch && <span>{activeLead.lastTouch}</span>}
              </div>
              <div className="cos-deal-title-row">
                <div>
                  <div className="cos-eyebrow">Active Deal</div>
                  <h2>{activeLead?.title || activeLead?.brand || 'No lead selected'}</h2>
                </div>
                {activeLead && (
                  <button className="btn btn-sm" onClick={() => onOpenLead?.(activeLead.id)}>Open packet</button>
                )}
              </div>

              <div className="cos-current-job">
                <div className="cos-eyebrow">Current Job</div>
                <strong>{V4CompanyOsJob(activeLead)}</strong>
                <p>{V4CompanyOsWhy(activeLead)}</p>
              </div>

              <div className="cos-path" aria-label="Deal path">
                {V4_COMPANY_OS_STAGES.map((stage, index) => (
                  <div key={stage.key} className={index <= stageIndex ? 'is-done' : ''}>
                    <span></span>
                    <small>{stage.label}</small>
                  </div>
                ))}
              </div>

              <div className="cos-facts">
                <div>
                  <span>Need From Client</span>
                  <strong>budget, timing, deliverables, approval, payment path</strong>
                </div>
                <div>
                  <span>Robert Rule</span>
                  <strong>keep Robert out until intro or 60-second execution brief</strong>
                </div>
                <div>
                  <span>Payment Rule</span>
                  <strong>posting does not move without payment status visible</strong>
                </div>
              </div>
            </div>

            <aside className="cos-reply-panel">
              <div className="cos-eyebrow">Reply Operator</div>
              <div className="cos-senders">
                {V4_COMPANY_OS_SENDERS.map(option => (
                  <button key={option.id} aria-pressed={sender === option.id} onClick={() => setSender(option.id)}>
                    <strong>{option.label}</strong>
                    <span>{option.role}</span>
                  </button>
                ))}
              </div>
              <div className="cos-recips">
                <span>To {recipients.to.length || 0}</span>
                <span>Cc {recipients.cc.length || 0}</span>
              </div>
              <pre className="cos-draft">{draft || 'Pick a live lead to prepare a reply.'}</pre>
              <div className="cos-reply-actions">
                <button className="btn btn-accent" onClick={sendDraft}>{window.V3SendLeadEmail ? `Send as ${V3SenderName(sender)}` : `Prepare as ${V3SenderName(sender)}`}</button>
                <button className="btn" onClick={copyDraft}>{copied ? 'Copied' : 'Copy draft'}</button>
              </div>
            </aside>
          </section>
        </aside>

        <aside className="cos-queue">
          <div className="cos-section-head">
            <div>
              <div className="cos-eyebrow">Live Leads</div>
              <h2>Next in line</h2>
            </div>
            <span>{activeLeads.length}</span>
          </div>
          <div className="cos-lead-list">
            {activeLeads.slice(0, 18).map(lead => (
              <button
                key={lead.id}
                className={lead.id === activeLead?.id ? 'cos-lead-card is-active' : 'cos-lead-card'}
                onClick={() => setActiveId(lead.id)}
              >
                <span className="cos-lead-title">{lead.title || lead.brand}</span>
                <span className="cos-lead-meta">{lead.brand} · {lead.stage}</span>
                <span className="cos-lead-next">{V4CompanyOsJob(lead)}</span>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}

window.V4CompanyOsView = V4CompanyOsView;
