// FLOW v4 — live Supabase/email helpers

const V3_SUPABASE_URL = "https://hbnpwphxjurvtydezwgh.supabase.co";
const V3_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhibnB3cGh4anVydnR5ZGV6d2doIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MTQ1MzIsImV4cCI6MjA5MDk5MDUzMn0.p5E48__GlGqjC17Z28q8fYFK-qV8CmiidYIP02vGe4s";

async function V3LoadSupabaseLeads() {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const url = V3_SUPABASE_URL + "/rest/v1/cards?select=*&order=id.desc&offset=" + offset + "&limit=1000";
    const res = await fetch(url, {
      headers: {
        apikey: V3_SUPABASE_ANON_KEY,
        Authorization: "Bearer " + V3_SUPABASE_ANON_KEY,
      },
    });
    if (!res.ok) throw new Error("Supabase " + res.status + ": " + await res.text());
    const chunk = await res.json();
    if (!Array.isArray(chunk) || chunk.length === 0) break;
    rows.push(...chunk);
    if (chunk.length < 1000) break;
  }
  return rows.map(V3NormalizeSupabaseLead);
}

function V3NormalizeSupabaseLead(row) {
  const name = row.contact_name || row.title || row.email || 'Untitled lead';
  const brand = row.business_name || V3DomainBrand(row.email) || row.title || 'Unknown company';
  const received = row.date_received_iso || row.created_at || row.moved_at || null;
  const activityDays = V3DaysSince(row.new_reply_at || row.moved_at || received);
  const rawStage = V3NormalizeStage(row.list_id);
  // Auto-trash: last touch > 50 days and not already closed out
  const stage = (activityDays > 50 && !['paid-out', 'done', 'trash'].includes(rawStage)) ? 'trash' : rawStage;
  const daysInStage = V3DaysSince(row.moved_at || received);
  const needsReply = Boolean(row.new_reply_at) || row.draft_reply_status === 'pending' || stage === 'new';
  const ownerId = V3NormalizeOwner(row.assignee || row.created_by);
  const value = V3ParseMoney(row.estimated_value);
  const category = V3CategoryFromRow(row);
  const timelineDays = V3TimelineDaysFromRow(row);
  return {
    id: String(row.id),
    contactName: name,
    contactRole: row.job_title || row.lead_source || '',
    brand,
    stage,
    value,
    deliverables: row.intent || row.lead_source || '',
    ownerId,
    category,
    daysInStage,
    activityDays,
    timelineDays,
    lastTouch: V3RelativeTime(row.new_reply_at || row.moved_at || received),
    needsReply,
    approve: row.draft_reply ? ownerId : null,
    color: __v3Color(name + brand),
    email: row.email || '',
    gmailThreadId: row.gmail_thread_id || '',
    draftReply: V3ParseDraftReply(row.draft_reply),
    draftReplyStatus: row.draft_reply_status || '',
    rowId: row.id,
    source: row.lead_source || (row.gmail_thread_id ? 'Gmail' : 'Manual'),
    nextMove: V3NextMoveFromRow(stage, name, ownerId, needsReply, row),
    timeline: __v3Timeline(stage, daysInStage, name, brand),
    thread: V3ThreadFromRow(row, name, brand, stage),
    progress: Math.max(0, V3_ACTIVE_STAGE_IDS.indexOf(stage)),
    unread: Boolean(row.new_reply_at),
  };
}

function V3ParseDraftReply(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch (e) {
    return { subject: '', body: value };
  }
}

function V3NormalizeStage(stage) {
  const s = String(stage || 'new').toLowerCase();
  if (V3_ACTIVE_STAGE_IDS.includes(s)) return s;
  const map = { discovery: 'new', build: 'engaged', posted: 'done', paid: 'paid-out', 'anything-else': 'dead-leads', dead: 'dead-leads' };
  return map[s] || 'new';
}

function V3NormalizeOwner(owner) {
  const s = String(owner || '').toLowerCase();
  if (s.includes('robert')) return 'robert';
  if (s.includes('sam')) return 'sammy';
  return 'asher';
}

