// Company OS Beta — full port of the localhost Hermes Workspace UI.
// Built on the gh-pages flow-v4 stack (inline Babel JSX + vanilla CSS).

// ─────────────────────────────────────────────────────────────
// Static brief content — Daily Operating Brief lives here
// ─────────────────────────────────────────────────────────────

const V4_COMPANY_OS_PREP = [
  {
    title: 'MaineCoon / EchoNLab',
    tags: ['P0', 'invoice sent', 'launch assets owed'],
    points: [
      'Judy accepted the $1,895 Tier 2 quote repost on June 13, 2026, and Asher sent the Stripe invoice link to collab@echonlab.com that same day.',
      'The launch is still not Robert-ready. The thread still needs payment proof, the official launch post URL, the posting window, and any required tags or CTA for the June 16 run.',
      'Robert already drafted an internal MaineCoon checklist, but no execution brief should start until both the payment proof and official source post are visible.',
      'If they want the Tier 3 custom post after launch, sell it as a second paid campaign, not a bundled add-on.',
    ],
  },
  {
    title: 'Venice AI / Jay A',
    tags: ['P0', 'date out', 'yes still missing'],
    points: [
      'Jay clarified on June 9, 2026 that Venice AI is a separate Erik Voorhees interview, not the stalled Riverside thread.',
      'Asher offered June 22, 2026 after 1:00 PM PT. Jay said on June 13 he is still checking with the Venice team on that slot.',
      'Asher also reset pricing on June 13: Venice is now $2,495 plus the 3% Stripe fee, while Riverside keeps the legacy $1,800 commitment.',
      'This stays on Asher until there is one explicit yes, one exact time, and one clean payment path. A soft hold is not a booking.',
    ],
  },
  {
    title: 'Perceptron / Agentic Detection',
    tags: ['P0', 'paid', 'final links owed'],
    points: [
      'Eric confirmed payment on June 9, 2026 and sent the launch copy preview on June 10, 2026, but the thread still does not show the final live Perceptron link.',
      'The closeout is incomplete until both links are attached: the source launch post and Robert\'s actual repost URL.',
      'Asher owns artifact capture only here. No more strategy work is needed, just the proof trail.',
      'Do not open the robotics follow-on until the first paid execution is fully linked and archived.',
    ],
  },
  {
    title: 'HeyGen / Andrew Mok',
    tags: ['P0', 'meeting set', 'invite cleanup'],
    points: [
      'Robert and Andrew landed on Wednesday, June 17, 2026 at 11:00 AM PT for the brainstorm call, and Asher sent the Meet details on June 12.',
      'Andrew then asked to shorten it to 30 minutes because he has another meeting at 11:30, and Asher replied that he would adjust it.',
      'The thread still does not show the corrected 30-minute invite, so the scheduling cleanup is not done yet.',
      'Treat this as calendar admin only. No Robert execution brief exists until the live partnership scope becomes concrete.',
    ],
  },
  {
    title: 'Skillshare / Michael Turner',
    tags: ['P0', 'rate sent', 'catalog step pending'],
    points: [
      'Michael pitched one natural 60-second Skillshare mention plus 42% rev share, and Asher answered on June 8, 2026 with the $1,995 rate.',
      'On June 11, Asher confirmed the Skillshare verification email was legitimate and told Michael to open the catalog so Robert can browse.',
      'The thread still lacks a rate acceptance, catalog access follow-through, and real timing for the content piece.',
      'Until that lands, this stays on Asher as commercial follow-up, not a Robert brief.',
    ],
  },
  {
    title: 'KroWork / EezyCollab',
    tags: ['P1', 'counter sent', 'reply missing'],
    points: [
      'Meilinda pushed for a June 15 repost, and Asher answered on June 12, 2026 with the actual terms: $1,895 for the quote repost or $3,995 if they also want the 14-day pin.',
      'Asher also asked for the official post, posting time, talking points, product access, and confirmation of prepay before anything goes live.',
      'There is still no newer brand reply after that counter.',
      'Pinned inventory is its own sale every time. Do not collapse it into the repost price.',
    ],
  },
];

