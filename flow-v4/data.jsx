// FLOW v4 — live Supabase/email helpers

const V3_SUPABASE_URL = "https://hbnpwphxjurvtydezwgh.supabase.co";
const V3_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhibnB3cGh4anVydnR5ZGV6d2doIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MTQ1MzIsImV4cCI6MjA5MDk5MDUzMn0.p5E48__GlGqjC17Z28q8fYFK-qV8CmiidYIP02vGe4s";
const V3_MIN_VISIBLE_TS = Date.parse('2026-01-01T00:00:00Z');

async function V3LoadXDmIntakeRows() {
  try {
    const res = await fetch('flow-v4/assets/x_dm_daily_intake.json?v=20260618-x-group-cleanup-1');
    if (!res.ok) throw new Error('X intake ' + res.status);
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    console.warn('Failed to load X DM intake', e);
    return [];
  }
}

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
  const internalEmails = new Set(['scobleizer@gmail.com', 'unalignedx@gmail.com', 'asherunaligned@gmail.com']);
  const canonical = new Map();

  const scoreRow = (row) => {
    const email = V3ExtractEmail(row.email);
    const updated = Date.parse(row.updated_at || row.moved_at || row.created_at || '') || 0;
    const created = Date.parse(row.created_at || row.moved_at || row.updated_at || '') || 0;
    let score = 0;
    if (email && !internalEmails.has(email)) score += 1000;
    if (row.contact_name) score += 100;
    if (row.title) score += 10;
    score += Math.max(updated, created) / 1e13;
    score += Number(row.id || 0) / 1e9;
    return score;
  };

  for (const row of rows) {
    const key = row.gmail_thread_id ? `thread:${row.gmail_thread_id}` : `row:${row.id}`;
    const prev = canonical.get(key);
    if (!prev || scoreRow(row) > scoreRow(prev)) canonical.set(key, row);
  }

  const leads = V3FilterVisibleLeads([...canonical.values()].map(V3NormalizeSupabaseLead));
  const xRows = await V3LoadXDmIntakeRows();
  leads.push(...V3FilterVisibleLeads(V3NormalizeXDmLeads(xRows, leads)));
  if (!leads.some(lead => String(lead.email || '').trim().toLowerCase() === 'jocelyn.cruz@hockeystick.io')) {
    leads.push(V3HockeystickFallbackLead());
  }
  return V3FilterVisibleLeads(leads);
}

function V3NormalizeEmailLeadStage(email, rawStage) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (normalizedEmail === 'jocelyn.cruz@hockeystick.io') {
    return ['done', 'paid-out'].includes(rawStage) ? rawStage : 'paid-out';
  }
  return rawStage;
}

function V3IsRobertBriefRow(row) {
  const briefType = String(row?.brief_type || row?.briefType || '').trim().toLowerCase();
  const leadSource = String(row?.lead_source || row?.leadSource || '').trim().toLowerCase();
  const listId = String(row?.list_id || row?.listId || '').trim().toLowerCase();
  return briefType === 'official-posting' || leadSource === 'official-posting' || listId === 'briefs';
}

function V3BriefList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(item => String(item));
  if (typeof value === 'object') return Object.values(value).filter(Boolean).map(item => String(item));
  return String(value).split(/\n|•|;|\|/).map(item => item.trim()).filter(Boolean);
}

function V3ParseBriefDescription(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return {};
  try {
    return JSON.parse(value);
  } catch (e) {
    return { body: value };
  }
}

function V3ParseOperatorMemory(value) {
  const payload = V3ParseBriefDescription(value);
  const memory = payload && typeof payload === 'object' ? payload.operator_memory : null;
  return memory && typeof memory === 'object' ? memory : null;
}

function V3NormalizeRobertBriefRow(row) {
  const brief = V3ParseBriefDescription(row.description);
  const toValue = row.brief_to || row.briefTo || row.to || [];
  const ccValue = row.brief_cc || row.briefCc || row.cc || [];
  const notesValue = row.brief_notes || row.briefNotes || row.notes || [];
  const linksValue = row.brief_links || row.briefLinks || row.links || [];
  return {
    id: String(row.id),
    title: brief.title || row.brief_title || row.briefTitle || row.title || 'Robert brief',
    subtitle: brief.subtitle || row.brief_subtitle || row.briefSubtitle || '',
    subject: brief.subject || row.brief_subject || row.briefSubject || row.title || '',
    gmailThreadId: brief.gmailThreadId || row.brief_thread_id || row.gmail_thread_id || row.gmailThreadId || '',
    sentAt: brief.sentAt || row.brief_sent_at || row.briefSentAt || row.date_received_iso || row.created_at || row.moved_at || '',
    from: brief.from || row.brief_from || row.briefFrom || row.from || '',
    to: V3BriefList(brief.to || toValue),
    cc: V3BriefList(brief.cc || ccValue),
    status: brief.status || row.brief_status || row.briefStatus || 'ready',
    partner: brief.partner || row.brief_partner || row.briefPartner || row.contact_name || row.title || '',
    company: brief.company || row.brief_company || row.briefCompany || row.business_name || row.title || '',
    summary: brief.summary || row.brief_summary || row.briefSummary || row.description || row.intent || '',
    body: brief.body || row.brief_body || row.briefBody || row.description || row.notes || '',
    action: brief.action || row.brief_action || row.briefAction || row.intent || '',
    notes: V3BriefList(brief.notes || notesValue),
    attachment: brief.attachment || row.brief_attachment || row.briefAttachment || null,
    links: Array.isArray(brief.links) ? brief.links : (Array.isArray(linksValue) ? linksValue : []),
  };
}

function V3HockeystickFallbackLead() {
  const email = 'jocelyn.cruz@hockeystick.io';
  const name = 'Jocelyn Cruz';
  const brand = 'Hockeystick';
  const stage = 'paid-out';
  const now = new Date().toISOString();
  return {
    id: 'manual-hockeystick-jocelyn-cruz',
    contactName: name,
    contactRole: 'Founder',
    brand,
    stage,
    value: null,
    deliverables: 'Paid partnership',
    ownerId: 'robert',
    category: 'paid',
    daysInStage: 0,
    activityDays: 0,
    timelineDays: null,
    lastTouch: '0m',
    lastTouchAt: now,
    needsReply: false,
    approve: null,
    color: __v3Color(name + brand),
    email,
    gmailThreadId: '',
    draftReply: null,
    draftReplyStatus: '',
    rowId: 'manual-hockeystick-jocelyn-cruz',
    source: 'Manual',
    nextMove: { who: null, text: 'Closed and paid', action: '' },
    timeline: __v3Timeline(stage, 0, name, brand),
    thread: [{
      from: name,
      when: '0m',
      date: now,
      subject: 'Hockeystick collaboration',
      body: 'Lead placeholder added so the Jocelyn Cruz thread shows in the paid/completed lane.',
      to: [email],
      cc: [],
      replyTo: [],
    }],
    progress: Math.max(0, V3_ACTIVE_STAGE_IDS.indexOf(stage)),
    unread: false,
  };
}

