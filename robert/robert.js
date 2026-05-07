import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://hbnpwphxjurvtydezwgh.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhibnB3cGh4anVydnR5ZGV6d2doIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MTQ1MzIsImV4cCI6MjA5MDk5MDUzMn0.p5E48__GlGqjC17Z28q8fYFK-qV8CmiidYIP02vGe4s";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const state = { cards: [], view: "today", selectedId: null, search: "" };
const $ = (id) => document.getElementById(id);
const now = new Date();

const internalSender = /(robert|scoble|asher|sam|unaligned|levangie|brayden)/i;
const activeStages = ["first-touch", "engaged", "rates-sent", "negotiating", "invoice-sent"];
const terminalStages = ["done", "paid-out", "dead-leads"];
const moneyStages = ["rates-sent", "negotiating", "invoice-sent"];
const todayLimit = 30;

const stages = [
  ["first-touch", "First Touch", "hot"],
  ["engaged", "Engaged", ""],
  ["rates-sent", "Rates Sent", "money"],
  ["negotiating", "Negotiating", "money"],
  ["invoice-sent", "Invoice", "money"],
  ["paid-out", "Paid", "closed"]
];

const stageLabels = Object.fromEntries([
  ["new", "New"],
  ["done", "Done"],
  ["dead-leads", "Dead"],
  ...stages.map(([id, label]) => [id, label])
]);

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
  if (!d) return "Not dated";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d);
}

function dayStamp(value) {
  const d = parseDate(value);
  return d ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : "";
}

function daysSince(value) {
  const d = parseDate(value);
  if (!d) return 999;
  return Math.max(0, Math.floor((now - d) / 86400000));
}

function normalize(row) {
  const draft = maybeJson(row.draft_reply) || row.draft_reply || null;
  const descJson = maybeJson(row.description);
  const title = text(row.title || row.contact_name || row.business_name, "Unknown lead");
  const thread = Array.isArray(row.email_thread) ? row.email_thread : [];
  return {
    id: row.id,
    title,
    contact: text(row.contact_name || row.name, title),
    company: text(row.business_name || row.company, "Unknown company"),
    email: text(row.email),
    stage: text(row.list_id, "new"),
    priority: text(row.priority, "warm").toLowerCase(),
    intent: text(row.intent || descJson?.intent),
    value: text(row.estimated_value || descJson?.deal_value),
    source: text(row.lead_source || row.source, "Gmail"),
    description: text(descJson?.rich_description || row.description),
    draft,
    draftStatus: text(row.draft_reply_status, "pending"),
    newReplyAt: row.new_reply_at,
    updatedAt: row.updated_at || row.created_at,
    createdAt: row.created_at,
    dateReceived: row.date_received_iso || row.date_received,
    dueDate: row.due_date,
    thread
  };
}

function lastMessage(card) {
  return card.thread[card.thread.length - 1] || null;
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
    const urgent = urgency(b) - urgency(a);
    if (urgent) return urgent;
    const priority = priorityRank(a) - priorityRank(b);
    if (priority) return priority;
    return (lastTouchDate(b)?.getTime() || 0) - (lastTouchDate(a)?.getTime() || 0);
  });
}

function todayWork(card) {
  return active(card) && (needsReply(card) || ["negotiating", "invoice-sent"].includes(card.stage));
}

function replyAge(card) {
  const d = lastTouchDate(card);
  const age = daysSince(d);
  if (!d) return "Unknown age";
  if (age === 0) return "Today";
  if (age === 1) return "1 day waiting";
  return `${age} days waiting`;
}

