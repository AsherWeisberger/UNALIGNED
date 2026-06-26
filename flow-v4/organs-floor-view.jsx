/* ============================================================================
   ORGANS-B FLOOR VIEW — the god's-eye command floor (no side-scroll).
   Presentational React component for the Machine Room. Pairs with the
   "UNALIGNED ORGANS FLOOR (B) SHELL" CSS block in styles.css (classes
   org-floor / org-hud / org-beacon / org-bubble / .ig).

   WHY IT SHIPS AS A STANDALONE FILE: nothing imports it yet, so it cannot
   break the live bundle. Claude mounts it in a tested, local step.

   MOUNT IN 4 STEPS (Claude, local + testable):
   1. Add this file to the deploy.sh concat list so it lands in app-bundle.jsx
      (or paste the function into views.jsx above the Machine Room view).
   2. In the Machine Room view, swap the <V4LiveTaskFloor .../> block for:
        <OrgansFloorView workers={workers} onOpenLead={onOpenLead}
          onApprove={...} onDeny={...} onIgnore={...} opsHealth={...} />
      Render it inside a full-height container (the .machine-theater area works).
   3. Rebuild the bundle, hard-refresh, click Machine Room. Beacons should
      appear over desks for every lead with draftReplyStatus === 'pending'.
   4. Wire the three board-write handlers (THIS IS THE REAL WORK — no existing
      handler to copy, so build + test against Supabase):
        onApprove(item) -> send the gated reply (still human-gated, nothing auto-sends)
        onDeny(item)    -> discard the draft, stage -> declined/passed
        onIgnore(item)  -> flag the card route_to_robert / human_only and pull it
                           from the queue. NOT a discard. Distinct from Deny.
      Until those are passed, Approve falls back to opening the lead, and
      Deny/Ignore are inert — the view renders and is safe, just not yet active.

   PROPS CONTRACT:
   - workers   : the same array the Machine Room already builds (worker.items are leads)
   - onOpenLead(id)        : existing handler, opens the thread (used by Edit)
   - onApprove/onDeny/onIgnore(item) : optional board writes (step 4)
   - opsHealth : { status:'ok'|'halted', localTokens, claudeSpend, onHalt } (optional)

   Field reads are defensive (optional chaining + fallbacks) so missing card
   fields never crash the in-browser build. Desk positions are first-pass —
   nudge the DESK map to match the art.
   ============================================================================ */
