/* ============================================================================
   ORGANS-B FLOOR VIEW — the god's-eye command floor (no side-scroll).
   DROP-IN REPLACEMENT for V4OrgansView. Same props, same data source, same
   board writes — just rendered as the night-floor art with click-to-pop
   approval bubbles instead of a side-scrolling pipeline.

   Pairs with the "UNALIGNED ORGANS FLOOR (B) SHELL" CSS in styles.css
   (classes org-floor / org-hud / org-beacon / org-bubble / .ig) and the art
   at flow-v4/assets/organs-floor.jpg.

   DEPENDS ON bundle helpers already defined above V4OrgansView:
     V4UseOpsHealth, V4AprComputeGates, V4AprGateAction, V4CosPatchLead,
     V4AprMoney, V4_APR_AGENT.
   So it MUST be concatenated into app-bundle.jsx (NOT loaded as a loose file —
   standalone it has no React or helpers in scope).

   MOUNT (one swap, fully testable):
   - Get this function into the bundle (add to deploy.sh concat, or paste it
     next to V4OrgansView).
   - At  view === 'organs'  swap the component, keeping the SAME props:
        <OrgansFloorView leads={mergedLeads} query={search}
          onOpenConsole={() => { setView('machine-room'); setOpenId(null); }} />
   - Rebuild bundle, hard-refresh, open Organs. Beacons light over a desk for
     every gate that has items (same gates the line view shows). Click one ->
     bubble pops in place; Approve / Deny / Halt all write to the board live;
     Edit jumps to the full console; Ignore flags the reply human_only and
     pulls it from the queue.

   Desk positions are first-pass — nudge GATE_DESK to match the art.
   ============================================================================ */
