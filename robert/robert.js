import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://hbnpwphxjurvtydezwgh.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhibnB3cGh4anVydnR5ZGV6d2doIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MTQ1MzIsImV4cCI6MjA5MDk5MDUzMn0.p5E48__GlGqjC17Z28q8fYFK-qV8CmiidYIP02vGe4s";
const SEND_EMAIL_URL = "https://us-central1-unaligned-fc556.cloudfunctions.net/sendEmail";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const state = { cards: [], view: "today", selectedId: null, search: "", draftSender: "robert" };
const $ = (id) => document.getElementById(id);
const now = new Date();

const internalSender = /(robert|scoble|asher|sam|unaligned|levangie|brayden)/i;
const activeStages = ["first-touch", "engaged", "rates-sent", "negotiating", "invoice-sent"];
const terminalStages = ["done", "paid-out", "dead-leads"];
const moneyStages = ["rates-sent", "negotiating", "invoice-sent"];
const todayLimit = 30;

const stageLabels = {
  "first-touch": "First touch",
  engaged: "Engaged",
  "rates-sent": "Rates sent",
  negotiating: "Negotiating",
  "invoice-sent": "Invoice",
  "paid-out": "Paid",
  done: "Done",
  "dead-leads": "Not needed",
  new: "New"
};

const views = {
  today: ["Inbox", "What needs attention now"],
  sent: ["Sent", "Waiting on the lead"],
  reply: ["Needs reply", "People waiting on us"],
  overdue: ["Overdue", "Old conversations to clear"],
  money: ["Money", "Revenue threads"],
  tomorrow: ["Tomorrow", "Follow-ups to schedule"],
  cleanup: ["Cleanup", "Cards with bad data"],
  closed: ["Closed", "Done and not needed"],
  all: ["All leads", "Every lead card"]
};

const draftSenders = { robert: "Robert", sam: "Sam", asher: "Asher" };

const welcomeDone = [
  "This page is a Gmail-style command center for Robert's lead flow, not a generic Kanban board.",
  "Gmail scraper now dedupes by Gmail thread so reply chains stay together.",
  "Local Ollama filtering is active with qwen3-coder:30b to avoid paid LLM filtering costs.",
  "Robert, Sam, and Asher sender buttons are wired through Gmail OAuth.",
  "Asher is automatically included on outgoing board conversations.",
  "The left side separates work into Inbox, Waiting, Money, Cleanup, and All leads so the team can act faster."
];

function text(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value.trim() || fallback;
  return String(value);
}

function html(value) {
  return text(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[char]));
}

function maybeJson(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return null; }
}

function parseDate(value) {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

function number(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function shortDate(value) {
  const d = parseDate(value);
  if (!d) return "No date";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d);
}

function longDate(value) {
  const d = parseDate(value);
  if (!d) return "No date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(d);
}

function daysSince(value) {
  const d = parseDate(value);
  if (!d) return 999;
  return Math.max(0, Math.floor((now - d) / 86400000));
}

const blockedLeadNames = /^(a|an|and|as|attached|best|business|collaboration|dear|excited|founder|hello|hey|hi|i|me|my|please|quote|reply|requesting|robert|sam|asher|scoble|unaligned|we|what|you|your)$/i;
const leadNamePatterns = [
  /\bhello\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})[!,.\s]/,
  /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s+(?:is|was|wants|wanted|requested|requesting|asks|asked|needs|has)\b/,
  /\b(?:for|with|from)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/
];