function why(card) {
  if (externalWaiting(card)) return `Outside sender is the last voice in the thread. ${replyAge(card)}.`;
  if (hasDraftReady(card)) return "A drafted response is ready for review.";
  if (card.stage === "invoice-sent") return "Invoice is out. Payment timing needs a clean follow-up.";
  if (card.stage === "negotiating") return "This is active money. Scope, price, and owner should stay visible.";
  if (staleActive(card)) return `No visible movement for ${daysSince(lastTouchDate(card))} days.`;
  if (card.stage === "rates-sent") return "Rates were sent. Decide whether to follow up or cool it down.";
  if (card.stage === "first-touch") return "First response lane. Check whether this is worth a human reply.";
  if (closed(card)) return "Closed lane. Keep only if relationship history matters.";
  return "Needs a human classification pass.";
}

function nextMove(card) {
  if (externalWaiting(card)) return "Reply today with the shortest useful answer, then move the card to the true current stage.";
  if (hasDraftReady(card)) return "Review the draft, remove anything generic, and send only if the thread still deserves it.";
  if (card.stage === "invoice-sent") return "Confirm payment timing and make the next financial step explicit.";
  if (card.stage === "negotiating") return "Write the decision checkpoint: scope, price, date, and who owns the yes.";
  if (staleActive(card)) return "Either revive it with one specific follow-up or move it out of active pipeline.";
  if (card.stage === "rates-sent") return "Follow up once with a concrete option, then mark it quiet if there is no response.";
  if (card.stage === "first-touch") return "Send a tight first response only if the company, ask, and value are clear.";
  if (closed(card)) return "Archive the outcome and capture any relationship note worth preserving.";
  return "Clean the card: confirm company, stage, priority, and last thread context.";
}

function healthFlags(card) {
  const flags = [];
  if (!card.company || card.company === "Unknown company") flags.push("Missing company");
  if (!card.email) flags.push("Missing email");
  if (!card.thread.length) flags.push("No thread");
  if (noisyReplyFlag(card)) flags.push("Reply flag may be stale");
  if (card.priority === "hot" && !moneyStage(card) && !externalWaiting(card)) flags.push("Hot label needs proof");
  if (!flags.length) flags.push("Clean enough");
  return flags;
}

function queueCards() {
  let cards = [...state.cards];
  if (state.view === "reply") cards = cards.filter(needsReply);
  if (state.view === "money") cards = cards.filter((card) => moneyStage(card) && active(card));
  if (state.view === "closed") cards = cards.filter(closed);
  if (state.view === "overdue") cards = cards.filter((card) => active(card) && (staleActive(card) || (needsReply(card) && daysSince(lastTouchDate(card)) >= 2)));
  if (state.view === "tomorrow") cards = cards.filter(tomorrowWork);
  if (state.view === "cleanup") cards = cards.filter((card) => healthFlags(card)[0] !== "Clean enough");
  if (state.view === "today") cards = cards.filter(todayWork);
  if (state.search) {
    const q = state.search.toLowerCase();
    cards = cards.filter((card) => [
      card.contact, card.company, card.email, card.stage, card.intent, card.description, why(card)
    ].join(" ").toLowerCase().includes(q));
  }
  const sorted = sortCards(cards);
  if (state.view === "today" && !state.search) return sorted.slice(0, todayLimit);
  return sorted;
}

function cardsTouchedOn(offsetDays) {
  const d = new Date(now);
  d.setDate(now.getDate() + offsetDays);
  const stamp = dayStamp(d);
  return state.cards.filter((card) => dayStamp(lastTouchDate(card)) === stamp);
}

function latestSyncDate() {
  return state.cards.reduce((latest, card) => {
    const dates = [lastTouchDate(card), parseDate(card.updatedAt), parseDate(card.newReplyAt)].filter(Boolean);
    dates.forEach((d) => { if (!latest || d > latest) latest = d; });
    return latest;
  }, null);
}

