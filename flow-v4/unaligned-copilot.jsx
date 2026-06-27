/* ============================================================================
   UNALIGNED COPILOT — "the voice of all truth". Floating chat dock (bottom
   right) on the SAME local LLM bridge as Draft with AI (window.claude.complete).

   AGENTIC: it doesn't just get a snapshot — it runs a ReAct loop with READ-ONLY
   lookup tools over the full in-memory board (every lead, thread, gate, ops_health),
   calling them until it can answer. Ask it anything; if it doesn't know, it digs.

   HARD SAFETY (enforced two ways — prompt rule + the only tools that exist are
   read-only in-memory lookups): it NEVER touches the Mac filesystem, runs shell,
   or modifies / creates / deletes / sends anything. There is no tool that can.

   DEPENDS ON bundle helpers: window.claude.complete, V4UseOpsHealth,
   V4AprComputeGates, V4AprNum. Mount once in V4App: <UnalignedCopilot leads={mergedLeads} />
   Pairs with the `.uac-*` CSS block in styles.css.
   ============================================================================ */
function UnalignedCopilot({ leads = [] }) {
  const { useState, useRef, useEffect } = React;
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState('');
  const [msgs, setMsgs] = useState([
    { role: 'ai', text: "I'm your line to the whole desk. Ask me anything: who's waiting on a reply, what's unpaid, which leads are hot, what a brand last said, how much is in the pipeline. I'll dig through the live board to answer." },
  ]);
  const { health } = (typeof V4UseOpsHealth === 'function') ? V4UseOpsHealth() : { health: null };
  const bridge = typeof window !== 'undefined' && window.claude && window.claude.complete;
  const label = (typeof window !== 'undefined' && window.claude && window.claude.label) ? window.claude.label() : 'Mac Studio';
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, open, busy, step]);

  const live = (Array.isArray(leads) ? leads : []).filter(l => l && !['trash', 'dead-leads'].includes(String(l.stage || '').toLowerCase()));
  const brief = (l) => ({
    brand: l.brand || l.contactName || 'Lead', stage: l.stage || '?',
    value: l.value || null, tier: l.agentTier || null,
    pendingDraft: String(l.draftReplyStatus || '').toLowerCase() === 'pending',
    next: (l.nextMove && l.nextMove.text) ? String(l.nextMove.text).slice(0, 120) : null,
  });

  // ---- READ-ONLY tools over the live board (no writes, no files, no shell) ----
  const TOOLS = {
    board_summary: () => {
      const byStage = {};
      live.forEach(l => { const s = l.stage || '?'; byStage[s] = (byStage[s] || 0) + 1; });
      const gates = (typeof V4AprComputeGates === 'function') ? V4AprComputeGates(leads, '') : [];
      const totalValue = live.reduce((s, l) => s + (Number(l.value) || 0), 0);
      return { activeLeads: live.length, byStage, totalPipelineValue: totalValue,
        pending: gates.map(g => ({ gate: g.label, count: g.items.length })) };
    },
    search_leads: (a) => {
      const q = String((a && a.query) || '').toLowerCase();
      const hits = live.filter(l => [l.brand, l.contactName, l.deliverables, l.stage, l.agentTier,
        l.nextMove && l.nextMove.text, l.recommendedAction].some(s => String(s || '').toLowerCase().includes(q)));
      return { count: hits.length, results: hits.slice(0, 15).map(brief) };
    },
    get_lead: (a) => {
      const key = String((a && (a.brand || a.id || a.query)) || '').toLowerCase();
      const l = live.find(x => String(x.brand || '').toLowerCase().includes(key) ||
        String(x.contactName || '').toLowerCase().includes(key) || String(x.id) === key);
      if (!l) return { found: false };
      return { found: true, brand: l.brand, contact: l.contactName, stage: l.stage, value: l.value || null,
        tier: l.agentTier || null, draftPending: String(l.draftReplyStatus || '').toLowerCase() === 'pending',
        draft: l.draftReply && l.draftReply.body ? String(l.draftReply.body).slice(0, 700) : null,
        assessment: l.agentAssessment || l.recommendedAction || null,
        nextMove: (l.nextMove && l.nextMove.text) || null,
        thread: Array.isArray(l.thread) ? l.thread.slice(-6).map(m => ({
          from: m.from || '?', subject: m.subject || '', body: String(m.body || '').slice(0, 500) })) : [] };
    },
    list_pending: () => {
      const gates = (typeof V4AprComputeGates === 'function') ? V4AprComputeGates(leads, '') : [];
      return gates.map(g => ({ gate: g.label, items: g.items.slice(0, 20).map(l => ({
        brand: l.brand || l.contactName, value: l.value || null,
        draft: l.draftReply && l.draftReply.body ? String(l.draftReply.body).slice(0, 200) : null })) }));
    },
    ops_health: () => health ? { status: health.status || 'ok', halt_reason: health.halt_reason || '',
      local_tokens_today: health.local_tokens_today || 0, claude_spend_today: health.claude_spend_today || 0 } : { available: false },
  };
  const TOOL_LABEL = { board_summary: 'reading the board', search_leads: 'searching leads',
    get_lead: 'pulling the lead', list_pending: 'checking approvals', ops_health: 'checking ops' };

  const SYSTEM =
    "You are the UNALIGNED operator brain, Asher's voice of truth over the whole desk. " +
    "Answer anything about the business. You have READ-ONLY tools to look up the live board; use them to figure things out before you answer.\n\n" +
    "HARD RULES (never break):\n" +
    "- You are strictly read-only. You never modify, create, delete, send, or schedule anything. You never touch the Mac's files, run shell commands, or change the system. If a request needs that, say plainly you can't and what would be needed.\n" +
    "- Never use hyphens or em dashes. Be direct, concrete, and brief.\n\n" +
    "TOOLS — to use one, output ONE line that is exactly a JSON object, nothing else:\n" +
    '{"tool":"board_summary"}\n' +
    '{"tool":"search_leads","args":{"query":"heygen"}}\n' +
    '{"tool":"get_lead","args":{"brand":"heygen"}}\n' +
    '{"tool":"list_pending"}\n' +
    '{"tool":"ops_health"}\n\n' +
    "When you have enough to answer, reply with: FINAL: <answer>\n" +
    "Look things up with tools first; only guess if the tools clearly can't help, and then say so.";

  function parseTool(out) {
    if (/FINAL:/i.test(out)) return null;
    const m = out.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { const o = JSON.parse(m[0]); return o && o.tool ? o : null; } catch (e) { return null; }
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setMsgs(m => [...m, { role: 'user', text }]);
    if (!bridge) {
      setMsgs(m => [...m, { role: 'ai', text: 'Local LLM bridge offline. Start scripts/active/local_llm_bridge.py on the Mac, then ask again.' }]);
      return;
    }
    setBusy(true); setStep('thinking');
    let transcript = '';
    let answer = '';
    try {
      for (let i = 0; i < 6; i++) {
        const prompt = SYSTEM + '\n\nQUESTION: ' + text + '\n' + transcript +
          '\nYour next step (a single tool JSON line, or "FINAL: answer"):';
        const out = String(await window.claude.complete(prompt, { max_tokens: 800 }) || '').trim();
        const call = parseTool(out);
        if (!call) { answer = out.replace(/^[\s\S]*?FINAL:\s*/i, '').trim() || out; break; }
        const fn = TOOLS[call.tool];
        setStep(TOOL_LABEL[call.tool] || ('running ' + call.tool));
        let obs;
        try { obs = fn ? fn(call.args || {}) : { error: 'unknown tool' }; }
        catch (e) { obs = { error: String(e && e.message || e) }; }
        let obsStr = JSON.stringify(obs);
        if (obsStr.length > 2200) obsStr = obsStr.slice(0, 2200) + '…';
        transcript += '\n' + out + '\nOBSERVATION: ' + obsStr;
        if (i === 5) {
          const fin = SYSTEM + '\n\nQUESTION: ' + text + '\n' + transcript + '\nNow give: FINAL: <answer>';
          answer = String(await window.claude.complete(fin, { max_tokens: 800 }) || '').replace(/^[\s\S]*?FINAL:\s*/i, '').trim();
        }
      }
      setMsgs(m => [...m, { role: 'ai', text: answer || 'No answer came back.' }]);
    } catch (err) {
      setMsgs(m => [...m, { role: 'ai', text: 'That failed: ' + (err && err.message ? err.message : 'bridge error') }]);
    } finally {
      setBusy(false); setStep('');
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
            {busy && <div className="uac-msg uac-ai uac-think">{step ? (step + '…') : 'thinking…'}</div>}
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