function cleanLeadName(value) {
  const cleaned = text(value)
    .replace(/<[^>]+>/g, "")
    .replace(/[*_`~()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[,:;.!?]+$/g, "")
    .trim();
  if (!cleaned || blockedLeadNames.test(cleaned) || internalSender.test(cleaned)) return "";
  return cleaned;
}

function inferLeadName(values) {
  const blob = values.filter(Boolean).join("\n");
  for (const pattern of leadNamePatterns) {
    const match = blob.match(pattern);
    const name = cleanLeadName(match?.[1]);
    if (name) return name;
  }
  return "";
}

function inferLeadEmail(values) {
  const blob = values.filter(Boolean).join("\n");
  const matches = blob.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return matches.find((email) => !internalSender.test(email) && !/(calendar|invite|notification|no-?reply)/i.test(email)) || "";
}

function inferLeadCompany(values) {
  const blob = values.filter(Boolean).join("\n");
  const match = blob.match(/\b(?:from|at|with)\s+([A-Z][A-Za-z0-9&.' -]{2,40})(?:\s+(?:is|wants|wanted|requested|requesting|asks|asked|needs|has)|[,.!?\n]|$)/);
  const company = cleanLeadName(match?.[1]);
  return company && !/gmail|collaboration|quote retweet|partnership/i.test(company) ? company : "";
}

function normalize(row) {
  const draft = maybeJson(row.draft_reply) || row.draft_reply || null;
  const descJson = maybeJson(row.description);
  const thread = Array.isArray(row.email_thread) ? row.email_thread : [];
  const originalThread = Array.isArray(row.original_email) ? row.original_email : [];
  const title = text(row.title || row.contact_name || row.business_name, "Unknown lead");
  const storedContact = text(row.contact_name || row.name, title);
  const storedEmail = text(row.email);
  const allMessages = [...originalThread, ...thread];
  const contextText = [
    title,
    storedContact,
    storedEmail,
    row.business_name,
    descJson?.rich_description,
    descJson?.evidence,
    row.description,
    ...allMessages.map((message) => [
      message.from,
      message.to,
      message.cc,
      message.subject,
      message.body
    ].filter(Boolean).join("\n"))
  ];
  const outsideSender = allMessages.find((message) => !isInternalMessage(message));
  const outsideName = outsideSender ? senderName(outsideSender) : "";
  const outsideEmail = outsideSender ? senderEmail(outsideSender) : "";
  const storedLooksInternal = internalSender.test(`${storedContact} ${storedEmail}`);
  const inferredName = inferLeadName(contextText);
  const inferredEmail = inferLeadEmail(contextText);
  const contact = storedLooksInternal ? (cleanLeadName(outsideName) || inferredName || storedContact) : storedContact;
  const email = storedLooksInternal ? (outsideEmail || inferredEmail || storedEmail) : storedEmail;
  const company = text(row.business_name || row.company || inferLeadCompany(contextText), "Unknown company");
  return {
    id: row.id,
    title,
    contact,
    company,
    email,
    stage: text(row.list_id, "new"),
    priority: text(row.priority, "warm").toLowerCase(),
    intent: text(row.intent || descJson?.intent),
    value: text(row.estimated_value || descJson?.deal_value),
    source: text(row.lead_source || row.source, "Gmail"),
    description: text(descJson?.rich_description || row.description),
    evidence: text(descJson?.evidence),
    draft,
    draftStatus: text(row.draft_reply_status, "pending"),
    newReplyAt: row.new_reply_at,
    updatedAt: row.updated_at || row.created_at,
    createdAt: row.created_at,
    dateReceived: row.date_received_iso || row.date_received,
    dueDate: row.due_date,
    gmailThreadId: text(row.gmail_thread_id || thread[0]?.gmail_thread_id || thread.at(-1)?.gmail_thread_id),
    thread
  };
}

function lastMessage(card) {
  return card.thread.reduce((latest, message) => {
    const latestTime = messageDate(latest)?.getTime() || 0;
    const messageTime = messageDate(message)?.getTime() || 0;
    return messageTime >= latestTime ? message : latest;
  }, null);
}

function messageDate(message) {
  return parseDate(message?.date_iso || message?.date);
}

function lastTouchDate(card) {
  const last = lastMessage(card);
  return messageDate(last) || parseDate(card.newReplyAt) || parseDate(card.updatedAt) || parseDate(card.createdAt);
}

function isInternalMessage(message) {
  return internalSender.test(`${message?.from || ""} ${message?.email || ""}`);
}

function active(card) {
  return activeStages.includes(card.stage);
}

function closed(card) {
  return terminalStages.includes(card.stage);
}

function moneyStage(card) {
  return moneyStages.includes(card.stage);
}

function externalWaiting(card) {
  const last = lastMessage(card);
  return active(card) && Boolean(last) && !isInternalMessage(last);
}

function outboundWaiting(card) {
  const last = lastMessage(card);
  return active(card) && Boolean(last) && isInternalMessage(last) && !hasDraftReady(card);
}

function hasDraftReady(card) {
  return active(card) && card.draftStatus === "drafted";
}

function needsReply(card) {
  return externalWaiting(card) || hasDraftReady(card);
}

function staleActive(card) {
  return active(card) && !needsReply(card) && daysSince(lastTouchDate(card)) >= 3;
}

function noisyReplyFlag(card) {
  return Boolean(card.newReplyAt) && !externalWaiting(card);
}

function tomorrowWork(card) {
  return active(card) && !needsReply(card) && !["negotiating", "invoice-sent"].includes(card.stage);
}

function healthFlags(card) {
  const flags = [];
  if (!card.company || card.company === "Unknown company") flags.push("Missing company");
  if (!card.email) flags.push("Missing email");
  if (!card.thread.length) flags.push("No thread");
  if (noisyReplyFlag(card)) flags.push("Stale reply flag");
  if (card.priority === "hot" && !moneyStage(card) && !externalWaiting(card)) flags.push("Hot label needs proof");
  return flags;
}

function priorityRank(card) {
  return ({ hot: 0, warm: 1, cold: 2 }[card.priority] ?? 3);
}

function urgency(card) {
  let score = 0;
  if (externalWaiting(card)) score += 1000;
  if (hasDraftReady(card)) score += 900;
  if (card.stage === "invoice-sent") score += 780;
  if (card.stage === "negotiating") score += 720;
  if (staleActive(card)) score += 620;
  if (card.stage === "rates-sent") score += 520;
  if (card.stage === "first-touch") score += 420;
  if (card.priority === "hot") score += 180;
  if (card.priority === "warm") score += 90;
  score -= Math.min(daysSince(lastTouchDate(card)), 30);
  return score;
}

function sortCards(cards) {
  return cards.sort((a, b) => {
    const recent = (lastTouchDate(b)?.getTime() || 0) - (lastTouchDate(a)?.getTime() || 0);
    if (recent) return recent;
    const urgent = urgency(b) - urgency(a);
    if (urgent) return urgent;
    const priority = priorityRank(a) - priorityRank(b);
    if (priority) return priority;
    return String(a.company || a.contact).localeCompare(String(b.company || b.contact));
  });
}

function rowDateLabel(card) {
  const last = lastMessage(card);
  if (last) return isInternalMessage(last) ? "Sent" : "Received";
  if (card.newReplyAt) return "Reply";
  if (card.dateReceived) return "Received";
  return "Updated";
}

function todayWork(card) {
  return active(card) && needsReply(card);
}

function replyAge(card) {
  const age = daysSince(lastTouchDate(card));
  if (age === 0) return "today";
  if (age === 1) return "1 day ago";
  if (age > 200) return "undated";
  return `${age} days ago`;
}

function why(card) {
  if (externalWaiting(card)) return `Last message is from the lead, ${replyAge(card)}.`;
  if (outboundWaiting(card)) return `Last message was sent by the team, ${replyAge(card)}. Waiting on the lead.`;
  if (hasDraftReady(card)) return "Draft is ready to review.";
  if (card.stage === "invoice-sent") return "Invoice is out. Confirm payment timing.";
  if (card.stage === "negotiating") return "Active negotiation. Keep scope and decision owner visible.";
  if (staleActive(card)) return `No visible movement for ${daysSince(lastTouchDate(card))} days.`;
  if (card.stage === "rates-sent") return "Rates were sent. Decide follow-up or close.";
  if (card.stage === "first-touch") return "New lead. Decide if it deserves a reply.";
  if (closed(card)) return "Closed thread.";
  return "Needs classification.";
}

function nextMove(card) {
  if (externalWaiting(card)) return "Reply from the composer, then move the lead to the right stage.";
  if (hasDraftReady(card)) return "Review the draft and send only if it still matches the thread.";
  if (card.stage === "invoice-sent") return "Send a short payment follow-up or mark paid.";
  if (card.stage === "negotiating") return "Clarify price, scope, timing, and decision owner.";
  if (staleActive(card)) return "Revive once or move out of active pipeline.";
  if (card.stage === "rates-sent") return "Follow up once, then archive if there is no signal.";
  return "Clean the card and choose the next action.";
}

function defaultSubject(card) {
  const title = card.title || card.company || card.contact;
  return title.toLowerCase().startsWith("re:") ? title : `Re: ${title}`;
}

function draftVariant(card, sender = state.draftSender) {
  if (!card?.draft || typeof card.draft !== "object") return null;
  return card.draft.variants?.[sender] || card.draft[sender] || null;
}

function draftText(card) {
  const variant = draftVariant(card);
  if (variant) return text(variant.body || variant.text || variant.message);
  if (card.draft && typeof card.draft === "object") return text(card.draft.body || card.draft.text || card.draft.message);
  return text(card.draft);
}

function draftSubject(card, sender = state.draftSender) {
  const variant = draftVariant(card, sender);
  return text(variant?.subject || card.draft?.subject || defaultSubject(card));
}

function setDraftSender(sender) {
  if (!draftSenders[sender]) return;
  state.draftSender = sender;
  const card = selectedCard();
  if (!card) return;
  const body = draftText(card);
  if ($("reply-body")) $("reply-body").value = body;
  if ($("draft-subject")) $("draft-subject").textContent = draftSubject(card, sender);
  document.querySelectorAll("[data-action='draft-sender']").forEach((button) => {
    button.classList.toggle("selected", button.dataset.from === sender);
  });
  const sendButton = document.querySelector("[data-action='send']");
  if (sendButton) sendButton.textContent = `Send as ${draftSenders[sender]}`;
  setStatus(`Loaded ${draftSenders[sender]}'s draft.`);
}

function queueFor(view = state.view) {
  let cards = [...state.cards];
  if (view === "reply") cards = cards.filter(needsReply);
  if (view === "sent") cards = cards.filter(outboundWaiting);
  if (view === "money") cards = cards.filter((card) => moneyStage(card) && active(card));
  if (view === "closed") cards = cards.filter(closed);
  if (view === "overdue") cards = cards.filter((card) => active(card) && (staleActive(card) || (needsReply(card) && daysSince(lastTouchDate(card)) >= 2)));
  if (view === "tomorrow") cards = cards.filter(tomorrowWork);
  if (view === "cleanup") cards = cards.filter((card) => healthFlags(card).length > 0);
  if (view === "today") cards = sortCards(cards.filter(todayWork)).slice(0, todayLimit);
  if (view === "all") cards = [...state.cards];

  if (state.search) {
    const q = state.search.toLowerCase();
    cards = cards.filter((card) => [
      card.contact, card.company, card.email, card.stage, card.intent, card.description, why(card), card.title
    ].join(" ").toLowerCase().includes(q));
  }
  return sortCards(cards);
}

function latestSyncDate() {
  return state.cards.reduce((latest, card) => {
    const dates = [lastTouchDate(card), parseDate(card.updatedAt), parseDate(card.newReplyAt)].filter(Boolean);
    dates.forEach((d) => { if (!latest || d > latest) latest = d; });
    return latest;
  }, null);
}

function viewInfo() {
  return views[state.view] || views.today;
}

function renderCounts() {
  const counts = {
    today: queueFor("today").length,
    sent: state.cards.filter(outboundWaiting).length,
    money: state.cards.filter((card) => moneyStage(card) && active(card)).length,
    cleanup: state.cards.filter((card) => healthFlags(card).length > 0).length,
    all: state.cards.length
  };
  Object.entries(counts).forEach(([key, value]) => {
    const el = $(`count-${key}`);
    if (el) el.textContent = number(value);
  });
  $("focus-count").textContent = `${number(counts.today)} focus items`;
}

function syncActiveButtons() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.view);
  });
}