function renderMetrics() {
  const realReplies = state.cards.filter(needsReply).length;
  const money = state.cards.filter((card) => moneyStage(card) && active(card)).length;
  const stale = state.cards.filter(staleActive).length;
  const cleanup = state.cards.filter((card) => healthFlags(card)[0] !== "Clean enough").length;
  $("metrics").innerHTML = [
    ["Real replies", realReplies, "Latest thread needs a human"],
    ["Money in motion", money, "Rates, negotiation, invoices"],
    ["Overdue decisions", stale, "Revive or move out"],
    ["Data cleanup", cleanup, "Cards hiding the truth"]
  ].map(([label, value, note]) => `
    <article class="metric">
      <span>${label}</span>
      <strong>${number(value)}</strong>
      <small>${note}</small>
    </article>
  `).join("");
}

function renderDailyBrief() {
  const yesterday = cardsTouchedOn(-1);
  const today = sortCards(state.cards.filter(todayWork)).slice(0, todayLimit);
  const tomorrow = state.cards.filter(tomorrowWork);
  const badFlags = state.cards.filter(noisyReplyFlag).length;
  const latest = latestSyncDate();
  $("daily-brief").innerHTML = [
    ["Yesterday", yesterday.length ? `${number(yesterday.length)} changed` : "No fresh changes", yesterday.length ? "Review what moved before starting new replies." : `Last visible sync was ${shortDate(latest)}.`],
    ["Today", `${number(today.length)} focus items`, "A capped queue for replies, negotiation, and invoices."],
    ["Tomorrow", `${number(tomorrow.length)} follow-ups`, "Lower-pressure leads to schedule after the focus queue is handled."],
    ["Data truth", `${number(badFlags)} suspect reply flags`, "Old reply markers are being checked against the latest sender."]
  ].map(([label, value, note]) => `
    <article class="brief-card">
      <span>${label}</span>
      <strong>${value}</strong>
      <p>${note}</p>
    </article>
  `).join("");
}

function renderFunnel() {
  $("funnel-track").innerHTML = stages.map(([id, label, tone]) => {
    const count = state.cards.filter((card) => card.stage === id).length;
    const reply = state.cards.filter((card) => card.stage === id && needsReply(card)).length;
    return `
      <article class="stage ${tone}">
        <span>${label}</span>
        <strong>${number(count)}</strong>
        <small>${number(reply)} need human</small>
      </article>
    `;
  }).join("");
}

function viewLabel() {
  return ({
    today: ["Today", "Command Queue"],
    overdue: ["Overdue", "Needs A Decision"],
    reply: ["Reply", "Human Replies"],
    money: ["Money", "Revenue Work"],
    tomorrow: ["Tomorrow", "Scheduled Follow-Up"],
    cleanup: ["Cleanup", "Fix The Data"],
    closed: ["Closed", "Receipts"]
  }[state.view] || ["Today", "Command Queue"]);
}

function renderQueue() {
  const cards = queueCards();
  const [eyebrow, title] = viewLabel();
  $("queue-eyebrow").textContent = eyebrow;
  $("queue-title").textContent = title;
  $("queue-count").textContent = number(cards.length);
  if (!state.selectedId || !cards.some((card) => card.id === state.selectedId)) state.selectedId = cards[0]?.id || null;
  $("lead-list").innerHTML = cards.length ? cards.map((card) => `
    <button class="lead ${card.id === state.selectedId ? "selected" : ""}" data-id="${card.id}" type="button">
      <div class="lead-top">
        <span class="lead-name">${html(card.contact)}</span>
        <span class="pill ${html(card.priority)}">${html(card.priority)}</span>
      </div>
      <div class="lead-sub">${html(card.company)} - ${html(stageLabels[card.stage] || card.stage)}</div>
      <div class="lead-why">${html(why(card))}</div>
    </button>
  `).join("") : `<div class="empty small"><p class="eyebrow">Clear</p><h2>No leads in this view.</h2></div>`;
  $("lead-list").querySelectorAll("[data-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedId = Number(button.dataset.id);
      renderQueue();
      renderDetail();
    });
  });
  renderDetail();
}

