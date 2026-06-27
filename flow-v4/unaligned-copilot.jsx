/* ============================================================================
   UNALIGNED COPILOT — "the voice of all truth". A floating chat dock (bottom
   right) wired to the SAME local LLM bridge as Draft with AI
   (window.claude.complete). It answers anything about the desk using the live
   board as context: leads, stages, pending approvals, ops_health, values, next
   moves. No new backend — it reuses window.claude + the data already in memory.

   DEPENDS ON bundle helpers: window.claude.complete, V4UseOpsHealth,
   V4AprComputeGates, V4AprNum. Concatenated/pasted into app-bundle.jsx.

   MOUNT (one render, app-level so it shows on every view): in V4App's return,
   near the <V4CommandPalette .../> mount, add:
       <UnalignedCopilot leads={mergedLeads} />
   Pairs with the `.uac-*` CSS block in styles.css.
   ============================================================================ */
function UnalignedCopilot({ leads = [] }) {
  const { useState, useRef, useEffect } = React;
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState([
    { role: 'ai', text: "I'm your line to the whole desk. Ask me anything: who's waiting on a reply, what's unpaid, which leads are hot, what a brand last said. I read the live board." },
  ]);
  const { health } = (typeof V4UseOpsHealth === 'function') ? V4UseOpsHealth() : { health: null };
  const bridge = typeof window !== 'undefined' && window.claude && window.claude.complete;
  const label = (typeof window !== 'undefined' && window.claude && window.claude.label) ? window.claude.label() : 'Mac Studio';
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, open, busy]);

  const live = (Array.isArray(leads) ? leads : []).filter(l => l && !['trash', 'dead-leads'].includes(String(l.stage || '').toLowerCase()));

  function boardContext(question) {
    const byStage = {};
    live.forEach(l => { const s = l.stage || '?'; byStage[s] = (byStage[s] || 0) + 1; });
    const gates = (typeof V4AprComputeGates === 'function') ? V4AprComputeGates(leads, '') : [];
    const pend = gates.map(g => g.label + ' ' + g.items.length).join(', ') || 'none computed';
    const stageLine = Object.keys(byStage).map(k => k + ':' + byStage[k]).join(', ');
    const top = live.slice(0, 50).map(l =>
      '- ' + (l.brand || l.contactName || 'Lead') +
      ' | stage:' + (l.stage || '?') +
      (l.value ? ' | $' + l.value : '') +
      (l.agentTier ? ' | ' + l.agentTier : '') +
      (String(l.draftReplyStatus || '').toLowerCase() === 'pending' ? ' | DRAFT PENDING' : '') +
      (l.nextMove && l.nextMove.text ? ' | next: ' + String(l.nextMove.text).slice(0, 90) : '')
    ).join('\n');

    // If the question names a brand/contact, attach that lead's recent thread.
    let detail = '';
    const q = String(question || '').toLowerCase();
    const hit = live.find(l => {
      const b = String(l.brand || '').toLowerCase();
      const c = String(l.contactName || '').toLowerCase();
      return (b && q.includes(b)) || (c && q.includes(c.split(' ')[0]));
    });
    if (hit && Array.isArray(hit.thread) && hit.thread.length) {
      detail = '\nDETAIL — ' + (hit.brand || hit.contactName) + ' recent thread:\n' +
        hit.thread.slice(-4).map(m => '[' + (m.from || '?') + '] ' + (m.subject || '') + '\n' + String(m.body || '').slice(0, 600)).join('\n---\n');
    }
    const ops = health
      ? ('local ' + (typeof V4AprNum === 'function' ? V4AprNum(health.local_tokens_today) : (health.local_tokens_today || 0)) +
         ' tok today, Claude $' + Number(health.claude_spend_today || 0).toFixed(2) + ' today, status ' + (health.status || 'ok'))
      : 'unavailable';
    return 'Active leads: ' + live.length + '\nPending approvals: ' + pend + '\nOps: ' + ops +
      '\nStages: ' + stageLine + '\nLeads:\n' + top + detail;
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    const history = msgs.slice(-6).map(m => (m.role === 'ai' ? 'Copilot: ' : 'Asher: ') + m.text).join('\n');
    setMsgs(m => [...m, { role: 'user', text }]);
    if (!bridge) {
      setMsgs(m => [...m, { role: 'ai', text: 'Local LLM bridge offline. Start scripts/active/local_llm_bridge.py on the Mac, then ask again.' }]);
      return;
    }
    setBusy(true);
    try {
      const prompt =
        'You are the UNALIGNED operator brain, Asher\'s voice of truth over the whole desk. ' +
        'Answer using the LIVE BOARD below. Be direct, concrete, and brief. Never use hyphens or em dashes; use periods or commas. ' +
        'If the board does not contain the answer, say so plainly instead of guessing.\n\n' +
        'LIVE BOARD:\n' + boardContext(text) + '\n\n' +
        (history ? 'RECENT CHAT:\n' + history + '\n\n' : '') +
        'QUESTION: ' + text + '\nAnswer:';
      const out = await window.claude.complete(prompt, { max_tokens: 900 });
      setMsgs(m => [...m, { role: 'ai', text: String(out || '').trim() || 'No answer came back.' }]);
    } catch (err) {
      setMsgs(m => [...m, { role: 'ai', text: 'That failed: ' + (err && err.message ? err.message : 'bridge error') }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={'uac' + (open ? ' is-open' : '')}>
      {open && (
        <div className="uac-panel">
          <div className="uac-hd">
            <span className="uac-dot" />
            <div className="uac-ti">Ask UNALIGNED <i>voice of all truth</i></div>
            <span className="uac-src">{bridge ? label : 'offline'}</span>
            <button className="uac-x" onClick={() => setOpen(false)}>✕</button>
          </div>
          <div className="uac-log" ref={scrollRef}>
            {msgs.map((m, i) => <div key={i} className={'uac-msg uac-' + m.role}>{m.text}</div>)}
            {busy && <div className="uac-msg uac-ai uac-think">Reading the board…</div>}
          </div>
          <div className="uac-in">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Ask about any lead, payment, or move…"
              rows={1}
            />
            <button className="uac-send" disabled={busy || !input.trim()} onClick={send}>↑</button>
          </div>
        </div>
      )}
      <button className="uac-fab" onClick={() => setOpen(o => !o)} title="Ask UNALIGNED">
        {open ? '✕' : '◆'}
      </button>
    </div>
  );
}
if (typeof window !== 'undefined') window.UnalignedCopilot = UnalignedCopilot;