function renderInbox() {
  const cards = queueFor();
  const [eyebrow, title] = viewInfo();
  $("view-eyebrow").textContent = eyebrow;
  $("view-title").textContent = title;
  $("queue-count").textContent = number(cards.length);
  syncActiveButtons();

  if (!state.selectedId || !cards.some((card) => card.id === state.selectedId)) {
    state.selectedId = cards[0]?.id || null;
  }

  $("lead-list").innerHTML = cards.length ? cards.map((card) => `
    <button class="lead-row ${needsReply(card) ? "needs-reply" : ""} ${card.id === state.selectedId ? "selected" : ""}" data-id="${card.id}" type="button">
      <span class="unread-dot"></span>
      <span class="lead-main">
        <span class="lead-meta">
          <span class="lead-name">${html(card.contact)}</span>
          <span class="pill ${html(card.priority)}">${html(card.priority)}</span>
        </span>
        <span class="lead-subject">${html(card.company)} - ${html(stageLabels[card.stage] || card.stage)}</span>
        <span class="lead-preview">${html(why(card))} ${html(card.description || "")}</span>
      </span>
      <span class="lead-date"><small>${html(rowDateLabel(card))}</small><strong>${html(shortDate(lastTouchDate(card)))}</strong></span>
    </button>
  `).join("") : `<div class="empty"><p>Clear</p><h2>No leads in this folder.</h2></div>`;

  $("lead-list").querySelectorAll("[data-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedId = Number(button.dataset.id);
      renderInbox();
      renderDetail();
    });
  });
  renderDetail();
}

