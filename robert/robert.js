import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://hbnpwphxjurvtydezwgh.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhibnB3cGh4anVydnR5ZGV6d2doIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MTQ1MzIsImV4cCI6MjA5MDk5MDUzMn0.p5E48__GlGqjC17Z28q8fYFK-qV8CmiidYIP02vGe4s";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const stageLabels = {
  new: "New",
  "first-touch": "First Touch",
  engaged: "Engaged",
  "rates-sent": "Rates Sent",
  negotiating: "Negotiating",
  "invoice-sent": "Invoice Sent",
  done: "Done",
  "paid-out": "Paid Out",
  "dead-leads": "Dead"
};

const state = { cards: [], view: "today", selectedId: null, search: "" };
const $ = (id) => document.getElementById(id);
const boardHref = window.location.pathname.endsWith("/robert/") ? "../" : "./";

function asText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value.trim() || fallback;
  return String(value);
}

function parseMaybeJson(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return null; }
}

function normalize(row) {
  const draft = parseMaybeJson(row.draft_reply) || row.draft_reply || null;
  const title = asText(row.title || row.contact_name || row.business_name, "Unknown lead");
  return {
    id: row.id,
    title,
    contactName: asText(row.contact_name || row.name, title),
    businessName: asText(row.business_name || row.company, "Unknown company"),
    email: asText(row.email),
    phone: asText(row.phone),
    stage: asText(row.list_id, "new"),
    priority: asText(row.priority, "warm").toLowerCase(),
    intent: asText(row.intent),
    value: asText(row.estimated_value),
    source: asText(row.lead_source || row.source),
    description: asText(row.description),
    draft,
    draftStatus: asText(row.draft_reply_status, "pending"),
    newReplyAt: row.new_reply_at,
    updatedAt: row.updated_at || row.created_at,
    createdAt: row.created_at,
    emailThread: Array.isArray(row.email_thread) ? row.email_thread : []
  };
}

function stageRank(stage) {
  return {
    "first-touch": 1,
    engaged: 2,
    "rates-sent": 3,
    negotiating: 4,
    "invoice-sent": 5,
    new: 6,
    done: 7,
    "paid-out": 8,
    "dead-leads": 9
  }[stage] || 20;
}

function isMoney(card) {
  return ["rates-sent", "negotiating", "invoice-sent", "paid-out"].includes(card.stage);
}

function needsReply(card) {
  return Boolean(card.newReplyAt) || ["drafted", "pending"].includes(card.draftStatus);
}

function isWaiting(card) {
  return ["rates-sent", "invoice-sent"].includes(card.stage) && !card.newReplyAt;
}

function isClosed(card) {
  return ["done", "paid-out", "dead-leads"].includes(card.stage);
}