const V4_COMPANY_OS_WAITING = [
  {
    title: 'ACL / Hockey Stick',
    tags: ['watch', 'commercial hold', 'june 20 due'],
    points: [
      'Annika gave the final Alibaba content buckets on June 11, 2026, and Asher answered with the revised 8-piece structure the same day.',
      'The framework is no longer the blocker. The hold is commercial: first payment due June 20, exhibitor-pass fees, and reimbursement/addendum clarity in writing.',
      'Do not spend more on passes, flights, or hotels until the payment and reimbursement path is explicit.',
      'This comes back into action only when the money and pass terms are clear enough to approve logistics.',
    ],
  },
  {
    title: 'AhaCreator 3.0 / Arc Growth',
    tags: ['watch', 'testing done', 'final ok owed'],
    points: [
      'Lumina said on June 11, 2026 that the updated AhaCreator draft looked solid and only asked for small polish items: risk filtering language, 10K+ creator count, blurred screenshots, and the UTM link.',
      'Asher sent the revised doc back the same day, and there is still no newer response in-thread.',
      'Nothing useful happens until the clean green light lands.',
      'If they approve, move it back into action only long enough to confirm post timing and final asset handoff.',
    ],
  },
  {
    title: 'Riverside / Savion',
    tags: ['watch', 'dates pending', 'speaker TBD'],
    points: [
      'Savion said on June 11, 2026 that Nadav still wants to move forward but is out of office and has not sent dates yet.',
      'Jay and Asher both pushed again on June 13, and there is still no interview slot or replacement executive locked in the thread.',
      'Nothing useful is owed until Riverside sends concrete availability.',
      'If dates land, move it back into action immediately and confirm the spokesperson before prep starts.',
    ],
  },
  {
    title: 'FloatSchedule / Judy Gao',
    tags: ['watch', 'testing first', 'timing owed'],
    points: [
      'Judy told Robert on June 8, 2026 to keep testing FloatSchedule, especially AI scheduling, calendar sync, and meeting prep, and Robert said he would send feedback plus availability after a proper run-through.',
      'Asher then asked Judy to name the actual content piece and promotion tier, but there is still no test readout, no selected deliverable, and no locked date.',
      'Wait on Robert\'s real testing readout and one concrete timing window before moving this back into action.',
      'No Robert brief exists until the product test is real and the deliverable is named.',
    ],
  },
  {
    title: 'Viture / Leo Li',
    tags: ['watch', 'proposal sent', 'review next week'],
    points: [
      'Sam sent the seven-month Viture proposal on June 10, 2026, and Leo replied on June 12 that they will review it internally and get back next week.',
      'Asher followed with enthusiasm on June 13, but there is still no yes, no, budget commit, or scoped first deliverable.',
      'Leave this in waiting until Viture comes back with an actual decision or a narrower pilot ask.',
      'Do not spin up Robert work off proposal energy alone.',
    ],
  },
  {
    title: 'Exploratory Inbound / Eastworlds + Joe Devon',
    tags: ['watch', 'needs context', 'not Robert-ready'],
    points: [
      'Eastworlds now has cleaner story constraints around the Chimborazo robot-climb claim, but it still lacks an agreed budget, payment path, and exact execution date.',
      'Joe Devon replied on June 11, 2026 that he is not even sure which event Robert meant, so that thread is context repair, not a live opportunity.',
      'Keep both in email until the opportunity is concrete enough to summarize in one sentence.',
      'Do not create a Robert brief from vague admiration, story ideas, or crossed wires.',
    ],
  },
];