function messageList(card) {
  if (card.thread.length) return card.thread.slice(-8);
  return [{
    from: card.contact || card.email || "Unknown lead",
    email: card.email,
    date: card.dateReceived || card.createdAt,
    body: card.description || "No thread text is stored for this card yet."
  }];
}

function senderName(message) {
  const raw = text(message.from || message.sender || message.email, "Unknown");
  return raw.replace(/<[^>]+>/g, "").trim() || raw;
}

function senderEmail(message) {
  const raw = text(message.from || message.email);
  const match = raw.match(/<([^>]+)>/);
  return match ? match[1] : text(message.email);
}

function gmailUrl(card) {
  return card.gmailThreadId ? `https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(card.gmailThreadId)}` : "";
}

function renderDetail() {
  const card = state.cards.find((item) => item.id === state.selectedId);
  if (!card) {
    $("detail").innerHTML = `<div class="empty"><p>Select a lead</p><h2>The thread, context, and reply box will appear here.</h2></div>`;
    return;
  }
  const flags = healthFlags(card);
  const draft = draftText(card);
  const subject = draftSubject(card);
  const gmail = gmailUrl(card);
  $("detail").innerHTML = `
    <div class="thread-inner">
      <div class="thread-toolbar">
        <div class="tool-group">
          <button class="tool" data-action="stage" data-stage="first-touch" type="button">First touch</button>
          <button class="tool" data-action="stage" data-stage="done" type="button">Archive</button>
          <button class="tool" data-action="stage" data-stage="dead-leads" type="button">Not needed</button>
          <button class="tool" data-action="stage" data-stage="engaged" type="button">Engaged</button>
          <button class="tool" data-action="stage" data-stage="rates-sent" type="button">Rates sent</button>
          <button class="tool" data-action="stage" data-stage="negotiating" type="button">Negotiating</button>
          <button class="tool" data-action="stage" data-stage="invoice-sent" type="button">Invoice</button>
        </div>
        <div class="tool-group">
          ${gmail ? `<a class="tool" href="${html(gmail)}" target="_blank" rel="noreferrer">Open Gmail</a>` : ""}
          <button class="tool" data-action="copy" type="button">Copy draft</button>
        </div>
      </div>

      <section class="thread-title">
        <h2>${html(subject)}</h2>
        <p>${html(card.contact)}${card.email ? ` <${html(card.email)}>` : ""} - ${html(card.company)}</p>
      </section>

      <section class="lead-profile">
        <div class="profile-main">
          <span>Lead profile</span>
          <strong>${html(card.contact)}</strong>
          <p>${html(card.company)}${card.email ? ` · ${html(card.email)}` : ""}</p>
          ${card.description ? `<em>${html(card.description)}</em>` : ""}
        </div>
        <div class="profile-grid">
          <div class="context-item"><span>Stage</span><strong>${html(stageLabels[card.stage] || card.stage)}</strong></div>
          <div class="context-item"><span>Intent</span><strong>${html(card.intent || "Unknown")}</strong></div>
          <div class="context-item"><span>Priority</span><strong>${html(card.priority)}</strong></div>
          <div class="context-item"><span>Last touch</span><strong>${html(longDate(lastTouchDate(card)))}</strong></div>
          <div class="context-item"><span>Value</span><strong>${html(card.value || "Not set")}</strong></div>
          <div class="context-item"><span>Source</span><strong>${html(card.source || "Gmail")}</strong></div>
          <div class="context-item"><span>Draft</span><strong>${html(card.draftStatus)}</strong></div>
          <div class="context-item"><span>Thread</span><strong>${number(card.thread.length)} email${card.thread.length === 1 ? "" : "s"}</strong></div>
        </div>
      </section>

      <section class="why-card">
        <strong>${html(why(card))}</strong>
        <p>${html(nextMove(card))}</p>
        ${flags.length ? `<p>Cleanup reason: ${html(flags.join(" / "))}</p>` : ""}
      </section>

      <section class="messages">
        ${messageList(card).map((message) => `
          <article class="message">
            <div class="message-head">
              <div class="message-from">
                <strong>${html(senderName(message))}</strong>
                <span>${html(senderEmail(message))}</span>
              </div>
              <span class="message-date">${html(longDate(message.date_iso || message.date))}</span>
            </div>
            <div class="message-body">${html(message.body || message.snippet || "")}</div>
          </article>
        `).join("")}
      </section>

      <section class="composer">
        <div class="composer-head">
          <div class="composer-title">
            <strong>Reply</strong>
            <span id="draft-subject">${html(subject)}</span>
          </div>
          <div class="draft-switch" aria-label="Draft sender">
            ${Object.entries(draftSenders).map(([key, label]) => `
              <button class="${state.draftSender === key ? "selected" : ""}" data-action="draft-sender" data-from="${key}" type="button">${label}</button>
            `).join("")}
          </div>
          <span class="send-status" id="send-status">Draft stays here until you send or copy it.</span>
        </div>
        <textarea id="reply-body" rows="18" spellcheck="true" placeholder="Write Robert, Sam, or Asher's reply here...">${html(draft)}</textarea>
        <div class="composer-actions">
          <button class="tool" data-action="draft-sender" data-from="robert" type="button">Reply as Robert</button>
          <button class="tool" data-action="draft-sender" data-from="sam" type="button">Reply as Sam</button>
          <button class="tool" data-action="draft-sender" data-from="asher" type="button">Reply as Asher</button>
          <button class="tool primary" data-action="send" type="button">Send as ${html(draftSenders[state.draftSender])}</button>
          <button class="tool" data-action="copy" type="button">Copy</button>
          ${gmail ? `<a class="tool" href="${html(gmail)}" target="_blank" rel="noreferrer">Open thread</a>` : ""}
          <button class="tool" data-action="stage" data-stage="rates-sent" type="button">Rates sent</button>
          <button class="tool" data-action="stage" data-stage="paid-out" type="button">Paid</button>
        </div>
      </section>
    </div>
  `;

  $("detail").querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleAction(button.dataset.action, button.dataset.stage, button.dataset.from));
  });
}

