// FLOW v3 — Board view

function V3BoardView({ leads, openId, onOpen, user, ownerFilter, setOwnerFilter }) {
  const { STAGES, STAGE_BY_ID, ACTIVE_STAGE_IDS } = window.V3;
  const BOARD_STAGE_IDS = [...ACTIVE_STAGE_IDS, 'trash'];

  const filtered = leads.filter(l => {
    if (ownerFilter !== 'all' && l.ownerId !== ownerFilter) return false;
    return true;
  });

  const activeLeads = filtered.filter(l => l.stage !== 'trash');
  const trashLeads  = filtered.filter(l => l.stage === 'trash');

  return (
    <div className="board-wrap">
      <div className="board">
        {BOARD_STAGE_IDS.map(stageId => {
          const stage = STAGE_BY_ID[stageId];
          const stageLeads = stageId === 'trash'
            ? trashLeads
            : activeLeads.filter(l => l.stage === stageId);
          const needsReply = stageId === 'trash' ? [] : stageLeads.filter(l => l.needsReply);
          const waiting    = stageId === 'trash' ? [] : stageLeads.filter(l => !l.needsReply);

          return (
            <div key={stageId} className={'b-col' + (stageId === 'trash' ? ' is-trash' : '')}>
              <div className="b-col-hd">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <div className="b-col-count" style={{ color: stage.color }}>
                    {String(stageLeads.length).padStart(2, '0').slice(-2)}
                  </div>
                  <div className="b-col-name" style={{ color: stage.color }}>{stage.short}</div>
                </div>
                <div className="b-col-actions">
                  <button title="Info"><V3Icon name="more" w={14} /></button>
                  <button title="Sort"><V3Icon name="sort" w={14} /></button>
                  <button title="More"><V3Icon name="filter" w={14} /></button>
                </div>
              </div>

              <div className="b-col-body">
                {stageId !== 'trash' && needsReply.length > 0 && (
                  <>
                    <div className="b-subhead needs-reply">
                      <span>NEEDS REPLY</span>
                      <span className="cnt">{needsReply.length}</span>
                    </div>
                    {needsReply.map(l => (
                      <V3BoardCard key={l.id} lead={l} isActive={openId === l.id} user={user} onOpen={() => onOpen(l.id)} onMoveStage={(nextStage) => moveLeadStage(l, nextStage, leads)} />
                    ))}
                  </>
                )}

                {stageId !== 'trash' && waiting.length > 0 && (
                  <>
                    <div className="b-subhead waiting">
                      <span>WAITING ON THEM</span>
                      <span className="cnt">{waiting.length}</span>
                    </div>
                    {waiting.map(l => (
                      <V3BoardCard key={l.id} lead={l} isActive={openId === l.id} user={user} onOpen={() => onOpen(l.id)} onMoveStage={(nextStage) => moveLeadStage(l, nextStage, leads)} />
                    ))}
                  </>
                )}

                {stageId === 'trash' && trashLeads.length > 0 && (
                  <div className="trash-column-hint">Cards moved here can be restored later from the trash bin.</div>
                )}

                {stageLeads.length === 0 && (
                  <div style={{ padding: '20px 8px', textAlign: 'center', color: 'var(--text-4)', fontSize: 11.5 }}>
                    {stageId === 'trash' ? 'Nothing in trash' : 'Nothing here'}
                  </div>
                )}

                {stageId !== 'trash' && (
                  <button className="b-col-add">
                    <V3Icon name="plus" w={12} />
                    Add card
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function moveLeadStage(lead, nextStage, leads) {
  const updated = leads.map(item => String(item.id) === String(lead.id) ? { ...item, stage: nextStage } : item);
  fetch(V3_SUPABASE_URL + '/rest/v1/cards?id=eq.' + encodeURIComponent(lead.id), {
    method: 'PATCH',
    headers: {
      apikey: V3_SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + V3_SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ list_id: nextStage }),
  }).catch(err => console.warn('[ALIGNED v4] stage update failed:', err));
  window.V3.LEADS = updated;
  window.dispatchEvent(new CustomEvent('v3:leads-loaded', { detail: { leads: updated } }));
}

function V3BoardCard({ lead, isActive, user, onOpen, onMoveStage }) {
  const { USERS, STAGE_BY_ID } = window.V3;
  const isMine = window.V3.MoveIsMineForProfile(lead, user);
  const isThem = !lead.nextMove.who && !['paid-out'].includes(lead.stage);
  const isAssignedToMe = window.V3.LeadIsMineForProfile(lead, user);
  const sourceLabel = (lead.source || '').toUpperCase();
  const isTrash = lead.stage === 'trash';

  return (
    <div className={'b-card' + (isActive ? ' is-active' : '')} onClick={onOpen}>
      {/* Category tab */}
      {lead.category && <span className={'cat-tab cat-' + lead.category}>{lead.category}</span>}

      {/* Top row */}
      <div className="b-card-top">
        <div className="b-card-top-main">
          <span className="b-card-name">{lead.contactName}</span>
          <span className="b-card-badge">{sourceLabel.slice(0, 6)}</span>
          <span className="b-card-date">{lead.lastTouch}</span>
        </div>
        {!isTrash && (
          <button
            className="b-card-trash-btn"
            title="Move to trash"
            aria-label={'Move ' + lead.contactName + ' to trash'}
            onClick={e => { e.stopPropagation(); onMoveStage?.('trash'); }}
          >
            <V3Icon name="trash" w={12} />
          </button>
        )}
      </div>

      {/* Company */}
      <div className="b-card-co">
        <strong>{lead.brand}</strong>
        {lead.value && <span> · {v3Money(lead.value, { compact: true })}</span>}
      </div>

      {/* Next move dashed callout */}
      {isTrash ? (
        <div className="b-card-next trash">
          <div className="b-card-next-ic">
            <V3Icon name="trash" w={13} />
          </div>
          <span className="b-card-next-text">Moved to trash</span>
        </div>
      ) : (
        <div className={'b-card-next ' + (isMine ? 'you' : isThem ? 'them' : '')}>
          <div className="b-card-next-ic">
            <V3Icon name={isMine
              ? (lead.nextMove.action === 'Post' ? 'video' : lead.nextMove.action === 'Send' ? 'send' : lead.nextMove.action === 'Nudge' ? 'bell' : lead.nextMove.action === 'Invoice' ? 'invoice' : 'reply')
              : isThem ? 'clock' : 'check'} w={13} />
          </div>
          <span className="b-card-next-text">{lead.nextMove.text}</span>
        </div>
      )}

      {/* Footer */}
      <div className="b-card-foot">
        <span className="age">{lead.daysInStage}d</span>
        {!isTrash && lead.nextMove.action && (
          <button className="reply-btn" onClick={e => e.stopPropagation()}>
            <V3Icon name={lead.nextMove.action === 'Post' ? 'video' : lead.nextMove.action === 'Send' ? 'send' : lead.nextMove.action === 'Nudge' ? 'bell' : 'reply'} w={13} />
            {lead.nextMove.action}
          </button>
        )}
        <span className="stage-pill" style={{ color: STAGE_BY_ID[lead.stage].color, marginLeft: 'auto' }}>
          <span className="dot"></span>
          {STAGE_BY_ID[lead.stage].short.slice(0, 8)}
        </span>
      </div>

      {/* Approval pill at bottom */}
      {lead.approve === 'sam' && (
        <div className="approve-pill green">
          <span className="dot" style={{ background: 'currentColor' }}></span>
          Approve Sam
        </div>
      )}
      {lead.approve === 'asher' && (
        <div className="approve-pill amber">
          <span className="dot" style={{ background: 'currentColor' }}></span>
          Approve Asher
        </div>
      )}
    </div>
  );
}

Object.assign(window, { V3BoardView });
