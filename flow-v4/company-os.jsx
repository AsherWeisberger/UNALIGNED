// UnalignedOS — Company Operating System
// Daily brief, pipeline, and execution surface for the UNALIGNED team.
// Live data from Supabase + X intake. Fast local editing supported.

// ─────────────────────────────────────────────────────────────
// LEGACY static content (kept for reference / fallback ideas).
// The live Daily Operating Brief now uses V4ComputeDailyBrief(leads).
// ─────────────────────────────────────────────────────────────

const V4_COMPANY_OS_PREP = [
  {
    title: 'iMerch / 3-placement bundle',
    tags: ['P0', 'invoice now', 'first draft urgent'],
    points: [
      'Peter Zheng said on June 23, 2026 that iMerch wants to move forward on the $4,595 three-placement bundle and is fine with paying upfront.',
      'They want the first urgent draft aimed at an Elon-reply-style placement, using the AQ_AIhealth source post plus the attached campaign infographic.',
      'Invoice/payment instructions are now concrete: send the invoice to zyxnnk.us@gmail.com and keep the three-placement scope explicit before Robert starts drafting.',
      'Asher owns the invoice link, proof chase, and the shortest useful Robert brief. Do not let the thread drift into creative work before the upfront payment path is live.',
    ],
  },
  {
    title: 'Acti / June 30 quote post',
    tags: ['P0', 'launch held', 'payment not shown'],
    points: [
      'AK locked the official announcement for June 30, 2026 at 7:30 AM PT and wants Robert queued for a quote post immediately after the main tweet goes live.',
      'The thread now has the confidential launch video, product brief, and official draft language, but the final source tweet only arrives at launch and there is still no payment proof in-thread.',
      'Asher owns the invoice or payment confirmation path, the Robert prep note, and the launch-morning handoff for the final source link.',
      'This is not ready just because the timing is fixed. Lock the money path and the quote-copy prep before June 30.',
    ],
  },
  {
    title: 'ACL / Hockey Stick',
    tags: ['P0', 'overdue invoice', 'script pressure'],
    points: [
      'Annika came back on June 23, 2026 asking for progress on the eight ACL scripts and attached another Alibaba paper they now want folded into the dissemination plan.',
      'The commercial side is still dirty: Stripe shows the first $10,000 ACL invoice open after the June 20, 2026 due date, and no payment proof landed in the client thread.',
      'Asher already sent the invoice and Stripe link earlier, so the next move is not re-explaining scope. It is chasing payment proof and then answering on realistic script timing.',
      'Keep Robert execution fenced off until payment, reimbursement exposure, and timing are written down cleanly in-thread.',
    ],
  },
  {
    title: 'AhaCreator / ArcGrowth',
    tags: ['P1', 'W-9 owed', 'live link sent'],
    points: [
      'Lumina wrote on June 23, 2026 that payment has already been completed and asked Asher to send the W-9 for their records.',
      'The live Robert post link was already delivered on June 15, 2026, so the content lane is done and this is now pure admin follow-through.',
      'Asher owns the W-9 send plus any payment-proof capture that should be logged against the closed campaign.',
      'Do not reopen copy, edits, or scheduling on a thread that only needs tax paperwork and proof hygiene.',
    ],
  },
  {
    title: 'QORDEN AI / fit check',
    tags: ['P1', 'lead reply', 'metrics asked'],
    points: [
      'Alvina replied on June 23, 2026 asking for Robert audience demographics and engagement detail before they decide between a dedicated post or thread.',
      'They framed the budget as startup-sensitive and asked whether a custom package exists, but they still have not provided launch timing or a concrete deliverable to invoice against.',
      'Asher owns the fit-check reply and should keep the thread in paid-collab territory rather than sliding into an informal free advisory call.',
      'Keep this in email until the company, format, budget, and timing are concrete enough to describe in one sentence.',
    ],
  },
];

const V4_COMPANY_OS_WAITING = [
  {
    title: 'Riverside / press-release hold',
    tags: ['watch', 'after June 24', 'PMM pending'],
    points: [
      'Savion said on June 23, 2026 to hold publishing until the PMM team sends the official press release so the wording matches their launch.',
      'The caption link and promo code are already set, and once Riverside signs off on X copy plus the Facebook cross-post the post can run any time after June 24, 2026.',
      'This is waiting on client launch language, not on interview scheduling anymore.',
      'Do not send Robert live until the press release and approval pass are both in-thread.',
    ],
  },
  {
    title: 'iLands / Flot monthly package',
    tags: ['watch', 'sponsor review', 'June 26 target'],
    points: [
      'Asher sent the cleaned-up single-copy direction on June 23, 2026 after Zoe rejected the earlier multi-option draft structure.',
      'Zoe\'s latest response was just "please wait a moment," which means the package is sitting in sponsor review and still lacks the final quote-post URL.',
      'This is fulfillment work under an older package, not a fresh invoice lane.',
      'Do not call it Robert-ready until the sponsor explicitly approves the copy and sends the source post path.',
    ],
  },
  {
    title: 'Eastworlds / wire settle + date',
    tags: ['watch', 'receipt not settlement', 'launch day missing'],
    points: [
      'The Eastworlds lane still has only a wire receipt and a loose "next week works" style timing signal rather than settled payment proof and one exact posting date.',
      'That is enough context to keep the thread warm, but not enough to mark the invoice clean or hand Robert a finished brief.',
      'Keep this in watch until the bank side settles and one real launch day lands.',
      'A scheduled transfer is context, not closure.',
    ],
  },
  {
    title: 'RunLayer / Wednesday QRT',
    tags: ['watch', 'brief landed', 'link still matters'],
    points: [
      'Phillip sent the RunLayer brief on June 22, 2026 and Asher already answered that Robert can QRT on Wednesday in the format that performs best for his account.',
      'That means the lane is no longer waiting on a brief, but it still needs the final target post context tight enough for a clean execution handoff.',
      'Treat this as launch watch, not a sales thread.',
      'Do not lose the final source-link check just because the brief already arrived.',
    ],
  },
];