function filteredCards() {
  let cards = [...state.cards];
  if (state.view === "needs-reply") cards = cards.filter(needsReply);
  if (state.view === "money") cards = cards.filter(isMoney);
  if (state.view === "waiting") cards = cards.filter(isWaiting);
  if (state.view === "closed") cards = cards.filter(isClosed);
  if (state.view === "today") {
    cards = cards.filter((card) => needsReply(card) || ["negotiating", "invoice-sent"].includes(card.stage));
  }
  if (state.search) {
    const q = state.search.toLowerCase();
    cards = cards.filter((card) => [
      card.contactName, card.businessName, card.stage, card.priority, card.intent, card.email
    ].join(" ").toLowerCase().includes(q));
  }
  return cards.sort((a, b) => {
    if (Boolean(b.newReplyAt) !== Boolean(a.newReplyAt)) {
      return Number(Boolean(b.newReplyAt)) - Number(Boolean(a.newReplyAt));
    }
    if (a.priority !== b.priority) {
      return ["hot", "warm", "cold"].indexOf(a.priority) - ["hot", "warm", "cold"].indexOf(b.priority);
    }
    const rank = stageRank(a.stage) - stageRank(b.stage);
    if (rank) return rank;
    return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
  });
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function renderHero() {
  const total = state.cards.length;
  const reply = state.cards.filter(needsReply).length;
  const money = state.cards.filter((card) => ["rates-sent", "negotiating", "invoice-sent"].includes(card.stage)).length;
  const won = state.cards.filter((card) => ["done", "paid-out"].includes(card.stage)).length;
  $("hero-stats").innerHTML = [
    ["Total", total],
    ["Needs Reply", reply],
    ["Money Stage", money],
    ["Won", won]
  ].map(([label, value]) => `<div><span>${label}</span><strong>${formatNumber(value)}</strong></div>`).join("");
}

function renderSummary() {
  const metrics = [
    ["Hot Leads", state.cards.filter((card) => card.priority === "hot").length],
    ["Negotiating", state.cards.filter((card) => card.stage === "negotiating").length],
    ["Invoices", state.cards.filter((card) => card.stage === "invoice-sent").length],
    ["Dead Leads", state.cards.filter((card) => card.stage === "dead-leads").length]
  ];
  $("summary-row").innerHTML = metrics.map(([label, value]) => `
    <article class="metric"><span>${label}</span><strong>${formatNumber(value)}</strong></article>
  `).join("");
}

function renderQueue() {
  const cards = filteredCards();
  $("queue-label").textContent = state.view.replace("-", " ");
  $("queue-count").textContent = cards.length;
  const template = $("lead-template");
  const list = $("lead-list");
  list.innerHTML = "";
  if (!cards.length) {
    list.innerHTML = `<div class="empty-state"><p>No matching leads</p><h3>This view is clear.</h3></div>`;
    renderDetail(null);
    return;
  }
  if (!state.selectedId || !cards.some((card) => card.id === state.selectedId)) state.selectedId = cards[0].id;
  for (const card of cards) {
    const node = template.content.firstElementChild.cloneNode(true);
    node.classList.add(`priority-${card.priority}`);
    node.classList.toggle("selected", card.id === state.selectedId);
    node.querySelector(".lead-name").textContent = card.contactName;
    node.querySelector(".lead-company").textContent = card.businessName;
    node.querySelector(".lead-stage").textContent = stageLabels[card.stage] || card.stage;
    node.addEventListener("click", () => {
      state.selectedId = card.id;
      renderQueue();
      renderDetail(card);
    });
    list.appendChild(node);
  }
  renderDetail(cards.find((card) => card.id === state.selectedId));
}

function latestThread(card) {
  const thread = card.emailThread || [];
  return thread.slice(-4).map((message) => {
    const sender = asText(message.from || message.sender, "Unknown");
    const date = asText(message.date);
    const body = asText(message.body || message.snippet);
    return `${sender}${date ? ` · ${date}` : ""}\n${body}`;
  }).join("\n\n---\n\n");
}

function nextAction(card) {
  if (!card) return "";
  if (card.newReplyAt) return "New reply landed. Read the latest thread and answer from the strongest voice.";
  if (card.draftStatus === "drafted") return "Draft is ready. Approve, edit, or reject before sending.";
  if (card.stage === "invoice-sent") return "Invoice is out. Check payment status and send a tight follow-up if needed.";
  if (card.stage === "negotiating") return "Terms are active. Decide the next concession, package, or close.";
  if (card.stage === "rates-sent") return "Rates are out. Follow up with one useful next-step question.";
  if (card.stage === "first-touch") return "First response needed. Keep it short, specific, and copy Sam.";
  return "Review the thread and move the deal to the right stage.";
}

function renderDetail(card) {
  const panel = $("detail-panel");
  if (!card) {
    panel.innerHTML = `<div class="empty-state"><p>Select a lead</p><h3>The strongest next action will appear here.</h3></div>`;
    return;
  }
  const draftBody = typeof card.draft === "object"
    ? asText(card.draft.body || card.draft.text || card.draft.message)
    : asText(card.draft);
  panel.innerHTML = `
    <div class="detail-header">
      <div>
        <p class="brand">${stageLabels[card.stage] || card.stage}</p>
        <h2 class="detail-title">${escapeHtml(card.contactName)}</h2>
        <p class="detail-meta">${escapeHtml(card.businessName)}${card.email ? ` - ${escapeHtml(card.email)}` : ""}</p>
      </div>
      <button type="button" data-board-link>Open Board</button>
    </div>
    <div class="next-action"><span>Next Action</span><p>${escapeHtml(nextAction(card))}</p></div>
    <div class="field-grid">
      <div class="field"><span class="field-label">Priority</span><div class="field-value">${escapeHtml(card.priority)}</div></div>
      <div class="field"><span class="field-label">Value</span><div class="field-value">${escapeHtml(card.value || "Not set")}</div></div>
      <div class="field"><span class="field-label">Draft</span><div class="field-value">${escapeHtml(card.draftStatus)}</div></div>
      <div class="field"><span class="field-label">Intent</span><div class="field-value">${escapeHtml(card.intent || "Not set")}</div></div>
      <div class="field"><span class="field-label">Source</span><div class="field-value">${escapeHtml(card.source || "Gmail")}</div></div>
      <div class="field"><span class="field-label">Updated</span><div class="field-value">${escapeHtml(formatDate(card.updatedAt))}</div></div>
    </div>
    <div class="two-col">
      <article class="content-box"><h4>Thread Signal</h4><div class="email-thread">${escapeHtml(latestThread(card) || card.description || "No thread text available.")}</div></article>
      <article class="content-box"><h4>Draft / Notes</h4><div class="draft-body">${escapeHtml(draftBody || card.description || "No draft yet.")}</div></article>
    </div>
  `;
  panel.querySelector("[data-board-link]")?.addEventListener("click", () => {
    window.location.href = boardHref;
  });
}

function formatDate(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function escapeHtml(value) {
  return asText(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;"
  }[char]));
}

async function loadCards() {
  $("detail-panel").innerHTML = `<div class="loading"><p>Loading Supabase</p><h3>Finding Robert's strongest inbox signals.</h3></div>`;
  const fields = [
    "id", "title", "contact_name", "business_name", "email", "phone", "list_id", "priority", "intent",
    "estimated_value", "lead_source", "description", "draft_reply", "draft_reply_status", "new_reply_at",
    "updated_at", "created_at", "email_thread"
  ].join(",");
  const { data, error } = await supabase.from("cards").select(fields).limit(3000);
  if (error) {
    $("detail-panel").innerHTML = `<div class="empty-state"><p>Supabase error</p><h3>${escapeHtml(error.message)}</h3></div>`;
    return;
  }
  state.cards = (data || []).map(normalize);
  renderHero();
  renderSummary();
  renderQueue();
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");
    state.view = tab.dataset.view;
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