function V3NormalizeSupabaseLead(row) {
  const name = row.contact_name || row.title || row.email || 'Untitled lead';
  const brand = row.business_name || V3DomainBrand(row.email) || row.title || 'Unknown company';
  const received = V3NormalizeDateForUi(row.date_received_iso || row.created_at || row.moved_at);
  const thread = V3ThreadFromRow(row, name, brand, row.list_id);
  const latestThreadDate = V3LatestThreadDate(thread);
  const lastTouchAt = V3NormalizeDateForUi(latestThreadDate || row.moved_at || received);
  const activityDays = V3DaysSince(lastTouchAt || row.moved_at || received);
  const rawStage = V3NormalizeStage(row.list_id);
  // Auto-trash: last touch > 50 days and not already closed out
  const closedStage = V3NormalizeEmailLeadStage(row.email, rawStage);
  const stage = (activityDays > 50 && !['paid-out', 'done', 'trash'].includes(closedStage)) ? 'trash' : closedStage;
  const daysInStage = V3DaysSince(row.moved_at || received);
  const followUpDue = V3LeadFollowUpDue(row, thread, stage, activityDays);
  const needsReply = Boolean(row.new_reply_at) || row.draft_reply_status === 'pending' || stage === 'new' || followUpDue;
  const ownerId = V3NormalizeOwner(row.assignee || row.created_by);
  const value = V3ParseMoney(row.estimated_value);
  const category = V3CategoryFromRow(row);
  const timelineDays = V3TimelineDaysFromRow(row);
  const briefPayload = V3ParseBriefDescription(row.description);
  const operatorMemory = V3ParseOperatorMemory(row.description);
  const isRobertBrief = V3IsRobertBriefRow(row) || briefPayload.kind === 'official-posting' || briefPayload.type === 'official-posting';
  const leadSource = row.lead_source || (row.gmail_thread_id ? 'Gmail' : 'Manual');
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
    followUpDue,
    timelineDays,
    lastTouch: V3RelativeTime(lastTouchAt || row.moved_at || received),
    lastTouchAt: lastTouchAt || row.moved_at || received || null,
    receivedAt: received || null,
    needsReply,
    approve: row.draft_reply ? ownerId : null,
    color: __v3Color(name + brand),
    email: row.email || '',
    gmailThreadId: row.gmail_thread_id || '',
    draftReply: V3ParseDraftReply(row.draft_reply),
    draftReplyStatus: row.draft_reply_status || '',
    operatorMemory,
    operatorSummary: operatorMemory?.summary || null,
    operatorAnalysis: operatorMemory?.analysis || null,
    operatorEscalation: Array.isArray(operatorMemory?.escalation) ? operatorMemory.escalation : [],
    operatorUpdatedAt: operatorMemory?.updated_at || null,
    rowId: row.id,
    source: leadSource,
    rawDescription: row.description || '',
    notes: briefPayload.rich_description || briefPayload.notes || row.notes || '',
    evidence: briefPayload.evidence || '',
    suggestedStage: briefPayload.suggested_stage || row.suggested_stage || '',
    isRobertBrief,
    briefTitle: briefPayload.title || row.brief_title || row.briefTitle || '',
    briefSubtitle: briefPayload.subtitle || row.brief_subtitle || row.briefSubtitle || '',
    briefSubject: briefPayload.subject || row.brief_subject || row.briefSubject || '',
    briefSentAt: briefPayload.sentAt || row.brief_sent_at || row.briefSentAt || '',
    briefFrom: briefPayload.from || row.brief_from || row.briefFrom || '',
    briefTo: briefPayload.to || row.brief_to || row.briefTo || [],
    briefCc: briefPayload.cc || row.brief_cc || row.briefCc || [],
    briefPartner: briefPayload.partner || row.brief_partner || row.briefPartner || '',
    briefCompany: briefPayload.company || row.brief_company || row.briefCompany || '',
    briefSummary: briefPayload.summary || row.brief_summary || row.briefSummary || '',
    briefBody: briefPayload.body || row.brief_body || row.briefBody || '',
    briefAction: briefPayload.action || row.brief_action || row.briefAction || '',
    briefNotes: briefPayload.notes || row.brief_notes || row.briefNotes || [],
    briefAttachment: briefPayload.attachment || row.brief_attachment || row.briefAttachment || null,
    briefLinks: briefPayload.links || row.brief_links || row.briefLinks || [],
    briefStatus: briefPayload.status || row.brief_status || row.briefStatus || '',
    nextMove: V3NextMoveFromRow(stage, name, ownerId, needsReply, row),
    timeline: __v3Timeline(stage, daysInStage, name, brand),
    thread,
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

function V3IsTeamParticipant(value) {
  const text = String(value || '').toLowerCase();
  return [
    'scobleizer@gmail.com',
    'asherunaligned@gmail.com',
    'unalignedx@gmail.com',
    'samlevin@mac.com',
    'sam levin',
    'robert scoble',
    'asher weisberger',
    'unaligned',
  ].some(marker => text.includes(marker));
}

function V3LeadFollowUpDue(row, thread, stage, activityDays) {
  if (!row || !Array.isArray(thread) || !thread.length) return false;
  if (['trash', 'dead-leads', 'paid-out'].includes(stage)) return false;
  if (row.new_reply_at) return false;
  if ((row.draft_reply_status || '').toLowerCase() === 'pending') return false;
  const latest = thread[thread.length - 1];
  if (!latest || !V3IsTeamParticipant(latest.from)) return false;
  return Number(activityDays || 0) >= 2;
}

function V3NormalizeStage(stage) {
  const s = String(stage || 'new').toLowerCase();
  if (V3_ACTIVE_STAGE_IDS.includes(s)) return s;
  if (V3_TRASH_STAGE_IDS.includes(s)) return s;
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
  if (!Number.isFinite(n)) return null;
  // Deal sizes never exceed five figures; bigger numbers are bad AI extractions
  return (n > 100000 || n < 0) ? null : n;
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

function V3NormalizeDateForUi(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw + 'T12:00:00';
  return raw;
}

function V3DateIsVisible(value) {
  const t = V3TimestampForUi(value);
  return !t || t >= V3_MIN_VISIBLE_TS;
}

function V3LeadDatedValues(lead) {
  return [
    lead?.receivedAt,
    lead?.lastTouchAt,
    lead?.briefSentAt,
    ...(Array.isArray(lead?.thread) ? lead.thread.map(msg => msg?.date || msg?.dateIso || msg?.timestamp || msg?.when) : []),
  ]
    .map(V3TimestampForUi)
    .filter(t => Number.isFinite(t) && t > 0);
}

function V3PruneLeadForVisibleRange(lead) {
  if (!lead) return null;
  const dated = V3LeadDatedValues(lead);
  if (dated.length && Math.max(...dated) < V3_MIN_VISIBLE_TS) return null;

  const next = { ...lead };
  if (Array.isArray(lead.thread)) {
    next.thread = lead.thread.filter(msg => V3DateIsVisible(msg?.date || msg?.dateIso || msg?.timestamp || msg?.when));
  }

  const threadDates = (next.thread || [])
    .map(msg => V3NormalizeDateForUi(msg?.date || msg?.dateIso || msg?.timestamp || msg?.when))
    .filter(Boolean);
  if (threadDates.length) {
    const sorted = threadDates.slice().sort((a, b) => V3TimestampForUi(a) - V3TimestampForUi(b));
    if (!V3DateIsVisible(next.receivedAt)) next.receivedAt = sorted[0];
    next.lastTouchAt = sorted[sorted.length - 1];
  } else {
    if (!V3DateIsVisible(next.receivedAt)) next.receivedAt = null;
    if (!V3DateIsVisible(next.lastTouchAt)) next.lastTouchAt = next.receivedAt || null;
  }

  if (!V3DateIsVisible(next.briefSentAt)) next.briefSentAt = '';
  next.lastTouch = next.lastTouchAt ? V3RelativeTime(next.lastTouchAt) : '';
  if (next.lastTouchAt) next.activityDays = V3DaysSince(next.lastTouchAt);
  return next;
}

function V3FilterVisibleLeads(leads) {
  return (Array.isArray(leads) ? leads : [])
    .map(V3PruneLeadForVisibleRange)
    .filter(Boolean);
}

function V3FilterVisibleBriefs(briefs) {
  return (Array.isArray(briefs) ? briefs : []).filter(brief => V3DateIsVisible(brief?.sentAt));
}

function V3LeadIdentityKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/@/g, '')
    .replace(/\.(com|ai|io|co|org|net|app|xyz|tech|ly|fm|vc|us|me|cc)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function V3NormalizeXDmLeads(rows, existingLeads = []) {
  const list = Array.isArray(rows) ? rows : [];
  const existingEmails = new Set(existingLeads.map(lead => String(lead?.email || '').trim().toLowerCase()).filter(Boolean));
  const existingDomains = new Set(
    existingLeads
      .map(lead => String(lead?.email || '').trim().toLowerCase())
      .filter(email => /@/.test(email))
      .map(email => email.split('@')[1])
  );
  const existingIdentityKeys = new Set(
    existingLeads.flatMap(lead => [
      lead?.contactName,
      lead?.brand,
      lead?.email ? String(lead.email).split('@')[0] : '',
      lead?.email ? String(lead.email).split('@')[1] : '',
      lead?.xHandle,
    ].map(V3LeadIdentityKey)).filter(Boolean)
  );
  return list
    .filter(row => row && row.newLead !== false)
    .filter(row => !row.alreadyEmailedInRobertGmail)
    .filter(row => {
      const emails = String(row.contactEmails || '')
        .split(/[,\s|]+/)
        .map(item => item.trim().toLowerCase())
        .filter(item => /@/.test(item));
      if (emails.some(email => existingEmails.has(email))) return false;
      if (emails.some(email => existingDomains.has(email.split('@')[1]))) return false;
      const keys = [
        row.xName,
        row.xUsername,
        ...emails.map(email => email.split('@')[0]),
        ...emails.map(email => email.split('@')[1]),
      ].map(V3LeadIdentityKey).filter(Boolean);
      if (keys.some(key => existingIdentityKeys.has(key))) return false;
      return true;
    })
    .map(V3NormalizeXDmLeadRow);
}

function V3NormalizeXDmLeadRow(row) {
  const name = String(row.xName || 'Unknown X lead').trim();
  const emails = String(row.contactEmails || '')
    .split(/[,\s|]+/)
    .map(item => item.trim().toLowerCase())
    .filter(item => /@/.test(item));
  const email = emails[0] || '';
  const brand = String(row.xName || '').replace(/^@/, '').trim() || V3DomainBrand(email) || 'X lead';
  const received = V3NormalizeDateForUi(row.newestDmDate || '');
  const summary = String(row.summaryForTeam || row.lastLeadMessage || '').trim();
  const latestLeadMessage = String(row.lastLeadMessage || '').trim();
  const dmLink = String(row.openDm || '').trim();
  const handle = String(row.xUsername || '').trim();
  const nextStep = String(row.bestNextStep || '').trim();
  const currentStatus = String(row.currentStatus || '').trim();
  const quickNote = String(row.quickNote || '').trim();
  const owner = String(row.recommendedOwner || '').toLowerCase();
  const ownerId = owner.includes('robert') ? 'robert' : (owner.includes('sam') ? 'sammy' : 'asher');
  const type = String(row.leadType || '').toLowerCase();
  const category = type.includes('interview') || type.includes('media') || type.includes('event')
    ? 'interview'
    : (type.includes('intro') || type.includes('network')
      ? 'intro'
      : (type.includes('paid') || type.includes('sponsor')
        ? 'partnership'
        : 'collaboration'));
  return {
    id: 'xdm-' + String(row.rank || brand || name).replace(/[^a-z0-9_-]+/gi, '-').toLowerCase(),
    contactName: name,
    contactRole: 'X DM lead',
    brand,
    stage: 'new',
    value: null,
    deliverables: String(row.leadType || 'X DM lead'),
    ownerId,
    category,
    daysInStage: V3DaysSince(received),
    activityDays: V3DaysSince(received),
    timelineDays: null,
    lastTouch: V3RelativeTime(received),
    lastTouchAt: received || null,
    receivedAt: received || null,
    needsReply: true,
    approve: null,
    color: __v3Color(name + brand),
    email,
    gmailThreadId: '',
    draftReply: null,
    draftReplyStatus: '',
    rowId: dmLink || ('xdm:' + name),
    source: 'x-dm-intake',
    rawDescription: summary,
    notes: summary,
    evidence: latestLeadMessage,
    suggestedStage: '',
    isRobertBrief: false,
    briefTitle: '',
    briefSubtitle: '',
    briefSubject: '',
    briefSentAt: '',
    briefFrom: '',
    briefTo: [],
    briefCc: [],
    briefPartner: '',
    briefCompany: '',
    briefSummary: '',
    briefBody: '',
    briefAction: '',
    briefNotes: [],
    briefAttachment: null,
    briefLinks: [],
    briefStatus: '',
    nextMove: { who: ownerId, text: nextStep || 'Open X thread and move to email.', action: 'Reply' },
    timeline: __v3Timeline('new', 0, name, brand),
    thread: [{
      from: handle || name,
      when: V3RelativeTime(received),
      date: received || null,
      subject: String(row.leadType || 'X DM lead'),
      body: latestLeadMessage || summary,
      to: [],
      cc: [],
      replyTo: [],
    }],
    progress: Math.max(0, V3_ACTIVE_STAGE_IDS.indexOf('new')),
    unread: true,
    xHandle: handle,
    xOpenDm: dmLink,
    xLeadScore: Number(row.leadScore || 0),
    xContactInfo: String(row.contactInfo || ''),
    xBestNextStep: nextStep,
    xMessageCount: Number(row.messageCount || 0),
    xCurrentStatus: currentStatus,
    xEmailDraft: String(row.emailDraft || ''),
    xQuickNote: quickNote,
  };
}

function V3TimestampForUi(value) {
  const normalized = V3NormalizeDateForUi(value);
  const t = normalized ? Date.parse(normalized) : NaN;
  return Number.isFinite(t) ? t : 0;
}

function V3LeadActivityTimestamp(lead) {
  if (!lead) return 0;
  return Math.max(
    V3TimestampForUi(lead.lastTouchAt),
    V3TimestampForUi(lead.receivedAt),
    ...(Array.isArray(lead.thread) ? lead.thread.map(msg => V3TimestampForUi(msg.date || msg.dateIso || msg.timestamp || msg.when)) : [0])
  );
}

function V3LeadReceivedTimestamp(lead) {
  if (!lead) return 0;
  return Math.max(
    V3TimestampForUi(lead.receivedAt),
    Array.isArray(lead.thread) && lead.thread.length ? V3TimestampForUi(lead.thread[0].date || lead.thread[0].dateIso || lead.thread[0].timestamp || lead.thread[0].when) : 0
  );
}

function V3SortLeadsByActivity(a, b) {
  return V3LeadActivityTimestamp(b) - V3LeadActivityTimestamp(a);
}

function V3LatestThreadDate(thread) {
  if (!Array.isArray(thread) || !thread.length) return null;
  let newest = 0;
  let newestValue = null;
  for (const msg of thread) {
    const value = msg.date || msg.dateIso || msg.timestamp || msg.when;
    const t = V3TimestampForUi(value);
    if (t >= newest) {
      newest = t;
      newestValue = V3NormalizeDateForUi(value);
    }
  }
  return newestValue;
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
  if (V3LeadFollowUpDue(row, Array.isArray(row.email_thread) ? row.email_thread : (Array.isArray(row.original_email) ? row.original_email : []), stage, V3DaysSince(V3LatestThreadDate(Array.isArray(row.email_thread) ? row.email_thread : (Array.isArray(row.original_email) ? row.original_email : [])) || row.moved_at || row.date_received_iso || row.created_at))) {
    return {
      who: owner || (stage === 'negotiating' || stage === 'invoice-sent' ? 'asher' : 'sammy'),
      text: 'Follow up with ' + first + ' - no movement in 2d',
      action: 'Nudge',
    };
  }
  return __v3NextMove(stage, name, owner, needsReply);
}

function V3ThreadFromRow(row, name, brand, stage) {
  const thread = Array.isArray(row.email_thread) ? row.email_thread : (Array.isArray(row.original_email) ? row.original_email : null);
  if (thread && thread.length) {
    return thread.map((m, i) => ({
      from: m.from || m.sender || (i % 2 ? name : 'UNALIGNED'),
      when: V3RelativeTime(V3NormalizeDateForUi(m.date || m.date_iso || m.timestamp || row.created_at)),
      date: V3NormalizeDateForUi(m.date || m.date_iso || m.timestamp || row.created_at),
      dateIso: V3NormalizeDateForUi(m.date_iso),
      subject: m.subject || row.title || (brand + ' conversation'),
      body: m.body || m.text || m.snippet || '',
      to: V3EmailsFromValue(m.to || m.to_list || m.recipients?.to),
      cc: V3EmailsFromValue(m.cc || m.cc_list || m.recipients?.cc),
      replyTo: V3EmailsFromValue(m.reply_to || m.replyTo),
    })).sort((a, b) => V3TimestampForUi(a.date || a.dateIso || a.when) - V3TimestampForUi(b.date || b.dateIso || b.when));
  }
  return [{
    from: name,
    when: V3RelativeTime(row.created_at),
    date: row.created_at || null,
    subject: row.title || (brand + ' lead'),
    body: row.description || row.intent || '',
    to: V3EmailsFromValue(row.email ? [row.email] : []),
    cc: [],
    replyTo: [],
  }];
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

function V3SenderSignature(sender) {
  if (sender === 'robert') {
    return [
      'Robert Scoble',
      'Founder, Unaligned (media company about how AI is bringing us new things)',
      'Mobile: +1-425-205-1921',
      'X: https://x.com/scobleizer',
      'Web: https://unaligned.io',
      'This message copyright the sender. All rights reserved.',
    ].join('\n');
  }
  if (sender === 'sam') {
    return [
      'Sam Levin',
      'Partnerships, UNALIGNED',
      'unalignedx@gmail.com',
    ].join('\n');
  }
  return [
    'Asher Weisberger',
    'Client Services Manager',
    'Unaligned',
    'asherunaligned@gmail.com',
    'unaligned.io | x.com/unalignedx',
  ].join('\n');
}

function V3EnsureSenderSignature(body, sender) {
  const text = String(body || '').trim();
  const signature = V3SenderSignature(sender);
  if (!signature) return text;
  const normText = V3NormalizeThreadText(text);
  const normSig = V3NormalizeThreadText(signature);
  if (!text) return signature;
  if (normText.includes(normSig)) return text;
  return text + '\n\n' + signature;
}

function V3FallbackDraftBody(lead, sender) {
  const first = String(lead?.contactName || 'there').split(' ')[0] || 'there';
  const brand = String(lead?.brand || 'your company');
  const last = Array.isArray(lead?.thread) ? lead.thread[lead.thread.length - 1] : null;
  const lastSnippet = String(last?.body || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const stage = String(lead?.stage || '');
  if (sender === 'robert') {
    return [
      `Hi ${first},`,
      '',
      `Thanks for reaching out about ${brand}.`,
      lastSnippet ? `I saw the latest note in the thread and want to keep the conversation moving cleanly.` : `I want to keep the conversation moving cleanly and make sure we answer the latest notes.`,
      '',
      'Best,',
    ].join('\n');
  }
  if (sender === 'sam') {
    const opener = stage === 'rates-sent' || stage === 'negotiating' || stage === 'invoice-sent'
      ? 'I saw the latest note and I’m keeping this moving on the partnership side.'
      : 'I’m jumping in to keep the thread moving on the partnership side.';
    return [
      `Hi ${first},`,
      '',
      opener,
      lastSnippet ? `We’re tracking the latest detail from the thread and will reply accordingly.` : `We’ll keep the thread aligned with the latest details before sending anything else.`,
      '',
      'Best,',
    ].join('\n');
  }
  return [
    `Hi ${first},`,
    '',
    'I’m jumping in to keep the chain organized and make sure we reply to the latest information in the thread.',
    lastSnippet ? `I’ve got the newest note in view and will respond from there.` : `I’ve got the newest note in view and will respond from there.`,
    '',
    'Best,',
  ].join('\n');
}

function V3ComposeReplyDraft(lead, sender) {
  const draft = lead?.draftReply && typeof lead.draftReply === 'object' ? lead.draftReply : null;
  const subject = draft?.subject || V3SubjectForLead(lead);
  const sourceBody = draft?.body ? String(draft.body) : V3FallbackDraftBody(lead, sender);
  return {
    subject,
    body: V3EnsureSenderSignature(sourceBody, sender),
  };
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

function V3ProfileTeam(user) {
  return user === 'robert' ? ['robert'] : ['asher', 'sammy'];
}

function V3ProfileLane(user) {
  return user === 'robert' ? 'robert' : 'shared';
}

function V3LeadLane(lead) {
  if (!lead) return 'shared';
  if (lead.ownerId === 'robert') return 'robert';
  if (['done', 'paid-out'].includes(lead.stage)) return 'robert';
  return 'shared';
}

function V3LeadVisibleToProfile(lead, user) {
  if (lead?.isRobertBrief) return false;
  return V3LeadLane(lead) === V3ProfileLane(user);
}

function V3LeadIsMineForProfile(lead, user, ownerId = lead.ownerId) {
  return V3ProfileTeam(user).includes(ownerId || '');
}

function V3MoveIsMineForProfile(lead, user) {
  return V3ProfileTeam(user).includes(lead?.nextMove?.who || '');
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

function V3EmailsFromValue(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return V3UniqueEmails(value.flatMap(item => V3EmailsFromValue(item)));
  }
  if (typeof value === 'object') {
    return V3EmailsFromValue(value.email || value.emails || value.to || value.cc || value.reply_to || value.replyTo || '');
  }
  return V3UniqueEmails(V3SplitEmails(String(value)).map(item => V3ExtractEmail(item)).filter(Boolean));
}

function V3ExtractEmail(value) {
  const match = String(value || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].toLowerCase() : '';
}

function V3LeadReplyToEmail(lead, sender) {
  const senderEmails = new Set(V3SenderEmails(sender).map(email => email.toLowerCase()));
  const internalEmails = new Set(['scobleizer@gmail.com', 'unalignedx@gmail.com', 'asherunaligned@gmail.com']);
  const candidates = [];

  const pushCandidate = (value) => {
    for (const email of V3EmailsFromValue(value)) {
      candidates.push(email);
    }
  };

  pushCandidate(lead?.replyTo);
  pushCandidate(lead?.email);
  if (Array.isArray(lead?.thread)) {
    for (let i = lead.thread.length - 1; i >= 0; i--) {
      pushCandidate(lead.thread[i]?.from);
      pushCandidate(lead.thread[i]?.to);
      pushCandidate(lead.thread[i]?.cc);
      pushCandidate(lead.thread[i]?.replyTo);
      pushCandidate(lead.thread[i]?.reply_to);
    }
  }

  for (const email of candidates) {
    if (senderEmails.has(email)) continue;
    if (internalEmails.has(email) && !String(lead?.email || '').toLowerCase().includes(email)) continue;
    return email;
  }
  return '';
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
  const senderEmails = V3SenderEmails(sender).map(email => email.toLowerCase());
  const leadEmail = V3LeadReplyToEmail(lead, sender) || String(lead?.email || '').trim();
  const leadIsSender = senderEmails.includes(leadEmail.toLowerCase());
  const participants = V3UniqueEmails([...V3ThreadParticipants(lead), ...V3InternalEmails(sender)]);
  const to = leadEmail && !leadIsSender ? [leadEmail] : [];
  const cc = participants.filter(email =>
    email &&
    email.toLowerCase() !== leadEmail.toLowerCase() &&
    !senderEmails.includes(email.toLowerCase())
  );
  return { to: V3UniqueEmails(to), cc: V3UniqueEmails(cc) };
}

function V3NormalizeThreadText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function V3ThreadMessageKey(msg) {
  return [
    V3ExtractEmail(msg?.from) || V3NormalizeThreadText(msg?.from),
    V3NormalizeThreadText(msg?.subject),
    V3NormalizeThreadText(msg?.body),
  ].join('|');
}

function V3PendingReplyKey(pending) {
  return [
    String(pending?.leadId || ''),
    String(pending?.sender || ''),
    V3NormalizeThreadText(pending?.subject),
    V3NormalizeThreadText(pending?.body),
  ].join('|');
}

function V3ThreadParticipants(lead) {
  const emails = [];
  const push = (value) => {
    emails.push(...V3EmailsFromValue(value));
  };
  push(lead?.email);
  push(lead?.replyTo);
  push(lead?.reply_to);
  if (Array.isArray(lead?.thread)) {
    for (const msg of lead.thread) {
      push(msg?.from);
      push(msg?.to);
      push(msg?.cc);
      push(msg?.replyTo);
      push(msg?.reply_to);
    }
  }
  return V3UniqueEmails(emails);
}

function V3LeadMatchesQuery(lead, query) {
  const q = V3NormalizeThreadText(query);
  if (!q) return true;
  const hay = V3NormalizeThreadText([
    lead?.contactName,
    lead?.brand,
    lead?.contactRole,
    lead?.email,
    lead?.stage,
    lead?.deliverables,
    lead?.ownerId,
    lead?.nextMove?.text,
    lead?.nextMove?.action,
    lead?.source,
    lead?.notes,
    lead?.evidence,
    ...(Array.isArray(lead?.thread) ? lead.thread.flatMap(msg => [
      msg?.from,
      msg?.subject,
      msg?.body,
      msg?.to,
      msg?.cc,
    ]) : []),
  ].flat().join(' '));
  if (hay.includes(q)) return true;
  return q.split(' ').filter(Boolean).every(token => hay.includes(token));
}

function V3IsNewLeadReview(lead) {
  if (!lead || lead.isRobertBrief) return false;
  const sourceKind = V3NewLeadSourceKind(lead);
  const mailbox = V3LeadMailboxOrigin(lead);
  if (mailbox === 'asher') return false;
  if (sourceKind === 'x' || mailbox === 'robert') return !V3CompanyOsQualifiedLead(lead);
  return false;
}

function V3NewLeadSourceKind(lead) {
  const source = String(lead?.source || '').toLowerCase();
  if (source.includes('x-dm-intake') || source.includes('twitter_dm') || source.includes('ingest-twitter_dm')) return 'x';
  return 'gmail';
}

function V3LeadMailboxOrigin(lead) {
  const source = String(lead?.source || '').toLowerCase();
  if (source.includes('x-dm-intake') || source.includes('twitter_dm') || source.includes('ingest-twitter_dm')) return 'x';
  if (
    source.includes('robert-gmail-new-lead') ||
    source.includes('gmail-robert') ||
    source.includes('robert gmail')
  ) return 'robert';
  if (
    source.includes('asher-gmail') ||
    source.includes('gmail-asher') ||
    source.includes('asher candidate') ||
    source.includes('asher gmail')
  ) return 'asher';

  const participants = V3ThreadParticipants(lead).map(email => String(email || '').toLowerCase());
  if (participants.includes('asherunaligned@gmail.com')) return 'asher';
  if (participants.includes('scobleizer@gmail.com')) return 'robert';
  return 'unknown';
}

function V3LeadHasInternalReply(lead) {
  const internal = new Set(['asherunaligned@gmail.com', 'scobleizer@gmail.com', 'unalignedx@gmail.com']);
  return Array.isArray(lead?.thread) && lead.thread.some(msg => {
    const from = String(msg?.from || '').toLowerCase();
    const emails = [...from.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g)].map(match => match[0]);
    return emails.some(email => internal.has(email));
  });
}

function V3CompanyOsQualifiedLead(lead) {
  if (!lead || lead.isRobertBrief) return false;
  const stage = String(lead.stage || '').toLowerCase();
  if (['rates-sent', 'negotiating', 'invoice-sent', 'done', 'paid-out'].includes(stage)) return true;

  const sourceKind = V3NewLeadSourceKind(lead);
  const mailbox = V3LeadMailboxOrigin(lead);
  const context = [
    lead?.brand,
    lead?.deliverables,
    lead?.notes,
    lead?.evidence,
    lead?.nextMove?.text,
    ...(Array.isArray(lead?.thread) ? lead.thread.flatMap(msg => [msg?.subject, msg?.body]) : []),
  ].filter(Boolean).join(' ').toLowerCase();
  const hasCommercialSignal = /\b(rate|pricing|quote|budget|paid|payment|invoice|deliverable|campaign|sponsor|sponsorship|partnership|repost|post|thread|brief|launch)\b/.test(context);
  const introLike = /\b(intro|introduction|connect|connection|network|meeting|coffee|founder chat|catch up)\b/.test(context);
  const hasInternalReply = V3LeadHasInternalReply(lead);

  if (mailbox === 'asher') {
    return ['first-touch', 'engaged'].includes(stage) || lead.unread || lead.followUpDue || Number(lead.value || 0) > 0;
  }

  if (sourceKind === 'x' || mailbox === 'robert') {
    if (!['first-touch', 'engaged'].includes(stage)) return false;
    if (!hasInternalReply) return false;
    if (introLike && !hasCommercialSignal) return false;
    return hasCommercialSignal || Number(lead.value || 0) > 0;
  }

  return false;
}

function V3NewLeadSourceLabel(lead) {
  return V3NewLeadSourceKind(lead) === 'x' ? 'X' : 'Gmail';
}

function V3NewLeadHandle(lead) {
  if (lead?.xHandle) return String(lead.xHandle).trim();
  const text = [
    lead?.contactName,
    lead?.brand,
    lead?.source,
    lead?.deliverables,
    lead?.notes,
    lead?.evidence,
    lead?.title,
    ...(Array.isArray(lead?.thread) ? lead.thread.flatMap(msg => [msg?.from, msg?.subject, msg?.body]) : []),
  ].filter(Boolean).join(' ');
  const lowered = String(text).toLowerCase();
  const urlMatches = [...lowered.matchAll(/(?:x|twitter)\.com\/([a-z0-9_]{2,30})\b/g)]
    .map(match => match[1])
    .filter(handle => !['scobleizer', 'unalignedx'].includes(handle));
  if (urlMatches.length) return '@' + urlMatches[0];
  const mentions = [...String(text).matchAll(/(^|[\s(>])@([A-Za-z0-9_]{2,30})\b/g)]
    .map(match => match[2])
    .filter(handle => !['Robert', 'Scobleizer', 'UnalignedX', 'Asher'].includes(handle));
  return mentions.length ? ('@' + mentions[0]) : '';
}

function V3NewLeadSummary(lead) {
  const latest = Array.isArray(lead?.thread) && lead.thread.length ? lead.thread[lead.thread.length - 1] : null;
  const source = V3NewLeadSourceKind(lead);
  const raw = source === 'x'
    ? (lead?.notes || lead?.xQuickNote || lead?.evidence || latest?.body || lead?.nextMove?.text || lead?.deliverables || '')
    : (lead?.notes || latest?.body || lead?.evidence || lead?.nextMove?.text || lead?.deliverables || '');
  let text = String(raw || '');
  // The stored body often contains the whole thread (the lead's latest message
  // followed by an earlier quoted reply). Truncate at the first quote marker so
  // only the lead's message shows. Done before whitespace is collapsed so the
  // newline-anchored markers still match.
  const quoteMarkers = [
    /\n\s*\[recovered quoted[^\]]*\]/i,          // pipeline artifact wrapping the quoted reply
    /\n\s*on\b.{0,160}?\bwrote:/is,              // "On <date> <name> wrote:"
    /\n\s*-{2,}\s*original message\s*-{2,}/i,    // "----- Original Message -----"
    /\n\s*from:\s.{0,80}@/i,                     // quoted "From: name <email>" header block
    /\n\s*(?:发件人|寄件者)\s*[：:]/,             // Chinese "From:" quoted header block
    /<blockquote/i,                              // HTML quoted reply
    /<div[^>]*class="[^"]*gmail_quote/i,         // Gmail HTML quote container
    /\n\s*[^\n]{0,80}<[^>\n]+@[^>\n]+>[^\n]{0,80}(?:写道|寫道|wrote)\s*[：:]/i, // "Name <email> … wrote:/写道:" (any locale)
    /\n\s*>/,                                    // leading ">" quote lines
  ];
  for (const marker of quoteMarkers) {
    const at = text.search(marker);
    if (at > 0) text = text.slice(0, at);
  }
  text = text
    .replace(/Robert['’]s latest position:\s*/gi, 'Robert: ')
    .replace(/Latest lead message:\s*/gi, '')
    // strip HTML tags (whitelisted names so emails in <angle brackets> survive)
    .replace(/<\/?(?:div|p|br|span|a|b|i|u|strong|em|blockquote|ul|ol|li|table|tr|td|th|h[1-6]|img|font|hr|pre|code)\b[^>]*\/?>/gi, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&#3[49];|&quot;|&apos;/gi, "'")
    .replace(/\[[^\]]*\]/g, ' ')                 // drop any remaining bracketed artifacts
    .replace(/\s+/g, ' ')
    .trim();
  // Lead with the substance: strip an opening greeting and a closing sign-off
  // so the card shows what the lead actually wants, not "Hi Asher, ... Warm regards".
  text = text.replace(/^(hi|hello|hey|dear|greetings|good (?:morning|afternoon|evening))\b[^,.!?]*[,!]?\s+/i, '');
  text = text.replace(/[\s,]*\b(warm(?:est)? regards|best regards|kind regards|warm wishes|best wishes|kind wishes|all the best|talk soon|many thanks|thanks so much|regards|cheers|sincerely(?: yours)?)\b[\s\S]{0,40}$/i, '');
  // also strip a bare comma sign-off followed by a name ("Best, Kevin Picchi",
  // "Thanks, Joe"). The capital after the comma keeps prose like
  // "the best, most reliable option" from being treated as a sign-off.
  text = text.replace(/\s*\b([Bb]est|[Tt]hanks|[Tt]hank you|[Cc]heers|[Ss]incerely|[Rr]egards|[Tt]alk soon|[Tt]ake care)\s*,\s+[A-Z][^,]{0,45}$/, '');
  return text.trim();
}

function V3NewLeadPrimaryIdentity(lead) {
  if (!lead) return 'Unknown contact';
  if (V3NewLeadSourceKind(lead) === 'x') return lead.contactName || V3NewLeadHandle(lead) || 'Unknown account';
  return lead.contactName || lead.email || 'Unknown contact';
}

function V3NewLeadReason(lead) {
  if (V3NewLeadSourceKind(lead) === 'x') {
    const status = String(lead?.xCurrentStatus || lead?.xBestNextStep || '').toLowerCase();
    if (status.includes('needs live check')) return 'Needs live check';
    if (status.includes('already routed')) return 'Already routed';
    if (status.includes('robert was last')) return 'Waiting on them';
    if (status.includes('route scheduling')) return 'Route to email';
    if (status.includes('invoice')) return 'Payment follow-up';
    if (status.includes('lead waiting')) return 'Needs reply';
    if (status.includes('soft future-business handoff')) return 'Future handoff';
    return 'X lead';
  }
  const source = String(lead?.source || '').toLowerCase();
  const text = [
    lead?.notes,
    lead?.evidence,
    lead?.deliverables,
    lead?.nextMove?.text,
    ...(Array.isArray(lead?.thread) ? lead.thread.slice(-3).flatMap(msg => [msg?.subject, msg?.body]) : []),
  ].filter(Boolean).join(' ').toLowerCase();
  if (lead?.ownerId === 'robert' || source.includes('robert')) return 'Robert inbox lead';
  if (text.match(/\b(rate|pricing|budget|paid|sponsor|quote repost|qrt|invoice)\b/)) return 'Commercial signal';
  if (text.match(/\b(interview|podcast|call|meeting|demo)\b/)) return 'Collaboration ask';
  if (V3NewLeadSourceKind(lead) === 'x') return 'X lead';
  if (source.includes('asher')) return 'Asher inbox lead';
  if (source.includes('gmail')) return 'Gmail lead';
  return 'Needs review';
}

function V3PendingReplyMatchesLead(pending, lead) {
  if (!pending || !lead) return false;
  const senderEmail = V3SenderEmails(pending.sender || '').map(email => email.toLowerCase());
  const pendingSubject = V3NormalizeThreadText(pending.subject);
  const pendingBody = V3NormalizeThreadText(pending.body);
  const thread = Array.isArray(lead.thread) ? lead.thread : [];
  return thread.some(msg => {
    const msgEmail = V3ExtractEmail(msg.from);
    const msgSubject = V3NormalizeThreadText(msg.subject);
    const msgBody = V3NormalizeThreadText(msg.body);
    const senderMatch =
      senderEmail.includes(msgEmail) ||
      V3NormalizeThreadText(msg.from).includes(V3NormalizeThreadText(V3SenderName(pending.sender || '')));
    const subjectMatch = !pendingSubject || msgSubject === pendingSubject || msgSubject.includes(pendingSubject) || pendingSubject.includes(msgSubject);
    const bodyMatch = !pendingBody || msgBody === pendingBody || msgBody.includes(pendingBody) || pendingBody.includes(msgBody);
    return senderMatch && subjectMatch && bodyMatch;
  });
}

function V3PrunePendingReplies(pendingReplies, leads) {
  const list = Array.isArray(pendingReplies) ? pendingReplies : [];
  const currentLeads = Array.isArray(leads) ? leads : [];
  return list.filter(pending => {
    const lead = currentLeads.find(l => String(l.id) === String(pending.leadId));
    return lead ? !V3PendingReplyMatchesLead(pending, lead) : true;
  });
}

function V3MergePendingReplies(leads, pendingReplies) {
  const list = Array.isArray(leads) ? leads : [];
  const pendings = Array.isArray(pendingReplies) ? pendingReplies : [];
  if (!pendings.length) return list;
  const byLead = new Map();
  for (const pending of pendings) {
    const key = String(pending.leadId || '');
    if (!key) continue;
    if (!byLead.has(key)) byLead.set(key, []);
    byLead.get(key).push(pending);
  }
  return list.map(lead => {
    const items = byLead.get(String(lead.id)) || [];
    if (!items.length) return lead;
    const existingKeys = new Set((Array.isArray(lead.thread) ? lead.thread : []).map(V3ThreadMessageKey));
    const thread = Array.isArray(lead.thread) ? lead.thread.slice() : [];
    let changed = false;
    for (const pending of items) {
      const pendingMsg = {
        from: V3SenderName(pending.sender || ''),
        when: 'just now',
        date: pending.createdAt || new Date().toISOString(),
        subject: pending.subject || '',
        body: pending.body || '',
        to: Array.isArray(pending.to) ? pending.to : V3EmailsFromValue(pending.to),
        cc: Array.isArray(pending.cc) ? pending.cc : V3EmailsFromValue(pending.cc),
        pending: true,
      };
      const key = V3ThreadMessageKey(pendingMsg);
      if (existingKeys.has(key)) continue;
      thread.push(pendingMsg);
      existingKeys.add(key);
      changed = true;
    }
    if (!changed) return lead;
    const newest = thread.reduce((latest, msg) => {
      const t = Date.parse(msg.date || msg.when || '') || 0;
      return t > latest ? t : latest;
    }, 0);
    return {
      ...lead,
      thread,
      lastTouchAt: newest ? new Date(newest).toISOString() : lead.lastTouchAt,
      lastTouch: newest ? 'just now' : lead.lastTouch,
      unread: lead.unread,
    };
  });
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

Object.assign(window, { V3SenderForUser, V3SenderName, V3SenderSignature, V3EnsureSenderSignature, V3ComposeReplyDraft, V3SubjectForLead, V3DefaultCc, V3InternalEmails, V3SenderEmails, V3IsSelfRecipient, V3SplitEmails, V3EmailsFromValue, V3ExtractEmail, V3LeadReplyToEmail, V3ThreadParticipants, V3LeadMatchesQuery, V3UniqueEmails, V3ReplyRecipients, V3ThreadMessageKey, V3PendingReplyKey, V3PendingReplyMatchesLead, V3PrunePendingReplies, V3MergePendingReplies, V3SendLeadEmail, V3LeadActivityTimestamp, V3LeadReceivedTimestamp, V3SortLeadsByActivity, V3NewLeadReason });


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

// Stages — keep stable ids for automation, but use language that matches
// the real lead-to-close workflow in Company OS.
const V3_STAGES = [
  { id: 'new',         name: 'New lead',      color: 'var(--st-new)',     short: 'NEW LEAD' },
  { id: 'first-touch', name: 'Scoped',        color: 'var(--st-touch)',   short: 'SCOPED' },
  { id: 'engaged',     name: 'Qualified',     color: 'var(--st-engaged)', short: 'QUALIFIED' },
  { id: 'rates-sent',  name: 'Rates sent',   color: 'var(--st-rates)',   short: 'RATES SENT' },
  { id: 'negotiating', name: 'Negotiating',  color: 'var(--st-nego)',    short: 'NEGOTIATING' },
  { id: 'invoice-sent',name: 'Payment / terms', color: 'var(--st-invoice)', short: 'PAYMENT / TERMS' },
  { id: 'trash',       name: 'Trash',        color: 'var(--text-4)',     short: 'TRASH' },
  { id: 'done',        name: 'Brief / calendar', color: 'var(--st-booked)',  short: 'BRIEF / CALENDAR' },
  { id: 'paid-out',    name: 'Closed',       color: 'var(--st-paid)',    short: 'CLOSED' },
];
const V3_STAGE_BY_ID = Object.fromEntries(V3_STAGES.map(s => [s.id, s]));
const V3_ACTIVE_STAGE_IDS = ['new','first-touch','engaged','rates-sent','negotiating','invoice-sent','done','paid-out'];
const V3_BOARD_STAGE_IDS = ['new','first-touch','engaged','rates-sent','negotiating','invoice-sent','trash','done','paid-out'];
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
    'new':          { who: 'sammy',  text: `Qualify the lead and send first response to ${first}`, action: 'Reply' },
    'first-touch':  { who: needsReply ? 'sammy' : null, text: needsReply ? `Tighten scope with ${first}` : `Waiting on ${first} to confirm scope`, action: needsReply ? 'Reply' : '' },
    'engaged':      { who: needsReply ? 'sammy' : null, text: needsReply ? `Get timing, deliverable, and budget from ${first}` : `Awaiting ${first}'s scope details`, action: 'Reply' },
    'rates-sent':   { who: null,     text: `Pricing is out — waiting on ${first}`,                action: 'Nudge' },
    'negotiating':  { who: needsReply ? 'asher' : null, text: needsReply ? `Send revised terms to ${first}` : `Awaiting ${first}'s answer on price / terms`, action: 'Send' },
    'invoice-sent': { who: null,     text: `Verify payment, contract, or invoice status`,         action: '' },
    'done':         { who: 'robert', text: `Brief is ready — lock calendar and execute`,          action: 'Post' },
    'paid-out':     { who: null,     text: `Closed — paid and archived`,                          action: '' },
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
    'new':          `${first} from ${brand} came in`,
    'first-touch':  `Scope being clarified`,
    'engaged':      `${first} replied — budget and timing in play`,
    'rates-sent':   `Pricing package delivered`,
    'negotiating':  `Working through terms and usage`,
    'invoice-sent': `Payment path or contract is in motion`,
    'done':         `Brief approved and queued for execution`,
    'paid-out':     `Payment received and thread closed`,
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

const V3_ROBERT_BRIEFS = [
  {
    id: 'official-posting-viktor-2026-05-19',
    title: 'GET VIKTOR',
    subtitle: 'Time-sensitive official posting',
    subject: '**OFFICIAL POSTING** GET VIKTOR - MAY 19TH',
    gmailThreadId: '19e3e4341ab2c4ee',
    sentAt: '2026-05-18T23:24:02-04:00',
    from: 'Asher Weisberger <asherunaligned@gmail.com>',
    to: ['Robert Scoble <scobleizer@gmail.com>', 'Sam Levin UX <unalignedx@gmail.com>'],
    status: 'ready',
    partner: 'Ori',
    company: 'Viktor',
    summary: 'Asher sent Robert a brief with three proposed post options and asked him to pick one or edit it before posting.',
    body: `Hi Robert,

Here are the details for the collaboration with Ori, a past lead.

I’ve included a PDF with the proposed post options.

This one is time-sensitive, as they’re asking for the post to go live at 9:00 AM EST / 6:00 AM your time.

I’m still waiting for the live link to come through by email. Once we have it, I can handle the posting on your X account so you don’t have to think about it.

Please choose one of the three post options you prefer.

You’re also welcome to edit any of them and send me the final version you’d like used.

Happy to get up early and take care of the post for you. Just let me know how you’d like to proceed.

Thanks again for your trust and confidence.`,
    attachment: {
      filename: 'Viktor_Brief_Robert.pdf',
      type: 'pdf',
    },
    links: [],
    action: 'Pick one post option or edit it, then let Asher know the final version.',
    notes: ['Live at 9:00 AM EST / 6:00 AM Robert time', 'PDF attached with three post options'],
  },
  {
    id: 'official-posting-polyai-2026-05-18',
    title: 'PolyAI posting today',
    subtitle: 'Quote repost official posting',
    subject: 'OFFICIAL POSTING POLY AI POSTING TODAY',
    gmailThreadId: '19e3c14de4bba514',
    sentAt: '2026-05-18T17:14:07-04:00',
    from: 'Asher Weisberger <asherunaligned@gmail.com>',
    to: ['Robert Scoble <scobleizer@gmail.com>', 'Sam Levin UX <unalignedx@gmail.com>'],
    status: 'ready',
    partner: 'PolyAI',
    company: 'PolyAI',
    summary: 'Asher sent Robert a quote repost task with the live X link and a Google Doc write-up.',
    body: `THIS IS THE TASK

POLYAI - QUOTE REPOST - MAY 18 - TODAY MONDAY

FULL PDF WRITE UP BETWEEN POLYAI AND MYSELF IN LINK FOR USE ON POST

LIVE LINK

[LT-fW7_jnzT5lVod.jpeg
Starting today, we're opening our Agentic Dialog Platform to every enterprise builder.

Our dialog agents have resolved 1 billion+ customer conversations for clients like FedEx, Unicredit, PG&E, Marriott, Foot Locker, and many more.

These aren't easy conversations. They solve

PolyAI (@polyaivoice)
154 likes · 37 replies
x.com](https://x.com/polyaivoice/status/2056404397089825165)

THESE ARE THE DOCUMENTS

[AHkbwyLSSWmC1mRkEhtH_bGBXECei72ujIcuTquAckY0OmR_4iiSr85aawrmpVRbqu4QhLfaZgWIMg-qt0MjBdv2cRFXHdTz7ZfvBkyLErT8aXMXx-M3ZtKJ=w1200-h630-p.png

BHARAT ROBERT SCOBLE X POLYAI COLLAB
docs.google.com](https://docs.google.com/document/d/18VKhSyLIftOB40zV2pjVA-oajDh6TyDzMoJEmQg85tg/edit?usp=sharing)`,
    attachment: null,
    links: [
      { label: 'Live post', href: 'https://x.com/polyaivoice/status/2056404397089825165' },
      { label: 'Docs', href: 'https://docs.google.com/document/d/18VKhSyLIftOB40zV2pjVA-oajDh6TyDzMoJEmQg85tg/edit?usp=sharing' },
    ],
    action: 'Use the live link and docs to post the quote repost.',
    notes: ['Quote repost', 'Use the Google Doc write-up for the final post'],
  },
];

// Attach briefs to leads (mutable so check-off can mutate in-session)
for (const lead of V3_LEADS) {
  if (V3_BRIEFS[lead.id]) lead.brief = V3_BRIEFS[lead.id];
}

const V3_VISIBLE_LEADS = V3FilterVisibleLeads(V3_LEADS);
const V3_VISIBLE_ROBERT_BRIEFS = V3FilterVisibleBriefs(V3_ROBERT_BRIEFS);

// Aggregates
function v3FlowCounts() {
  const leads = window.V3?.LEADS || V3_VISIBLE_LEADS;
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

function v3DeriveTasks(user, leads = window.V3?.LEADS || V3_LEADS) {
  const laneUser = user === 'robert' ? 'robert' : 'asher';
  const tasks = [];
  const first = n => n.split(' ')[0];
  const moneyTag = v => v ? '$' + v.toLocaleString() : '';

  for (const lead of leads) {
    if (lead.stage === 'paid-out') continue;
    if (!V3LeadVisibleToProfile(lead, user)) continue;
    const ownsThis = lead.ownerId === laneUser;

    // ─── Robert (creator): post + live tracking ───
    if (laneUser === 'robert') {
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
    // Asher and Sammy share the same sales lane.
    if (!ownsThis && laneUser !== 'asher') continue;

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
      if (laneUser === 'asher' && lead.brief && lead.brief.status === 'awaiting-approval') {
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

// ─── Gmail-style time formatting ─────────────────────────────
// list()    → compact like Gmail's inbox column: "3:42 PM" (today), "May 12" (this year), "11/4/24" (older)
// full()    → "Mon, May 12, 2025, 3:42 PM" — the per-message header in an open thread
// tooltip() → "Mon, May 12, 2025 at 3:42 PM (2 days ago)" — full absolute + relative for hover
// relative()→ "2 days ago", "yesterday", "just now" — for the parenthetical
const V3GmailTime = (() => {
  const parse = (v) => {
    if (!v) return null;
    if (v instanceof Date) return isNaN(v) ? null : v;
    // accept "Nd ago" / "Nh ago" / "Nm ago" as fallbacks
    let s = String(v).trim();
    const dm = s.match(/^(\d+)\s*d/i);
    const hm = s.match(/^(\d+)\s*h/i);
    const mm = s.match(/^(\d+)\s*m(?!o)/i); // m but not "month"
    if (dm) return new Date(Date.now() - +dm[1] * 86400000);
    if (hm) return new Date(Date.now() - +hm[1] * 3600000);
    if (mm) return new Date(Date.now() - +mm[1] * 60000);
    // Normalize Supabase-style strings like "May 15, 2026 12:31PM PT / 3:31PM ET"
    // → strip the alt-timezone tail, normalize "12:31PM" → "12:31 PM"
    s = s.replace(/\s*\/.*$/, '').replace(/(\d)(AM|PM)\b/i, '$1 $2');
    // Strip trailing timezone abbreviations Date.parse can't handle ("PT", "ET", etc.)
    // Keep ISO offsets like "+00:00" or "Z" intact.
    s = s.replace(/\s+(PT|PST|PDT|ET|EST|EDT|CT|CST|CDT|MT|MST|MDT|BST|CEST|CET)$/i, '');
    const t = Date.parse(s);
    return Number.isFinite(t) ? new Date(t) : null;
  };
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const time12 = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  const list = (v) => {
    const d = parse(v); if (!d) return '';
    const now = new Date();
    if (sameDay(d, now)) return time12(d);
    if (d.getFullYear() === now.getFullYear()) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    // older — Gmail uses "11/4/24" style
    const mm = d.getMonth() + 1, dd = d.getDate(), yy = String(d.getFullYear()).slice(-2);
    return `${mm}/${dd}/${yy}`;
  };

  const full = (v) => {
    const d = parse(v); if (!d) return '';
    const raw = String(v instanceof Date ? '' : (v || '')).trim();
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw) ||
      /T(?:00:00:00(?:\.000)?|12:00:00(?:\.000)?)(?:Z|[+-]\d{2}:?\d{2})?$/.test(raw) ||
      /\b12:00\s*(?:AM|PM)\b/i.test(raw) ||
      (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0);
    if (dateOnly) {
      return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    }
    return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
      .replace(/,([^,]*)$/, ',$1'); // pass-through; toLocaleString already gives a nice format
  };

  const relative = (v) => {
    const d = parse(v); if (!d) return '';
    const now = new Date();
    const diff = now - d;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + ' minute' + (mins === 1 ? '' : 's') + ' ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24 && sameDay(d, now)) return hrs + ' hour' + (hrs === 1 ? '' : 's') + ' ago';
    const yest = new Date(now); yest.setDate(yest.getDate() - 1);
    if (sameDay(d, yest)) return 'yesterday';
    const days = Math.floor(diff / 86400000);
    if (days < 7) return days + ' days ago';
    if (days < 30) { const w = Math.floor(days / 7); return w + ' week' + (w === 1 ? '' : 's') + ' ago'; }
    if (days < 365) { const mo = Math.floor(days / 30); return mo + ' month' + (mo === 1 ? '' : 's') + ' ago'; }
    const yr = Math.floor(days / 365); return yr + ' year' + (yr === 1 ? '' : 's') + ' ago';
  };

  const tooltip = (v) => {
    const d = parse(v); if (!d) return '';
    return full(v) + ' (' + relative(d) + ')';
  };

  return { list, full, relative, tooltip, parse };
})();

// ─── Backfill real ISO dates onto synthetic threads ───────────
// The seed leads only have "Nd ago" strings on messages; convert them into real Date
// objects so the Gmail formatter can render proper timestamps. Real Supabase-loaded
// leads already have .date on each message.
(function backfillSeedDates() {
  const minutesSinceMidnight = () => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  };
  for (const lead of V3_LEADS) {
    if (!Array.isArray(lead.thread)) continue;
    for (const m of lead.thread) {
      if (m.date) continue;
      const d = V3GmailTime.parse(m.when);
      if (d) {
        // For "Nd ago" messages, snap to a plausible workday time (9–6) instead of "exactly now".
        const dm = /^(\d+)\s*d/i.test(m.when || '');
        if (dm) {
          const offsetMin = ((d.getTime() * 7919) >>> 0) % (9 * 60); // deterministic per-day spread
          d.setHours(9, 0, 0, 0);
          d.setMinutes(d.getMinutes() + offsetMin);
        }
        m.date = d.toISOString();
      }
    }
    // lastTouchAt = newest message date
    const dates = lead.thread.map(m => m.date && Date.parse(m.date)).filter(Number.isFinite);
    if (dates.length) lead.lastTouchAt = new Date(Math.max(...dates)).toISOString();
  }
})();

const V3_SUPABASE_HEADERS = {
  apikey: V3_SUPABASE_ANON_KEY,
  Authorization: 'Bearer ' + V3_SUPABASE_ANON_KEY,
  'Content-Type': 'application/json',
};

function V3MoveLeadStage(lead, nextStage, leads = window.V3?.LEADS || V3_LEADS) {
  const normalizedStage = V3NormalizeStage(nextStage);
  const updated = leads.map(item => String(item.id) === String(lead.id) ? { ...item, stage: normalizedStage } : item);
  window.V3.LEADS = updated;
  window.dispatchEvent(new CustomEvent('v3:leads-loaded', { detail: { leads: updated } }));

  // X DM intake leads are not backed by a Supabase row, so a PATCH would no-op
  // and the lead would resurface on the next scrape. Persist the decision as a
  // card instead — its contact_name makes the daily X intake dedupe skip this
  // lead on future loads, and we relink the in-memory id so Restore can PATCH it.
  const isXIntake = String(lead?.source || '').includes('x-dm-intake') || String(lead?.id || '').startsWith('xdm-');
  if (isXIntake) {
    fetch(V3_SUPABASE_URL + '/rest/v1/cards', {
      method: 'POST',
      headers: { ...V3_SUPABASE_HEADERS, Prefer: 'return=representation' },
      body: JSON.stringify({
        list_id: normalizedStage,
        title: lead.contactName || lead.brand || 'X lead',
        contact_name: lead.contactName || '',
        lead_source: 'x-dm-intake',
        website: lead.xOpenDm || (lead.xHandle ? 'https://x.com/' + String(lead.xHandle).replace(/^@/, '') : ''),
        email: lead.email || '',
        intent: lead.deliverables || '',
      }),
    })
      .then(res => res.ok ? res.json() : null)
      .then(rows => {
        const newId = Array.isArray(rows) && rows[0] ? rows[0].id : null;
        if (newId == null) return;
        const relinked = (window.V3.LEADS || updated).map(item =>
          String(item.id) === String(lead.id) ? { ...item, id: newId, rowId: newId, source: 'x-dm-intake' } : item);
        window.V3.LEADS = relinked;
        window.dispatchEvent(new CustomEvent('v3:leads-loaded', { detail: { leads: relinked } }));
      })
      .catch(err => console.warn('[ALIGNED v4] x suppress failed:', err));
    return;
  }

  const id = lead?.rowId || lead?.id;
  if (!id) return;
  fetch(V3_SUPABASE_URL + '/rest/v1/cards?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH',
    headers: { ...V3_SUPABASE_HEADERS, Prefer: 'return=minimal' },
    body: JSON.stringify({ list_id: normalizedStage }),
  }).catch(err => console.warn('[ALIGNED v4] stage update failed:', err));
}

window.V3 = { USERS: V3_USERS, STAGES: V3_STAGES, STAGE_BY_ID: V3_STAGE_BY_ID, ACTIVE_STAGE_IDS: V3_ACTIVE_STAGE_IDS, BOARD_STAGE_IDS: V3_BOARD_STAGE_IDS, TRASH_STAGE_IDS: V3_TRASH_STAGE_IDS, LEADS: V3_VISIBLE_LEADS, TIERS: V3_TIERS, DELIV_TYPES: V3_DELIV_TYPES, BRIEF_STATUSES: V3_BRIEF_STATUSES, ROBERT_BRIEFS: V3_VISIBLE_ROBERT_BRIEFS, TASK_TYPES: V3_TASK_TYPES, GmailTime: V3GmailTime, flowCounts: v3FlowCounts, greeting: v3Greeting, deriveTasks: v3DeriveTasks, bucketTasks: v3BucketTasks, ProfileTeam: V3ProfileTeam, ProfileLane: V3ProfileLane, LeadLane: V3LeadLane, LeadVisibleToProfile: V3LeadVisibleToProfile, LeadIsMineForProfile: V3MoveIsMineForProfile, MoveIsMineForProfile: V3MoveIsMineForProfile, MoveLeadStage: V3MoveLeadStage, IsNewLeadReview: V3IsNewLeadReview, CompanyOsQualifiedLead: V3CompanyOsQualifiedLead, LeadActivityTimestamp: V3LeadActivityTimestamp, LeadReceivedTimestamp: V3LeadReceivedTimestamp, SortLeadsByActivity: V3SortLeadsByActivity, NewLeadReason: V3NewLeadReason, NewLeadSourceKind: V3NewLeadSourceKind, NewLeadSourceLabel: V3NewLeadSourceLabel, NewLeadHandle: V3NewLeadHandle, NewLeadSummary: V3NewLeadSummary, NewLeadPrimaryIdentity: V3NewLeadPrimaryIdentity };

V3LoadSupabaseLeads().then(leads => {
  window.V3.LEADS = leads;
  window.dispatchEvent(new CustomEvent('v3:leads-loaded', { detail: { leads } }));
}).catch(err => console.error('Supabase load failed:', err));