const V4_COMPANY_OS_DONE = [
  {
    title: 'Omane / Nitrosend',
    tags: ['June 3 live', 'paid June 11', 'proof landed'],
    points: [
      'Nitrosend went live on June 3, 2026 and the invoice was already out.',
      'Payment proof landed on June 11, 2026 via the Wells Fargo alert showing a $1,000 Zelle deposit with memo "Omane Media."',
      'This is closed by bank proof, not by a client receipt email.',
      'Keep the Wells Fargo proof tied to the invoice so the archive stays clean.',
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
  'Asher owns replies, invoice links, payment-proof capture, final post links, reimbursement follow-up, scheduling cleanup, and Robert brief prep. Sammy escalates. Robert only handles testing, interviews, intros, and final execution.',
  'No paid post, travel spend, hotel, or extra pass cost happens before payment proof, written reimbursement, written budget approval, or clearly prepaid package coverage is visible in-thread.',
  'A live post is not a closed deal. If the receipt or bank proof is missing, the item stays in action until proof lands.',
  'If payment proof lands outside the client thread, log it against the invoice before calling the deal done.',
  'Once an invoice link is already in-thread, stop re-explaining the package and chase only payment proof, live asset, and posting window.',
  'If a client wants split payment, post-live payment, net terms, stealth posting, or no paid-promotion disclosure, the answer is no until the thread proves otherwise.',
  'Pinned posts are separate inventory. If a client wants the top slot held, price the pin separately instead of quietly bundling it into the repost.',
  'If a client has paid but the launch URL or Robert repost URL is missing, chase the links before opening any next-campaign discussion.',
  'An interview is not scheduled when someone says a time might work. It is scheduled only when both sides say yes and the invite reflects the final duration.',
  'Venice is on the new interview price of $2,495 plus Stripe. Riverside keeps the old $1,800 commitment unless the thread changes in writing.',
  'If a meeting duration changes after a slot is picked, update the invite itself. An email promise to adjust is not enough.',
  'If a product requires testing, a login alone does not count. No execution brief exists until Robert can actually use the right environment and report something real back.',
  'Every Robert brief must fit inside 60 seconds and include scope, timing, deliverable, approval path, payment path, owner, and why Robert is the right fit now.',
  'Do not create a Robert brief for exploratory calls, vague intros, or proposal-only threads. Scope, budget, platform, timing, and owner must already be concrete.',
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

function V4CompanyOsTier(lead) {
  if (!lead) return null;
  if (lead.brief?.tier) return Number(lead.brief.tier) || null;
  const text = [
    lead.deliverables,
    lead.notes,
    lead.evidence,
    lead.nextMove?.text,
    ...(Array.isArray(lead.thread) ? lead.thread.map(m => `${m.subject || ''} ${m.body || ''}`) : []),
  ].filter(Boolean).join(' ').toLowerCase();
  const explicit = text.match(/\btier\s*([1-7])\b/);
  if (explicit) return Number(explicit[1]);
  const value = Number(lead.value || 0);
  if (value >= 5800) return 7;
  if (value >= 3900) return 6;
  if (value >= 2900) return 5;
  if (value >= 2400) return 4;
  if (value >= 1950) return 3;
  if (value >= 1800) return 2;
  if (value > 0) return 1;
  return null;
}

function V4CompanyOsType(lead) {
  const text = [
    lead?.category,
    lead?.deliverables,
    lead?.notes,
    lead?.evidence,
    lead?.nextMove?.text,
    ...(Array.isArray(lead?.thread) ? lead.thread.map(m => `${m.subject || ''} ${m.body || ''}`) : []),
  ].filter(Boolean).join(' ').toLowerCase();
  if (/\b(interview|podcast|speaker|fireside|webinar|panel)\b/.test(text)) return 'interview';
  if (/\b(intro|introduction|connect|network)\b/.test(text)) return 'intro';
  if (/\b(partner|partnership|sponsor|sponsorship|paid)\b/.test(text)) return 'partnership';
  if (/\b(collab|collaboration|campaign|post|repost|thread|retweet|linkedin|newsletter)\b/.test(text)) return 'collaboration';
  return lead?.category || 'unscoped';
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

// ─────────────────────────────────────────────────────────────
// Superhuman workspace — splits rail + thread list + reader
// ─────────────────────────────────────────────────────────────

// PATCH a card in Supabase and update local state optimistically,
// same pattern as V3MoveLeadStage.
function V4CosPatchLead(lead, fields, localPatch) {
  const id = lead?.rowId || lead?.id;
  if (!id) return;
  fetch(V3_SUPABASE_URL + '/rest/v1/cards?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH',
    headers: {
      apikey: V3_SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + V3_SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(fields),
  }).catch(err => console.warn('[ALIGNED v4] lead patch failed:', err));
  const updated = (window.V3.LEADS || []).map(item =>
    String(item.id) === String(lead.id) ? { ...item, ...localPatch } : item);
  window.V3.LEADS = updated;
  window.dispatchEvent(new CustomEvent('v3:leads-loaded', { detail: { leads: updated } }));
}

// Overview — glanceable metrics, live activity, team status, priorities
function V4CosOverview({ leads, replyCount }) {
  const { USERS } = window.V3;
  const now = Date.now();
  const todayKey = new Date().toDateString();
  const newToday = leads.filter(l => l.receivedAt && new Date(l.receivedAt).toDateString() === todayKey).length;
  const doneWeek = leads.filter(l =>
    ['done', 'paid-out'].includes(l.stage) &&
    l.lastTouchAt && (now - Date.parse(l.lastTouchAt)) < 7 * 86400000).length;
  const pipeline = leads.filter(l => !['done', 'paid-out'].includes(l.stage)).reduce((s, l) => s + (l.value || 0), 0);

  const events = [];
  for (const l of leads) {
    if (l.unread && l.lastTouchAt) events.push({ t: Date.parse(l.lastTouchAt) || 0, type: 'reply', label: `${l.brand} — new message from ${l.contactName.split(' ')[0]}` });
    if (l.receivedAt && (now - Date.parse(l.receivedAt)) < 14 * 86400000) events.push({ t: Date.parse(l.receivedAt) || 0, type: 'new', label: `New lead — ${l.brand} (${l.source})` });
    if (['done', 'paid-out'].includes(l.stage) && l.lastTouchAt && (now - Date.parse(l.lastTouchAt)) < 14 * 86400000) events.push({ t: Date.parse(l.lastTouchAt) || 0, type: 'closed', label: `${l.brand} — ${l.stage === 'paid-out' ? 'paid out' : 'done'}` });
  }
  events.sort((a, b) => b.t - a.t);
  const feed = events.slice(0, 10);

  const STATUS_DEFAULTS = { robert: 'Creator work', asher: 'Working the inbox', sammy: 'Sales follow ups' };
  const [teamStatus, setTeamStatus] = React.useState(() => {
    try { return JSON.parse(window.localStorage.getItem('v4-team-status') || '{}'); } catch (e) { return {}; }
  });
  const setStatus = (id, text) => setTeamStatus(s => {
    const next = { ...s, [id]: text };
    try { window.localStorage.setItem('v4-team-status', JSON.stringify(next)); } catch (e) {}
    return next;
  });

  return (
    <div className="cosov">
      <div className="cosov-metrics">
        <div className="cosov-card"><strong>{newToday}</strong><span>New leads today</span></div>
        <div className="cosov-card cosov-card-hot"><strong>{replyCount}</strong><span>Need a reply</span></div>
        <div className="cosov-card"><strong>{doneWeek}</strong><span>Closed this week</span></div>
        <div className="cosov-card"><strong>{V4CompanyOsMoney(pipeline) || '$0'}</strong><span>Pipeline in play</span></div>
      </div>

      <div className="cosov-grid">
        <section className="cos-panel cosov-panel">
          <div className="cos-panel-head"><h3>Recent activity</h3><span className="cos-panel-count">{feed.length}</span></div>
          <div className="cosov-feed">
            {feed.map((e, i) => (
              <div key={i} className="cosov-event">
                <span className={'cosov-event-dot is-' + e.type}></span>
                <span className="cosov-event-label">{e.label}</span>
                <span className="cosov-event-when">{V3RelativeTime(new Date(e.t).toISOString())}</span>
              </div>
            ))}
            {feed.length === 0 && <div className="dq-empty">Quiet. No recent activity.</div>}
          </div>
        </section>

        <div className="cosov-side">
          <section className="cos-panel cosov-panel">
            <div className="cos-panel-head"><h3>Team</h3></div>
            <div className="cosov-team">
              {['robert', 'asher', 'sammy'].map(id => {
                const u = USERS[id];
                return (
                  <div key={id} className="cosov-member">
                    <V3Avatar name={u.name} color={u.color} size="sm" />
                    <div className="cosov-member-text">
                      <strong>{u.name}</strong>
                      <input className="cosov-status-input"
                             value={teamStatus[id] ?? STATUS_DEFAULTS[id]}
                             onChange={e => setStatus(id, e.target.value)}
                             placeholder="What are they on?" />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="cos-panel cosov-panel">
            <div className="cos-panel-head"><h3>Current priorities</h3><span className="cos-panel-count">{V4_COMPANY_OS_PREP.length}</span></div>
            <div className="cosov-priorities">
              {V4_COMPANY_OS_PREP.map(item => (
                <div key={item.title} className="cosov-priority">
                  <strong>{item.title}</strong>
                  <span className="cos-chips">
                    {item.tags.slice(0, 3).map(t => <span key={t} className="cos-chip cos-chip-tight">{t}</span>)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <V4CosBriefBoard />
    </div>
  );
}

function V4CosBriefBoard() {
  const todayLabel = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return (
    <section className="cos-section cos-brief" style={{ padding: '18px 22px 40px' }}>
      <div className="cos-brief-head">
        <div>
          <div className="cos-section-eyebrow-row">
            <span className="cos-eyebrow">Daily Operating Brief</span>
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
            <span className="cos-panel-count">{V4_COMPANY_OS_PREP.length}</span>
          </div>
          <div className="cos-panel-body">
            {V4_COMPANY_OS_PREP.map(item => <V4CompanyOsActionItem key={item.title} item={item} />)}
          </div>
        </section>
        <section className="cos-panel cos-panel-watch">
          <div className="cos-panel-head">
            <h3>Watch / Waiting</h3>
            <span className="cos-panel-count">{V4_COMPANY_OS_WAITING.length}</span>
          </div>
          <div className="cos-panel-body">
            {V4_COMPANY_OS_WAITING.map(item => <V4CompanyOsWatchItem key={item.title} item={item} />)}
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
            <span className="cos-panel-count">{V4_COMPANY_OS_DONE.length}</span>
          </div>
          <div className="cos-done-grid">
            {V4_COMPANY_OS_DONE.map(item => <V4CompanyOsDoneItem key={item.title} item={item} />)}
          </div>
        </section>
      </div>
    </section>
  );
}

function V4CosReader({ lead, user, composeOpen, setComposeOpen, onBack }) {
  const { STAGE_BY_ID, USERS } = window.V3;
  const [tab, setTab] = React.useState('thread');
  React.useEffect(() => { setTab('thread'); }, [lead?.id]);
  if (!lead) {
    return <div className="cos2-reader"><div className="cos2-reader-empty">Select a thread from the list.</div></div>;
  }
  const stage = STAGE_BY_ID[lead.stage];
  const nextOwner = lead.nextMove?.who ? USERS[lead.nextMove.who] : null;
  const isMine = window.V3.MoveIsMineForProfile(lead, user);
  const isThem = !lead.nextMove?.who && !['paid-out'].includes(lead.stage);
  const replyAction = ['Reply', 'Send', 'Nudge'].includes(lead.nextMove?.action);
  const owner = lead.ownerId ? USERS[lead.ownerId] : null;
  return (
    <div className="cos2-reader">
      <div className="drawer-hd">
        <button className="hd-icon-btn cos2-back" onClick={onBack} aria-label="Back to list">
          <V3Icon name="chev_d" w={14} style={{ transform: 'rotate(90deg)' }} />
        </button>
        <span className="drawer-hd-brand">{lead.brand}</span>
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
          <div className="drawer-top-co">{lead.contactRole} at <strong>{lead.brand}</strong></div>
        </div>
      </div>
      <div className={'next-move ' + (isMine ? '' : 'them')}>
        <div className="next-move-icon">
          <V3Icon name={isMine ? 'reply' : 'clock'} w={18} />
        </div>
        <div className="next-move-text">
          <div className="next-move-eyebrow">
            Next move {isMine ? '· yours' : isThem ? `· waiting on ${lead.contactName.split(' ')[0]}` : nextOwner ? `· ${nextOwner.name}'s` : ''}
          </div>
          <div className="next-move-title">{lead.nextMove?.text}</div>
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
      <div className="drawer-facts">
        {lead.value ? <span className="drawer-fact mono">{v3Money(lead.value)}</span> : null}
        {owner && <span className="drawer-fact"><V3Avatar name={owner.name} color={owner.color} size="xs" /> {owner.name}</span>}
        <span className="drawer-fact mono">{lead.daysInStage}d in stage</span>
        <span className="drawer-fact">{lead.source}</span>
        {lead.deliverables ? <span className="drawer-fact drawer-fact-wide" title={lead.deliverables}>{lead.deliverables}</span> : null}
      </div>
      <div className="drawer-tabs">
        <button className="dr-tab" aria-selected={tab === 'thread'} onClick={() => setTab('thread')}>
          Email thread <span className="cnt">{lead.thread.length}</span>
        </button>
        <button className="dr-tab" aria-selected={tab === 'stands'} onClick={() => setTab('stands')}>
          Where this stands
        </button>
      </div>
      <div className="drawer-body">
        {tab === 'thread' && <V3Thread lead={lead} />}
        {tab === 'stands' && <V3Stands lead={lead} />}
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
  );
}

function V4CompanyOsView({ leads = [], query = '', user = 'asher', onOpenLead }) {
  const TEAM = ['asher', 'sammy'];
  const base = React.useMemo(() => leads
    .filter(l => !l.isRobertBrief)
    .filter(l => !(window.V3.IsNewLeadReview && window.V3.IsNewLeadReview(l)))
    .filter(l => V4CompanyOsFilterLead(l, query)), [leads, query]);
  const live = base.filter(l => !['trash', 'dead-leads'].includes(l.stage));
  const byStale = (a, b) => (b.daysInStage || 0) - (a.daysInStage || 0);
  const byRecent = (a, b) => V3TimestampForUi(b.lastTouchAt) - V3TimestampForUi(a.lastTouchAt);

  // Snooze, Superhuman style — H hides a thread until tomorrow 9am.
  // Stored per browser; snoozed threads live in their own split.
  const [snoozes, setSnoozes] = React.useState(() => {
    try { return JSON.parse(window.localStorage.getItem('v4-snoozes') || '{}'); } catch (e) { return {}; }
  });
  React.useEffect(() => {
    try { window.localStorage.setItem('v4-snoozes', JSON.stringify(snoozes)); } catch (e) {}
  }, [snoozes]);
  const nowTs = Date.now();
  const isSnoozed = (l) => snoozes[l.id] && Date.parse(snoozes[l.id]) > nowTs;
  const awake = live.filter(l => !isSnoozed(l));
  const activeDeals = awake.filter(l => !['trash', 'dead-leads', 'done', 'paid-out'].includes(l.stage));
  const tierSplits = [1, 2, 3, 4, 5, 6, 7].map(tier => ({
    id: `tier-${tier}`,
    label: `Tier ${tier}`,
    section: 'Packages',
    items: activeDeals.filter(l => V4CompanyOsTier(l) === tier).sort(byRecent),
  }));
  const interviewItems = activeDeals.filter(l => V4CompanyOsType(l) === 'interview').sort(byRecent);
  const partnershipItems = activeDeals.filter(l => V4CompanyOsType(l) === 'partnership').sort(byRecent);
  const introItems = activeDeals.filter(l => V4CompanyOsType(l) === 'intro').sort(byRecent);
  const unscopedItems = activeDeals.filter(l => !V4CompanyOsTier(l) && !['interview', 'partnership', 'intro'].includes(V4CompanyOsType(l))).sort(byRecent);

  const splits = [
    { id: 'reply',   label: 'Reply now',       section: 'Action', hot: true, items: awake.filter(l => l.unread && l.nextMove?.who).sort(byStale) },
    { id: 'follow',  label: 'Follow ups',      section: 'Action', items: awake.filter(l => !l.unread && TEAM.includes(l.nextMove?.who) && (l.daysInStage || 0) <= 21).sort(byStale) },
    { id: 'robert',  label: 'Robert',          section: 'Action', items: awake.filter(l => l.nextMove?.who === 'robert').sort(byRecent) },
    { id: 'waiting', label: 'Waiting on them', section: 'Action', items: awake.filter(l => !l.nextMove?.who && !['done', 'paid-out'].includes(l.stage)).sort(byRecent) },
    ...tierSplits,
    { id: 'interviews', label: 'Interviews',   section: 'By type', items: interviewItems },
    { id: 'partners',   label: 'Partnerships', section: 'By type', items: partnershipItems },
    { id: 'intros',     label: 'Intros',       section: 'By type', items: introItems },
    { id: 'unscoped',   label: 'Needs scope',  section: 'By type', items: unscopedItems },
    { id: 'snoozed', label: 'Snoozed',         section: 'System', items: live.filter(isSnoozed).sort((a, b) => Date.parse(snoozes[a.id]) - Date.parse(snoozes[b.id])) },
    { id: 'closed',  label: 'Done and paid',   section: 'System', items: awake.filter(l => ['done', 'paid-out'].includes(l.stage)).sort(byRecent) },
    { id: 'brief',   label: 'Overview',        section: 'System', brief: true },
  ];

  const [splitId, setSplitId] = React.useState('reply');
  const [selId, setSelId] = React.useState(null);
  const [composeOpen, setComposeOpen] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const split = splits.find(s => s.id === splitId) || splits[0];
  const items = split.items || [];
  const selected = items.find(l => String(l.id) === String(selId)) || items[0] || null;

  React.useEffect(() => { setSelId(null); setMobileOpen(false); setComposeOpen(false); }, [splitId]);
  React.useEffect(() => { setComposeOpen(false); }, [selected?.id]);

  const moveSel = (delta) => {
    if (!items.length) return;
    const idx = items.findIndex(l => String(l.id) === String(selected?.id));
    const next = items[Math.min(items.length - 1, Math.max(0, (idx === -1 ? 0 : idx + delta)))];
    if (next) setSelId(next.id);
  };
  const advanceFrom = (lead) => {
    const idx = items.findIndex(l => String(l.id) === String(lead.id));
    const next = items[idx + 1] || items[idx - 1] || null;
    if (next) setSelId(next.id);
  };
  const archive = () => {
    if (!selected) return;
    advanceFrom(selected);
    window.V3.MoveLeadStage(selected, 'trash');
  };
  // H — snooze until tomorrow 9am (or wake it from the Snoozed split)
  const snoozeSelected = () => {
    if (!selected) return;
    advanceFrom(selected);
    if (split.id === 'snoozed') {
      setSnoozes(s => { const copy = { ...s }; delete copy[selected.id]; return copy; });
    } else {
      const until = new Date();
      until.setDate(until.getDate() + 1);
      until.setHours(9, 0, 0, 0);
      setSnoozes(s => ({ ...s, [selected.id]: until.toISOString() }));
    }
  };
  // U — toggle read state, backed by new_reply_at in Supabase
  const toggleRead = () => {
    if (!selected) return;
    if (selected.unread) {
      V4CosPatchLead(selected, { new_reply_at: null }, { unread: false });
    } else {
      const ts = new Date().toISOString();
      V4CosPatchLead(selected, { new_reply_at: ts }, { unread: true });
    }
  };

  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (composeOpen) setComposeOpen(false);
        else if (mobileOpen) setMobileOpen(false);
        return;
      }
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (split.brief) return;
      if (e.key === 'j' || e.key === 'J' || e.key === 'ArrowDown') { e.preventDefault(); moveSel(1); }
      if (e.key === 'k' || e.key === 'K' || e.key === 'ArrowUp')   { e.preventDefault(); moveSel(-1); }
      if (e.key === 'r' || e.key === 'R') { e.preventDefault(); if (selected) setComposeOpen(true); }
      if (e.key === 'e' || e.key === 'E') { e.preventDefault(); archive(); }
      if (e.key === 'h' || e.key === 'H') { e.preventDefault(); snoozeSelected(); }
      if (e.key === 'u' || e.key === 'U') { e.preventDefault(); toggleRead(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const replyCount = splits[0].items.length;
  const p0Count = live.filter(l => l.unread || l.stage === 'invoice-sent').length;
  const invoicedOutstanding = live.filter(l => l.stage === 'invoice-sent').reduce((s, l) => s + (l.value || 0), 0);
  const openPipeline = live.filter(l => !['done', 'paid-out'].includes(l.stage)).reduce((s, l) => s + (l.value || 0), 0);

  return (
    <section className="page cos2-page">
      <header className="cos2-top">
        <span className="cos2-brand">
          <V4CompanyOsBuildingIcon size={18} />
          <strong>UnalignedOS</strong>
        </span>
        <span className="cos-kpi cos-kpi-tight"><strong>{p0Count}</strong> P0</span>
        <span className="cos-kpi cos-kpi-tight cos-kpi-accent"><strong>{replyCount}</strong> reply now</span>
        <span className="cos-kpi cos-kpi-tight"><strong>{V4CompanyOsMoney(invoicedOutstanding) || '$0'}</strong> Invoiced</span>
        <span className="cos-kpi cos-kpi-tight"><strong>{V4CompanyOsMoney(openPipeline) || '$0'}</strong> In play</span>
        <button type="button" className="cos-refresh-btn cos2-refresh" onClick={() => window.location.reload()}>↻ Refresh</button>
      </header>
      <div className={'cos2-body' + (mobileOpen ? ' is-mobile-open' : '')}>
        <nav className="cos2-rail" aria-label="Splits">
          {splits.map((s, idx) => (
            <React.Fragment key={s.id}>
              {(idx === 0 || splits[idx - 1].section !== s.section) && (
                <div className="cos2-split-section">{s.section}</div>
              )}
              <button type="button"
                      className={'cos2-split' + (s.id === split.id ? ' is-active' : '') + (s.hot ? ' is-hot' : '')}
                      onClick={() => setSplitId(s.id)}>
                <span>{s.label}</span>
                {!s.brief && <span className="cos2-split-cnt">{s.items.length}</span>}
              </button>
            </React.Fragment>
          ))}
          <div className="dq-hints cos2-hints">
            <span><kbd>J</kbd><kbd>K</kbd> move</span>
            <span><kbd>R</kbd> reply</span>
            <span><kbd>E</kbd> archive</span>
            <span><kbd>H</kbd> snooze</span>
            <span><kbd>U</kbd> unread</span>
            <span><kbd>⌘K</kbd> commands</span>
            <span><kbd>?</kbd> help</span>
          </div>
        </nav>
        {split.brief ? (
          <div className="cos2-main-scroll"><V4CosOverview leads={live} replyCount={splits[0].items.length} /></div>
        ) : (
          <>
            <div className="cos2-list">
              {items.map(l => (
                <button key={l.id} type="button"
                        className={'cos2-row' + (String(l.id) === String(selected?.id) ? ' is-current' : '')}
                        onClick={() => { setSelId(l.id); setMobileOpen(true); }}>
                  <span className="cos2-row-top">
                    {l.unread && <span className="dq-dot" />}
                    <span className="cos2-row-brand">{l.brand}</span>
                    <span className="cos2-row-when">{l.lastTouch}</span>
                  </span>
                  <span className="cos2-row-snip"><strong>{l.contactName}</strong>{l.nextMove?.text ? ' · ' + l.nextMove.text : ''}</span>
                </button>
              ))}
              {items.length === 0 && (
                <div className="cos2-zero">
                  <span className="cos2-zero-mark">✓</span>
                  <strong>Inbox zero</strong>
                  <span>Nothing in {split.label.toLowerCase()}. Breathe.</span>
                </div>
              )}
            </div>
            <V4CosReader lead={selected} user={user}
                         composeOpen={composeOpen} setComposeOpen={setComposeOpen}
                         onBack={() => setMobileOpen(false)} />
          </>
        )}
      </div>
    </section>
  );
}

window.V4CompanyOsView = V4CompanyOsView;