function threadPreview(card) {
  const messages = card.thread.slice(-4).map((message) => {
    const from = text(message.from || message.sender, "Unknown");
    const body = text(message.body || message.snippet);
    return `${from}\n${body}`;
  });
  return messages.join("\n\n---\n\n") || card.description || "No thread text available.";
}

function draftText(card) {
  if (card.draft && typeof card.draft === "object") return text(card.draft.body || card.draft.text || card.draft.message);
  return text(card.draft) || card.description || "No draft yet.";
}

function renderDetail() {
  const card = state.cards.find((item) => item.id === state.selectedId);
  if (!card) {
    $("detail").innerHTML = `<div class="empty"><p class="eyebrow">Ready</p><h2>Select a lead to see the next move.</h2></div>`;
    return;
  }
  const flags = healthFlags(card);
  $("detail").innerHTML = `
    <div class="detail-head">
      <div>
        <p class="eyebrow">${html(stageLabels[card.stage] || card.stage)}</p>
        <h2 class="detail-title">${html(card.contact)}</h2>
        <p class="detail-meta">${html(card.company)}${card.email ? ` - ${html(card.email)}` : ""}</p>
      </div>
      <span class="pill ${html(card.priority)}">${html(card.priority)}</span>
    </div>
    <div class="action">
      <span>Why this is here</span>
      <strong>${html(why(card))}</strong>
      <p>${html(nextMove(card))}</p>
    </div>
    <section class="facts">
      <div class="fact"><span>Stage</span><strong>${html(stageLabels[card.stage] || card.stage)}</strong></div>
      <div class="fact"><span>Last touch</span><strong>${html(shortDate(lastTouchDate(card)))}</strong></div>
      <div class="fact"><span>Value</span><strong>${html(card.value || "Not set")}</strong></div>
      <div class="fact"><span>Draft</span><strong>${html(card.draftStatus)}</strong></div>
    </section>
    <section class="assist">
      <article>
        <h3>Human readout</h3>
        <p>${html(card.description || "No clean summary exists yet.")}</p>
      </article>
      <article>
        <h3>Data health</h3>
        <div class="flag-list">${flags.map((flag) => `<span>${html(flag)}</span>`).join("")}</div>
      </article>
    </section>
    <section class="reader">
      <article class="pane">
        <h3>Thread context</h3>
        <div class="copy">${html(threadPreview(card))}</div>
      </article>
      <article class="pane">
        <h3>Draft or notes</h3>
        <div class="copy">${html(draftText(card))}</div>
      </article>
    </section>
  `;
}

async function loadCards() {
  $("detail").innerHTML = `<div class="loading"><p class="eyebrow">Loading</p><h2>Finding the actual next replies.</h2></div>`;
  const fields = [
    "id", "title", "contact_name", "business_name", "email", "list_id", "priority", "intent",
    "estimated_value", "lead_source", "description", "draft_reply", "draft_reply_status",
    "new_reply_at", "updated_at", "created_at", "date_received", "date_received_iso", "due_date", "email_thread"
  ].join(",");
  const { data, error } = await supabase.from("cards").select(fields).limit(3000);
  if (error) {
    $("detail").innerHTML = `<div class="empty"><p class="eyebrow">Supabase error</p><h2>${html(error.message)}</h2></div>`;
    return;
  }
  state.cards = (data || []).map(normalize);
  const latest = latestSyncDate();
  $("sync-status").textContent = `${number(state.cards.length)} live leads synced - last signal ${shortDate(latest)}`;
  renderMetrics();
  renderDailyBrief();
  renderFunnel();
  renderQueue();
}

document.querySelectorAll(".seg").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".seg").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.view = button.dataset.view;
    state.selectedId = null;
    renderQueue();
  });
});

$("search").addEventListener("input", (event) => {
  state.search = event.target.value.trim();
  state.selectedId = null;
  renderQueue();
});

$("refresh-btn").addEventListener("click", loadCards);
loadCards();