const V4_COMPANY_OS_DONE = [
  {
    title: 'MaineCoon / EchoNLab',
    tags: ['June 16 live', 'receipt landed', 'closed'],
    points: [
      'Judy accepted the $1,895 quote repost, sent the official source post, and then delivered the payment receipt on June 17, 2026 after the June 16 launch.',
      'Robert\'s live QRT is captured in-thread at https://x.com/Scobleizer/status/2066954693579006223?s=20 and the receipt PDF is attached in the same chain.',
      'This is fully closed now because the source post, Robert post, and receipt all exist in one place.',
      'If EchoNLab wants the later custom post, treat it as a fresh campaign, not unfinished residue from this one.',
    ],
  },
  {
    title: 'Perceptron / Agentic Detection',
    tags: ['June 10 live', 'paid', 'proof trail complete'],
    points: [
      'Eric confirmed payment on June 9, 2026 and then sent the official launch link on June 10: https://x.com/perceptroninc/status/2064732691845824833?s=20.',
      'The first paid execution is now properly evidenced and closed, and the thread has already shifted to possible follow-on launches later in June.',
      'Archive the first campaign cleanly before treating the robotics or next-launch chatter as a new deal.',
      'A future QRT discussion is a new scope, not unfinished cleanup.',
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
  'Asher owns replies, invoice links, payment-proof capture, final post links, scheduling cleanup, tax-doc follow-through, and every 60-second Robert brief. Sam escalates. Robert executes only after the lane is clean.',
  'No paid post, travel spend, or launch hold is truly booked until payment proof, written reimbursement, or clearly prepaid package coverage is visible in-thread.',
  'A live post is not a closed deal. If the receipt, bank proof, W-9 follow-through, or final post link is missing, the lane stays open.',
  'A wire receipt or "payment completed" note is useful context, not closure. Log actual settlement proof before calling the money side done.',
  'Once an invoice link is already in-thread, stop re-explaining the package and chase only payment proof, live asset, and posting window.',
  'If a sponsor sends confidential launch assets before go-live, prep from them but do not publish, forward, or treat them as public until the sponsor announces.',
  'If the client says hold for a press release, approval pass, or launch wording, that hold beats the calendar. Waiting on client language is not Robert-ready.',
  'If a campaign still belongs to an older package, treat the remaining inventory as fulfillment work unless the thread explicitly says the package is exhausted.',
  'Startup-friendly, bundle, or quota asks can change structure, but they do not remove paid-collab rules, disclosure, or the upfront default for new sponsors.',
  'Tax and banking document requests are admin work, not throwaway notes. Send the packet once, confirm receipt, and log it against the campaign.',
  'A quote repost is not executable until the official source post, posting window, talking points, approval boundary, and payment state are all explicit.',
  'Every Robert brief must fit inside 60 seconds and include company, deliverable, timing, source link, approval path, payment state, owner, and why Robert is the right fit now.',
];

const V4_COMPANY_OS_STAGES = [
  { key: 'new', label: 'Lead in' },
  { key: 'scope', label: 'Scope' },
  { key: 'pricing', label: 'Pricing' },
  { key: 'terms', label: 'Terms / pay' },
  { key: 'brief', label: 'Brief / calendar' },
  { key: 'done', label: 'Closed' },
];

const V4_BRIEF_TAILSCALE_BASE_URL = 'https://mac-studio.tail50d3a2.ts.net';
const V4_BRIEF_LOCAL_BASE_URL = 'http://127.0.0.1:8767';
const V4_ROBERT_HANDOFF_STATIC_PREVIEW_URL = 'flow-v4/robert-handoff-preview.json?v=20260621-handoff-preview-3';
const V4_ROBERT_HANDOFF_CACHE_KEY = 'v4_robert_handoff_preview_cache';

function V4ShouldUseMachineHostedBriefFlow() {
  try {
    const ua = String(window.navigator?.userAgent || '');
    const vendor = String(window.navigator?.vendor || '');
    const isIOS = /iPhone|iPad|iPod/i.test(ua);
    const isSafariDesktop = /Safari/i.test(ua) && /Apple/i.test(vendor) && !/Chrome|CriOS|EdgiOS|Edg|OPR|Firefox/i.test(ua);
    return isIOS || isSafariDesktop;
  } catch (err) {
    return false;
  }
}

function V4IsGithubHostedPage() {
  try {
    return String(window.location?.hostname || '') === 'asherweisberger.github.io';
  } catch (err) {
    return false;
  }
}

function V4OpenMachineHostedBriefMaker() {
  try {
    const target = new URL(V4_BRIEF_TAILSCALE_BASE_URL + '/');
    target.searchParams.set('open', 'brief-maker');
    target.searchParams.set('from', 'github');
    window.location.assign(target.toString());
    return true;
  } catch (err) {
    return false;
  }
}

function V4MaybeRedirectToMachineHostedApp() {
  return false;
}

function V4IsLocalBriefPage() {
  try {
    const protocol = String(window.location?.protocol || '');
    const hostname = String(window.location?.hostname || '');
    return protocol === 'file:' || hostname === '127.0.0.1' || hostname === 'localhost';
  } catch (err) {
    return true;
  }
}

function V4BriefServiceCandidateUrls() {
  return V4IsLocalBriefPage()
    ? [V4_BRIEF_LOCAL_BASE_URL, V4_BRIEF_TAILSCALE_BASE_URL]
    : [V4_BRIEF_TAILSCALE_BASE_URL, V4_BRIEF_LOCAL_BASE_URL];
}

function V4BriefServiceHeaders(extra = {}) {
  const headers = { 'Content-Type': 'application/json', ...extra };
  try {
    const token = String(window.localStorage.getItem('v4_brief_api_token') || '').trim();
    if (token) headers.Authorization = 'Bearer ' + token;
  } catch (err) {}
  return headers;
}

function V4LoadBriefApiToken() {
  try {
    return String(window.localStorage.getItem('v4_brief_api_token') || '').trim();
  } catch (err) {
    return '';
  }
}

function V4StoreBriefApiToken(value) {
  const token = String(value || '').trim();
  try {
    if (token) window.localStorage.setItem('v4_brief_api_token', token);
    else window.localStorage.removeItem('v4_brief_api_token');
  } catch (err) {}
  return token;
}

async function V4BriefServiceFetch(path, options = {}) {
  const candidates = V4BriefServiceCandidateUrls();
  const tryRequest = async includeStoredToken => {
    let lastNetworkError = null;
    for (const baseUrl of candidates) {
      try {
        const res = await fetch(baseUrl + path, {
          ...options,
          headers: V4BriefServiceHeaders(options.headers || {}),
        });
        if (res.status === 401 && !includeStoredToken) return res;
        return res;
      } catch (err) {
        lastNetworkError = err;
      }
    }
    throw lastNetworkError || new Error('Could not reach your brief machine.');
  };

  let res;
  try {
    res = await tryRequest(false);
  } catch (err) {
    throw new Error('Could not reach your brief machine. Make sure the Mac service is running and Tailscale Funnel is on.');
  }
  if (res.status !== 401) return res;

  let token = '';
  try {
    token = String(window.localStorage.getItem('v4_brief_api_token') || '').trim();
  } catch (err) {}

  if (!token) {
    const prompted = window.prompt('Paste your Brief Maker access token');
    token = String(prompted || '').trim();
    if (token) {
      try { window.localStorage.setItem('v4_brief_api_token', token); } catch (err) {}
    }
  }

  if (!token) return res;
  try {
    res = await tryRequest(true);
  } catch (err) {
    throw new Error('Could not reach your brief machine. Make sure the Mac service is running and Tailscale Funnel is on.');
  }
  if (res.status === 401) {
    throw new Error('Brief Maker access was denied. Refresh the page and try again.');
  }
  return res;
}

function V4LoadCachedRobertHandoffPreview() {
  try {
    const raw = window.localStorage.getItem(V4_ROBERT_HANDOFF_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.ok ? parsed : null;
  } catch (err) {
    return null;
  }
}

function V4StoreCachedRobertHandoffPreview(data) {
  try {
    if (data && data.ok) {
      window.localStorage.setItem(V4_ROBERT_HANDOFF_CACHE_KEY, JSON.stringify(data));
    }
  } catch (err) {}
}

async function V4LoadRobertHandoffPreviewData() {
  try {
    const res = await V4BriefServiceFetch('/robert-handoff-preview', { method: 'GET' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || 'Could not load Robert handoff drafts.');
    V4StoreCachedRobertHandoffPreview(data);
    return data;
  } catch (machineErr) {
    try {
      const staticRes = await fetch(V4_ROBERT_HANDOFF_STATIC_PREVIEW_URL, { method: 'GET', cache: 'no-store' });
      const staticData = await staticRes.json().catch(() => ({}));
      if (staticRes.ok && staticData.ok) {
        V4StoreCachedRobertHandoffPreview(staticData);
        return staticData;
      }
    } catch (err) {}
    const cached = V4LoadCachedRobertHandoffPreview();
    if (cached) return cached;
    throw machineErr;
  }
}

const V4_BRIEF_ACTION_URL = 'http://127.0.0.1:8766/generate-brief';

const V4_COMPANY_OS_TOOLKIT = [
  {
    id: 'brief-maker',
    title: 'Brief Maker',
    status: 'Live',
    kind: 'Skill',
    useFor: 'Turn a sold deal into a clean one-page Robert brief PDF.',
    trigger: 'Make a brief. Create a campaign brief. Brief for Robert.',
    output: 'One-page PDF saved to Desktop/UNALIGNED',
    note: 'Best for sponsorship launches where Robert needs exact posting instructions, facts, and copy options in under 60 seconds.',
  },
  {
    id: 'x-intake',
    title: 'X Lead Intake',
    status: 'In progress',
    kind: 'Automation',
    useFor: 'Pull Robert X DM leads into New Leads without dragging old threads back in.',
    trigger: 'Run X scrape. Refresh X leads.',
    output: 'Newest-first X leads with handle, date, and summary',
    note: 'This is the live-DM intake path you wanted so X stays a source for fresh opportunities only.',
  },
  {
    id: 'gmail-intake',
    title: 'Robert Gmail Intake',
    status: 'Live',
    kind: 'Automation',
    useFor: 'Pull new Gmail opportunities from Robert into New Leads.',
    trigger: 'Run Gmail sync. Refresh Robert Gmail leads.',
    output: 'Newest-first Gmail leads with sender, email, date, and summary',
    note: 'Company OS remains Asher-first. Robert Gmail is only used for fresh lead intake.',
  },
  {
    id: 'robert-handoff',
    title: 'Robert Handoff Drafts',
    status: 'Live',
    kind: 'Operator',
    useFor: 'Review the intro emails Robert can send when a fresh lead should move to Asher and Sam.',
    trigger: 'Open Robert handoff drafts. Refresh Robert intros.',
    output: 'Context-aware draft emails with recipients, subject, and ready-to-review copy',
    note: 'This is the approval layer before Robert starts the thread and hands the lead to Asher and Sam.',
  },
  {
    id: 'company-operator',
    title: 'Company Operator',
    status: 'Live',
    kind: 'Workflow',
    useFor: 'Keep replies, follow ups, execution state, and quick actions in one operator view.',
    trigger: 'Open Company OS',
    output: 'Reply queue, execution block, stage actions, and operator readout',
    note: 'This is the main command surface. It is where the autonomous layer will eventually run from.',
  },
  {
    id: 'stripe-sync',
    title: 'Stripe Sync',
    status: 'Live',
    kind: 'Finance',
    useFor: 'Track new Stripe invoices while keeping legacy manual invoices in Company OS.',
    trigger: 'Open invoices. Open Stripe invoice.',
    output: 'Invoice rows that can jump into Stripe for payment status',
    note: 'New transactions should flow through Stripe. Older custom invoice history stays preserved locally.',
  },
  {
    id: 'calendar-brief-ops',
    title: 'Calendar and Brief Ops',
    status: 'Next',
    kind: 'Execution',
    useFor: 'Auto-create Robert brief docs and place them on Robert calendar as tasks.',
    trigger: 'When a deal is sold and ready for execution',
    output: 'Google Doc brief plus Robert calendar task with publishing window',
    note: 'This is the next autonomous layer to wire after the execution panel you just approved.',
  },
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
  if (stage === 'paid-out') return 5;
  if (stage === 'done') return 4;
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
  if (lead.stage === 'done') return 'The deal is sold. Robert now needs a clean brief, a calendar slot, and execution details.';
  if (lead.stage === 'paid-out') return 'Execution appears complete; confirm payment and archive cleanly.';
  return 'Robert is the source of the lead and final executor. Asher handles the back-and-forth. Sammy is oversight.';
}

function V4CompanyOsJob(lead) {
  if (!lead) return 'Pick a lead from the queue.';
  if (lead.stage === 'invoice-sent') return 'Verify payment, invoice state, and what is blocking the post.';
  if (lead.stage === 'rates-sent') return 'Get budget, date, deliverables, and approval path into one clean answer.';
  if (lead.stage === 'negotiating') return 'Turn the back-and-forth into a deal shape Robert can execute.';
  if (lead.stage === 'done') return 'Confirm the brief, calendar slot, live instructions, and approval path.';
  if (lead.stage === 'paid-out') return 'Make sure the brief, payment, and archive are complete.';
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

function V4CompanyOsListSnippet(lead) {
  if (!lead) return 'Open thread';
  const latest = Array.isArray(lead.thread) && lead.thread.length ? lead.thread[lead.thread.length - 1] : null;
  const sourceKind = window.V3?.NewLeadSourceKind ? window.V3.NewLeadSourceKind(lead) : 'gmail';
  const summary = sourceKind === 'x' && window.V3?.NewLeadSummary
    ? window.V3.NewLeadSummary(lead)
    : String(
        lead.operatorSummary?.lead_summary ||
        latest?.body ||
        latest?.subject ||
        lead.notes ||
        lead.deliverables ||
        lead.nextMove?.text ||
        ''
      );
  return V4CleanDisplayText(summary) || lead.email || 'Open thread';
}

function V4CleanDisplayText(t) {
  if (!t) return '';
  return String(t)
    .replace(/&gt;/gi, '>')
    .replace(/&lt;/gi, '<')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
  if (stage === 'invoice-sent') return 'Terms / Payment';
  if (stage === 'negotiating') return 'Negotiation';
  if (stage === 'rates-sent') return 'Pricing';
  if (stage === 'first-touch' || stage === 'engaged') return 'Scope';
  if (stage === 'done') return 'Brief / Calendar';
  if (stage === 'paid-out') return 'Closed';
  return 'Intake';
}

function V4CompanyOsPhaseTag(lead) {
  if (lead?.stage === 'invoice-sent') return 'verify first';
  if (lead?.stage === 'done') return 'robert ready';
  if (lead?.needsReply) return 'needs reply';
  return 'next move';
}

function V4XLeadContextRows(lead) {
  if (!lead) return [];
  const rows = [];
  if (lead.notes) rows.push({ label: 'Intake summary', value: lead.notes });
  if (lead.evidence && lead.evidence !== lead.notes) rows.push({ label: 'Latest DM', value: lead.evidence });
  if (lead.xBestNextStep) rows.push({ label: 'Best next step', value: lead.xBestNextStep });
  if (lead.xCurrentStatus) rows.push({ label: 'Scraper status', value: lead.xCurrentStatus });
  if (lead.xContactInfo) rows.push({ label: 'Contact info', value: lead.xContactInfo });
  return rows;
}

function V4CompanyOsMailboxOrigin(lead) {
  const source = String(lead?.source || '').toLowerCase();
  if (source.includes('x-dm-intake') || source.includes('twitter_dm') || source.includes('ingest-twitter_dm')) return 'x';
  if (source.includes('robert-gmail-new-lead') || source.includes('gmail-robert') || source.includes('robert gmail')) return 'robert';
  if (source.includes('asher-gmail') || source.includes('gmail-asher') || source.includes('asher candidate') || source.includes('asher gmail')) return 'asher';
  const participants = (window.V3ThreadParticipants ? window.V3ThreadParticipants(lead) : [])
    .map(email => String(email || '').toLowerCase());
  if (participants.includes('asherunaligned@gmail.com')) return 'asher';
  if (participants.includes('scobleizer@gmail.com')) return 'robert';
  return 'unknown';
}

function V4OperatorStatus(lead) {
  const status = String(lead?.draftReplyStatus || '').toLowerCase();
  if (status === 'review') return { label: 'Needs review', tone: 'warn' };
  if (status === 'escalated') return { label: 'Needs approval', tone: 'warn' };
  if (status === 'pending') return { label: 'Draft ready', tone: 'good' };
  if (status === 'sent') return { label: 'Auto-sent', tone: 'neutral' };
  if (lead?.operatorAnalysis?.needs_reply) return { label: 'Reply suggested', tone: 'soft' };
  return { label: 'Monitoring', tone: 'soft' };
}

function V4OperatorReplyTypeLabel(value) {
  return String(value || '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, ch => ch.toUpperCase());
}

function V4CompanyOsExecutionMeta(lead) {
  const tierId = V4CompanyOsTier(lead);
  const tier = tierId ? window.V3?.TIERS?.[tierId] : null;
  const brief = lead?.brief || null;
  const links = Array.isArray(brief?.links) ? brief.links.filter(Boolean) : [];
  const docLink = links.find(link => /docs\.google\.com|drive\.google\.com/i.test(String(link)));
  const calendarLink = links.find(link => /calendar\.google\.com/i.test(String(link)));
  const postingWindow = brief?.postingWindow || lead?.operatorSummary?.launch_timing || '';
  const executionOwner = lead?.stage === 'done' ? 'Robert' : 'Asher';

  let briefState = 'Not started';
  if (brief?.status === 'awaiting-approval') briefState = 'Awaiting Asher approval';
  else if (brief?.status === 'ready') briefState = 'Ready for Robert';
  else if (brief?.status === 'in-production') briefState = 'In production';
  else if (brief?.status === 'shipped') briefState = 'Shipped';
  else if (brief) briefState = 'Drafted';
  else if (lead?.stage === 'done') briefState = 'Needs brief';

  let docState = 'Not needed yet';
  if (docLink) docState = 'Linked';
  else if (brief || lead?.stage === 'done') docState = 'Create Google Doc';

  let calendarState = 'Not needed yet';
  if (calendarLink) calendarState = 'Placed on calendar';
  else if (lead?.stage === 'done') calendarState = 'Create Robert task';

  let pdfState = 'Not scoped yet';
  if (tier) pdfState = 'Ready to attach';
  if (lead?.stage === 'invoice-sent' || lead?.stage === 'done') pdfState = tier ? 'Use in pricing / execution thread' : pdfState;

  return {
    tier,
    tierLine: tier ? `Tier ${tier.id} · ${tier.name} · ${V4CompanyOsMoney(tier.price)}` : 'No tier locked yet',
    deliverableLine: tier?.items?.join(' · ') || lead?.deliverables || 'No deliverables named yet',
    briefState,
    docState,
    docLink: docLink || '',
    calendarState,
    calendarLink: calendarLink || '',
    pdfState,
    pdfLink: 'docs/SINGLE_TIER.pdf',
    postingWindow: postingWindow || 'No publish window locked yet',
    executionOwner,
  };
}

// ─────────────────────────────────────────────────────────────
// Live Daily Brief computation (the main anti-beta change)
// Replaces most hardcoded V4_COMPANY_OS_* narrative with live lead data.
// ─────────────────────────────────────────────────────────────

function V4BuildBriefPoints(lead) {
  const points = [];
  const phase = V4CompanyOsPhase(lead);
  const why = V4CompanyOsWhy(lead);

  if (lead.nextMove && lead.nextMove.text) {
    points.push(lead.nextMove.text);
  }
  if (lead.operatorSummary && lead.operatorSummary.lead_summary) {
    points.push(lead.operatorSummary.lead_summary);
  }
  if (lead.unread || lead.needsReply) {
    points.push('New reply in thread — handle before anything else.');
  }
  if (lead.stage === 'invoice-sent') {
    points.push('Invoice out. Get payment proof + timing locked before Robert executes.');
  }
  if ((lead.daysInStage || 0) >= 8) {
    points.push(`${lead.daysInStage}d with no movement — decide or archive.`);
  }
  if (lead.value) {
    points.push(`${V4CompanyOsMoney(lead.value)} at ${phase.toLowerCase()}.`);
  }
  if (lead.briefTitle || lead.briefBody) {
    points.push('Brief material exists.');
  }
  if (points.length === 0) {
    points.push(why);
  }
  return points.slice(0, 4);
}

function V4ComputeDailyBrief(leads = []) {
  const active = leads.filter(l => !['trash', 'dead-leads', 'paid-out', 'done'].includes(l.stage));

  const actionLeads = active
    .filter(l => l.needsReply || l.stage === 'invoice-sent' || (l.daysInStage >= 6 && (l.value || 0) > 1500))
    .sort((a, b) => (b.daysInStage || 0) - (a.daysInStage || 0) || (b.value || 0) - (a.value || 0))
    .slice(0, 5);

  const ts = (d) => (d ? Date.parse(d) : 0);
  const watchLeads = active
    .filter(l => !l.needsReply && ['rates-sent', 'negotiating', 'first-touch', 'engaged'].includes(l.stage))
    .sort((a, b) => ts(b.lastTouchAt) - ts(a.lastTouchAt))
    .slice(0, 5);

  const closedLeads = leads
    .filter(l => ['done', 'paid-out'].includes(l.stage))
    .sort((a, b) => ts(b.lastTouchAt) - ts(a.lastTouchAt))
    .slice(0, 4);

  const toItem = (lead, isClosed = false) => ({
    id: lead.id,
    title: `${lead.brand} — ${V4CompanyOsPhase(lead)}`,
    tags: [
      V4CompanyOsPriority(lead),
      V4CompanyOsPhaseTag(lead),
      (lead.stage === 'done' || isClosed) ? 'closed' : null,
    ].filter(Boolean),
    points: V4BuildBriefPoints(lead),
  });

  return {
    action: actionLeads.map(l => toItem(l)),
    watch: watchLeads.map(l => toItem(l)),
    closed: closedLeads.map(l => toItem(l, true)),
  };
}

function V4QuickStageActions(lead) {
  if (!lead) return [];
  const actions = [
    { stage: 'first-touch', label: 'Scope' },
    { stage: 'rates-sent', label: 'Pricing' },
    { stage: 'negotiating', label: 'Negotiate' },
    { stage: 'invoice-sent', label: 'Terms' },
    { stage: 'done', label: 'Brief' },
    { stage: 'paid-out', label: 'Close' },
  ];
  return actions.filter(action => action.stage !== lead.stage);
}

function senderShortLabel(sender) {
  const map = { asher: 'Asher', robert: 'Robert', sam: 'Sammy' };
  return map[sender] || 'Asher';
}

function V4BriefMakerDefaultState() {
  return {
    title: '',
    subtitle: 'For Robert. Read in 60 seconds',
    filename: '',
    go_live: '',
    go_live_note: '',
    what_to_do_text: '',
    key_facts_text: '',
    tag: '',
    link: '',
    hashtags: '',
    draft_1_label: 'Option 1. The Angle. Recommended',
    draft_1_text: '',
    draft_2_label: 'Option 2. Enterprise angle',
    draft_2_text: '',
    draft_3_label: 'Option 3. Operator angle',
    draft_3_text: '',
    submit_url: '',
    source_url: '',
    notion_url: '',
    email_context: '',
    calendar_title: '',
    calendar_mode: 'all_day',
    calendar_date: '',
    calendar_start: '',
    calendar_end: '',
  };
}

function V4BriefMakerFilename(value) {
  const cleaned = String(value || '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned || 'Robert_Brief';
}

function V4BriefMakerConfig(form) {
  const steps = String(form.what_to_do_text || '')
    .split('\n')
    .map(item => item.trim())
    .filter(Boolean);
  const facts = String(form.key_facts_text || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const parts = line.split('|');
      if (parts.length >= 2) return [parts[0].trim(), parts.slice(1).join('|').trim()];
      return ['', line];
    })
    .filter(([left, right]) => left || right);
  const drafts = [1, 2, 3]
    .map(index => ({
      label: String(form[`draft_${index}_label`] || '').trim(),
      text: String(form[`draft_${index}_text`] || '').trim(),
    }))
    .filter(item => item.label || item.text);
  const mustInclude = {};
  if (form.tag) mustInclude.tag = String(form.tag).trim();
  if (form.link) mustInclude.link = String(form.link).trim();
  if (form.hashtags) mustInclude.hashtags = String(form.hashtags).trim();

  const payload = {
    title: String(form.title || '').trim(),
  };
  if (form.subtitle) payload.subtitle = String(form.subtitle).trim();
  payload.filename = String(form.filename || '').trim() || V4BriefMakerFilename(payload.title);
  if (form.go_live) payload.go_live = String(form.go_live).trim();
  if (form.go_live_note) payload.go_live_note = String(form.go_live_note).trim();
  if (steps.length) payload.what_to_do = steps;
  if (facts.length) payload.key_facts = facts;
  if (Object.keys(mustInclude).length) payload.must_include = mustInclude;
  if (drafts.length) payload.drafts = drafts;
  if (form.submit_url) payload.submit_url = String(form.submit_url).trim();
  if (form.source_url) payload.source_url = String(form.source_url).trim();
  if (form.notion_url) payload.notion_url = String(form.notion_url).trim();
  if (form.email_context) payload.email_context = String(form.email_context).trim();
  if (form.calendar_title) payload.calendar_title = String(form.calendar_title).trim();
  if (form.calendar_mode) payload.calendar_mode = String(form.calendar_mode).trim();
  if (form.calendar_date) payload.calendar_date = String(form.calendar_date).trim();
  if (form.calendar_start) payload.calendar_start = String(form.calendar_start).trim();
  if (form.calendar_end) payload.calendar_end = String(form.calendar_end).trim();
  return payload;
}

function V4NormalizeCalendarTime(date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function V4NormalizeCalendarDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function V4InferCalendarFieldsFromGoLive(goLiveText) {
  const raw = String(goLiveText || '').trim();
  if (!raw) return null;
  const normalized = raw
    .replace(/\bEST\b/gi, 'UTC-05:00')
    .replace(/\bEDT\b/gi, 'UTC-04:00')
    .replace(/\bCST\b/gi, 'UTC-06:00')
    .replace(/\bCDT\b/gi, 'UTC-05:00')
    .replace(/\bMST\b/gi, 'UTC-07:00')
    .replace(/\bMDT\b/gi, 'UTC-06:00')
    .replace(/\bPST\b/gi, 'UTC-08:00')
    .replace(/\bPDT\b/gi, 'UTC-07:00');
  const parsed = new Date(normalized);
  if (!Number.isFinite(parsed.getTime())) return null;
  const end = new Date(parsed.getTime() + (30 * 60 * 1000));
  return {
    calendar_date: V4NormalizeCalendarDate(parsed),
    calendar_start: V4NormalizeCalendarTime(parsed),
    calendar_end: V4NormalizeCalendarTime(end),
  };
}

function V4InferCalendarMode(payload) {
  const haystack = [
    payload?.title,
    payload?.subtitle,
    payload?.go_live,
    Array.isArray(payload?.what_to_do) ? payload.what_to_do.join(' ') : '',
  ].join(' ').toLowerCase();
  if (/\b(interview|meeting|call|zoom|podcast|spaces|livestream)\b/.test(haystack)) {
    return 'timed';
  }
  return 'all_day';
}

function V4RobertHandoffTimestamp(value) {
  if (!value) return 'Not generated yet';
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return String(value);
  return parsed.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function V4RobertHandoffRecipients(draft) {
  const list = Array.isArray(draft?.to_emails) ? draft.to_emails.filter(Boolean) : [];
  return list.length ? list.join(', ') : 'No recipient found';
}

function V4RobertHandoffContext(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
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

function V4CompanyOsExecutionPanel({ lead, execution }) {
  if (!lead) return null;
  return (
    <section className="cos-execution-panel">
      <div className="cos-execution-head">
        <div>
          <div className="cos-operator-strip-eyebrow">Execution</div>
          <h3>Tier, brief, PDF, calendar</h3>
        </div>
        <span className="cos-panel-count">{execution.executionOwner}</span>
      </div>
      <div className="cos-execution-grid">
        <div className="cos-execution-card">
          <div className="cos-execution-label">Tier package</div>
          <div className="cos-execution-value">{execution.tierLine}</div>
          <div className="cos-execution-sub">{execution.deliverableLine}</div>
        </div>
        <div className="cos-execution-card">
          <div className="cos-execution-label">Sponsorship PDF</div>
          <div className="cos-execution-value">{execution.pdfState}</div>
          <div className="cos-execution-actions">
            <a className="cos-execution-link" href={execution.pdfLink} target="_blank" rel="noreferrer">Open PDF</a>
          </div>
        </div>
        <div className="cos-execution-card">
          <div className="cos-execution-label">Robert brief</div>
          <div className="cos-execution-value">{execution.briefState}</div>
          <div className="cos-execution-actions">
            {lead.brief && (
              <button
                type="button"
                className="cos-execution-link is-button"
                onClick={() => window.dispatchEvent(new CustomEvent('v3:open-brief', { detail: { leadId: lead.id } }))}
              >
                Open brief
              </button>
            )}
          </div>
        </div>
        <div className="cos-execution-card">
          <div className="cos-execution-label">Google Doc</div>
          <div className="cos-execution-value">{execution.docState}</div>
          {execution.docLink && (
            <div className="cos-execution-actions">
              <a className="cos-execution-link" href={execution.docLink} target="_blank" rel="noreferrer">Open doc</a>
            </div>
          )}
        </div>
        <div className="cos-execution-card">
          <div className="cos-execution-label">Calendar task</div>
          <div className="cos-execution-value">{execution.calendarState}</div>
          {execution.calendarLink && (
            <div className="cos-execution-actions">
              <a className="cos-execution-link" href={execution.calendarLink} target="_blank" rel="noreferrer">Open calendar</a>
            </div>
          )}
        </div>
        <div className="cos-execution-card">
          <div className="cos-execution-label">Publish window</div>
          <div className="cos-execution-value">{execution.postingWindow}</div>
          <div className="cos-execution-sub">This is what the autonomous layer should turn into a dated task.</div>
        </div>
      </div>
    </section>
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
  }).catch(err => console.warn('[UNALIGNED] lead patch failed:', err));
  const updated = (window.V3.LEADS || []).map(item =>
    String(item.id) === String(lead.id) ? { ...item, ...localPatch } : item);
  window.V3.LEADS = updated;
  window.dispatchEvent(new CustomEvent('v3:leads-loaded', { detail: { leads: updated } }));
}

// Overview — glanceable metrics, live activity, team status, priorities
function V4CosOverview({ leads, replyCount, onOpenLead }) {
  const { USERS } = window.V3;
  const now = Date.now();
  const todayKey = new Date().toDateString();
  const newToday = leads.filter(l => l.receivedAt && new Date(l.receivedAt).toDateString() === todayKey).length;
  const doneWeek = leads.filter(l =>
    ['done', 'paid-out'].includes(l.stage) &&
    l.lastTouchAt && (now - Date.parse(l.lastTouchAt)) < 7 * 86400000).length;
  const pipeline = leads.filter(l => !['done', 'paid-out'].includes(l.stage)).reduce((s, l) => s + (l.value || 0), 0);

  const brief = React.useMemo(() => V4ComputeDailyBrief(leads || []), [leads]);

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
            <div className="cos-panel-head"><h3>Action now</h3><span className="cos-panel-count">{(brief.action || []).length}</span></div>
            <div className="cosov-priorities">
              {(brief.action || []).slice(0, 3).map(item => (
                <div 
                  key={item.id || item.title} 
                  className="cosov-priority"
                  onClick={() => onOpenLead && onOpenLead(item.id)}
                  style={{cursor: onOpenLead ? 'pointer' : 'default'}}
                >
                  <strong>{item.title}</strong>
                  <span className="cos-chips">
                    {item.tags.slice(0, 2).map(t => <span key={t} className="cos-chip cos-chip-tight">{t}</span>)}
                  </span>
                </div>
              ))}
              {(brief.action || []).length === 0 && <div className="dq-empty">Nothing urgent right now.</div>}
            </div>
          </section>
        </div>
      </div>

      <V4CosBriefBoard leads={leads} onOpenLead={onOpenLead} />
    </div>
  );
}

function V4CosBriefBoard({ leads = [], onOpenLead }) {
  const todayLabel = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const brief = React.useMemo(() => V4ComputeDailyBrief(leads || []), [leads]);

  const [selectedId, setSelectedId] = React.useState(null);

  const allBriefItems = [...brief.action, ...brief.watch];
  const selectedItem = allBriefItems.find(i => i.id === selectedId) || null;

  const lastTouch = leads.reduce((max, l) => {
    const t = l.lastTouchAt ? Date.parse(l.lastTouchAt) : 0;
    return t > max ? t : max;
  }, 0);
  const refreshed = lastTouch
    ? (typeof V3RelativeTime === 'function' ? V3RelativeTime(new Date(lastTouch).toISOString()) : 'just now')
    : '—';

  // Superhuman-style keyboard navigation inside the brief list
  React.useEffect(() => {
    const onKey = (e) => {
      if (!allBriefItems.length) return;
      const currentIdx = selectedId ? allBriefItems.findIndex(i => i.id === selectedId) : -1;

      if (e.key.toLowerCase() === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        const next = allBriefItems[Math.min(allBriefItems.length - 1, currentIdx + 1)];
        if (next) setSelectedId(next.id);
      }
      if (e.key.toLowerCase() === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = allBriefItems[Math.max(0, currentIdx - 1)];
        if (prev) setSelectedId(prev.id);
      }
      if ((e.key.toLowerCase() === 'o' || e.key === 'Enter') && selectedItem) {
        e.preventDefault();
        if (onOpenLead && selectedItem.id) onOpenLead(selectedItem.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [allBriefItems, selectedId, selectedItem, onOpenLead]);

  const renderBriefRow = (item, isHot) => {
    const isSelected = selectedId === item.id;
    return (
      <button
        key={item.id}
        type="button"
        className={'brief-row' + (isSelected ? ' is-selected' : '') + (isHot ? ' is-hot' : '')}
        onClick={() => setSelectedId(item.id)}
      >
        <div className="brief-row-main">
          <div className="brief-row-title">
            {isHot && <span className="brief-p0-dot" />}
            <span>{item.title}</span>
          </div>
          <div className="brief-row-snippet">
            {item.points && item.points[0]}
          </div>
        </div>

        <div className="brief-row-meta">
          {item.tags && item.tags.slice(0, 2).map(t => (
            <span key={t} className="brief-tag">{t}</span>
          ))}
        </div>

        <div className="brief-row-actions">
          <button
            type="button"
            className="brief-quick-btn"
            onClick={(e) => { e.stopPropagation(); if (onOpenLead) onOpenLead(item.id); }}
          >
            Open
          </button>
        </div>
      </button>
    );
  };

  return (
    <section className="cos-section cos-brief superhuman-brief">
      <div className="brief-header">
        <div className="brief-header-left">
          <span className="brief-eyebrow">Daily Operating Brief</span>
          <span className="brief-date">{todayLabel}</span>
        </div>
        <div className="brief-header-right">
          <span className="brief-live">live · {refreshed}</span>
          <span className="brief-count">{brief.action.length} to act on</span>
        </div>
      </div>

      <div className="brief-body">
        {/* Main prioritized list - Superhuman style */}
        <div className="brief-list">
          {brief.action.length > 0 && (
            <div className="brief-section">
              <div className="brief-section-head">
                <span>Action now</span>
                <span className="brief-count-badge hot">{brief.action.length}</span>
              </div>
              {brief.action.map(item => renderBriefRow(item, true))}
            </div>
          )}

          {brief.watch.length > 0 && (
            <div className="brief-section">
              <div className="brief-section-head">
                <span>Watch / Waiting on them</span>
                <span className="brief-count-badge">{brief.watch.length}</span>
              </div>
              {brief.watch.map(item => renderBriefRow(item, false))}
            </div>
          )}

          {brief.action.length === 0 && brief.watch.length === 0 && (
            <div className="brief-empty">Nothing urgent. Clean slate.</div>
          )}
        </div>

        {/* Right detail / action pane - clean and ready for automation */}
        <div className="brief-detail">
          {selectedItem ? (
            <>
              <div className="brief-detail-head">
                <h3>{selectedItem.title}</h3>
                <div className="brief-detail-tags">
                  {selectedItem.tags && selectedItem.tags.map(t => (
                    <span key={t} className="brief-tag">{t}</span>
                  ))}
                </div>
              </div>

              <ul className="brief-detail-points">
                {selectedItem.points.map((p, i) => <li key={i}>{p}</li>)}
              </ul>

              <div className="brief-actions">
                <button 
                  className="brief-action-btn primary"
                  onClick={() => onOpenLead && onOpenLead(selectedItem.id)}
                >
                  Open full thread
                </button>
                <button className="brief-action-btn">
                  Prep Robert brief
                </button>
                <button className="brief-action-btn">
                  Snooze
                </button>
              </div>

              <div className="brief-automation-hint">
                Automation-ready: clear next action surfaced
              </div>
            </>
          ) : (
            <div className="brief-detail-empty">
              <div>Select an item</div>
              <div className="hint">j/k to navigate · enter to open</div>
            </div>
          )}
        </div>
      </div>

      {/* Keep rules subtle */}
      {V4_COMPANY_OS_RULES.length > 0 && (
        <details className="brief-rules">
          <summary>Operating Rules ({V4_COMPANY_OS_RULES.length})</summary>
          <ul>
            {V4_COMPANY_OS_RULES.map((rule, i) => <li key={i}>{rule}</li>)}
          </ul>
        </details>
      )}
    </section>
  );
}

function V4CosToolkit({ onNavigateView, onActivateSplit }) {
  const [briefMakerOpen, setBriefMakerOpen] = React.useState(false);
  const [handoffPreviewOpen, setHandoffPreviewOpen] = React.useState(false);
  const [handoffPreviewStatus, setHandoffPreviewStatus] = React.useState('idle');
  const [handoffPreviewError, setHandoffPreviewError] = React.useState('');
  const [handoffPreviewData, setHandoffPreviewData] = React.useState(null);
  const [handoffCopiedIndex, setHandoffCopiedIndex] = React.useState(-1);
  const [briefForm, setBriefForm] = React.useState(() => V4BriefMakerDefaultState());
  const [briefAdvancedOpen, setBriefAdvancedOpen] = React.useState(false);
  const [briefApiToken, setBriefApiToken] = React.useState(() => V4LoadBriefApiToken());
  const [briefMachineStatus, setBriefMachineStatus] = React.useState('checking');
  const [briefMachineNote, setBriefMachineNote] = React.useState('Checking your brief machine...');
  const [copied, setCopied] = React.useState(false);
  const [briefStatus, setBriefStatus] = React.useState('idle');
  const [briefError, setBriefError] = React.useState('');
  const [briefResult, setBriefResult] = React.useState(null);
  const [briefJobId, setBriefJobId] = React.useState('');
  const [briefJobStatus, setBriefJobStatus] = React.useState('idle');
  const [briefJobStage, setBriefJobStage] = React.useState('');
  const [briefJobStageDetail, setBriefJobStageDetail] = React.useState('');
  const [docStatus, setDocStatus] = React.useState('idle');
  const [docError, setDocError] = React.useState('');
  const [docResult, setDocResult] = React.useState(null);
  const [notionStatus, setNotionStatus] = React.useState('idle');
  const [notionError, setNotionError] = React.useState('');
  const [calendarStatus, setCalendarStatus] = React.useState('idle');
  const [calendarError, setCalendarError] = React.useState('');
  const [calendarResult, setCalendarResult] = React.useState(null);
  const briefDebugStage = React.useMemo(() => {
    try {
      const current = new URL(String(window.location?.href || ''));
      return String(current.searchParams.get('debugBriefStage') || '').trim();
    } catch (err) {
      return '';
    }
  }, []);
  const briefConfig = React.useMemo(() => V4BriefMakerConfig(briefForm), [briefForm]);
  const briefJson = React.useMemo(() => JSON.stringify(briefConfig, null, 2), [briefConfig]);
  const briefWorkflowSteps = React.useMemo(() => [
    { key: 'reading_source', label: 'Source' },
    { key: 'extracting_facts', label: 'Facts' },
    { key: 'writing_drafts', label: 'Drafts' },
    { key: 'creating_doc', label: 'Doc' },
    { key: 'creating_calendar', label: 'Calendar' },
  ], []);
  const effectiveBriefJobStatus = briefDebugStage ? 'running' : briefJobStatus;
  const effectiveBriefJobStage = briefDebugStage || briefJobStage;
  const effectiveBriefJobStageDetail = React.useMemo(() => {
    if (!briefDebugStage) return briefJobStageDetail;
    const labels = {
      reading_source: 'Reading source brief',
      extracting_facts: 'Extracting campaign facts',
      writing_drafts: 'Writing draft options',
      creating_doc: 'Creating Google Doc',
      creating_calendar: 'Creating calendar item',
    };
    return labels[briefDebugStage] || 'Running brief build';
  }, [briefDebugStage, briefJobStageDetail]);
  const effectiveNotionStatus = briefDebugStage ? 'importing' : notionStatus;
  const effectiveDocStatus = briefDebugStage ? 'creating' : docStatus;
  const briefLoadingActive = (effectiveNotionStatus === 'importing' || effectiveDocStatus === 'creating') && effectiveNotionStatus !== 'error' && effectiveDocStatus !== 'error';
  const briefWorkflowIndex = React.useMemo(() => {
    if (effectiveBriefJobStatus === 'queued') return 0;
    if (effectiveBriefJobStage === 'reading_source') return 0;
    if (effectiveBriefJobStage === 'extracting_facts') return 1;
    if (effectiveBriefJobStage === 'writing_drafts') return 2;
    if (effectiveBriefJobStage === 'creating_doc' || effectiveBriefJobStage === 'writing_doc' || effectiveBriefJobStage === 'building_doc') return 3;
    if (effectiveBriefJobStage === 'inferring_calendar' || effectiveBriefJobStage === 'creating_calendar') return 4;
    if (effectiveBriefJobStage === 'done') return briefWorkflowSteps.length - 1;
    return 0;
  }, [effectiveBriefJobStage, effectiveBriefJobStatus, briefWorkflowSteps.length]);
  const briefProgressNote = React.useMemo(() => {
    if (effectiveBriefJobStatus === 'queued') return 'Saved to your brief machine. Build is queued now.';
    if (effectiveBriefJobStageDetail) return effectiveBriefJobStageDetail;
    if (effectiveBriefJobStage === 'reading_source') return 'Reading source brief';
    if (effectiveBriefJobStage === 'extracting_facts') return 'Extracting campaign facts';
    if (effectiveBriefJobStage === 'writing_drafts') return 'Writing draft options';
    if (effectiveBriefJobStage === 'creating_doc') return "Creating Robert's Google Doc";
    if (effectiveBriefJobStage === 'writing_doc') return 'Writing Google Doc content';
    if (effectiveBriefJobStage === 'inferring_calendar') return 'Reading posting date';
    if (effectiveBriefJobStage === 'creating_calendar') return 'Creating calendar item';
    if (effectiveBriefJobStatus === 'running') return 'Job running on your Mac. You can leave this screen and come back.';
    return "Reading the link and building Robert's Google Doc in the background...";
  }, [effectiveBriefJobStage, effectiveBriefJobStageDetail, effectiveBriefJobStatus]);

  React.useEffect(() => {
    try {
      const protocol = String(window.location?.protocol || '');
      const hostname = String(window.location?.hostname || '');
      if (protocol === 'file:' || hostname === '127.0.0.1' || hostname === 'localhost') {
        window.localStorage.removeItem('v4_brief_service_base_url');
      }
    } catch (err) {}
  }, []);

  React.useEffect(() => {
    try {
      const current = new URL(String(window.location?.href || ''));
      if (current.searchParams.get('open') === 'brief-maker') {
        setBriefMakerOpen(true);
      }
      if (current.searchParams.get('open') === 'robert-handoff') {
        setHandoffPreviewOpen(true);
      }
    } catch (err) {}
  }, []);

  React.useEffect(() => {
    if (briefDebugStage) {
      setBriefMakerOpen(true);
    }
  }, [briefDebugStage]);

  const loadRobertHandoffPreview = async () => {
    setHandoffPreviewStatus('loading');
    setHandoffPreviewError('');
    try {
      const data = await V4LoadRobertHandoffPreviewData();
      setHandoffPreviewData(data);
      setHandoffPreviewStatus('done');
    } catch (err) {
      setHandoffPreviewStatus('error');
      setHandoffPreviewError(err.message || 'Could not load Robert handoff drafts.');
    }
  };

  React.useEffect(() => {
    if (!handoffPreviewOpen) return;
    if (handoffPreviewStatus === 'idle') loadRobertHandoffPreview();
  }, [handoffPreviewOpen]);

  const updateBriefField = (key, value) => {
    const isCalendarField = String(key || '').startsWith('calendar_');
    setBriefForm(curr => ({ ...curr, [key]: value }));
    if (copied) setCopied(false);
    if (briefStatus !== 'idle') {
      setBriefStatus('idle');
      setBriefError('');
      setBriefResult(null);
    }
    if (briefJobId || briefJobStatus !== 'idle') {
      setBriefJobId('');
      setBriefJobStatus('idle');
      setBriefJobStage('');
      setBriefJobStageDetail('');
    }
    if (!isCalendarField && docStatus !== 'idle') {
      setDocStatus('idle');
      setDocError('');
      setDocResult(null);
    }
    if (!isCalendarField && notionStatus !== 'idle') {
      setNotionStatus('idle');
      setNotionError('');
    }
    if (calendarStatus !== 'idle') {
      setCalendarStatus('idle');
      setCalendarError('');
      setCalendarResult(null);
    }
  };

  const saveBriefApiToken = value => {
    const next = V4StoreBriefApiToken(value);
    setBriefApiToken(next);
  };

  React.useEffect(() => {
    let active = true;

    const checkMachine = async () => {
      setBriefMachineStatus('checking');
      setBriefMachineNote('Checking your brief machine...');
      try {
        const res = await V4BriefServiceFetch('/health', { method: 'GET' });
        const data = await res.json().catch(() => ({}));
        if (!active) return;
        if (res.ok && data.ok) {
          setBriefMachineStatus('online');
          setBriefMachineNote('Machine online. Ready from anywhere while this Mac is awake.');
        } else {
          setBriefMachineStatus('offline');
          setBriefMachineNote('Machine reached, but the brief service did not answer cleanly.');
        }
      } catch (err) {
        if (!active) return;
        setBriefMachineStatus('offline');
        setBriefMachineNote('Machine is not reachable right now. Check that your Mac is awake, Tailscale is connected, and the brief service is running.');
      }
    };

    checkMachine();
    const timer = window.setInterval(checkMachine, 45000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const downloadBriefConfig = () => {
    const blob = new Blob([briefJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const filename = (briefConfig.filename || V4BriefMakerFilename(briefConfig.title || 'Robert_Brief')) + '.json';
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const copyBriefConfig = async () => {
    try {
      await navigator.clipboard.writeText(briefJson);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('brief config copy failed', err);
    }
  };

  const resetBriefForm = () => {
    setBriefForm(V4BriefMakerDefaultState());
    setBriefAdvancedOpen(false);
    setCopied(false);
    setBriefStatus('idle');
    setBriefError('');
    setBriefResult(null);
    setBriefJobId('');
    setBriefJobStatus('idle');
    setBriefJobStage('');
    setBriefJobStageDetail('');
    setDocStatus('idle');
    setDocError('');
    setDocResult(null);
    setNotionStatus('idle');
    setNotionError('');
    setCalendarStatus('idle');
    setCalendarError('');
    setCalendarResult(null);
  };

  const loadBriefJobStatus = async (jobId) => {
    const res = await V4BriefServiceFetch('/brief-job-status?job_id=' + encodeURIComponent(jobId), {
      method: 'GET',
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Could not load brief job.');
    return data.job || null;
  };

  React.useEffect(() => {
    if (!briefJobId) return;
    let active = true;
    let timer = null;

    const poll = async () => {
      try {
        const job = await loadBriefJobStatus(briefJobId);
        if (!active || !job) return;
        setBriefJobStatus(job.status || 'idle');
        setBriefJobStage(job.stage || '');
        setBriefJobStageDetail(job.stage_detail || '');
        if (job.status === 'done') {
          const result = job.result || {};
          const payload = result.payload || {};
          const sourceUrl = payload.source_url || briefForm.source_url || briefForm.notion_url || job.source_url || '';
          if (payload && Object.keys(payload).length) {
            applyImportedBriefPayload(payload, sourceUrl);
          }
          setNotionStatus('done');
          setDocResult(result);
          setDocStatus('done');
          if (result.calendar) {
            setCalendarResult(result.calendar);
            setCalendarStatus('done');
          }
          setBriefJobId('');
          setBriefJobStatus('done');
          setBriefJobStage('done');
          setBriefJobStageDetail('Done');
          return;
        }
        if (job.status === 'error') {
          const message = job.error || 'Brief build failed.';
          setNotionStatus('error');
          setNotionError(message);
          setDocStatus('error');
          setDocError(message);
          setBriefJobId('');
          setBriefJobStatus('error');
          setBriefJobStage('error');
          setBriefJobStageDetail(message);
          return;
        }
        timer = window.setTimeout(poll, 2500);
      } catch (err) {
        if (!active) return;
        timer = window.setTimeout(poll, 3500);
      }
    };

    poll();
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [briefJobId]);

  const copyHandoffDraft = async (draft, index) => {
    const lines = [
      `To: ${V4RobertHandoffRecipients(draft)}`,
      `Subject: ${String(draft?.subject || '').trim()}`,
      '',
      String(draft?.body || '').trim(),
    ].filter(Boolean);
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setHandoffCopiedIndex(index);
      window.setTimeout(() => setHandoffCopiedIndex(-1), 1800);
    } catch (err) {
      console.warn('handoff draft copy failed', err);
    }
  };

  const applyImportedBriefPayload = (payload, sourceUrl) => {
    const inferredCalendar = V4InferCalendarFieldsFromGoLive(payload.go_live);
    const inferredMode = payload.calendar_mode || V4InferCalendarMode(payload);
    setBriefForm(curr => ({
      ...curr,
      title: payload.title || curr.title,
      subtitle: payload.subtitle || curr.subtitle,
      filename: payload.filename || curr.filename,
      go_live: payload.go_live || curr.go_live,
      go_live_note: payload.go_live_note || curr.go_live_note,
      submit_url: payload.submit_url || curr.submit_url,
      source_url: sourceUrl || curr.source_url,
      notion_url: sourceUrl || curr.notion_url,
      email_context: payload.email_context || curr.email_context,
      calendar_title: payload.calendar_title || curr.calendar_title || payload.title || curr.title,
      calendar_mode: payload.calendar_mode || curr.calendar_mode || inferredMode,
      calendar_date: payload.calendar_date || curr.calendar_date || inferredCalendar?.calendar_date || '',
      calendar_start: payload.calendar_start || curr.calendar_start || inferredCalendar?.calendar_start || '',
      calendar_end: payload.calendar_end || curr.calendar_end || inferredCalendar?.calendar_end || '',
      what_to_do_text: Array.isArray(payload.what_to_do) ? payload.what_to_do.join('\n') : curr.what_to_do_text,
      key_facts_text: Array.isArray(payload.key_facts) ? payload.key_facts.map(item => item.join(' | ')).join('\n') : curr.key_facts_text,
      tag: payload.must_include?.tag || curr.tag,
      link: payload.must_include?.link || curr.link,
      hashtags: payload.must_include?.hashtags || curr.hashtags,
      draft_1_label: payload.drafts?.[0]?.label || curr.draft_1_label,
      draft_1_text: payload.drafts?.[0]?.text || curr.draft_1_text,
      draft_2_label: payload.drafts?.[1]?.label || curr.draft_2_label,
      draft_2_text: payload.drafts?.[1]?.text || curr.draft_2_text,
      draft_3_label: payload.drafts?.[2]?.label || curr.draft_3_label,
      draft_3_text: payload.drafts?.[2]?.text || curr.draft_3_text,
    }));
  };

  const createBriefDoc = async () => {
    if (!briefConfig.title && !briefConfig.source_url && !briefConfig.notion_url) {
      setDocStatus('error');
      setDocError('Add a title or paste a public source brief link first.');
      return;
    }
    setDocStatus('creating');
    setDocError('');
    setDocResult(null);
    try {
      const res = await V4BriefServiceFetch('/generate-brief-doc', {
        method: 'POST',
        body: JSON.stringify(briefConfig),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Google Doc creation failed.');
      setDocResult(data);
      setDocStatus('done');
    } catch (err) {
      setDocStatus('error');
      setDocError(err.message || 'Google Doc creation failed.');
    }
  };

  const importNotionBrief = async () => {
    const sourceUrl = briefConfig.source_url || briefConfig.notion_url;
    if (!sourceUrl) {
      setNotionStatus('error');
      setNotionError('Paste a public Notion page or Google Doc link first.');
      return;
    }
    setNotionStatus('importing');
    setNotionError('');
    try {
      const res = await V4BriefServiceFetch('/import-source-brief', {
        method: 'POST',
        body: JSON.stringify({ source_url: sourceUrl, email_context: briefForm.email_context || '' }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Notion import failed.');
      const payload = data.payload || {};
      applyImportedBriefPayload(payload, sourceUrl);
      setNotionStatus('done');
    } catch (err) {
      setNotionStatus('error');
      setNotionError(err.message || 'Source import failed.');
    }
  };

  const createCalendarHoldWithConfig = async (config, docUrl) => {
    const calendarTitle = config.calendar_title || config.title;
    const calendarMode = config.calendar_mode || 'all_day';
    if (!calendarTitle) {
      throw new Error('Add a title first.');
    }
    if (!config.calendar_date) {
      throw new Error('Add the calendar date.');
    }
    if (calendarMode === 'timed' && !config.calendar_start) {
      throw new Error('Add the calendar date and start time.');
    }
    const res = await V4BriefServiceFetch('/create-calendar-hold', {
      method: 'POST',
      body: JSON.stringify({
        ...config,
        calendar_title: calendarTitle,
        doc_url: docUrl || '',
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Calendar hold creation failed.');
    return data;
  };

  const buildBriefFromSource = async () => {
    const sourceUrl = String(briefForm.source_url || briefForm.notion_url || '').trim();
    if (!sourceUrl) {
      setNotionStatus('error');
      setNotionError('Paste a public Notion page or Google Doc link first.');
      return;
    }
    setNotionStatus('importing');
    setNotionError('');
    setDocStatus('idle');
    setDocError('');
    setDocResult(null);
    setCalendarStatus('idle');
    setCalendarError('');
    setCalendarResult(null);
    try {
      setDocStatus('creating');
      setBriefJobStatus('queued');
      setBriefJobStage('queued');
      setBriefJobStageDetail('Saved to your brief machine. Build is queued now.');
      const blankCalendar = V4InferCalendarFieldsFromGoLive('');
      const requestConfig = {
        source_url: sourceUrl,
        notion_url: sourceUrl,
        email_context: briefForm.email_context || '',
        calendar_title: briefForm.calendar_title || '',
        calendar_mode: briefForm.calendar_mode || 'all_day',
        calendar_date: briefForm.calendar_date || blankCalendar?.calendar_date || '',
        calendar_start: briefForm.calendar_start || blankCalendar?.calendar_start || '',
        calendar_end: briefForm.calendar_end || blankCalendar?.calendar_end || '',
      };
      const jobRes = await V4BriefServiceFetch('/start-brief-job', {
        method: 'POST',
        body: JSON.stringify(requestConfig),
      });
      const jobData = await jobRes.json();
      if (!jobRes.ok || !jobData.ok) throw new Error(jobData.error || 'Brief build failed.');
      const job = jobData.job || {};
      setBriefJobId(job.id || '');
      setBriefJobStatus(job.status || 'queued');
    } catch (err) {
      const message = err.message || 'Brief build failed.';
      setNotionStatus('error');
      setNotionError(message);
      setDocStatus('error');
      setDocError(message);
      if (/calendar/i.test(message)) {
        setCalendarStatus('error');
        setCalendarError(message);
      }
      setBriefJobId('');
      setBriefJobStatus('error');
    }
  };

  const createCalendarHold = async () => {
    setCalendarStatus('creating');
    setCalendarError('');
    setCalendarResult(null);
    try {
      const data = await createCalendarHoldWithConfig(briefConfig, docResult?.url || '');
      setCalendarResult(data);
      setCalendarStatus('done');
    } catch (err) {
      setCalendarStatus('error');
      setCalendarError(err.message || 'Calendar hold creation failed.');
    }
  };

  const generateBriefPdf = async () => {
    if (!briefConfig.title) {
      setBriefStatus('error');
      setBriefError('Add a title first.');
      return;
    }
    setBriefStatus('generating');
    setBriefError('');
    setBriefResult(null);
    try {
      const res = await fetch(V4_BRIEF_ACTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(briefConfig),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Brief generation failed.');
      setBriefResult(data);
      setBriefStatus('done');
    } catch (err) {
      setBriefStatus('error');
      setBriefError(err.message || 'Brief generation failed.');
    }
  };

  const runAction = (action) => {
    if (!action) return;
    if (action.type === 'launch-brief-builder') {
      if (V4IsGithubHostedPage() && V4ShouldUseMachineHostedBriefFlow()) {
        V4OpenMachineHostedBriefMaker();
        return;
      }
      setBriefMakerOpen(true);
      return;
    }
    if (action.type === 'open-robert-handoff') {
      setHandoffPreviewOpen(true);
      loadRobertHandoffPreview();
      return;
    }
    if (action.type === 'view') {
      onNavigateView?.(action.view, action.openId || null);
      return;
    }
    if (action.type === 'split') {
      onActivateSplit?.(action.splitId);
      return;
    }
    if (action.type === 'brief') {
      window.dispatchEvent(new CustomEvent('v3:open-brief', { detail: { leadId: action.leadId } }));
    }
  };

  const toolkitCards = V4_COMPANY_OS_TOOLKIT.map(tool => {
    if (tool.id === 'brief-maker') {
      return {
        ...tool,
        primaryLabel: 'Open Brief Maker',
        primaryAction: { type: 'launch-brief-builder' },
        simpleCard: true,
      };
    }
    if (tool.id === 'x-intake') {
      return {
        ...tool,
        primaryLabel: 'Open New Leads',
        primaryAction: { type: 'view', view: 'new-leads' },
        secondaryLabel: 'Focus X queue',
        secondaryAction: { type: 'view', view: 'new-leads' },
      };
    }
    if (tool.id === 'gmail-intake') {
      return {
        ...tool,
        primaryLabel: 'Open New Leads',
        primaryAction: { type: 'view', view: 'new-leads' },
        secondaryLabel: 'Open reply queue',
        secondaryAction: { type: 'split', splitId: 'reply' },
      };
    }
    if (tool.id === 'robert-handoff') {
      return {
        ...tool,
        primaryLabel: 'Review drafts',
        primaryAction: { type: 'open-robert-handoff' },
        secondaryLabel: 'Open reply queue',
        secondaryAction: { type: 'split', splitId: 'reply' },
      };
    }
    if (tool.id === 'company-operator') {
      return {
        ...tool,
        primaryLabel: 'Open reply queue',
        primaryAction: { type: 'split', splitId: 'reply' },
        secondaryLabel: 'Open follow ups',
        secondaryAction: { type: 'split', splitId: 'followups' },
      };
    }
    if (tool.id === 'stripe-sync') {
      return {
        ...tool,
        primaryLabel: 'Open invoices',
        primaryAction: { type: 'view', view: 'invoices' },
        secondaryLabel: 'Open terms queue',
        secondaryAction: { type: 'split', splitId: 'payment' },
      };
    }
    if (tool.id === 'calendar-brief-ops') {
      return {
        ...tool,
        primaryLabel: 'Open calendar',
        primaryAction: { type: 'view', view: 'calendar' },
        secondaryLabel: 'Open execution queue',
        secondaryAction: { type: 'split', splitId: 'briefing' },
      };
    }
    return tool;
  });

  return (
    <div className="cosov">
      <div className="cos-section-eyebrow-row">
        <span className="cos-eyebrow">Toolkit</span>
        <span className="cos-section-date">{V4_COMPANY_OS_TOOLKIT.length} tools</span>
      </div>
      <h2 className="cos-section-title">The skills and systems behind Company OS</h2>
      <p className="cos-section-sub cos-section-sub-left">
        This is the operator stack. Lead intake, reply handling, briefs, invoicing, and execution tools live here so the system can become more autonomous without getting messy.
      </p>
      <div className="cos-toolkit-grid">
        {toolkitCards.map(tool => (
          <section key={tool.id} className={'cos-panel cos-toolkit-card' + (tool.simpleCard ? ' is-brief-maker' : '')}>
            <div className="cos-panel-head">
              <h3>{tool.title}</h3>
              <span className={'cos-toolkit-status is-' + String(tool.status || '').toLowerCase().replace(/\s+/g, '-')}>{tool.status}</span>
            </div>
            <div className="cos-toolkit-body">
              {tool.simpleCard ? (
                <div className="cos-toolkit-simple-copy">
                  Build a Google Doc brief for Robert from one source link.
                </div>
              ) : (
                <>
                  <div className="cos-toolkit-meta">
                    <span className="cos-chip cos-chip-tight">{tool.kind}</span>
                    <span className="cos-toolkit-output">{tool.output}</span>
                  </div>
                  <div className="cos-toolkit-row">
                    <div className="cos-toolkit-label">Use for</div>
                    <div className="cos-toolkit-value">{tool.useFor}</div>
                  </div>
                  <div className="cos-toolkit-row">
                    <div className="cos-toolkit-label">Trigger</div>
                    <div className="cos-toolkit-value">{tool.trigger}</div>
                  </div>
                </>
              )}
              <div className="cos-toolkit-actions">
                {tool.primaryHref ? (
                  <a className="cos-toolkit-btn is-primary" href={tool.primaryHref} target="_blank" rel="noreferrer">
                    {tool.primaryLabel}
                  </a>
                ) : tool.primaryAction ? (
                  <button type="button" className="cos-toolkit-btn is-primary" onClick={() => runAction(tool.primaryAction)}>
                    {tool.primaryLabel}
                  </button>
                ) : null}
                {tool.secondaryAction ? (
                  <button type="button" className="cos-toolkit-btn" onClick={() => runAction(tool.secondaryAction)}>
                    {tool.secondaryLabel}
                  </button>
                ) : tool.secondaryHref ? (
                  <a className="cos-toolkit-btn" href={tool.secondaryHref} target="_blank" rel="noreferrer">
                    {tool.secondaryLabel}
                  </a>
                ) : null}
              </div>
              {!tool.simpleCard && <div className="cos-toolkit-note">{tool.note}</div>}
            </div>
          </section>
        ))}
      </div>
      {briefMakerOpen && (
        <div className="brief-modal-backdrop" onClick={() => setBriefMakerOpen(false)}>
          <div className="brief-maker-panel" onClick={e => e.stopPropagation()}>
            <div className="brief-modal-hd">
              <div>
                <h2 className="brief-modal-title">Brief Maker</h2>
              </div>
              <div className="brief-modal-hd-actions">
                <button type="button" className="brief-modal-close" onClick={() => setBriefMakerOpen(false)} aria-label="Close brief maker">
                  <V3Icon name="x" w={14} />
                </button>
              </div>
            </div>
            <div className="brief-maker-body">
              <div className="brief-maker-form">
                <div className="brief-maker-source-panel">
                  <div className="brief-maker-hero">
                    <div className="brief-maker-hero-kicker">Robert brief</div>
                    <h3>Paste a source link and build the doc</h3>
                    <p>One clean input. One click. Brief Maker reads the source and creates the Google Doc on Robert's account.</p>
                  </div>
                  <label className="brief-maker-field brief-maker-field-wide">
                    <span>Paste source link</span>
                    <input
                      className="brief-maker-input"
                      value={briefForm.source_url || briefForm.notion_url}
                      onChange={e => {
                        updateBriefField('source_url', e.target.value);
                        updateBriefField('notion_url', e.target.value);
                      }}
                      placeholder="Paste a public Notion page or Google Doc link"
                    />
                  </label>
                  <label className="brief-maker-field brief-maker-field-wide">
                    <span>Last sender email context (optional)</span>
                    <textarea
                      className="brief-maker-input"
                      value={briefForm.email_context || ''}
                      onChange={e => updateBriefField('email_context', e.target.value)}
                      placeholder="Paste the last email from the person sending the brief so Brief Maker can pick up tone, asks, timing, and constraints"
                      rows={6}
                    />
                  </label>
                  <div className="brief-maker-source-note">
                    Paste one link. Add the last sender email if you want extra context. Brief Maker will read it and build the Google Doc on Robert's account.
                  </div>
                  <div className="brief-maker-source-actions">
                    <button type="button" className="cos-toolkit-btn is-primary" onClick={buildBriefFromSource}>
                      {briefJobId || notionStatus === 'importing' || docStatus === 'creating' ? 'Building...' : 'Go'}
                    </button>
                  </div>
                </div>
              </div>
              <aside className="brief-maker-preview">
                <div className="brief-maker-server-status">
                  {effectiveNotionStatus === 'idle' && effectiveDocStatus === 'idle' && (
                    <div className="brief-maker-empty-state">
                      <strong>Ready</strong>
                      <span>Paste the link above, then press Go.</span>
                    </div>
                  )}
                  {effectiveNotionStatus === 'error' && (
                    <span className="brief-maker-server-error">{notionError}</span>
                  )}
                  {briefLoadingActive && (
                    <div className="brief-maker-loading-card">
                      <div className="brief-maker-loading-top">
                        <strong>Brief machine</strong>
                        <span>{effectiveBriefJobStatus === 'queued' ? 'Queued' : 'Running'}</span>
                      </div>
                      <div className="brief-maker-snake-rail" style={{ '--snake-step-count': briefWorkflowSteps.length, '--snake-step-index': briefWorkflowIndex }}>
                        <div className="brief-maker-snake-line" />
                        <div className="brief-maker-snake-head" />
                        {briefWorkflowSteps.map((step, idx) => (
                          <div
                            key={step.key}
                            className={
                              'brief-maker-snake-stop'
                              + (idx < briefWorkflowIndex ? ' is-done' : '')
                              + (idx === briefWorkflowIndex ? ' is-live' : '')
                            }
                          >
                            <span className="brief-maker-snake-dot" />
                            <span className="brief-maker-snake-label">{step.label}</span>
                          </div>
                        ))}
                      </div>
                      <span className="brief-maker-server-note">{briefProgressNote}</span>
                    </div>
                  )}
                  {effectiveDocStatus === 'error' && (
                    <span className="brief-maker-server-error">{docError}</span>
                  )}
                  {effectiveDocStatus === 'done' && docResult && (
                    <div className="brief-maker-result-card">
                      <span className="brief-maker-server-ok">Succeeded. Robert's Google Doc is ready.</span>
                      <div className="brief-maker-field-grid">
                        <label className="brief-maker-field">
                          <span>Calendar task title</span>
                          <input
                            className="brief-maker-input"
                            value={briefForm.calendar_title}
                            onChange={e => updateBriefField('calendar_title', e.target.value)}
                            placeholder={briefForm.title || 'Robert brief task title'}
                          />
                        </label>
                        <label className="brief-maker-field">
                          <span>Calendar mode</span>
                          <div className="brief-maker-mode-toggle">
                            <button
                              type="button"
                              className={'cos-toolkit-btn' + ((briefForm.calendar_mode || 'all_day') === 'all_day' ? ' is-primary' : '')}
                              onClick={() => updateBriefField('calendar_mode', 'all_day')}
                            >
                              All-day task
                            </button>
                            <button
                              type="button"
                              className={'cos-toolkit-btn' + ((briefForm.calendar_mode || 'all_day') === 'timed' ? ' is-primary' : '')}
                              onClick={() => updateBriefField('calendar_mode', 'timed')}
                            >
                              Timed event
                            </button>
                          </div>
                        </label>
                        <label className="brief-maker-field">
                          <span>Date</span>
                          <input
                            className="brief-maker-input"
                            type="date"
                            value={briefForm.calendar_date || ''}
                            onChange={e => updateBriefField('calendar_date', e.target.value)}
                          />
                        </label>
                        <label className="brief-maker-field">
                          <span>Start</span>
                          <input
                            className="brief-maker-input"
                            type="time"
                            value={briefForm.calendar_start || ''}
                            onChange={e => updateBriefField('calendar_start', e.target.value)}
                          />
                        </label>
                        <label className="brief-maker-field">
                          <span>End</span>
                          <input
                            className="brief-maker-input"
                            type="time"
                            value={briefForm.calendar_end || ''}
                            onChange={e => updateBriefField('calendar_end', e.target.value)}
                          />
                        </label>
                      </div>
                      <span className="brief-maker-server-note">
                        {(briefForm.calendar_mode || 'all_day') === 'all_day'
                          ? 'All-day task keeps the brief pinned at the top of Robert’s calendar. The actual target time still stays in the description.'
                          : 'Timed event is best for interviews, meetings, calls, and anything Robert must attend at an exact hour.'}
                      </span>
                      <div className="brief-maker-result-actions">
                        <a className="cos-toolkit-btn is-primary" href={docResult.url} target="_blank" rel="noreferrer">Open Google Doc</a>
                        <button type="button" className="cos-toolkit-btn" onClick={createCalendarHold}>
                          {calendarStatus === 'creating' ? 'Adding to calendar...' : 'Add to Robert calendar'}
                        </button>
                      </div>
                      {calendarStatus === 'error' && (
                        <span className="brief-maker-server-error">{calendarError}</span>
                      )}
                      {calendarStatus === 'done' && calendarResult && (
                        <div className="brief-maker-result-actions">
                          <span className="brief-maker-server-ok">
                            {calendarResult.kind === 'task'
                              ? 'Added to Robert’s Google Tasks.'
                              : 'Placed on Robert’s calendar.'}
                          </span>
                          {calendarResult.htmlLink && (
                            <a className="cos-toolkit-btn" href={calendarResult.htmlLink} target="_blank" rel="noreferrer">
                              {calendarResult.kind === 'task' ? 'Open task' : 'Open calendar event'}
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="brief-maker-footer-actions">
                  <button type="button" className="cos-toolkit-btn" onClick={resetBriefForm}>Reset</button>
                </div>
              </aside>
            </div>
          </div>
        </div>
      )}
      {handoffPreviewOpen && (
        <div className="brief-modal-backdrop" onClick={() => setHandoffPreviewOpen(false)}>
          <div className="brief-maker-panel handoff-preview-panel" onClick={e => e.stopPropagation()}>
            <div className="brief-modal-hd">
              <div>
                <div className="brief-maker-hero-kicker">Robert operator</div>
                <h2 className="brief-modal-title">Handoff Drafts</h2>
              </div>
              <div className="brief-modal-hd-actions">
                <button type="button" className="cos-toolkit-btn" onClick={loadRobertHandoffPreview}>
                  {handoffPreviewStatus === 'loading' ? 'Refreshing...' : 'Refresh'}
                </button>
                <button type="button" className="brief-modal-close" onClick={() => setHandoffPreviewOpen(false)} aria-label="Close handoff drafts">
                  <V3Icon name="x" w={14} />
                </button>
              </div>
            </div>
            <div className="handoff-preview-body">
              <div className="handoff-preview-headline">
                <strong>{handoffPreviewData?.drafts?.length || 0} drafts ready</strong>
                <span>
                  {handoffPreviewData?.generated_at
                    ? `Updated ${V4RobertHandoffTimestamp(handoffPreviewData.generated_at)}`
                    : 'Preview file is waiting for the next operator run'}
                </span>
              </div>
              {handoffPreviewStatus === 'loading' && (
                <div className="brief-maker-empty-state">
                  <strong>Loading drafts</strong>
                  <span>Pulling the latest Robert handoff preview from your machine.</span>
                </div>
              )}
              {handoffPreviewStatus === 'error' && (
                <div className="brief-maker-empty-state">
                  <strong>Could not load drafts</strong>
                  <span className="brief-maker-server-error">{handoffPreviewError}</span>
                </div>
              )}
              {handoffPreviewStatus === 'done' && !(handoffPreviewData?.drafts || []).length && (
                <div className="brief-maker-empty-state">
                  <strong>No drafts yet</strong>
                  <span>Run the Robert handoff operator and the next preview set will show here.</span>
                </div>
              )}
              {handoffPreviewStatus === 'done' && (handoffPreviewData?.drafts || []).length > 0 && (
                <div className="handoff-preview-list">
                  {(handoffPreviewData?.drafts || []).map((draft, index) => (
                    <section key={`${draft.subject || 'draft'}-${index}`} className="handoff-preview-card">
                      <div className="handoff-preview-card-top">
                        <div className="handoff-preview-card-id">
                          <span className="cos-chip cos-chip-tight">{String(draft?.kind || 'email').toUpperCase()}</span>
                          <strong>{V4RobertHandoffRecipients(draft)}</strong>
                        </div>
                        <button type="button" className="cos-toolkit-btn" onClick={() => copyHandoffDraft(draft, index)}>
                          {handoffCopiedIndex === index ? 'Copied' : 'Copy draft'}
                        </button>
                      </div>
                      <div className="handoff-preview-row">
                        <div className="handoff-preview-label">Subject</div>
                        <div className="handoff-preview-value">{draft.subject || 'No subject'}</div>
                      </div>
                      <div className="handoff-preview-row">
                        <div className="handoff-preview-label">Draft</div>
                        <pre className="handoff-preview-copy">{String(draft.body || '').trim()}</pre>
                      </div>
                      <div className="handoff-preview-row is-context">
                        <div className="handoff-preview-label">Why this lead</div>
                        <div className="handoff-preview-context">{V4RobertHandoffContext(draft.context)}</div>
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function V6SourceClass(source) {
  const s = String(source || '').toLowerCase();
  if (s.includes('gmail') || s === 'email') return 'gmail';
  if (s.includes('x') || s.includes('twitter')) return 'x';
  return 'lead';
}

function V6RowFact(lead, item) {
  let raw = (lead?.nextMove && lead.nextMove.text)
    || (item?.points && item.points[0])
    || V4CompanyOsListSnippet(lead)
    || '';
  let cleaned = V4CleanDisplayText(raw);
  if (cleaned.toLowerCase().includes('review drafted reply') || cleaned.length < 8) {
    const phase = V4CompanyOsPhase(lead);
    const val = lead?.value ? `${V4CompanyOsMoney(lead.value)} ` : '';
    cleaned = `${phase} • ${val}${lead?.daysInStage || 0}d`.trim();
  }
  if (cleaned.length <= 88) return cleaned;
  return cleaned.slice(0, 85).trim() + '…';
}

function V6ListRow({ lead, title, isCurrent, onClick, style }) {
  const brand = V4CleanDisplayText(title || lead?.brand || 'Lead');
  const source = lead?.source || 'lead';
  const age = lead?.daysInStage ? `${lead.daysInStage}d` : (lead?.lastTouch || '');
  const fact = V6RowFact(lead);
  return (
    <button
      type="button"
      className={`v6-row${isCurrent ? ' cur' : ''}`}
      style={style}
      onClick={onClick}
    >
      <span className={`v6-dot${lead?.unread ? '' : ' off'}`} />
      <span className="v6-brand-t">{brand}</span>
      <span className={`v6-src ${V6SourceClass(source)}`}>{source}</span>
      <span className="v6-age">{age}</span>
      <span className="v6-fact">{fact}</span>
    </button>
  );
}

function V4CosReader({ lead, user, composeOpen, setComposeOpen, onBack, isBrief, briefItem }) {
  const { STAGE_BY_ID, USERS } = window.V3;
  const [tab, setTab] = React.useState('thread');
  React.useEffect(() => { setTab('thread'); }, [lead?.id]);
  if (!lead) {
    return <div className="cos2-reader"><div className="cos2-reader-empty">Select a thread from the list.</div></div>;
  }

  const isBriefSelected = isBrief && briefItem;
  const stage = STAGE_BY_ID[lead.stage];
  const nextOwner = lead.nextMove?.who ? USERS[lead.nextMove.who] : null;
  const isMine = window.V3.MoveIsMineForProfile(lead, user);
  const isThem = !lead.nextMove?.who && !['paid-out'].includes(lead.stage);
  const replyAction = ['Reply', 'Send', 'Nudge'].includes(lead.nextMove?.action);
  const owner = lead.ownerId ? USERS[lead.ownerId] : null;
  const operatorStatus = V4OperatorStatus(lead);
  const isReview = String(lead.draftReplyStatus || '').toLowerCase() === 'review';
  const reviewReason = (Array.isArray(lead.activity)
    ? (lead.activity.filter(a => String(a.user || '') === 'Scam gate').slice(-1)[0] || {}).action
    : '') || 'Verify the sender and what they are proposing before committing.';
  const operatorSummary = lead.operatorSummary || {};
  const operatorAnalysis = lead.operatorAnalysis || {};
  const operatorEscalation = Array.isArray(lead.operatorEscalation) ? lead.operatorEscalation : [];
  const execution = V4CompanyOsExecutionMeta(lead);
  const quickStages = V4QuickStageActions(lead);
  const mailboxOrigin = V4CompanyOsMailboxOrigin(lead);
  const isXLead = mailboxOrigin === 'x';
  const compactMeta = [lead.contactRole, isXLead ? lead.xHandle : '', lead.email].filter(Boolean).join(' · ');
  const listSnippet = V4CompanyOsListSnippet(lead);
  const operatorBadgeVisible = operatorStatus.label !== 'Monitoring';
  const xContextRows = V4XLeadContextRows(lead);
  const moveLead = (nextStage) => window.V3.MoveLeadStage(lead, nextStage);
  const clearUnread = () => V4CosPatchLead(lead, { new_reply_at: null }, { unread: false });

  const briefSummary = isBriefSelected ? (
    <div className="brief-detail-summary">
      <h4>Brief Summary</h4>
      <ul className="brief-points">
        {briefItem.points.map((p, i) => <li key={i}>{V4CleanDisplayText(p)}</li>)}
      </ul>
    </div>
  ) : null;

  const readerOps = (
    <>
      <div className="cos-quick-actions">
        <div className="cos-quick-actions-group">
          <span className="cos-quick-actions-label">Quick actions</span>
          <button className="cos-quick-btn is-primary" type="button" onClick={() => setComposeOpen(true)}>
            {isXLead && !lead.email ? 'Prep email handoff' : (lead.draftReply ? 'Approve draft' : (replyAction ? lead.nextMove.action : 'Reply'))}
          </button>
          {isXLead && lead.xOpenDm && (
            <button className="cos-quick-btn" type="button" onClick={() => window.open(lead.xOpenDm, '_blank', 'noopener')}>
              Open DM
            </button>
          )}
          {lead.unread && (
            <button className="cos-quick-btn" type="button" onClick={clearUnread}>
              Mark read
            </button>
          )}
          <button className="cos-quick-btn is-danger" type="button" onClick={() => moveLead('trash')}>
            Trash
          </button>
        </div>
        <div className="cos-quick-actions-group">
          <span className="cos-quick-actions-label">Move to</span>
          {quickStages.map(action => (
            <button
              key={action.stage}
              className="cos-quick-btn"
              type="button"
              onClick={() => moveLead(action.stage)}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
      {(lead.operatorMemory || lead.draftReply) && (
        <section className="cos-operator-strip">
          <div className="cos-operator-strip-head">
            <div>
              <div className="cos-operator-strip-eyebrow">Operator</div>
              <h3>Lead operator readout</h3>
            </div>
            <span className={`cos-operator-status is-${operatorStatus.tone}`}>{operatorStatus.label}</span>
          </div>
          <div className="cos-operator-grid">
            <div className="cos-operator-card">
              <div className="cos-operator-card-label">Current read</div>
              <div className="cos-operator-card-value">
                {operatorSummary.current_status || operatorAnalysis.reason || 'Waiting for more thread context.'}
              </div>
            </div>
            <div className="cos-operator-card">
              <div className="cos-operator-card-label">Suggested next step</div>
              <div className="cos-operator-card-value">
                {operatorSummary.next_action || lead.nextMove?.text || 'Review thread'}
              </div>
            </div>
            <div className="cos-operator-card">
              <div className="cos-operator-card-label">Stage / reply type</div>
              <div className="cos-operator-card-value">
                {[operatorAnalysis.stage ? V4CompanyOsPhase({ stage: operatorAnalysis.stage }) : '', operatorAnalysis.reply_type ? V4OperatorReplyTypeLabel(operatorAnalysis.reply_type) : '']
                  .filter(Boolean)
                  .join(' · ') || 'No operator stage yet'}
              </div>
            </div>
            <div className="cos-operator-card">
              <div className="cos-operator-card-label">Rate / timing</div>
              <div className="cos-operator-card-value">
                {[operatorSummary.quoted_rate, operatorSummary.launch_timing].filter(Boolean).join(' · ') || 'No hard rate or date captured yet'}
              </div>
            </div>
          </div>
          {operatorSummary.lead_summary && (
            <div className="cos-operator-summary">
              <strong>Summary</strong>
              <p>{operatorSummary.lead_summary}</p>
            </div>
          )}
          {operatorEscalation.length > 0 && (
            <div className="cos-operator-escalation">
              <strong>Needs human eyes</strong>
              <div className="cos-operator-escalation-list">
                {operatorEscalation.map(item => <span key={item} className="cos-chip cos-chip-soft">{item.replace(/_/g, ' ')}</span>)}
              </div>
            </div>
          )}
        </section>
      )}
      <V4CompanyOsExecutionPanel lead={lead} execution={execution} />
    </>
  );
  const moveEyebrow = isMine ? "ASHER'S MOVE" : isThem ? `WAITING ON ${String(lead.contactName || '').split(' ')[0].toUpperCase()}` : nextOwner ? `${nextOwner.name.toUpperCase()}'S MOVE` : 'NEXT MOVE';
  const threadId = lead.gmailThreadId || lead.id || '';
  const threadIdShort = String(threadId).slice(-8).toUpperCase();

  const showCompose = composeOpen || Boolean(lead.draftReply || lead.unread || lead.needsReply);

  return (
    <div className="cos2-reader v6-reader cos2-reader--split">
      <button className="hd-icon-btn cos2-back v6-back-mobile" onClick={onBack} aria-label="Back to list" type="button">
        <V3Icon name="chev_d" w={14} style={{ transform: 'rotate(90deg)' }} />
      </button>
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
      <div className="v6-rhead fadein">
        <div className="v6-tags">
          {(lead.unread || lead.needsReply) && <span className="v6-tag hot">Action now</span>}
          <span className="v6-tag">{lead.source || 'Lead'}</span>
          {lead.category && <span className="v6-tag">{lead.category}</span>}
          {owner && <span className="v6-tag">Owner · {owner.name}</span>}
          <span className="v6-tag">{lead.daysInStage || 0}d in stage</span>
        </div>
        <h1>{V4CleanDisplayText(lead.brand)}</h1>
        <div className="v6-sub">
          {lead.contactName}
          {lead.email ? ` · ${lead.email}` : ''}
          {threadIdShort ? ` · thread ${threadIdShort}` : ''}
        </div>
      </div>
      {isBriefSelected && briefItem && (
        <div className="brief-detail-summary">
          <h4>Brief Summary</h4>
          <ul className="brief-points">
            {briefItem.points.map((p, i) => <li key={i}>{V4CleanDisplayText(p)}</li>)}
          </ul>
        </div>
      )}
      {isReview && (
        <div className="cos2-review-banner">
          <div className="cos2-review-banner-msg">
            <strong>Scam gate flagged this for review</strong>
            <span>{reviewReason}</span>
          </div>
          <div className="cos2-review-banner-btns">
            {lead.draftReply && <button type="button" className="cos2-review-approve" onClick={() => setComposeOpen(true)}>Approve &amp; send</button>}
            <button type="button" className="cos2-review-dismiss" onClick={() => { if (window.confirm('Dismiss as scam and move to Trash?')) window.V3.MoveLeadStage(lead, 'trash'); }}>Dismiss (scam)</button>
          </div>
        </div>
      )}
      <div className="cos-reader-hero fadein" style={{ animationDelay: '.06s' }}>
        <div className="drawer-top">
          <V3Avatar name={lead.contactName} color={lead.color} size="lg" />
          <div className="drawer-top-text">
            <div className="drawer-top-meta">
              <span className="drawer-top-chip">{lead.source}</span>
              {mailboxOrigin === 'asher' && <span className="drawer-top-chip">Asher</span>}
              {mailboxOrigin === 'robert' && <span className="drawer-top-chip">Robert</span>}
              {mailboxOrigin === 'x' && <span className="drawer-top-chip">X</span>}
              {owner && <span className="drawer-top-chip">Owner · {owner.name}</span>}
              {lead.category && <span className={'cat-tab cat-' + lead.category}>{lead.category}</span>}
            </div>
            <h2 className="drawer-top-name">{lead.contactName}</h2>
            <div className="drawer-top-co">
              <strong>{lead.brand}</strong>
              {compactMeta ? <span> · {compactMeta}</span> : null}
            </div>
          </div>
        </div>
        <div className="drawer-facts">
          {lead.value ? <span className="drawer-fact mono">{v3Money(lead.value)}</span> : null}
          <span className="drawer-fact mono">{lead.daysInStage}d in stage</span>
          <span className="drawer-fact">{stage.name}</span>
          {isXLead && lead.xMessageCount ? <span className="drawer-fact">{lead.xMessageCount} DM{lead.xMessageCount === 1 ? '' : 's'}</span> : null}
          {lead.deliverables ? <span className="drawer-fact drawer-fact-wide" title={lead.deliverables}>{lead.deliverables}</span> : null}
          {operatorBadgeVisible ? <span className="drawer-fact">{operatorStatus.label}</span> : null}
        </div>
        <div className={'next-move next-move-compact v6-move ' + (isMine ? '' : 'them')}>
          <div className="next-move-icon" aria-hidden="true">→</div>
          <div className="next-move-text">
            <div className="next-move-eyebrow">{moveEyebrow}</div>
            <div className="next-move-title">{lead.nextMove?.text || listSnippet}</div>
          </div>
          {isMine && replyAction && (
            <div className="next-move-actions">
              <button className="btn btn-sm btn-accent" onClick={() => setComposeOpen(true)}>
                <V3Icon name="arrow_r" w={13} />
                {lead.nextMove.action}
              </button>
              {isXLead && lead.xOpenDm && (
                <button className="btn btn-sm btn-ghost" onClick={() => window.open(lead.xOpenDm, '_blank', 'noopener')}>
                  <V3Icon name="network" w={13} />
                  Open DM
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="v6-metrics v6-metrics-compact fadein" style={{ animationDelay: '.12s' }}>
        <span><b>{lead.value ? v3Money(lead.value) : '—'}</b> deal</span>
        <span><b>{lead.daysInStage || 0}</b> days in stage</span>
        <span><b>{Array.isArray(lead.thread) ? lead.thread.length : 0}</b> emails</span>
      </div>

      <div className="cos2-reader-workspace">
        <div className="cos2-reader-pane cos2-reader-pane--thread">
          <div className="drawer-tabs">
            <button className="dr-tab" aria-selected={tab === 'thread'} onClick={() => setTab('thread')}>
              {isXLead ? 'Lead context' : 'Email thread'} <span className="cnt">{lead.thread.length}</span>
            </button>
            <button className="dr-tab" aria-selected={tab === 'stands'} onClick={() => setTab('stands')}>
              Where this stands
            </button>
          </div>
          <div className="drawer-body drawer-body--thread">
            {tab === 'thread' && (
              isXLead ? (
                <div className="cos-reader-stands">
                  <div className="cos-operator-strip">
                    <div className="cos-operator-strip-head">
                      <div>
                        <div className="cos-operator-strip-eyebrow">X intake</div>
                        <h3>What came in from the DM scrape</h3>
                      </div>
                      {lead.xOpenDm ? (
                        <button className="cos-quick-btn" type="button" onClick={() => window.open(lead.xOpenDm, '_blank', 'noopener')}>
                          Open DM
                        </button>
                      ) : null}
                    </div>
                    <div className="cos-operator-grid">
                      <div className="cos-operator-card">
                        <div className="cos-operator-card-label">Source</div>
                        <div className="cos-operator-card-value">{lead.xHandle || lead.contactName}</div>
                      </div>
                      <div className="cos-operator-card">
                        <div className="cos-operator-card-label">Type</div>
                        <div className="cos-operator-card-value">{lead.deliverables || 'X DM lead'}</div>
                      </div>
                      <div className="cos-operator-card">
                        <div className="cos-operator-card-label">Message count</div>
                        <div className="cos-operator-card-value">{lead.xMessageCount || 1} DM{lead.xMessageCount === 1 ? '' : 's'}</div>
                      </div>
                      <div className="cos-operator-card">
                        <div className="cos-operator-card-label">Email captured</div>
                        <div className="cos-operator-card-value">{lead.email || 'No email captured yet'}</div>
                      </div>
                    </div>
                    <div className="cos-operator-summary">
                      {xContextRows.map(row => (
                        <div key={row.label} className="handoff-preview-row">
                          <div className="handoff-preview-label">{row.label}</div>
                          <div className="handoff-preview-context">{row.value}</div>
                        </div>
                      ))}
                      {!xContextRows.length && <p>No X intake context was saved for this lead yet.</p>}
                    </div>
                  </div>
                </div>
              ) : <V3Thread lead={lead} />
            )}
            {tab === 'stands' && (
              <div className="cos-reader-stands">
                {readerOps}
                <V3Stands lead={lead} />
              </div>
            )}
          </div>
        </div>

        <div className="cos2-reader-pane cos2-reader-pane--compose">
          {showCompose ? (
            <V3InlineReply lead={lead} user={user} onCollapse={() => setComposeOpen(false)} />
          ) : (
            <button type="button" className="drawer-reply-bar drawer-reply-bar--dock" onClick={() => setComposeOpen(true)}>
              <V3Icon name="reply" w={14} />
              <span>{isXLead && !lead.email ? `Prep handoff for ${lead.contactName.split(' ')[0]}` : `Reply to ${lead.contactName.split(' ')[0]}${lead.draftReply ? ' — draft ready' : ''}`}</span>
              <V3Icon name="chev_d" w={12} style={{ transform: 'rotate(180deg)' }} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Small premium animated counter for "alive" metrics
function AnimatedCounter({ value, className = '', format }) {
  const [display, setDisplay] = React.useState(value);
  const prevRef = React.useRef(value);

  React.useEffect(() => {
    if (prevRef.current === value) return;
    const start = prevRef.current;
    const end = value;
    const duration = 420;
    const startTime = performance.now();

    const animate = (now) => {
      const progress = Math.min((now - startTime) / duration, 1);
      // ease out
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + (end - start) * eased);
      setDisplay(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setDisplay(end);
        prevRef.current = end;
      }
    };

    requestAnimationFrame(animate);
  }, [value]);

  return <span className={className} data-changing={prevRef.current !== value}>{format ? format(display) : display}</span>;
}

function V4CompanyOsView({ leads = [], query = '', user = 'asher', onOpenLead, onNavigateView }) {
  React.useEffect(() => {
    V4MaybeRedirectToMachineHostedApp();
  }, []);

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
  const followUpItems = awake.filter(l => l.followUpDue && !l.unread).sort(byStale);
  const activeItems = awake.filter(l => !['done', 'paid-out', 'trash', 'dead-leads'].includes(l.stage));
  const replyItems = activeItems.filter(l => l.unread && l.nextMove?.who).sort(byStale);
  const pricingItems = activeItems.filter(l => l.stage === 'rates-sent').sort(byStale);
  const negoItems = activeItems.filter(l => l.stage === 'negotiating').sort(byStale);
  const paymentItems = activeItems.filter(l => l.stage === 'invoice-sent').sort(byStale);
  const briefingItems = awake.filter(l => l.stage === 'done').sort(byRecent);
  const waitingItems = activeItems.filter(l => !l.unread && !l.nextMove?.who).sort(byRecent);
  const closedItems = awake.filter(l => ['done', 'paid-out'].includes(l.stage)).sort(byRecent);
  // Scam-gate flagged leads — the machine paused these for a human decision (approve & send, or dismiss)
  const reviewItems = awake.filter(l => String(l.draftReplyStatus || '').toLowerCase() === 'review').sort(byStale);

  // Helper to compute total value for a list of items
  const totalValue = (items) => items.reduce((sum, l) => sum + (l.value || 0), 0);

  // Brief mode: Action now leads first, then Watch (Superhuman "Today" / prioritized inbox)
  const briefActionLeads = activeItems
    .filter(l => l.needsReply || l.stage === 'invoice-sent' || (l.daysInStage >= 6 && (l.value || 0) > 1500))
    .sort((a, b) => (b.daysInStage || 0) - (a.daysInStage || 0) || (b.value || 0) - (a.value || 0))
    .slice(0, 5);

  const briefWatchLeads = activeItems
    .filter(l => !l.needsReply && ['rates-sent', 'negotiating', 'first-touch', 'engaged'].includes(l.stage))
    .sort(byRecent)
    .slice(0, 5);

  const briefItems = [...briefActionLeads, ...briefWatchLeads];

  // Use the computed summaries for clean, short display in the brief list (like original brief cards)
  const briefSummaries = React.useMemo(() => V4ComputeDailyBrief(live), [live]);

  const splits = [
    {
      id: 'review',
      label: 'Needs review',
      hint: 'Scam gate flagged these. Approve and send, or dismiss.',
      section: 'Workflow',
      hot: reviewItems.length > 0,
      items: reviewItems
    },
    {
      id: 'reply',
      label: 'Reply now',
      hint: 'Unread messages where you need to respond',
      section: 'Workflow', 
      hot: true, 
      items: replyItems 
    },
    { 
      id: 'followups',
      label: 'Follow-ups', 
      hint: 'Scheduled check-ins due',
      section: 'Workflow', 
      hot: followUpItems.length > 0, 
      items: followUpItems 
    },
    { 
      id: 'pricing',  
      label: 'Pricing sent', 
      hint: 'Rates proposed, awaiting reply',
      section: 'Workflow', 
      items: pricingItems 
    },
    { 
      id: 'nego',     
      label: 'Negotiating', 
      hint: 'Active back-and-forth on scope or price',
      section: 'Workflow', 
      items: negoItems 
    },
    { 
      id: 'payment',  
      label: 'Payment chase', 
      hint: 'Invoice sent, chasing proof or terms',
      section: 'Workflow', 
      items: paymentItems 
    },
    { 
      id: 'briefing', 
      label: 'Brief ready', 
      hint: 'Deal closed, prep Robert execution',
      section: 'Workflow', 
      items: briefingItems 
    },
    { 
      id: 'waiting',  
      label: 'Waiting', 
      hint: 'No outstanding move from our side',
      section: 'Workflow', 
      items: waitingItems 
    },
    { id: 'snoozed', label: 'Snoozed',         section: 'System', items: live.filter(isSnoozed).sort((a, b) => Date.parse(snoozes[a.id]) - Date.parse(snoozes[b.id])) },
    { id: 'closed',  label: 'Done and paid',   section: 'System', items: closedItems },
    { id: 'trash',   label: 'Trash',           section: 'System', trash: true, items: base.filter(l => ['trash', 'dead-leads'].includes(l.stage)).sort(byRecent) },
    { id: 'brief',   label: 'Overview',        section: 'System', items: briefItems, isBrief: true },
    { id: 'toolkit', label: 'Toolkit',         section: 'System', toolkit: true, items: V4_COMPANY_OS_TOOLKIT },
  ];

  const [splitId, setSplitId] = React.useState('brief');
  const [selId, setSelId] = React.useState(null);
  const [composeOpen, setComposeOpen] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const split = splits.find(s => s.id === splitId) || splits[0];
  const items = split.items || [];
  let selected = items.find(l => String(l.id) === String(selId)) || items[0] || null;
  // Fallback to live for cases where brief summaries have items not in the sliced briefItems (e.g. data timing)
  if (split.isBrief && selId && (!selected || String(selected.id) !== String(selId))) {
    selected = live.find(l => String(l.id) === String(selId)) || selected;
  }

  React.useEffect(() => {
    try {
      const current = new URL(String(window.location?.href || ''));
      if (current.searchParams.get('open') === 'brief-maker') {
        setSplitId('toolkit');
      }
    } catch (err) {}
  }, []);

  React.useEffect(() => { setSelId(null); setMobileOpen(false); setComposeOpen(false); }, [splitId]);
  React.useEffect(() => {
    if (!selected) {
      setComposeOpen(false);
      return;
    }
    setComposeOpen(Boolean(selected.draftReply || selected.unread || selected.needsReply));
  }, [selected?.id, selected?.draftReply, selected?.unread, selected?.needsReply]);

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
      if (split.brief || split.toolkit) return;
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

  const replyCount = splits.find(s => s.id === 'reply')?.items.length || 0;
  const reviewCount = reviewItems.length;
  const followUpCount = splits.find(s => s.id === 'followups')?.items.length || 0;
  const p0Count = live.filter(l => l.unread || l.stage === 'invoice-sent').length;
  const invoicedOutstanding = live.filter(l => l.stage === 'invoice-sent').reduce((s, l) => s + (l.value || 0), 0);
  const openPipeline = live.filter(l => !['done', 'paid-out'].includes(l.stage)).reduce((s, l) => s + (l.value || 0), 0);

  const { USERS } = window.V3;
  const briefDateLabel = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();

  return (
    <section className="page cos2-page">
      <header className="cos2-top v6-topbar">
        <div className="v6-brand">
          <div className="v6-mark" aria-hidden="true">U</div>
          <div className="v6-wm">UNALIGNED<small>ACTIVE WORKSPACE</small></div>
        </div>
        <span className="cos2-brand">
          <V4CompanyOsBuildingIcon size={18} />
          <strong>UNALIGNED</strong>
          <span className="cos2-brand-sub">Active workspace</span>
        </span>
        <div className="cos2-stats">
          {reviewCount > 0 && (
            <button type="button" className="cos2-stat cos2-stat-review" onClick={() => setSplitId('review')} title="Scam gate flagged these for you">
              <span className="cos2-stat-lbl">To review</span>
              <span className="cos2-stat-num"><AnimatedCounter value={reviewCount} /></span>
            </button>
          )}
          <div className="cos2-stat"><span className="cos2-stat-lbl">P0 open</span><span className="cos2-stat-num"><AnimatedCounter value={p0Count} /></span></div>
          <div className="cos2-stat cos2-stat-accent"><span className="cos2-stat-lbl">Reply now</span><span className="cos2-stat-num"><AnimatedCounter value={replyCount} /></span></div>
          <div className="cos2-stat"><span className="cos2-stat-lbl">Terms / pay</span><span className="cos2-stat-num cos2-stat-money"><AnimatedCounter value={invoicedOutstanding} format={v => '$' + v.toLocaleString()} /></span></div>
          <div className="cos2-stat"><span className="cos2-stat-lbl">In play</span><span className="cos2-stat-num cos2-stat-money"><AnimatedCounter value={openPipeline} format={v => '$' + v.toLocaleString()} /></span></div>
        </div>
        <div className="v6-spacer" />
        <div className="v6-avatars" aria-label="Team">
          {['robert', 'sammy', 'asher'].map((id) => {
            const u = USERS[id];
            if (!u) return null;
            return (
              <div key={id} title={u.name}>
                <V3Avatar name={u.name} color={u.color} size="xs" />
              </div>
            );
          })}
        </div>
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
                      onClick={() => setSplitId(s.id)}
                      title={s.hint || ''}>
                <span className="cos2-split-label">
                  {s.label}
                </span>
                {!s.toolkit && !s.brief && (
                  <span className="cos2-split-cnt">
                    {(['payment', 'pricing', 'nego'].includes(s.id) && totalValue(s.items) > 0)
                      ? V4CompanyOsMoney(totalValue(s.items))
                      : (() => {
                          const count = s.items.length;
                          const stale = s.items.filter(l => (l.daysInStage || 0) >= 5).length;
                          return stale > 0 ? `${count} (${stale} old)` : count;
                        })()}
                  </span>
                )}
                {s.brief && (
                  <span className="cos2-split-cnt"><AnimatedCounter value={briefSummaries.action.length + briefSummaries.watch.length} /></span>
                )}
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
        {split.toolkit ? (
          <div className="cos2-main-scroll"><V4CosToolkit onNavigateView={onNavigateView} onActivateSplit={setSplitId} /></div>
        ) : (
          <>
            <div className="cos2-list">
              {split.isBrief && (
                <div className="v6-list-head brief-mode-header">
                  <div className="v6-list-title brief-mode-title">
                    <small>DAILY BRIEF · {briefDateLabel}</small>
                    Today&apos;s moves
                  </div>
                  <div className="v6-pills brief-mode-stats">
                    <span className="act"><AnimatedCounter value={briefActionLeads.length} /> to act</span>
                    <span><AnimatedCounter value={briefWatchLeads.length} /> watching</span>
                  </div>
                </div>
              )}

              <div className="cos2-list-scroll v6-list-scroll">
              {split.isBrief ? (
                <>
                  {briefSummaries.action.length > 0 && (
                    <div className="v6-sec brief-section-header">
                      ACTION NOW <b>{briefSummaries.action.length}</b>
                    </div>
                  )}
                  {briefSummaries.action.map((item, index) => {
                    const lead = live.find(ll => String(ll.id) === String(item.id)) || {};
                    const isCurrent = String(item.id) === String(selId);
                    return (
                      <div key={item.id} className={'tesla-row-wrap' + (isCurrent ? ' is-current' : '')}>
                        <V6ListRow
                          lead={lead}
                          title={item.title}
                          isCurrent={isCurrent}
                          style={{ animationDelay: `${0.05 + index * 0.05}s` }}
                          onClick={() => { setSelId(item.id); setMobileOpen(true); }}
                        />
                        <button type="button"
                                className="tesla-row-act"
                                title="Move to trash"
                                onClick={(e) => { e.stopPropagation(); window.V3.MoveLeadStage(lead, 'trash'); }}>
                          <V3Icon name="trash" w={13} />
                        </button>
                      </div>
                    );
                  })}

                  {briefSummaries.watch.length > 0 && (
                    <div className="v6-sec brief-section-header">
                      WATCH / WAITING <b>{briefSummaries.watch.length}</b>
                    </div>
                  )}
                  {briefSummaries.watch.map((item, index) => {
                    const lead = live.find(ll => String(ll.id) === String(item.id)) || {};
                    const isCurrent = String(item.id) === String(selId);
                    return (
                      <div key={item.id} className={'tesla-row-wrap' + (isCurrent ? ' is-current' : '')}>
                        <V6ListRow
                          lead={lead}
                          title={item.title}
                          isCurrent={isCurrent}
                          style={{ animationDelay: `${0.3 + index * 0.05}s` }}
                          onClick={() => { setSelId(item.id); setMobileOpen(true); }}
                        />
                        <button type="button"
                                className="tesla-row-act"
                                title="Move to trash"
                                onClick={(e) => { e.stopPropagation(); window.V3.MoveLeadStage(lead, 'trash'); }}>
                          <V3Icon name="trash" w={13} />
                        </button>
                      </div>
                    );
                  })}
                </>
              ) : (
                items.map((l, index) => (
                  <div key={l.id} className={'cos2-row-wrap' + (String(l.id) === String(selected?.id) ? ' is-current' : '')}>
                    <V6ListRow
                      lead={l}
                      isCurrent={String(l.id) === String(selected?.id)}
                      style={{ animationDelay: `${0.05 + index * 0.03}s` }}
                      onClick={() => { setSelId(l.id); setMobileOpen(true); }}
                    />
                    <button type="button"
                            className="cos2-row-act"
                            title={split.trash ? 'Restore to board' : 'Move to trash'}
                            aria-label={split.trash ? 'Restore lead' : 'Trash lead'}
                            onClick={(e) => { e.stopPropagation(); window.V3.MoveLeadStage(l, split.trash ? 'new' : 'trash'); }}>
                      <V3Icon name={split.trash ? 'reply' : 'trash'} w={13} />
                    </button>
                  </div>
                ))
              )}
              {items.length === 0 && !split.isBrief && (
                <div className="cos2-zero">
                  <span className="cos2-zero-mark">✓</span>
                  <strong>Inbox zero</strong>
                  <span>Nothing in {split.label.toLowerCase()}. Breathe.</span>
                </div>
              )}
              </div>
            </div>
            <V4CosReader 
              key={selected ? selected.id : 'no-lead'} 
              lead={selected} 
              user={user} 
              isBrief={split.isBrief} 
              briefItem={split.isBrief && selected ? (briefSummaries.action.find(i => String(i.id) === String(selected.id)) || briefSummaries.watch.find(i => String(i.id) === String(selected.id))) : null}
              composeOpen={composeOpen} 
              setComposeOpen={setComposeOpen}
              onBack={() => setMobileOpen(false)} 
            />
          </>
        )}
      </div>
    </section>
  );
}

window.V4CompanyOsView = V4CompanyOsView;