function selectedCard() {
  return state.cards.find((card) => card.id === state.selectedId);
}

function setStatus(message) {
  const status = $("send-status");
  if (status) status.textContent = message;
}

async function handleAction(action, stage, from) {
  const card = selectedCard();
  if (!card) return;
  if (action === "copy") {
    const body = $("reply-body")?.value || draftText(card) || "";
    await navigator.clipboard.writeText(body);
    setStatus("Copied.");
  }
  if (action === "stage" && stage) {
    setStatus("Updating stage...");
    const { error } = await supabase.from("cards").update({ list_id: stage }).eq("id", card.id);
    if (error) {
      setStatus(`Stage update failed: ${error.message}`);
      return;
    }
    card.stage = stage;
    setStatus(`Moved to ${stageLabels[stage] || stage}.`);
    renderCounts();
    renderInbox();
  }
  if (action === "send") {
    await sendReply(card);
  }
  if (action === "draft-sender") {
    setDraftSender(from);
  }
}

async function sendReply(card) {
  const token = localStorage.getItem("unaligned_send_token") || "";
  if (!token) {
    setStatus("Sending needs an admin token. Draft can still be copied or opened in Gmail.");
    return;
  }
  const body = $("reply-body")?.value.trim() || "";
  if (!body) {
    setStatus("Write a reply first.");
    return;
  }
  const sender = ["sam", "asher"].includes(state.draftSender) ? state.draftSender : "robert";
  const senderName = ({ sam: "Sam", asher: "Asher", robert: "Robert" })[sender];
  setStatus(`Sending as ${senderName}...`);
  const resp = await fetch(SEND_EMAIL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-UNALIGNED-ADMIN-TOKEN": token
    },
    body: JSON.stringify({
      to: card.email,
      subject: draftSubject(card, sender),
      body,
      from: sender
    })
  });
  const result = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    setStatus(result.error || "Send failed.");
    return;
  }
  setStatus(sender === "asher" ? "Sent as Asher." : `Sent as ${senderName}. Asher was CC'd.`);
  await supabase.from("cards").update({ draft_reply_status: "sent", new_reply_at: null }).eq("id", card.id);
  card.draftStatus = "sent";
  card.newReplyAt = null;
  renderCounts();
  renderInbox();
}