function OrgansFloorView({ workers = [], onOpenLead, onApprove, onDeny, onIgnore, opsHealth = {} }) {
  const { useState } = React;
  const [openKey, setOpenKey] = useState(null);

  // desk positions (% of stage) per worker id — tune against organs-floor.jpg
  const DESK = {
    intake:   { left: 20, top: 40 },
    reply:    { left: 37, top: 46 },
    pricing:  { left: 54, top: 44 },
    calendar: { left: 68, top: 55 },
    brief:    { left: 80, top: 60 },
    finance:  { left: 60, top: 74 },
    tracker:  { left: 33, top: 70 },
    qa:       { left: 47, top: 72 },
  };
  const GATE = {
    intake: 'Triage', reply: 'Reply', pricing: 'Pricing', calendar: 'Calendar',
    brief: 'Brief', finance: 'Payment', tracker: 'Tracker', qa: 'QA',
  };

  // derive pending approvals from live worker items
  const pending = [];
  (workers || []).forEach(w => (w.items || []).forEach(it => {
    const st = String(it.draftReplyStatus || '').toLowerCase();
    if (st === 'pending' || it.draftReply) pending.push({ worker: w, item: it, key: w.id + ':' + it.id });
  }));

  const draftText = (it) => {
    const d = it.draftReply;
    if (!d) return it.nextMove && it.nextMove.text ? it.nextMove.text : 'Drafted reply ready for review.';
    if (typeof d === 'string') return d;
    return d.body || d.text || d.subject || 'Drafted reply ready for review.';
  };
  const valOf  = (it) => it.estimatedValue || it.value || it.dealValue || null;
  const tierOf = (it) => it.tier || it.mappedTier || it.stage || null;
  const whyOf  = (it, w) => it.assessment || it.agentAssessment || it.note || (w && w.note) || '';

  const halted = (opsHealth.status || 'ok') !== 'ok';

  return (
    <div className={"org-floor" + (halted ? " is-halted" : "")} onClick={() => setOpenKey(null)}>
      <div className="org-scrim"></div>

      <div className="org-hud">
        <div>
          <div className="eye">Machine Room</div>
          <h1>Organs <i>your floor, from above</i></h1>
        </div>
        <div className="gauges">
          <div className="lt"><span className="d"></span>{halted ? 'Halted' : 'Running'}</div>
          <div className="ctr"><span className="ck">Local · Qwen today</span><span className="cv">{opsHealth.localTokens || '—'}</span></div>
          <div className="ctr"><span className="ck">Claude 10% today</span><span className="cv m">{opsHealth.claudeSpend || '—'}</span></div>
          <button className="halt" onClick={(e) => { e.stopPropagation(); opsHealth.onHalt && opsHealth.onHalt(); }}>⛔ Halt all</button>
        </div>
      </div>

      {pending.map(({ worker, item, key }, i) => {
        const pos = DESK[worker.id] || { left: 15 + (i * 13) % 70, top: 45 + (i % 3) * 12 };
        const isOpen = openKey === key;
        return (
          <React.Fragment key={key}>
            <button
              className="org-beacon"
              style={{ left: pos.left + '%', top: pos.top + '%' }}
              onClick={(e) => { e.stopPropagation(); setOpenKey(isOpen ? null : key); }}
            >
              <span className="ring"></span><span className="core"></span>
              <span className="lab">{(GATE[worker.id] || worker.name)} · {item.brand}</span>
            </button>

            {isOpen && (
              <div
                className="org-bubble"
                style={{ left: 'calc(' + pos.left + '% + 26px)', top: Math.max(pos.top - 8, 4) + '%' }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="bh">
                  <span className="aib">◆ {worker.name}</span>
                  <span className="bt">Approval needed</span>
                  <span className="bx" onClick={() => setOpenKey(null)}>✕</span>
                </div>
                <h3>{item.brand}</h3>
                <div className="chips">
                  {tierOf(item) && <span className="chip">{tierOf(item)}</span>}
                  {valOf(item) && <span className="chip v">{valOf(item)}</span>}
                </div>
                <div className="lbl">What you're approving</div>
                <div className="what">{draftText(item)}</div>
                {whyOf(item, worker) && (
                  <React.Fragment>
                    <div className="lbl">Why</div>
                    <div className="why">{whyOf(item, worker)}</div>
                  </React.Fragment>
                )}
                <div className="btns">
                  <span className="b ap" onClick={() => onApprove ? onApprove(item) : (onOpenLead && onOpenLead(item.id))}>✓ Approve</span>
                  <span className="b gh" onClick={() => onOpenLead && onOpenLead(item.id)}>Edit</span>
                  <span className="b gh" onClick={() => onDeny && onDeny(item)}>Deny</span>
                </div>
                <button className="ig" onClick={() => onIgnore && onIgnore(item)}>⊘ Not a system task — <b>hand to Robert</b></button>
              </div>
            )}
          </React.Fragment>
        );
      })}

      {pending.length === 0 && (
        <div className="org-bubble" style={{ left: '50%', top: '42%' }}>
          <div className="bh"><span className="bt">All clear</span></div>
          <h3>Nothing waiting on you</h3>
          <div className="why">No pending approvals on the floor right now. A beacon lights over a desk the moment an agent has something for you.</div>
        </div>
      )}
    </div>
  );
}
if (typeof window !== 'undefined') window.OrgansFloorView = OrgansFloorView;
