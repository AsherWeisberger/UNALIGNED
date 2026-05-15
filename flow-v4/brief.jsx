// FLOW v3 — Brief panel (Asher) + Brief viewer modal (Robert)
//
// Briefs are attached to closed deals (stage = 'done' or 'invoice-sent').
// Status flow: draft → awaiting-approval → ready → in-production → shipped
//
// - Asher sees the brief inside the right drawer when he opens a closed deal.
//   He can edit any field and Approve → status becomes 'ready'.
// - Robert sees the brief in a fullscreen-style modal launched from his Today
//   task. He copies text per deliverable, marks each posted, and once all
//   deliverables ship the deal advances to invoice-sent.

// ─── Status pill ─────────────────────────────────────────────
function V3BriefStatusPill({ status }) {
  const meta = window.V3.BRIEF_STATUSES[status] || { label: status, tone: 'neutral' };
  return <span className={'brief-stat brief-stat-' + meta.tone}>{meta.short || meta.label}</span>;
}

// ─── Asher's panel: in-drawer brief review/approve ───────────
function V3BriefPanel({ lead, user, onChange, onApprove }) {
  const { TIERS } = window.V3;
  const [brief, setBrief] = React.useState(lead.brief);
  const [drafting, setDrafting] = React.useState(false);
  const [draftError, setDraftError] = React.useState(null);

  if (!brief) return null;
  const tier = TIERS[brief.tier];
  const canApprove = user === 'asher' && brief.status === 'awaiting-approval';
  const isShipped = brief.status === 'shipped';

  const updateBrief = (patch) => {
    const next = { ...brief, ...patch };
    setBrief(next);
    lead.brief = next; // mutate so other views (Robert's Today) see updates
    if (onChange) onChange(next);
  };
  const updateDeliv = (i, patch) => {
    const next = brief.deliverables.map((d, idx) => idx === i ? { ...d, ...patch } : d);
    updateBrief({ deliverables: next });
  };

  // AI drafting via window.claude — pre-fills draft text from email thread + tier
  const aiDraft = async () => {
    if (!window.claude?.complete) return;
    setDrafting(true); setDraftError(null);
    try {
      const ctx = (lead.thread || []).map(m => `[${m.from}] ${m.subject}\n${m.body}`).join('\n\n---\n\n');
      const tierItems = tier.items.join(', ');
      const undrafted = brief.deliverables.findIndex(d => !d.draftText && d.type !== 'newsletter' && d.type !== 'retweet');
      if (undrafted === -1) { setDrafting(false); return; }
      const d = brief.deliverables[undrafted];

      const prompt = `You're drafting social copy for Robert Scoble (founder of UNALIGNED, large X/LinkedIn following in tech).
Brand: ${lead.brand}.
Tier ${brief.tier} (${tier.name}): ${tierItems}.
This deliverable: ${d.type} — ${d.title}.
${d.hook ? 'Hook the brand suggested: ' + d.hook : ''}
${d.beats ? 'Story beats: ' + d.beats.join('; ') : ''}
${d.angle ? 'Angle: ' + d.angle : ''}
Must include: ${(brief.mustInclude || []).join(', ')}.
Must avoid: ${(brief.mustAvoid || []).join(', ')}.
Notes: ${brief.notes || '—'}.

Email context with the brand:
${ctx.slice(0, 2000)}

Write ONLY the post copy — no preamble, no quotes, no markdown. Keep it under 280 chars for an X post; 600 chars for LinkedIn. Use Robert's voice: direct, observational, occasionally dry. Don't sound like marketing.`;
      const out = await window.claude.complete(prompt);
      updateDeliv(undrafted, { draftText: out.trim() });
    } catch (e) {
      setDraftError(e.message || 'Drafting failed');
    } finally {
      setDrafting(false);
    }
  };

  const approve = () => {
    updateBrief({ status: 'ready', approvedBy: user, approvedAt: 'just now' });
    if (onApprove) onApprove();
  };

  return (
    <div className="brief-panel">
      <div className="brief-panel-hd">
        <div>
          <div className="brief-panel-eyebrow">Content brief</div>
          <h3 className="brief-panel-title">{tier.name} · ${tier.price.toLocaleString()}</h3>
        </div>
        <V3BriefStatusPill status={brief.status} />
      </div>

      <div className="brief-meta">
        <div className="brief-meta-row">
          <span className="brief-meta-lbl">Deadline</span>
          <span className="brief-meta-val">
            {brief.deadlineDays >= 0 ? `in ${brief.deadlineDays} day${brief.deadlineDays === 1 ? '' : 's'}` : `${Math.abs(brief.deadlineDays)}d past`}
          </span>
        </div>
        <div className="brief-meta-row">
          <span className="brief-meta-lbl">Window</span>
          <span className="brief-meta-val">{brief.postingWindow || '—'}</span>
        </div>
        {brief.approvedBy && (
          <div className="brief-meta-row">
            <span className="brief-meta-lbl">Approved</span>
            <span className="brief-meta-val">{brief.approvedBy} · {brief.approvedAt}</span>
          </div>
        )}
        {brief.draftedBy && !brief.approvedBy && (
          <div className="brief-meta-row">
            <span className="brief-meta-lbl">Drafted</span>
            <span className="brief-meta-val">{brief.draftedBy} · {brief.draftedAt}</span>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="brief-block">
        <div className="brief-block-lbl">Summary</div>
        <textarea className="brief-input brief-textarea" rows={2} value={brief.summary || ''}
                  onChange={e => updateBrief({ summary: e.target.value })}
                  disabled={isShipped}
                  placeholder="One-line angle for the campaign." />
      </div>

      {/* Must include / must avoid */}
      <div className="brief-twocol">
        <div className="brief-block">
          <div className="brief-block-lbl">Must include</div>
          <V3BriefChips items={brief.mustInclude || []} onChange={v => updateBrief({ mustInclude: v })} placeholder="Add item…" tone="good" disabled={isShipped} />
        </div>
        <div className="brief-block">
          <div className="brief-block-lbl">Must avoid</div>
          <V3BriefChips items={brief.mustAvoid || []} onChange={v => updateBrief({ mustAvoid: v })} placeholder="Add item…" tone="bad" disabled={isShipped} />
        </div>
      </div>

      {/* Notes */}
      <div className="brief-block">
        <div className="brief-block-lbl">Notes for Robert</div>
        <textarea className="brief-input brief-textarea" rows={2} value={brief.notes || ''}
                  onChange={e => updateBrief({ notes: e.target.value })}
                  disabled={isShipped}
                  placeholder="Anything tonal / context Robert needs." />
      </div>

      {/* Deliverables */}
      <div className="brief-block">
        <div className="brief-block-lbl brief-block-lbl-row">
          <span>Deliverables · {brief.deliverables.length}</span>
          {user === 'asher' && !isShipped && (
            <button className="btn btn-sm btn-ghost" onClick={aiDraft} disabled={drafting}>
              <V3Icon name="spark" w={12} /> {drafting ? 'Drafting…' : 'Draft with AI'}
            </button>
          )}
        </div>
        {draftError && <div className="brief-err">⚠ {draftError}</div>}
        <div className="brief-delivs">
          {brief.deliverables.map((d, i) => (
            <V3BriefDelivEditor key={d.id} deliv={d} idx={i} onChange={p => updateDeliv(i, p)} disabled={isShipped} />
          ))}
        </div>
      </div>

      {canApprove && (
        <div className="brief-approve-bar">
          <div>
            <strong>Send to Robert?</strong>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              Once approved, this becomes a task on Robert's Today tab.
            </div>
          </div>
          <button className="btn btn-good btn-approve" onClick={approve}>
            <V3Icon name="check" w={13} /> Approve & send to Robert
          </button>
        </div>
      )}
      {brief.status === 'ready' && (
        <div className="brief-approve-bar brief-approve-bar-ready">
          <div>
            <V3Icon name="check" w={13} /> <strong>Approved · ready for Robert</strong>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              {brief.deliverables.filter(d => d.status === 'shipped').length} of {brief.deliverables.length} shipped.
            </div>
          </div>
          {user === 'robert' && (
            <button className="btn btn-accent" onClick={() => window.dispatchEvent(new CustomEvent('v3:open-brief', { detail: { leadId: lead.id } }))}>
              Open & post →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Per-deliverable editor (used inside Asher's panel) ──────
function V3BriefDelivEditor({ deliv, idx, onChange, disabled }) {
  const { DELIV_TYPES } = window.V3;
  const meta = DELIV_TYPES[deliv.type] || { label: deliv.type, icon: 'doc', short: deliv.type.toUpperCase() };
  const [open, setOpen] = React.useState(idx === 0); // first one expanded by default

  return (
    <div className={'deliv deliv-' + deliv.type}>
      <header className="deliv-hd" onClick={() => setOpen(o => !o)}>
        <div className={'deliv-type tk-type tk-type-' + (deliv.type === 'linkedin' ? 'reply' : deliv.type === 'retweet' ? 'nudge' : deliv.type === 'newsletter' ? 'invoice' : 'rates')}>
          <V3Icon name={meta.icon} w={12} />
        </div>
        <div className="deliv-hd-text">
          <div className="deliv-title">{deliv.title}</div>
          <div className="deliv-sub">{meta.short}{deliv.status === 'shipped' ? ' · SHIPPED' : ''}</div>
        </div>
        <V3Icon name={open ? 'chev_d' : 'chev_r'} w={13} />
      </header>
      {open && (
        <div className="deliv-body">
          {deliv.type === 'retweet' && (
            <>
              <Field label="Source post URL">
                <input className="brief-input" value={deliv.sourceUrl || ''}
                       onChange={e => onChange({ sourceUrl: e.target.value })} disabled={disabled} />
              </Field>
              {deliv.sourcePreview && <div className="deliv-preview">{deliv.sourcePreview}</div>}
            </>
          )}
          {deliv.type === 'quote' && (
            <>
              <Field label="Source post URL">
                <input className="brief-input" value={deliv.sourceUrl || ''}
                       onChange={e => onChange({ sourceUrl: e.target.value })} disabled={disabled} />
              </Field>
              <Field label="Robert's quote (≤3 sentences)">
                <textarea className="brief-input brief-textarea" rows={3} value={deliv.quote || ''}
                          onChange={e => onChange({ quote: e.target.value })} disabled={disabled} />
              </Field>
            </>
          )}
          {(deliv.type === 'custom-x' || deliv.type === 'linkedin') && (
            <>
              {deliv.hook && (
                <Field label="Hook">
                  <input className="brief-input" value={deliv.hook}
                         onChange={e => onChange({ hook: e.target.value })} disabled={disabled} />
                </Field>
              )}
              {deliv.angle && (
                <Field label="Angle">
                  <input className="brief-input" value={deliv.angle}
                         onChange={e => onChange({ angle: e.target.value })} disabled={disabled} />
                </Field>
              )}
              {deliv.beats && (
                <Field label="Story beats">
                  <ol className="deliv-beats">
                    {deliv.beats.map((b, i) => (
                      <li key={i}>
                        <input className="brief-input" value={b} disabled={disabled}
                               onChange={e => {
                                 const next = [...deliv.beats]; next[i] = e.target.value;
                                 onChange({ beats: next });
                               }} />
                      </li>
                    ))}
                  </ol>
                </Field>
              )}
              <Field label={"Draft text · " + (deliv.draftText ? deliv.draftText.length : 0) + " chars"}>
                <textarea className="brief-input brief-textarea" rows={6} value={deliv.draftText || ''}
                          onChange={e => onChange({ draftText: e.target.value })}
                          disabled={disabled}
                          placeholder="Paste or write the post copy here. AI can pre-fill." />
              </Field>
            </>
          )}
          {deliv.type === 'thread' && (
            <Field label="Thread posts">
              <textarea className="brief-input brief-textarea" rows={8} value={deliv.draftText || ''}
                        onChange={e => onChange({ draftText: e.target.value })} disabled={disabled}
                        placeholder="Each post separated by a blank line." />
            </Field>
          )}
          {deliv.type === 'newsletter' && (
            <>
              <Field label="Slot">
                <input className="brief-input" value={deliv.slot || ''}
                       onChange={e => onChange({ slot: e.target.value })} disabled={disabled} />
              </Field>
              <Field label="Blurb">
                <textarea className="brief-input brief-textarea" rows={3} value={deliv.blurb || ''}
                          onChange={e => onChange({ blurb: e.target.value })} disabled={disabled} />
              </Field>
              <Field label="CTA URL">
                <input className="brief-input" value={deliv.ctaUrl || ''}
                       onChange={e => onChange({ ctaUrl: e.target.value })} disabled={disabled} />
              </Field>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="field">
      <div className="field-lbl">{label}</div>
      {children}
    </div>
  );
}

function V3BriefChips({ items, onChange, placeholder, tone, disabled }) {
  const [draft, setDraft] = React.useState('');
  const add = () => {
    if (!draft.trim()) return;
    onChange([...items, draft.trim()]);
    setDraft('');
  };
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i));
  return (
    <div className={'chip-set chip-set-' + (tone || 'neutral')}>
      {items.map((c, i) => (
        <span key={i} className="chip">
          {c}
          {!disabled && <button className="chip-x" onClick={() => remove(i)}>×</button>}
        </span>
      ))}
      {!disabled && (
        <input className="chip-input" placeholder={placeholder} value={draft}
               onChange={e => setDraft(e.target.value)}
               onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
               onBlur={add} />
      )}
    </div>
  );
}

// ─── Robert's BRIEF VIEWER MODAL ──────────────────────────────
// Fullscreen-style execution view. Shows each deliverable as a card with
// "Copy text" and "Mark posted" buttons; once all deliverables shipped,
// advances the deal to invoice-sent.
function V3BriefViewer({ lead, user, onClose, onAllShipped }) {
  const { TIERS, DELIV_TYPES, BRIEF_STATUSES } = window.V3;
  const [brief, setBrief] = React.useState(lead.brief);
  if (!brief) return null;
  const tier = TIERS[brief.tier];

  const updateDeliv = (i, patch) => {
    const next = brief.deliverables.map((d, idx) => idx === i ? { ...d, ...patch } : d);
    const allShipped = next.every(d => d.status === 'shipped' || d.type === 'newsletter');
    const newStatus = allShipped ? 'shipped' : (next.some(d => d.status === 'shipped') ? 'in-production' : brief.status);
    const nextBrief = { ...brief, deliverables: next, status: newStatus };
    setBrief(nextBrief);
    lead.brief = nextBrief;
    if (allShipped && onAllShipped) onAllShipped();
  };

  const shippedCount = brief.deliverables.filter(d => d.status === 'shipped').length;
  const total = brief.deliverables.length;

  return (
    <div className="brief-modal-back" onClick={onClose}>
      <div className="brief-modal" onClick={e => e.stopPropagation()}>
        <header className="brief-modal-hd">
          <div className="brief-modal-hd-left">
            <button className="hd-icon-btn" onClick={onClose} aria-label="Close"><V3Icon name="x" /></button>
            <div>
              <div className="brief-modal-eyebrow">
                {lead.brand} · {tier.name} · ${tier.price.toLocaleString()}
              </div>
              <h2 className="brief-modal-title">{lead.brand} brief</h2>
            </div>
          </div>
          <div className="brief-modal-hd-right">
            <div className="brief-modal-progress">
              <div className="brief-modal-progress-bar">
                <div className="brief-modal-progress-fill" style={{ width: (shippedCount / total * 100) + '%' }}></div>
              </div>
              <div className="brief-modal-progress-text">{shippedCount} / {total} shipped</div>
            </div>
            <V3BriefStatusPill status={brief.status} />
          </div>
        </header>

        <div className="brief-modal-body">
          {/* Summary card */}
          <section className="brief-card brief-card-summary">
            <div className="brief-card-row">
              <div>
                <div className="brief-card-lbl">Deadline</div>
                <div className="brief-card-val">
                  {brief.deadlineDays >= 0
                    ? <><strong>{brief.deadlineDays === 0 ? 'Today' : brief.deadlineDays + ' day' + (brief.deadlineDays === 1 ? '' : 's')}</strong> · {brief.postingWindow}</>
                    : <strong style={{ color: 'var(--bad)' }}>{Math.abs(brief.deadlineDays)} days past · {brief.postingWindow}</strong>}
                </div>
              </div>
              <div>
                <div className="brief-card-lbl">Approved by</div>
                <div className="brief-card-val">{brief.approvedBy || '—'} · {brief.approvedAt || ''}</div>
              </div>
            </div>
            {brief.summary && (
              <div className="brief-card-summary-body">
                <div className="brief-card-lbl">Angle</div>
                <p>{brief.summary}</p>
              </div>
            )}
            {brief.notes && (
              <div className="brief-card-notes">
                <V3Icon name="bolt" w={13} /> {brief.notes}
              </div>
            )}
            <div className="brief-card-rules">
              {brief.mustInclude?.length > 0 && (
                <div>
                  <div className="brief-card-rules-lbl rules-good">Must include</div>
                  <div className="chip-set chip-set-good">
                    {brief.mustInclude.map((c, i) => <span key={i} className="chip">{c}</span>)}
                  </div>
                </div>
              )}
              {brief.mustAvoid?.length > 0 && (
                <div>
                  <div className="brief-card-rules-lbl rules-bad">Must avoid</div>
                  <div className="chip-set chip-set-bad">
                    {brief.mustAvoid.map((c, i) => <span key={i} className="chip">{c}</span>)}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Deliverable cards */}
          {brief.deliverables.map((d, i) => (
            <V3BriefDelivCard key={d.id} deliv={d} idx={i}
                              brand={lead.brand}
                              canShip={user === 'robert' && brief.status === 'ready' || brief.status === 'in-production'}
                              onShip={url => updateDeliv(i, { status: 'shipped', postedAt: 'just now', postedUrl: url || d.postedUrl })}
                              onUnship={() => updateDeliv(i, { status: 'ready', postedAt: null, postedUrl: null })} />
          ))}
        </div>
      </div>
    </div>
  );
}

function V3BriefDelivCard({ deliv, idx, brand, canShip, onShip, onUnship }) {
  const { DELIV_TYPES } = window.V3;
  const meta = DELIV_TYPES[deliv.type] || { label: deliv.type, icon: 'doc' };
  const [copied, setCopied] = React.useState(false);
  const [postedUrl, setPostedUrl] = React.useState('');

  const isShipped = deliv.status === 'shipped';
  const hasCopyable = deliv.draftText || deliv.quote || deliv.blurb;
  const copyText = deliv.draftText || deliv.quote || deliv.blurb || '';

  const doCopy = async () => {
    try { await navigator.clipboard.writeText(copyText); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch {}
  };
  const doShip = () => onShip(postedUrl || null);

  const platform = ({ 'custom-x': 'x.com', 'thread': 'x.com', 'quote': 'x.com', 'retweet': 'x.com', 'linkedin': 'linkedin.com', 'newsletter': 'newsletter' })[deliv.type];

  return (
    <section className={'brief-card brief-deliv-card' + (isShipped ? ' is-shipped' : '')}>
      <header className="brief-deliv-hd">
        <div className={'deliv-num'}>0{idx + 1}</div>
        <div className={'deliv-type tk-type tk-type-' + (deliv.type === 'linkedin' ? 'reply' : deliv.type === 'retweet' ? 'nudge' : deliv.type === 'newsletter' ? 'invoice' : 'rates')}>
          <V3Icon name={meta.icon} w={14} />
        </div>
        <div className="brief-deliv-hd-text">
          <h3 className="brief-deliv-title">{deliv.title}</h3>
          <div className="brief-deliv-sub">{meta.label} · {platform}</div>
        </div>
        {isShipped
          ? <span className="brief-deliv-status shipped"><V3Icon name="check" w={12} /> Shipped {deliv.postedAt || ''}</span>
          : <span className="brief-deliv-status ready">Ready to post</span>}
      </header>

      <div className="brief-deliv-body">
        {/* Source URL for retweets/quotes */}
        {(deliv.type === 'retweet' || deliv.type === 'quote') && deliv.sourceUrl && (
          <div className="brief-deliv-source">
            <div className="brief-card-lbl">Retweet / quote this post</div>
            <div className="brief-deliv-url-row">
              <a className="brief-deliv-url" href={deliv.sourceUrl} target="_blank" rel="noreferrer">{deliv.sourceUrl}</a>
              <button className="btn btn-sm" onClick={() => navigator.clipboard.writeText(deliv.sourceUrl)}>Copy URL</button>
            </div>
            {deliv.sourcePreview && <div className="deliv-preview">{deliv.sourcePreview}</div>}
          </div>
        )}

        {/* Hook + beats for custom posts */}
        {(deliv.hook || deliv.angle) && (
          <div className="brief-deliv-hook">
            <div className="brief-card-lbl">{deliv.hook ? 'Hook' : 'Angle'}</div>
            <p>{deliv.hook || deliv.angle}</p>
          </div>
        )}

        {deliv.beats && deliv.beats.length > 0 && (
          <div className="brief-deliv-beats">
            <div className="brief-card-lbl">Story beats</div>
            <ol>{deliv.beats.map((b, i) => <li key={i}>{b}</li>)}</ol>
          </div>
        )}

        {/* The actual copy-pastable text */}
        {hasCopyable && (
          <div className="brief-deliv-copy">
            <div className="brief-deliv-copy-hd">
              <div className="brief-card-lbl">Post text · {copyText.length} chars</div>
              <button className="btn btn-sm btn-primary" onClick={doCopy}>
                <V3Icon name={copied ? 'check' : 'doc'} w={12} /> {copied ? 'Copied!' : 'Copy text'}
              </button>
            </div>
            <pre className="brief-deliv-text">{copyText}</pre>
          </div>
        )}

        {/* Quote-specific: source post + custom quote */}
        {deliv.type === 'quote' && deliv.quote && (
          <div className="brief-deliv-copy">
            <div className="brief-deliv-copy-hd">
              <div className="brief-card-lbl">Your quote</div>
              <button className="btn btn-sm btn-primary" onClick={() => navigator.clipboard.writeText(deliv.quote)}>
                <V3Icon name="doc" w={12} /> Copy quote
              </button>
            </div>
            <pre className="brief-deliv-text">{deliv.quote}</pre>
          </div>
        )}

        {/* Newsletter — typically not Robert's job */}
        {deliv.type === 'newsletter' && (
          <div className="brief-deliv-newsletter">
            <div className="brief-card-lbl">Newsletter slot</div>
            <p><strong>{deliv.slot}</strong> — {deliv.scheduledFor}</p>
            <div className="brief-deliv-newsletter-note">
              <V3Icon name="bolt" w={12} /> Newsletter inclusion is handled by Asher. Confirmed slot.
            </div>
          </div>
        )}

        {/* Ship controls */}
        {canShip && !isShipped && deliv.type !== 'newsletter' && (
          <div className="brief-deliv-ship">
            <input className="brief-input brief-deliv-url-input"
                   placeholder="Posted URL (optional) — paste once live"
                   value={postedUrl}
                   onChange={e => setPostedUrl(e.target.value)} />
            <button className="btn btn-good btn-ship" onClick={doShip}>
              <V3Icon name="check" w={13} /> Mark posted
            </button>
          </div>
        )}

        {isShipped && deliv.postedUrl && (
          <div className="brief-deliv-shipped">
            <V3Icon name="check" w={12} />
            <a href={deliv.postedUrl} target="_blank" rel="noreferrer">{deliv.postedUrl}</a>
            <button className="btn btn-sm btn-ghost" onClick={onUnship}>Undo</button>
          </div>
        )}
        {isShipped && !deliv.postedUrl && (
          <div className="brief-deliv-shipped">
            <V3Icon name="check" w={12} /> <span>Marked shipped {deliv.postedAt || ''}</span>
            <button className="btn btn-sm btn-ghost" onClick={onUnship}>Undo</button>
          </div>
        )}
      </div>
    </section>
  );
}

Object.assign(window, { V3BriefPanel, V3BriefViewer, V3BriefStatusPill });