async function loadCards() {
  $("detail").innerHTML = `<div class="empty"><p>Loading</p><h2>Opening the lead inbox.</h2></div>`;
  const fields = [
    "id", "title", "contact_name", "business_name", "email", "list_id", "priority", "intent",
    "estimated_value", "lead_source", "description", "draft_reply", "draft_reply_status",
    "new_reply_at", "updated_at", "created_at", "date_received", "date_received_iso", "due_date",
    "gmail_thread_id", "original_email", "email_thread"
  ].join(",");
  const { data, error } = await supabase.from("cards").select(fields).limit(3000);
  if (error) {
    $("detail").innerHTML = `<div class="empty"><p>Supabase error</p><h2>${html(error.message)}</h2></div>`;
    return;
  }
  state.cards = (data || []).map(normalize);
  const latest = latestSyncDate();
  $("sync-status").textContent = `${number(state.cards.length)} leads synced. Last signal ${shortDate(latest)}.`;
  renderCounts();
  renderWelcome();
  renderInbox();
}

function closeWelcome() {
  $("welcome-overlay")?.classList.add("hidden");
}

function funnelAction(card) {
  if (externalWaiting(card)) return "Reply now";
  if (hasDraftReady(card)) return "Review draft";
  if (card.stage === "invoice-sent") return "Confirm payment";
  if (card.stage === "negotiating") return "Clarify deal";
  if (card.stage === "rates-sent") return "Follow up";
  if (healthFlags(card).length) return "Fix data";
  return "Review";
}

