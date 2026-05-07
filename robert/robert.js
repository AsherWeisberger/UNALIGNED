import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://hbnpwphxjurvtydezwgh.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhibnB3cGh4anVydnR5ZGV6d2doIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MTQ1MzIsImV4cCI6MjA5MDk5MDUzMn0.p5E48__GlGqjC17Z28q8fYFK-qV8CmiidYIP02vGe4s";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const state = { cards: [], view: "today", selectedId: null, search: "" };
const $ = (id) => document.getElementById(id);

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

function normalize(row) {
  const draft = maybeJson(row.draft_reply) || row.draft_reply || null;
  const title = text(row.title || row.contact_name || row.business_name, "Unknown lead");
  return {
    id: row.id,
    title,
    contact: text(row.contact_name || row.name, title),
    company: text(row.business_name || row.company, "Unknown company"),
    email: text(row.email),
    stage: text(row.list_id, "new"),
    priority: text(row.priority, "warm").toLowerCase(),
    intent: text(row.intent),
    value: text(row.estimated_value),
    source: text(row.lead_source || row.source, "Gmail"),
    description: text(row.description),
    draft,
    draftStatus: text(row.draft_reply_status, "pending"),
    newReplyAt: row.new_reply_at,
    updatedAt: row.updated_at || row.created_at,
    thread: Array.isArray(row.email_thread) ? row.email_thread : []
  };
}

function needsReply(card) {
  return Boolean(card.newReplyAt) || ["pending", "drafted"].includes(card.draftStatus);
}

function moneyStage(card) {
  return ["rates-sent", "negotiating", "invoice-sent"].includes(card.stage);
}

function closed(card) {
  return ["done", "paid-out", "dead-leads"].includes(card.stage);
}

function rank(card) {
  const stage = {
    "first-touch": 1,
    engaged: 2,
    "rates-sent": 3,
    negotiating: 4,
    "invoice-sent": 5,
    new: 6,
    done: 8,
    "paid-out": 9,
    "dead-leads": 10
  }[card.stage] || 7;
  const priority = { hot: 0, warm: 1, cold: 2 }[card.priority] ?? 3;
  return stage * 10 + priority;
}

function queueCards() {
  let cards = [...state.cards];
  if (state.view === "reply") cards = cards.filter(needsReply);
  if (state.view === "money") cards = cards.filter(moneyStage);
  if (state.view === "closed") cards = cards.filter(closed);
  if (state.view === "today") cards = cards.filter((card) => needsReply(card) || moneyStage(card));
  if (state.search) {
    const q = state.search.toLowerCase();
    cards = cards.filter((card) => [card.contact, card.company, card.email, card.stage, card.intent].join(" ").toLowerCase().includes(q));
  }
  return cards.sort((a, b) => {
    if (Boolean(b.newReplyAt) !== Boolean(a.newReplyAt)) return Number(Boolean(b.newReplyAt)) - Number(Boolean(a.newReplyAt));
    const ranked = rank(a) - rank(b);
    if (ranked) return ranked;
    return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
  });
}

function number(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function date(value) {
  const d = new Date(value);
  if (!value || Number.isNaN(d.getTime())) return "Not dated";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d);
}

function nextMove(card) {
  if (card.newReplyAt) return "A reply is waiting. Read the thread and send the cleanest next response.";
  if (card.stage === "first-touch") return "Approve or rewrite the first response. Keep it short and specific.";
  if (card.stage === "engaged") return "Move the conversation toward a package, rate, or concrete next step.";
  if (card.stage === "rates-sent") return "Follow up once, then decide whether this is real pipeline or noise.";
  if (card.stage === "negotiating") return "Clarify scope, price, timeline, and decision owner.";
  if (card.stage === "invoice-sent") return "Confirm payment timing and keep the thread warm.";
  if (card.stage === "paid-out") return "Preserve the relationship and look for the next campaign.";
  return "Review the context and move this lead to the right stage.";
}

function threadPreview(card) {
  const messages = card.thread.slice(-3).map((message) => {
    const from = text(message.from || message.sender, "Unknown");
    const body = text(message.body || message.snippet);
    return `${from}\n${body}`;
  });
  return messages.join("\n\n---\n\n") || card.description || "No thread text available.";
}