function V3ParseMoney(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function V3DomainBrand(email) {
  const m = String(email || '').match(/@([^@.]+)\./);
  return m ? m[1].replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '';
}

function V3DaysSince(value) {
  const t = value ? Date.parse(value) : NaN;
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

function V3RelativeTime(value) {
  const t = value ? Date.parse(value) : NaN;
  if (!Number.isFinite(t)) return '';
  const mins = Math.max(0, Math.floor((Date.now() - t) / 60000));
  if (mins < 60) return String(mins || 1) + 'm';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return String(hrs) + 'h';
  return String(Math.floor(hrs / 24)) + 'd';
}

function V3TimelineDaysFromRow(row) {
  const pieces = [row.title, row.intent, row.description, row.lead_source];
  const thread = Array.isArray(row.email_thread) ? row.email_thread : (Array.isArray(row.original_email) ? row.original_email : []);
  for (const m of thread.slice(-6)) pieces.push(m.subject, m.body, m.text, m.snippet);
  const text = pieces.filter(Boolean).join(' ').toLowerCase();
  if (!text) return null;
  if (new RegExp('\\b(asap|urgent|immediately|today|eod|end of day)\\b').test(text)) return 0;
  if (new RegExp('\\b(tomorrow|next day)\\b').test(text)) return 1;
  if (new RegExp('\\b(this week|by friday|by monday|next week)\\b').test(text)) return 7;
  const inMatch = text.match(new RegExp('\\b(?:in|within)\\s+(\\d{1,2})\\s*(day|days|week|weeks)\\b'));
  if (inMatch) return Number(inMatch[1]) * (inMatch[2].startsWith('week') ? 7 : 1);
  const byMatch = text.match(new RegExp('\\bby\\s+(\\d{1,2})\\/(\\d{1,2})(?:\\/(\\d{2,4}))?\\b'));
  if (byMatch) {
    const now = new Date();
    const year = byMatch[3] ? Number(byMatch[3].length === 2 ? '20' + byMatch[3] : byMatch[3]) : now.getFullYear();
    const due = new Date(year, Number(byMatch[1]) - 1, Number(byMatch[2]));
    if (Number.isFinite(due.getTime())) return Math.max(0, Math.ceil((due - now) / 86400000));
  }
  return null;
}
function V3CategoryFromRow(row) {
  const text = String((row.lead_source || '') + ' ' + (row.intent || '') + ' ' + (row.description || '')).toLowerCase();
  if (text.includes('intro')) return 'intro';
  if (text.includes('interview') || text.includes('podcast')) return 'interview';
  if (text.includes('partner') || text.includes('sponsor')) return 'partnership';
  if (['done','paid-out'].includes(V3NormalizeStage(row.list_id))) return 'paid';
  return 'collaboration';
}

function V3NextMoveFromRow(stage, name, owner, needsReply, row) {
  const first = String(name).split(' ')[0] || 'Lead';
  if (row.new_reply_at) return { who: owner, text: 'Reply to ' + first + ' - new message in thread', action: 'Reply' };
  if (row.draft_reply) return { who: owner, text: 'Review drafted reply for ' + first, action: 'Review' };
  return __v3NextMove(stage, name, owner, needsReply);
}

function V3ThreadFromRow(row, name, brand, stage) {
  const thread = Array.isArray(row.email_thread) ? row.email_thread : (Array.isArray(row.original_email) ? row.original_email : null);
  if (thread && thread.length) {
    return thread.slice(-8).map((m, i) => ({
      from: m.from || m.sender || (i % 2 ? name : 'UNALIGNED'),
      when: V3RelativeTime(m.date || m.timestamp || row.created_at),
      date: m.date || m.timestamp || row.created_at || null,
      subject: m.subject || row.title || (brand + ' conversation'),
      body: m.body || m.text || m.snippet || '',
    }));
  }
  return [{ from: name, when: V3RelativeTime(row.created_at), date: row.created_at || null, subject: row.title || (brand + ' lead'), body: row.description || row.intent || '' }];
}

function V3SenderForUser(user) {
  if (user === 'robert') return 'robert';
  if (user === 'sammy') return 'sam';
  return 'asher';
}

function V3SenderName(sender) {
  if (sender === 'robert') return 'Robert Scoble';
  if (sender === 'sam') return 'Sam Levin';
  return 'Asher';
}

function V3SubjectForLead(lead) {
  const last = lead?.thread?.[lead.thread.length - 1] || {};
  const base = lead?.draftReply?.subject || last.subject || ((lead?.brand || 'Lead') + ' conversation');
  return /^re:/i.test(base) ? base : 'Re: ' + base;
}

function V3DefaultCc(sender) {
  return V3InternalEmails(sender)
    .join(',');
}

function V3InternalEmails(excludeSender) {
  return ['scobleizer@gmail.com', 'UnalignedX@gmail.com', 'asherunaligned@gmail.com']
    .filter(email => {
      const normalized = email.toLowerCase();
      if (excludeSender === 'robert') return normalized !== 'scobleizer@gmail.com';
      if (excludeSender === 'sam') return normalized !== 'unalignedx@gmail.com';
      if (excludeSender === 'asher') return normalized !== 'asherunaligned@gmail.com';
      return true;
    });
}

function V3SenderEmails(sender) {
  if (sender === 'robert') return ['scobleizer@gmail.com'];
  if (sender === 'sam') return ['unalignedx@gmail.com'];
  return ['asherunaligned@gmail.com'];
}

function V3IsSelfRecipient(sender, to) {
  const recipients = String(to || '').toLowerCase();
  return V3SenderEmails(sender).some(email => recipients.includes(email));
}

function V3SplitEmails(value) {
  return String(value || '')
    .split(/[,\s;]+/)
    .map(email => email.trim())
    .filter(Boolean);
}

function V3UniqueEmails(values) {
  const seen = new Set();
  return values.filter(email => {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function V3ReplyRecipients(lead, sender, internalOnly = false) {
  if (internalOnly) return { to: V3InternalEmails(sender), cc: [] };
  const leadEmail = String(lead?.email || '').trim();
  const senderEmails = V3SenderEmails(sender).map(email => email.toLowerCase());
  const leadIsSender = senderEmails.includes(leadEmail.toLowerCase());
  const to = leadEmail && !leadIsSender ? [leadEmail] : [];
  const cc = V3InternalEmails(sender)
    .filter(email => email.toLowerCase() !== leadEmail.toLowerCase());
  return { to: V3UniqueEmails(to), cc: V3UniqueEmails(cc) };
}

async function V3SendLeadEmail({ lead, sender, to, cc, subject, body, attachPdf = false }) {
  const resp = await fetch('https://us-central1-unaligned-fc556.cloudfunctions.net/sendEmail', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to,
      subject,
      body,
      from: sender,
      threadId: lead?.gmailThreadId || null,
      cc: cc ?? V3DefaultCc(sender),
      attachPdf,
    }),
  });
  const data = await resp.json();
  if (!resp.ok || data.error) throw new Error(data.error || 'Send failed');
  return data;
}

Object.assign(window, { V3SenderForUser, V3SenderName, V3SubjectForLead, V3DefaultCc, V3InternalEmails, V3SenderEmails, V3IsSelfRecipient, V3SplitEmails, V3UniqueEmails, V3ReplyRecipients, V3SendLeadEmail });


// FLOW v3 — data with category labels matching UNALIGNED's INTERVIEW / COLLABORATION / PARTNERSHIP / INTRO tabs

// ─── UNALIGNED Tiers (from SINGLE TIER pricing sheet) ────────
const V3_TIERS = {
  1: { id: 1, price: 1195, name: 'Retweet',           short: 'RT',         items: ['1 retweet'] },
  2: { id: 2, price: 1895, name: 'Quote Repost',      short: 'QUOTE',      items: ['1 quote repost', "Robert's original quote (≤3 sentences)"] },
  3: { id: 3, price: 1995, name: 'Custom X Post',     short: 'CUSTOM X',   items: ['1 custom-written X post'] },
  4: { id: 4, price: 2495, name: 'Narrative Thread',  short: 'THREAD',     items: ['1 thread (1 + 2 attached)'] },
  5: { id: 5, price: 2995, name: 'Content Core',      short: 'CORE',       items: ['1 custom X post', '1 LinkedIn post', 'Newsletter feature'] },
  6: { id: 6, price: 3995, name: 'Growth Bundle',     short: 'GROWTH',     items: ['1 custom X post', '1 LinkedIn post', '1 retweet', 'Newsletter feature'] },
  7: { id: 7, price: 5995, name: 'Maximum Impact',    short: 'MAX',        items: ['2 custom X posts', '1 LinkedIn post', '2 retweets', 'Newsletter feature', 'Strategy sync'] },
};

const V3_DELIV_TYPES = {
  'retweet':    { label: 'Retweet',           icon: 'arrow_r', short: 'RT'        },
  'quote':      { label: 'Quote Repost',      icon: 'reply',   short: 'QUOTE'     },
  'custom-x':   { label: 'Custom X Post',     icon: 'send',    short: 'X POST'    },
  'thread':     { label: 'Narrative Thread',  icon: 'doc',     short: 'THREAD'    },
  'linkedin':   { label: 'LinkedIn Post',     icon: 'network', short: 'LINKEDIN'  },
  'newsletter': { label: 'Newsletter',        icon: 'mail',    short: 'NEWSLETTER'},
};

const V3_USERS = {
  asher:  { id: 'asher',  name: 'Asher',  role: 'Services', color: '#2f5fd6', initials: 'AW' },
  sammy:  { id: 'sammy',  name: 'Sammy',  role: 'Manager',  color: '#16894a', initials: 'SM' },
  robert: { id: 'robert', name: 'Robert', role: 'Creator',  color: '#a93268', initials: 'RW' },
};

// Stages — match the existing FLOW columns (NEW → PAID OUT)
const V3_STAGES = [
  { id: 'new',         name: 'New',          color: 'var(--st-new)',     short: 'NEW' },
  { id: 'first-touch', name: 'First touch',  color: 'var(--st-touch)',   short: 'FIRST TOUCH' },
  { id: 'engaged',     name: 'Engaged',      color: 'var(--st-engaged)', short: 'ENGAGED' },
  { id: 'rates-sent',  name: 'Rates sent',   color: 'var(--st-rates)',   short: 'RATES SENT' },
  { id: 'negotiating', name: 'Negotiating',  color: 'var(--st-nego)',    short: 'NEGOTIATING' },
  { id: 'invoice-sent',name: 'Invoice sent', color: 'var(--st-invoice)', short: 'INVOICE SENT' },
  { id: 'done',        name: 'Done',         color: 'var(--st-booked)',  short: 'DONE' },
  { id: 'paid-out',    name: 'Paid out',     color: 'var(--st-paid)',    short: 'PAID OUT' },
  { id: 'trash',       name: 'Trash',        color: 'var(--text-4)',     short: 'TRASH' },
];
const V3_STAGE_BY_ID = Object.fromEntries(V3_STAGES.map(s => [s.id, s]));
const V3_ACTIVE_STAGE_IDS = ['new','first-touch','engaged','rates-sent','negotiating','invoice-sent','done','paid-out'];
const V3_TRASH_STAGE_IDS = ['trash'];

const V3_CATEGORIES = ['interview', 'collaboration', 'partnership', 'intro', 'paid'];

// 30+ leads with stage + category + needs-reply status
// [contact, role, brand, stage, value, owner, category, daysIn, lastTouch, needsReply, approve, deliverables, emailDeadline?, emailDeadlineNote?]
// emailDeadline: days from today the lead has explicitly asked for a reply / decision in the email thread.
//                Negative = past their stated deadline. These bubble to a "Priority" bucket at the top.
const V3_RAW = [
  // NEW
  ['Tomás Quintero',     'Founder',          'Ember Kitchen',          'new',         null, 'sammy', 'intro',       0,  '2h',  true,  null,  '—'],
  ['Bella Marquez',      'PR Lead',          'Halo Optics',            'new',         null, 'sammy', 'interview',   0,  '4h',  true,  null,  '—'],
  ['Wren Costa',         'Brand mgr',        'Linden Wellness',        'new',         null, 'sammy', 'collaboration', 1,'18h', true,  null,  '—'],
  ['Ines Tavares',       'Founder',          'Cardinal Tools',         'new',         null, 'sammy', 'intro',       2,  '1d',  false, null,  '—'],
  // FIRST TOUCH
  ['Devon Ortiz',        'Founder',          'Northcurrent Outfit',    'first-touch', 1895, 'sammy', 'collaboration', 2,'1d',  true,  null,  'Tier 2 · Quote Repost'],
  ['Rosa Pellegrini',    'Founder',          'Mira Home',              'first-touch', 1995, 'sammy', 'collaboration', 1,'20h', true,  null,  'Tier 3 · Custom X Post'],
  ['Naomi Friedman',     'Underwriting',     'Tideglass Insurance',    'first-touch', 2495, 'sammy', 'partnership', 3,  '2d',  false, null,  'Tier 4 · Narrative Thread'],
  ['Owen Castellanos',   'Head of Brokerage','Veridian Realty',        'first-touch', null, 'sammy', 'intro',       2,  '2d',  false, null,  '—'],
  ['Mia Kuznetsova',     'CMO',              'Pinpoint Watches',       'first-touch', 2995, 'asher', 'partnership', 4,  '3d',  false, null,  'Tier 5 · Content Core'],
  // ENGAGED
  ['Jordan Hale',        'Marketing Dir',    'Pace Hydration',         'engaged',     2995, 'sammy', 'collaboration', 1,'5h',  true,  null,  'Tier 5 · Content Core'],
  ['Henry Voss',         'Founder',          'Beacon Travel',          'engaged',     1995, 'sammy', 'collaboration', 2,'8h',  true,  null,  'Tier 3 · Custom X Post'],
  ['Aria Lindqvist',     'Founder',          'Solstice Energy',        'engaged',     3995, 'sammy', 'partnership', 1,  '12h', true,  null,  'Tier 6 · Growth Bundle', 3, 'Wants to lock by Friday — launch tied to Earth Day'],
  ['Theo Nakamura',      'Buyer',            'Kindred Foods',          'engaged',     1895, 'sammy', 'collaboration', 4,'2d',  false, 'sam', 'Tier 2 · Quote Repost'],
  ['Caleb Sundgren',     'Influencer mgr',   'Forge Athletics',        'engaged',     2495, 'sammy', 'collaboration', 3,'1d',  false, null,  'Tier 4 · Narrative Thread'],
  // RATES SENT
  ['Priya Naidu',        'Influencer mgr',   'Glow Foundry',           'rates-sent',  3995, 'asher', 'collaboration', 4,'3d',  false, 'asher','Tier 6 · Growth Bundle'],
  ['Adrienne Park',      'CMO',              'Vault Fitness',          'rates-sent',  5995, 'asher', 'partnership', 6,  '4d',  false, null,  'Tier 7 · Maximum Impact'],
  ['Clara Sundgren',     'Owner',            'Halo Optics',            'rates-sent',  1995, 'asher', 'collaboration', 8,'6d',  false, null,  'Tier 3 · Custom X Post'],
  ['Marcus Wei',         'Brand strategy',   'Trailmark Coffee',       'rates-sent',  2995, 'asher', 'partnership', 5,  '4d',  false, null,  'Tier 5 · Content Core'],
  ['Felix Achebe',       'CMO',              'Northwind Bio',          'rates-sent',  5995, 'asher', 'partnership', 7,  '5d',  false, null,  'Tier 7 · Maximum Impact'],
  // NEGOTIATING
  ['Maria Castellanos',  'Brand mgr',        'Salt + Cedar',           'negotiating', 2995, 'asher', 'collaboration', 3,'2h',  true,  null,  'Tier 5 · Content Core', 1, 'Needs revised quote by end of day tomorrow'],
  ['Eli Brennan',        'Marketing lead',   'Cardinal Tools',         'negotiating', 3995, 'asher', 'partnership', 2,  '4h',  true,  'asher','Tier 6 · Growth Bundle'],
  ['Vera Hossini',       'Founder',          'Vesper Studio',          'negotiating', 2495, 'asher', 'collaboration', 4,'1d',  false, null,  'Tier 4 · Narrative Thread'],
  // INVOICE SENT
  ['Wes Tanaka',         'Athlete liaison',  'Forge Athletics',        'invoice-sent', 5995,'sammy','partnership',  3,  '2d',  false, null,  'Tier 7 · Maximum Impact'],
  ['Lia Berenstein',     'Brand partners',   'Trailmark Coffee',       'invoice-sent', 3995,'sammy','collaboration',1,  '1d',  false, null,  'Tier 6 · Growth Bundle'],
  // BOOKED / DONE (Robert needs to post)
  ['Sam Whitaker',       'Founder',          'Trailmark Coffee',       'done',        2995, 'robert','collaboration', 2,'6h',  false, null,  'Tier 5 · Content Core'],
  ['Nina Akande',        'Founder',          'Halo Optics',            'done',        3995, 'robert','collaboration', 5,'2d',  false, null,  'Tier 6 · Growth Bundle', 2, 'Campaign aligned with their product launch — needs to go live this week'],
  // PAID OUT
  ['Keith Newman',       'Marketing dir',    'FSO Venture',            'paid-out',    2995, null,    'paid',        15, '2w',  false, null,  'Tier 5 · Content Core'],
  ['Ryan Teknium',       'Founder',          'Nous Research',          'paid-out',    5995, null,    'paid',        18, '3w',  false, null,  'Tier 7 · Maximum Impact'],
];

const V3_LEADS = V3_RAW.map((row, i) => {
  const [contact, role, brand, stage, value, owner, category, daysIn, lastTouch, needsReply, approve, deliverables, emailDeadline, emailDeadlineNote] = row;
  return {
    id: 'F-' + String(2401 + i).padStart(4, '0'),
    contactName: contact,
    contactRole: role,
    brand,
    stage,
    value,
    deliverables,
    ownerId: owner,
    category,
    daysInStage: daysIn,
    lastTouch,
    needsReply,
    approve,
    emailDeadline: emailDeadline ?? null,
    emailDeadlineNote: emailDeadlineNote ?? null,
    color: __v3Color(contact),
    email: contact.toLowerCase().replace(/[^a-z]/g, '.').replace(/\.+/g, '.').replace(/^\.|\.$/g, '') + '@' + brand.toLowerCase().replace(/[^a-z]/g, '') + '.com',
    source: ['Gmail','Outbound','Inbound','Agency','Referral','LinkedIn','Form'][i % 7],
    nextMove: __v3NextMove(stage, contact, owner, needsReply),
    timeline: __v3Timeline(stage, daysIn, contact, brand),
    thread: __v3Thread(contact, brand, stage),
    progress: V3_ACTIVE_STAGE_IDS.indexOf(stage),
    unread: needsReply && i % 3 !== 0,
  };
});

function __v3Color(seed) {
  const palette = ['#2f5fd6','#d56a35','#c43d2b','#16894a','#6b46c1','#b48117','#a93268','#0e8aab'];
  let h = 0; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 9999;
  return palette[h % palette.length];
}

function __v3NextMove(stage, contact, owner, needsReply) {
  const first = contact.split(' ')[0];
  const map = {
    'new':          { who: 'sammy',  text: `Open & qualify — first response to ${first}`,         action: 'Reply' },
    'first-touch':  { who: needsReply ? 'sammy' : null, text: needsReply ? `Send follow-up — ${first} hasn't replied` : `Waiting on ${first} to reply`, action: needsReply ? 'Nudge' : '' },
    'engaged':      { who: needsReply ? 'sammy' : null, text: needsReply ? `Reply — discovery questions, confirm scope` : `Awaiting ${first}'s reply`, action: 'Reply' },
    'rates-sent':   { who: null,     text: `Waiting on ${first} — rates sent`,                    action: 'Nudge' },
    'negotiating':  { who: needsReply ? 'asher' : null, text: needsReply ? `Send revised package — ${first} asked about usage` : `Awaiting ${first}'s reply on revised terms`, action: 'Send' },
    'invoice-sent': { who: null,     text: `Awaiting payment — invoice sent`,                     action: '' },
    'done':         { who: 'robert', text: `Record & post deliverables`,                          action: 'Post' },
    'paid-out':     { who: null,     text: `Done — closed and paid`,                              action: '' },
  };
  return map[stage] || { who: null, text: '—', action: '' };
}

function __v3Timeline(stage, days, contact, brand) {
  const ids = V3_ACTIVE_STAGE_IDS;
  const idx = ids.indexOf(stage);
  return ids.map((s, i) => {
    const def = V3_STAGE_BY_ID[s];
    const status = i < idx ? 'done' : i === idx ? 'current' : 'pending';
    return {
      stageId: s, name: def.name, status,
      when: i < idx ? `${(idx - i) + days}d ago` : i === idx ? `${days}d in stage` : '',
      note: i <= idx ? __v3StageNote(s, contact, brand) : '',
    };
  });
}

function __v3StageNote(stage, contact, brand) {
  const first = contact.split(' ')[0];
  return ({
    'new':          `${first} from ${brand} reached out`,
    'first-touch':  `Outreach sent`,
    'engaged':      `${first} replied — discussing scope`,
    'rates-sent':   `Rate card delivered`,
    'negotiating':  `Discussing usage rights, mix`,
    'invoice-sent': `Invoice issued`,
    'done':         `Content live`,
    'paid-out':     `Payment received`,
  })[stage] || '';
}

function __v3Thread(contact, brand, stage) {
  const first = contact.split(' ')[0];
  const out = [{
    from: 'Sammy', when: '6d ago',
    subject: `Robert × ${brand} — collab opportunity`,
    body: `Hi ${first},\n\nRobert's been a fan of ${brand} and we'd love to put a collaboration together. Rundown of his recent numbers + past partnerships below — let me know if it resonates and we can scope something out.\n\nBest,\nSammy`,
  }];
  if (!['new','first-touch'].includes(stage)) {
    out.push({
      from: first, when: '4d ago',
      subject: `RE: Robert × ${brand}`,
      body: `Hi Sammy,\n\nThanks for reaching out — Robert is exactly the voice we've been after. Planning a campaign for next month with budget for two creators. Can you share his rate card and standard deliverable mix?\n\nBest,\n${first}`,
    });
  }
  if (['rates-sent','negotiating','invoice-sent','done','paid-out'].includes(stage)) {
    out.push({
      from: 'Asher', when: '3d ago',
      subject: `RE: Robert × ${brand}`,
      body: `Hi ${first},\n\nGreat to hear. Where Robert lands for this scope:\n\n• 1× Reel (90s, 30d usage): $3,200\n• Story set add-on: $600\n• TikTok cross-post: $400\n\nHappy to bundle. Posting windows next month: Tue/Thu after 4pm PT.\n\nThanks,\nAsher`,
    });
  }
  if (['negotiating','invoice-sent','done','paid-out'].includes(stage)) {
    out.push({
      from: first, when: '2d ago',
      subject: `RE: Robert × ${brand}`,
      body: `Hi Asher,\n\nWorks. Can we bump usage to 60 days, and add first refusal for a Q1 follow-up Reel? Otherwise looks good.\n\n${first}`,
    });
  }
  return out;
}

// ─── Briefs — attached to closed (done) and shipped (invoice-sent) deals ───
// Each brief is structured around the UNALIGNED tier deliverables. Asher
// reviews/approves; Robert executes. Status flow:
//   draft → awaiting-approval → ready → in-production → shipped
const V3_BRIEFS = {
  // Sam Whitaker · Trailmark Coffee · Tier 5 Content Core · $2,995
  // READY — Asher already approved. Robert needs to post.
  'F-2425': {
    tier: 5,
    status: 'ready',
    approvedBy: 'asher',
    approvedAt: '4h ago',
    deadlineDays: 2,
    postingWindow: 'Tue or Thu, 4–7pm PT',
    summary: "Trailmark is small-batch single-origin coffee. They want the angle of 'coffee as a thinking ritual' — not a discount push. Sam loved the morning-rhythm story.",
    notes: "Keep it human. No discount codes. Don't compare to specific competitors.",
    mustInclude: ['Tag @trailmarkcoffee', 'Mention "single-origin"', 'Link trailmarkcoffee.com'],
    mustAvoid: ['Discount codes', 'Naming competitors', 'Generic "best coffee" language'],
    deliverables: [
      {
        id: 'd1',
        type: 'custom-x',
        status: 'ready',
        title: 'Custom X Post',
        hook: 'Most coffee marketing is about caffeine. Trailmark is about the 10 minutes you spend with it.',
        beats: [
          'Open with the contrast: most coffee marketing screams caffeine',
          'Trailmark is the opposite — quiet, ritual, intentional',
          'Personal: switched to their single-origin a month ago',
          'Close with the brand mechanic — small-batch, roasted to order',
        ],
        draftText: "Most coffee marketing screams caffeine.\n\nTrailmark is the opposite — it's about the 10 quiet minutes you spend with it.\n\nSwitched to their single-origin pour-over a month ago and my mornings haven't been the same.\n\nSmall-batch roasted to order, ships next day.\n\n@trailmarkcoffee · trailmarkcoffee.com",
        media: null,
        postedAt: null,
        postedUrl: null,
      },
      {
        id: 'd2',
        type: 'linkedin',
        status: 'ready',
        title: 'LinkedIn Post',
        angle: 'How rituals shape company culture — using Trailmark as the lens. High-authority, leadership audience.',
        draftText: "I've been thinking about how the smallest rituals shape company culture.\n\nFor me it's coffee. Not the caffeine — the 10 minutes before the first meeting where my brain catches up to my day.\n\nA month ago I switched to Trailmark's single-origin pour-over. Small change. Big impact on how I show up.\n\nThe team noticed. Now we keep a Trailmark setup in the office and the morning standup runs differently.\n\nRituals → habits → culture. The leverage is in the small things.\n\n#leadership #remoteculture #habits",
        postedAt: null,
        postedUrl: null,
      },
      {
        id: 'd3',
        type: 'newsletter',
        status: 'queued',
        title: 'Newsletter Feature',
        slot: 'Next Tuesday · Brand Spotlight section',
        blurb: "Trailmark Coffee is what happens when a small-batch roaster takes the supply chain personally. Single-origin, roasted-to-order, shipped next day. Their pour-over has reshaped my mornings.",
        ctaUrl: 'https://trailmarkcoffee.com',
        scheduledFor: 'Tue 9am PT',
      },
    ],
  },

  // Nina Akande · Halo Optics · Tier 6 Growth Bundle · $3,995
  // AWAITING APPROVAL — Sammy drafted, Asher needs to review.
  'F-2426': {
    tier: 6,
    status: 'awaiting-approval',
    draftedBy: 'sammy',
    draftedAt: '1d ago',
    deadlineDays: 5,
    postingWindow: 'Wed or Fri, 12–4pm PT',
    summary: "Halo Optics is a direct-to-consumer eyewear brand pushing their new 'reading-glasses-for-screens' category. Nina wants Robert to talk about screen fatigue as a founder problem.",
    notes: "Lean into the founder-fatigue angle. The product matters less than the problem framing.",
    mustInclude: ['Tag @halooptics', 'Link halo.com/screens', 'Mention "screen blue-light"'],
    mustAvoid: ['Health claims (FTC)', 'Naming Warby Parker'],
    deliverables: [
      {
        id: 'd1',
        type: 'custom-x',
        status: 'draft',
        title: 'Custom X Post',
        hook: "I'm a founder. My eyes work 14 hours a day. I should've thought about them earlier.",
        beats: [
          'Founder eye-strain as the universal-but-unspoken problem',
          'Screen blue-light at high doses — what changed for me',
          'Halo Optics — the only screen-glasses I don\'t feel dorky wearing',
        ],
        draftText: "I'm a founder. My eyes work 14 hours a day.\n\nI should've thought about them earlier.\n\nStarted wearing @halooptics screen blue-light glasses two weeks ago. Headaches I'd accepted as normal — gone by Wednesday.\n\nThe only screen-glasses I don't feel dorky wearing.\n\nhalo.com/screens",
        media: null,
        postedAt: null,
        postedUrl: null,
      },
      {
        id: 'd2',
        type: 'linkedin',
        status: 'draft',
        title: 'LinkedIn Post',
        angle: 'Founder health as a leadership issue. Screen fatigue as cumulative debt.',
        draftText: "Founder health is a leadership issue.\n\nI accepted daily headaches as the cost of running a company. For years.\n\nTwo weeks ago I started wearing Halo Optics screen glasses — blue-light filtering, not a gimmick.\n\nThe headaches I'd written off as normal? Gone by Wednesday.\n\nYou can't lead a team well if your body is sending you signals you keep ignoring.\n\nhalo.com/screens",
        postedAt: null,
        postedUrl: null,
      },
      {
        id: 'd3',
        type: 'retweet',
        status: 'draft',
        title: 'Retweet',
        sourceUrl: 'https://x.com/halooptics/status/1857234567890123456',
        sourcePreview: '@halooptics: "Why we filter blue light in the 415–455nm range — and why most brands don\'t bother." (3-post thread)',
      },
      {
        id: 'd4',
        type: 'newsletter',
        status: 'draft',
        title: 'Newsletter Feature',
        slot: 'Two weeks out · Brand Spotlight',
        blurb: "Halo Optics is what happens when a founder-built eyewear company decides screen-fatigue is the real category. Their blue-light readers are the first pair I haven't taken off after the third hour.",
        ctaUrl: 'https://halo.com/screens',
        scheduledFor: 'Tue 9am PT (TBD)',
      },
    ],
  },

  // Wes Tanaka · Forge Athletics · Tier 7 · already shipped
  'F-2423': {
    tier: 7,
    status: 'shipped',
    approvedBy: 'asher',
    approvedAt: '5d ago',
    deadlineDays: -3,
    postingWindow: 'Mon–Wed, prime hours',
    summary: 'Forge Athletics campaign — fully shipped, awaiting payment.',
    notes: '',
    mustInclude: [], mustAvoid: [],
    deliverables: [
      { id: 'd1', type: 'custom-x',   status: 'shipped', title: 'Custom X Post #1', draftText: '[Shipped — see post]', postedAt: '3d ago', postedUrl: 'https://x.com/Scobleizer/status/...' },
      { id: 'd2', type: 'custom-x',   status: 'shipped', title: 'Custom X Post #2', draftText: '[Shipped]',           postedAt: '2d ago', postedUrl: 'https://x.com/Scobleizer/status/...' },
      { id: 'd3', type: 'linkedin',   status: 'shipped', title: 'LinkedIn Post',    draftText: '[Shipped]',           postedAt: '2d ago', postedUrl: 'https://linkedin.com/posts/...' },
      { id: 'd4', type: 'retweet',    status: 'shipped', title: 'Retweet #1',       sourceUrl: 'https://x.com/forgeathletics/status/...', postedAt: '3d ago' },
      { id: 'd5', type: 'retweet',    status: 'shipped', title: 'Retweet #2',       sourceUrl: 'https://x.com/forgeathletics/status/...', postedAt: '2d ago' },
      { id: 'd6', type: 'newsletter', status: 'shipped', title: 'Newsletter',       slot: 'Last Tuesday', postedAt: '4d ago' },
    ],
  },

  // Lia Berenstein · Trailmark Coffee · Tier 6 · already shipped
  'F-2424': {
    tier: 6,
    status: 'shipped',
    approvedBy: 'asher',
    approvedAt: '3d ago',
    deadlineDays: -1,
    postingWindow: 'Tue or Thu, 4–7pm PT',
    summary: 'Trailmark Coffee follow-on (Lia\'s second campaign) — fully shipped.',
    notes: '',
    mustInclude: [], mustAvoid: [],
    deliverables: [
      { id: 'd1', type: 'custom-x',   status: 'shipped', title: 'Custom X Post', draftText: '[Shipped]', postedAt: '1d ago', postedUrl: 'https://x.com/Scobleizer/status/...' },
      { id: 'd2', type: 'linkedin',   status: 'shipped', title: 'LinkedIn Post', draftText: '[Shipped]', postedAt: '1d ago', postedUrl: 'https://linkedin.com/posts/...' },
      { id: 'd3', type: 'retweet',    status: 'shipped', title: 'Retweet',       sourceUrl: 'https://x.com/trailmarkcoffee/status/...', postedAt: '1d ago' },
      { id: 'd4', type: 'newsletter', status: 'shipped', title: 'Newsletter',    slot: 'Last week', postedAt: '2d ago' },
    ],
  },
};

// Brief status meta
const V3_BRIEF_STATUSES = {
  'draft':              { label: 'Draft',              tone: 'neutral', short: 'DRAFT' },
  'awaiting-approval':  { label: 'Awaiting approval',  tone: 'warn',    short: 'AWAITING APPROVAL' },
  'ready':              { label: 'Ready for Robert',   tone: 'go',      short: 'READY' },
  'in-production':      { label: 'In production',      tone: 'accent',  short: 'IN PRODUCTION' },
  'shipped':            { label: 'Shipped',            tone: 'done',    short: 'SHIPPED' },
};

// Attach briefs to leads (mutable so check-off can mutate in-session)
for (const lead of V3_LEADS) {
  if (V3_BRIEFS[lead.id]) lead.brief = V3_BRIEFS[lead.id];
}

// Aggregates
function v3FlowCounts() {
  const leads = window.V3?.LEADS || V3_LEADS;
  return V3_ACTIVE_STAGE_IDS.map(s => ({
    id: s,
    name: V3_STAGE_BY_ID[s].name,
    short: V3_STAGE_BY_ID[s].short,
    color: V3_STAGE_BY_ID[s].color,
    count: leads.filter(l => l.stage === s).length,
    value: leads.filter(l => l.stage === s).reduce((sum, l) => sum + (l.value || 0), 0),
  }));
}

function v3Greeting() {
  const h = new Date().getHours();
  if (h < 5)  return 'Late night';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

// ─── Task derivation ─────────────────────────────────────────
// Turns lead state into concrete, dated tasks for the Today view.
// Each task has a `dueIn` (days from today; negative = past due, 0 = today,
// 1 = tomorrow, >1 = upcoming) and a `type` driving icon + color.

const V3_TASK_TYPES = {
  qualify: { label: 'New lead',     icon: 'spark',   tone: 'new'     },
  reply:   { label: 'Reply',        icon: 'reply',   tone: 'reply'   },
  followup:{ label: 'Follow up',    icon: 'send',    tone: 'followup'},
  rates:   { label: 'Send rates',   icon: 'invoice', tone: 'rates'   },
  nudge:   { label: 'Nudge',        icon: 'bolt',    tone: 'nudge'   },
  respond: { label: 'Respond',      icon: 'reply',   tone: 'reply'   },
  invoice: { label: 'Send invoice', icon: 'invoice', tone: 'invoice' },
  payment: { label: 'Confirm $',    icon: 'check',   tone: 'payment' },
  post:    { label: 'Post content', icon: 'send',    tone: 'post'    },
  live:    { label: 'Live',         icon: 'spark',   tone: 'live'    },
  approve: { label: 'Approve brief',icon: 'check',   tone: 'approve' },
};

function v3DeriveTasks(user) {
  const leads = window.V3?.LEADS || V3_LEADS;
  const tasks = [];
  const first = n => n.split(' ')[0];
  const moneyTag = v => v ? '$' + v.toLocaleString() : '';

  for (const lead of leads) {
    if (lead.stage === 'paid-out') continue;
    const ownsThis = lead.ownerId === user;

    // ─── Robert (creator): post + live tracking ───
    if (user === 'robert') {
      if (lead.stage === 'done') {
        const brief = lead.brief;
        // Only "ready" or "in-production" briefs are actionable for Robert.
        // Awaiting-approval = Asher's task, not Robert's.
        const briefReady = brief && (brief.status === 'ready' || brief.status === 'in-production');
        if (briefReady) {
          const dueIn = (brief.deadlineDays != null) ? brief.deadlineDays : (3 - lead.daysInStage);
          // Count un-shipped deliverables for the subtitle
          const remaining = brief.deliverables.filter(d => d.status !== 'shipped').length;
          tasks.push({
            id: lead.id + ':post', leadId: lead.id, type: 'post',
            title: `Post deliverables · ${lead.brand}`,
            sub: `${V3_TIERS[brief.tier]?.name || 'Tier ' + brief.tier} · ${remaining} item${remaining === 1 ? '' : 's'} to post`,
            dueIn, value: lead.value, lead,
            briefStatus: brief.status,
            action: 'open-brief',
          });
        } else if (brief && brief.status === 'awaiting-approval') {
          // Surface to Robert as informational — pipeline visibility, not actionable.
          tasks.push({
            id: lead.id + ':pending', leadId: lead.id, type: 'post',
            title: `${lead.brand} — brief awaiting Asher's approval`,
            sub: `${V3_TIERS[brief.tier]?.name || 'Tier ' + brief.tier} · drafted ${brief.draftedAt} by ${brief.draftedBy}`,
            dueIn: (brief.deadlineDays || 5) + 1,
            value: lead.value, lead,
            briefStatus: brief.status,
            kind: 'info',
          });
        }
      }
      if (lead.stage === 'invoice-sent') {
        const dueIn = 14 - lead.daysInStage;
        tasks.push({
          id: lead.id + ':live', leadId: lead.id, type: 'live',
          title: `${lead.brand} live · awaiting payment`,
          sub:   `${(V3_TIERS[lead.brief?.tier]?.name) || lead.deliverables} · invoice out ${lead.daysInStage}d`,
          dueIn, value: lead.value, lead, kind: 'info',
        });
      }
      continue;
    }

    // ─── Sammy + Asher: sales pipeline tasks ───
    // Asher sees everything (founder); Sammy sees what he owns.
    if (!ownsThis && user !== 'asher') continue;

    if (lead.stage === 'new') {
      tasks.push({
        id: lead.id + ':qualify', leadId: lead.id, type: 'qualify',
        title: `Qualify ${first(lead.contactName)} · ${lead.brand}`,
        sub:   `New inbound · came in ${lead.lastTouch} ago`,
        dueIn: lead.daysInStage > 0 ? -lead.daysInStage : 0,
        value: null, lead,
      });
    }
    if (lead.stage === 'first-touch' && lead.needsReply) {
      tasks.push({
        id: lead.id + ':followup', leadId: lead.id, type: 'followup',
        title: `Follow up with ${first(lead.contactName)}`,
        sub:   `${lead.brand} · outreach sent ${lead.daysInStage}d ago, no reply`,
        dueIn: 3 - lead.daysInStage, value: lead.value, lead,
      });
    }
    if (lead.stage === 'engaged' && lead.needsReply) {
      tasks.push({
        id: lead.id + ':reply', leadId: lead.id, type: 'reply',
        title: `Reply to ${first(lead.contactName)} re: scope`,
        sub:   `${lead.brand} · discovery — ${lead.deliverables}`,
        dueIn: Math.max(-3, 1 - lead.daysInStage), value: lead.value, lead,
      });
    }
    if (lead.stage === 'engaged' && !lead.needsReply) {
      tasks.push({
        id: lead.id + ':rates', leadId: lead.id, type: 'rates',
        title: `Send rates to ${first(lead.contactName)}`,
        sub:   `${lead.brand} · scope locked · ${lead.deliverables}`,
        dueIn: 1, value: lead.value, lead,
      });
    }
    if (lead.stage === 'rates-sent') {
      const dueIn = 4 - lead.daysInStage;
      tasks.push({
        id: lead.id + ':nudge', leadId: lead.id, type: 'nudge',
        title: `Nudge ${first(lead.contactName)} on rates`,
        sub:   `${lead.brand} · ${moneyTag(lead.value)} · sent ${lead.daysInStage}d ago`,
        dueIn, value: lead.value, lead,
      });
    }
    if (lead.stage === 'negotiating' && lead.needsReply) {
      tasks.push({
        id: lead.id + ':respond', leadId: lead.id, type: 'respond',
        title: `Respond to ${first(lead.contactName)}'s counter`,
        sub:   `${lead.brand} · revised terms requested`,
        dueIn: Math.max(-2, 1 - lead.daysInStage), value: lead.value, lead,
      });
    }
    if (lead.stage === 'done') {
      tasks.push({
        id: lead.id + ':invoice', leadId: lead.id, type: 'invoice',
        title: `Send invoice · ${lead.brand}`,
        sub:   `${lead.deliverables} · with ${first(lead.contactName)} · ${moneyTag(lead.value)}`,
        dueIn: 2 - lead.daysInStage, value: lead.value, lead,
      });
      // Asher-only: approve brief if it's awaiting approval.
      if (user === 'asher' && lead.brief && lead.brief.status === 'awaiting-approval') {
        tasks.push({
          id: lead.id + ':approve-brief', leadId: lead.id, type: 'approve',
          title: `Approve brief · ${lead.brand}`,
          sub:   `${V3_TIERS[lead.brief.tier]?.name || 'Tier ' + lead.brief.tier} · drafted by ${lead.brief.draftedBy} ${lead.brief.draftedAt}`,
          dueIn: Math.max(0, (lead.brief.deadlineDays || 5) - 2),
          value: lead.value, lead,
          briefStatus: lead.brief.status,
          action: 'open-brief',
        });
      }
    }
    if (lead.stage === 'invoice-sent') {
      const dueIn = 14 - lead.daysInStage;
      tasks.push({
        id: lead.id + ':payment', leadId: lead.id, type: 'payment',
        title: `Confirm payment · ${lead.brand}`,
        sub:   `Invoice ${moneyTag(lead.value)} · out ${lead.daysInStage}d`,
        dueIn, value: lead.value, lead,
      });
    }
  }

  // Apply email-deadline overrides to all derived tasks (these are
  // priority items — the lead said in-thread when they need a response)
  for (const t of tasks) {
    const lead = t.lead;
    if (lead && lead.emailDeadline != null) {
      t.urgent = true;
      t.emailDeadline = lead.emailDeadline;
      t.emailDeadlineNote = lead.emailDeadlineNote;
      // Override dueIn to the email-stated deadline (only if tighter than the default).
      if (lead.emailDeadline < t.dueIn) t.dueIn = lead.emailDeadline;
    }
  }

  return tasks;
}

function v3BucketTasks(tasks) {
  // Visible window: 14 days back (recent past-due) to 28 days forward (next 4 weeks).
  // Beyond that — hide ("the shit that's 40+ days old, fuck it").
  const PAST_WINDOW = 14;     // show past-due if <= 14 days late
  const FUTURE_WINDOW = 28;   // show upcoming if <= 28 days out

  const buckets = {
    urgent:   [],   // email-specified deadlines — pinned at top
    today:    [],
    tomorrow: [],
    thisWeek: [],   // 2–7 days out
    upcoming: [],   // 8–28 days out
    past:     [],   // -14 to -1 days
  };
  for (const t of tasks) {
    if (t.dueIn < -PAST_WINDOW)  continue; // ancient — drop
    if (t.dueIn >  FUTURE_WINDOW) continue; // too far out — drop

    if (t.urgent) { buckets.urgent.push(t); continue; }
    if (t.dueIn < 0)        buckets.past.push(t);
    else if (t.dueIn === 0) buckets.today.push(t);
    else if (t.dueIn === 1) buckets.tomorrow.push(t);
    else if (t.dueIn <= 7)  buckets.thisWeek.push(t);
    else                    buckets.upcoming.push(t);
  }
  // Sorts: urgent by tightest first, then $; date buckets soonest-first; past by least-overdue first
  buckets.urgent.sort((a, b) => (a.dueIn - b.dueIn) || ((b.value || 0) - (a.value || 0)));
  buckets.today.sort((a, b) => (b.value || 0) - (a.value || 0));
  buckets.tomorrow.sort((a, b) => (b.value || 0) - (a.value || 0));
  buckets.thisWeek.sort((a, b) => a.dueIn - b.dueIn);
  buckets.upcoming.sort((a, b) => a.dueIn - b.dueIn);
  buckets.past.sort((a, b) => b.dueIn - a.dueIn); // least-overdue first (most recent past-due at top of the past bucket)
  return buckets;
}

window.V3 = { USERS: V3_USERS, STAGES: V3_STAGES, STAGE_BY_ID: V3_STAGE_BY_ID, ACTIVE_STAGE_IDS: V3_ACTIVE_STAGE_IDS, TRASH_STAGE_IDS: V3_TRASH_STAGE_IDS, LEADS: V3_LEADS, TIERS: V3_TIERS, DELIV_TYPES: V3_DELIV_TYPES, BRIEF_STATUSES: V3_BRIEF_STATUSES, TASK_TYPES: V3_TASK_TYPES, flowCounts: v3FlowCounts, greeting: v3Greeting, deriveTasks: v3DeriveTasks, bucketTasks: v3BucketTasks };

V3LoadSupabaseLeads().then(leads => {
  window.V3.LEADS = leads;
  window.dispatchEvent(new CustomEvent('v3:leads-loaded', { detail: { leads } }));
}).catch(err => console.error('Supabase load failed:', err));