function OrgansFloorView({ leads = [], query = '', onOpenConsole }) {
  const { useState } = React;
  const { health, resume, halt } = V4UseOpsHealth();
  const [open, setOpen] = useState(null);   // gate id whose bubble is open
  const [idx, setIdx] = useState(0);        // which item within that gate
  const [tick, setTick] = useState(0);      // bump to re-render after a board write

  const gates = V4AprComputeGates(leads, query);
  const gmap = {}; gates.forEach(g => { gmap[g.id] = g; });

  // desk anchor (% of stage) per gate — tune against organs-floor.jpg
  const GATE_DESK = {
    replies:  { left: 40, top: 45 },   // Deal Desk
    posts:    { left: 66, top: 39 },   // Calendar / Post
    briefs:   { left: 80, top: 60 },   // Brief Maker
    payments: { left: 57, top: 73 },   // Finance
  };

  const halted = !!(health && String(health.status || 'ok') !== 'ok');
  const localTok = health ? Number(health.local_tokens_today || 0).toLocaleString('en-US') : '—';
  const claudeSpend = health ? '$' + Number(health.claude_spend_today || 0).toFixed(2) : '—';

  const openGate = (id) => { setOpen(id); setIdx(0); };
  const closeAll = () => setOpen(null);

  const whatBody = (g, l) => {
    if (g === 'replies') return (l.draftReply && l.draftReply.body) || 'Drafted reply ready for review.';
    if (g === 'briefs') return l.briefBody || l.briefSummary || (l.nextMove && l.nextMove.text) || 'Brief ready for Robert sign off.';
    if (g === 'payments') return 'Invoice is out for ' + (l.brand || 'this lead') + '. Confirm payment received, then mark paid.';
    return 'Approved post scheduled for ' + (l.brand || 'this lead') + '. Mark posted once it is live.';
  };
  const whyLine = (l) => l.recommendedAction
    || (l.agentAssessment ? String(l.agentAssessment).split(/(?<=[.!?])\s/)[0] : '')
    || l.deliverables || l.stage || '';

  const act = (g, lead, kind) => {
    const a = V4AprGateAction(g);
    const move = kind === 'approve' ? a.approve : a.deny;
    if (lead && move) V4CosPatchLead(lead, move.fields, move.local);
    setTick(t => t + 1);
  };
  const ignore = (lead) => {
    // Not a system task: flag human_only (pulls it from the replies gate) and hand to Robert.
    if (lead) V4CosPatchLead(lead, { draft_reply_status: 'human_only' }, { draftReplyStatus: 'human_only' });
    setTick(t => t + 1);
  };

  const totalWaiting = gates.reduce((s, g) => s + g.items.length, 0);

  const bubble = (g) => {
    const gate = gmap[g];
    if (!gate || !gate.items.length) return null;
    const i = Math.min(idx, gate.items.length - 1);
    const lead = gate.items[i];
    const pos = GATE_DESK[g] || { left: 50, top: 50 };
    const agent = (V4_APR_AGENT && V4_APR_AGENT[g]) || 'Agent';
    const n = gate.items.length;
    return (
      <div className="org-bubble"
        style={{ left: 'calc(' + pos.left + '% + 26px)', top: Math.max(pos.top - 8, 4) + '%' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="bh">
          <span className="aib">◆ {agent}</span>
          <span className="bt">Approval needed</span>
          {n > 1 && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: '#9a8f7e', marginLeft: '6px' }}>
              <span style={{ cursor: 'pointer' }} onClick={() => setIdx((i - 1 + n) % n)}>‹</span> {i + 1}/{n} <span style={{ cursor: 'pointer' }} onClick={() => setIdx((i + 1) % n)}>›</span>
            </span>
          )}
          <span className="bx" onClick={closeAll}>✕</span>
        </div>
        <h3>{lead.brand || 'Lead'}</h3>
        <div className="chips">
          {lead.agentTier && <span className="chip">{lead.agentTier}</span>}
          {lead.value ? <span className="chip v">{V4AprMoney(lead.value)}</span> : null}
        </div>
        <div className="lbl">What you're approving</div>
        <div className="what">{whatBody(g, lead)}</div>
        {whyLine(lead) && (<React.Fragment><div className="lbl">Why</div><div className="why">{whyLine(lead)}</div></React.Fragment>)}
        <div className="btns">
          <span className="b ap" onClick={() => act(g, lead, 'approve')}>✓ Approve</span>
          <span className="b gh" onClick={() => onOpenConsole && onOpenConsole()}>Edit</span>
          <span className="b gh" onClick={() => act(g, lead, 'deny')}>Deny</span>
        </div>
        {g === 'replies' && (
          <button className="ig" onClick={() => ignore(lead)}>⊘ Not a system task — <b>hand to Robert</b></button>
        )}
      </div>
    );
  };

  return (
    <div className={'org-floor' + (halted ? ' is-halted' : '')} style={{ flex: '1 1 0', minHeight: 0 }} onClick={closeAll}>
      <div className="org-scrim"></div>

      <div className="org-hud">
        <div>
          <div className="eye">Machine Room</div>
          <h1>Organs <i>your floor, from above</i></h1>
        </div>
        <div className="gauges">
          <div className="lt"><span className="d"></span>{halted ? 'Halted' : 'Running'}</div>
          <div className="ctr"><span className="ck">Local · Qwen today</span><span className="cv">{localTok}</span></div>
          <div className="ctr"><span className="ck">Claude 10% today</span><span className="cv m">{claudeSpend}</span></div>
          <button className="halt" onClick={(e) => { e.stopPropagation(); halted ? resume() : halt(); }}>{halted ? '▶ Resume' : '⛔ Halt all'}</button>
        </div>
      </div>

      {gates.filter(g => g.items.length).map(g => {
        const pos = GATE_DESK[g.id] || { left: 50, top: 50 };
        const agent = (V4_APR_AGENT && V4_APR_AGENT[g.id]) || g.label;
        return (
          <button key={g.id} className="org-beacon" style={{ left: pos.left + '%', top: pos.top + '%' }}
            onClick={(e) => { e.stopPropagation(); open === g.id ? closeAll() : openGate(g.id); }}>
            <span className="ring"></span><span className="core"></span>
            <span className="lab">{agent} · {g.items[0].brand}{g.items.length > 1 ? ' +' + (g.items.length - 1) : ''}</span>
          </button>
        );
      })}

      {open && bubble(open)}

      {totalWaiting === 0 && (
        <div className="org-bubble" style={{ left: '50%', top: '42%' }} onClick={(e) => e.stopPropagation()}>
          <div className="bh"><span className="bt">All clear</span></div>
          <h3>Nothing waiting on you</h3>
          <div className="why">No pending approvals on the floor. A beacon lights over a desk the moment an agent has something for you.</div>
        </div>
      )}
    </div>
  );
}
if (typeof window !== 'undefined') window.OrgansFloorView = OrgansFloorView;