function draftText(card) {
  if (typeof card.draft === "object") return text(card.draft.body || card.draft.text || card.draft.message);
  return text(card.draft) || card.description || "No draft yet.";
}

function renderMetrics() {
  const reply = state.cards.filter(needsReply).length;
  const money = state.cards.filter(moneyStage).length;
  const invoices = state.cards.filter((card) => card.stage === "invoice-sent").length;
  const won = state.cards.filter((card) => ["done", "paid-out"].includes(card.stage)).length;
  $("metrics").innerHTML = [
    ["Needs reply", reply, "Highest leverage work"],
    ["Active money", money, "Rates, negotiation, invoices"],
    ["Invoices out", invoices, "Payment follow-up"],
    ["Won / delivered", won, "Relationship capital"]
  ].map(([label, value, note]) => `
    <article class="metric">
      <span>${label}</span>
      <strong>${number(value)}</strong>
      <small>${note}</small>
    </article>
  `).join("");
}

function renderFunnel() {
  $("funnel-track").innerHTML = stages.map(([id, label, tone]) => {
    const count = state.cards.filter((card) => card.stage === id).length;
    return `
      <article class="stage ${tone}">
        <span>${label}</span>
        <strong>${number(count)}</strong>
      </article>
    `;
  }).join("");
}

function renderQueue() {
  const cards = queueCards();
  $("queue-count").textContent = number(cards.length);
  if (!state.selectedId || !cards.some((card) => card.id === state.selectedId)) state.selectedId = cards[0]?.id || null;
  $("lead-list").innerHTML = cards.length ? cards.map((card) => `
    <button class="lead ${card.id === state.selectedId ? "selected" : ""}" data-id="${card.id}" type="button">
      <div class="lead-top">
        <span class="lead-name">${html(card.contact)}</span>
        <span class="pill ${html(card.priority)}">${html(card.priority)}</span>
      </div>
      <div class="lead-sub">${html(card.company)} - ${html(stageLabels[card.stage] || card.stage)}</div>
    </button>
  `).join("") : `<div class="empty"><p class="eyebrow">Clear</p><h2>No leads in this view.</h2></div>`;
  $("lead-list").querySelectorAll("[data-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedId = Number(button.dataset.id);
      renderQueue();
      renderDetail();
    });
  });
  renderDetail();
}

function renderDetail() {
  const card = state.cards.find((item) => item.id === state.selectedId);
  if (!card) {
    $("detail").innerHTML = `<div class="empty"><p class="eyebrow">Ready</p><h2>Select a lead to see the next move.</h2></div>`;
    return;
  }
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
      <strong>Recommended next move</strong>
      <p>${html(nextMove(card))}</p>
    </div>
    <section class="facts">
      <div class="fact"><span>Stage</span><strong>${html(stageLabels[card.stage] || card.stage)}</strong></div>
      <div class="fact"><span>Value</span><strong>${html(card.value || "Not set")}</strong></div>
      <div class="fact"><span>Draft</span><strong>${html(card.draftStatus)}</strong></div>
      <div class="fact"><span>Updated</span><strong>${html(date(card.updatedAt))}</strong></div>
    </section>
    <section class="reader">
      <article class="pane">
        <h3>Thread signal</h3>
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
  $("detail").innerHTML = `<div class="loading"><p class="eyebrow">Loading</p><h2>Finding the strongest leads.</h2></div>`;
  const fields = [
    "id", "title", "contact_name", "business_name", "email", "list_id", "priority", "intent",
    "estimated_value", "lead_source", "description", "draft_reply", "draft_reply_status",
    "new_reply_at", "updated_at", "created_at", "email_thread"
  ].join(",");
  const { data, error } = await supabase.from("cards").select(fields).limit(3000);
  if (error) {
    $("detail").innerHTML = `<div class="empty"><p class="eyebrow">Supabase error</p><h2>${html(error.message)}</h2></div>`;
    return;
  }
  state.cards = (data || []).map(normalize);
  $("sync-status").textContent = `${number(state.cards.length)} live leads synced`;
  renderMetrics();
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
