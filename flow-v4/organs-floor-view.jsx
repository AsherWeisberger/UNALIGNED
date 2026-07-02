/* ============================================================================
   ORGANS-B FLOOR VIEW — routing dashboard (no side-scroll).
   Organs shows machine health + gate beacons; approve/send/edit live in Company OS.

   Pairs with ORGANS FLOOR (B) CSS in styles.css and organs-floor.jpg art.
   Concatenated into app-bundle.jsx — not loaded standalone.

   MOUNT at view === 'organs':
        <OrgansFloorView leads={mergedLeads} query={search}
          onOpenConsole={() => { setView('machine-room'); setOpenId(null); }}
          onOpenInCompanyOs={(leadId, gateId) => {
            V4OpenLeadInCompanyOs(leadId, V4CosQueueForGate(gateId), { compose: gateId === 'replies' });
            setView('company-os');
          }} />
   ============================================================================ */
function OrgansFloorView({ leads = [], query = '', onOpenConsole, onOpenInCompanyOs }) {
  const { useState } = React;
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(max-width: 720px)').matches : false);
  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    var mq = window.matchMedia('(max-width: 720px)');
    var on = function(){ setIsMobile(mq.matches); };
    mq.addEventListener ? mq.addEventListener('change', on) : mq.addListener(on);
    return function(){ mq.removeEventListener ? mq.removeEventListener('change', on) : mq.removeListener(on); };
  }, []);
  const { health, resume, halt } = V4UseOpsHealth();
  const [open, setOpen] = useState(null);
  const [idx, setIdx] = useState(0);
  const [tick, setTick] = useState(0);

  const gates = V4AprComputeGates(leads, query);
  const gmap = {}; gates.forEach(g => { gmap[g.id] = g; });

  const GATE_DESK = {
    replies:  { left: 40, top: 45 },
    posts:    { left: 66, top: 39 },
    briefs:   { left: 80, top: 60 },
    payments: { left: 57, top: 73 },
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

  const denyGate = (g, lead) => {
    const a = V4AprGateAction(g);
    if (lead && a) V4CosPatchLead(lead, a.deny.fields, a.deny.local);
    setTick(t => t + 1);
  };
  const routeToCos = (g, lead) => {
    if (!lead || !onOpenInCompanyOs) return;
    onOpenInCompanyOs(lead.id, g);
    closeAll();
  };
  const ignore = (lead) => {
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
          <span className="bt">Route to Company OS</span>
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
        <div className="lbl">What needs handling</div>
        <div className="what">{whatBody(g, lead)}</div>
        {whyLine(lead) && (<React.Fragment><div className="lbl">Why</div><div className="why">{whyLine(lead)}</div></React.Fragment>)}
        <div className="btns">
          <span className="b ap" onClick={() => routeToCos(g, lead)}>→ Company OS</span>
          {g !== 'replies' ? <span className="b gh" onClick={() => denyGate(g, lead)}>Deny</span> : null}
        </div>
        {g === 'replies' && (
          <button className="ig" onClick={() => ignore(lead)}>⊘ Not a system task — <b>hand to Robert</b></button>
        )}
      </div>
    );
  };

  if (isMobile) return <V4OrgansView leads={leads} query={query} onOpenConsole={onOpenConsole} onOpenInCompanyOs={onOpenInCompanyOs} />;

  return (
    <div className={'org-floor' + (halted ? ' is-halted' : '')} style={{ flex: '1 1 0', minHeight: 0 }} onClick={closeAll}>
      <div className="org-scrim"></div>

      <div className="org-hud">
        <div>
          <div className="eye">Machine Room</div>
          <h1>Organs <i>routing floor — handle in Company OS</i></h1>
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
          <div className="why">No gates lit. A beacon appears when an agent parks something — click it to open Company OS.</div>
        </div>
      )}
    </div>
  );
}
if (typeof window !== 'undefined') window.OrgansFloorView = OrgansFloorView;