function funnelItems() {
  return state.cards
    .filter((card) => active(card))
    .map((card) => {
      let score = urgency(card);
      if (moneyStage(card)) score += 160;
      if (healthFlags(card).length) score += 80;
      if (daysSince(lastTouchDate(card)) >= 5) score += 70;
      return { card, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ card }) => card);
}

function renderWelcome() {
  const doneList = $("done-list");
  const funnelList = $("funnel-list");
  if (!doneList || !funnelList) return;

  doneList.innerHTML = welcomeDone.map((item) => `<li>${html(item)}</li>`).join("");
  const leads = funnelItems();
  funnelList.innerHTML = leads.length ? leads.map((card) => {
    const flags = healthFlags(card);
    return `
      <article class="funnel-item" data-lead-id="${card.id}">
        <div class="funnel-copy">
          <span>${html(funnelAction(card))}</span>
          <strong>${html(card.contact)} · ${html(card.company)}</strong>
          <p>${html(why(card))}</p>
          ${flags.length ? `<small>${html(flags.join(" / "))}</small>` : ""}
        </div>
        <button class="tool primary" data-open-lead="${card.id}" type="button">Open</button>
      </article>
    `;
  }).join("") : `<div class="funnel-empty"><strong>No urgent lead work found.</strong><span>Open All leads to review the full board.</span></div>`;

  funnelList.querySelectorAll("[data-open-lead]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedId = Number(button.dataset.openLead);
      const card = state.cards.find((item) => item.id === state.selectedId);
      if (card) {
        if (moneyStage(card)) state.view = "money";
        else if (outboundWaiting(card)) state.view = "sent";
        else if (healthFlags(card).length) state.view = "cleanup";
        else state.view = "today";
      }
      closeWelcome();
      renderInbox();
    });
  });
}

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    state.view = button.dataset.view;
    state.selectedId = null;
    renderInbox();
  });
});

$("search").addEventListener("input", (event) => {
  state.search = event.target.value.trim();
  state.selectedId = null;
  renderInbox();
});

$("refresh-btn").addEventListener("click", loadCards);
$("compose-btn").addEventListener("click", () => $("reply-body")?.focus());
$("welcome-close")?.addEventListener("click", closeWelcome);
$("welcome-start")?.addEventListener("click", closeWelcome);
$("welcome-refresh")?.addEventListener("click", loadCards);
renderWelcome();
loadCards();
