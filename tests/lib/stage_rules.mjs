/**
 * JS mirror of dashboard stage + gate invariants. Must stay aligned with
 * tests/lib/dashboard_invariants.py and flow-v4/app-bundle.jsx.
 */

export const ACTIVE_STAGE_IDS = [
  'new', 'first-touch', 'engaged', 'rates-sent', 'negotiating', 'invoice-sent', 'done', 'paid-out',
];
export const TRASH_STAGE_IDS = ['trash', 'dead-leads'];
const STAGE_MAP = {
  discovery: 'new',
  build: 'engaged',
  posted: 'done',
  paid: 'paid-out',
  'anything-else': 'dead-leads',
  dead: 'dead-leads',
};

const TEAM_MARKERS = [
  'scobleizer@gmail.com',
  'asherunaligned@gmail.com',
  'unalignedx@gmail.com',
  'samlevin@mac.com',
  'sam levin',
  'robert scoble',
  'asher weisberger',
  'unaligned',
];

export function normalizeStage(listId) {
  const s = String(listId || 'new').toLowerCase();
  if (ACTIVE_STAGE_IDS.includes(s)) return s;
  if (TRASH_STAGE_IDS.includes(s)) return s;
  return STAGE_MAP[s] || 'new';
}

export function isTeamParticipant(value) {
  const text = String(value || '').toLowerCase();
  return TEAM_MARKERS.some(marker => text.includes(marker));
}

export function teamRepliedLast(thread) {
  if (!Array.isArray(thread) || !thread.length) return false;
  const latest = thread[thread.length - 1] || {};
  if (isTeamParticipant(latest.from)) return true;
  const body = String(latest.body || latest.snippet || '').toLowerCase();
  return /\b(all the best,\s*asher|best,\s*asher|thanks robert for looping me in|robert has looped me in|i handle the business side)\b/.test(body);
}

export function shouldShowInRepliesGate(lead) {
  const stage = String(lead?.stage || '').toLowerCase();
  if (stage === 'trash' || stage === 'dead-leads') return false;
  if (String(lead?.draftReplyStatus || '').toLowerCase() !== 'pending') return false;
  const body = String(lead?.draftReply?.body || '').trim();
  if (!body) return false;
  if (teamRepliedLast(lead?.thread)) return false;
  if (lead?.newReplyAt) return false;
  return true;
}